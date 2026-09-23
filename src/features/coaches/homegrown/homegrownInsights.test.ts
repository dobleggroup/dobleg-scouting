import { describe, it, expect } from 'vitest'
import { linearTrend, movingAverage, starterAgeByMatch, homegrownGoalsByMatch } from './homegrownInsights'
import type { MatchInput } from './homegrownMatchUsage'
import type { AgencyFixture, ApiFixtureEvent, ApiFixtureLineup } from '@/types/footballApi'

const TEAM = 454

function fixture(id: number, date: string): AgencyFixture {
  return {
    fixtureId: id, date, timestamp: Date.parse(date) / 1000, venue: '', city: '', status: '', statusShort: 'FT',
    elapsed: 90, leagueName: 'Primera Nacional', leagueLogo: '', leagueCountry: '', leagueFlag: null, round: '',
    homeTeam: { id: TEAM, name: 'Temperley', logo: '' }, awayTeam: { id: 1, name: 'Rival', logo: '' },
    goalsHome: 1, goalsAway: 0, isHome: true, players: [],
  }
}
function lineup(starters: number[]): ApiFixtureLineup {
  return {
    team: { id: TEAM, name: 'Temperley', logo: '' }, coach: null, formation: null,
    startXI: starters.map(id => ({ player: { id, name: `P${id}`, number: null, pos: null, grid: null } })), substitutes: [],
  }
}
function goal(playerId: number, minute: number, detail = 'Normal Goal', teamId = TEAM): ApiFixtureEvent {
  return { time: { elapsed: minute, extra: null }, team: { id: teamId, name: '', logo: '' },
    player: { id: playerId, name: `P${playerId}` }, assist: { id: null, name: null }, type: 'Goal', detail, comments: null }
}

describe('linearTrend', () => {
  it('recta creciente: valor ajustado al principio y al final', () => {
    const t = linearTrend([1, 2, 3, 4, 5])!
    expect(t.start).toBeCloseTo(1)
    expect(t.end).toBeCloseTo(5)
    expect(t.slope).toBeCloseTo(1)
  })
  it('ignora los partidos sin dato', () => {
    const t = linearTrend([2, null, 2, null, 2])!
    expect(t.slope).toBeCloseTo(0)
    expect(t.start).toBeCloseTo(2)
  })
  it('con menos de 3 valores no hay tendencia', () => {
    expect(linearTrend([1, 2])).toBeNull()
  })
})

describe('movingAverage', () => {
  it('promedio de los últimos N (menos al principio)', () => {
    expect(movingAverage([2, 4, 6, 8], 3)).toEqual([2, 3, 4, 6])
  })
  it('los nulls no cuentan ni rompen', () => {
    expect(movingAverage([2, null, 4], 3)).toEqual([2, 2, 3])
  })
})

describe('starterAgeByMatch', () => {
  it('edad promedio de los titulares a la fecha del partido', () => {
    const births = new Map(Array.from({ length: 11 }, (_, i) => [i + 1, i < 5 ? '2000-01-01' : '2006-01-01'] as [number, string]))
    const matches: MatchInput[] = [{ fixture: fixture(10, '2026-07-01T20:00:00Z'), lineup: lineup(Array.from({ length: 11 }, (_, i) => i + 1)), events: [] }]
    const [row] = starterAgeByMatch(matches, TEAM, births)
    // 5 de 26 años + 6 de 20 años = 22,7
    expect(row.fixtureId).toBe(10)
    expect(row.known).toBe(11)
    expect(row.avgAge).toBeCloseTo((5 * 26.5 + 6 * 20.5) / 11, 1)
  })
  it('con menos de 8 titulares con fecha de nacimiento no se informa', () => {
    const births = new Map([[1, '2000-01-01'], [2, '2000-01-01']])
    const [row] = starterAgeByMatch([{ fixture: fixture(10, '2026-07-01T20:00:00Z'), lineup: lineup([1, 2, 3]), events: [] }], TEAM, births)
    expect(row.avgAge).toBeNull()
  })
})

describe('homegrownGoalsByMatch', () => {
  it('cuenta goles de chicos del club (no en contra, no del rival) con el id canónico', () => {
    const index = new Map([[7, { id: 7, name: 'Nicolás Ávalos' }], [70, { id: 7, name: 'Nicolás Ávalos' }]])
    const matches: MatchInput[] = [{
      fixture: fixture(10, '2026-07-01T20:00:00Z'), lineup: lineup([7]),
      events: [goal(70, 12), goal(7, 55), goal(7, 60, 'Own Goal'), goal(9, 70), goal(7, 80, 'Normal Goal', 99)],
    }]
    const goals = homegrownGoalsByMatch(matches, TEAM, index)
    expect(goals.get(10)).toEqual([
      { playerId: 7, name: 'Nicolás Ávalos', minute: 12 },
      { playerId: 7, name: 'Nicolás Ávalos', minute: 55 },
    ])
  })
})
