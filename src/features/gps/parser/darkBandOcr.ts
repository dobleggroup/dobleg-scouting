import type { OcrWord } from './ocrRows'
import { DARK_TILE_SIZE as TILE, darkRegionMask, inDarkRegion, mergeDarkRegionWords, type DarkMask } from './prepareOcrImage'

export interface RawImage {
  data: Uint8ClampedArray<ArrayBuffer>
  width: number
  height: number
}

/** Lector de OCR sobre píxeles RGBA (en el navegador pasa por un canvas). */
export type RawOcr = (image: RawImage) => Promise<OcrWord[]>

/** Bandas más chicas que esto (en bloques) son manchas, no encabezados. */
const MIN_BAND_CELLS = 3

/** Las bandas se agrandan antes del OCR: el texto de encabezado suele ser chico. */
const BAND_SCALE = 2

interface Rect { x: number; y: number; w: number; h: number }

/** Rectángulos (en píxeles) de cada zona oscura conectada. */
export function darkBands(mask: DarkMask, width: number, height: number): Rect[] {
  const seen = new Uint8Array(mask.cells.length)
  const rects: Rect[] = []
  for (let start = 0; start < mask.cells.length; start++) {
    if (!mask.cells[start] || seen[start]) continue
    let [minX, minY, maxX, maxY, count] = [Infinity, Infinity, -1, -1, 0]
    const stack = [start]
    seen[start] = 1
    while (stack.length) {
      const c = stack.pop()!
      const tx = c % mask.cols
      const ty = Math.floor(c / mask.cols)
      count++
      minX = Math.min(minX, tx); maxX = Math.max(maxX, tx)
      minY = Math.min(minY, ty); maxY = Math.max(maxY, ty)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = tx + dx
        const ny = ty + dy
        if (nx < 0 || ny < 0 || nx >= mask.cols || ny >= mask.rows) continue
        const n = ny * mask.cols + nx
        if (mask.cells[n] && !seen[n]) { seen[n] = 1; stack.push(n) }
      }
    }
    if (count < MIN_BAND_CELLS) continue
    const x = minX * TILE
    const y = minY * TILE
    rects.push({ x, y, w: Math.min((maxX + 1) * TILE, width) - x, h: Math.min((maxY + 1) * TILE, height) - y })
  }
  return rects
}

/** Recorte de una banda: zonas oscuras invertidas (texto blanco → negro), en grises y agrandado. */
function bandImage(src: RawImage, mask: DarkMask, r: Rect): RawImage {
  const gray = new Float32Array(r.w * r.h)
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const i = ((r.y + y) * src.width + r.x + x) * 4
      const l = 0.299 * src.data[i] + 0.587 * src.data[i + 1] + 0.114 * src.data[i + 2]
      gray[y * r.w + x] = inDarkRegion(mask, r.x + x, r.y + y) ? 255 - l : l
    }
  }
  const width = r.w * BAND_SCALE
  const height = r.h * BAND_SCALE
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const sy = Math.min(Math.max((y + 0.5) / BAND_SCALE - 0.5, 0), r.h - 1)
    const y0 = Math.floor(sy)
    const y1 = Math.min(y0 + 1, r.h - 1)
    const fy = sy - y0
    for (let x = 0; x < width; x++) {
      const sx = Math.min(Math.max((x + 0.5) / BAND_SCALE - 0.5, 0), r.w - 1)
      const x0 = Math.floor(sx)
      const x1 = Math.min(x0 + 1, r.w - 1)
      const fx = sx - x0
      const top = gray[y0 * r.w + x0] * (1 - fx) + gray[y0 * r.w + x1] * fx
      const bottom = gray[y1 * r.w + x0] * (1 - fx) + gray[y1 * r.w + x1] * fx
      const v = top * (1 - fy) + bottom * fy
      const o = (y * width + x) * 4
      data[o] = data[o + 1] = data[o + 2] = v
      data[o + 3] = 255
    }
  }
  return { data, width, height }
}

/**
 * OCR de una foto o captura. Tesseract no lee texto claro sobre fondo oscuro (el
 * encabezado azul de muchas tablas), así que esas bandas se leen aparte: recortadas,
 * invertidas y agrandadas. El resto sale de la lectura de la imagen tal cual, para
 * no cambiar cómo se leen los números.
 */
export async function readImageWords(image: RawImage, ocr: RawOcr): Promise<OcrWord[]> {
  const words = await ocr(image)
  const mask = darkRegionMask(image.data, image.width, image.height)
  if (!mask) return words
  const bandWords: OcrWord[] = []
  for (const r of darkBands(mask, image.width, image.height)) {
    for (const w of await ocr(bandImage(image, mask, r))) {
      bandWords.push({
        ...w,
        bbox: {
          x0: r.x + w.bbox.x0 / BAND_SCALE,
          y0: r.y + w.bbox.y0 / BAND_SCALE,
          x1: r.x + w.bbox.x1 / BAND_SCALE,
          y1: r.y + w.bbox.y1 / BAND_SCALE,
        },
      })
    }
  }
  return mergeDarkRegionWords(words, bandWords, mask)
}
