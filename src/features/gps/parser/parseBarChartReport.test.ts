import { describe, it, expect } from 'vitest'
import { buildBarChartTable, mergeTables } from './parseBarChartReport'
import type { PdfRow } from '../types'

const cell = (text: string, x: number, width = 40) => ({ text, x, width, center: x + width / 2 })
const row = (y: number, ...cells: ReturnType<typeof cell>[]): PdfRow => ({ page: 1, y, cells })

describe('buildBarChartTable', () => {
  it('usa los títulos como grilla y junta "BANDA" + "4"', () => {
    const rows = [
      row(-10, cell('MÉTRICAS DE VOLUMEN', 400, 200)),
      row(-50, cell('TIEMPO', 300, 80), cell('BANDA', 560, 70), cell('4', 640, 12), cell('SPRINTS', 900, 80)),
      row(-100, cell('GUAJARDO PAOLO)', 100, 150), cell('90', 380), cell('883', 680), cell('17', 980)),
      row(-150, cell('PINARES CESAR', 100, 150), cell('100', 400), cell('1.158', 560), cell('6', 920)),
    ]
    const t = buildBarChartTable(rows)!
    expect(t.headers).toEqual(['', 'TIEMPO', 'BANDA 4', 'SPRINTS'])
    expect(t.rows).toEqual([
      { name: 'GUAJARDO PAOLO', values: [null, 90, 883, 17] },
      { name: 'PINARES CESAR', values: [null, 100, 1158, 6] },
    ])
    expect(t.preambleLines).toEqual(['MÉTRICAS DE VOLUMEN'])
  })

  it('descarta la página con dos valores por columna (PT vs ST)', () => {
    const rows = [
      row(-50, cell('DIST TOTAL', 300, 80), cell('HSR', 600), cell('ACC', 900)),
      row(-100, cell('A B', 100), cell('5796', 300), cell('4601', 360), cell('750', 600), cell('668', 650)),
      row(-150, cell('C D', 100), cell('5348', 300), cell('4566', 360), cell('555', 600), cell('421', 650)),
    ]
    expect(buildBarChartTable(rows)).toBeNull()
  })
})

describe('mergeTables', () => {
  it('une columnas por título y jugadores por nombre; manda la primera página', () => {
    const merged = mergeTables([
      { headers: ['', 'TIEMPO', 'DIST'], rows: [{ name: 'Guajardo Paolo', values: [null, 90, 10397] }], preambleLines: ['a'] },
      { headers: ['', 'Tiempo', 'HSR'], rows: [{ name: 'GUAJARDO PAOLO', values: [null, 20, 1418] }], preambleLines: ['b'] },
    ])!
    expect(merged.headers).toEqual(['', 'TIEMPO', 'DIST', 'HSR'])
    expect(merged.rows).toEqual([{ name: 'Guajardo Paolo', values: [null, 90, 10397, 1418] }])
  })
})
