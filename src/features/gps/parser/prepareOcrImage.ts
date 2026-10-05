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
