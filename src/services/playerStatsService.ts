import { supabase } from '@/lib/supabase';
import type {
  PlayerWithScore,
  PlayerMatchStat,
  PlayerSeasonScore,
  PositionAverage,
  PositionMetricAverages,
  Position,
  LeagueInfo,
} from '@/types/scoring';

function currentSeasons(): number[] {
  const now = new Date();
  const euroSeason = now.getMonth() < 7 ? now.getFullYear() - 1 : now.getFullYear();
  const calendarSeason = now.getFullYear();
  return euroSeason === calendarSeason ? [calendarSeason] : [euroSeason, calendarSeason];
}

export async function fetchPlayersList(filters: {
  positions?: Position[];
  league_id?: number;
  team_id?: number;
  min_score?: number;
  min_age?: number;
  max_age?: number;
  min_matches?: number;
  min_market_value?: number;
  max_market_value?: number;
  max_contract_months?: number;
  agents?: string[];
  search?: string;
  season?: number;
  page?: number;
  pageSize?: number;
}): Promise<{ players: PlayerWithScore[]; count: number }> {
  const seasons = filters.season ? [filters.season] : currentSeasons();
  const page = filters.page ?? 0;
  const pageSize = filters.pageSize ?? 50;

  // El colapso a 1 fila por jugador (sobre las múltiples filas posición/temporada/liga
  // de player_season_scores) se hace en el RPC fetch_players_list ANTES de paginar.
  // Así el contador es de JUGADORES únicos y un jugador no reaparece en varias páginas.
  const { data, error } = await supabase.rpc('fetch_players_list', {
    p_seasons: seasons,
    p_positions: filters.positions?.length ? filters.positions : null,
    p_league_id: filters.league_id ?? null,
    p_team_id: filters.team_id ?? null,
    p_min_score: filters.min_score ?? null,
    p_min_matches: filters.min_matches ?? null,
    p_min_age: filters.min_age ?? null,
    p_max_age: filters.max_age ?? null,
    p_min_market_value: filters.min_market_value ?? null,
    p_max_market_value: filters.max_market_value ?? null,
    p_max_contract_months: filters.max_contract_months ?? null,
    p_agents: filters.agents?.length ? filters.agents : null,
    p_search: filters.search ?? null,
    p_page: page,
    p_page_size: pageSize,
  });
  if (error) throw error;

  const result = (data ?? { count: 0, players: [] }) as {
    count: number;
    players: PlayerWithScore[];
  };
  return { players: result.players ?? [], count: result.count ?? 0 };
}

export async function fetchPlayerDetail(playerId: number, season?: number): Promise<{
  player: PlayerWithScore;
  matches: PlayerMatchStat[];
  allSeasonScores: PlayerSeasonScore[];
} | null> {
  const seasons = season ? [season] : currentSeasons();

  const [playerRes, scoresRes, matchesRes] = await Promise.all([
    supabase.from('players').select(`
      *, team:teams(id, name, logo, league_id)
    `).eq('id', playerId).single(),

    supabase.from('player_season_scores').select('*')
      .eq('player_id', playerId).in('season', seasons),

    supabase.from('player_match_stats').select(`
      *,
      fixture:fixtures(
        id, date, home_team_id, away_team_id, score_home, score_away, league_id,
        home_team:teams!fixtures_home_team_id_fkey(name),
        away_team:teams!fixtures_away_team_id_fkey(name)
      )
    `)
      .eq('player_id', playerId)
      .order('fixture(date)', { ascending: true }),
  ]);

  if (playerRes.error || !playerRes.data) return null;

  const seasonScores = scoresRes.data ?? [];
  const primaryScore = seasonScores.find(
    (s: any) => s.position === playerRes.data.primary_position
  );

  return {
    player: {
      ...playerRes.data,
      season_scores: seasonScores,
      primary_score: primaryScore?.avg_score ?? null,
      primary_percentile: primaryScore?.percentile ?? null,
    },
    matches: matchesRes.data ?? [],
    allSeasonScores: seasonScores,
  };
}

export async function fetchPositionAverages(
  season?: number
): Promise<PositionAverage[]> {
  const seasons = season ? [season] : currentSeasons();

  const { data, error } = await supabase
    .from('player_season_scores')
    .select('position, league_id, avg_score')
    .in('season', seasons)
    .not('avg_score', 'is', null);

  if (error) throw error;

  const groups = new Map<string, { scores: number[]; league_id: number; position: string }>();
  for (const row of data ?? []) {
    const key = `${row.position}|${row.league_id}`;
    if (!groups.has(key)) groups.set(key, { scores: [], league_id: row.league_id, position: row.position });
    groups.get(key)!.scores.push(row.avg_score);
  }

  return Array.from(groups.values()).map(g => ({
    position: g.position as Position,
    league_id: g.league_id,
    avg_score: Math.round((g.scores.reduce((a, b) => a + b, 0) / g.scores.length) * 10) / 10,
    player_count: g.scores.length,
  }));
}

export async function fetchDistinctAgents(): Promise<string[]> {
  const { data, error } = await supabase
    .from('players')
    .select('agent')
    .not('agent', 'is', null)
    .order('agent');

  if (error) throw error;
  const unique = [...new Set((data ?? []).map((r: any) => r.agent as string).filter(Boolean))];
  return unique;
}

export async function fetchLeagues(): Promise<LeagueInfo[]> {
  const { data, error } = await supabase
    .from('leagues')
    .select('*')
    .eq('has_player_stats', true)
    .order('tier', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export interface TeamInfo {
  id: number;
  name: string;
  logo: string | null;
  league_id: number;
}

export async function fetchTeamsByLeague(leagueId: number): Promise<TeamInfo[]> {
  const { data, error } = await supabase
    .from('teams')
    .select('id, name, logo, league_id')
    .eq('league_id', leagueId)
    .order('name');

  if (error) throw error;
  return data ?? [];
}

export interface ScoreLookupEntry {
  player_id: number;
  name: string;
  score: number;
  position: Position;
  percentile: number | null;
  matches_played: number;
}

export async function fetchScoreLookup(
  season?: number
): Promise<Map<string, ScoreLookupEntry>> {
  const seasons = season ? [season] : currentSeasons();

  const PAGE_SIZE = 1000;
  let allRows: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('player_season_scores')
      .select(`
        player_id, position, avg_score, percentile, matches_played,
        player:players!inner(name)
      `)
      .in('season', seasons)
      .not('avg_score', 'is', null)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    const rows = data ?? [];
    allRows = allRows.concat(rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const norm = (s: string) =>
    s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const map = new Map<string, ScoreLookupEntry>();
  for (const row of allRows) {
    const name = (row as any).player?.name as string;
    if (!name) continue;
    const key = norm(name);
    const entry: ScoreLookupEntry = {
      player_id: row.player_id,
      name,
      score: row.avg_score,
      position: row.position as Position,
      percentile: row.percentile,
      matches_played: row.matches_played,
    };
    const existing = map.get(key);
    if (!existing || entry.matches_played > existing.matches_played) {
      map.set(key, entry);
    }
  }

  const { AGENCY_PLAYERS } = await import('@/constants/agencyPlayers');
  for (const ap of AGENCY_PLAYERS) {
    const fullKey = norm(ap.fullName);
    const shortKey = norm(ap.shortName);
    const entry = map.get(fullKey);
    if (entry && shortKey !== fullKey && !map.has(shortKey)) {
      map.set(shortKey, entry);
    }
  }

  return map;
}

export async function fetchPlayerMatchHistory(
  playerId: number,
  position?: Position,
): Promise<PlayerMatchStat[]> {
  let query = supabase
    .from('player_match_stats')
    .select(`
      *,
      fixture:fixtures(
        id, date, home_team_id, away_team_id, score_home, score_away, league_id,
        home_team:teams!fixtures_home_team_id_fkey(name),
        away_team:teams!fixtures_away_team_id_fkey(name)
      )
    `)
    .eq('player_id', playerId)
    .not('match_score', 'is', null);

  if (position) query = query.eq('detected_position', position);

  query = query.order('fixture(date)', { ascending: true });

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function fetchPositionMetricAverages(
  season?: number
): Promise<PositionMetricAverages[]> {
  const seasons = season ? [season] : currentSeasons();

  const { data, error } = await supabase
    .from('position_metric_averages')
    .select('*')
    .in('season', seasons);

  if (error) throw error;
  return data ?? [];
}

export interface MarketValueHistoryRow {
  player_id: number;
  recorded_at: string;
  value_eur: number;
  club_name: string | null;
}

export async function fetchMarketValueHistory(
  playerId: number
): Promise<MarketValueHistoryRow[]> {
  const { data, error } = await supabase
    .from('market_value_history')
    .select('player_id, recorded_at, value_eur, club_name')
    .eq('player_id', playerId)
    .order('recorded_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}
