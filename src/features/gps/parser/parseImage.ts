import { createWorker, PSM } from 'tesseract.js'
import { buildTable } from './buildTable'
import { buildCardTable } from './parseCardReport'
import { buildParseResult, type BuildParseResultOptions } from './buildParseResult'
import { ocrWordsToRows, type OcrWord } from './ocrRows'
import { GpsParseError } from './errors'
import type { GpsParseResult } from '../types'

export interface ImageParseOptions extends BuildParseResultOptions {
  /**
   * fullName del jugador elegido de antemano en la UI. Las tarjetas de un solo
   * jugador (foto + tiles de métricas, ej. PlayerTek) no traen de dónde deducir el
   * jugador, así que sin esto sólo se intenta la tabla multi-jugador.
   */
  presetPlayerName?: string
  /** Idiomas para el OCR. Por default inglés + español, que cubre los formatos vistos. */
  langs?: string[]
}

export interface OcrReader {
  read: (image: Blob | HTMLCanvasElement) => Promise<OcrWord[]>
  close: () => Promise<void>
}

/**
 * Un worker de OCR reutilizable para varias imágenes (ej. todas las páginas de un
 * PDF escaneado): crearlo es lo caro. `sparse` busca texto suelto por toda la
 * imagen en vez de párrafos, que es lo que mejor lee los números de un gráfico.
 */
export async function createOcrReader(langs: string[] = ['eng', 'spa'], opts: { sparse?: boolean } = {}): Promise<OcrReader> {
  const worker = await createWorker(langs)
  if (opts.sparse) await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT })
  return {
    read: async image => ((await worker.recognize(image)).data.words ?? []) as OcrWord[],
    close: async () => { await worker.terminate() },
  }
}

async function recognizeWords(file: Blob, langs: string[]): Promise<OcrWord[]> {
  const reader = await createOcrReader(langs)
  try {
    return await reader.read(file)
  } finally {
    await reader.close()
  }
}

/**
 * Imagen (foto/captura de una tarjeta o tabla de GPS) → propuesta de carga. Mismo
 * contrato que `parseGpsPdf`: no persiste nada, la UI muestra el resultado y el
 * usuario corrige antes de guardar. El OCR corre en el navegador (gratis, sin mandar
 * la imagen a ningún servidor); la primera vez descarga los datos de reconocimiento.
 */
export async function parseGpsImage(file: Blob, opts: ImageParseOptions): Promise<GpsParseResult> {
  let words: OcrWord[]
  try {
    words = await recognizeWords(file, opts.langs ?? ['eng', 'spa'])
  } catch (err) {
    throw new GpsParseError(`No se pudo leer la imagen: ${(err as Error).message}`)
  }

  if (words.length === 0) {
    throw new GpsParseError('No se reconoció texto en la imagen. Probá con una foto más nítida o cargalo a mano.')
  }

  const rows = ocrWordsToRows(words)
  const table = buildTable(rows) ?? (opts.presetPlayerName ? buildCardTable(rows, opts.presetPlayerName) : null)
  if (!table) {
    throw new GpsParseError(
      opts.presetPlayerName
        ? 'No encontré una tabla ni tarjetas de métricas en la imagen. Revisá la foto o cargalo a mano.'
        : 'No encontré una tabla de jugadores en la imagen. Si es la tarjeta de un solo jugador, elegilo arriba antes de cargar el archivo.',
    )
  }

  return buildParseResult(table, opts)
}
