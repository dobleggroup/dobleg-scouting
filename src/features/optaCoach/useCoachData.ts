import { useMemo } from 'react'
import { loadBlock, loadLeague, type OptaLeague, type OptaMatch, type OptaTeam, type StandingTable } from '@/features/opta/data'
import { useAsync } from '@/features/opta/hooks'
import type { ClubSnapshot } from '@/features/optaClub/clubData'
import { indexTeamMatches, teamGames, type TeamGame, type TeamMatchBlock, type TeamMatchIndex } from './teamData'

/** River Plate en Opta. */
export const TEAM_ID = '115foion8jwrvp2e7xif675kx'
export const CLUB_KEY = 'club_river'
export const COACH_NAME = 'Leonardo Ponzio'
export const COACH_SHORT = 'Ponzio'
export const COACH_PHOTO = '/coaches/ponzio.png'

export type Scope = 'torneo' | 'temporada'
export const SCOPE_LABEL: Record<Scope, string> = { torneo: 'Clausura', temporada: 'Todo 2026' }
const CURRENT_STAGE = 'Clausura'

export interface CoachData {
  league: OptaLeague
  block: TeamMatchBlock
  index: TeamMatchIndex
  club: ClubSnapshot
  team: OptaTeam
  /** Todos los partidos jugados de River en 2026, más viejo primero. */
  games: TeamGame[]
  /** Fecha en que asumió el DT (de su carrera en Opta). */
  coachFrom: string
  next: OptaMatch | null
  /** Partidos de cualquier equipo, por alcance (Clausura o todo 2026). */
  gamesOf: (teamId: string, scope: Scope) => TeamGame[]
  /** Todos los equipos con sus partidos en ese alcance (para rankings). */
  allTeams: (scope: Scope) => Map<string, TeamGame[]>
  /** Zona del torneo actual donde está un equipo. */
  zoneOf: (teamId: string) => StandingTable | null
  /** Tabla anual (todos los equipos). */
  annual: StandingTable | null
}

async function load() {
  const [league, block, club] = await Promise.all([loadLeague(), loadBlock<TeamMatchBlock>('teammatch'), loadBlock<ClubSnapshot>(CLUB_KEY)])
  return { league, block, club }
}

export function useCoachData() {
  const raw = useAsync(load, [])
  const data = useMemo<CoachData | null>(() => {
    if (!raw.data) return null
    const { league, block, club } = raw.data
    const index = indexTeamMatches(block)
    const team = league.teamById.get(TEAM_ID)!
    const cache = new Map<string, TeamGame[]>()
    const all = (teamId: string) => {
      if (!cache.has(teamId)) cache.set(teamId, teamGames(league.matches, index, teamId))
      return cache.get(teamId)!
    }
    const scopeCache = new Map<Scope, Map<string, TeamGame[]>>()
    const gamesOf = (teamId: string, scope: Scope) => scope === 'temporada' ? all(teamId) : all(teamId).filter(g => g.match.stage === CURRENT_STAGE)
    const coachSpell = club.coach?.career.find(s => s.role === 'coach' && s.teamId === TEAM_ID && s.active)
    const stage = league.standings.find(s => s.name === CURRENT_STAGE)
    const next = league.matches
      .filter(m => m.status !== 'Played' && (m.home === TEAM_ID || m.away === TEAM_ID))
      .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null
    return {
      league, block, index, club, team,
      games: all(TEAM_ID),
      coachFrom: coachSpell?.from ?? club.coach?.joined ?? '2026-01-01',
      next,
      gamesOf,
      allTeams: scope => {
        if (!scopeCache.has(scope)) scopeCache.set(scope, new Map(league.teams.filter(t => all(t.id).length).map(t => [t.id, gamesOf(t.id, scope)])))
        return scopeCache.get(scope)!
      },
      zoneOf: teamId => stage?.tables.find(t => t.type === 'total' && t.rows.some(r => r.teamId === teamId)) ?? null,
      annual: stage?.tables.find(t => t.type === 'championship') ?? null,
    }
  }, [raw.data])
  return { data, loading: raw.loading, error: raw.error }
}
