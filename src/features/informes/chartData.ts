// Helpers puros que traducen datos de un Informe (matrix + defs + stats) a las
// estructuras que consumen los builders SVG de `chartSvg.ts`. Sin dependencias
// de React ni del DOM: fáciles de testear en Node.

import { normalizeForSearch } from '@/lib/search'
import { percentile } from './computeStats'
import type { BarRow } from './chartSvg'
import type { Informe, MetricDef, MetricStat, ScatterAssignment } from './types'

// ---------------------------------------------------------------------------
// getRowName
// ---------------------------------------------------------------------------

const NAME_HEADER_KEYS = new Set(['jugador', 'player', 'nombre', 'name'])

/** Devuelve el nombre del jugador en la fila `idx`, buscando la columna de identidad. */
export function getRowName(informe: Informe, idx: number): string {
  const header =
    informe.headers.find(h => NAME_HEADER_KEYS.has(normalizeForSearch(h))) ?? informe.headers[0]
  if (!header) return ''
  const row = informe.rows[idx]
  return String(row?.[header] ?? '')
}

// ---------------------------------------------------------------------------
// radarData
// ---------------------------------------------------------------------------

export interface RadarSeriesData { name: string; color: string; values: number[] }

const COMPARE_COLORS = ['#F5C451', '#38BDF8']

function axisPercentile(
  matrix: Record<string, (number | null)[]>,
  key: string,
  idx: number,
  higherIsBetter: boolean,
): number {
  const col = matrix[key] ?? []
  const value = col[idx]
  if (value == null || Number.isNaN(value)) return 0
  return percentile(col, value, higherIsBetter)
}

/**
 * Arma ejes (labels) + series (protagonista + hasta 2 comparados) para el radar.
 * Cada valor es el percentil (0-100) del jugador en esa métrica dentro del pool.
 */
export function radarData(
  informe: Informe,
  _stats: MetricStat[],
  matrix: Record<string, (number | null)[]>,
  defs: MetricDef[],
): { axes: string[]; series: RadarSeriesData[] } {
  const keys = informe.charts.radar.filter(key => defs.some(d => d.key === key))
  const axes = keys.map(key => defs.find(d => d.key === key)!.label)

  function valuesFor(idx: number): number[] {
    return keys.map(key => {
      const def = defs.find(d => d.key === key)!
      return axisPercentile(matrix, key, idx, def.higherIsBetter)
    })
  }

  const protagonistName = getRowName(informe, informe.protagonistIndex) || informe.content?.nombre || ''
  const series: RadarSeriesData[] = [
    { name: protagonistName, color: '#22C55E', values: valuesFor(informe.protagonistIndex) },
  ]

  const compareIdxs = (informe.comparePlayerIndices ?? []).slice(0, 2)
  compareIdxs.forEach((idx, i) => {
    series.push({ name: getRowName(informe, idx), color: COMPARE_COLORS[i], values: valuesFor(idx) })
  })

  return { axes, series }
}

// ---------------------------------------------------------------------------
// barsData
// ---------------------------------------------------------------------------

/** Traduce MetricStat[] (filtradas por `keys`) al formato de fila que espera `barsSvg`. */
export function barsData(stats: MetricStat[], keys: string[]): BarRow[] {
  return keys
    .map(key => stats.find(s => s.def.key === key))
    .filter((s): s is MetricStat => !!s)
    .map(stat => ({
      label: stat.def.label,
      pct: stat.percentile ?? 0,
      value:
        stat.value == null
          ? '—'
          : stat.def.unit === '%'
            ? `${stat.value.toFixed(0)}%`
            : stat.value.toFixed(2),
      rank: stat.rank != null ? `N°${stat.rank}/${stat.total}` : 's/d',
      dot: stat.color,
    }))
}

// ---------------------------------------------------------------------------
// scatterData
// ---------------------------------------------------------------------------

export interface ScatterDataResult {
  points: { x: number; y: number; me: boolean }[]
  xLabel: string
  yLabel: string
  xMin?: number
  yMin?: number
}

/** Recorre matrix[xKey]/matrix[yKey] en paralelo, descarta pares incompletos y marca al protagonista. */
export function scatterData(
  scatter: ScatterAssignment,
  matrix: Record<string, (number | null)[]>,
  defs: MetricDef[],
  protagonistIndex: number,
): ScatterDataResult {
  const xCol = matrix[scatter.xKey] ?? []
  const yCol = matrix[scatter.yKey] ?? []
  const xLabel = defs.find(d => d.key === scatter.xKey)?.label ?? scatter.xKey
  const yLabel = defs.find(d => d.key === scatter.yKey)?.label ?? scatter.yKey

  const points: { x: number; y: number; me: boolean }[] = []
  const len = Math.max(xCol.length, yCol.length)
  for (let i = 0; i < len; i++) {
    const x = xCol[i]
    const y = yCol[i]
    if (x == null || y == null || Number.isNaN(x) || Number.isNaN(y)) continue
    points.push({ x, y, me: i === protagonistIndex })
  }

  return { points, xLabel, yLabel, xMin: scatter.xMin, yMin: scatter.yMin }
}
