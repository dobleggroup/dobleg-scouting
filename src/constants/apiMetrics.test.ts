import { describe, it, expect } from 'vitest'
import { API_METRICS, METRICS_BY_POSITION, getMetricValue } from './apiMetrics'
import type { PlayerSeasonScore } from '@/types/scoring'

describe('apiMetrics', () => {
  it('cada métrica tiene label y unidad válida', () => {
    for (const m of API_METRICS) {
      expect(m.label.length).toBeGreaterThan(0)
      expect(['%', '/90', '']).toContain(m.unit)
    }
  })

  it('cada posición tiene métricas y son claves válidas del catálogo', () => {
    const valid = new Set(API_METRICS.map(m => m.key))
    for (const pos of Object.keys(METRICS_BY_POSITION) as (keyof typeof METRICS_BY_POSITION)[]) {
      expect(METRICS_BY_POSITION[pos].length).toBeGreaterThan(0)
      for (const k of METRICS_BY_POSITION[pos]) expect(valid.has(k)).toBe(true)
    }
  })

  it('getMetricValue lee el campo correcto y devuelve null si falta', () => {
    const s = { goals_p90: 0.7, duels_won_pct: 55, assists_p90: null } as unknown as PlayerSeasonScore
    expect(getMetricValue(s, 'goals_p90')).toBe(0.7)
    expect(getMetricValue(s, 'duels_won_pct')).toBe(55)
    expect(getMetricValue(s, 'assists_p90')).toBeNull()
    expect(getMetricValue(s, 'tackles_p90')).toBeNull()
  })
})
