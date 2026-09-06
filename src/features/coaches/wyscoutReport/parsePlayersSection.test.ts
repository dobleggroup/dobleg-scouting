import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { extractPdfItems } from '@/lib/pdf/extractPdfItems'
import { parsePlayersSection } from './parsePlayersSection'

function fixture(name: string): ArrayBuffer {
  const path = fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))
  const buf = readFileSync(path)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

describe('parsePlayersSection contra el fixture real', () => {
  it('extrae los jugadores de la pagina 2 con sus datos basicos', async () => {
    const items = await extractPdfItems(fixture('temperley-informe-equipo.pdf'))
    const players = parsePlayersSection(items.filter(i => i.page === 2))

    expect(players).toHaveLength(23) // 3 arqueros + 5 defensores + 11 centrocampistas + 4 delanteros
    expect(players.some(p => p.name === 'DEFENSORES')).toBe(false)
    expect(players.some(p => p.name === 'CENTROCAMPISTAS')).toBe(false)

    const mastrolia = players.find(p => p.name === 'E. Mastrolía')!
    expect(mastrolia.number).toBe(1)
    expect(mastrolia.positionCode).toBe('GK')
    expect(mastrolia.age).toBe(35)
    expect(mastrolia.heightCm).toBe(190)
    expect(mastrolia.matches).toBe(8)
    expect(mastrolia.minutesTotal).toBe(771)
    expect(mastrolia.minutesAvg).toBe(96)
    expect(mastrolia.foot).toBeNull()

    const pSouto = players.find(p => p.name === 'P. Souto')!
    expect(pSouto.number).toBe(11)
    expect(pSouto.positionCode).toBe('LAMF')
    expect(pSouto.goals).toBe(4)
  })
})
