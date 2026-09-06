import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { extractPdfItems } from '@/lib/pdf/extractPdfItems'
import type { PdfTextItem } from '@/lib/pdf/extractPdfItems'
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

describe('findPageHeaders con una sección no reconocida (contrato del plan: nunca se descarta en silencio)', () => {
  it('incluye la página con label "desconocida" en vez de omitirla del resultado', () => {
    // Reproduce el layout real de encabezado (ver dump del fixture): el
    // boilerplate "INFORME DEL EQUIPO" siempre va en y≈819, el nombre del
    // equipo en y≈811, y el título de sección real en y≈807 -- ninguno de
    // los 3 matchea KNOWN_LABELS en este caso sintético.
    const items: PdfTextItem[] = [
      { str: 'INFORME DEL EQUIPO', x: 123.8, y: 819.1, width: 75.2, page: 99 },
      { str: 'Un Equipo Cualquiera', x: 513.8, y: 810.9, width: 70.4, page: 99 },
      { str: 'SECCIÓN INVENTADA', x: 123.8, y: 807.3, width: 90, page: 99 },
    ]

    const headers = findPageHeaders(items)
    const entry = headers.find(h => h.page === 99)

    expect(entry).toBeDefined()
    expect(entry?.label).toBe('desconocida')
    // El texto reportado debe ser el título real de la página, no el
    // boilerplate -- para que el warning que arma el orquestador sea útil.
    expect(entry?.raw).toBe('SECCIÓN INVENTADA')
  })
})
