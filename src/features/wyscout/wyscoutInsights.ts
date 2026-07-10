import type { WyscoutPoint, WyscoutMetric } from '@/services/wyscoutEvolutionService'

export type InsightTone = 'positive' | 'negative' | 'neutral'
export interface Insight {
  text: string
  tone: InsightTone
}

function fmt(v: number, unit: string): string {
  return unit === '%' ? `${Math.round(v)}%` : (Math.round(v * 100) / 100).toString()
}

// Overrides de nombre para que la frase quede clara y desambiguada.
// "Duelos" (el genérico) convive con "Duelos aéreos/defensivos/ofensivos".
const BASE_OVERRIDES: Record<string, string> = {
  duelos: 'duelos totales',
}

// Base legible de la métrica: la parte antes del "/", en minúscula.
function metricBase(metric: WyscoutMetric): string {
  const raw = metric.label.split('/')[0].trim().toLowerCase()
  return BASE_OVERRIDES[raw] ?? raw
}

// Sujeto singular para armar frases naturales ("Su ___ subió/bajó…"):
// ratio → "eficacia en duelos totales"; conteo → "promedio de goles".
function metricSubject(metric: WyscoutMetric): string {
  const base = metricBase(metric)
  return metric.type === 'ratio' ? `eficacia en ${base}` : `promedio de ${base}`
}

/**
 * Genera hasta 4 conclusiones cortas y bien redactadas sobre la serie.
 * - `mode`: 'weekly' (por partido) o 'monthly' (por mes) → cambia la redacción.
 * - `lowerIsBetter`: si MENOS es mejor (ej. balones perdidos), invierte el tono.
 *
 * Cada insight trae `tone`: 'positive' (verde) si es a favor del jugador,
 * 'negative' (rojo) si es en contra.
 */
export function buildInsights(
  series: WyscoutPoint[],
  metric: WyscoutMetric,
  opts: { mode: 'weekly' | 'monthly'; lowerIsBetter: boolean },
): Insight[] {
  const vals = series.map(s => s.value).filter((v): v is number => v !== null)
  const out: Insight[] = []
  if (vals.length < 3) return out

  const { mode, lowerIsBetter } = opts
  const base = metricBase(metric)
  const subject = metricSubject(metric)
  const U = metric.unit
  const sing = mode === 'monthly' ? 'mes' : 'partido'
  const plur = mode === 'monthly' ? 'meses' : 'partidos'
  const lastN = (n: number) => `últimos ${n} ${plur}`

  const improved = (diff: number) => (lowerIsBetter ? diff < 0 : diff > 0)
  const toneFor = (diff: number): InsightTone =>
    diff === 0 ? 'neutral' : improved(diff) ? 'positive' : 'negative'

  // 1) Tendencia: mitad reciente vs previa (ventana adaptativa, hasta 3).
  if (vals.length >= 4) {
    const win = Math.min(3, Math.floor(vals.length / 2))
    const last = vals.slice(-win)
    const prev = vals.slice(-win * 2, -win)
    const a = last.reduce((s, v) => s + v, 0) / last.length
    const b = prev.reduce((s, v) => s + v, 0) / prev.length
    const diff = a - b
    const rel = b !== 0 ? Math.abs(diff / b) : 1
    if (diff !== 0 && rel >= 0.1) {
      const arrow = diff < 0 ? '▼' : '▲'
      const verb = diff < 0 ? 'bajó' : 'subió'
      out.push({
        text: `${arrow} Su ${subject} ${verb} de ${fmt(b, U)} a ${fmt(a, U)} en los ${lastN(win)}`,
        tone: toneFor(diff),
      })
    }
  }

  // 2) Récord del período en el último punto.
  {
    const last = vals[vals.length - 1]
    const prev = vals.slice(0, -1)
    const prevMax = Math.max(...prev)
    const prevMin = Math.min(...prev)
    let hit: { arrow: string; good: boolean } | null = null
    if (last > prevMax) hit = { arrow: '▲', good: !lowerIsBetter }
    else if (last < prevMin) hit = { arrow: '▼', good: lowerIsBetter }
    if (hit) {
      const noun = metric.type === 'ratio' ? `eficacia en ${base}` : `registro de ${base}`
      out.push({
        text: `${hit.arrow} Su ${hit.good ? 'mejor' : 'peor'} ${noun} del período: ${fmt(last, U)}, el último ${sing}`,
        tone: hit.good ? 'positive' : 'negative',
      })
    }
  }

  // 3) Racha reciente vs promedio personal.
  {
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length
    const k = Math.min(3, vals.length - 1)
    const lastK = vals.slice(-k)
    let dir: 'encima' | 'debajo' | null = null
    if (lastK.every(v => v > avg)) dir = 'encima'
    else if (lastK.every(v => v < avg)) dir = 'debajo'
    if (dir) {
      const good = dir === 'encima' ? !lowerIsBetter : lowerIsBetter
      out.push({
        text: `En los ${lastN(k)}, su ${subject} estuvo por ${dir} de lo habitual (${fmt(avg, U)})`,
        tone: good ? 'positive' : 'negative',
      })
    }
  }

  // 4) Racha en 0 (solo métricas de conteo y modo por partido).
  if (metric.type === 'simple' && mode === 'weekly') {
    let streak = 0
    for (let i = vals.length - 1; i >= 0 && vals[i] === 0; i--) streak++
    if (streak >= 3) {
      out.push(
        lowerIsBetter
          ? { text: `Lleva ${streak} ${plur} sin ${base}`, tone: 'positive' }
          : { text: `Hace ${streak} ${plur} sin registrar ${base}`, tone: 'negative' },
      )
    }
  }

  return out.slice(0, 4)
}
