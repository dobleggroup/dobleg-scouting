import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '@/context/LanguageContext'
import { useAuth } from '@/context/AuthContext'
import { PlayerPhoto, TeamLogo } from '@/components/ui/PlayerPhoto'
import { AgentBadge, AgentColumnLabel } from '@/components/ui/AgentBadge'
import MultiSelect from '@/components/filters/MultiSelect'
import { DISPLAY_POSITION_MAP } from '@/constants/scoring'
import { formatMarketValue } from '@/utils/scoring'
import { getScoreColorClass, getScoreBgClass } from '@/components/ui/ScoreBar'
import {
  fetchDebutAlerts,
  fetchSeguimientoStatus,
  addDebutAlertToSeguimiento,
  removeDebutAlertFromSeguimiento,
  type DebutAlert,
  type SeguimientoList,
  type SeguimientoMembership,
} from '@/services/debutAlertsService'

const formatLocalDate = (iso: string, locale: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(locale)

const displayPosition = (pos: string | null): string => (pos ? DISPLAY_POSITION_MAP[pos] ?? pos : '—')

type SortBy = 'recent' | 'minutes'

// Orden pedido a mano: Argentina, Primera Nacional ("B Nacional"), Uruguay,
// Chile, Paraguay, el resto (a mi criterio), y Venezuela/Perú al final --
// justamente las de menos actividad hoy. Libertadores/Sudamericana NO
// aparecen acá -- el backend ya resuelve esos debuts bajo la liga doméstica
// del equipo (`display_league_id`), la competencia real se sigue mostrando
// en `competitionName` de cada fila (no en una columna propia).
const LEAGUE_SECTIONS: { id: number; label: string }[] = [
  { id: 128, label: 'Argentina' },
  { id: 131, label: 'Primera Nacional' },
  { id: 268, label: 'Uruguay' },
  { id: 265, label: 'Chile' },
  { id: 252, label: 'Paraguay' },
  { id: 71, label: 'Brasil' },
  { id: 239, label: 'Colombia' },
  { id: 242, label: 'Ecuador' },
  { id: 262, label: 'México' },
  { id: 344, label: 'Bolivia' },
  { id: 299, label: 'Venezuela' },
  { id: 281, label: 'Perú' },
]

export default function DebutantesPage() {
  const { t, language } = useLanguage()
  const { user, userDisplayName } = useAuth()
  const navigate = useNavigate()

  const [alerts, setAlerts] = useState<DebutAlert[] | null>(null)
  // playerId (=players.id / API-Football id) -> fila en scout_players y en qué
  // listas está (Datos / GG). Se resuelve con RLS scopeada por club -- cada
  // plataforma ve y modifica sólo su propio Seguimiento, nunca el de la otra.
  const [tracked, setTracked] = useState<Map<number, SeguimientoMembership>>(new Map())
  const [error, setError] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  // Alta/baja de seguimiento en curso, por jugador y lista (evita doble click)
  const [busy, setBusy] = useState<Set<string>>(new Set())

  const [search, setSearch] = useState('')
  const [positionFilter, setPositionFilter] = useState<string[]>([])
  const [nationalityFilter, setNationalityFilter] = useState('')
  const [sortBy, setSortBy] = useState<SortBy>('recent')
  // Liga elegida arriba (null = todas). Las pastillas muestran cuántos hay en
  // cada una, así se ve de entrada que no está solo Argentina.
  const [leagueFilter, setLeagueFilter] = useState<number | null>(null)

  useEffect(() => {
    fetchDebutAlerts()
      .then(async list => {
        setAlerts(list)
        setTracked(await fetchSeguimientoStatus(list.map(a => a.playerId)))
      })
      .catch(() => setError(true))
  }, [])

  const availablePositions = useMemo(() => {
    if (!alerts) return []
    const codes = new Set(alerts.map(a => a.position).filter((p): p is string => !!p))
    return [...codes].sort()
  }, [alerts])

  const availableNationalities = useMemo(() => {
    if (!alerts) return []
    const names = new Set(alerts.map(a => a.nationality).filter((n): n is string => !!n))
    return [...names].sort()
  }, [alerts])

  const filtered = useMemo(() => {
    if (!alerts) return []
    const term = search.trim().toLowerCase()
    let list = alerts.filter(a => {
      if (term && !a.playerName.toLowerCase().includes(term)) return false
      if (positionFilter.length > 0 && (!a.position || !positionFilter.includes(a.position))) return false
      if (nationalityFilter && a.nationality !== nationalityFilter) return false
      return true
    })
    list = [...list].sort((a, b) =>
      sortBy === 'minutes'
        ? b.minutesSince + b.minutes - (a.minutesSince + a.minutes)
        : b.debutDate.localeCompare(a.debutDate)
    )
    return list
  }, [alerts, search, positionFilter, nationalityFilter, sortBy])

  const sections = useMemo(() => {
    const byLeague = new Map<number, DebutAlert[]>()
    for (const a of filtered) {
      if (!byLeague.has(a.displayLeagueId)) byLeague.set(a.displayLeagueId, [])
      byLeague.get(a.displayLeagueId)!.push(a)
    }
    const knownIds = new Set(LEAGUE_SECTIONS.map(s => s.id))
    const extraSections = [...byLeague.keys()]
      .filter(id => !knownIds.has(id))
      .map(id => ({ id, label: byLeague.get(id)![0].competitionName ?? String(id) }))

    return [...LEAGUE_SECTIONS, ...extraSections]
      .map(section => ({ ...section, players: byLeague.get(section.id) ?? [] }))
      .filter(section => section.players.length > 0)
  }, [filtered])

  const visibleSections = leagueFilter == null ? sections : sections.filter(sec => sec.id === leagueFilter)
  const totalShown = sections.reduce((n, sec) => n + sec.players.length, 0)

  const activeFilterCount = [
    search.trim().length > 0,
    positionFilter.length > 0,
    nationalityFilter.length > 0,
    sortBy !== 'recent',
  ].filter(Boolean).length

  const resetFilters = () => {
    setSearch('')
    setPositionFilter([])
    setNationalityFilter('')
    setSortBy('recent')
  }

  const toggleSection = (id: number) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const goToPlayer = (a: DebutAlert) => {
    navigate(`/jugador/${encodeURIComponent(a.playerName)}?source=externo&apiId=${a.playerId}`)
  }

  const toggleSeguimiento = async (a: DebutAlert, list: SeguimientoList) => {
    const busyKey = `${a.playerId}:${list}`
    if (!user || busy.has(busyKey)) return
    setBusy(prev => new Set(prev).add(busyKey))
    try {
      const current = tracked.get(a.playerId)
      if (current?.[list]) {
        if (await removeDebutAlertFromSeguimiento(current.scoutPlayerId, list)) {
          setTracked(prev => {
            const next = new Map(prev)
            const updated = { ...current, [list]: false }
            if (updated.datos || updated.scouts_gg) next.set(a.playerId, updated)
            else next.delete(a.playerId)
            return next
          })
        }
      } else {
        const scoutPlayerId = await addDebutAlertToSeguimiento(a, list, user.id, userDisplayName)
        if (scoutPlayerId) {
          setTracked(prev => new Map(prev).set(a.playerId, {
            scoutPlayerId,
            datos: current?.datos ?? false,
            scouts_gg: current?.scouts_gg ?? false,
            [list]: true,
          }))
        }
      }
    } finally {
      setBusy(prev => {
        const next = new Set(prev)
        next.delete(busyKey)
        return next
      })
    }
  }

  const activityLabel = (a: DebutAlert): string =>
    a.matchesSince > 0 ? `+${a.minutesSince}' · ${a.matchesSince} ${t('externo.colPJ')}` : t('debutantes.sinMasPartidos')

  // Seguimiento: selector chico "Datos | GG". Un toque lo agrega a esa lista;
  // si ya está (verde, con tilde), otro toque lo saca.
  const SeguimientoButtons = ({ a }: { a: DebutAlert }) => (
    <div className="inline-flex rounded-lg border border-apple-gray-200 dark:border-apple-gray-700 overflow-hidden divide-x divide-apple-gray-200 dark:divide-apple-gray-700">
      {(['datos', 'scouts_gg'] as const).map(list => {
        const isIn = !!tracked.get(a.playerId)?.[list]
        const label = list === 'datos' ? t('debutantes.listaDatos') : t('debutantes.listaGG')
        return (
          <button
            key={list}
            type="button"
            disabled={busy.has(`${a.playerId}:${list}`)}
            onClick={e => { e.stopPropagation(); toggleSeguimiento(a, list) }}
            title={isIn ? t('debutantes.quitarDeLista').replace('{lista}', label) : t('debutantes.agregarALista').replace('{lista}', label)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition-colors disabled:opacity-50 ${
              isIn
                ? 'bg-brand-green/15 text-brand-green'
                : 'bg-white dark:bg-apple-gray-800 text-apple-gray-500 dark:text-apple-gray-400 hover:text-brand-green'
            }`}
          >
            {isIn && (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
            )}
            {label}
          </button>
        )
      })}
    </div>
  )

  // Abre Reporte con el jugador ya cargado
  const ReporteButton = ({ a, withLabel = false }: { a: DebutAlert; withLabel?: boolean }) => (
    <button
      type="button"
      onClick={e => {
        e.stopPropagation()
        const params = new URLSearchParams({ jugador: a.playerName })
        if (a.teamName) params.set('equipo', a.teamName)
        navigate(`/evaluar?${params.toString()}`)
      }}
      title={t('debutantes.crearReporte')}
      aria-label={t('debutantes.crearReporte')}
      className="inline-flex items-center gap-1.5 p-1.5 rounded-lg text-apple-gray-400 hover:text-brand-green hover:bg-brand-green/10 transition-colors text-xs font-semibold"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
      {withLabel && t('debutantes.crearReporte')}
    </button>
  )

  const RatingBadge = ({ rating }: { rating: number | null }) =>
    rating === null ? null : (
      <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-2xs font-bold tabular-nums ${getScoreColorClass(rating, '10')} ${getScoreBgClass(rating, '10')}`}>
        {rating.toFixed(1)}
      </span>
    )

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 space-y-5 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-apple-gray-900 dark:text-white">{t('debutantes.titulo')}</h1>
        <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
          {t('debutantes.subtitulo')}
        </p>
      </div>

      {alerts !== null && alerts.length > 0 && (
        <div className="space-y-3">
          {/* Ligas: todas con su cantidad */}
          <div className="flex gap-1.5 overflow-x-auto scrollbar-thin -mx-1 px-1 pb-1">
            <button onClick={() => setLeagueFilter(null)} className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              leagueFilter == null
                ? 'bg-apple-gray-800 dark:bg-white text-white dark:text-apple-gray-900 border-apple-gray-800 dark:border-white'
                : 'bg-white dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-300 border-apple-gray-200 dark:border-apple-gray-700 hover:border-apple-gray-300'
            }`}>
              {t('debutantes.todasLasLigas')} <span className="opacity-60 tabular-nums">{totalShown}</span>
            </button>
            {sections.map(sec => (
              <button key={sec.id} onClick={() => setLeagueFilter(leagueFilter === sec.id ? null : sec.id)} className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border whitespace-nowrap transition-all ${
                leagueFilter === sec.id
                  ? 'bg-apple-gray-800 dark:bg-white text-white dark:text-apple-gray-900 border-apple-gray-800 dark:border-white'
                  : 'bg-white dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-300 border-apple-gray-200 dark:border-apple-gray-700 hover:border-apple-gray-300'
              }`}>
                {sec.label} <span className="opacity-60 tabular-nums">{sec.players.length}</span>
              </button>
            ))}
          </div>

          {/* Buscador + posición + nacionalidad + orden */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-60">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder={t('externo.buscarJugador')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className={`input-apple pl-9 pr-3 w-full text-sm ${search.trim() ? 'ring-2 ring-brand-green/30 border-brand-green/50' : ''}`}
              />
            </div>
            <MultiSelect
              options={availablePositions.map(pos => displayPosition(pos))}
              selected={positionFilter.map(pos => displayPosition(pos))}
              onChange={labels => setPositionFilter(availablePositions.filter(pos => labels.includes(displayPosition(pos))))}
              allLabel={t('debutantes.todasPosiciones')}
              pluralLabel={t('debutantes.posicionesLabel')}
              searchPlaceholder={t('debutantes.buscarPosicion')}
              clearLabel={t('externo.limpiarSeleccion')}
            />
            <select
              value={nationalityFilter}
              onChange={e => setNationalityFilter(e.target.value)}
              className={`input-apple text-xs py-1.5 px-3 min-w-0 w-auto ${nationalityFilter ? '!border-brand-green/50 !text-brand-green font-semibold' : ''}`}
            >
              <option value="">{t('debutantes.todasNacionalidades')}</option>
              {availableNationalities.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortBy)}
              className="input-apple text-xs py-1.5 px-3 min-w-0 w-auto"
              aria-label={t('debutantes.ordenarPor')}
            >
              <option value="recent">{t('debutantes.ordenReciente')}</option>
              <option value="minutes">{t('debutantes.ordenMinutos')}</option>
            </select>
            {activeFilterCount > 0 && (
              <button onClick={resetFilters} className="text-xs text-apple-gray-400 hover:text-red-500 transition-colors">
                {t('externo.limpiarFiltros')}
              </button>
            )}
          </div>
        </div>
      )}

      {error ? (
        <p className="text-sm text-red-500">{t('debutantes.error')}</p>
      ) : alerts === null ? (
        <p className="text-sm text-apple-gray-400">{t('debutantes.cargando')}</p>
      ) : alerts.length === 0 ? (
        <p className="text-sm text-apple-gray-400">{t('debutantes.vacio')}</p>
      ) : visibleSections.length === 0 ? (
        <p className="text-sm text-apple-gray-400">{t('debutantes.sinResultadosFiltros')}</p>
      ) : (
        <div className="space-y-3">
          {visibleSections.map(section => {
            const isCollapsed = collapsed.has(section.id)
            return (
              <div key={section.id} className="card-apple overflow-hidden">
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                >
                  <span className="text-sm font-semibold text-apple-gray-900 dark:text-white">
                    {section.label}{' '}
                    <span className="text-apple-gray-400 font-normal">({section.players.length})</span>
                  </span>
                  <svg
                    className={`w-4 h-4 text-apple-gray-400 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {!isCollapsed && (
                  <>
                    {/* Mobile / tablet: cards */}
                    <div className="lg:hidden divide-y divide-apple-gray-100 dark:divide-apple-gray-800/50">
                      {section.players.map(a => (
                        <div
                          key={a.playerId}
                          role="button"
                          tabIndex={0}
                          onClick={() => goToPlayer(a)}
                          onKeyDown={e => { if (e.key === 'Enter') goToPlayer(a) }}
                          className="w-full text-left p-3 flex items-start gap-3 cursor-pointer hover:bg-brand-green/5 dark:hover:bg-brand-green/10 transition-colors"
                        >
                          <PlayerPhoto src={a.photo} name={a.playerName} size="md" rounded="lg" className="flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0 space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <p className="font-semibold text-apple-gray-900 dark:text-white truncate">{a.playerName}</p>
                              <RatingBadge rating={a.rating} />
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-apple-gray-500">
                              <TeamLogo src={a.teamLogo} className="w-3.5 h-3.5" />
                              <span className="truncate">{a.teamName ?? '—'}</span>
                              <span>· {a.ageAtDebut} {t('debutantes.anos')}</span>
                            </div>
                            <div className="text-2xs text-apple-gray-400 flex flex-wrap gap-x-2">
                              <span>{displayPosition(a.position)}</span>
                              <span>{a.nationality ?? '—'}</span>
                              <span>{formatLocalDate(a.debutDate, language)}</span>
                              <span>{a.minutes}' · {activityLabel(a)}</span>
                            </div>
                            <AgentBadge agent={a.agent} />
                            <div className="flex flex-wrap items-center gap-2 pt-1" onClick={e => e.stopPropagation()}>
                              <span className="text-2xs text-apple-gray-400">{t('debutantes.colSeguimiento')}</span>
                              <SeguimientoButtons a={a} />
                              <ReporteButton a={a} withLabel />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Desktop: tabla compacta, todo a la vista sin deslizar */}
                    <div className="hidden lg:block">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-apple-gray-200/50 dark:border-apple-gray-700/50 bg-apple-gray-50/80 dark:bg-apple-gray-800/50">
                            <th className="px-3 py-3 text-left text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider pl-4">{t('seguimiento.colJugador')}</th>
                            <th className="px-3 py-3 text-left text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">{t('seguimiento.colClub')}</th>
                            <th className="px-3 py-3 text-left text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">{t('debutantes.colDebut')}</th>
                            <th className="px-3 py-3 text-left text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider"><AgentColumnLabel /></th>
                            <th className="px-3 py-3 text-left text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">{t('debutantes.colValorContrato')}</th>
                            <th className="px-3 py-3 text-left text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">{t('debutantes.colSeguimiento')}</th>
                            <th className="px-2 py-3"><span className="sr-only">{t('debutantes.crearReporte')}</span></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-apple-gray-100 dark:divide-apple-gray-800/50">
                          {section.players.map(a => (
                            <tr
                              key={a.playerId}
                              className="hover:bg-brand-green/5 dark:hover:bg-brand-green/10 transition-colors cursor-pointer align-top"
                              onClick={() => goToPlayer(a)}
                            >
                              <td className="pl-4 pr-3 py-3">
                                <div className="flex items-start gap-2.5 max-w-[240px]">
                                  <PlayerPhoto src={a.photo} name={a.playerName} size="sm" rounded="lg" className="flex-shrink-0" />
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <p className="font-semibold text-apple-gray-900 dark:text-white truncate">{a.playerName}</p>
                                      <RatingBadge rating={a.rating} />
                                    </div>
                                    <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 truncate">
                                      {[displayPosition(a.position), a.nationality].filter(x => x && x !== '—').join(' · ') || '—'}
                                    </p>
                                    {a.competitionName && <p className="text-2xs text-apple-gray-400 truncate">{a.competitionName}</p>}
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-1.5 max-w-[170px]">
                                  <TeamLogo src={a.teamLogo} className="w-4 h-4 flex-shrink-0" />
                                  <span className="truncate text-apple-gray-700 dark:text-apple-gray-300">{a.teamName ?? '—'}</span>
                                </div>
                                <p className="mt-0.5 text-xs text-apple-gray-400 whitespace-nowrap">{t('debutantes.debutoCon').replace('{n}', String(a.ageAtDebut))}</p>
                              </td>
                              <td className="px-3 py-3 whitespace-nowrap">
                                <p className="text-apple-gray-700 dark:text-apple-gray-300">{formatLocalDate(a.debutDate, language)} · {a.minutes}'</p>
                                <p className="text-xs text-apple-gray-400">{activityLabel(a)}</p>
                              </td>
                              <td className="px-3 py-3"><div className="max-w-[150px]"><AgentBadge agent={a.agent} className="block max-w-full" /></div></td>
                              <td className="px-3 py-3 whitespace-nowrap">
                                <p className="text-apple-gray-700 dark:text-apple-gray-300 tabular-nums">{a.marketValueEur ? formatMarketValue(a.marketValueEur) : '—'}</p>
                                <p className="text-xs text-apple-gray-400">{a.contractEndDate ? t('debutantes.contratoHasta').replace('{fecha}', formatLocalDate(a.contractEndDate, language)) : t('debutantes.sinContrato')}</p>
                              </td>
                              <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                                <SeguimientoButtons a={a} />
                              </td>
                              <td className="px-2 py-3" onClick={e => e.stopPropagation()}>
                                <ReporteButton a={a} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
