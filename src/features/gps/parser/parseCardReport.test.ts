import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { extractPdfItems } from '@/lib/pdf/extractPdfItems'
import { groupRows } from './buildTable'
import { buildCardTable } from './parseCardReport'

function fixture(name: string): ArrayBuffer {
  const path = fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))
  const buf = readFileSync(path)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

describe('buildCardTable sobre el reporte OpenField individual de Postigo', () => {
  it('arma una tabla de una fila con el jugador elegido y todas las tarjetas', async () => {
    const items = await extractPdfItems(fixture('postigo-individual.pdf'))
    const table = buildCardTable(groupRows(items), 'Joaquin Postigo')

    expect(table).not.toBeNull()
    expect(table!.rows).toHaveLength(1)
    expect(table!.rows[0].name).toBe('Joaquin Postigo')

    const idx = table!.headers.indexOf('DISTANCIA TOTAL')
    expect(idx).toBeGreaterThan(0)
    expect(table!.rows[0].values[idx]).toBe(10829.9)

    const velIdx = table!.headers.indexOf('PICO DE VEL MAXIMA')
    expect(table!.rows[0].values[velIdx]).toBe(27.81)

    const loadIdx = table!.headers.indexOf('PLAYER LOAD')
    expect(table!.rows[0].values[loadIdx]).toBe(1228.45)
  })

  it('convierte "Tiempo de juego" (H:MM:SS) a minutos', async () => {
    const items = await extractPdfItems(fixture('postigo-individual.pdf'))
    const table = buildCardTable(groupRows(items), 'Joaquin Postigo')!

    const idx = table.headers.indexOf('TIEMPO DE JUEGO')
    expect(table.rows[0].values[idx]).toBeCloseTo(99.6167, 3)
  })

  it('no confunde el nombre repetido ni el código técnico con una tarjeta nueva', async () => {
    const items = await extractPdfItems(fixture('postigo-individual.pdf'))
    const table = buildCardTable(groupRows(items), 'Joaquin Postigo')!

    expect(table.headers).not.toContain('Joaquin Postigo')
    expect(table.headers).not.toContain('Tot Dist (m)')
  })

  it('devuelve null si no reconoce ninguna tarjeta', () => {
    expect(buildCardTable([], 'Joaquin Postigo')).toBeNull()
  })
})
