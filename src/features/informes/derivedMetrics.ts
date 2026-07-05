import type { MetricDef } from './types'

export interface DerivedRule {
  def: MetricDef
  requires: string[]
  compute: (m: Record<string, number>) => number
}

export const DERIVED_RULES: DerivedRule[] = [
  {
    def: { key: 'dribbles_completed_p90', label: 'Gambetas completadas /90', short: 'GamC/90', unit: '/90', higherIsBetter: true, derived: true },
    requires: ['dribbles_p90', 'dribbles_pct'],
    compute: m => m.dribbles_p90 * (m.dribbles_pct / 100),
  },
  {
    def: { key: 'goals_minus_xg', label: 'Goles − xG', short: 'G−xG', unit: '', higherIsBetter: true, diverging: true, derived: true },
    requires: ['goals', 'xg'],
    compute: m => m.goals - m.xg,
  },
  {
    def: { key: 'assists_minus_xa', label: 'Asistencias − xA', short: 'A−xA', unit: '', higherIsBetter: true, diverging: true, derived: true },
    requires: ['assists', 'xa'],
    compute: m => m.assists - m.xa,
  },
  {
    def: { key: 'shots_on_p90', label: 'Remates al arco /90', short: 'RA/90', unit: '/90', higherIsBetter: true, derived: true },
    requires: ['shots_p90', 'shots_on_pct'],
    compute: m => m.shots_p90 * (m.shots_on_pct / 100),
  },
  {
    def: { key: 'duels_won_p90', label: 'Duelos ganados /90', short: 'DG/90', unit: '/90', higherIsBetter: true, derived: true },
    requires: ['duels_p90', 'duels_won_pct'],
    compute: m => m.duels_p90 * (m.duels_won_pct / 100),
  },
]

export function applyDerived(
  baseDefs: MetricDef[],
  matrix: Record<string, (number | null)[]>,
): { defs: MetricDef[]; matrix: Record<string, (number | null)[]> } {
  const defs = [...baseDefs]
  const outMatrix: Record<string, (number | null)[]> = { ...matrix }
  const columns = Object.values(matrix)
  const rowCount = columns.length ? Math.max(...columns.map(c => c.length)) : 0
  const present = new Set(baseDefs.map(d => d.key))

  for (const rule of DERIVED_RULES) {
    if (!rule.requires.every(k => present.has(k) && k in matrix)) continue
    const col: (number | null)[] = []
    for (let i = 0; i < rowCount; i++) {
      const inputs: Record<string, number> = {}
      let ok = true
      for (const k of rule.requires) {
        const v = matrix[k][i]
        if (v == null || Number.isNaN(v)) { ok = false; break }
        inputs[k] = v
      }
      col.push(ok ? rule.compute(inputs) : null)
    }
    outMatrix[rule.def.key] = col
    defs.push(rule.def)
  }
  return { defs, matrix: outMatrix }
}
