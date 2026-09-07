import { parseNumber, normalizeLabel } from './normalize'
import { groupRows, nearestColumn } from '@/lib/pdf/groupRows'
import type { PdfRow, PdfTable, PdfTableRow } from '../types'

export { groupRows }

/** Mínimo de valores numéricos para considerar que una fila es de datos. */
const MIN_NUMERIC_CELLS = 3

/**
 * Separación máxima entre líneas de una cabecera envuelta (ej. "Mts 20 -" /
 * "25 km/h" en dos renglones). Mayor que eso ya es texto suelto de otra cosa
 * (título del reporte, fecha) y no forma parte de la cabecera.
 */
const MAX_HEADER_LINE_GAP = 13

const HEADER_RE = /^(futbolista|jugador|player|nombre|name)$/
const AGGREGATE_RE = /^(%|sumatoria|total|promedio|equipo|valor|[12]\s*(er|do|°)?\s*tiempo)/

/** True si la fila es un promedio/subtotal del PDF y no un jugador. */
export function isAggregateRow(name: string): boolean {
  return AGGREGATE_RE.test(normalizeLabel(name))
}

/** True si la fila parece una fila de datos: nombre + varios valores numéricos. */
function looksLikeDataRow(row: PdfRow): boolean {
  const first = row.cells[0]
  if (!first || parseNumber(first.text) !== null || isAggregateRow(first.text)) return false
  const numeric = row.cells.slice(1).filter(c => parseNumber(c.text) !== null).length
  return numeric >= MIN_NUMERIC_CELLS
}

/**
 * `stopAtAggregate` corta la tabla en la primera fila de agregado ("Promedio", "1er
 * Tiempo") en vez de sólo saltearla: los reportes de sesión de Catapult repiten la
 * tabla completa por tramo (TOTAL, 1ER TIEMPO, 2DO TIEMPO, ENTRADA EN CALOR) en el
 * mismo PDF, y sin cortar se duplicarían los jugadores de los tramos siguientes.
 */
function collectDataRows(
  rows: PdfRow[], headerLength: number, centers: number[], stopAtAggregate = false,
): PdfTableRow[] {
  const dataRows: PdfTableRow[] = []
  for (const row of rows) {
    const first = row.cells[0]
    if (!first) continue
    if (parseNumber(first.text) !== null) continue   // fila de valores sin nombre
    if (isAggregateRow(first.text)) {
      if (stopAtAggregate) break
      continue
    }

    const values: (number | null)[] = new Array(headerLength).fill(null)
    let numeric = 0
    for (const cell of row.cells.slice(1)) {
      const n = parseNumber(cell.text)
      if (n === null) continue
      const col = nearestColumn(centers, cell.center)
      if (col === 0) continue
      values[col] = n
      numeric++
    }
    if (numeric < MIN_NUMERIC_CELLS) continue

    dataRows.push({ name: first.text, values })
  }
  return dataRows
}

function preambleLinesBefore(rows: PdfRow[], endIndex: number): string[] {
  return rows
    .slice(0, endIndex)
    .map(r => r.cells.map(c => c.text).join(' ').trim())
    .filter(Boolean)
}

/**
 * Reconstruye la tabla a partir de la primera fila con una celda "Futbolista"/"Jugador".
 * Cada valor se asigna a la columna cuyo centro está más cerca, que es estable aunque
 * las cabeceras estén alineadas a la izquierda y los números a la derecha.
 */
function buildExplicitHeaderTable(rows: PdfRow[]): PdfTable | null {
  // La cabecera necesita al menos una columna de métrica además del nombre: un
  // reporte "individual" (una tarjeta por jugador, sin tabla) puede tener una celda
  // suelta "JUGADOR" que matchea el label pero no es cabecera de nada.
  const headerIndex = rows.findIndex(r =>
    r.cells.length >= 2 && r.cells.some(c => HEADER_RE.test(normalizeLabel(c.text))))
  if (headerIndex < 0) return null

  const headerRow = rows[headerIndex]
  const headers = headerRow.cells.map(c => c.text)
  const centers = headerRow.cells.map(c => c.center)

  return {
    headers,
    rows: collectDataRows(rows.slice(headerIndex + 1), headers.length, centers),
    preambleLines: preambleLinesBefore(rows, headerIndex),
  }
}

/**
 * Reconstruye la tabla de reportes (ej. "Reporte Sesión" de Catapult) cuya columna
 * de nombre no trae etiqueta: la cabecera queda envuelta en varias líneas justo
 * arriba de la primera fila de datos ("Mts 20 -" / "25 km/h"), sin ninguna celda
 * "Jugador"/"Futbolista" que la delate. Se ubica primero la fila de datos (nombre +
 * valores numéricos) y se arma la cabecera juntando las líneas pegadas arriba,
 * usando las columnas de esa fila de datos como grilla (la cabecera en sí no tiene
 * columna de nombre).
 */
function buildBlankHeaderTable(rows: PdfRow[]): PdfTable | null {
  const dataIndex = rows.findIndex(looksLikeDataRow)
  if (dataIndex <= 0) return null

  let start = dataIndex - 1
  for (let i = start - 1; i >= 0; i--) {
    // `y` crece hacia arriba, así que la fila de más arriba tiene el `y` más grande.
    const gap = rows[i].y - rows[i + 1].y
    if (gap > MAX_HEADER_LINE_GAP) break
    start = i
  }

  const centers = rows[dataIndex].cells.map(c => c.center)
  const headers = new Array(centers.length).fill('')
  for (const row of rows.slice(start, dataIndex)) {
    for (const cell of row.cells) {
      const col = nearestColumn(centers, cell.center)
      headers[col] = headers[col] ? `${headers[col]} ${cell.text}` : cell.text
    }
  }

  const dataRows = collectDataRows(rows.slice(dataIndex), headers.length, centers, true)
  // Sin cabecera explícita "Jugador"/"Futbolista" que lo confirme, una sola fila de
  // datos es más probable que sea una coincidencia de layout (ej. las tarjetas de un
  // reporte OpenField individual) que una tabla real; una tabla real trae varios jugadores.
  if (dataRows.length < 2) return null

  return { headers, rows: dataRows, preambleLines: preambleLinesBefore(rows, start) }
}

export function buildTable(rows: PdfRow[]): PdfTable | null {
  return buildExplicitHeaderTable(rows) ?? buildBlankHeaderTable(rows)
}
