/**
 * Cómo juega un equipo, en palabras: cada eje va de un estilo a su opuesto y el
 * equipo se ubica según su percentil en la liga. Las "claves" son los rasgos más
 * marcados (los que más se alejan del promedio), para leer primero lo importante.
 */
import { TEAM_METRIC, TEAM_METRICS, fmtMetric, metricValue, rankTeams, type Ranked, type TeamGame, type TeamMatchBlock, type TeamMetric } from './teamData'

export interface StyleAxis {
  key: string
  title: string
  /** Polo de valores bajos y polo de valores altos. */
  low: string
  high: string
  metric: string
  /** Frase con el dato, ej. "defiende a 39 m de su arco". */
  detail: (v: string) => string
  /** Para métricas donde menos = más del polo "high" (PPDA: menos pases = presiona más). */
  invert?: boolean
}

export const STYLE_AXES: StyleAxis[] = [
  { key: 'tenencia', title: 'Tenencia', low: 'Le deja la pelota al rival', high: 'Quiere tener la pelota', metric: 'poss', detail: v => `${v} de posesión` },
  { key: 'directo', title: 'Forma de atacar', low: 'Elabora con pases cortos', high: 'Juega directo, con pelotazos', metric: 'longPct', detail: v => `${v} de sus pases son largos` },
  { key: 'contra', title: 'Contraataque', low: 'Casi no ataca de contra', high: 'Lastima de contraataque', metric: 'fastbreak', detail: v => `${v} remates de contra por partido` },
  { key: 'presion', title: 'Presión', low: 'Espera y deja jugar', high: 'Presiona enseguida', metric: 'ppda', invert: true, detail: v => `deja dar ${v} pases antes de ir a buscar` },
  { key: 'altura', title: 'Dónde defiende', low: 'Bloque bajo, cerca de su arco', high: 'Bloque alto, defiende arriba', metric: 'block', detail: v => `defiende en promedio a ${v} de su arco` },
  { key: 'linea', title: 'Línea defensiva', low: 'Línea baja', high: 'Línea adelantada', metric: 'line', detail: v => `sus defensores actúan a ${v} de su arco` },
  { key: 'territorio', title: 'Territorio', low: 'Lo meten atrás', high: 'Mete al rival atrás', metric: 'tilt', detail: v => `tiene el ${v} de los toques en los últimos metros` },
  { key: 'centros', title: 'Centros', low: 'Casi no tira centros', high: 'Busca mucho el centro', metric: 'crosses', detail: v => `${v} centros por partido` },
  { key: 'parada', title: 'Pelota parada', low: 'Poco peso de la pelota parada', high: 'Mucho peso de la pelota parada', metric: 'setPieceShare', detail: v => `${v} de sus remates son de pelota parada` },
]

export interface StyleReading {
  axis: StyleAxis
  metric: TeamMetric
  value: number | null
  /** 0-100: dónde queda entre el polo bajo (0) y el alto (100) contra la liga. */
  pos: number
  rank: number
  total: number
  /** Puesto contado desde el polo del veredicto (1 = el más marcado de la liga en eso). */
  poleRank: number
  verdict: string
  /** Qué tan marcado es el rasgo (0-50). */
  strength: number
  text: string
}

/** Percentil de un valor en la liga (0-100). */
function pctOf(v: number, all: number[]) {
  const below = all.filter(x => x < v).length, eq = all.filter(x => x === v).length
  return all.length > 1 ? ((below + (eq - 1) / 2) / (all.length - 1)) * 100 : 50
}

export function readStyle(teamId: string, pool: Map<string, TeamGame[]>): StyleReading[] {
  return STYLE_AXES.map(axis => {
    const metric = TEAM_METRIC.get(axis.metric)!
    const vals = [...pool.values()].map(gs => metricValue(metric, gs)).filter((v): v is number => v !== null)
    const value = metricValue(metric, pool.get(teamId) ?? [])
    let pos = value === null ? 50 : pctOf(value, vals)
    if (axis.invert) pos = 100 - pos
    pos = Math.round(pos)
    const rank = value === null ? vals.length : (axis.invert ? vals.filter(x => x < value).length : vals.filter(x => x > value).length) + 1
    const verdict = pos >= 70 ? axis.high : pos <= 30 ? axis.low : 'En el término medio'
    return {
      axis, metric, value, pos, rank, total: vals.length, verdict, poleRank: pos >= 50 ? rank : vals.length - rank + 1,
      strength: Math.abs(pos - 50),
      text: axis.detail(fmtMetric(metric, value)),
    }
  })
}

/** Datos de rendimiento que cuentan lo mismo que un eje de estilo (para no repetirlos en las claves). */
export const SAME_AS_STYLE: Record<string, string> = { setPieceShots: 'setPieceShare', crosses: 'crosses', poss: 'poss', ppda: 'ppda', longPct: 'longPct' }

/** Los rasgos más marcados, para el resumen ("lo que hay que saber"). */
export function keyTraits(readings: StyleReading[], n = 4) {
  return readings.filter(r => r.strength >= 25).sort((a, b) => b.strength - a.strength).slice(0, n)
}

/** Por dónde ataca: reparto de sus toques en el último tercio. */
export function lanes(games: TeamGame[]) {
  const L = games.reduce((s, g) => s + (g.us.ftL ?? 0), 0)
  const C = games.reduce((s, g) => s + (g.us.ftC ?? 0), 0)
  const R = games.reduce((s, g) => s + (g.us.ftR ?? 0), 0)
  const t = L + C + R || 1
  return { left: Math.round((L / t) * 100), centre: Math.round((C / t) * 100), right: Math.round((R / t) * 100) }
}

export interface ShapePlayer { id: string; x: number; y: number; starts: number; minutes: number }

/**
 * Posición media de los más usados en esos partidos (ponderada por minutos), con
 * el lugar de cada uno en la cancha. Devuelve los `n` con más titularidades.
 */
export function averageShape(games: TeamGame[], lineups: TeamMatchBlock['lineups'], n = 11): ShapePlayer[] {
  const acc = new Map<string, { sx: number; sy: number; w: number; starts: number; minutes: number }>()
  for (const g of games) {
    for (const row of lineups[g.match.id]?.[g.teamId] ?? []) {
      const [pid, , min, start, x, y] = row
      const a = acc.get(pid) ?? { sx: 0, sy: 0, w: 0, starts: 0, minutes: 0 }
      a.starts += start; a.minutes += min
      if (x != null && y != null) { a.sx += x * min; a.sy += y * min; a.w += min }
      acc.set(pid, a)
    }
  }
  return [...acc].filter(([, a]) => a.w > 0)
    .sort((a, b) => b[1].starts - a[1].starts || b[1].minutes - a[1].minutes)
    .slice(0, n)
    .map(([id, a]) => ({ id, x: a.sx / a.w, y: a.sy / a.w, starts: a.starts, minutes: a.minutes }))
}

/** Altura media (x de Opta, 0-100) de la línea defensiva y de las acciones defensivas en esos partidos. */
export function heights(games: TeamGame[]) {
  const avg = (k: string) => {
    const v = games.map(g => g.us[k] ?? 0).filter(x => x > 0)
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null
  }
  return { lineX: avg('lineX'), blockX: avg('blockX') }
}

export interface RankedMetric { m: TeamMetric; r: Ranked }

/** Datos de rendimiento (no de estilo) donde el equipo está entre los `cut` mejores o peores de la liga. */
export function strengthsWeaknesses(teamId: string, pool: Map<string, TeamGame[]>, n = 4, cut = 6) {
  const perf: RankedMetric[] = TEAM_METRICS.filter(m => !m.neutral && m.area !== 'estilo').map(m => ({ m, r: rankTeams(m, pool).get(teamId)! }))
  return {
    perf,
    strong: perf.filter(x => x.r.rank <= cut).sort((a, b) => a.r.rank - b.r.rank).slice(0, n),
    weak: perf.filter(x => x.r.rank >= pool.size - cut + 1).sort((a, b) => b.r.rank - a.r.rank).slice(0, n),
  }
}

export const RIVER_FACT_WORDS = { best: 'Lo mejor', worst: 'Lo que más le cuesta' }
export const RIVAL_FACT_WORDS = { best: 'Fuerte', worst: 'Flojo' }

export interface Fact { headline: string; detail: string; rank: number; total: number }

/**
 * "Lo que hay que saber": los rasgos de estilo más marcados y, sin repetir lo que ya
 * dicen, su mejor y su peor dato de rendimiento.
 */
export function teamFacts(teamId: string, pool: Map<string, TeamGame[]>, words: { best: string; worst: string }, max = 6): Fact[] {
  const traits = keyTraits(readStyle(teamId, pool), 4)
  const used = new Set(traits.map(t => t.metric.key))
  const { perf } = strengthsWeaknesses(teamId, pool)
  const fresh = perf.filter(x => !used.has(SAME_AS_STYLE[x.m.key] ?? ''))
  const best = [...fresh].sort((a, b) => a.r.rank - b.r.rank)[0]
  const worst = [...fresh].sort((a, b) => b.r.rank - a.r.rank)[0]
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  // Solo la primera letra en minúscula: "Goles esperados (xG)" → "goles esperados (xG)".
  const low = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
  return [
    ...traits.map(t => ({ headline: t.verdict, detail: cap(t.text), rank: t.poleRank, total: t.total })),
    ...(best && best.r.rank <= 8 ? [{ headline: `${words.best}: ${low(best.m.label)}`, detail: fmtMetric(best.m, best.r.value), rank: best.r.rank, total: pool.size }] : []),
    ...(worst && worst.r.rank >= pool.size - 7 ? [{ headline: `${words.worst}: ${low(worst.m.label)}`, detail: fmtMetric(worst.m, worst.r.value), rank: worst.r.rank, total: pool.size }] : []),
  ].slice(0, max)
}
