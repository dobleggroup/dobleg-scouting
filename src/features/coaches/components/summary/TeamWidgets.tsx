// src/features/coaches/components/summary/TeamWidgets.tsx
// Widgets del equipo: tabla de posiciones, ultimos partidos y proximos partidos.
import { useEffect, useState } from 'react'
import WidgetCard, { WidgetMessage } from './WidgetCard'
import StandingsTable from '@/components/shared/StandingsTable'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { fetchLeagueStandings, type StandingRow } from '@/services/footballApiService'
import { matchOutcome } from '@/features/coaches/matchResult'
import type { AgencyFixture } from '@/types/footballApi'

const RESULT_STYLE: Record<string, string> = {
  G: 'bg-brand-green text-apple-gray-900',
  E: 'bg-apple-gray-300 dark:bg-apple-gray-600 text-apple-gray-800 dark:text-white',
  P: 'bg-brand-red text-white',
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function rival(f: AgencyFixture) {
  return f.isHome ? f.awayTeam : f.homeTeam
}

export function useStandings(leagueId: number | null | undefined, season: number | null | undefined) {
  const [state, setState] = useState<{ groups: StandingRow[][] | null; failed: boolean }>({ groups: null, failed: false })
  useEffect(() => {
    if (!leagueId || !season) {
      setState({ groups: [], failed: false })
      return
    }
    let active = true
    fetchLeagueStandings(leagueId, season)
      .then(g => { if (active) setState({ groups: g, failed: false }) })
      .catch(() => { if (active) setState({ groups: [], failed: true }) })
    return () => { active = false }
  }, [leagueId, season])
  return state
}

export function StandingsWidget({ groups, failed, teamId }: { groups: StandingRow[][] | null; failed: boolean; teamId: number }) {
  return (
    <WidgetCard title="Tabla de posiciones" description="Temperley aparece resaltado.">
      {groups === null ? (
        <LoadingSpinner message="Cargando la tabla…" />
      ) : failed || groups.length === 0 ? (
        <WidgetMessage>No se pudo cargar la tabla de posiciones.</WidgetMessage>
      ) : (
        <StandingsTable groups={groups} highlightTeamId={teamId} />
      )}
    </WidgetCard>
  )
}

export function LastMatchesWidget({ fixtures }: { fixtures: AgencyFixture[] }) {
  return (
    <WidgetCard title="Últimos partidos" description="Los 5 más recientes, en todas las competencias.">
      {fixtures.length === 0 ? (
        <WidgetMessage>Todavía no hay partidos jugados.</WidgetMessage>
      ) : (
        <>
          <div className="flex gap-1.5 mb-4">
            {[...fixtures].reverse().map(f => {
              const { result } = matchOutcome(f)
              return (
                <span key={f.fixtureId} className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${result ? RESULT_STYLE[result] : RESULT_STYLE.E}`}>
                  {result ?? '-'}
                </span>
              )
            })}
          </div>
          <ul className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700/50">
            {fixtures.map(f => {
              const { result, scoreLabel } = matchOutcome(f)
              const r = rival(f)
              return (
                <li key={f.fixtureId} className="flex items-center gap-3 py-2.5">
                  <span className="text-xs text-apple-gray-400 w-12 flex-shrink-0 tabular-nums">{shortDate(f.date)}</span>
                  <img src={r.logo} alt="" className="w-6 h-6 object-contain flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-apple-gray-800 dark:text-white truncate">
                      {f.isHome ? 'vs' : 'en'} {r.name}
                    </p>
                    <p className="text-2xs text-apple-gray-400 truncate">{f.leagueName}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-md text-xs font-bold tabular-nums ${result ? RESULT_STYLE[result] : RESULT_STYLE.E}`}>
                    {scoreLabel}
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </WidgetCard>
  )
}

export function UpcomingWidget({ fixtures }: { fixtures: AgencyFixture[] }) {
  return (
    <WidgetCard title="Próximos partidos" description="Los 5 que vienen.">
      {fixtures.length === 0 ? (
        <WidgetMessage>No hay partidos programados.</WidgetMessage>
      ) : (
        <ul className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700/50">
          {fixtures.map(f => {
            const r = rival(f)
            return (
              <li key={f.fixtureId} className="flex items-center gap-3 py-2.5">
                <span className="text-xs text-apple-gray-400 w-12 flex-shrink-0 tabular-nums">{shortDate(f.date)}</span>
                <img src={r.logo} alt="" className="w-6 h-6 object-contain flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-apple-gray-800 dark:text-white truncate">
                    {f.isHome ? 'vs' : 'en'} {r.name}
                  </p>
                  <p className="text-2xs text-apple-gray-400 truncate">{f.leagueName}{f.round ? ` · ${f.round}` : ''}</p>
                </div>
                <span className="text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase flex-shrink-0">
                  {f.isHome ? 'Local' : 'Visitante'}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </WidgetCard>
  )
}
