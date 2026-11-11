/** Brillo promedio por debajo del cual la imagen se considera de fondo oscuro. */
const DARK_BACKGROUND = 110

/** En fondo oscuro, sólo lo casi blanco es texto: barras de color y grillas quedan afuera. */
const TEXT_MIN_BRIGHTNESS = 200

const luminance = (r: number, g: number, b: number): number => 0.299 * r + 0.587 * g + 0.114 * b

/**
 * Prepara una página (RGBA, como `ImageData.data`) para el OCR, en el lugar. Los
 * reportes de diseño oscuro (texto blanco sobre azul, valores dentro de barras de
 * color) se pasan a texto negro sobre blanco y nada más: así Tesseract lee los
 * números sin confundirse con las barras. Una página clara (escaneo común) no se toca.
 * Devuelve true si la convirtió.
 */
export function prepareOcrImage(rgba: Uint8ClampedArray): boolean {
  let total = 0
  const pixels = rgba.length / 4
  for (let i = 0; i < rgba.length; i += 4) total += luminance(rgba[i], rgba[i + 1], rgba[i + 2])
  if (pixels === 0 || total / pixels >= DARK_BACKGROUND) return false

  for (let i = 0; i < rgba.length; i += 4) {
    const v = luminance(rgba[i], rgba[i + 1], rgba[i + 2]) > TEXT_MIN_BRIGHTNESS ? 0 : 255
    rgba[i] = rgba[i + 1] = rgba[i + 2] = v
    rgba[i + 3] = 255
  }
  return true
}

/** Lado de cada bloque que se evalúa por separado al buscar zonas oscuras. */
export const DARK_TILE_SIZE = 16

/** Brillo promedio por debajo del cual un bloque se considera fondo oscuro. */
const DARK_TILE = 100

/**
 * Hasta cuántos bloques de distancia se rellena un hueco dentro de una banda oscura:
 * a lo ancho, una palabra larga; a lo alto, poco, para no unir dos bandas separadas
 * por un título.
 */
const FILL_REACH_X = 4
const FILL_REACH_Y = 1

export interface DarkMask {
  cols: number
  rows: number
  cells: Uint8Array
}

/**
 * Zonas de fondo oscuro de una imagen clara (encabezados de tabla con texto blanco
 * sobre una banda azul, etiquetas resaltadas). Los bloques con mucho texto blanco no
 * llegan a verse oscuros: se suman si tienen bloques oscuros a los dos lados.
 * Devuelve null si no hay ninguna.
 */
export function darkRegionMask(rgba: Uint8ClampedArray, width: number, height: number): DarkMask | null {
  const cols = Math.ceil(width / DARK_TILE_SIZE)
  const rows = Math.ceil(height / DARK_TILE_SIZE)
  const dark = new Uint8Array(cols * rows)
  let any = false
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      const yEnd = Math.min((ty + 1) * DARK_TILE_SIZE, height)
      const xEnd = Math.min((tx + 1) * DARK_TILE_SIZE, width)
      let sum = 0
      for (let y = ty * DARK_TILE_SIZE; y < yEnd; y++) {
        for (let x = tx * DARK_TILE_SIZE; x < xEnd; x++) {
          const i = (y * width + x) * 4
          sum += luminance(rgba[i], rgba[i + 1], rgba[i + 2])
        }
      }
      if (sum / ((yEnd - ty * DARK_TILE_SIZE) * (xEnd - tx * DARK_TILE_SIZE)) < DARK_TILE) { dark[ty * cols + tx] = 1; any = true }
    }
  }
  if (!any) return null

  const isDark = (tx: number, ty: number) => tx >= 0 && ty >= 0 && tx < cols && ty < rows && dark[ty * cols + tx] === 1
  const darkWithin = (tx: number, ty: number, dx: number, dy: number) => {
    for (let k = 1; k <= (dx ? FILL_REACH_X : FILL_REACH_Y); k++) if (isDark(tx + dx * k, ty + dy * k)) return true
    return false
  }
  const cells = Uint8Array.from(dark)
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      if (dark[ty * cols + tx]) continue
      if ((darkWithin(tx, ty, -1, 0) && darkWithin(tx, ty, 1, 0)) || (darkWithin(tx, ty, 0, -1) && darkWithin(tx, ty, 0, 1))) {
        cells[ty * cols + tx] = 1
      }
    }
  }
  return { cols, rows, cells }
}

/** ¿El punto (en píxeles) cae en una zona oscura? */
export function inDarkRegion(mask: DarkMask, x: number, y: number): boolean {
  const tx = Math.floor(x / DARK_TILE_SIZE)
  const ty = Math.floor(y / DARK_TILE_SIZE)
  return tx >= 0 && ty >= 0 && tx < mask.cols && ty < mask.rows && mask.cells[ty * mask.cols + tx] === 1
}

interface Word { bbox: { x0: number; y0: number; x1: number; y1: number } }

/**
 * Junta dos lecturas de la misma imagen: la original (vale fuera de las zonas
 * oscuras) y la invertida (vale dentro). Cada palabra se asigna por su centro.
 */
export function mergeDarkRegionWords<W extends Word>(original: W[], inverted: W[], mask: DarkMask): W[] {
  const inside = (w: W) => inDarkRegion(mask, (w.bbox.x0 + w.bbox.x1) / 2, (w.bbox.y0 + w.bbox.y1) / 2)
  return [...original.filter(w => !inside(w)), ...inverted.filter(inside)]
}
