import { describe, it, expect } from 'vitest'
import { normalizeHeader, matchHeaderToMetric, buildColumnMap, inferRawMetric } from './metricRegistry'

describe('normalizeHeader', () => {
  it('quita acentos, mayúsculas, barras y porcentajes', () => {
    expect(normalizeHeader('Regates / 90')).toBe('regates 90')
    expect(normalizeHeader('Duelos ganados, %')).toBe('duelos ganados')
    expect(normalizeHeader('xG')).toBe('xg')
  })
})

describe('matchHeaderToMetric', () => {
  it('matchea variantes de un header al mismo metric key', () => {
    expect(matchHeaderToMetric('Goles')?.key).toBe('goals')
    expect(matchHeaderToMetric('xG')?.key).toBe('xg')
    expect(matchHeaderToMetric('Regates/90')?.key).toBe('dribbles_p90')
    expect(matchHeaderToMetric('Regates realizados, %')?.key).toBe('dribbles_pct')
  })
  it('devuelve null si no reconoce', () => {
    expect(matchHeaderToMetric('Columna rara XYZ')).toBeNull()
  })
})

describe('buildColumnMap', () => {
  it('mapea headers conocidos y crea métrica cruda para desconocidos', () => {
    const { columnMap, defs } = buildColumnMap(['Jugador', 'Goles', 'Metrica Nueva'])
    expect(columnMap['Goles']).toBe('goals')
    // 'Jugador' no es numérica/métrica -> no está en el map
    expect(columnMap['Jugador']).toBeUndefined()
    // 'Metrica Nueva' -> métrica cruda con key derivada del header
    const rawKey = columnMap['Metrica Nueva']
    expect(rawKey).toBeDefined()
    const rawDef = defs.find(d => d.key === rawKey)
    expect(rawDef?.higherIsBetter).toBe(true)
    expect(rawDef?.label).toBe('Metrica Nueva')
  })

  it('infiere unidad % y lower-is-better en columnas crudas no reconocidas', () => {
    const { defs } = buildColumnMap(['Perdidas raras, %'])
    const d = defs.find(x => x.sourceHeader === 'Perdidas raras, %')
    expect(d?.unit).toBe('%')
    expect(d?.higherIsBetter).toBe(false)
  })

  it('dedupe: dos headers al mismo metric key -> un solo def', () => {
    const { columnMap, defs } = buildColumnMap(['Goles', 'Goals'], [{ Goles: 2, Goals: 3 }])
    expect(columnMap['Goles']).toBe('goals')
    expect(columnMap['Goals']).toBe('goals')
    expect(defs.filter(d => d.key === 'goals')).toHaveLength(1)
  })

  it('excluye columnas de texto cuando hay filas', () => {
    const { columnMap, defs } = buildColumnMap(
      ['Comentarios'],
      [{ Comentarios: 'buen partido' }, { Comentarios: 'flojo' }],
    )
    expect(columnMap['Comentarios']).toBeUndefined()
    expect(defs.some(d => d.sourceHeader === 'Comentarios')).toBe(false)
  })

  it('desambigua raw keys que colisionan al normalizar', () => {
    const { columnMap, defs } = buildColumnMap(
      ['Metrica X', 'Metrica-X'],
      [{ 'Metrica X': 1, 'Metrica-X': 2 }],
    )
    const k1 = columnMap['Metrica X']
    const k2 = columnMap['Metrica-X']
    expect(k1).toBeDefined()
    expect(k2).toBeDefined()
    expect(k1).not.toBe(k2)
    expect(defs.filter(d => d.key === k1 || d.key === k2)).toHaveLength(2)
  })
})

describe('inferRawMetric', () => {
  it('header con % -> unit %', () => {
    expect(inferRawMetric('Pases hacia adelante, %').unit).toBe('%')
  })

  it('header con 90 -> unit /90', () => {
    expect(inferRawMetric('Pases hacia adelante/90').unit).toBe('/90')
  })

  it('header terminado en metros -> unit m', () => {
    expect(inferRawMetric('Distancia recorrida, m').unit).toBe('m')
  })

  it('header sin marcas -> unit vacio', () => {
    expect(inferRawMetric('Metrica rara').unit).toBe('')
  })

  it('Pérdidas/90 -> higherIsBetter false', () => {
    expect(inferRawMetric('Pérdidas/90').higherIsBetter).toBe(false)
  })

  it('Faltas recibidas/90 -> higherIsBetter true (no se flaggea "recibidas" sola)', () => {
    expect(inferRawMetric('Faltas recibidas/90').higherIsBetter).toBe(true)
  })

  it('Goles recibidos/90 -> higherIsBetter false', () => {
    expect(inferRawMetric('Goles recibidos/90').higherIsBetter).toBe(false)
  })

  it('Tarjetas amarillas -> higherIsBetter false', () => {
    expect(inferRawMetric('Tarjetas amarillas').higherIsBetter).toBe(false)
  })

  it('Duelos ofensivos ganados, % -> higherIsBetter true (no tiene tokens negativos)', () => {
    expect(inferRawMetric('Duelos ofensivos ganados, %').higherIsBetter).toBe(true)
  })

  it('short: header <= 14 chars se devuelve completo', () => {
    expect(inferRawMetric('Corto').short).toBe('Corto')
  })

  it('short: header largo corta en borde de palabra, nunca a mitad de palabra', () => {
    const header = 'Distancia recorrida total en metros por partido'
    const { short } = inferRawMetric(header)
    expect(short.length).toBeLessThan(header.length)
    expect(header[short.length]).toBe(' ')
  })
})
