import { extractPdfItems } from '@/lib/pdf/extractPdfItems'
import { renderPdfPages } from '@/lib/pdf/renderPdfPages'
import { groupRows, buildTable } from './buildTable'
import { buildCardTable } from './parseCardReport'
import { parsePowerBiReport } from './parsePowerBiReport'
import { buildBarChartTable, mergeTables } from './parseBarChartReport'
import { buildParseResult, type BuildParseResultOptions } from './buildParseResult'
import { createOcrReader } from './parseImage'
import { ocrWordsToRows } from './ocrRows'
import { prepareOcrImage } from './prepareOcrImage'
import { GpsParseError } from './errors'
import type { GpsParseResult, PdfRow, PdfTable, PdfTextItem } from '../types'

export interface ParseOptions extends BuildParseResultOptions {
  workerSrc?: string
  /**
   * fullName del jugador elegido de antemano en la UI. Los reportes "individuales"
   * (una tarjeta por métrica, sin tabla) no traen de dónde deducir el jugador, así
   * que sin esto sólo se intenta la tabla multi-jugador.
   */
  presetPlayerName?: string
  /** Avance del OCR página por página, para PDFs que son imagen (puede tardar). */
  onProgress?: (page: number, numPages: number) => void
}

// Re-exportado para no romper los imports existentes (GpsUploadPage, tests).
export { GpsParseError }

/**
 * Archivo → propuesta de carga. No persiste nada: la UI muestra el resultado, el
 * usuario corrige y recién ahí se guarda.
 */
export async function parseGpsPdf(data: ArrayBuffer, opts: ParseOptions): Promise<GpsParseResult> {
  let items: PdfTextItem[]
  try {
    items = await extractPdfItems(data, { workerSrc: opts.workerSrc })
  } catch (err) {
    throw new GpsParseError(`No se pudo leer el PDF: ${(err as Error).message}`)
  }

  // PDF hecho de imágenes (escaneo, foto, reporte exportado como imagen): se lee
  // cada página con OCR en el navegador, igual que una foto.
  if (items.length === 0) return parseScannedPdf(data, opts)

  const rows = groupRows(items)
  const table = (opts.presetPlayerName ? parsePowerBiReport(rows, opts.presetPlayerName) : null)
    ?? buildTable(rows)
    ?? (opts.presetPlayerName ? buildCardTable(rows, opts.presetPlayerName) : null)
  if (!table) {
    throw new GpsParseError(
      opts.presetPlayerName
        ? 'No encontré una tabla ni tarjetas de métricas en el PDF. Revisá el archivo o cargalo a mano.'
        : 'No encontré una tabla de jugadores en el PDF. Si es un reporte individual de un solo jugador, elegilo arriba antes de cargar el archivo.',
    )
  }

  return buildParseResult(table, opts)
}

/** Texto de una página como líneas, para inferir el contexto del partido (título, rival). */
const pageLines = (rows: PdfRow[]): string[] =>
  rows.map(r => r.cells.map(c => c.text).join(' ').trim()).filter(Boolean)

async function ocrPages(data: ArrayBuffer, opts: ParseOptions): Promise<PdfRow[][]> {
  const reader = await createOcrReader(['eng', 'spa'], { sparse: true })
  const pages: PdfRow[][] = []
  try {
    for await (const { page, numPages, canvas } of renderPdfPages(data, { workerSrc: opts.workerSrc })) {
      opts.onProgress?.(page, numPages)
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
      if (prepareOcrImage(image.data)) ctx.putImageData(image, 0, 0)
      pages.push(ocrWordsToRows(await reader.read(canvas)))
    }
  } finally {
    await reader.close()
  }
  return pages
}

/**
 * PDF sin texto → OCR por página → una tabla por página que la tenga, unidas en una
 * sola (los reportes de diseño reparten las métricas en varias láminas). Primero se
 * prueban los reportes de barras, después una tabla común, y por último las
 * tarjetas de un solo jugador si se eligió uno.
 */
async function parseScannedPdf(data: ArrayBuffer, opts: ParseOptions): Promise<GpsParseResult> {
  let pages: PdfRow[][]
  try {
    pages = await ocrPages(data, opts)
  } catch (err) {
    throw new GpsParseError(`No se pudo leer el PDF escaneado: ${(err as Error).message}`)
  }

  if (pages.every(rows => rows.length === 0)) {
    throw new GpsParseError('No se reconoció texto en el PDF. Si es una foto borrosa, probá con una más nítida o cargalo a mano.')
  }

  const tablesFrom = (build: (rows: PdfRow[]) => PdfTable | null) => pages.map(rows => build(rows))
  let perPage = tablesFrom(buildBarChartTable)
  if (perPage.every(t => !t)) perPage = tablesFrom(buildTable)
  if (perPage.every(t => !t) && opts.presetPlayerName) {
    perPage = tablesFrom(rows => buildCardTable(rows, opts.presetPlayerName!))
  }

  const firstTable = perPage.findIndex(Boolean)
  const table = mergeTables(perPage.filter((t): t is PdfTable => t !== null))
  if (!table) {
    throw new GpsParseError(
      opts.presetPlayerName
        ? 'Leí el PDF pero no encontré una tabla ni tarjetas de métricas. Revisá el archivo o cargalo a mano.'
        : 'Leí el PDF pero no encontré una tabla de jugadores. Si es un reporte de un solo jugador, elegilo arriba antes de cargar el archivo.',
    )
  }

  // Las láminas anteriores a la primera tabla (la portada) suelen traer el partido.
  const cover = pages.slice(0, firstTable).flatMap(pageLines)
  return buildParseResult({ ...table, preambleLines: [...cover, ...table.preambleLines] }, opts)
}
