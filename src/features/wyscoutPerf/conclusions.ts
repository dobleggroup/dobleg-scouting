/**
 * Conclusiones en castellano simple a partir de los datos de Wyscout por mes.
 * Sólo se escribe una frase cuando la diferencia es clara y hay minutos
 * suficientes, para no sacar conclusiones de dos partidos.
 */
import {
  METRICS, POS_GROUP_LABEL, dominantGroup, fmtMetric, metricsFor,
  type MetricDef, type PosGroup, type Totals, isRate, unitSuffix,
} from './metrics'
import { groupPeriods, monthsAgo, totalsBetween, type MonthRow } from './periods'

export type Tone = 'positive' | 'negative' | 'neutral'
export type ConclusionKind = 'temporada' | 'reciente' | 'agencia' | 'record'

export interface Conclusion {
  text: string
  tone: Tone
  kind: ConclusionKind
  metricKey: string
  /** Para ordenar: cuanto más grande, más fuerte la conclusión. */
  score: number
}

export const MIN_MINUTES = 450
/** Para comparar una temporada con otra: unos 10 partidos enteros en cada una. */
const SEASON_MINUTES = 900
const MIN_REL = 0.15

function unitText(m: MetricDef): string {
  return unitSuffix(m)
}

/** Diferencia clara: ≥15% y, para porcentajes, al menos 4 puntos. */
function clearChange(m: MetricDef, now: number, before: number): number | null {
  const diff = now - before
  if (m.unit === '%') return Math.abs(diff) >= 4 ? diff / Math.max(before, 1) : null
  if (Math.abs(diff) < 0.1 || Math.abs(before) < 0.05) return null
  const rel = diff / Math.abs(before)
  return Math.abs(rel) >= MIN_REL ? rel : null
}

/**
 * En métricas "por partido" de cosas que pasan poco (goles, asistencias…) una
 * diferencia grande puede ser casualidad: pedimos que la diferencia equivalga
 * a 2 jugadas o más en los minutos del período más corto.
 */
function enoughEvents(m: MetricDef, now: number, before: number, minutes: number): boolean {
  if (m.unit !== 'pp') return true
  return (Math.abs(now - before) * minutes) / 90 >= 2
}

/** En los %: al menos 30 intentos en cada período (18 pases largos en un año no dicen nada). */
const MIN_TRIES = 30
function enoughTries(m: MetricDef, ...periods: Totals[]): boolean {
  return !m.tries || periods.every(t => (t.s[m.tries!] ?? 0) >= MIN_TRIES)
}

function isGood(m: MetricDef, diff: number) {
  return m.lowerIsBetter ? diff < 0 : diff > 0
}

function flavor(now: number, before: number): string {
  if (before <= 0 || now <= 0) return ''
  const r = now / before
  if (r <= 0.55) return ', casi la mitad'
  if (r >= 1.8 && r < 2.6) return ', casi el doble'
  if (r >= 2.6) return `, ${Math.round(r)} veces más`
  return ''
}

function value(m: MetricDef, t: Totals | null | undefined): number | null {
  if (!t || t.minutes < MIN_MINUTES) return null
  return m.compute(t)
}

export interface PlayerContext {
  rows: MonthRow[]
  group: PosGroup | null
}

/**
 * Posición que figura en la ficha de cada jugador (por clave). Manda sobre la de
 * Wyscout para que la página, la ficha y el Inicio digan lo mismo.
 */
const positionOverrides = new Map<string, PosGroup>()
export function setPositionOverrides(map: Map<string, PosGroup>) {
  positionOverrides.clear()
  for (const [k, g] of map) positionOverrides.set(k, g)
}

export function playerGroup(rows: MonthRow[]): PosGroup | null {
  const forced = rows.length ? positionOverrides.get(rows[0].player_key) : undefined
  if (forced) return forced
  const recent = rows.filter(r => r.month.slice(0, 7) >= monthsAgo(12))
  return dominantGroup((recent.length ? recent : rows).flatMap(r => r.positions ?? []))
}

/** Conclusiones de un jugador. `peers` = filas de todos los jugadores de la agencia (incluido él). */
export function playerConclusions(rows: MonthRow[], peers: MonthRow[] = [], today = new Date()): Conclusion[] {
  if (rows.length === 0) return []
  const group = playerGroup(rows)
  const metrics = metricsFor(group).filter(m => !m.signed && isRate(m))
  const out: Conclusion[] = []

  // 1) Temporada vs la anterior (las dos últimas con minutos suficientes).
  const seasons = groupPeriods(rows, 'season').filter(p => p.minutes >= SEASON_MINUTES)
  if (seasons.length >= 2) {
    const cur = seasons[seasons.length - 1]
    const prev = seasons[seasons.length - 2]
    for (const m of metrics) {
      const a = m.compute(cur), b = m.compute(prev)
      if (a === null || b === null) continue
      const rel = clearChange(m, a, b)
      if (rel === null || !enoughEvents(m, a, b, Math.min(cur.minutes, prev.minutes)) || !enoughTries(m, cur, prev)) continue
      const good = isGood(m, a - b)
      const verb = a > b ? 'subió' : 'bajó'
      out.push({
        kind: 'temporada', metricKey: m.key, tone: good ? 'positive' : 'negative', score: Math.abs(rel) + (m.headline ? 0.2 : 0),
        text: `${good ? 'Mejoró' : 'Empeoró'} en ${m.phrase}: ${verb} de ${fmtMetric(m, b)} a ${fmtMetric(m, a)}${unitText(m)}${flavor(a, b)} (temporada ${prev.label} → ${cur.label}).`,
      })
    }
    // Récord: la última temporada es la mejor de su carrera (con 3+ temporadas).
    if (seasons.length >= 3) {
      for (const m of metrics.filter(x => x.headline)) {
        const vals = seasons.map(s => m.compute(s))
        const last = vals[vals.length - 1]
        const before = vals.slice(0, -1).filter((x): x is number => x !== null)
        if (last === null || before.length < 2) continue
        const best = m.lowerIsBetter ? last < Math.min(...before) : last > Math.max(...before)
        if (!best) continue
        out.push({
          kind: 'record', metricKey: m.key, tone: 'positive', score: 0.45,
          text: `Su mejor temporada en ${m.phrase}: ${fmtMetric(m, last)}${unitText(m)} en la ${cur.label}.`,
        })
      }
    }
  }

  // 2) Últimos 3 meses vs todo lo anterior.
  const recentFrom = monthsAgo(2, today)
  const recent = totalsBetween(rows, recentFrom, monthsAgo(0, today))
  const history = totalsBetween(rows, '0000-00', monthsAgo(3, today))
  if (recent.minutes >= 360 && history.minutes >= MIN_MINUTES * 2) {
    for (const m of metrics) {
      // Un porcentaje de 3 meses con pocos partidos se mueve mucho: se pide más minutos.
      if (m.unit === '%' && recent.minutes < 540) continue
      const a = m.compute(recent), b = m.compute(history)
      if (a === null || b === null) continue
      const rel = clearChange(m, a, b)
      if (rel === null || Math.abs(rel) < 0.25 || !enoughEvents(m, a, b, recent.minutes) || !enoughTries(m, recent, history)) continue
      const good = isGood(m, a - b)
      out.push({
        kind: 'reciente', metricKey: m.key, tone: good ? 'positive' : 'negative', score: Math.abs(rel) * 0.9,
        text: `Últimos 3 meses: ${fmtMetric(m, a)}${unitText(m)} en ${m.phrase}, ${good ? 'mejor' : 'peor'} que su promedio (${fmtMetric(m, b)}).`,
      })
    }
  }

  // 3) Contra los de su posición en la agencia (últimos 12 meses).
  if (group && peers.length) {
    const from = monthsAgo(11, today), to = monthsAgo(0, today)
    const me = rows[0].player_key
    const byPlayer = new Map<string, MonthRow[]>()
    for (const r of peers) {
      if (!byPlayer.has(r.player_key)) byPlayer.set(r.player_key, [])
      byPlayer.get(r.player_key)!.push(r)
    }
    const sameGroup = [...byPlayer.entries()].filter(([, rs]) => playerGroup(rs) === group)
    if (sameGroup.length >= 3) {
      const g = POS_GROUP_LABEL[group].one
      for (const m of metrics.filter(x => x.headline || x.category === 'regate' || x.category === 'creacion')) {
        const ranked = sameGroup
          .map(([k, rs]) => ({ k, v: value(m, totalsBetween(rs, from, to)) }))
          .filter((x): x is { k: string; v: number } => x.v !== null)
          .sort((a, b) => (m.lowerIsBetter ? a.v - b.v : b.v - a.v))
        if (ranked.length < 3) continue
        const pos = ranked.findIndex(x => x.k === me)
        // Empatado con otro (por ejemplo, todos en 0): no es "el que más" ni "el que menos".
        if (pos < 0 || ranked.some((x, j) => j !== pos && x.v === ranked[pos].v)) continue
        if (pos === 0) {
          out.push({
            kind: 'agencia', metricKey: m.key, tone: 'positive', score: 0.6 + (m.headline ? 0.2 : 0),
            text: `Es el ${g} de la agencia con ${m.lowerIsBetter ? 'menos' : 'más'} ${m.phrase} en el último año (${fmtMetric(m, ranked[0].v)}${unitText(m)}).`,
          })
        } else if (pos === ranked.length - 1 && m.headline) {
          out.push({
            kind: 'agencia', metricKey: m.key, tone: 'negative', score: 0.5,
            text: `Es el ${g} de la agencia con ${m.lowerIsBetter ? 'más' : 'menos'} ${m.phrase} en el último año (${fmtMetric(m, ranked[pos].v)}${unitText(m)}).`,
          })
        }
      }
    }
  }

  return pickDiverse(out, 5)
}

/** Las más fuertes, sin repetir métrica y con no más de 2 del mismo tipo. */
function pickDiverse(list: Conclusion[], n: number): Conclusion[] {
  const seenMetric = new Set<string>()
  const perKind = new Map<ConclusionKind, number>()
  const out: Conclusion[] = []
  for (const c of [...list].sort((a, b) => b.score - a.score)) {
    if (seenMetric.has(c.metricKey) || (perKind.get(c.kind) ?? 0) >= 2) continue
    seenMetric.add(c.metricKey)
    perKind.set(c.kind, (perKind.get(c.kind) ?? 0) + 1)
    out.push(c)
    if (out.length >= n) break
  }
  return out
}

export interface TrendResult {
  player_key: string
  player_name: string
  group: PosGroup | null
  /** Promedio de cambios (positivo = viene mejorando). */
  index: number
  best: { metric: MetricDef; now: number; before: number } | null
  worst: { metric: MetricDef; now: number; before: number } | null
}

/** En alza / en baja: últimos 6 meses contra los 12 anteriores, en las métricas de su posición. */
export function playerTrend(rows: MonthRow[], today = new Date()): TrendResult | null {
  if (!rows.length) return null
  const group = playerGroup(rows)
  const now = totalsBetween(rows, monthsAgo(5, today), monthsAgo(0, today))
  const before = totalsBetween(rows, monthsAgo(17, today), monthsAgo(6, today))
  if (now.minutes < MIN_MINUTES || before.minutes < MIN_MINUTES) return null
  const changes: Array<{ metric: MetricDef; rel: number; now: number; before: number }> = []
  for (const m of metricsFor(group).filter(x => !x.signed && isRate(x))) {
    const a = m.compute(now), b = m.compute(before)
    if (a === null || b === null || Math.abs(b) < 0.05 || !enoughTries(m, now, before)) continue
    const rel = Math.max(-1, Math.min(1, (a - b) / Math.abs(b)))
    changes.push({ metric: m, rel: m.lowerIsBetter ? -rel : rel, now: a, before: b })
  }
  if (changes.length < 3) return null
  const sorted = [...changes].sort((a, b) => b.rel - a.rel)
  return {
    player_key: rows[0].player_key,
    player_name: rows[0].player_name,
    group,
    index: changes.reduce((s, c) => s + c.rel, 0) / changes.length,
    best: sorted[0].rel > MIN_REL ? sorted[0] : null,
    worst: sorted[sorted.length - 1].rel < -MIN_REL ? sorted[sorted.length - 1] : null,
  }
}

export { METRICS }
