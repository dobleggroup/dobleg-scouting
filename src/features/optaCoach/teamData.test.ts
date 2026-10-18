import { describe, expect, it } from 'vitest'
import type { OptaMatch } from '@/features/opta/data'
import { TEAM_METRIC, formations, indexTeamMatches, metricValue, playerUsage, rankTeams, recordOf, rolling, teamGames, type TeamMatchBlock } from './teamData'

const match = (id: string, date: string, home: string, away: string, hs: number, as: number): OptaMatch => ({
  id, date, time: null, week: null, stage: 'Clausura', status: 'Played', home, away, hs, as, hxg: null, axg: null, venue: null,
})
const block: TeamMatchBlock = {
  updatedAt: '',
  cols: ['xg', 'totalPass', 'accuratePass', 'totalScoringAtt', 'ppda'],
  rows: [
    ['m1', 'riv', '4231', 2, 500, 450, 15, 8], ['m1', 'boc', '442', 0.5, 300, 240, 5, 12],
    ['m2', 'riv', '433', 1, 300, 240, 10, 10], ['m2', 'rac', '4231', 1.5, 400, 360, 12, 11],
  ],
  lineups: { m1: { riv: [['a', 1, 90, 1, 30, 40], ['b', 0, 20, 0, 70, 50]] }, m2: { riv: [['a', 1, 90, 1, 40, 60], ['b', 2, 70, 1, null, null]] } },
}
const matches = [match('m2', '2026-09-10', 'rac', 'riv', 2, 1), match('m1', '2026-09-01', 'riv', 'boc', 3, 0)]

describe('teamData', () => {
  const idx = indexTeamMatches(block)
  const games = teamGames(matches, idx, 'riv')

  it('arma los partidos del equipo en orden, con resultado y números del rival', () => {
    expect(games.map(g => [g.match.id, g.home, g.gf, g.ga, g.result, g.them.xg])).toEqual([['m1', true, 3, 0, 'G', 0.5], ['m2', false, 1, 2, 'P', 1.5]])
    expect(recordOf(games)).toMatchObject({ played: 2, won: 1, lost: 1, points: 3, gf: 4, ga: 2 })
  })

  it('promedia por partido y calcula porcentajes sobre las sumas', () => {
    expect(metricValue(TEAM_METRIC.get('xg')!, games)).toBe(1.5)
    expect(metricValue(TEAM_METRIC.get('xga')!, games)).toBe(1)
    expect(metricValue(TEAM_METRIC.get('passPct')!, games)).toBeCloseTo((690 / 800) * 100)
    expect(metricValue(TEAM_METRIC.get('xgPerShot')!, games)).toBeCloseTo(3 / 25)
  })

  it('el ranking respeta "menos es mejor"', () => {
    const byTeam = new Map([['riv', games], ['boc', teamGames(matches, idx, 'boc')], ['rac', teamGames(matches, idx, 'rac')]])
    const r = rankTeams(TEAM_METRIC.get('ppda')!, byTeam)
    expect(r.get('riv')).toMatchObject({ rank: 1, pct: 100 })
    expect(r.get('boc')).toMatchObject({ rank: 3, pct: 0 })
    expect(r.get('rac')).toMatchObject({ rank: 2, pct: 50 })
  })

  it('formaciones, uso de jugadores y promedio móvil', () => {
    expect(formations(games)).toEqual([{ formation: '4231', count: 1 }, { formation: '433', count: 1 }])
    expect(playerUsage(games, block.lineups)).toEqual([
      { playerId: 'a', starts: 2, apps: 2, minutes: 180 }, { playerId: 'b', starts: 1, apps: 2, minutes: 90 },
    ])
    expect(rolling([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5])
  })
})
