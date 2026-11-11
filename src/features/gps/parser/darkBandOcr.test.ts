import { describe, it, expect } from 'vitest'
import { darkBands, readImageWords, type RawImage } from './darkBandOcr'
import { darkRegionMask } from './prepareOcrImage'
import { buildTable } from './buildTable'
import { ocrWordsToRows, type OcrWord } from './ocrRows'

/** Imagen blanca con una banda azul oscura (encabezado de tabla) entre y0 e y1. */
function imageWithBand(width: number, height: number, y0: number, y1: number): RawImage {
  const data = new Uint8ClampedArray(width * height * 4).fill(255)
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      data[i] = 20; data[i + 1] = 30; data[i + 2] = 70
    }
  }
  return { data, width, height }
}

const word = (text: string, x0: number, y0: number, x1: number, y1: number): OcrWord => ({ text, bbox: { x0, y0, x1, y1 } })

describe('lectura de encabezados claros sobre fondo oscuro', () => {
  it('encuentra la banda oscura y nada más', () => {
    const img = imageWithBand(320, 200, 32, 80)
    const mask = darkRegionMask(img.data, img.width, img.height)!
    expect(darkBands(mask, img.width, img.height)).toEqual([{ x: 0, y: 32, w: 320, h: 48 }])
    expect(darkRegionMask(imageWithBand(320, 200, 0, 0).data, 320, 200)).toBeNull()
  })

  it('toma de la banda la lectura invertida y del resto la original', async () => {
    const img = imageWithBand(320, 200, 32, 80)
    const calls: RawImage[] = []
    const ocr = async (i: RawImage) => {
      calls.push(i)
      if (calls.length === 1) return [word('basura', 10, 40, 60, 60), word('10.401', 100, 120, 150, 135)]
      // La banda llega agrandada al doble y con el texto blanco pasado a negro.
      expect(i.width).toBe(640)
      expect(i.data[0]).toBeGreaterThan(200)
      return [word('DISTANCIA', 180, 20, 300, 50)]
    }
    const words = await readImageWords(img, ocr)
    expect(words.map(w => w.text)).toEqual(['10.401', 'DISTANCIA'])
    expect(words[1].bbox).toEqual({ x0: 90, y0: 42, x1: 150, y1: 57 })
  })
})

describe('cabecera de foto con títulos en dos renglones', () => {
  it('arma cada título con los renglones de arriba y abajo y usa la grilla de los datos', () => {
    const words = [
      word('DIST', 315, 100, 355, 112),
      word('FUTBOLISTA', 20, 110, 140, 122), word('T', 180, 110, 190, 122), word('|DISTANCIA', 215, 110, 285, 122),
      word('REL/MIN', 305, 110, 365, 122), word('|', 372, 108, 374, 124), word('V', 395, 110, 405, 122), word('MAX', 410, 110, 440, 122),
      word('ACELE', 470, 119, 520, 131),
      word('DIST', 475, 100, 515, 112),
      word('PROMEDIO', 20, 150, 90, 162), word('EQUIPO', 95, 150, 140, 162), word('96', 180, 150, 195, 162), word('9.524', 230, 150, 270, 162), word('99', 310, 150, 325, 162), word('30,1', 400, 150, 430, 162), word('450', 480, 150, 505, 162),
      word('G.', 20, 180, 35, 192), word('Gonzalez', 40, 180, 100, 192), word('86', 180, 180, 195, 192), word('8.582', 230, 180, 270, 192), word('100', 305, 180, 330, 192), word('32,8', 400, 180, 430, 192), word('433', 480, 180, 505, 192),
      word('Cabrera', 20, 210, 80, 222), word('96', 180, 210, 195, 222), word('10.081', 225, 210, 275, 222), word('105', 305, 210, 330, 222), word('29,8', 400, 210, 430, 222), word('292', 480, 210, 505, 222),
    ]
    const table = buildTable(ocrWordsToRows(words))!
    expect(table.headers).toEqual(['FUTBOLISTA', 'T', 'DISTANCIA', 'DIST REL/MIN', 'V MAX', 'DIST ACELE'])
    expect(table.rows[0]).toEqual({ name: 'G. Gonzalez', values: [null, 86, 8582, 100, 32.8, 433] })
  })
})
