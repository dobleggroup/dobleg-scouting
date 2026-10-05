interface RenderOptions {
  workerSrc?: string
  /** Lado más largo de cada página renderizada, en píxeles. */
  maxSide?: number
}

/** A esta escala el OCR lee bien los números chicos de un reporte apaisado. */
const DEFAULT_MAX_SIDE = 3600

/** Tope de ampliación: una página A4 (595 pt) no necesita más de ~4x. */
const MAX_SCALE = 4

/**
 * Renderiza cada página del PDF a un canvas, de a una, para leerlas con OCR cuando
 * el PDF es una imagen (foto, escaneo o "imprimir como imagen") y no trae texto.
 * Sólo en el navegador: necesita `document` para crear el canvas.
 */
export async function* renderPdfPages(
  data: ArrayBuffer,
  opts: RenderOptions = {},
): AsyncGenerator<{ page: number; numPages: number; canvas: HTMLCanvasElement }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  if (opts.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = opts.workerSrc

  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise
  try {
    for (let page = 1; page <= doc.numPages; page++) {
      const p = await doc.getPage(page)
      const base = p.getViewport({ scale: 1 })
      const scale = Math.min(MAX_SCALE, (opts.maxSide ?? DEFAULT_MAX_SIDE) / Math.max(base.width, base.height))
      const viewport = p.getViewport({ scale })

      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) throw new Error('el navegador no permite dibujar el PDF')

      await p.render({ canvasContext: ctx, viewport }).promise
      p.cleanup()
      yield { page, numPages: doc.numPages, canvas }
    }
  } finally {
    await doc.destroy()
  }
}
