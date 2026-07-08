import { describe, it, expect } from 'vitest'
import { applyDerived } from './derivedMetrics'
import type { MetricDef } from './types'

const def = (over: Partial<MetricDef> & { key: string; label: string }): MetricDef => ({
  short: over.label,
  unit: '',
  higherIsBetter: true,
  ...over,
})

describe('applyDerived - completados genérico (volumen /90 x %)', () => {
  it('crea "Pases progresivos completados /90" = Pases progresivos/90 * %/100', () => {
    const defs = [
      def({ key: 'prog_passes_p90', label: 'Pases progresivos /90', unit: '/90', sourceHeader: 'Pases progresivos/90' }),
      def({ key: 'prog_passes_acc_pct', label: 'Precisión pases progresivos, %', unit: '%', sourceHeader: 'Precisión pases progresivos, %' }),
    ]
    const matrix = { prog_passes_p90: [10, 5], prog_passes_acc_pct: [80, 60] }
    const out = applyDerived(defs, matrix)

    const key = 'derived_completed_prog_passes_p90'
    expect(out.matrix[key]).toEqual([8, 3])
    const d = out.defs.find(x => x.key === key)
    expect(d).toBeDefined()
    expect(d?.derived).toBe(true)
    expect(d?.unit).toBe('/90')
    expect(d?.label).toContain('Pases progresivos completados')
  })

  it('NO crea completados si solo existe el /90 sin su % correspondiente', () => {
    const defs = [def({ key: 'prog_passes_p90', label: 'Pases progresivos /90', unit: '/90', sourceHeader: 'Pases progresivos/90' })]
    const matrix = { prog_passes_p90: [10, 5] }
    const out = applyDerived(defs, matrix)
    expect(out.defs.some(d => d.key.startsWith('derived_completed_'))).toBe(false)
  })

  it('crea gambetas completadas/90 a partir de Regates/90 + Regates realizados, %', () => {
    const defs = [
      def({ key: 'dribbles_p90', label: 'Regates /90', unit: '/90', sourceHeader: 'Regates/90' }),
      def({ key: 'dribbles_pct', label: 'Regates completados, %', unit: '%', sourceHeader: 'Regates realizados, %' }),
    ]
    const matrix = { dribbles_p90: [4, 2], dribbles_pct: [50, 100] }
    const out = applyDerived(defs, matrix)
    expect(out.matrix['derived_completed_dribbles_p90']).toEqual([2, 2])
    expect(out.defs.some(d => d.key === 'derived_completed_dribbles_p90' && d.derived)).toBe(true)
  })

  it('prefiere el match más específico: Duelos defensivos/90 usa Duelos defensivos ganados %, no Duelos ganados %', () => {
    const defs = [
      def({ key: 'duels_p90', label: 'Duelos /90', unit: '/90', sourceHeader: 'Duelos/90' }),
      def({ key: 'duels_won_pct', label: 'Duelos ganados, %', unit: '%', sourceHeader: 'Duelos ganados, %' }),
      def({ key: 'def_duels_p90', label: 'Duelos defensivos /90', unit: '/90', sourceHeader: 'Duelos defensivos/90' }),
      def({ key: 'def_duels_won_pct', label: 'Duelos defensivos ganados, %', unit: '%', sourceHeader: 'Duelos defensivos ganados, %' }),
    ]
    const matrix = {
      duels_p90: [10],
      duels_won_pct: [50],
      def_duels_p90: [4],
      def_duels_won_pct: [75],
    }
    const out = applyDerived(defs, matrix)
    expect(out.matrix['derived_completed_duels_p90']).toEqual([5]) // 10 * 50%
    expect(out.matrix['derived_completed_def_duels_p90']).toEqual([3]) // 4 * 75%
  })

  it('no crea derivada si el label ya indica que es un valor completado/exitoso', () => {
    const defs = [
      def({ key: 'weird_p90', label: 'Pases exitosos /90', unit: '/90', sourceHeader: 'Pases exitosos/90' }),
      def({ key: 'weird_pct', label: 'Precisión pases, %', unit: '%', sourceHeader: 'Precisión pases, %' }),
    ]
    const matrix = { weird_p90: [10], weird_pct: [80] }
    const out = applyDerived(defs, matrix)
    expect(out.defs.some(d => d.key === 'derived_completed_weird_p90')).toBe(false)
  })
})

describe('applyDerived - diffs real vs esperado', () => {
  it('crea Goles - xG como métrica divergente', () => {
    const defs = [
      def({ key: 'goals', label: 'Goles', sourceHeader: 'Goles' }),
      def({ key: 'xg', label: 'xG', sourceHeader: 'xG' }),
    ]
    const matrix = { goals: [2, 1], xg: [0.71, 1.4] }
    const out = applyDerived(defs, matrix)
    expect(out.matrix['goals_minus_xg'][0]).toBeCloseTo(1.29)
    expect(out.matrix['goals_minus_xg'][1]).toBeCloseTo(-0.4)
    expect(out.defs.find(d => d.key === 'goals_minus_xg')?.diverging).toBe(true)
  })

  it('crea Asistencias - xA como métrica divergente', () => {
    const defs = [
      def({ key: 'assists', label: 'Asistencias', sourceHeader: 'Asistencias' }),
      def({ key: 'xa', label: 'xA', sourceHeader: 'xA' }),
    ]
    const matrix = { assists: [3, 0], xa: [1.2, 0.9] }
    const out = applyDerived(defs, matrix)
    expect(out.matrix['assists_minus_xa'][0]).toBeCloseTo(1.8)
    expect(out.matrix['assists_minus_xa'][1]).toBeCloseTo(-0.9)
    expect(out.defs.find(d => d.key === 'assists_minus_xa')?.diverging).toBe(true)
  })

  it('no crea la derivada si falta un input', () => {
    const defs = [def({ key: 'goals', label: 'Goles', sourceHeader: 'Goles' })]
    const matrix = { goals: [2] }
    const out = applyDerived(defs, matrix)
    expect(out.matrix['goals_minus_xg']).toBeUndefined()
  })

  it('no crea la derivada si un require esta en defs pero no en la matriz', () => {
    const defs = [
      def({ key: 'goals', label: 'Goles', sourceHeader: 'Goles' }),
      def({ key: 'xg', label: 'xG', sourceHeader: 'xG' }),
    ]
    const matrix = { goals: [2, 1] } // falta la columna 'xg'
    const out = applyDerived(defs, matrix)
    expect(out.matrix['goals_minus_xg']).toBeUndefined()
  })

  it('no confunde "Goles recibidos" ni "Goles esperados" con la métrica base de Goles', () => {
    const defs = [
      def({ key: 'goals', label: 'Goles', sourceHeader: 'Goles' }),
      def({ key: 'xg', label: 'xG', sourceHeader: 'Goles esperados' }),
      def({ key: 'goals_conceded_p90', label: 'Goles recibidos /90', unit: '/90', sourceHeader: 'Goles recibidos/90' }),
    ]
    const matrix = { goals: [2], xg: [1.1], goals_conceded_p90: [0.5] }
    const out = applyDerived(defs, matrix)
    expect(out.matrix['goals_minus_xg'][0]).toBeCloseTo(0.9)
  })
})
