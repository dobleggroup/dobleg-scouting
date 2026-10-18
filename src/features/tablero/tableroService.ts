import { supabase } from '@/lib/supabase'
import { fetchAgencyMatchRows, agencyRowsFromISO, paged } from '@/services/agencyMatchRowsService'
import { leagueLabel } from '@/utils/leagueLabels'
import type { RosterEntry, TableroStatRow, TeamFixture } from './tableroData'

const CHUNK = 150

export interface TableroDataset {
  rows: TableroStatRow[]
  /** Id de fila de `players` → jugador del roster (por identidad oficial). */
  owners: Map<number, string>
  /** Club de Sofascore → club de API-Football del roster (mismo nombre sin acentos). */
  teamTwins: Map<number, number>
  /** Partidos jugados (con resultado y estadísticas cargadas) por club, último año. */
  teamFixtures: TeamFixture[]
  teamNames: Map<number, string>
  leagueNames: Map<number, string>
  fetchedAt: number
}

/**
 * Todo lo que necesita el Tablero en una sola carga: los partidos del último
 * año de los jugadores Doble G (ver `fetchAgencyMatchRows`, la misma búsqueda
 * que usa el Inicio), los partidos de sus clubes (para saber qué porcentaje
 * de minutos jugó cada uno) y los nombres de rivales y ligas.
 */
export async function fetchTableroDataset(roster: RosterEntry[], force = false): Promise<TableroDataset> {
  const fromISO = agencyRowsFromISO()
  const apiTeamIds = [...new Set(roster.map(p => p.apiTeamId).filter((id): id is number => id != null))]
  const leaguesPromise = supabase.from('leagues').select('id, name, country, tier, season')
  const { rows, owners, teamTwins } = await fetchAgencyMatchRows(roster, fromISO, force)

  // Partidos de todos los clubes donde jugaron (y del club del roster). Local y
  // visitante por separado: un `or(home in …, away in …)` no usa los índices y
  // pasaba el límite de tiempo de Supabase; cada mitad tarda ~0,15 s.
  const teamIds = [...new Set([...apiTeamIds, ...teamTwins.keys(), ...rows.map(r => r.team_id)])]
  type FixtureRow = { id: number; date: string; home_team_id: number; away_team_id: number; score_home: number | null; score_away: number | null; stats_synced: boolean }
  const side = (column: 'home_team_id' | 'away_team_id') => paged<FixtureRow>((from, to) =>
    supabase
      .from('fixtures')
      .select('id, date, home_team_id, away_team_id, score_home, score_away, stats_synced')
      .gte('date', fromISO)
      .in(column, teamIds)
      .order('id', { ascending: true })
      .range(from, to),
  )
  const [home, away, leagues] = teamIds.length
    ? await Promise.all([side('home_team_id'), side('away_team_id'), leaguesPromise])
    : [[] as FixtureRow[], [] as FixtureRow[], await leaguesPromise]
  const nowISO = new Date().toISOString()
  const fixtures = new Map<number, FixtureRow>()
  for (const f of [...home, ...away]) {
    if (f.stats_synced && f.score_home != null && f.score_away != null && f.date <= nowISO) fixtures.set(f.id, f)
  }

  const teamSet = new Set(teamIds)
  const teamFixtures: TeamFixture[] = []
  for (const f of fixtures.values()) {
    if (teamSet.has(f.home_team_id)) teamFixtures.push({ teamId: f.home_team_id, date: f.date, goalsFor: f.score_home!, goalsAgainst: f.score_away! })
    if (teamSet.has(f.away_team_id)) teamFixtures.push({ teamId: f.away_team_id, date: f.date, goalsFor: f.score_away!, goalsAgainst: f.score_home! })
  }

  // Nombres de clubes propios y rivales, en tandas para no armar URLs gigantes.
  const nameIds = new Set<number>(teamIds)
  for (const r of rows) {
    if (r.fixture?.home_team_id) nameIds.add(r.fixture.home_team_id)
    if (r.fixture?.away_team_id) nameIds.add(r.fixture.away_team_id)
  }
  const idList = [...nameIds]
  const chunks: number[][] = []
  for (let i = 0; i < idList.length; i += CHUNK) chunks.push(idList.slice(i, i + CHUNK))
  const teamResults = await Promise.all(chunks.map(c => supabase.from('teams').select('id, name').in('id', c)))
  const teamNames = new Map<number, string>()
  for (const res of teamResults) {
    if (res.error) throw new Error(res.error.message)
    for (const t of res.data ?? []) teamNames.set(t.id as number, t.name as string)
  }

  if (leagues.error) throw new Error(leagues.error.message)
  const leagueNames = new Map<number, string>()
  for (const l of leagues.data ?? []) {
    leagueNames.set(l.id as number, leagueLabel({
      id: l.id as number, name: l.name as string, country: (l.country as string) ?? '',
      tier: (l.tier as number) ?? 1, season: (l.season as number) ?? 0, has_player_stats: true,
    }))
  }

  return { rows, owners, teamTwins, teamFixtures, teamNames, leagueNames, fetchedAt: Date.now() }
}
