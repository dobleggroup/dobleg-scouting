import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { extractPdfItems } from '@/lib/pdf/extractPdfItems'
import { parseFormationsSection } from './parseFormationsSection'

function fixture(name: string): ArrayBuffer {
  const path = fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))
  const buf = readFileSync(path)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

describe('parseFormationsSection contra el fixture real', () => {
  it('extrae las 3 formaciones con % de uso y comparativa propio/rival', async () => {
    const items = await extractPdfItems(fixture('temperley-informe-equipo.pdf'))
    const formations = parseFormationsSection(items.filter(i => i.page === 5))

    expect(formations).toHaveLength(3)
    const totalPct = formations.reduce((sum, f) => sum + f.usagePct, 0)
    expect(totalPct).toBeGreaterThanOrEqual(95)
    expect(totalPct).toBeLessThanOrEqual(100)

    const main = formations.find(f => f.scheme === '4-2-3-1')!
    expect(main.usagePct).toBe(60)
    const goles = main.teamStats.find(s => s.label.startsWith('GOLES'))!
    expect(goles.own).toBe(6)
    expect(goles.rival).toBe(4)
    expect(main.averagePositions).toHaveLength(11)
  })
})
