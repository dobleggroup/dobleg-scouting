// src/features/coaches/wyscoutSquad/squadMetrics.ts
// Estadisticas derivadas del archivo de Wyscout, filtro por minutos y rankings.
// Funciones puras: las usan los widgets del Resumen y el PDF.
import type { SquadMetricKey, SquadPlayer } from './wyscoutSquadTypes'

export type DerivedKey =
  | 'duels_won_p90' | 'off_duels_won_p90' | 'def_duels_won_p90' | 'aerial_won_p90'
  | 'dribbles_won_p90' | 'crosses_acc_p90' | 'prog_passes_acc_p90'
  | 'goal_involvement_p90' | 'goals_minus_xg' | 'assists_minus_xa' | 'minutes_share_pct'

export type AnyMetric = SquadMetricKey | DerivedKey

/** Acciones ganadas cada 90: acciones/90 × % ganado. */
export function wonPer90(per90: number | null | undefined, pct: number | null | undefined): number | null {
  if (per90 == null || pct == null) return null
  return (per90 * pct) / 100
}

const WON_PAIRS: Partial<Record<DerivedKey, [SquadMetricKey, SquadMetricKey]>> = {
  duels_won_p90: ['duels_p90', 'duels_won_pct'],
  off_duels_won_p90: ['off_duels_p90', 'off_duels_won_pct'],
  def_duels_won_p90: ['def_duels_p90', 'def_duels_won_pct'],
  aerial_won_p90: ['aerial_p90', 'aerial_won_pct'],
  dribbles_won_p90: ['dribbles_p90', 'dribbles_won_pct'],
  crosses_acc_p90: ['crosses_p90', 'crosses_acc_pct'],
  prog_passes_acc_p90: ['prog_passes_p90', 'prog_passes_acc_pct'],
}

function diff(a: number | null | undefined, b: number | null | undefined): number | null {
  return a == null || b == null ? null : a - b
}

export function metricValue(p: SquadPlayer, key: AnyMetric, teamMatches: number): number | null {
  const s = p.stats
  const pair = WON_PAIRS[key as DerivedKey]
  if (pair) return wonPer90(s[pair[0]], s[pair[1]])
  switch (key) {
    case 'goal_involvement_p90':
      return s.goals_p90 == null && s.assists_p90 == null ? null : (s.goals_p90 ?? 0) + (s.assists_p90 ?? 0)
    case 'goals_minus_xg':
      return diff(s.goals, s.xg)
    case 'assists_minus_xa':
      return diff(s.assists, s.xa)
    case 'minutes_share_pct':
      return teamMatches > 0 && s.minutes != null ? (s.minutes / (teamMatches * 90)) * 100 : null
    default:
      return s[key as SquadMetricKey] ?? null
  }
}

export function filterByMinutes(players: SquadPlayer[], minMinutes: number): SquadPlayer[] {
  return players.filter(p => (p.stats.minutes ?? 0) >= minMinutes && p.stats.minutes != null)
}

/** Cantidad de acciones en la temporada a partir de su valor cada 90 minutos. */
export function attempts(p: SquadPlayer, per90: AnyMetric, teamMatches: number): number | null {
  const v = metricValue(p, per90, teamMatches)
  const min = p.stats.minutes
  return v == null || min == null ? null : (v * min) / 90
}

export interface RankingRow {
  name: string
  value: number
  minutes: number
}

export function rankBy(
  players: SquadPlayer[],
  key: AnyMetric,
  opts: {
    teamMatches: number
    minMinutes: number
    perMinuteMetric: boolean
    limit?: number
    /** Para porcentajes: minimo de intentos en la temporada (acciones/90 × minutos/90). */
    minAttempts?: { per90: AnyMetric; min: number }
  },
): RankingRow[] {
  const byMinutes = opts.perMinuteMetric ? filterByMinutes(players, opts.minMinutes) : players
  const pool = opts.minAttempts
    ? byMinutes.filter(p => (attempts(p, opts.minAttempts!.per90, opts.teamMatches) ?? 0) >= opts.minAttempts!.min)
    : byMinutes
  const rows = pool
    .map(p => ({ name: p.name, value: metricValue(p, key, opts.teamMatches), minutes: p.stats.minutes ?? 0 }))
    .filter((r): r is RankingRow => r.value !== null && Number.isFinite(r.value))
    // En los totales (goles, asistencias, minutos) no se lista a quien tiene 0.
    .filter(r => opts.perMinuteMetric || r.value !== 0)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'es'))
  return opts.limit ? rows.slice(0, opts.limit) : rows
}
