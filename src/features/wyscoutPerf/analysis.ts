/**
 * Cuentas que comparten la página Rendimiento individual, la ficha y el Inicio:
 * valores por jugador en una ventana de tiempo, evolución contra el promedio de
 * su posición en la agencia, etc. Todo puro (sin React ni Supabase).
 */
import { EMPTY_TOTALS, addTotals, type MetricDef, type PosGroup, type Totals } from './metrics'
import { groupPeriods, monthsAgo, totalsBetween, type Grouping, type MonthRow } from './periods'
import { MIN_MINUTES, playerGroup } from './conclusions'

export type Window = '3m' | '12m' | 'all'

export const WINDOW_LABEL: Record<Window, string> = {
  '3m': 'Últimos 3 meses',
  '12m': 'Últimos 12 meses',
  all: 'Toda la carrera',
}

export function splitByPlayer(rows: MonthRow[]): Map<string, MonthRow[]> {
  const m = new Map<string, MonthRow[]>()
  for (const r of rows) {
    if (!m.has(r.player_key)) m.set(r.player_key, [])
    m.get(r.player_key)!.push(r)
  }
  for (const list of m.values()) list.sort((a, b) => a.month.localeCompare(b.month))
  return m
}

export function windowTotals(rows: MonthRow[], w: Window, today = new Date()): Totals {
  if (w === 'all') return totalsBetween(rows, '0000-00', '9999-99')
  return totalsBetween(rows, monthsAgo(w === '3m' ? 2 : 11, today), monthsAgo(0, today))
}

export interface PlayerValue {
  key: string
  name: string
  group: PosGroup | null
  value: number
  minutes: number
  matches: number
}

/** Valor de la métrica para cada jugador con minutos suficientes en la ventana. */
export function playerValues(
  byPlayer: Map<string, MonthRow[]>, metric: MetricDef, w: Window,
  opts: { group?: PosGroup | null; minMinutes?: number; today?: Date } = {},
): PlayerValue[] {
  const min = opts.minMinutes ?? (w === '3m' ? 270 : MIN_MINUTES)
  const out: PlayerValue[] = []
  for (const [key, rows] of byPlayer) {
    const group = playerGroup(rows)
    if (opts.group && group !== opts.group) continue
    const t = windowTotals(rows, w, opts.today)
    if (t.minutes < min) continue
    const value = metric.compute(t)
    if (value === null) continue
    out.push({ key, name: rows[rows.length - 1].player_name, group, value, minutes: t.minutes, matches: t.matches })
  }
  return out.sort((a, b) => (metric.lowerIsBetter ? a.value - b.value : b.value - a.value))
}

export interface EvolutionPoint {
  label: string
  from: string
  to: string
  value: number | null
  /** Promedio de los demás jugadores de la agencia de su posición en esas mismas fechas. */
  agency: number | null
  minutes: number
  matches: number
}

export function evolution(
  playerRows: MonthRow[], byPlayer: Map<string, MonthRow[]>, metric: MetricDef, grouping: Grouping,
): EvolutionPoint[] {
  if (!playerRows.length) return []
  const me = playerRows[0].player_key
  const group = playerGroup(playerRows)
  const peers = [...byPlayer.entries()].filter(([k, rs]) => k !== me && playerGroup(rs) === group).map(([, rs]) => rs)
  const minMinutes = grouping === 'month' ? 90 : 270
  return groupPeriods(playerRows, grouping).map(p => {
    const pool = peers.reduce((acc, rs) => addTotals(acc, totalsBetween(rs, p.from, p.to)), EMPTY_TOTALS)
    return {
      label: p.label, from: p.from, to: p.to, minutes: p.minutes, matches: p.matches,
      value: p.minutes >= minMinutes ? metric.compute(p) : null,
      agency: peers.length && pool.minutes >= minMinutes * 2 ? metric.compute(pool) : null,
    }
  })
}

/** Último mes con datos de cada jugador (para avisar si la carga está vieja). */
export function lastMonthByPlayer(byPlayer: Map<string, MonthRow[]>): Map<string, string> {
  const m = new Map<string, string>()
  for (const [k, rows] of byPlayer) m.set(k, rows[rows.length - 1].month.slice(0, 7))
  return m
}
