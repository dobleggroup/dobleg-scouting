import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { extractPdfItems } from './extractPdfItems'

function fixture(name: string): ArrayBuffer {
  const path = fileURLToPath(new URL(`../../features/gps/parser/__fixtures__/${name}`, import.meta.url))
  const buf = readFileSync(path)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

describe('extractPdfItems', () => {
  it('devuelve una celda por span, con coordenadas', async () => {
    const items = await extractPdfItems(fixture('estudiantes-tigre.pdf'))

    const texts = items.map(i => i.str)
    expect(texts).toContain('Futbolista')
    expect(texts).toContain('Dist Rel x Min')
    expect(texts).toContain('Gonzalez G')
    expect(texts).toContain('10222')
  })

  it('pone en la misma línea el nombre y sus valores', async () => {
    const items = await extractPdfItems(fixture('estudiantes-tigre.pdf'))
    const name = items.find(i => i.str === 'Gonzalez G')!
    const dist = items.find(i => i.str === '10222')!

    expect(Math.abs(name.y - dist.y)).toBeLessThan(3)
    expect(name.x).toBeLessThan(dist.x)
    expect(name.width).toBeGreaterThan(0)
    expect(name.page).toBe(1)
  })
})
