import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '@/context/LanguageContext'
import { useAuth } from '@/context/AuthContext'
import { PlayerPhoto, TeamLogo } from '@/components/ui/PlayerPhoto'
import { DISPLAY_POSITION_MAP } from '@/constants/scoring'
import { formatMarketValue } from '@/utils/scoring'
import { getScoreColorClass, getScoreBgClass } from '@/components/ui/ScoreBar'
import {
  fetchDebutAlerts,
  fetchSeguimientoStatus,
  addDebutAlertToSeguimiento,
  removeDebutAlertFromSeguimiento,
  type DebutAlert,
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
  // playerId (=players.id / API-Football id) -> id de la fila en scout_players.
  // Se resuelve con RLS scopeada por club -- cada plataforma ve y modifica
  // sólo su propia lista de Seguimiento, nunca la de la otra.
  const [tracked, setTracked] = useState<Map<number, string>>(new Map())
  const [error, setError] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())

  const [search, setSearch] = useState('')
  const [positionFilter, setPositionFilter] = useState<string[]>([])
  const [nationalityFilter, setNationalityFilter] = useState('')
  const [sortBy, setSortBy] = useState<SortBy>('recent')

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

  const setSeguimiento = async (a: DebutAlert, addIt: boolean) => {
    if (!user) return
    if (addIt) {
      const scoutPlayerId = await addDebutAlertToSeguimiento(a, user.id, userDisplayName)
      if (scoutPlayerId) setTracked(prev => new Map(prev).set(a.playerId, scoutPlayerId))
    } else {
      const scoutPlayerId = tracked.get(a.playerId)
      if (!scoutPlayerId) return
      await removeDebutAlertFromSeguimiento(scoutPlayerId)
      setTracked(prev => {
        const next = new Map(prev)
        next.delete(a.playerId)
        return next
      })
    }
  }

  const activityLabel = (a: DebutAlert): string =>
    a.matchesSince > 0 ? `+${a.minutesSince}' · ${a.matchesSince} ${t('externo.colPJ')}` : t('debutantes.sinMasPartidos')

  const EstadoSelect = ({ a }: { a: DebutAlert }) => (
    <select
      value={tracked.has(a.playerId) ? 'seguimiento' : 'ninguno'}
      onChange={e => setSeguimiento(a, e.target.value === 'seguimiento')}
      onClick={e => e.stopPropagation()}
      className={`text-xs font-semibold rounded-lg px-2 py-1.5 border ${
        tracked.has(a.playerId)
          ? 'bg-brand-green/10 border-brand-green/30 text-brand-green'
          : 'bg-apple-gray-50 dark:bg-apple-gray-800 border-apple-gray-200 dark:border-apple-gray-700'
      }`}
    >
      <option value="ninguno">{t('debutantes.estadoNinguno')}</option>
      <option value="seguimiento">{t('debutantes.estadoSeguimiento')}</option>
    </select>
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
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[160px] sm:flex-initial sm:w-56">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder={t('externo.buscarJugador')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-apple pl-9 pr-4 w-full text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {availablePositions.map(pos => (
              <button
                key={pos}
                onClick={() =>
                  setPositionFilter(prev => (prev.includes(pos) ? prev.filter(p => p !== pos) : [...prev, pos]))
                }
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  positionFilter.includes(pos)
                    ? 'bg-brand-green text-white shadow-sm'
                    : 'bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700'
                }`}
              >
                {displayPosition(pos)}
              </button>
            ))}
          </div>

          <select
            value={nationalityFilter}
            onChange={e => setNationalityFilter(e.target.value)}
            className="input-apple text-xs py-1.5 px-3 min-w-0 w-auto"
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
            <button
              onClick={resetFilters}
              className="text-xs text-apple-gray-500 hover:text-red-500 transition-colors underline"
            >
              {t('externo.limpiarFiltros')}
            </button>
          )}
        </div>
      )}

      {error ? (
        <p className="text-sm text-red-500">{t('debutantes.error')}</p>
      ) : alerts === null ? (
        <p className="text-sm text-apple-gray-400">{t('debutantes.cargando')}</p>
      ) : alerts.length === 0 ? (
        <p className="text-sm text-apple-gray-400">{t('debutantes.vacio')}</p>
      ) : sections.length === 0 ? (
        <p className="text-sm text-apple-gray-400">{t('debutantes.sinResultadosFiltros')}</p>
      ) : (
        <div className="space-y-3">
          {sections.map(section => {
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
                        <button
                          key={a.playerId}
                          onClick={() => goToPlayer(a)}
                          className="w-full text-left p-3 flex items-start gap-3 hover:bg-brand-green/5 dark:hover:bg-brand-green/10 transition-colors"
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
                          </div>
                          <div onClick={e => e.stopPropagation()} className="flex-shrink-0">
                            <EstadoSelect a={a} />
                          </div>
                        </button>
                      ))}
                    </div>

                    {/* Desktop: tabla */}
                    <div className="hidden lg:block overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-apple-gray-200/50 dark:border-apple-gray-700/50 bg-apple-gray-50/80 dark:bg-apple-gray-800/50">
                            <th className="px-4 py-3 text-left text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">{t('seguimiento.colJugador')}</th>
                            <th className="px-3 py-3 text-left text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">{t('seguimiento.colClub')}</th>
                            <th className="px-3 py-3 text-left text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">{t('seguimiento.colEdad')}</th>
                            <th className="px-3 py-3 text-left text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">{t('seguimiento.colEstado')}</th>
                            <th className="px-3 py-3 text-left text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">{t('debutantes.colFecha')}</th>
                            <th className="px-3 py-3 text-left text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">{t('seguimiento.colPosicion')}</th>
                            <th className="px-3 py-3 text-left text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">{t('debutantes.colNacionalidad')}</th>
                            <th className="px-3 py-3 text-left text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">{t('debutantes.colMinutos')}</th>
                            <th className="px-3 py-3 text-left text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">{t('seguimiento.colAgente')}</th>
                            <th className="px-3 py-3 text-left text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">{t('debutantes.colValor')}</th>
                            <th className="px-3 py-3 text-left text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">{t('debutantes.colContrato')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-apple-gray-100 dark:divide-apple-gray-800/50">
                          {section.players.map(a => (
                            <tr
                              key={a.playerId}
                              className="hover:bg-brand-green/5 dark:hover:bg-brand-green/10 transition-colors cursor-pointer"
                              onClick={() => goToPlayer(a)}
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <PlayerPhoto src={a.photo} name={a.playerName} size="sm" rounded="lg" className="flex-shrink-0" />
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <p className="font-semibold text-apple-gray-900 dark:text-white truncate">{a.playerName}</p>
                                      <RatingBadge rating={a.rating} />
                                    </div>
                                    {a.competitionName && (
                                      <p className="text-2xs text-apple-gray-400 truncate">{a.competitionName}</p>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-1.5 whitespace-nowrap">
                                  <TeamLogo src={a.teamLogo} className="w-4 h-4" />
                                  <span>{a.teamName ?? '—'}</span>
                                </div>
                              </td>
                              <td className="px-3 py-3 whitespace-nowrap">{a.ageAtDebut}</td>
                              <td className="px-3 py-3">
                                <EstadoSelect a={a} />
                              </td>
                              <td className="px-3 py-3 whitespace-nowrap">{formatLocalDate(a.debutDate, language)}</td>
                              <td className="px-3 py-3 whitespace-nowrap">{displayPosition(a.position)}</td>
                              <td className="px-3 py-3 whitespace-nowrap">{a.nationality ?? '—'}</td>
                              <td className="px-3 py-3 whitespace-nowrap">
                                <div>{a.minutes}'</div>
                                <div className="text-2xs text-apple-gray-400">{activityLabel(a)}</div>
                              </td>
                              <td className="px-3 py-3 whitespace-nowrap">{a.agent ?? '—'}</td>
                              <td className="px-3 py-3 whitespace-nowrap">{a.marketValueEur ? formatMarketValue(a.marketValueEur) : '—'}</td>
                              <td className="px-3 py-3 whitespace-nowrap">{a.contractEndDate ? formatLocalDate(a.contractEndDate, language) : '—'}</td>
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
