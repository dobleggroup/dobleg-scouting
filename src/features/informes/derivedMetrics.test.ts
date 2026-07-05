import { describe, it, expect } from 'vitest'
import { applyDerived } from './derivedMetrics'
import type { MetricDef } from './types'

const baseDef = (key: string): MetricDef => ({ key, label: key, short: key, unit: '', higherIsBetter: true })

describe('applyDerived', () => {
  it('crea gambetas completadas/90 = regates/90 * %/100', () => {
    const defs = [baseDef('dribbles_p90'), baseDef('dribbles_pct')]
    const matrix = { dribbles_p90: [4, 2], dribbles_pct: [50, 100] }
    const out = applyDerived(defs, matrix)
    expect(out.matrix['dribbles_completed_p90']).toEqual([2, 2])
    expect(out.defs.some(d => d.key === 'dribbles_completed_p90' && d.derived)).toBe(true)
  })

  it('crea Goles - xG como métrica divergente', () => {
    const defs = [baseDef('goals'), baseDef('xg')]
    const matrix = { goals: [2, 1], xg: [0.71, 1.4] }
    const out = applyDerived(defs, matrix)
    expect(out.matrix['goals_minus_xg'][0]).toBeCloseTo(1.29)
    expect(out.matrix['goals_minus_xg'][1]).toBeCloseTo(-0.4)
    expect(out.defs.find(d => d.key === 'goals_minus_xg')?.diverging).toBe(true)
  })

  it('no crea la derivada si falta un input', () => {
    const defs = [baseDef('goals')]
    const matrix = { goals: [2] }
    const out = applyDerived(defs, matrix)
    expect(out.matrix['goals_minus_xg']).toBeUndefined()
  })

  it('no crea la derivada si un require esta en defs pero no en la matriz', () => {
    const defs = [baseDef('goals'), baseDef('xg')]
    const matrix = { goals: [2, 1] } // falta la columna 'xg'
    const out = applyDerived(defs, matrix)
    expect(out.matrix['goals_minus_xg']).toBeUndefined()
  })
})
