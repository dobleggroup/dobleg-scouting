// src/features/coaches/wyscoutReport/parseZoneGrids.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { extractPdfItems } from '@/lib/pdf/extractPdfItems'
import { parseZoneGrids } from './parseZoneGrids'

function fixture(name: string): ArrayBuffer {
  const path = fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))
  const buf = readFileSync(path)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

describe('parseZoneGrids contra el fixture real (pagina 20)', () => {
  it('extrae la grilla 3x3 de Recuperaciones con los porcentajes reales del PDF', async () => {
    const items = await extractPdfItems(fixture('temperley-informe-equipo.pdf'))
    const grids = parseZoneGrids(items.filter(i => i.page === 20))

    const recuperaciones = grids.find(g => g.category === 'recuperaciones')!
    expect(recuperaciones.cells).toHaveLength(9)

    const cell = (row: number, col: number) => recuperaciones.cells.find(c => c.row === row && c.col === col)!
    expect(cell(0, 0).pct).toBe(9.8)
    expect(cell(0, 1).pct).toBe(14)
    expect(cell(0, 2).pct).toBe(3.9)
    expect(cell(1, 0).pct).toBe(16.1)
    expect(cell(2, 2).pct).toBe(5)
    expect(cell(0, 0).reference).toBe(8.8)
  })
})
