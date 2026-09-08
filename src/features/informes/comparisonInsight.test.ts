import { describe, it, expect } from 'vitest'
import { buildComparisonRows, countWins, buildInsightText, formatComparisonValue, buildRadarSeries } from './comparisonInsight'
import type { MetricDef } from './types'

const def = (over: Partial<MetricDef>): MetricDef =>
  ({ key: 'k', label: 'k', short: 'k', unit: '', higherIsBetter: true, ...over })

describe('formatComparisonValue', () => {
  it('dos decimales con coma para valores normales', () => {
    expect(formatComparisonValue(0.482, '')).toBe('0,48')
    expect(formatComparisonValue(5.04, '')).toBe('5,04')
  })

  it('un decimal + % para porcentajes', () => {
    expect(formatComparisonValue(71.8, '%')).toBe('71,8%')
    expect(formatComparisonValue(57.44, '%')).toBe('57,4%')
  })

  it('valor faltante devuelve un guión', () => {
    expect(formatComparisonValue(null, '')).toBe('—')
  })
})

describe('buildComparisonRows', () => {
  const defs = [
    def({ key: 'goles90', label: 'Goles/90', higherIsBetter: true }),
    def({ key: 'faltas90', label: 'Faltas/90', higherIsBetter: false }),
  ]
  const matrix = {
    goles90: [0.48, 0.36],
    faltas90: [1.2, 0.8],
  }

  it('el ganador respeta higherIsBetter (mayor es mejor)', () => {
    const rows = buildComparisonRows(['goles90'], defs, matrix, 0, 1)
    expect(rows[0].winner).toBe('a') // 0.48 > 0.36
  })

  it('el ganador respeta higherIsBetter=false (menor es mejor)', () => {
    const rows = buildComparisonRows(['faltas90'], defs, matrix, 0, 1)
    expect(rows[0].winner).toBe('b') // 0.8 < 1.2, gana B
  })

  it('valores iguales = empate', () => {
    const rows = buildComparisonRows(['goles90'], defs, { goles90: [0.5, 0.5] }, 0, 1)
    expect(rows[0].winner).toBe('tie')
  })

  it('si falta un valor, no hay ganador decidido', () => {
    const rows = buildComparisonRows(['goles90'], defs, { goles90: [0.5, null] }, 0, 1)
    expect(rows[0].winner).toBeNull()
  })

  it('las barras son proporcionales al mayor de los dos', () => {
    const rows = buildComparisonRows(['goles90'], defs, matrix, 0, 1)
    expect(rows[0].pctA).toBe(100) // 0.48 es el mayor
    expect(rows[0].pctB).toBeCloseTo((0.36 / 0.48) * 100, 5)
  })
})

describe('countWins', () => {
  it('cuenta victorias de cada uno y empates', () => {
    const rows = buildComparisonRows(
      ['a', 'b', 'c'],
      [def({ key: 'a' }), def({ key: 'b' }), def({ key: 'c' })],
      { a: [1, 0], b: [0, 1], c: [5, 5] },
      0, 1,
    )
    expect(countWins(rows)).toEqual({ winsA: 1, winsB: 1, ties: 1 })
  })
})

describe('buildRadarSeries', () => {
  it('usa los porcentajes relativos de cada fila como valores del eje', () => {
    const defs = [def({ key: 'goles90', label: 'Goles/90' })]
    const rows = buildComparisonRows(['goles90'], defs, { goles90: [0.48, 0.36] }, 0, 1)
    const { axes, series } = buildRadarSeries(rows, 'Paradela', 'Brunetta', '#22C55E', '#111827')
    expect(axes).toEqual(['Goles/90'])
    expect(series).toEqual([
      { name: 'Paradela', color: '#22C55E', values: [100] },
      { name: 'Brunetta', color: '#111827', values: [75] },
    ])
  })

  it('pisa un mínimo cuando un valor es chico pero no cero, para que no colapse al centro', () => {
    const defs = [def({ key: 'k', label: 'K' })]
    // 0.3 vs 3.0 -> 10% crudo, por debajo del piso de 18.
    const rows = buildComparisonRows(['k'], defs, { k: [0.3, 3.0] }, 0, 1)
    const { series } = buildRadarSeries(rows, 'A', 'B', '#000', '#111')
    expect(series[0].values[0]).toBe(18)
    expect(series[1].values[0]).toBe(100)
  })

  it('un cero real se queda en cero (no se pisa)', () => {
    const defs = [def({ key: 'k', label: 'K' })]
    const rows = buildComparisonRows(['k'], defs, { k: [0, 5] }, 0, 1)
    const { series } = buildRadarSeries(rows, 'A', 'B', '#000', '#111')
    expect(series[0].values[0]).toBe(0)
  })

  it('descarta ejes donde falta el valor de alguno de los dos', () => {
    const defs = [def({ key: 'k', label: 'K' })]
    const rows = buildComparisonRows(['k'], defs, { k: [1, null] }, 0, 1)
    const { axes } = buildRadarSeries(rows, 'A', 'B', '#000', '#111')
    expect(axes).toEqual([])
  })
})

describe('buildInsightText', () => {
  it('menciona a quien gana más y por qué métricas, con margen mayor primero', () => {
    const defs = [
      def({ key: 'goles90', label: 'Goles/90' }),
      def({ key: 'chances90', label: 'Chances creadas/90' }),
    ]
    const rows = buildComparisonRows(
      ['goles90', 'chances90'],
      defs,
      { goles90: [1, 0.1], chances90: [1, 0.9] }, // goles90: margen grande, chances90: margen chico
      0, 1,
    )
    const text = buildInsightText(rows, 'Paradela', 'Brunetta')
    expect(text).toContain('Paradela se impone en 2 de 2 métricas')
    // El de mayor margen (goles por 90) va primero en la lista.
    expect(text.indexOf('goles por 90')).toBeLessThan(text.indexOf('chances creadas por 90'))
  })

  it('menciona las métricas parejas por separado', () => {
    const defs = [def({ key: 'k', label: 'Regates/90' })]
    const rows = buildComparisonRows(['k'], defs, { k: [3.7, 3.6] }, 0, 1)
    const text = buildInsightText(rows, 'A', 'B')
    expect(text).toContain('Están parejos en regates por 90')
  })

  it('sin métricas decididas ni parejas, devuelve texto vacío', () => {
    const text = buildInsightText([], 'A', 'B')
    expect(text).toBe('')
  })
})
