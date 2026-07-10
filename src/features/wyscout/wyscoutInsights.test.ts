import { describe, it, expect } from 'vitest'
import { buildInsights } from './wyscoutInsights'
import type { WyscoutMetric, WyscoutPoint } from '@/services/wyscoutEvolutionService'

const ratio: WyscoutMetric = { key: 'pases', label: 'Pases / logrados', type: 'ratio', unit: '%', attemptsIdx: 5, achievedIdx: 6 }
const count: WyscoutMetric = { key: 'goles', label: 'Goles', type: 'simple', unit: '', attemptsIdx: 7, achievedIdx: null }

function pts(vals: (number | null)[]): WyscoutPoint[] {
  return vals.map((v, i) => ({ date: `2024-01-${String(i + 1).padStart(2, '0')}`, matchLabel: `M${i}`, competition: 'X', value: v }))
}

describe('buildInsights', () => {
  it('detecta racha sin marcar en métrica de conteo', () => {
    const out = buildInsights(pts([1, 0, 0, 0, 0]), count)
    expect(out.join(' ')).toMatch(/Hace 4 partidos que no/i)
  })
  it('detecta caída de tendencia en %', () => {
    const out = buildInsights(pts([85, 84, 60, 55]), ratio)
    expect(out.join(' ')).toMatch(/baj/i)
  })
  it('serie vacía => sin insights', () => {
    expect(buildInsights([], ratio)).toEqual([])
  })
})
