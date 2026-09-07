import { groupRows } from '@/lib/pdf/groupRows'
import { parseNumber } from './normalize'
import type { PdfCell, PdfRow, PdfTextItem } from '../types'

export interface OcrWord {
  text: string
  bbox: { x0: number; y0: number; x1: number; y1: number }
}

/** Altura mínima de palabra para que un word espurio de 1px no achique la tolerancia. */
const MIN_WORD_HEIGHT = 4

/**
 * Unidades sueltas que el OCR reconoce pegadas al número o a la etiqueta (ej. "m."
 * al lado de "10480"). No aportan nada — la unidad ya la define la métrica en la
 * hoja — y si quedan como celda propia rompen el conteo entre la fila de títulos y
 * la de valores de `buildCardTable`, así que se descartan antes de armar filas.
 */
const UNIT_TOKEN_RE = /^(m\.?|km\/h|kg|%|count|s|sec|seg|min)$/i

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

/**
 * Palabras de OCR (Tesseract) → mismo shape que `extractPdfItems` para PDF, así se
 * reutiliza el resto del pipeline (`groupRows`, `buildTable`, `buildCardTable`) tal
 * cual. La `y` de PDF crece hacia arriba; los píxeles de una imagen crecen hacia
 * abajo, así que acá se invierte con el signo.
 */
export function ocrWordsToItems(words: OcrWord[]): PdfTextItem[] {
  return words
    .map(w => ({ str: w.text.trim(), x: w.bbox.x0, y: -w.bbox.y0, width: w.bbox.x1 - w.bbox.x0, page: 1 }))
    .filter(item => item.str.length > 0 && !UNIT_TOKEN_RE.test(item.str))
}

const isNumericCell = (text: string): boolean => parseNumber(text) !== null

/**
 * Junta celdas de texto contiguas de una fila en una sola (ej. "HSR" + "DISTANCE" →
 * "HSR DISTANCE"): el OCR reconoce palabra por palabra, y una etiqueta de una
 * tarjeta suele tener varias ("MAX SPEED"). También junta un número "encajado" con
 * texto a ambos lados (ej. "ACCELERATIONS" + "3" + "M/S2" → "ACCELERATIONS 3 M/S2":
 * el umbral ">3" del nombre de la métrica) — pero nunca dos celdas donde alguna de
 * las dos NO tiene texto pegado de los dos lados, que es lo que pasa entre columnas
 * de valores reales de una tabla multi-jugador (esas sí deben quedar separadas).
 */
function mergeTextCells(cells: PdfCell[], gap: number): PdfCell[] {
  if (cells.length === 0) return cells
  const merged: PdfCell[] = [cells[0]]
  for (let i = 1; i < cells.length; i++) {
    const prev = merged[merged.length - 1]
    const cur = cells[i]
    if (cur.x - (prev.x + prev.width) > gap) { merged.push(cur); continue }

    const prevIsText = !isNumericCell(prev.text)
    const curIsText = !isNumericCell(cur.text)
    const next = cells[i + 1]
    const sandwiched = prevIsText && !curIsText && next
      && !isNumericCell(next.text) && (next.x - (cur.x + cur.width)) <= gap

    if ((prevIsText && curIsText) || sandwiched) {
      const right = Math.max(prev.x + prev.width, cur.x + cur.width)
      merged[merged.length - 1] = { text: `${prev.text} ${cur.text}`, x: prev.x, width: right - prev.x, center: prev.x + (right - prev.x) / 2 }
    } else {
      merged.push(cur)
    }
  }
  return merged
}

/**
 * Agrupa palabras de OCR en filas y reconstruye etiquetas de varias palabras por
 * celda. A diferencia de un PDF (puntos, tolerancia fija), acá la escala son
 * píxeles de la imagen — varía con la resolución de la foto — así que la tolerancia
 * de fila y la de fusión de celdas se calculan relativas a la altura típica de una
 * palabra reconocida.
 */
export function ocrWordsToRows(words: OcrWord[]): PdfRow[] {
  if (words.length === 0) return []
  const heights = words.map(w => Math.max(w.bbox.y1 - w.bbox.y0, MIN_WORD_HEIGHT))
  const typicalHeight = median(heights)
  const rowTolerance = Math.max(typicalHeight * 0.6, MIN_WORD_HEIGHT)
  const mergeGap = Math.max(typicalHeight * 1.2, MIN_WORD_HEIGHT)

  const rows = groupRows(ocrWordsToItems(words), rowTolerance)
  return rows.map(row => ({ ...row, cells: mergeTextCells(row.cells, mergeGap) }))
}
