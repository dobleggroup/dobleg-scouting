// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseCsv, parseXml, parseXlsxBuffer } from './parseFile'

describe('parseCsv', () => {
  it('devuelve headers y filas tipadas', () => {
    const csv = 'Jugador,Goles,xG\nYuri Oyarzo,2,0.71\nOtro Jugador,1,1.4'
    const out = parseCsv(csv)
    expect(out.headers).toEqual(['Jugador', 'Goles', 'xG'])
    expect(out.rows).toHaveLength(2)
    expect(out.rows[0].Jugador).toBe('Yuri Oyarzo')
    expect(out.rows[0].Goles).toBe(2)     // numérico
    expect(out.rows[0].xG).toBe(0.71)
  })
})

describe('parseXml', () => {
  it('lee filas repetidas de elementos como registros', () => {
    const xml =
      '<data><player><Jugador>Yuri Oyarzo</Jugador><Goles>2</Goles></player>' +
      '<player><Jugador>Otro</Jugador><Goles>1</Goles></player></data>'
    const out = parseXml(xml)
    expect(out.headers).toEqual(['Jugador', 'Goles'])
    expect(out.rows).toHaveLength(2)
    expect(out.rows[0].Jugador).toBe('Yuri Oyarzo')
    expect(out.rows[1].Goles).toBe(1)
  })
})

describe('parseXlsxBuffer', () => {
  it('lee la primera hoja como registros', async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Jugador', 'Goles'],
      ['Yuri Oyarzo', 2],
      ['Otro', 1],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Hoja1')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const out = await parseXlsxBuffer(buf)
    expect(out.headers).toEqual(['Jugador', 'Goles'])
    expect(out.rows).toHaveLength(2)
    expect(out.rows[0].Goles).toBe(2)
  })
})
