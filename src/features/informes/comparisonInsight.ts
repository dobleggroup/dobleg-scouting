import type { MetricDef } from './types'

export interface ComparisonRow {
  key: string
  label: string
  unit: MetricDef['unit']
  higherIsBetter: boolean
  valueA: number | null
  valueB: number | null
  displayA: string
  displayB: string
  /** null = falta algún valor, no se puede decidir. */
  winner: 'a' | 'b' | 'tie' | null
  /** 0-100: ancho de barra relativo al mayor de los dos (por |valor|). */
  pctA: number
  pctB: number
}

/** "0,48" / "71,8%" — coma decimal (es-AR), 1 decimal si es %, 2 si no. */
export function formatComparisonValue(value: number | null, unit: MetricDef['unit']): string {
  if (value == null) return '—'
  const decimals = unit === '%' ? 1 : 2
  const rounded = Number(value.toFixed(decimals))
  const text = rounded.toLocaleString('es-AR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  return unit === '%' ? `${text}%` : text
}

export function buildComparisonRows(
  keys: string[],
  defs: MetricDef[],
  matrix: Record<string, (number | null)[]>,
  idxA: number,
  idxB: number,
): ComparisonRow[] {
  const rows: ComparisonRow[] = []
  for (const key of keys) {
    const def = defs.find(d => d.key === key)
    if (!def) continue
    const valueA = matrix[key]?.[idxA] ?? null
    const valueB = matrix[key]?.[idxB] ?? null

    let winner: ComparisonRow['winner'] = null
    if (valueA != null && valueB != null) {
      if (valueA === valueB) winner = 'tie'
      else winner = def.higherIsBetter === (valueA > valueB) ? 'a' : 'b'
    }

    const maxAbs = Math.max(Math.abs(valueA ?? 0), Math.abs(valueB ?? 0)) || 1
    rows.push({
      key,
      label: def.label,
      unit: def.unit,
      higherIsBetter: def.higherIsBetter,
      valueA,
      valueB,
      displayA: formatComparisonValue(valueA, def.unit),
      displayB: formatComparisonValue(valueB, def.unit),
      winner,
      pctA: valueA != null ? Math.min(100, (Math.abs(valueA) / maxAbs) * 100) : 0,
      pctB: valueB != null ? Math.min(100, (Math.abs(valueB) / maxAbs) * 100) : 0,
    })
  }
  return rows
}

// Un eje donde uno de los dos vale casi nada (ej. 0,3 vs 3,0 → 10%) hace que ese
// vértice caiga casi en el centro y el polígono se vea "roto" — un pico clavado
// hacia adentro entre dos ejes altos. Pisando un mínimo se evita eso sin mentir:
// 0 real sigue siendo 0 (no tiene nada en esa métrica), sólo se levanta el piso
// de los valores chicos-pero-no-nulos para que la silueta quede prolija.
const RADAR_FLOOR = 18

function radarValue(pct: number): number {
  return pct > 0 && pct < RADAR_FLOOR ? RADAR_FLOOR : pct
}

/**
 * Datos para `radarSvg`: cada eje usa el valor de cada jugador escalado 0-100
 * relativo al mayor de los dos (mismo criterio que las barras) — con sólo 2
 * jugadores, un percentil dentro del pool sería binario (0 o 100) y no se vería
 * la magnitud real de la diferencia como en el radar de referencia.
 */
export function buildRadarSeries(
  rows: ComparisonRow[],
  nameA: string,
  nameB: string,
  colorA: string,
  colorB: string,
): { axes: string[]; series: { name: string; color: string; values: number[] }[] } {
  const withData = rows.filter(r => r.valueA != null && r.valueB != null)
  return {
    axes: withData.map(r => r.label),
    series: [
      { name: nameA, color: colorA, values: withData.map(r => radarValue(r.pctA)) },
      { name: nameB, color: colorB, values: withData.map(r => radarValue(r.pctB)) },
    ],
  }
}

export interface WinCounts { winsA: number; winsB: number; ties: number }

export function countWins(rows: ComparisonRow[]): WinCounts {
  let winsA = 0, winsB = 0, ties = 0
  for (const r of rows) {
    if (r.winner === 'a') winsA++
    else if (r.winner === 'b') winsB++
    else if (r.winner === 'tie') ties++
  }
  return { winsA, winsB, ties }
}

/** Diferencia relativa entre A y B (0 = iguales, 1 = uno es el doble del otro sobre la base más alta). */
function relativeMargin(row: ComparisonRow): number {
  const a = row.valueA ?? 0
  const b = row.valueB ?? 0
  const base = Math.max(Math.abs(a), Math.abs(b)) || 1
  return Math.abs(a - b) / base
}

/** Etiqueta legible para meter en una oración: "Goles/90" → "goles por 90". */
function naturalLabel(label: string): string {
  return label.replace(/\/90$/i, ' por 90').toLowerCase()
}

function joinNatural(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
}

const EVEN_THRESHOLD = 0.06

/**
 * Párrafo corto de "Perfil de rendimiento": en qué se destaca cada uno y en qué
 * están parejos. Genérico (sirve para cualquier set de métricas elegido) — no
 * pretende igualar la prosa a mano de un informe de referencia, resume las
 * métricas con más diferencia primero.
 */
export function buildInsightText(rows: ComparisonRow[], nameA: string, nameB: string): string {
  const decided = rows.filter(r => r.winner === 'a' || r.winner === 'b')
  const winsA = decided.filter(r => r.winner === 'a').sort((x, y) => relativeMargin(y) - relativeMargin(x))
  const winsB = decided.filter(r => r.winner === 'b').sort((x, y) => relativeMargin(y) - relativeMargin(x))
  const even = rows.filter(r => r.winner === 'tie' || (r.winner !== null && relativeMargin(r) < EVEN_THRESHOLD))

  const sentences: string[] = []
  if (winsA.length > 0) {
    const top = winsA.slice(0, 3).map(r => naturalLabel(r.label))
    sentences.push(`${nameA} se impone en ${winsA.length} de ${decided.length} métricas, sobre todo en ${joinNatural(top)}.`)
  }
  if (winsB.length > 0) {
    const top = winsB.slice(0, 3).map(r => naturalLabel(r.label))
    sentences.push(`${nameB} destaca en ${joinNatural(top)}.`)
  }
  if (even.length > 0) {
    const top = even.slice(0, 2).map(r => naturalLabel(r.label))
    sentences.push(`Están parejos en ${joinNatural(top)}.`)
  }
  return sentences.join(' ')
}
