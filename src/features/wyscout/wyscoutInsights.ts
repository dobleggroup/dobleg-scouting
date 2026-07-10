import type { WyscoutPoint, WyscoutMetric } from '@/services/wyscoutEvolutionService'

function fmt(v: number, unit: string): string {
  return unit === '%' ? `${Math.round(v)}%` : (Math.round(v * 100) / 100).toString()
}

export function buildInsights(series: WyscoutPoint[], metric: WyscoutMetric): string[] {
  const vals = series.map(s => s.value).filter((v): v is number => v !== null)
  if (vals.length < 3) return []
  const out: string[] = []
  const noun = metric.label.split('/')[0].trim().toLowerCase()

  // 1) Racha en 0 (solo conteo/simple)
  if (metric.type === 'simple') {
    let streak = 0
    for (let i = vals.length - 1; i >= 0 && vals[i] === 0; i--) streak++
    if (streak >= 3) out.push(`Hace ${streak} partidos que no registra ${noun}`)
  }

  // 2) Tendencia: promedio de la mitad reciente vs la previa (ventana adaptativa, hasta 3)
  if (vals.length >= 4 && out.length < 2) {
    const win = Math.min(3, Math.floor(vals.length / 2))
    const last = vals.slice(-win)
    const prev = vals.slice(-win * 2, -win)
    const a = last.reduce((s, v) => s + v, 0) / win
    const b = prev.reduce((s, v) => s + v, 0) / win
    const diff = a - b
    const rel = b !== 0 ? Math.abs(diff / b) : 1
    if (diff !== 0 && rel >= 0.1) {
      const dir = diff < 0 ? '▼ bajó' : '▲ subió'
      out.push(`Su ${noun} ${dir} de ${fmt(b, metric.unit)} a ${fmt(a, metric.unit)} en los últimos ${win} partidos`)
    }
  }

  // 3) Récord del semestre en el último partido
  if (out.length < 2) {
    const last = vals[vals.length - 1]
    const prevMax = Math.max(...vals.slice(0, -1))
    const prevMin = Math.min(...vals.slice(0, -1))
    if (last > prevMax) out.push(`▲ Mejor ${noun} del período (${fmt(last, metric.unit)}) el último partido`)
    else if (last < prevMin && metric.type === 'ratio') out.push(`▼ Peor ${noun} del período (${fmt(last, metric.unit)}) el último partido`)
  }

  // 4) vs promedio personal
  if (out.length < 2) {
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length
    const last3 = vals.slice(-3)
    if (last3.every(v => v > avg)) out.push(`Últimos 3 partidos por encima de su promedio (${fmt(avg, metric.unit)})`)
    else if (last3.every(v => v < avg)) out.push(`Últimos 3 partidos por debajo de su promedio (${fmt(avg, metric.unit)})`)
  }

  return out.slice(0, 2)
}
