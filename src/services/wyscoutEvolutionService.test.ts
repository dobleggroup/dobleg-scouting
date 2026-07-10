import { describe, it, expect } from 'vitest'
import { parseMetricSchema, buildMetricSeries } from './wyscoutEvolutionService'

// Header real: label del par ocupa 2 columnas (intentos, logrados); la 2da viene vacía.
const HEADERS = [
  'Jugador', 'Partido', 'Competition', 'Date', 'Minutos jugados',
  'Pases / logrados', '', 'Goles', 'xG',
]

describe('parseMetricSchema', () => {
  it('detecta métricas simples y de par', () => {
    const metrics = parseMetricSchema(HEADERS)
    const pases = metrics.find(m => m.label.startsWith('Pases'))!
    expect(pases.type).toBe('ratio')
    expect(pases.unit).toBe('%')
    const goles = metrics.find(m => m.label === 'Goles')!
    expect(goles.type).toBe('simple')
    // No incluye columnas de contexto (Jugador/Partido/Competition/Date)
    expect(metrics.some(m => m.label === 'Jugador')).toBe(false)
  })
})

describe('buildMetricSeries', () => {
  const rows: string[][] = [
    ['José Paradela', 'A - B 2:1', 'Liga MX', '2024-05-06', '90', '26', '16', '0', '0.06'],
  ]
  it('métrica de par devuelve el % de eficacia (logrados/intentos)', () => {
    const s = buildMetricSeries(rows, HEADERS, 'pases')
    expect(s[0].value).toBeCloseTo((16 / 26) * 100, 1)
  })
  it('métrica simple devuelve el valor crudo', () => {
    const s = buildMetricSeries(rows, HEADERS, 'xg')
    expect(s[0].value).toBeCloseTo(0.06, 3)
  })
})
