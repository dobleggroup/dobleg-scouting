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

export interface RadarSeriesData {
  name: string
  color: string
  values: number[]
  dashed?: boolean
  fill?: boolean
}

const COMPARE_COLORS = ['#F5C451', '#38BDF8']
const AVG_COLOR = '#9AA3AE'   // gris de la referencia "Promedio" del radar

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
 * Percentil donde cae el promedio del pool en un eje. Es la misma referencia
 * que la marca gris "promedio" de las barras (computeStats.avgPercentile), así
 * el hexágono gris del radar refleja al jugador promedio real por métrica en
 * vez de un percentil 50 plano (que quedaba clavado como un hexágono regular).
 */
function axisAvgPercentile(
  matrix: Record<string, (number | null)[]>,
  key: string,
  higherIsBetter: boolean,
): number {
  const nums = (matrix[key] ?? []).filter((v): v is number => v != null && !Number.isNaN(v))
  if (nums.length <= 1) return 50
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length
  return percentile(matrix[key] ?? [], mean, higherIsBetter)
}

/**
 * Una métrica aporta info comparativa (y se puede graficar sin colapsar el
 * radar) sólo si su columna tiene ≥2 valores distintos no nulos. Métricas
 * vacías o constantes (ej. "Altura" 0 para todos en un export de Wyscout)
 * colapsan los vértices al centro y "pinchan" el polígono — se omiten.
 */
function columnHasVariance(matrix: Record<string, (number | null)[]>, key: string): boolean {
  const nums = (matrix[key] ?? []).filter((v): v is number => v != null && !Number.isNaN(v))
  if (nums.length < 2) return false
  return new Set(nums).size >= 2
}

/** Keys del radar que existen en defs y tienen variación real en el pool. */
function usableRadarKeys(
  requestedKeys: string[],
  matrix: Record<string, (number | null)[]>,
  defs: MetricDef[],
): string[] {
  return requestedKeys
    .filter(key => defs.some(d => d.key === key))
    .filter(key => columnHasVariance(matrix, key))
}

/**
 * Arma ejes + series del radar principal: el protagonista (relleno verde) contra
 * una referencia limpia del "jugador promedio" del pool (percentil 50, línea
 * gris punteada). Cada valor del protagonista es su percentil (0-100) dentro del
 * pool. Se omiten métricas sin variación para no romper el polígono. La
 * comparación contra jugadores puntuales NO va acá — vive en "Comparaciones".
 */
export function radarData(
  informe: Informe,
  _stats: MetricStat[],
  matrix: Record<string, (number | null)[]>,
  defs: MetricDef[],
): { axes: string[]; series: RadarSeriesData[]; droppedCount: number } {
  const requested = informe.charts.radar.filter(key => defs.some(d => d.key === key))
  const keys = usableRadarKeys(informe.charts.radar, matrix, defs)
  const droppedCount = requested.length - keys.length
  const axes = keys.map(key => defs.find(d => d.key === key)!.label)

  const protagonistValues = keys.map(key => {
    const def = defs.find(d => d.key === key)!
    return axisPercentile(matrix, key, informe.protagonistIndex, def.higherIsBetter)
  })

  const avgValues = keys.map(key => {
    const def = defs.find(d => d.key === key)!
    return axisAvgPercentile(matrix, key, def.higherIsBetter)
  })

  const protagonistName = getRowName(informe, informe.protagonistIndex) || informe.content?.nombre || ''
  const series: RadarSeriesData[] = [
    { name: protagonistName, color: '#22C55E', values: protagonistValues },
    // Referencia del jugador promedio: percentil del promedio real del pool en cada eje.
    { name: 'Promedio del grupo', color: AVG_COLOR, values: avgValues, dashed: true, fill: false },
  ]

  return { axes, series, droppedCount }
}

/**
 * Radar de la pestaña "Comparaciones": superpone al protagonista con los hasta
 * 2 jugadores elegidos (todos rellenos, colores distintos), sobre las mismas
 * métricas del radar (o de barras si el radar está vacío). Sin referencia de
 * promedio — acá lo que importa es jugador vs jugador.
 */
export function radarComparisonData(
  informe: Informe,
  matrix: Record<string, (number | null)[]>,
  defs: MetricDef[],
): { axes: string[]; series: RadarSeriesData[] } {
  const requested = informe.charts.radar.length ? informe.charts.radar : informe.charts.bar
  const keys = usableRadarKeys(requested, matrix, defs)
  const axes = keys.map(key => defs.find(d => d.key === key)!.label)

  function valuesFor(idx: number): number[] {
    return keys.map(key => {
      const def = defs.find(d => d.key === key)!
      return axisPercentile(matrix, key, idx, def.higherIsBetter)
    })
  }

  const compareIdxs = (informe.comparePlayerIndices ?? []).slice(0, 2)
  const series: RadarSeriesData[] = [
    {
      name: getRowName(informe, informe.protagonistIndex) || informe.content?.nombre || '',
      color: '#22C55E',
      values: valuesFor(informe.protagonistIndex),
    },
    ...compareIdxs.map((idx, i) => ({
      name: getRowName(informe, idx),
      color: COMPARE_COLORS[i],
      values: valuesFor(idx),
    })),
  ]

  return { axes, series }
}

// ---------------------------------------------------------------------------
// comparisonTable
// ---------------------------------------------------------------------------

export interface ComparisonTablePlayer { name: string; color: string; idx: number }
export interface ComparisonTableCell { value: string; best: boolean }
export interface ComparisonTableRow { label: string; cells: ComparisonTableCell[] }
export interface ComparisonTableResult {
  players: ComparisonTablePlayer[]
  rows: ComparisonTableRow[]
}

const PROTAGONIST_COLOR = '#22C55E'

function formatComparisonValue(value: number | null | undefined, def: MetricDef): string {
  if (value == null || Number.isNaN(value)) return '—'
  return def.unit === '%' ? `${value.toFixed(0)}%` : value.toFixed(2)
}

/**
 * Arma una tabla protagonista + comparados (hasta 2) por cada métrica del radar
 * (o de las barras si el radar está vacío), con el mejor valor de cada fila
 * marcado (`best: true`) respetando `def.higherIsBetter`. Reutilizada por la
 * tab "Comparaciones" del preview y, potencialmente, por el export a HTML.
 */
export function comparisonTable(
  informe: Informe,
  matrix: Record<string, (number | null)[]>,
  defs: MetricDef[],
): ComparisonTableResult {
  const compareIdxs = (informe.comparePlayerIndices ?? []).slice(0, 2)
  const players: ComparisonTablePlayer[] = [
    {
      name: getRowName(informe, informe.protagonistIndex) || informe.content?.nombre || '',
      color: PROTAGONIST_COLOR,
      idx: informe.protagonistIndex,
    },
    ...compareIdxs.map((idx, i) => ({ name: getRowName(informe, idx), color: COMPARE_COLORS[i], idx })),
  ]

  const sourceKeys = informe.charts.radar.length > 0 ? informe.charts.radar : informe.charts.bar
  const keys = sourceKeys.filter(key => defs.some(d => d.key === key))

  const rows: ComparisonTableRow[] = keys.map(key => {
    const def = defs.find(d => d.key === key)!
    const col = matrix[key] ?? []
    const raw = players.map(p => col[p.idx] ?? null)

    let bestIdx: number | null = null
    raw.forEach((v, i) => {
      if (v == null || Number.isNaN(v)) return
      if (bestIdx == null) { bestIdx = i; return }
      const bestVal = raw[bestIdx]!
      if (def.higherIsBetter ? v > bestVal : v < bestVal) bestIdx = i
    })

    const cells = raw.map((v, i) => ({ value: formatComparisonValue(v, def), best: i === bestIdx }))
    return { label: def.label, cells }
  })

  return { players, rows }
}

// ---------------------------------------------------------------------------
// rating gauge helpers
// ---------------------------------------------------------------------------

/** Parsea un rating escrito a mano ("7,4", "82", "8.1/10" → toma el primer número). null si no hay número. */
export function parseRating(raw: string | null | undefined): number | null {
  if (!raw) return null
  const m = String(raw).replace(',', '.').match(/-?\d+(\.\d+)?/)
  if (!m) return null
  const n = Number(m[0])
  return Number.isFinite(n) ? n : null
}

/** Escala automática del gauge: ≤10 → sobre 10 (tipo partido); si no, sobre 100 (Score GG). */
export function ratingMax(value: number): number {
  return value <= 10 ? 10 : 100
}

/**
 * Las métricas donde el jugador más destaca (percentil alto) entre las `keys`
 * de un gráfico. Sirve para el "Destaca en: ..." de la mini-explicación.
 */
export function topStrengths(stats: MetricStat[], keys: string[], n = 3): string[] {
  return keys
    .map(k => stats.find(s => s.def.key === k))
    .filter((s): s is MetricStat => !!s && s.percentile != null && (s.percentile ?? 0) >= 60)
    .sort((a, b) => (b.percentile ?? 0) - (a.percentile ?? 0))
    .slice(0, n)
    .map(s => s.def.label)
}

// ---------------------------------------------------------------------------
// comparisonWinCounts
// ---------------------------------------------------------------------------

export interface ComparisonWins { name: string; color: string; wins: number }

/** Cuenta cuántas métricas gana cada jugador en la tabla de comparación (marca `best`). */
export function comparisonWinCounts(
  table: ComparisonTableResult,
): { wins: ComparisonWins[]; total: number } {
  const wins: ComparisonWins[] = table.players.map(p => ({ name: p.name, color: p.color, wins: 0 }))
  table.rows.forEach(row =>
    row.cells.forEach((cell, i) => {
      if (cell.best && wins[i]) wins[i].wins++
    }),
  )
  return { wins, total: table.rows.length }
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
      avgPct: stat.avgPercentile,
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
  xHigherIsBetter: boolean
  yHigherIsBetter: boolean
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
  const xDef = defs.find(d => d.key === scatter.xKey)
  const yDef = defs.find(d => d.key === scatter.yKey)
  const xLabel = xDef?.label ?? scatter.xKey
  const yLabel = yDef?.label ?? scatter.yKey

  const points: { x: number; y: number; me: boolean }[] = []
  const len = Math.max(xCol.length, yCol.length)
  for (let i = 0; i < len; i++) {
    const x = xCol[i]
    const y = yCol[i]
    if (x == null || y == null || Number.isNaN(x) || Number.isNaN(y)) continue
    points.push({ x, y, me: i === protagonistIndex })
  }

  return {
    points,
    xLabel,
    yLabel,
    xMin: scatter.xMin,
    yMin: scatter.yMin,
    xHigherIsBetter: xDef?.higherIsBetter ?? true,
    yHigherIsBetter: yDef?.higherIsBetter ?? true,
  }
}

// ---------------------------------------------------------------------------
// suggestAxisFloor
// ---------------------------------------------------------------------------

/**
 * Sugiere un piso ("mín") razonable para un eje de scatter a partir de sus
 * valores reales: el mínimo de la columna, redondeado hacia abajo a 1
 * decimal. Sirve solo como sugerencia visual (placeholder) en el input de
 * "X mín"/"Y mín" — el usuario puede dejarlo en blanco para el ajuste
 * automático (ver `scatterDomain`). Devuelve `null` si no hay datos.
 */
export function suggestAxisFloor(col: (number | null)[]): number | null {
  const values = col.filter((v): v is number => v != null && !Number.isNaN(v))
  if (values.length === 0) return null
  return Math.floor(Math.min(...values) * 10) / 10
}
