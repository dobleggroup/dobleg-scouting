import { describe, it, expect } from 'vitest'
import { percentile, computeStats } from './computeStats'
import type { MetricDef } from './types'

const def = (over: Partial<MetricDef>): MetricDef => ({ key: 'k', label: 'k', short: 'k', unit: '', higherIsBetter: true, ...over })

describe('percentile', () => {
  it('mayor-es-mejor: el máximo da 100', () => {
    expect(percentile([1, 2, 3, 4], 4, true)).toBe(100)
    expect(percentile([1, 2, 3, 4], 1, true)).toBe(0)
  })
  it('menor-es-mejor invierte', () => {
    expect(percentile([1, 2, 3, 4], 1, false)).toBe(100)
  })
})

describe('computeStats', () => {
  const defs = [def({ key: 'goals' }), def({ key: 'gc', higherIsBetter: false }), def({ key: 'gmx', diverging: true })]
  const matrix = { goals: [3, 1, 2], gc: [1, 2, 3], gmx: [0.5, -0.3, 0.0] }

  it('protagonista (idx 0) arriba del promedio en goals => verde y rank 1', () => {
    const stats = computeStats(defs, matrix, 0)
    const g = stats.find(s => s.def.key === 'goals')!
    expect(g.color).toBe('green')
    expect(g.rank).toBe(1)
    expect(g.total).toBe(3)
    expect(g.value).toBe(3)
  })

  it('métrica divergente colorea por signo', () => {
    const pos = computeStats(defs, matrix, 0).find(s => s.def.key === 'gmx')!
    const neg = computeStats(defs, matrix, 1).find(s => s.def.key === 'gmx')!
    expect(pos.color).toBe('green')  // +0.5
    expect(neg.color).toBe('red')    // -0.3
  })
})
