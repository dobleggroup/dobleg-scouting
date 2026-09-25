import { describe, it, expect } from 'vitest'
import { wonPer90, metricValue, rankBy, filterByMinutes, squadProfile } from './squadMetrics'
import type { SquadPlayer } from './wyscoutSquadTypes'

function player(name: string, stats: SquadPlayer['stats'], extra: Partial<SquadPlayer> = {}): SquadPlayer {
  return { name, team: 'Temperley', positions: [], age: null, birthCountry: null, passports: [], foot: null, heightCm: null, stats, ...extra }
}

describe('wonPer90', () => {
  it('multiplica por el porcentaje', () => {
    expect(wonPer90(13.77, 40.65)).toBeCloseTo(5.6, 2)
  })
  it('null si falta un dato', () => {
    expect(wonPer90(null, 40)).toBeNull()
    expect(wonPer90(10, undefined)).toBeNull()
  })
})

describe('metricValue', () => {
  const p = player('A', { minutes: 1399, goals: 7, xg: 2.52, assists: 1, xa: 1.33, goals_p90: 0.45, assists_p90: 0.06, off_duels_p90: 4.76, off_duels_won_pct: 35.14 })
  it('derivadas', () => {
    expect(metricValue(p, 'goals_minus_xg', 31)).toBeCloseTo(4.48)
    expect(metricValue(p, 'assists_minus_xa', 31)).toBeCloseTo(-0.33)
    expect(metricValue(p, 'goal_involvement_p90', 31)).toBeCloseTo(0.51)
    expect(metricValue(p, 'off_duels_won_p90', 31)).toBeCloseTo(1.673, 2)
    expect(metricValue(p, 'minutes_share_pct', 31)).toBeCloseTo(1399 / (31 * 90) * 100)
  })
  it('directas y faltantes', () => {
    expect(metricValue(p, 'goals', 31)).toBe(7)
    expect(metricValue(p, 'crosses_p90', 31)).toBeNull()
    expect(metricValue(p, 'minutes_share_pct', 0)).toBeNull()
  })
})

describe('rankBy', () => {
  const players = [
    player('Titular', { minutes: 1500, goals: 3, goals_p90: 0.18 }),
    player('Pibe', { minutes: 20, goals: 1, goals_p90: 4.5 }),
    player('Suplente', { minutes: 500, goals: 3, goals_p90: 0.54 }),
    player('SinDato', { minutes: 900, goals: null, goals_p90: null }),
  ]
  it('en /90 respeta el minimo de minutos', () => {
    const r = rankBy(players, 'goals_p90', { teamMatches: 31, minMinutes: 450, perMinuteMetric: true })
    expect(r.map(x => x.name)).toEqual(['Suplente', 'Titular'])
  })
  it('en totales entran todos, sin nulls, empate por nombre', () => {
    const r = rankBy(players, 'goals', { teamMatches: 31, minMinutes: 450, perMinuteMetric: false })
    expect(r.map(x => x.name)).toEqual(['Suplente', 'Titular', 'Pibe'])
  })
  it('limit', () => {
    expect(rankBy(players, 'goals', { teamMatches: 31, minMinutes: 0, perMinuteMetric: false, limit: 1 })).toHaveLength(1)
  })
  it('jugador sin minutos no rompe', () => {
    const r = rankBy([player('Cero', { minutes: 0, goals_p90: null })], 'goals_p90', { teamMatches: 31, minMinutes: 0, perMinuteMetric: true })
    expect(r).toEqual([])
  })
})

describe('filterByMinutes', () => {
  it('filtra', () => {
    const ps = [player('A', { minutes: 100 }), player('B', { minutes: 450 }), player('C', { minutes: null })]
    expect(filterByMinutes(ps, 450).map(p => p.name)).toEqual(['B'])
  })
})

describe('squadProfile', () => {
  it('promedios, pie y doble pasaporte', () => {
    const ps = [
      player('F. Brandán', {}, { age: 36, heightCm: 165, foot: 'derecho', passports: ['Argentina', 'Romania'] }),
      player('P. Souto', {}, { age: 26, heightCm: 178, foot: 'izquierdo', passports: ['Argentina'] }),
      player('X', {}, { age: null, heightCm: null, foot: null }),
    ]
    const prof = squadProfile(ps)
    expect(prof.avgAge).toBe(31)
    expect(prof.avgHeight).toBe(171.5)
    expect(prof.foot).toEqual({ derecho: 1, izquierdo: 1 })
    expect(prof.dualPassport).toEqual([{ name: 'F. Brandán', passports: ['Argentina', 'Romania'] }])
  })
})
