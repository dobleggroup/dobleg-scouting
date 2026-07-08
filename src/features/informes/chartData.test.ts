import { describe, it, expect } from 'vitest'
import { getRowName, radarData, radarComparisonData, barsData, scatterData, suggestAxisFloor, comparisonTable, comparisonWinCounts, parseRating, ratingMax, topStrengths } from './chartData'
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
  it('arma protagonista + promedio del pool, con percentiles por eje', () => {
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
      charts: { radar: ['goals', 'assists'], bar: [], numbers: [], scatters: [] },
    })

    const result = radarData(informe, [] as MetricStat[], matrix, defs)

    expect(result.axes).toEqual(['Goles', 'Asistencias'])
    expect(result.series).toHaveLength(2)
    expect(result.droppedCount).toBe(0)
    expect(result.series[0]).toMatchObject({ name: 'A', color: '#22C55E' })
    // Segunda serie: referencia "Promedio del grupo", punteada y sin relleno.
    expect(result.series[1]).toMatchObject({ name: 'Promedio del grupo', dashed: true, fill: false })
    // A tiene el valor mas alto en ambos ejes => percentil 100
    expect(result.series[0].values).toEqual([100, 100])
    // Referencia = jugador promedio: percentil del promedio real del pool por eje.
    // goles [10,1,5] → media 5.33 supera a 2 de 3 => 100; asistencias [8,0,4] → media 4 supera a 1 de 3 => 50.
    expect(result.series[1].values).toEqual([100, 50])
  })

  it('omite del radar las métricas sin variación en el pool (evita el pinchado)', () => {
    const defs = [
      makeDef({ key: 'goals', label: 'Goles' }),
      makeDef({ key: 'altura', label: 'Altura' }),
    ]
    // 'altura' es 0 para todos => sin variación => se descarta.
    const matrix = { goals: [3, 1, 2], altura: [0, 0, 0] }
    const informe = makeInforme({
      headers: ['Jugador'],
      rows: [{ Jugador: 'A' }, { Jugador: 'B' }, { Jugador: 'C' }],
      charts: { radar: ['goals', 'altura'], bar: [], numbers: [], scatters: [] },
    })
    const result = radarData(informe, [], matrix, defs)
    expect(result.axes).toEqual(['Goles'])
    expect(result.droppedCount).toBe(1)
  })

  it('ignora comparePlayerIndices en el radar (no superpone jugadores)', () => {
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
    // Solo protagonista + promedio, sin importar cuántos jugadores se elijan para comparar.
    expect(result.series).toHaveLength(2)
    expect(result.series.map(s => s.color)).toEqual(['#22C55E', '#9AA3AE'])
  })

  it('omite ejes cuya def no existe', () => {
    const defs = [makeDef({ key: 'goals', label: 'Goles' })]
    const matrix = { goals: [5, 3] }
    const informe = makeInforme({
      charts: { radar: ['goals', 'missing'], bar: [], numbers: [], scatters: [] },
    })
    const result = radarData(informe, [], matrix, defs)
    expect(result.axes).toEqual(['Goles'])
    expect(result.series[0].values).toHaveLength(1)
  })
})

describe('radarComparisonData', () => {
  it('superpone protagonista + comparados con colores en orden, sin promedio', () => {
    const defs = [
      makeDef({ key: 'goals', label: 'Goles' }),
      makeDef({ key: 'assists', label: 'Asistencias' }),
      makeDef({ key: 'duels', label: 'Duelos' }),
    ]
    const matrix = { goals: [5, 3, 1], assists: [4, 2, 0], duels: [9, 6, 3] }
    const informe = makeInforme({
      headers: ['Jugador'],
      rows: [{ Jugador: 'A' }, { Jugador: 'B' }, { Jugador: 'C' }],
      protagonistIndex: 0,
      comparePlayerIndices: [1, 2],
      charts: { radar: ['goals', 'assists', 'duels'], bar: [], numbers: [], scatters: [] },
    })
    const result = radarComparisonData(informe, matrix, defs)
    expect(result.series).toHaveLength(3)
    expect(result.series.map(s => s.color)).toEqual(['#22C55E', '#F5C451', '#38BDF8'])
    expect(result.series.map(s => s.name)).toEqual(['A', 'B', 'C'])
  })
})

describe('comparisonWinCounts', () => {
  it('cuenta las métricas ganadas por cada jugador', () => {
    const defs = [
      makeDef({ key: 'goals', label: 'Goles' }),
      makeDef({ key: 'assists', label: 'Asistencias' }),
    ]
    const matrix = { goals: [5, 1], assists: [0, 4] }
    const informe = makeInforme({
      headers: ['Jugador'],
      rows: [{ Jugador: 'A' }, { Jugador: 'B' }],
      protagonistIndex: 0,
      comparePlayerIndices: [1],
      charts: { radar: ['goals', 'assists'], bar: [], numbers: [], scatters: [] },
    })
    const table = comparisonTable(informe, matrix, defs)
    const { wins, total } = comparisonWinCounts(table)
    expect(total).toBe(2)
    // A gana goles (5>1), B gana asistencias (4>0) => 1 cada uno.
    expect(wins.map(w => w.wins)).toEqual([1, 1])
    expect(wins.map(w => w.name)).toEqual(['A', 'B'])
  })
})

describe('parseRating / ratingMax', () => {
  it('parsea números con coma, punto o sufijo', () => {
    expect(parseRating('7,4')).toBe(7.4)
    expect(parseRating('8.1/10')).toBe(8.1)
    expect(parseRating('82')).toBe(82)
    expect(parseRating('')).toBeNull()
    expect(parseRating('s/d')).toBeNull()
  })
  it('escala automática: ≤10 sobre 10, si no sobre 100', () => {
    expect(ratingMax(7.4)).toBe(10)
    expect(ratingMax(10)).toBe(10)
    expect(ratingMax(82)).toBe(100)
  })
})

describe('topStrengths', () => {
  it('devuelve las métricas con percentil alto, ordenadas', () => {
    const mk = (key: string, label: string, percentile: number): MetricStat => ({
      def: makeDef({ key, label }), value: 1, avg: 0, avgPercentile: 50, percentile, color: 'green', rank: 1, total: 10,
    })
    const stats = [mk('a', 'Alta', 90), mk('b', 'Media', 40), mk('c', 'Buena', 70)]
    expect(topStrengths(stats, ['a', 'b', 'c'], 3)).toEqual(['Alta', 'Buena'])
  })
})

describe('scatterData dirección', () => {
  it('propaga higherIsBetter de cada eje', () => {
    const defs = [
      makeDef({ key: 'x', label: 'X', higherIsBetter: true }),
      makeDef({ key: 'y', label: 'Y', higherIsBetter: false }),
    ]
    const matrix = { x: [1, 2], y: [3, 4] }
    const res = scatterData({ xKey: 'x', yKey: 'y', caption: '' }, matrix, defs, 0)
    expect(res.xHigherIsBetter).toBe(true)
    expect(res.yHigherIsBetter).toBe(false)
  })
})

describe('barsData', () => {
  it('mapea dot/rank/value desde MetricStat', () => {
    const def = makeDef({ key: 'goals', label: 'Goles', unit: '' })
    const stats: MetricStat[] = [
      { def, value: 5, avg: 3, avgPercentile: 40, percentile: 80, color: 'green', rank: 1, total: 5 },
    ]
    const rows = barsData(stats, ['goals'])
    expect(rows).toEqual([{ label: 'Goles', pct: 80, avgPct: 40, value: '5.00', rank: 'N°1/5', dot: 'green' }])
  })

  it('formatea porcentaje con unit %', () => {
    const def = makeDef({ key: 'pct', label: 'Duelos ganados', unit: '%' })
    const stats: MetricStat[] = [
      { def, value: 62.4, avg: 50, avgPercentile: 55, percentile: 70, color: 'green', rank: 2, total: 8 },
    ]
    const rows = barsData(stats, ['pct'])
    expect(rows[0].value).toBe('62%')
  })

  it('usa valores por defecto cuando no hay dato', () => {
    const def = makeDef({ key: 'goals', label: 'Goles' })
    const stats: MetricStat[] = [
      { def, value: null, avg: null, avgPercentile: null, percentile: null, color: 'neutral', rank: null, total: 0 },
    ]
    const rows = barsData(stats, ['goals'])
    expect(rows[0]).toMatchObject({ pct: 0, avgPct: null, value: '—', rank: 's/d', dot: 'neutral' })
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
