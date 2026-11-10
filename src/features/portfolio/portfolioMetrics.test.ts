import { describe, it, expect } from 'vitest'
import { computeTotalSeries, seriesChange, sliceSeries, valueAt, valueByContract, valueByCountry, valueByPosition, positionGroup, type SharePlayer } from './portfolioMetrics'

describe('computeTotalSeries', () => {
  const today = '2026-03-15'

  it('termina en el valor vivo y mantiene el valor entre registros', () => {
    const s = computeTotalSeries([{ currentValue: 300, hasCareerHistory: true, history: [
      { date: '2026-01-10', value: 100 }, { date: '2026-02-20', value: 200 },
    ] }], today)
    expect(s).toEqual([
      { date: '2026-01-31', total: 100 },
      { date: '2026-02-28', total: 200 },
      { date: today, total: 300 },
    ])
  })

  it('un jugador sin historial no genera un salto en el total', () => {
    const s = computeTotalSeries([
      { currentValue: 100, hasCareerHistory: true, history: [{ date: '2026-01-10', value: 100 }] },
      { currentValue: 2000, hasCareerHistory: false, history: [] },
    ], today)
    expect(s.map(p => p.total)).toEqual([2100, 2100, 2100])
  })

  it('con la carrera cargada, antes de su primer valor cuenta 0', () => {
    expect(valueAt({ currentValue: 5, hasCareerHistory: true, history: [{ date: '2026-02-01', value: 5 }] }, '2026-01-01')).toBe(0)
  })

  it('sin carrera cargada, usa su primer registro hacia atrás', () => {
    expect(valueAt({ currentValue: 9, hasCareerHistory: false, history: [{ date: '2026-02-01', value: 5 }] }, '2026-01-01')).toBe(5)
  })
})

describe('período y variación', () => {
  const series = [
    { date: '2023-12-31', total: 50 },
    { date: '2025-12-31', total: 100 },
    { date: '2026-01-31', total: 110 },
    { date: '2026-03-15', total: 120 },
  ]
  it('recorta el último año', () => {
    expect(sliceSeries(series, '1y', '2026-03-15').map(p => p.total)).toEqual([100, 110, 120])
  })
  it('calcula la variación punta a punta', () => {
    expect(seriesChange([{ date: 'a', total: 100 }, { date: 'b', total: 120 }])).toBeCloseTo(20)
    expect(seriesChange([{ date: 'a', total: 0 }, { date: 'b', total: 120 }])).toBeNull()
  })
})

describe('repartos', () => {
  const players: SharePlayer[] = [
    { name: 'A', value: 75, position: 'Volante interno', monthsRemaining: 5 },
    { name: 'B', value: 25, position: 'Defensor central', monthsRemaining: 30 },
    { name: 'C', value: 0, position: 'Arquero', monthsRemaining: null },
  ]
  it('reparte por posición sin contar a los que no tienen valor', () => {
    expect(valueByPosition(players).map(s => [s.id, s.share])).toEqual([['def', 0.25], ['med', 0.75]])
  })
  it('reparte por contrato', () => {
    expect(valueByContract(players).map(s => [s.id, s.count])).toEqual([['m6', 1], ['mas', 1]])
  })
  it('un contrato ya vencido no cuenta como próximo a vencer', () => {
    expect(valueByContract([{ name: 'A', value: 5, position: '', monthsRemaining: -5 }]).map(s => s.id)).toEqual(['nd'])
  })
  it('no confunde un volante central con un defensor', () => {
    expect(positionGroup('Volante central')).toBe('med')
    expect(positionGroup('Defensor central')).toBe('def')
  })
})

describe('valueByCountry', () => {
  it('separa sin club y sin dato, y ordena por valor', () => {
    const r = valueByCountry([
      { name: 'A', value: 1000, country: 'Mexico', noClub: false },
      { name: 'B', value: 10, country: 'Bolivia', noClub: false },
      { name: 'C', value: 50, country: null, noClub: true },
      { name: 'D', value: 40, country: null, noClub: false },
    ])
    expect(r.rows.map(x => [x.country, x.level])).toEqual([['Mexico', 4], ['Bolivia', 0]])
    expect(r.noClub).toEqual({ value: 50, count: 1 })
    expect(r.unknown).toEqual({ value: 40, count: 1 })
  })
})
