// src/features/coaches/wyscoutSquad/wyscoutSquadTypes.ts
// Modelo del export de jugadores de Wyscout ("Search results", una fila por jugador).

export type SquadMetricKey =
  | 'matches' | 'minutes' | 'goals' | 'xg' | 'assists' | 'xa'
  | 'duels_p90' | 'duels_won_pct'
  | 'def_actions_p90' | 'def_duels_p90' | 'def_duels_won_pct'
  | 'aerial_p90' | 'aerial_won_pct' | 'tackles_p90' | 'interceptions_p90' | 'fouls_p90'
  | 'att_actions_p90' | 'goals_p90' | 'npgoals_p90' | 'xg_p90' | 'head_goals' | 'head_goals_p90'
  | 'shots' | 'shots_p90' | 'shots_on_pct' | 'goal_conv_pct' | 'assists_p90'
  | 'crosses_p90' | 'crosses_acc_pct' | 'dribbles_p90' | 'dribbles_won_pct'
  | 'off_duels_p90' | 'off_duels_won_pct' | 'box_touches_p90' | 'prog_runs_p90' | 'accelerations_p90'
  | 'received_p90' | 'long_received_p90' | 'fouls_suffered_p90'
  | 'passes_p90' | 'passes_acc_pct' | 'fwd_passes_p90' | 'fwd_passes_acc_pct'
  | 'long_passes_p90' | 'long_passes_acc_pct' | 'pass_length_m'
  | 'xa_p90' | 'key_passes_p90' | 'final_third_passes_p90' | 'final_third_acc_pct'
  | 'through_passes_p90' | 'through_acc_pct' | 'deep_runs_p90' | 'final_third_crosses_p90'
  | 'prog_passes_p90' | 'prog_passes_acc_pct'

export interface SquadPlayer {
  name: string
  team: string
  positions: string[]
  age: number | null
  birthCountry: string | null
  passports: string[]
  foot: string | null
  heightCm: number | null
  stats: Partial<Record<SquadMetricKey, number | null>>
}

export interface WyscoutSquadData {
  team: string
  players: SquadPlayer[]
  columnsFound: SquadMetricKey[]
  sourceFileName: string
}

export type ParseResult = { ok: true; data: WyscoutSquadData } | { ok: false; error: string }
