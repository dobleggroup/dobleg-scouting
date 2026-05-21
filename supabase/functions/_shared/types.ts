// supabase/functions/_shared/types.ts

export type Position = 'ARQ' | 'LD' | 'CB' | 'LI' | 'VC' | 'VI' | 'EXT' | 'DEL';

export type LineRole = 'DEF' | 'MID' | 'MID_DEF' | 'MID_ATK' | 'ATK';

export interface ApiFixture {
  fixture: { id: number; date: string; status: { short: string } };
  league: { id: number; season: number };
  teams: {
    home: { id: number; name: string; logo: string };
    away: { id: number; name: string; logo: string };
  };
  goals: { home: number | null; away: number | null };
}

export interface ApiLineupPlayer {
  player: { id: number; name: string; number: number; pos: string; grid: string | null };
}

export interface ApiLineup {
  team: { id: number; name: string };
  formation: string | null;
  startXI: { player: ApiLineupPlayer['player'] }[];
  substitutes: { player: ApiLineupPlayer['player'] }[];
}

export interface ApiPlayerStats {
  player: { id: number; name: string; photo: string };
  statistics: Array<{
    games: {
      minutes: number | null;
      number: number | null;
      position: string | null;
      rating: string | null;
      captain: boolean;
      substitute: boolean;
    };
    offsides: number | null;
    shots: { total: number | null; on: number | null };
    goals: { total: number | null; conceded: number | null; assists: number | null; saves: number | null };
    passes: { total: number | null; key: number | null; accuracy: string | null };
    tackles: { total: number | null; blocks: number | null; interceptions: number | null };
    duels: { total: number | null; won: number | null };
    dribbles: { attempts: number | null; success: number | null; past: number | null };
    fouls: { drawn: number | null; committed: number | null };
    cards: { yellow: number; yellowred: number; red: number };
    penalty: {
      won: number | null; committed: number | null;
      scored: number | null; missed: number | null; saved: number | null;
    };
  }>;
}

export interface PlayerMatchRow {
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
}

export interface ScoringWeight {
  metric: string;
  weight: number;
  source: (row: PlayerMatchRow) => number;
  inverse?: boolean; // lower is better
  per90?: boolean;   // normalize to /90 min
  isPercentage?: boolean; // already 0-100, don't per90
}
