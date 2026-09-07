import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { extractPdfItems } from '@/lib/pdf/extractPdfItems'
import { groupRows, buildTable, isAggregateRow } from './buildTable'
import type { PdfTextItem } from '../types'

function fixture(name: string): ArrayBuffer {
  const path = fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))
  const buf = readFileSync(path)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

const item = (str: string, x: number, y: number, width = 10): PdfTextItem =>
  ({ str, x, y, width, page: 1 })

describe('groupRows', () => {
  it('agrupa por línea y ordena de arriba hacia abajo', () => {
    const rows = groupRows([
      item('b', 200, 500),
      item('a', 100, 501),
      item('c', 100, 480),
    ])
    expect(rows.map(r => r.cells.map(c => c.text))).toEqual([['a', 'b'], ['c']])
  })
})

describe('isAggregateRow', () => {
  it('reconoce las filas que no son jugadores', () => {
    expect(isAggregateRow('% EQUIPO')).toBe(true)
    expect(isAggregateRow('% DF C')).toBe(true)
    expect(isAggregateRow('Sumatoria Equipo')).toBe(true)
    expect(isAggregateRow('1 Tiempo')).toBe(true)
    expect(isAggregateRow('Valor más Alto')).toBe(true)
    expect(isAggregateRow('Gonzalez G')).toBe(false)
    expect(isAggregateRow('Lo Celso')).toBe(false)
  })
})

describe('buildTable sobre el PDF de Estudiantes vs Tigre', () => {
  it('reconstruye cabeceras, jugadores y valores', async () => {
    const items = await extractPdfItems(fixture('estudiantes-tigre.pdf'))
    const table = buildTable(groupRows(items))!

    expect(table).not.toBeNull()
    expect(table.headers).toEqual([
      'Futbolista', 'T', 'Distancia', 'Dist Rel x Min', 'Dist AI (16)',
      'DZ4 (16-20)', 'DZ5 (20-24)', 'DZ6 (24)', 'V Max',
      'Dist Acele', 'Dist Desac', 'Dist Ac +4', 'Dist De -4',
    ])

    const names = table.rows.map(r => r.name)
    expect(names).toContain('Gonzalez G')
    expect(names).toContain('Lo Celso')
    expect(names).not.toContain('% EQUIPO')
    expect(names).not.toContain('Sumatoria Equipo')
    expect(names).not.toContain('1 Tiempo')

    const gonzalez = table.rows.find(r => r.name === 'Gonzalez G')!
    expect(gonzalez.values).toEqual([null, 98, 10222, 105, 1253, 746, 342, 166, 30.8, 587, 522, 63, 87])

    const loCelso = table.rows.find(r => r.name === 'Lo Celso')!
    expect(loCelso.values[1]).toBe(3)
    expect(loCelso.values[2]).toBe(308)
    expect(loCelso.values[8]).toBe(24.5)
  })

  it('guarda el texto previo a la cabecera para inferir el contexto', async () => {
    const items = await extractPdfItems(fixture('estudiantes-tigre.pdf'))
    const table = buildTable(groupRows(items))!

    expect(table.preambleLines.some(l => /vs Tigre/i.test(l))).toBe(true)
    expect(table.preambleLines.some(l => /25 de Julio/i.test(l))).toBe(true)
  })
})

describe('buildTable sobre un Reporte de Sesión de Catapult (cabecera sin columna de nombre)', () => {
  it('arma la cabecera envuelta en varias líneas y reconoce a los jugadores', async () => {
    const items = await extractPdfItems(fixture('reporte-sesion-instituto.pdf'))
    const table = buildTable(groupRows(items))!

    expect(table).not.toBeNull()
    expect(table.headers[0]).toBe('')
    expect(table.headers).toContain('Tot Dist (m)')
    expect(table.headers).toContain('Mts 20 - 25 km/h')
    expect(table.headers).toContain('Veloc Max (km/h)')

    const names = table.rows.map(r => r.name)
    expect(names).toContain('FRANCO WATSON')
    expect(names).not.toContain('Promedio')

    const watson = table.rows.find(r => r.name === 'FRANCO WATSON')!
    const distIdx = table.headers.indexOf('Tot Dist (m)')
    expect(watson.values[distIdx]).toBe(7666)
  })

  it('infiere el rival y la fecha del texto previo a la cabecera', async () => {
    const items = await extractPdfItems(fixture('reporte-sesion-instituto.pdf'))
    const table = buildTable(groupRows(items))!

    expect(table.preambleLines.some(l => /VS INSTITUTO CBA/i.test(l))).toBe(true)
    expect(table.preambleLines.some(l => /02\/08\/2026/.test(l))).toBe(true)
  })
})

describe('buildTable sobre un reporte Sonra/STATSports multi-jugador (cabecera en inglés "Name")', () => {
  it('reconoce la cabecera real por la celda "Name" en vez de agarrar una fila de valores como cabecera', async () => {
    const items = await extractPdfItems(fixture('sonra-maldonado-penarol.pdf'))
    const table = buildTable(groupRows(items))!

    expect(table).not.toBeNull()
    expect(table.headers).toEqual([
      'Name', 'Duration', 'Dist', 'Abs HSR', 'HMLD',
      'Abs HSR + Abs Sprints', 'MaxSp', 'Acc+3', 'Dec+3', 'HIA', 'RPE',
    ])
    // la fila de valores sueltos que antes se colaba como cabecera no debe aparecer.
    expect(table.headers).not.toContain('64')
    expect(table.headers).not.toContain('6892,68')
  })

  it('trae a Cartagena (SC28) y Ginzo (JMG4) identificados por su código de tag, con los valores correctos', async () => {
    const items = await extractPdfItems(fixture('sonra-maldonado-penarol.pdf'))
    const table = buildTable(groupRows(items))!

    const names = table.rows.map(r => r.name)
    expect(names).toContain('SC28')
    expect(names).toContain('JMG4')

    const distIdx = table.headers.indexOf('Dist')
    const hsrIdx = table.headers.indexOf('Abs HSR')
    const maxSpIdx = table.headers.indexOf('MaxSp')
    const acc3Idx = table.headers.indexOf('Acc+3')
    const dec3Idx = table.headers.indexOf('Dec+3')

    const cartagena = table.rows.find(r => r.name === 'SC28')!
    expect(cartagena.values[distIdx]).toBe(10480)
    expect(cartagena.values[hsrIdx]).toBe(458)
    expect(cartagena.values[maxSpIdx]).toBe(27.3)
    expect(cartagena.values[acc3Idx]).toBe(101)
    expect(cartagena.values[dec3Idx]).toBe(80)

    const ginzo = table.rows.find(r => r.name === 'JMG4')!
    expect(ginzo.values[distIdx]).toBe(10542)
  })
})

describe('buildTable sobre un reporte OpenField individual (una tarjeta por jugador)', () => {
  it('no confunde la celda suelta "JUGADOR" de la tarjeta con una cabecera de tabla', async () => {
    // No es un formato tabular: cada métrica es una tarjeta con título, valor y
    // nombre repetido. La única celda "JUGADOR" (la de la foto/ficha del atleta)
    // matchea HEADER_RE pero es de una sola columna, no el inicio de una tabla real.
    const items = await extractPdfItems(fixture('postigo-individual.pdf'))
    const table = buildTable(groupRows(items))

    expect(table).toBeNull()
  })
})
