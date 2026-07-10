import { describe, it, expect } from 'vitest'
import { buildInsights } from './wyscoutInsights'
import type { WyscoutMetric, WyscoutPoint } from '@/services/wyscoutEvolutionService'

const ratio: WyscoutMetric = { key: 'pases', label: 'Pases / logrados', type: 'ratio', unit: '%', attemptsIdx: 5, achievedIdx: 6 }
const goles: WyscoutMetric = { key: 'goles', label: 'Goles', type: 'simple', unit: '', attemptsIdx: 7, achievedIdx: null }
const perdidas: WyscoutMetric = { key: 'balones_perdidos', label: 'Balones perdidos / propia mitad', type: 'simple', unit: '', attemptsIdx: 8, achievedIdx: null }

function pts(vals: (number | null)[]): WyscoutPoint[] {
  return vals.map((v, i) => ({ date: `2024-0${(i % 6) + 1}-01`, matchLabel: `M${i}`, competition: 'X', value: v }))
}
const text = (arr: { text: string }[]) => arr.map(i => i.text).join(' ')

describe('buildInsights', () => {
  const weekly = { mode: 'weekly' as const, lowerIsBetter: false }

  it('detecta racha sin marcar en métrica de conteo (tono negativo)', () => {
    const out = buildInsights(pts([1, 0, 0, 0, 0]), goles, weekly)
    expect(text(out)).toMatch(/Hace 4 partidos sin registrar goles/i)
    expect(out.find(i => /Hace 4/.test(i.text))!.tone).toBe('negative')
  })

  it('ratio redacta "eficacia en <base>" con concordancia (Su …)', () => {
    const duelos = { key: 'duelos', label: 'Duelos / ganados', type: 'ratio', unit: '%', attemptsIdx: 5, achievedIdx: 6 } as const
    const out = buildInsights(pts([55, 54, 45, 43]), duelos, weekly)
    expect(text(out)).toMatch(/Su eficacia en duelos totales/i)
    expect(text(out)).not.toMatch(/Su duelos/i)
  })

  it('caída de un % (más es mejor) => tono negativo', () => {
    const out = buildInsights(pts([85, 84, 60, 55]), ratio, weekly)
    const trend = out.find(i => /baj/i.test(i.text))!
    expect(trend).toBeTruthy()
    expect(trend.tone).toBe('negative')
  })

  it('caída de una métrica donde MENOS es mejor => tono positivo', () => {
    const out = buildInsights(pts([9, 8, 4, 3]), perdidas, { mode: 'weekly', lowerIsBetter: true })
    const trend = out.find(i => /baj/i.test(i.text))!
    expect(trend).toBeTruthy()
    expect(trend.tone).toBe('positive')
  })

  it('modo mensual redacta "meses"/"mes" en vez de "partidos"', () => {
    const out = buildInsights(pts([85, 84, 60, 55]), ratio, { mode: 'monthly', lowerIsBetter: false })
    expect(text(out)).toMatch(/mes/i)
    expect(text(out)).not.toMatch(/partido/i)
  })

  it('serie vacía o corta => sin insights', () => {
    expect(buildInsights([], ratio, weekly)).toEqual([])
    expect(buildInsights(pts([5, 6]), ratio, weekly)).toEqual([])
  })
})
