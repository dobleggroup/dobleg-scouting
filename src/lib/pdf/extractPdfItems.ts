export interface PdfTextItem {
  str: string
  x: number
  y: number
  width: number
  page: number
}

interface ExtractOptions {
  /** URL del worker. En el browser hay que pasarla; en Node se usa el fake worker. */
  workerSrc?: string
}

/**
 * Abre el PDF y devuelve todos los textos con sus coordenadas. Se usa la posición y
 * no el orden de lectura: en estos PDFs el orden viene por columnas y no sirve.
 * `y` es la línea de base en espacio PDF (crece hacia arriba).
 */
export async function extractPdfItems(
  data: ArrayBuffer,
  opts: ExtractOptions = {},
): Promise<PdfTextItem[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  if (opts.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = opts.workerSrc

  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise
  const items: PdfTextItem[] = []

  try {
    for (let page = 1; page <= doc.numPages; page++) {
      const p = await doc.getPage(page)
      const content = await p.getTextContent()
      for (const item of content.items as Array<Record<string, unknown>>) {
        const str = typeof item.str === 'string' ? item.str : ''
        if (!str.trim()) continue
        const transform = item.transform as number[] | undefined
        if (!transform) continue
        items.push({
          str: str.trim(),
          x: transform[4],
          y: transform[5],
          width: typeof item.width === 'number' ? item.width : 0,
          page,
        })
      }
      p.cleanup()
    }
  } finally {
    await doc.destroy()
  }

  return items
}
