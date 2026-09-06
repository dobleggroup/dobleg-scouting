import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { extractPdfItems } from '@/lib/pdf/extractPdfItems'
import { parseSetPieces } from './parseSetPieces'

function fixture(name: string): ArrayBuffer {
  const path = fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))
  const buf = readFileSync(path)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

describe('parseSetPieces contra el fixture real (pagina 22)', () => {
  it('extrae puntos de corner y tiro libre con su lado', async () => {
    const items = await extractPdfItems(fixture('temperley-informe-equipo.pdf'))
    const setPieces = parseSetPieces(items.filter(i => i.page === 22))

    expect(setPieces.some(sp => sp.type === 'corner' && sp.side === 'izquierdo')).toBe(true)
    expect(setPieces.some(sp => sp.type === 'corner' && sp.side === 'derecho')).toBe(true)
    expect(setPieces.some(sp => sp.type === 'tiro_libre')).toBe(true)
  })
})
