import type { PlayerSeasonScore, Position } from '@/types/scoring'

export type ApiMetricKey =
  | 'goals_p90' | 'assists_p90' | 'shots_on_p90' | 'shots_pct'
  | 'passes_accuracy' | 'passes_key_p90' | 'passes_total_p90'
  | 'dribbles_success_p90' | 'dribbles_pct' | 'duels_won_pct'
  | 'tackles_p90' | 'interceptions_p90' | 'blocks_p90'
  | 'fouls_drawn_p90' | 'avg_rating'
  | 'saves_p90' | 'goals_conceded_p90' | 'penalty_saved_avg' | 'clean_sheet_pct'

export interface ApiMetricInfo {
  key: ApiMetricKey
  label: string
  short: string
  unit: '%' | '/90' | ''
  higherIsBetter: boolean
}

export const API_METRICS: ApiMetricInfo[] = [
  { key: 'goals_p90', label: 'Goles /90', short: 'Gol/90', unit: '/90', higherIsBetter: true },
  { key: 'assists_p90', label: 'Asistencias /90', short: 'Ast/90', unit: '/90', higherIsBetter: true },
  { key: 'shots_on_p90', label: 'Tiros al arco /90', short: 'TA/90', unit: '/90', higherIsBetter: true },
  { key: 'shots_pct', label: 'Precisión de tiro', short: 'Tiro%', unit: '%', higherIsBetter: true },
  { key: 'passes_accuracy', label: 'Precisión de pase', short: 'Pase%', unit: '%', higherIsBetter: true },
  { key: 'passes_key_p90', label: 'Pases clave /90', short: 'PC/90', unit: '/90', higherIsBetter: true },
  { key: 'passes_total_p90', label: 'Pases /90', short: 'Pas/90', unit: '/90', higherIsBetter: true },
  { key: 'dribbles_success_p90', label: 'Regates exitosos /90', short: 'Reg/90', unit: '/90', higherIsBetter: true },
  { key: 'dribbles_pct', label: 'Éxito en regates', short: 'Reg%', unit: '%', higherIsBetter: true },
  { key: 'duels_won_pct', label: 'Duelos ganados', short: 'Duel%', unit: '%', higherIsBetter: true },
  { key: 'tackles_p90', label: 'Entradas /90', short: 'Ent/90', unit: '/90', higherIsBetter: true },
  { key: 'interceptions_p90', label: 'Intercepciones /90', short: 'Int/90', unit: '/90', higherIsBetter: true },
  { key: 'blocks_p90', label: 'Bloqueos /90', short: 'Blq/90', unit: '/90', higherIsBetter: true },
  { key: 'fouls_drawn_p90', label: 'Faltas recibidas /90', short: 'FR/90', unit: '/90', higherIsBetter: true },
  { key: 'avg_rating', label: 'Rating promedio', short: 'Rating', unit: '', higherIsBetter: true },
  { key: 'saves_p90', label: 'Atajadas /90', short: 'Ataj/90', unit: '/90', higherIsBetter: true },
  { key: 'goals_conceded_p90', label: 'Goles recibidos /90', short: 'GR/90', unit: '/90', higherIsBetter: false },
  { key: 'penalty_saved_avg', label: 'Penales atajados', short: 'PenAt', unit: '', higherIsBetter: true },
  { key: 'clean_sheet_pct', label: 'Vallas invictas', short: 'VI%', unit: '%', higherIsBetter: true },
]

// Métricas relevantes por posición (del scoring/radar — ver
// docs/superpowers/specs/2026-05-25-radar-chart-metrics-design.md líneas 21-27)
export const METRICS_BY_POSITION: Record<Position, ApiMetricKey[]> = {
  ARQ: ['saves_p90', 'goals_conceded_p90', 'avg_rating', 'penalty_saved_avg', 'clean_sheet_pct'],
  CB:  ['duels_won_pct', 'tackles_p90', 'interceptions_p90', 'blocks_p90', 'passes_accuracy', 'avg_rating', 'passes_total_p90'],
  LD:  ['duels_won_pct', 'passes_key_p90', 'dribbles_success_p90', 'assists_p90', 'tackles_p90', 'passes_accuracy', 'interceptions_p90', 'avg_rating', 'dribbles_pct'],
  LI:  ['duels_won_pct', 'passes_key_p90', 'dribbles_success_p90', 'assists_p90', 'tackles_p90', 'passes_accuracy', 'interceptions_p90', 'avg_rating', 'dribbles_pct'],
  VC:  ['tackles_p90', 'duels_won_pct', 'interceptions_p90', 'passes_accuracy', 'passes_total_p90', 'blocks_p90', 'avg_rating', 'passes_key_p90'],
  VI:  ['duels_won_pct', 'passes_key_p90', 'dribbles_success_p90', 'assists_p90', 'goals_p90', 'passes_accuracy', 'shots_on_p90', 'avg_rating', 'tackles_p90', 'dribbles_pct'],
  EXT: ['dribbles_success_p90', 'goals_p90', 'assists_p90', 'passes_key_p90', 'shots_on_p90', 'duels_won_pct', 'dribbles_pct', 'avg_rating', 'fouls_drawn_p90'],
  DEL: ['goals_p90', 'shots_on_p90', 'assists_p90', 'shots_pct', 'passes_key_p90', 'duels_won_pct', 'avg_rating', 'dribbles_success_p90', 'fouls_drawn_p90'],
}

export function getMetricValue(score: PlayerSeasonScore, key: ApiMetricKey): number | null {
  const v = (score as unknown as Record<string, number | null>)[key]
  return v ?? null
}
