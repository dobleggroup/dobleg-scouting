import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { extractPdfItems } from '@/lib/pdf/extractPdfItems'
import { parseEventMaps } from './parseEventMaps'

function fixture(name: string): ArrayBuffer {
  const path = fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))
  const buf = readFileSync(path)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

describe('parseEventMaps contra el fixture real (pagina 16)', () => {
  it('extrae los puntos de duelos defensivos en el propio tercio', async () => {
    const items = await extractPdfItems(fixture('temperley-informe-equipo.pdf'))
    const maps = parseEventMaps(items.filter(i => i.page === 16), 'duelos_defensivos_propio_tercio')

    // La pagina 16 completa ("FASE DEFENSIVA") trae 3 sub-graficos apilados en
    // vertical -- duelos defensivos ganados, duelos defensivos perdidos y
    // duelos aereos -- cada uno con su propia etiqueta "PROPIA MITAD" (no hay
    // "MITAD ADVERSARIA" en esta pagina). parseEventMaps no distingue esos
    // sub-graficos por titulo, asi que devuelve un mapa por cada etiqueta: se
    // valida que TODOS sean validos (mitad "propia", decenas de puntos, todos
    // dentro de cancha), no solo el primero.
    expect(maps.length).toBeGreaterThanOrEqual(1)
    for (const map of maps) {
      expect(map.half).toBe('propia')
      expect(map.points.length).toBeGreaterThan(30) // pagina 16 tiene decenas de eventos por sub-grafico
      for (const p of map.points) {
        expect(p.x).toBeGreaterThanOrEqual(0)
        expect(p.x).toBeLessThanOrEqual(100)
        expect(p.y).toBeGreaterThanOrEqual(0)
        expect(p.y).toBeLessThanOrEqual(100)
      }
    }
  })
})
