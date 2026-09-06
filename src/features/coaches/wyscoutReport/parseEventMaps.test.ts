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
    // valida que TODOS sean validos (mitad "propia", todos dentro de cancha),
    // no solo el primero.
    //
    // Los conteos exactos (191/98/98) estan verificados contra el fixture real
    // filtrando manualmente por "x" (menos de 300, la mini-cancha; el resto es
    // la tabla de ranking de al lado) e independientemente contando cuantos
    // numeros de 1-2 digitos con ancho chico caen ahi -- se afirma el numero
    // exacto, no un piso generico, porque un piso generico (ej. ">30") no
    // hubiese detectado una regresion real: una version anterior de este
    // parser filtraba de mas (perdia ~30% de los puntos reales de cada
    // sub-grafico, dando 134/64/71) y ese piso igual pasaba.
    expect(maps.map(m => m.points.length)).toEqual([191, 98, 98])
    for (const map of maps) {
      expect(map.half).toBe('propia')
      for (const p of map.points) {
        expect(p.x).toBeGreaterThanOrEqual(0)
        expect(p.x).toBeLessThanOrEqual(100)
        expect(p.y).toBeGreaterThanOrEqual(0)
        expect(p.y).toBeLessThanOrEqual(100)
      }
      // Finding C1 (revision final): un intento anterior clampeaba el minimo
      // de la normalizacion a 0 (`Math.min(...xs, 0)`), lo que -- como las
      // coordenadas reales de un PDF siempre son positivas -- aplastaba
      // cualquier racimo real contra el origen de la pagina en vez de contra
      // su propio bounding box, dejando todos los puntos amontonados en una
      // banda angosta cerca de x/y=0 en vez de ocupar la cancha 0-100
      // completa. La aserción de rango [0,100] de arriba pasaba igual con
      // ese bug (nunca se probaba el SPAN real), así que acá se afirma
      // explícitamente que el racimo ocupa una porción sustancial de la
      // cancha en ambos ejes -- esto hubiese fallado con el bug original
      // (spans reales medidos con el bug: x en ~[0,17], y en ~[0,43]).
      const xs = map.points.map(p => p.x)
      const ys = map.points.map(p => p.y)
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(50)
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(50)
    }
  })
})

describe('parseEventMaps contra el fixture real (pagina 18) -- Finding I2', () => {
  it('no duplica el racimo de una etiqueta huerfana (3 etiquetas MITAD ADVERSARIA, solo 2 racimos reales)', async () => {
    const items = await extractPdfItems(fixture('temperley-informe-equipo.pdf'))
    const maps = parseEventMaps(items.filter(i => i.page === 18), 'ataque')

    // La pagina 18 ("ATAQUE") trae 3 sub-graficos ("Centros", "Regates
    // exitosos en el ultimo tercio", "Recuperaciones en el ultimo tercio"),
    // cada uno con su propia etiqueta "MITAD ADVERSARIA" como pie de
    // grafico -- pero la 3ra etiqueta no tiene ningun contenido propio por
    // debajo (esta huerfana, verificado contra el fixture real), y el
    // fallback de "buscar arriba" terminaba re-recuperando el MISMO racimo
    // que la 2da etiqueta ya habia consumido por "abajo" -- produciendo 3
    // mapas (23/103/103 puntos, dos de ellos byte-identicos) en vez de 2
    // mapas reales distintos (23/103 puntos). Un piso generico (">0 mapas")
    // no hubiese detectado esta regresion, por eso se afirma el conteo
    // exacto de mapas y se verifica explicitamente que ningun par de mapas
    // comparta el mismo conjunto de puntos.
    expect(maps).toHaveLength(2)
    expect(maps.map(m => m.points.length)).toEqual([23, 103])
    for (const map of maps) {
      expect(map.half).toBe('rival')
    }
    expect(JSON.stringify(maps[0].points)).not.toBe(JSON.stringify(maps[1].points))
  })
})
