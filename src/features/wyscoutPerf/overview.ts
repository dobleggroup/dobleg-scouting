/**
 * Foto rápida de cada jugador para la primera vista de Rendimiento individual:
 * cuánto viene jugando, si viene mejorando o bajando, en qué es el mejor de la
 * agencia y en qué el peor. Todo puro (sin React ni Supabase).
 */
import { POS_GROUP_LABEL, fmtMetric, isRate, lowerFirst, metricsFor, unitSuffix, type MetricDef, type PosGroup } from './metrics'
import { leagueName, monthsAgo, totalsBetween, type MonthRow } from './periods'
import { MIN_MINUTES, playerGroup, playerTrend, type TrendResult } from './conclusions'

export type Status = 'mejorando' | 'bajando' | 'parejo' | 'juegaPoco' | 'sinPartidos' | 'sinHistoria'

export const STATUS_LABEL: Record<Status, string> = {
  mejorando: 'Viene mejorando',
  bajando: 'Viene bajando',
  parejo: 'Parejo',
  juegaPoco: 'Juega poco',
  sinPartidos: 'Sin partidos recientes',
  sinHistoria: 'Pocos datos para comparar',
}

/** Debajo de esto en los últimos 3 meses (≈ 5 partidos enteros) se considera que juega poco. */
export const LOW_MINUTES_3M = 450
/** Cambio promedio para decir que viene mejorando o bajando. */
const TREND_CUT = 0.05

export interface RankFact {
  metric: MetricDef
  value: number
  rank: number
  of: number
}

export interface Snapshot {
  key: string
  group: PosGroup | null
  /** Minutos por mes, los últimos 12 (el último es el mes actual). */
  months: Array<{ month: string; minutes: number }>
  matches3m: number
  minutes3m: number
  /** "YYYY-MM" del último partido cargado. */
  lastMonth: string
  /** Liga principal del último mes con partidos. */
  competition: string | null
  trend: TrendResult | null
  status: Status
  /** Donde mejor sale contra los de su posición en la agencia (último año). */
  best: RankFact | null
  /** Donde peor sale. */
  worst: RankFact | null
}

function rankFacts(rows: MonthRow[], byPlayer: Map<string, MonthRow[]>, group: PosGroup | null, today: Date) {
  if (!group) return { best: null, worst: null }
  const from = monthsAgo(11, today), to = monthsAgo(0, today)
  const me = rows[0].player_key
  const peers = [...byPlayer.entries()].filter(([, rs]) => playerGroup(rs) === group)
  const facts: RankFact[] = []
  for (const m of metricsFor(group).filter(x => !x.signed && isRate(x))) {
    const ranked = peers
      .map(([k, rs]) => {
        const t = totalsBetween(rs, from, to)
        return { k, v: t.minutes >= MIN_MINUTES ? m.compute(t) : null }
      })
      .filter((x): x is { k: string; v: number } => x.v !== null)
      .sort((a, b) => (m.lowerIsBetter ? a.v - b.v : b.v - a.v))
    if (ranked.length < 3) continue
    const i = ranked.findIndex(x => x.k === me)
    if (i < 0 || ranked.some((x, j) => j !== i && x.v === ranked[i].v)) continue
    facts.push({ metric: m, value: ranked[i].v, rank: i + 1, of: ranked.length })
  }
  // A igual puesto, mandan las métricas principales.
  const score = (f: RankFact) => (f.rank - 1) / (f.of - 1) - (f.metric.headline ? 0.01 : 0)
  const sorted = [...facts].sort((a, b) => score(a) - score(b))
  const best = sorted[0] && sorted[0].rank === 1 ? sorted[0] : null
  const last = [...facts].filter(f => f.rank === f.of).sort((a, b) => Number(!!b.metric.headline) - Number(!!a.metric.headline))[0] ?? null
  return { best, worst: last && last.metric.key !== best?.metric.key ? last : null }
}

const CUP = /\b(cup|copa|coupe|pokal|coppa|trophy|supercopa|super cup)\b/i

/** La liga que más aparece en sus últimos meses (sin copas). */
function mainLeague(rows: MonthRow[]): string | null {
  const count = new Map<string, number>()
  for (const r of rows) for (const c of r.competitions ?? []) {
    const name = leagueName(c)
    if (name && !CUP.test(name)) count.set(name, (count.get(name) ?? 0) + r.matches)
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

export function playerSnapshot(rows: MonthRow[], byPlayer: Map<string, MonthRow[]>, today = new Date()): Snapshot {
  const group = playerGroup(rows)
  const months = Array.from({ length: 12 }, (_, i) => {
    const m = monthsAgo(11 - i, today)
    return { month: m, minutes: rows.filter(r => r.month.slice(0, 7) === m).reduce((s, r) => s + r.minutes, 0) }
  })
  const recent = totalsBetween(rows, monthsAgo(2, today), monthsAgo(0, today))
  const last = rows[rows.length - 1]
  const trend = playerTrend(rows, today)
  // Sin partidos este mes ni el anterior: puede estar lesionado, sin club o sin carga nueva.
  const stale = last.month.slice(0, 7) < monthsAgo(1, today)
  const status: Status = stale ? 'sinPartidos'
    : recent.minutes < LOW_MINUTES_3M ? 'juegaPoco'
    : !trend ? 'sinHistoria'
    : trend.index > TREND_CUT ? 'mejorando'
    : trend.index < -TREND_CUT ? 'bajando'
    : 'parejo'
  return {
    key: rows[0].player_key,
    group,
    months,
    matches3m: recent.matches,
    minutes3m: recent.minutes,
    lastMonth: last.month.slice(0, 7),
    competition: mainLeague(rows.slice(-6)),
    trend,
    status,
    ...rankFacts(rows, byPlayer, group, today),
  }
}

/** "1º de 5 extremos en regates completados (2,1 por partido)". */
export function rankText(f: RankFact, group: PosGroup | null): string {
  const who = group ? POS_GROUP_LABEL[group].many : 'jugadores'
  const unit = unitSuffix(f.metric)
  return `${f.rank}º de ${f.of} ${who} en ${lowerFirst(f.metric.label)} (${fmtMetric(f.metric, f.value)}${unit})`
}
