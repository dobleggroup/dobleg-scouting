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

    // Regression guard para las 2 formaciones alternativas ("4-4-2", "4-3-3"):
    // sus filas de la tabla comparativa quedan intercaladas por y con su propia
    // mini-cancha de posiciones (ver parseFormationsSection.ts, findStatRows) --
    // una heuristica ingenua de "primera celda numerica a la izquierda del
    // rotulo" toma ahi el numero de camiseta de un jugador en vez del valor
    // propio real. Estos valores fueron verificados contra el fixture real.
    expect(formations[1].scheme).toBe('4-4-2')
    expect(formations[1].usagePct).toBe(26)
    const posesion44 = formations[1].teamStats.find(s => s.label.startsWith('POSESIÓN'))!
    expect(posesion44.own).toBe(54.69)
    expect(posesion44.rival).toBe(45.32)
    expect(formations[1].averagePositions).toHaveLength(11)

    expect(formations[2].scheme).toBe('4-3-3')
    expect(formations[2].usagePct).toBe(11)
    const posesion43 = formations[2].teamStats.find(s => s.label.startsWith('POSESIÓN'))!
    expect(posesion43.own).toBe(37.99)
    expect(posesion43.rival).toBe(62.01)
    expect(formations[2].averagePositions).toHaveLength(11)
  })
})
