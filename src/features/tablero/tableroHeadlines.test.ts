import { describe, it, expect } from 'vitest'
import { DAY_MS, type Appearance, type TeamFixture } from './tableroData'
import { weeklyHeadlines } from './tableroHeadlines'

const NOW = new Date('2026-10-13T15:00:00Z').getTime()
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY_MS).toISOString()
let seq = 1
function app(fullName: string, teamId: number, daysAgo: number, extra: Partial<Appearance> = {}): Appearance {
  return {
    fullName, teamId, fixtureId: seq++, date: iso(daysAgo), dayKey: iso(daysAgo).slice(0, 10),
    leagueId: 1, rivalId: 9, isHome: true, goalsFor: 1, goalsAgainst: 0,
    minutes: 90, goals: 0, assists: 0, shotsTotal: 0, shotsOn: 0, passesKey: 0,
    tackles: 0, interceptions: 0, duelsWon: 0, duelsTotal: 0, dribblesSuccess: 0, rating: 7,
    ...extra,
  }
}
const fx = (teamId: number, daysAgo: number): TeamFixture => ({ teamId, date: iso(daysAgo), goalsFor: 1, goalsAgainst: 0 })

describe('weeklyHeadlines', () => {
  it('goles de la semana primero, después racha, mejor actuación, vuelta y titular que no jugó', () => {
    const apps = [
      app('Goleador', 1, 2, { goals: 2 }),
      app('Racha', 2, 20, { assists: 1 }), app('Racha', 2, 13, { goals: 1 }), app('Racha', 2, 3, { goals: 1 }),
      app('Figura', 3, 1, { rating: 8.4 }),
      app('Vuelve', 4, 60), app('Vuelve', 4, 2),
      app('Titular', 5, 30), app('Titular', 5, 20), app('Titular', 5, 10), app('Titular', 5, 3, { minutes: 0, rating: null }),
      app('Viejo', 6, 20, { goals: 3 }),
    ]
    const current = new Map([['Goleador', 1], ['Racha', 2], ['Figura', 3], ['Vuelve', 4], ['Titular', 5], ['Viejo', 6]])
    const h = weeklyHeadlines(apps, [fx(5, 3)], new Map(), current, NOW, 10)
    expect(h.map(x => `${x.kind}:${x.fullName}`)).toEqual([
      'goals:Goleador', 'goals:Racha', 'streak:Racha', 'best:Figura', 'return:Vuelve', 'benched:Titular',
    ])
    expect(h.find(x => x.kind === 'streak')!.value).toBe(3)
    expect(h.find(x => x.kind === 'return')!.value).toBe(58)
  })

  it('la mejor actuación no se repite si ya salió por un gol, y pide 7,5 o más', () => {
    const apps = [app('A', 1, 1, { goals: 1, rating: 8.9 }), app('B', 2, 1, { rating: 7.4 })]
    const h = weeklyHeadlines(apps, [], new Map(), new Map(), NOW)
    expect(h.map(x => x.kind)).toEqual(['goals'])
  })

  it('un titular cuyo club no jugó esta semana no es noticia', () => {
    const apps = [app('T', 5, 30), app('T', 5, 20), app('T', 5, 10)]
    expect(weeklyHeadlines(apps, [fx(5, 12)], new Map(), new Map([['T', 5]]), NOW)).toHaveLength(0)
  })
})
