import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '@/context/LanguageContext'
import { useAuth } from '@/context/AuthContext'
import {
  fetchDebutAlerts,
  fetchSeguimientoStatus,
  addDebutAlertToSeguimiento,
  removeDebutAlertFromSeguimiento,
  type DebutAlert,
} from '@/services/debutAlertsService'

const formatDebutDate = (iso: string, locale: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(locale)

// Orden pedido a mano: Argentina, Primera Nacional ("B Nacional"), Uruguay,
// Chile, Paraguay, el resto (a mi criterio), y Venezuela/Perú al final --
// justamente las de menos actividad hoy (Venezuela no tiene estadísticas de
// minutos por jugador en la API, ver spec).
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
  { id: 13, label: 'Copa Libertadores' },
  { id: 11, label: 'Copa Sudamericana' },
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

  useEffect(() => {
    fetchDebutAlerts()
      .then(async list => {
        setAlerts(list)
        setTracked(await fetchSeguimientoStatus(list.map(a => a.playerId)))
      })
      .catch(() => setError(true))
  }, [])

  const sections = useMemo(() => {
    if (!alerts) return []
    const byLeague = new Map<number, DebutAlert[]>()
    for (const a of alerts) {
      if (!byLeague.has(a.leagueId)) byLeague.set(a.leagueId, [])
      byLeague.get(a.leagueId)!.push(a)
    }
    const knownIds = new Set(LEAGUE_SECTIONS.map(s => s.id))
    const extraSections = [...byLeague.keys()]
      .filter(id => !knownIds.has(id))
      .map(id => ({ id, label: byLeague.get(id)![0].leagueName ?? String(id) }))

    return [...LEAGUE_SECTIONS, ...extraSections]
      .map(section => ({ ...section, players: byLeague.get(section.id) ?? [] }))
      .filter(section => section.players.length > 0)
  }, [alerts])

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

  return (
    <div className="max-w-screen-lg mx-auto px-4 sm:px-6 py-6 space-y-5 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-apple-gray-900 dark:text-white">{t('debutantes.titulo')}</h1>
        <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
          {t('debutantes.subtitulo')}
        </p>
      </div>

      {error ? (
        <p className="text-sm text-red-500">{t('debutantes.error')}</p>
      ) : alerts === null ? (
        <p className="text-sm text-apple-gray-400">{t('debutantes.cargando')}</p>
      ) : alerts.length === 0 ? (
        <p className="text-sm text-apple-gray-400">{t('debutantes.vacio')}</p>
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 pt-0">
                    {section.players.map(a => {
                      const isTracked = tracked.has(a.playerId)
                      return (
                        <div key={a.playerId} className="border border-apple-gray-100 dark:border-apple-gray-800 rounded-xl p-3">
                          <button onClick={() => goToPlayer(a)} className="flex items-center gap-3 w-full text-left">
                            {a.photo ? (
                              <img src={a.photo} alt={a.playerName} className="w-12 h-12 rounded-full object-cover" />
                            ) : (
                              <div className="w-12 h-12 rounded-full bg-apple-gray-100 dark:bg-apple-gray-800" />
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-apple-gray-900 dark:text-white truncate">{a.playerName}</p>
                              <p className="text-xs text-apple-gray-500 truncate">{a.teamName ?? '—'}</p>
                            </div>
                          </button>
                          <div className="mt-2 flex items-center justify-between text-xs text-apple-gray-500">
                            <span>{a.position ?? '—'} · {a.ageAtDebut} {t('debutantes.anos')}</span>
                            <span>{a.minutes}' · {formatDebutDate(a.debutDate, language)}</span>
                          </div>
                          <select
                            value={isTracked ? 'seguimiento' : 'ninguno'}
                            onChange={e => setSeguimiento(a, e.target.value === 'seguimiento')}
                            className="mt-2 w-full text-xs border border-apple-gray-200 dark:border-apple-gray-700 rounded-lg px-2 py-1.5 bg-transparent"
                          >
                            <option value="ninguno">{t('debutantes.estadoNinguno')}</option>
                            <option value="seguimiento">{t('debutantes.estadoSeguimiento')}</option>
                          </select>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
