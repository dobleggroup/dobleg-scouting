import { nearestColumn } from '@/lib/pdf/groupRows'
import { normalizeLabel, parseNumber } from './normalize'
import type { PdfCell, PdfRow, PdfTable, PdfTableRow } from '../types'

const HAS_LETTER_RE = /\p{L}/u

/** Mínimo de valores por fila para que cuente como fila de jugador. */
const MIN_ROW_VALUES = 2

/**
 * Si más de esta fracción de filas tiene dos valores cayendo en la misma columna, la
 * página no es "un valor por métrica" (ej. la comparación PT vs ST, dos barras por
 * celda) y se descarta: mezclar esos valores daría números de un solo tiempo.
 */
const MAX_COLLISION_RATIO = 1 / 3

const hasLetters = (text: string): boolean => HAS_LETTER_RE.test(text)

/** "GUAJARDO PAOLO)" → "GUAJARDO PAOLO": el borde de la barra a veces se lee como signo. */
function cleanName(text: string): string {
  return text.replace(/^[^\p{L}]+|[^\p{L}.]+$/gu, '').trim()
}

/**
 * Junta en la cabecera un número corto pegado a la etiqueta anterior ("BANDA" + "4"
 * → "BANDA 4"). El OCR deja el número suelto y, sin esto, la fila de títulos parece
 * una fila de datos y las columnas quedan corridas.
 */
function mergeHeaderNumbers(cells: PdfCell[]): PdfCell[] {
  const merged: PdfCell[] = []
  for (const cell of cells) {
    const prev = merged[merged.length - 1]
    const isShortNumber = /^\d{1,2}$/.test(cell.text)
    if (prev && isShortNumber && hasLetters(prev.text) && cell.x - (prev.x + prev.width) < prev.width * 0.5) {
      const right = cell.x + cell.width
      merged[merged.length - 1] = { text: `${prev.text} ${cell.text}`, x: prev.x, width: right - prev.x, center: prev.x + (right - prev.x) / 2 }
    } else {
      merged.push(cell)
    }
  }
  return merged
}

function looksLikePlayerRow(row: PdfRow): boolean {
  const first = row.cells[0]
  if (!first || !hasLetters(first.text) || parseNumber(first.text) !== null) return false
  return row.cells.slice(1).filter(c => parseNumber(c.text) !== null).length >= MIN_ROW_VALUES
}

function looksLikeHeader(cells: PdfCell[]): boolean {
  return cells.length >= 3 && cells.filter(c => hasLetters(c.text)).length >= 3
}

/**
 * Reporte de barras horizontales escaneado (ej. "Audax Data": una fila por jugador,
 * una columna de barras por métrica, el valor escrito al final de cada barra). Se
 * lee como tabla, pero la grilla sale de los títulos de columna y no de una fila
 * de datos: el número va donde termina la barra, así que su posición horizontal
 * varía mucho de un jugador a otro. Una página = una tabla; la columna 0 es el nombre.
 */
export function buildBarChartTable(rows: PdfRow[]): PdfTable | null {
  for (let h = 0; h < rows.length - 1; h++) {
    const headerCells = mergeHeaderNumbers(rows[h].cells)
    if (!looksLikeHeader(headerCells)) continue

    const following = rows.slice(h + 1)
    if (!following.slice(0, 3).some(looksLikePlayerRow)) continue

    const headers = ['', ...headerCells.map(c => c.text)]
    const centers = headerCells.map(c => c.center)
    const dataRows: PdfTableRow[] = []
    let collisions = 0

    for (const row of following) {
      if (!looksLikePlayerRow(row)) continue
      const values: (number | null)[] = new Array(headers.length).fill(null)
      let collided = false
      for (const cell of row.cells.slice(1)) {
        const n = parseNumber(cell.text)
        if (n === null) continue
        const col = nearestColumn(centers, cell.center) + 1
        if (values[col] !== null) collided = true
        else values[col] = n
      }
      if (collided) collisions++
      dataRows.push({ name: cleanName(row.cells[0].text), values })
    }

    if (dataRows.length < 2 || collisions > dataRows.length * MAX_COLLISION_RATIO) return null

    const preambleLines = rows.slice(0, h).map(r => r.cells.map(c => c.text).join(' ').trim()).filter(Boolean)
    return { headers, rows: dataRows, preambleLines }
  }
  return null
}

/**
 * Une las tablas de varias páginas (ej. "Métricas de volumen" + "Métricas de
 * intensidad") en una sola: columnas por título y jugadores por nombre. Una columna
 * repetida en dos páginas ("TIEMPO") queda una vez; manda el valor de la primera
 * página que lo trae y las siguientes sólo completan huecos (si el OCR no leyó un
 * número en una página, puede haberlo leído en otra).
 */
export function mergeTables(tables: PdfTable[]): PdfTable | null {
  if (tables.length === 0) return null
  if (tables.length === 1) return tables[0]

  const headers: string[] = ['']
  const columnIndex = new Map<string, number>()
  const rowsByName = new Map<string, PdfTableRow>()
  const order: string[] = []

  for (const table of tables) {
    const mapping = table.headers.map((header, i) => {
      if (i === 0) return 0
      const key = normalizeLabel(header) || `#${headers.length}`
      let idx = columnIndex.get(key)
      if (idx === undefined) {
        idx = headers.length
        headers.push(header)
        columnIndex.set(key, idx)
      }
      return idx
    })

    for (const row of table.rows) {
      const key = normalizeLabel(row.name)
      let target = rowsByName.get(key)
      if (!target) {
        target = { name: row.name, values: [] }
        rowsByName.set(key, target)
        order.push(key)
      }
      row.values.forEach((v, i) => {
        if (i === 0 || v === null) return
        const idx = mapping[i]
        if (target!.values[idx] === undefined || target!.values[idx] === null) target!.values[idx] = v
      })
    }
  }

  const rows = order.map(key => {
    const row = rowsByName.get(key)!
    return { name: row.name, values: headers.map((_, i) => row.values[i] ?? null) }
  })
  return { headers, rows, preambleLines: tables.flatMap(t => t.preambleLines) }
}
