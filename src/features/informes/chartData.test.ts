import { describe, it, expect } from 'vitest'
import { getRowName, radarData, barsData, scatterData, suggestAxisFloor, comparisonTable } from './chartData'
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

describe('comparisonTable', () => {
  it('arma jugadores (protagonista + comparados) con colores y filas desde el radar', () => {
    const defs = [
      makeDef({ key: 'goals', label: 'Goles', unit: '', higherIsBetter: true }),
      makeDef({ key: 'pct', label: 'Duelos ganados', unit: '%', higherIsBetter: true }),
    ]
    const matrix = {
      goals: [10, 4],
      pct: [55.4, 70.2],
    }
    const informe = makeInforme({
      headers: ['Jugador'],
      rows: [{ Jugador: 'A' }, { Jugador: 'B' }],
      protagonistIndex: 0,
      comparePlayerIndices: [1],
      charts: { radar: ['goals', 'pct'], bar: [], numbers: [], scatters: [] },
    })

    const result = comparisonTable(informe, matrix, defs)

    expect(result.players).toEqual([
      { name: 'A', color: '#22C55E', idx: 0 },
      { name: 'B', color: '#F5C451', idx: 1 },
    ])
    expect(result.rows).toEqual([
      { label: 'Goles', cells: [{ value: '10.00', best: true }, { value: '4.00', best: false }] },
      { label: 'Duelos ganados', cells: [{ value: '55%', best: false }, { value: '70%', best: true }] },
    ])
  })

  it('respeta higherIsBetter: false al elegir el mejor valor', () => {
    const defs = [makeDef({ key: 'fouls', label: 'Faltas', higherIsBetter: false })]
    const matrix = { fouls: [8, 2] }
    const informe = makeInforme({
      protagonistIndex: 0,
      comparePlayerIndices: [1],
      charts: { radar: ['fouls'], bar: [], numbers: [], scatters: [] },
    })
    const result = comparisonTable(informe, matrix, defs)
    expect(result.rows[0].cells).toEqual([{ value: '8.00', best: false }, { value: '2.00', best: true }])
  })

  it('usa las metricas de barras si el radar esta vacio', () => {
    const defs = [makeDef({ key: 'assists', label: 'Asistencias' })]
    const matrix = { assists: [1, 3] }
    const informe = makeInforme({
      protagonistIndex: 0,
      comparePlayerIndices: [1],
      charts: { radar: [], bar: ['assists'], numbers: [], scatters: [] },
    })
    const result = comparisonTable(informe, matrix, defs)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].label).toBe('Asistencias')
  })

  it('marca "—" y ningun best cuando el valor falta', () => {
    const defs = [makeDef({ key: 'goals', label: 'Goles' })]
    const matrix = { goals: [null, 5] }
    const informe = makeInforme({
      protagonistIndex: 0,
      comparePlayerIndices: [1],
      charts: { radar: ['goals'], bar: [], numbers: [], scatters: [] },
    })
    const result = comparisonTable(informe, matrix, defs)
    expect(result.rows[0].cells).toEqual([{ value: '—', best: false }, { value: '5.00', best: true }])
  })

  it('devuelve rows vacio cuando radar y bar estan vacios', () => {
    const informe = makeInforme({
      charts: { radar: [], bar: [], numbers: [], scatters: [] },
    })
    const result = comparisonTable(informe, {}, [])
    expect(result.rows).toEqual([])
  })
})

describe('suggestAxisFloor', () => {
  it('devuelve el minimo de la columna redondeado hacia abajo a 1 decimal', () => {
    expect(suggestAxisFloor([12.37, 5.94, 8.1])).toBe(5.9)
  })

  it('ignora null/NaN', () => {
    expect(suggestAxisFloor([null, NaN, 3.21, null])).toBe(3.2)
  })

  it('devuelve null si no hay valores validos', () => {
    expect(suggestAxisFloor([null, NaN])).toBeNull()
    expect(suggestAxisFloor([])).toBeNull()
  })

  it('funciona igual para metricas de rango muy distinto (% vs por-90)', () => {
    expect(suggestAxisFloor([45.6, 60.2, 78.9])).toBe(45.6)
    expect(suggestAxisFloor([0.12, 0.45, 1.03])).toBe(0.1)
  })
})
