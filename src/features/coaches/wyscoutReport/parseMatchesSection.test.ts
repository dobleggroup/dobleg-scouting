import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { extractPdfItems } from '@/lib/pdf/extractPdfItems'
import { parseMatchHeaderAndLineup } from './parseMatchesSection'

function fixture(name: string): ArrayBuffer {
  const path = fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))
  const buf = readFileSync(path)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

const KNOWN_ROSTER_NAMES = new Set([
  'E. Mastrolía', 'L. Monti', 'O. Pacheco', 'V. Aguiñagalde', 'L. Angelini',
  'L. Richarte', 'G. Tomasetti', 'F. Benítez', 'L. Nieto', 'P. Souto',
  'M. Echeverría', 'F. Brandán', 'A. Melo', 'F. Krüger', 'Nicolás Ávalos',
])

describe('parseMatchHeaderAndLineup contra el fixture real (pagina 6)', () => {
  it('arma el encabezado del partido y detecta cual columna es el propio equipo', async () => {
    const items = await extractPdfItems(fixture('temperley-informe-equipo.pdf'))
    const { header, lineup } = parseMatchHeaderAndLineup(items.filter(i => i.page === 6), KNOWN_ROSTER_NAMES)

    expect(header.rival).toBe('Quilmes')
    expect(header.isHome).toBe(false)
    expect(header.score).toBe('0 – 1')
    expect(header.date).toBe('2026-08-31')
    expect(header.competition).toBe('Primera Nacional')

    expect(lineup).toHaveLength(11)
    const mastrolia = lineup.find(p => p.name === 'E. Mastrolía')!
    expect(mastrolia.number).toBe(1)
    expect(mastrolia.positionCode).toBe('GK')
    expect(mastrolia.isStarter).toBe(true)
    expect(lineup.some(p => p.name === 'E. Glellel')).toBe(false) // es del rival, no entra
  })
})
