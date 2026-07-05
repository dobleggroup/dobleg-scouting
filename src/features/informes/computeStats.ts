import type { ParsedFile, MetricDef, MetricStat } from './types'
import { applyDerived } from './derivedMetrics'

export function buildMatrix(
  parsed: ParsedFile,
  columnMap: Record<string, string>,
  baseDefs: MetricDef[],
): { defs: MetricDef[]; matrix: Record<string, (number | null)[]> } {
  const matrix: Record<string, (number | null)[]> = {}
  for (const def of baseDefs) {
    const header = def.sourceHeader
    if (!header) continue
    matrix[def.key] = parsed.rows.map(r => {
      const v = r[header]
      return typeof v === 'number' && !Number.isNaN(v) ? v : null
    })
  }
  return applyDerived(baseDefs, matrix)
}

export function percentile(values: (number | null)[], value: number, higherIsBetter: boolean): number {
  const nums = values.filter((v): v is number => v != null && !Number.isNaN(v))
  if (nums.length <= 1) return 50
  // Percentil-rank del jugador vs el resto del pool (el propio jugador está en `nums`,
  // por eso el denominador es n-1 = los demás). Extremo mejor => 100, peor => 0.
  const worse = nums.filter(v => (higherIsBetter ? v < value : v > value)).length
  return Math.min(100, Math.round((worse / (nums.length - 1)) * 100))
}

function colorFrom(pct: number): MetricStat['color'] {
  if (pct >= 66) return 'green'
  if (pct >= 33) return 'amber'
  return 'red'
}

export function computeStats(
  defs: MetricDef[],
  matrix: Record<string, (number | null)[]>,
  protagonistIndex: number,
): MetricStat[] {
  return defs.map(def => {
    const col = matrix[def.key] ?? []
    const value = col[protagonistIndex] ?? null
    const nums = col.filter((v): v is number => v != null && !Number.isNaN(v))
    const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null

    if (value == null || !nums.length) {
      return { def, value, avg, percentile: null, color: 'neutral', rank: null, total: nums.length }
    }

    const pct = percentile(col, value, def.higherIsBetter)
    let color: MetricStat['color']
    if (def.diverging) {
      color = value > 0.1 ? 'green' : value < -0.1 ? 'red' : 'amber'
    } else {
      color = colorFrom(pct)
    }
    const better = def.higherIsBetter
      ? nums.filter(v => v > value).length
      : nums.filter(v => v < value).length
    return { def, value, avg, percentile: pct, color, rank: better + 1, total: nums.length }
  })
}
