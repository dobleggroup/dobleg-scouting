import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { extractPdfItems } from '@/lib/pdf/extractPdfItems'
import { classifySectionLabel, findPageHeaders } from './classifySectionLabel'

function fixture(name: string): ArrayBuffer {
  const path = fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))
  const buf = readFileSync(path)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

describe('classifySectionLabel', () => {
  it('reconoce cada título de sección conocido, insensible a mayúsculas/tildes', () => {
    expect(classifySectionLabel('JUGADORES')).toBe('jugadores')
    expect(classifySectionLabel('estadísticas')).toBe('estadisticas')
    expect(classifySectionLabel('Construcción del juego')).toBe('construccion_del_juego')
    expect(classifySectionLabel('jugadas a balón parado')).toBe('jugadas_a_balon_parado')
    expect(classifySectionLabel('Algo Random')).toBe('desconocida')
  })
})

describe('findPageHeaders contra el fixture real', () => {
  it('clasifica las 23 páginas del informe en la sección correcta', async () => {
    const items = await extractPdfItems(fixture('temperley-informe-equipo.pdf'))
    const headers = findPageHeaders(items)

    expect(headers.find(h => h.page === 2)?.label).toBe('jugadores')
    expect(headers.find(h => h.page === 3)?.label).toBe('estadisticas')
    expect(headers.find(h => h.page === 4)?.label).toBe('estadisticas')
    expect(headers.find(h => h.page === 5)?.label).toBe('formaciones')
    expect(headers.find(h => h.page === 6)?.label).toBe('partidos')
    expect(headers.find(h => h.page === 15)?.label).toBe('partidos')
    expect(headers.find(h => h.page === 16)?.label).toBe('fase_defensiva')
    expect(headers.find(h => h.page === 17)?.label).toBe('construccion_del_juego')
    expect(headers.find(h => h.page === 18)?.label).toBe('ataque')
    expect(headers.find(h => h.page === 19)?.label).toBe('finalizacion')
    expect(headers.find(h => h.page === 20)?.label).toBe('transiciones')
    expect(headers.find(h => h.page === 21)?.label).toBe('peligro_constante')
    expect(headers.find(h => h.page === 22)?.label).toBe('jugadas_a_balon_parado')
    expect(headers.find(h => h.page === 23)?.label).toBe('glosario')
  })
})
