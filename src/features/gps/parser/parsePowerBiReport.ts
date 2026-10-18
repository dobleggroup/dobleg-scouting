import { parseNumber } from './normalize'
import type { PdfRow, PdfTable, PdfTableRow } from '../types'

/**
 * Separa las dos columnas (Primer/Segundo Tiempo) de la página por posición X.
 * Calibrado contra las coordenadas reales del reporte "Reporte jugador" de Power
 * BI/Catapult: las celdas de PT caen en x 33-227, las de ST en x 348-546.
 */
const HALF_WIDTH_X = 290

const SECTION_STOP = ['cargas locomotivas', 'cargas mecánicas', 'cargas mecanicas']
const CONTEXT_LABELS = ['instancia', 'rival', 'torneo', 'estadio']
const MAX_LABEL_VALUE_DIST = 150

/** Power BI escribe "(En blanco)" en el tiempo que el jugador no jugó (entró en el
 * segundo tiempo o salió en el entretiempo): es un valor vacío, no una etiqueta. */
const BLANK_VALUES = new Set(['(en blanco)', '(blank)', 'en blanco', '-', '—', '–'])
const isBlank = (text: string) => BLANK_VALUES.has(text.trim().toLowerCase())
const isNumberOrBlank = (text: string) => parseNumber(text) !== null || isBlank(text)

function isLabelRow(row: PdfRow): boolean {
  return row.cells.length >= 2 && row.cells.every(c => parseNumber(c.text) === null && !isBlank(c.text))
}

function isValueRow(row: PdfRow, width: number): boolean {
  return row.cells.length === width && row.cells.every(c => isNumberOrBlank(c.text))
}

function side(x: number): 'PT' | 'ST' {
  return x < HALF_WIDTH_X ? 'PT' : 'ST'
}

/** Página con "Primer Tiempo", "Segundo Tiempo" y "Minutos jugados" — la plantilla
 * siempre trae el detalle del partido ahí. Primer Tiempo y Segundo Tiempo tienen que
 * estar en la MISMA fila (no solo en la misma página): es la condición que ya usa el
 * bloque de "Minutos jugados" más abajo, y evita falsos positivos con otra plantilla
 * que mencione las tres frases pero en un layout distinto. */
function findAnchorPage(rows: PdfRow[]): number | null {
  const pages = [...new Set(rows.map(r => r.page))]
  for (const page of pages) {
    const pageRows = rows.filter(r => r.page === page)
    const text = pageRows.map(r => r.cells.map(c => c.text.toLowerCase()).join(' ')).join(' ')
    if (!text.includes('primer tiempo') || !text.includes('segundo tiempo') || !text.includes('minutos jugados')) continue
    const sameRow = pageRows.some(r =>
      r.cells.some(c => c.text.trim().toLowerCase() === 'primer tiempo') &&
      r.cells.some(c => c.text.trim().toLowerCase() === 'segundo tiempo'))
    if (sameRow) return page
  }
  return null
}

/** "Instancia:"/"Rival:"/"Torneo:"/"Estadio:" → "Rival: River Plate", una línea por
 * etiqueta encontrada. El valor es la celda más cercana en X (misma fila o la
 * siguiente), porque estas etiquetas comparten fila con otro texto que no es el valor
 * (ej. el dorsal del jugador). */
function extractContext(pageRows: PdfRow[]): string[] {
  const lines: string[] = []
  for (let i = 0; i < pageRows.length; i++) {
    for (const cell of pageRows[i].cells) {
      const norm = cell.text.trim().toLowerCase().replace(':', '')
      if (!CONTEXT_LABELS.includes(norm)) continue
      const candidates = [
        ...pageRows[i].cells.filter(c => c !== cell),
        ...(pageRows[i + 1]?.cells ?? []),
      ]
      const closest = candidates
        .map(c => ({ c, dist: Math.abs(c.x - cell.x) }))
        .sort((a, b) => a.dist - b.dist)[0]
      if (closest && closest.dist < MAX_LABEL_VALUE_DIST) {
        lines.push(`${cell.text.replace(':', '').trim()}: ${closest.c.text.trim()}`)
      }
    }
  }
  return lines
}

function addPtStHeaders(
  headers: string[], values: (number | null)[], seen: Map<string, number>,
  title: PdfRow, value: PdfRow,
) {
  for (let c = 0; c < title.cells.length; c++) {
    const label = `${title.cells[c].text.trim()} (${side(title.cells[c].x)})`
    const count = (seen.get(label) ?? 0) + 1
    seen.set(label, count)
    headers.push(count > 1 ? `${label} #${count}` : label)
    values.push(parseNumber(value.cells[c].text))
  }
}

/**
 * Lee la página de detalle de partido de un "Reporte jugador" de Power BI/Catapult
 * (uno por partido, gráficos con etiquetas repetidas Primer/Segundo Tiempo). Ignora a
 * propósito los gráficos de barras (Cargas Locomotivas/Mecánicas): sus etiquetas no
 * están alineadas con sus valores como para reconstruirlas con confianza.
 */
export function parsePowerBiReport(rows: PdfRow[], playerName: string): PdfTable | null {
  const page = findAnchorPage(rows)
  if (page === null) return null
  const pageRows = rows.filter(r => r.page === page)

  const headers: string[] = ['']
  const values: (number | null)[] = [null]
  const seen = new Map<string, number>()

  for (let i = 0; i < pageRows.length; i++) {
    const title = pageRows[i]
    const titleText = title.cells.map(c => c.text.trim().toLowerCase()).join(' ')
    if (SECTION_STOP.some(s => titleText.includes(s))) break

    const value = pageRows[i + 1]
    if (value && isLabelRow(title) && isValueRow(value, title.cells.length)) {
      addPtStHeaders(headers, values, seen, title, value)
      i++
    }
  }

  // "Minutos jugados": etiqueta sola, valor (PT, Total, ST) dos filas después.
  const tiemposRow = pageRows.find(r =>
    r.cells.some(c => c.text.trim().toLowerCase() === 'primer tiempo') &&
    r.cells.some(c => c.text.trim().toLowerCase() === 'segundo tiempo'))
  if (tiemposRow) {
    const idx = pageRows.indexOf(tiemposRow)
    const valueRow = pageRows[idx + 1]
    if (valueRow && valueRow.cells.length === 3 && valueRow.cells.every(c => isNumberOrBlank(c.text))) {
      const sorted = [...valueRow.cells].sort((a, b) => a.x - b.x)
      headers.push('Minutos jugados (PT)', 'Minutos jugados', 'Minutos jugados (ST)')
      values.push(parseNumber(sorted[0].text), parseNumber(sorted[1].text), parseNumber(sorted[2].text))
    }
  }

  // Sin ningún número leído no hay nada que cargar (mejor que una fila vacía).
  if (values.every(v => v === null)) return null

  const row: PdfTableRow = { name: playerName, values }
  return { headers, rows: [row], preambleLines: extractContext(pageRows) }
}
