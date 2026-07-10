import type { WyscoutPoint, WyscoutMetric } from '@/services/wyscoutEvolutionService'

export type InsightTone = 'positive' | 'negative' | 'neutral'
export interface Insight {
  text: string
  tone: InsightTone
}

function fmt(v: number, unit: string): string {
  return unit === '%' ? `${Math.round(v)}%` : (Math.round(v * 100) / 100).toString()
}

/**
 * Genera hasta 4 conclusiones cortas sobre la serie de una métrica.
 * - `mode`: 'weekly' (por partido) o 'monthly' (por mes) → cambia la redacción.
 * - `lowerIsBetter`: si MENOS es mejor (ej. balones perdidos), invierte el tono.
 *
 * Cada insight trae `tone`: 'positive' (verde) si el movimiento es a favor del
 * jugador, 'negative' (rojo) si es en contra, 'neutral' si no aplica.
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
  const noun = metric.label.split('/')[0].trim().toLowerCase()
  const U = metric.unit
  const sing = mode === 'monthly' ? 'mes' : 'partido'
  const plur = mode === 'monthly' ? 'meses' : 'partidos'
  const lastN = (n: number) => `últimos ${n} ${plur}`

  // ¿El cambio `diff` es una mejora para el jugador?
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
        text: `${arrow} Su ${noun} ${verb} de ${fmt(b, U)} a ${fmt(a, U)} en los ${lastN(win)}`,
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
    if (last > prevMax) {
      const good = !lowerIsBetter
      out.push({
        text: `▲ ${good ? 'Mejor' : 'Peor'} ${noun} del período (${fmt(last, U)}), el último ${sing}`,
        tone: good ? 'positive' : 'negative',
      })
    } else if (last < prevMin) {
      const good = lowerIsBetter
      out.push({
        text: `▼ ${good ? 'Mejor' : 'Peor'} ${noun} del período (${fmt(last, U)}), el último ${sing}`,
        tone: good ? 'positive' : 'negative',
      })
    }
  }

  // 3) Racha reciente vs promedio personal.
  {
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length
    const k = Math.min(3, vals.length - 1)
    const lastK = vals.slice(-k)
    if (lastK.every(v => v > avg)) {
      out.push({
        text: `Sus ${lastN(k)} por encima de su promedio (${fmt(avg, U)})`,
        tone: lowerIsBetter ? 'negative' : 'positive',
      })
    } else if (lastK.every(v => v < avg)) {
      out.push({
        text: `Sus ${lastN(k)} por debajo de su promedio (${fmt(avg, U)})`,
        tone: lowerIsBetter ? 'positive' : 'negative',
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
          ? { text: `Racha de ${streak} ${plur} sin ${noun}`, tone: 'positive' }
          : { text: `Hace ${streak} ${plur} que no registra ${noun}`, tone: 'negative' },
      )
    }
  }

  return out.slice(0, 4)
}
