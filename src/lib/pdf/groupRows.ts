import type { PdfTextItem } from './extractPdfItems'

export interface PdfCell { text: string; x: number; width: number; center: number }
export interface PdfRow { page: number; y: number; cells: PdfCell[] }

/** Dos textos con menos de esta diferencia de línea de base son la misma fila. */
const ROW_TOLERANCE = 3

function toCell(item: PdfTextItem): PdfCell {
  return { text: item.str, x: item.x, width: item.width, center: item.x + item.width / 2 }
}

/**
 * Agrupa los items en filas por línea de base, de arriba hacia abajo. `tolerance`
 * es configurable porque el OCR de imágenes (ver `ocrRows.ts`) trabaja en píxeles,
 * una escala muy distinta a los puntos de un PDF; el default sigue sirviendo para PDF.
 */
export function groupRows(items: PdfTextItem[], tolerance: number = ROW_TOLERANCE): PdfRow[] {
  const sorted = [...items].sort((a, b) => (a.page - b.page) || (b.y - a.y) || (a.x - b.x))
  const rows: PdfRow[] = []
  for (const it of sorted) {
    const last = rows[rows.length - 1]
    if (last && last.page === it.page && Math.abs(last.y - it.y) <= tolerance) {
      last.cells.push(toCell(it))
    } else {
      rows.push({ page: it.page, y: it.y, cells: [toCell(it)] })
    }
  }
  for (const row of rows) row.cells.sort((a, b) => a.x - b.x)
  return rows
}

export function nearestColumn(centers: number[], center: number): number {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < centers.length; i++) {
    const dist = Math.abs(centers[i] - center)
    if (dist < bestDist) { bestDist = dist; best = i }
  }
  return best
}
