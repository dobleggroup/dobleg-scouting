export type Position = 'ARQ' | 'LD' | 'CB' | 'LI' | 'VC' | 'VI' | 'EXT' | 'DEL';

export interface PlayerProfile {
  id: number;
  name: string;
  photo: string | null;
  birth_date: string | null;
  nationality: string | null;
  preferred_foot: string | null;
  height_cm: number | null;
  current_team_id: number | null;
  primary_position: Position | null;
  position_distribution: Record<string, number>;
  team?: { id: number; name: string; logo: string | null; league_id: number | null };
}

export interface PlayerSeasonScore {
  player_id: number;
  season: number;
  position: Position;
  league_id: number;
  matches_played: number;
  avg_score: number | null;
  avg_rating: number | null;
  total_goals: number;
  total_assists: number;
  percentile: number | null;
  global_percentile: number | null;
}

export interface PlayerMatchStat {
  id: number;
  player_id: number;
  fixture_id: number;
  team_id: number;
  detected_position: Position | null;
  formation: string | null;
  grid_position: string | null;
  minutes: number;
  rating: number | null;
  is_substitute: boolean;
  goals: number;
  assists: number;
  shots_total: number;
  shots_on: number;
  passes_total: number;
  passes_key: number;
  passes_accuracy: number;
  tackles: number;
  blocks: number;
  interceptions: number;
  duels_total: number;
  duels_won: number;
  dribbles_attempted: number;
  dribbles_success: number;
  fouls_drawn: number;
  fouls_committed: number;
  yellow_cards: number;
  red_cards: number;
  penalty_won: number;
  penalty_scored: number;
  penalty_missed: number;
  penalty_saved: number;
  saves: number;
  goals_conceded: number;
  match_score: number | null;
  fixture?: {
    id: number;
    date: string;
    home_team_id: number;
    away_team_id: number;
    score_home: number | null;
    score_away: number | null;
    league_id: number;
    home_team?: { name: string };
    away_team?: { name: string };
  };
}

export interface LeagueInfo {
  id: number;
  name: string;
  country: string;
  tier: number;
  season: number;
  has_player_stats: boolean;
}

export interface PlayerWithScore extends PlayerProfile {
  season_scores: PlayerSeasonScore[];
  primary_score: number | null;
  primary_percentile: number | null;
  league?: LeagueInfo;
}

export interface PositionAverage {
  position: Position;
  league_id: number;
  avg_score: number;
  player_count: number;
}
