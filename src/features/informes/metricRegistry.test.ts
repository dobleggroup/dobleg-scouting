import { describe, it, expect } from 'vitest'
import { normalizeHeader, matchHeaderToMetric, buildColumnMap } from './metricRegistry'

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
})
