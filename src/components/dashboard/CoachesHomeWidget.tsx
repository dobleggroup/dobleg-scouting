// src/components/dashboard/CoachesHomeWidget.tsx
// Inicio: los DT de la agencia que tienen club (hoy Nicolás Domingo), entre Scout Interno y
// Scout Externo. Últimos 5, posición en la tabla con el contexto de arriba/abajo, efectividad
// y próximo partido. Todo sale de consultas ya cacheadas de API-Football (fixtures y tabla),
// así que no le suma carga al Inicio.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listAgencyCoaches } from '@/services/agencyCoachesService'
import { fetchLeagueStandings, fetchSeasonFixtures, type StandingRow } from '@/services/footballApiService'
import { isMatchFinished } from '@/utils/coachCalendar'
import { matchOutcome } from '@/features/coaches/matchResult'
import type { AgencyCoach } from '@/constants/agencyCoaches'
import type { AgencyFixture } from '@/types/footballApi'

interface CoachSnapshot {
  coach: AgencyCoach
  lastFive: AgencyFixture[]
  next: AgencyFixture | null
  standing: { row: StandingRow; group: StandingRow[] } | null
  pointsPct: number | null
}

const RESULT_DOT: Record<'G' | 'E' | 'P', string> = {
  G: 'bg-brand-green text-white',
  E: 'bg-apple-gray-300 dark:bg-apple-gray-600 text-apple-gray-800 dark:text-white',
  P: 'bg-brand-red text-white',
}
const RESULT_LABEL: Record<'G' | 'E' | 'P', string> = { G: 'G', E: 'E', P: 'P' }

async function loadSnapshot(coach: AgencyCoach): Promise<CoachSnapshot | null> {
  if (!coach.apiTeamId || !coach.leagueSeason) return null
  const [fixtures, standings] = await Promise.all([
    fetchSeasonFixtures(coach.apiTeamId, coach.leagueSeason),
    coach.leagueApiId ? fetchLeagueStandings(coach.leagueApiId, coach.leagueSeason).catch(() => []) : Promise.resolve([]),
  ])
  const sorted = [...fixtures].sort((a, b) => a.timestamp - b.timestamp)
  const finished = sorted.filter(f => isMatchFinished(f.statusShort))
  const next = sorted.find(f => !isMatchFinished(f.statusShort)) ?? null
  const group = standings.find(g => g.some(r => r.teamId === coach.apiTeamId)) ?? null
  const row = group?.find(r => r.teamId === coach.apiTeamId) ?? null
  const pointsPct = row && row.played > 0 ? row.points / (row.played * 3) : null
  return { coach, lastFive: finished.slice(-5), next, standing: row && group ? { row, group } : null, pointsPct }
}

/** API-Football nombra las zonas en inglés ("Group 2"); la tabla general viene vacía o con el nombre de la liga. */
function zoneLabel(group: string): string {
  const m = /^Group\s+(\S+)/i.exec(group ?? '')
  return m ? `Zona ${m[1]}` : 'Posición'
}

function shortTeam(name: string): string {
  return name.replace(/^(Club Atlético|CA|CS|Club) /, '')
}

function CoachCard({ snap }: { snap: CoachSnapshot }) {
  const { coach, lastFive, next, standing, pointsPct } = snap
  const neighbours = standing
    ? standing.group.filter(r => Math.abs(r.rank - standing.row.rank) <= 1).sort((a, b) => a.rank - b.rank)
    : []
  return (
    <Link
      to={`/entrenadores/${coach.key}`}
      className="group block rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 bg-white dark:bg-apple-gray-800 p-4 sm:p-5 hover:border-brand-green/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/40"
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,1fr)] lg:items-center">
        {/* Quién */}
        <div className="flex items-center gap-3 min-w-0">
          {coach.photo ? (
            <img src={coach.photo} alt="" className="w-14 h-14 rounded-full object-cover ring-2 ring-brand-green/30 flex-shrink-0" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700 flex-shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-base font-semibold text-apple-gray-800 dark:text-white truncate group-hover:text-brand-green transition-colors">{coach.fullName}</p>
            <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 truncate flex items-center gap-1.5">
              <img src={`https://media.api-sports.io/football/teams/${coach.apiTeamId}.png`} alt="" className="w-4 h-4 object-contain" />
              {coach.club}
              {coach.leagueName && <span className="text-apple-gray-400">· {coach.leagueName}</span>}
            </p>
            {pointsPct !== null && (
              <div className="mt-2 flex items-center gap-2">
                <div className="w-24 h-1.5 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700 overflow-hidden">
                  <div className="h-full rounded-full bg-brand-green" style={{ width: `${Math.round(pointsPct * 100)}%` }} />
                </div>
                <span className="text-2xs text-apple-gray-500 dark:text-apple-gray-400 tabular-nums">{Math.round(pointsPct * 100)}% de los puntos</span>
              </div>
            )}
          </div>
        </div>

        {/* Últimos 5 */}
        <div>
          <p className="text-2xs font-medium text-apple-gray-400 mb-2">Últimos 5 partidos</p>
          <ol className="grid grid-cols-5 gap-1.5">
            {lastFive.map(f => {
              const { result, scoreLabel } = matchOutcome(f)
              const rival = f.isHome ? f.awayTeam : f.homeTeam
              return (
                <li key={f.fixtureId} className="flex flex-col items-center gap-1 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-900/40 px-1 py-2" title={`${f.isHome ? 'vs' : '@'} ${rival.name} · ${scoreLabel}`}>
                  <img src={rival.logo} alt="" className="w-6 h-6 object-contain" loading="lazy" />
                  <span className="text-[11px] font-semibold tabular-nums text-apple-gray-700 dark:text-apple-gray-200 whitespace-nowrap">{scoreLabel.replace(/\s/g, '')}</span>
                  {result && (
                    <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${RESULT_DOT[result]}`}>{RESULT_LABEL[result]}</span>
                  )}
                </li>
              )
            })}
          </ol>
          {next && (
            <p className="mt-2.5 text-xs text-apple-gray-500 dark:text-apple-gray-400 flex items-center gap-1.5 truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-green flex-shrink-0" />
              Próximo: {next.isHome ? 'vs' : '@'} {shortTeam((next.isHome ? next.awayTeam : next.homeTeam).name)}
              <span className="text-apple-gray-400">· {new Date(next.date).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
            </p>
          )}
        </div>

        {/* Tabla */}
        {standing ? (
          <div className="flex items-center gap-4">
            <div className="text-center flex-shrink-0">
              <p className="text-4xl font-bold tracking-tight text-apple-gray-800 dark:text-white tabular-nums leading-none">{standing.row.rank}°</p>
              <p className="text-2xs text-apple-gray-400 mt-1">{zoneLabel(standing.row.group)}</p>
            </div>
            <ol className="flex-1 min-w-0 space-y-1">
              {neighbours.map(r => {
                const own = r.teamId === standing.row.teamId
                return (
                  <li key={r.teamId} className={`flex items-center gap-2 rounded-md px-2 py-1 text-xs ${own ? 'bg-brand-green/10 font-semibold text-apple-gray-800 dark:text-white' : 'text-apple-gray-500 dark:text-apple-gray-400'}`}>
                    <span className="w-5 text-right tabular-nums">{r.rank}</span>
                    <img src={r.teamLogo} alt="" className="w-4 h-4 object-contain flex-shrink-0" loading="lazy" />
                    <span className="flex-1 truncate">{shortTeam(r.teamName)}</span>
                    <span className="tabular-nums">{r.points} pts</span>
                  </li>
                )
              })}
            </ol>
          </div>
        ) : (
          <p className="text-xs text-apple-gray-400">Tabla no disponible</p>
        )}
      </div>
    </Link>
  )
}

export default function CoachesHomeWidget() {
  const [snaps, setSnaps] = useState<CoachSnapshot[] | null>(null)

  useEffect(() => {
    let active = true
    listAgencyCoaches()
      .then(coaches => Promise.all((coaches ?? []).filter(c => c.status === 'activo' && c.apiTeamId).map(loadSnapshot)))
      .then(list => { if (active) setSnaps(list.filter((s): s is CoachSnapshot => s !== null)) })
      .catch(() => { if (active) setSnaps([]) })
    return () => { active = false }
  }, [])

  if (snaps !== null && snaps.length === 0) return null

  return (
    <section className="bg-white dark:bg-apple-gray-800 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-base font-semibold text-apple-gray-800 dark:text-white">Nuestros entrenadores</h2>
        <Link to="/entrenadores" className="text-xs font-medium text-brand-green hover:text-emerald-600 transition-colors flex-shrink-0">
          Ver entrenadores →
        </Link>
      </div>
      {snaps === null ? (
        <div className="h-32 animate-pulse bg-apple-gray-100 dark:bg-apple-gray-700/40 rounded-apple" />
      ) : (
        <div className="space-y-3">
          {snaps.map(s => <CoachCard key={s.coach.key} snap={s} />)}
        </div>
      )}
    </section>
  )
}
