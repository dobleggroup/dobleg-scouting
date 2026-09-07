import { describe, it, expect } from 'vitest'
import { ocrWordsToItems, ocrWordsToRows, type OcrWord } from './ocrRows'
import { buildCardTable } from './parseCardReport'

const word = (text: string, x0: number, y0: number, x1: number, y1: number): OcrWord =>
  ({ text, bbox: { x0, y0, x1, y1 } })

describe('ocrWordsToItems', () => {
  it('descarta palabras vacías y unidades sueltas (m., km/h, count)', () => {
    const items = ocrWordsToItems([
      word('10480', 20, 440, 90, 460),
      word('m.', 95, 448, 115, 460),
      word('  ', 200, 440, 210, 460),
      word('km/h', 300, 440, 340, 460),
    ])
    expect(items.map(i => i.str)).toEqual(['10480'])
  })

  it('invierte la Y (los píxeles crecen hacia abajo, el PDF hacia arriba)', () => {
    const items = ocrWordsToItems([word('a', 10, 50, 30, 70)])
    expect(items[0].y).toBe(-50)
    expect(items[0].x).toBe(10)
    expect(items[0].width).toBe(20)
  })
})

describe('ocrWordsToRows', () => {
  it('agrupa por banda vertical y ordena de arriba hacia abajo', () => {
    const rows = ocrWordsToRows([
      word('abajo', 20, 500, 100, 520),
      word('arriba', 20, 400, 100, 420),
    ])
    expect(rows.map(r => r.cells[0].text)).toEqual(['arriba', 'abajo'])
  })

  it('junta palabras de texto contiguas en una sola celda, pero nunca dos números', () => {
    const rows = ocrWordsToRows([
      word('MAX', 20, 400, 70, 420),
      word('SPEED', 76, 400, 150, 420),
      word('27.3', 20, 440, 70, 460),
      word('101', 300, 440, 340, 460),
    ])
    const labelRow = rows.find(r => r.cells.some(c => c.text.includes('MAX')))!
    expect(labelRow.cells.map(c => c.text)).toEqual(['MAX SPEED'])

    const valueRow = rows.find(r => r.cells[0].text === '27.3')!
    expect(valueRow.cells.map(c => c.text)).toEqual(['27.3', '101'])
  })

  it('no junta dos celdas de texto muy separadas (tarjetas/columnas distintas)', () => {
    const rows = ocrWordsToRows([
      word('DISTANCE', 20, 400, 100, 420),
      word('HSR', 300, 400, 340, 420),
      word('DISTANCE', 346, 400, 430, 420),
    ])
    expect(rows[0].cells.map(c => c.text)).toEqual(['DISTANCE', 'HSR DISTANCE'])
  })
})

describe('ocrWordsToRows + buildCardTable sobre una tarjeta tipo PlayerTek (Cartagena)', () => {
  it('reconstruye las 6 métricas de la tarjeta con etiquetas de varias palabras', () => {
    const words: OcrWord[] = [
      // Fila 1: títulos "DISTANCE" / "HSR DISTANCE"
      word('DISTANCE', 20, 400, 100, 420),
      word('HSR', 300, 400, 340, 420),
      word('DISTANCE', 346, 400, 430, 420),
      // Fila 2: valores (con unidades sueltas que deben descartarse)
      word('10480', 20, 440, 90, 460),
      word('m.', 95, 445, 115, 458),
      word('458', 300, 440, 340, 460),
      word('m.', 345, 445, 365, 458),
      // Fila 3: títulos "MAX SPEED" / "ACCELERATIONS 3 M/S2"
      word('MAX', 20, 500, 70, 520),
      word('SPEED', 76, 500, 150, 520),
      word('ACCELERATIONS', 300, 500, 430, 520),
      word('3', 436, 500, 446, 520),
      word('M/S2', 452, 500, 490, 520),
      // Fila 4: valores
      word('27.3', 20, 540, 70, 560),
      word('km/h', 75, 545, 115, 558),
      word('101', 300, 540, 340, 560),
      word('count', 345, 545, 400, 558),
      // Fila 5: títulos "DECELERATIONS 3 M/S2" / "SPRINTS"
      word('DECELERATIONS', 20, 600, 150, 620),
      word('3', 156, 600, 166, 620),
      word('M/S2', 172, 600, 210, 620),
      word('SPRINTS', 300, 600, 380, 620),
      // Fila 6: valores
      word('80', 20, 640, 60, 660),
      word('count', 65, 645, 120, 658),
      word('3', 300, 640, 310, 660),
      word('count', 315, 645, 370, 658),
    ]

    const rows = ocrWordsToRows(words)
    const table = buildCardTable(rows, 'Santiago Cartagena')!

    expect(table).not.toBeNull()
    expect(table.rows).toHaveLength(1)
    expect(table.rows[0].name).toBe('Santiago Cartagena')

    const valueOf = (header: string) => table.rows[0].values[table.headers.indexOf(header)]
    expect(valueOf('DISTANCE')).toBe(10480)
    expect(valueOf('HSR DISTANCE')).toBe(458)
    expect(valueOf('MAX SPEED')).toBe(27.3)
    expect(valueOf('ACCELERATIONS 3 M/S2')).toBe(101)
    expect(valueOf('DECELERATIONS 3 M/S2')).toBe(80)
    expect(valueOf('SPRINTS')).toBe(3)
  })
})
