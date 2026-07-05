import { describe, it, expect } from 'vitest'
import { getRowName, radarData, barsData, scatterData } from './chartData'
import type { Informe, MetricDef, MetricStat, ScatterAssignment } from './types'

function makeDef(over: Partial<MetricDef>): MetricDef {
  return { key: 'k', label: 'k', short: 'k', unit: '', higherIsBetter: true, ...over }
}

function makeInforme(over: Partial<Informe> = {}): Informe {
  return {
    id: 'i1',
    createdAt: '',
    updatedAt: '',
    contextoComparacion: '',
    fotoDataUrl: null,
    protagonistIndex: 0,
    comparePlayerIndices: [],
    content: { nombre: 'Fallback Name' } as Informe['content'],
    charts: { radar: [], bar: [], numbers: [], scatters: [] },
    headers: ['Jugador', 'Goles'],
    rows: [{ Jugador: 'A Player', Goles: 3 }],
    columnMap: {},
    ...over,
  }
}

describe('getRowName', () => {
  it('encuentra el header de nombre case/accent-insensitive', () => {
    const informe = makeInforme({
      headers: ['Équipo', 'Nombre'],
      rows: [{ Équipo: 'X', Nombre: 'Juan Pérez' }],
    })
    expect(getRowName(informe, 0)).toBe('Juan Pérez')
  })

  it('usa la primera columna si no hay match de nombre', () => {
    const informe = makeInforme({
      headers: ['Col1', 'Col2'],
      rows: [{ Col1: 'valor1', Col2: 'valor2' }],
    })
    expect(getRowName(informe, 0)).toBe('valor1')
  })
})

describe('radarData', () => {
  it('arma N series con colores correctos y percentiles por jugador (A mejor, B peor)', () => {
    const defs = [
      makeDef({ key: 'goals', label: 'Goles' }),
      makeDef({ key: 'assists', label: 'Asistencias' }),
    ]
    const matrix = {
      goals: [10, 1, 5],
      assists: [8, 0, 4],
    }
    const informe = makeInforme({
      headers: ['Jugador'],
      rows: [{ Jugador: 'A' }, { Jugador: 'B' }, { Jugador: 'C' }],
      protagonistIndex: 0,
      comparePlayerIndices: [1],
      charts: { radar: ['goals', 'assists'], bar: [], numbers: [], scatters: [] },
    })

    const result = radarData(informe, [] as MetricStat[], matrix, defs)

    expect(result.axes).toEqual(['Goles', 'Asistencias'])
    expect(result.series).toHaveLength(2)
    expect(result.series[0]).toMatchObject({ name: 'A', color: '#22C55E' })
    expect(result.series[1]).toMatchObject({ name: 'B', color: '#F5C451' })
    // A tiene el valor mas alto en ambos ejes => percentil 100
    expect(result.series[0].values).toEqual([100, 100])
    // B tiene el valor mas bajo en ambos ejes => percentil 0
    expect(result.series[1].values).toEqual([0, 0])
  })

  it('soporta hasta 2 comparados con los colores en orden', () => {
    const defs = [makeDef({ key: 'goals', label: 'Goles' })]
    const matrix = { goals: [5, 3, 1] }
    const informe = makeInforme({
      headers: ['Jugador'],
      rows: [{ Jugador: 'A' }, { Jugador: 'B' }, { Jugador: 'C' }],
      protagonistIndex: 0,
      comparePlayerIndices: [1, 2],
      charts: { radar: ['goals'], bar: [], numbers: [], scatters: [] },
    })
    const result = radarData(informe, [], matrix, defs)
    expect(result.series.map(s => s.color)).toEqual(['#22C55E', '#F5C451', '#38BDF8'])
  })

  it('omite ejes cuya def no existe', () => {
    const defs = [makeDef({ key: 'goals', label: 'Goles' })]
    const matrix = { goals: [5] }
    const informe = makeInforme({
      charts: { radar: ['goals', 'missing'], bar: [], numbers: [], scatters: [] },
    })
    const result = radarData(informe, [], matrix, defs)
    expect(result.axes).toEqual(['Goles'])
    expect(result.series[0].values).toHaveLength(1)
  })
})

describe('barsData', () => {
  it('mapea dot/rank/value desde MetricStat', () => {
    const def = makeDef({ key: 'goals', label: 'Goles', unit: '' })
    const stats: MetricStat[] = [
      { def, value: 5, avg: 3, percentile: 80, color: 'green', rank: 1, total: 5 },
    ]
    const rows = barsData(stats, ['goals'])
    expect(rows).toEqual([{ label: 'Goles', pct: 80, value: '5.00', rank: 'N°1/5', dot: 'green' }])
  })

  it('formatea porcentaje con unit %', () => {
    const def = makeDef({ key: 'pct', label: 'Duelos ganados', unit: '%' })
    const stats: MetricStat[] = [
      { def, value: 62.4, avg: 50, percentile: 70, color: 'green', rank: 2, total: 8 },
    ]
    const rows = barsData(stats, ['pct'])
    expect(rows[0].value).toBe('62%')
  })

  it('usa valores por defecto cuando no hay dato', () => {
    const def = makeDef({ key: 'goals', label: 'Goles' })
    const stats: MetricStat[] = [
      { def, value: null, avg: null, percentile: null, color: 'neutral', rank: null, total: 0 },
    ]
    const rows = barsData(stats, ['goals'])
    expect(rows[0]).toMatchObject({ pct: 0, value: '—', rank: 's/d', dot: 'neutral' })
  })

  it('ignora keys sin stat correspondiente', () => {
    const rows = barsData([], ['no-existe'])
    expect(rows).toEqual([])
  })
})

describe('scatterData', () => {
  it('saltea pares con null/NaN y marca al protagonista', () => {
    const defs = [makeDef({ key: 'x', label: 'X' }), makeDef({ key: 'y', label: 'Y' })]
    const matrix = { x: [1, null, 3], y: [2, 4, NaN] }
    const scatter: ScatterAssignment = { xKey: 'x', yKey: 'y', caption: '' }
    const result = scatterData(scatter, matrix, defs, 0)
    expect(result.points).toEqual([{ x: 1, y: 2, me: true }])
    expect(result.xLabel).toBe('X')
    expect(result.yLabel).toBe('Y')
  })

  it('propaga xMin/yMin desde el scatter assignment', () => {
    const defs: MetricDef[] = []
    const matrix = { x: [1], y: [2] }
    const scatter: ScatterAssignment = { xKey: 'x', yKey: 'y', caption: '', xMin: 0.5, yMin: 1 }
    const result = scatterData(scatter, matrix, defs, 0)
    expect(result.xMin).toBe(0.5)
    expect(result.yMin).toBe(1)
  })

  it('usa la key como label cuando falta la def', () => {
    const defs: MetricDef[] = []
    const matrix = { x: [1], y: [2] }
    const scatter: ScatterAssignment = { xKey: 'x', yKey: 'y', caption: '' }
    const result = scatterData(scatter, matrix, defs, 0)
    expect(result.xLabel).toBe('x')
    expect(result.yLabel).toBe('y')
  })
})
