import { describe, it, expect } from 'vitest'
import { parseMetricSchema, buildMetricSeries, nameKeys, metricIsLowerBetter, aggregateByMonth } from './wyscoutEvolutionService'
import type { WyscoutPoint } from './wyscoutEvolutionService'

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

describe('nameKeys (match tolerante: forma corta vs nombre completo)', () => {
  it('la forma corta "J. Paradela" comparte clave con "José Paradela"', () => {
    // La planilla interno usa "J. Paradela"; la Wyscout "José Paradela".
    expect(nameKeys('J. Paradela')).toContain('j paradela')
    expect(nameKeys('José Paradela')).toContain('j paradela')
  })
  it('"M. Palacios" comparte clave con "Matías Palacios"', () => {
    expect(nameKeys('M. Palacios')).toContain('m palacios')
    expect(nameKeys('Matías Palacios')).toContain('m palacios')
  })
  it('inicial distinta NO comparte clave (F. Paradela vs José Paradela)', () => {
    const a = new Set(nameKeys('F. Paradela'))
    expect(nameKeys('José Paradela').some(k => a.has(k))).toBe(false)
  })
})

describe('metricIsLowerBetter', () => {
  it('menos es mejor en pérdidas, faltas, tarjetas, fuera de juego', () => {
    expect(metricIsLowerBetter('Balones perdidos / propia mitad')).toBe(true)
    expect(metricIsLowerBetter('Faltas')).toBe(true)
    expect(metricIsLowerBetter('Tarjetas amarillas')).toBe(true)
    expect(metricIsLowerBetter('Fuera de juego')).toBe(true)
  })
  it('más es mejor en goles, %, recuperaciones y faltas recibidas', () => {
    expect(metricIsLowerBetter('Goles')).toBe(false)
    expect(metricIsLowerBetter('Pases / logrados')).toBe(false)
    expect(metricIsLowerBetter('Balones recuperados / mitad adv.')).toBe(false)
    expect(metricIsLowerBetter('Faltas recibidas')).toBe(false)
  })
})

describe('aggregateByMonth', () => {
  it('promedia por mes y ordena cronológicamente', () => {
    const s: WyscoutPoint[] = [
      { date: '2024-05-06', matchLabel: 'A', competition: '', value: 10 },
      { date: '2024-05-20', matchLabel: 'B', competition: '', value: 20 },
      { date: '2024-06-01', matchLabel: 'C', competition: '', value: 30 },
    ]
    const agg = aggregateByMonth(s)
    expect(agg).toHaveLength(2)
    expect(agg[0].value).toBe(15)          // mayo: (10+20)/2
    expect(agg[0].matchLabel).toBe('2 partidos')
    expect(agg[1].value).toBe(30)          // junio
    expect(agg[0].date < agg[1].date).toBe(true)
  })
})
