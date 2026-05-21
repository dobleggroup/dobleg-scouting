import { supabase } from '@/lib/supabase';
import type {
  PlayerWithScore,
  PlayerMatchStat,
  PlayerSeasonScore,
  PositionAverage,
  Position,
  LeagueInfo,
} from '@/types/scoring';

function currentSeason(): number {
  const now = new Date();
  return now.getMonth() < 7 ? now.getFullYear() - 1 : now.getFullYear();
}

export async function fetchPlayersList(filters: {
  position?: Position;
  league_id?: number;
  min_score?: number;
  max_age?: number;
  min_matches?: number;
  search?: string;
  season?: number;
  page?: number;
  pageSize?: number;
}): Promise<{ players: PlayerWithScore[]; count: number }> {
  const season = filters.season ?? currentSeason();
  const page = filters.page ?? 0;
  const pageSize = filters.pageSize ?? 50;

  let query = supabase
    .from('player_season_scores')
    .select(`
      *,
      player:players!inner(
        id, name, photo, birth_date, nationality, preferred_foot, height_cm,
        primary_position, position_distribution, current_team_id,
        team:teams(id, name, logo, league_id)
      )
    `, { count: 'exact' })
    .eq('season', season)
    .not('avg_score', 'is', null);

  if (filters.position) query = query.eq('position', filters.position);
  if (filters.league_id) query = query.eq('league_id', filters.league_id);
  if (filters.min_score) query = query.gte('avg_score', filters.min_score);
  if (filters.min_matches) query = query.gte('matches_played', filters.min_matches);
  if (filters.search) query = query.ilike('player.name', `%${filters.search}%`);
  if (filters.max_age) {
    const minBirth = new Date();
    minBirth.setFullYear(minBirth.getFullYear() - filters.max_age);
    query = query.gte('player.birth_date', minBirth.toISOString().split('T')[0]);
  }

  query = query
    .order('avg_score', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1);

  const { data, count, error } = await query;
  if (error) throw error;

  const players: PlayerWithScore[] = (data ?? []).map((row: any) => ({
    ...row.player,
    team: row.player.team,
    season_scores: [row],
    primary_score: row.avg_score,
    primary_percentile: row.percentile,
  }));

  return { players, count: count ?? 0 };
}

export async function fetchPlayerDetail(playerId: number, season?: number): Promise<{
  player: PlayerWithScore;
  matches: PlayerMatchStat[];
  allSeasonScores: PlayerSeasonScore[];
} | null> {
  const s = season ?? currentSeason();

  const [playerRes, scoresRes, matchesRes] = await Promise.all([
    supabase.from('players').select(`
      *, team:teams(id, name, logo, league_id)
    `).eq('id', playerId).single(),

    supabase.from('player_season_scores').select('*')
      .eq('player_id', playerId).eq('season', s),

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
  const s = season ?? currentSeason();

  const { data, error } = await supabase
    .from('player_season_scores')
    .select('position, league_id, avg_score')
    .eq('season', s)
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

export async function fetchLeagues(): Promise<LeagueInfo[]> {
  const { data, error } = await supabase
    .from('leagues')
    .select('*')
    .eq('has_player_stats', true)
    .order('tier', { ascending: true });

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
  const s = season ?? currentSeason();

  const { data, error } = await supabase
    .from('player_season_scores')
    .select(`
      player_id, position, avg_score, percentile, matches_played,
      player:players!inner(name)
    `)
    .eq('season', s)
    .not('avg_score', 'is', null);

  if (error) throw error;

  const map = new Map<string, ScoreLookupEntry>();
  for (const row of data ?? []) {
    const name = (row as any).player?.name as string;
    if (!name) continue;
    const key = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const existing = map.get(key);
    if (existing && existing.matches_played >= row.matches_played) continue;
    map.set(key, {
      player_id: row.player_id,
      name,
      score: row.avg_score,
      position: row.position as Position,
      percentile: row.percentile,
      matches_played: row.matches_played,
    });
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
