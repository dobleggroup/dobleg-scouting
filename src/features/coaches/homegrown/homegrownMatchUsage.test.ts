import { describe, it, expect } from 'vitest'
import lineupJson from './__fixtures__/fixture-1498827-lineup.json'
import eventsJson from './__fixtures__/fixture-1498827-events.json'
import { computeMatchMinutes, computeHomegrownUsage, summarizeHomegrownUsage, type MatchInput } from './homegrownMatchUsage'
import type { AgencyFixture, ApiFixtureEvent, ApiFixtureLineup } from '@/types/footballApi'

const TEAM = 454
const lineup = lineupJson as ApiFixtureLineup
const events = eventsJson as ApiFixtureEvent[]
const idOf = (name: string) => [...lineup.startXI, ...lineup.substitutes].find(p => p.player.name === name)!.player.id
const CALZON = idOf('M. Calzon')
const RICHARTE = idOf('L. Richarte')
const AVALOS = idOf('N. Avalos')
const HAUCHE = idOf('G. Hauche')

function fixture(over: Partial<AgencyFixture> = {}): AgencyFixture {
  return {
    fixtureId: 1498827, date: '2026-09-19T20:00:00-03:00', timestamp: 1790000000, venue: '', city: '',
    status: 'Match Finished', statusShort: 'FT', elapsed: 90, leagueName: 'Primera Nacional', leagueLogo: '',
    leagueCountry: 'Argentina', leagueFlag: null, round: '', isHome: true, players: [],
    homeTeam: { id: TEAM, name: 'Temperley', logo: '' }, awayTeam: { id: 1, name: 'Almagro', logo: 'a.png' },
    goalsHome: 3, goalsAway: 1, ...over,
  }
}
const real: MatchInput = { fixture: fixture(), lineup, events }

function ev(elapsed: number, type: string, detail: string, playerId: number, assistId: number | null = null): ApiFixtureEvent {
  return { time: { elapsed, extra: null }, team: { id: TEAM, name: 'Temperley', logo: '' },
    player: { id: playerId, name: String(playerId) }, assist: { id: assistId, name: assistId ? String(assistId) : null },
    type, detail, comments: null }
}
function tinyLineup(starters: number[], subs: number[]): ApiFixtureLineup {
  const p = (id: number) => ({ player: { id, name: `P${id}`, number: null, pos: null, grid: null } })
  return { team: { id: TEAM, name: 'Temperley', logo: '' }, coach: null, formation: null,
    startXI: starters.map(p), substitutes: subs.map(p) }
}

describe('computeMatchMinutes (datos reales vs Almagro)', () => {
  const mins = computeMatchMinutes(real, TEAM)
  const get = (id: number) => mins.find(m => m.apiPlayerId === id)!
  it('titular que no sale juega 90', () => {
    expect(get(CALZON)).toMatchObject({ started: true, minutes: 90, inAt: null, outAt: null })
  })
  it('ingresado al 29 juega 61', () => {
    expect(get(AVALOS)).toMatchObject({ started: false, inAt: 29, minutes: 61 })
  })
  it('titular sustituido al 72 juega 72', () => {
    expect(get(HAUCHE)).toMatchObject({ started: true, outAt: 72, minutes: 72 })
  })
  it('suplentes que no entraron no aparecen', () => {
    expect(mins.find(m => m.name === 'L. Morrone')).toBeUndefined()
  })
  it('ignora eventos del rival', () => {
    expect(mins.length).toBe(16) // 11 titulares + 5 cambios de Temperley
  })
})

describe('computeMatchMinutes (casos sintéticos)', () => {
  it('entra y sale', () => {
    const m = computeMatchMinutes({ fixture: fixture(), lineup: tinyLineup([1], [2, 3]),
      events: [ev(46, 'subst', 'Substitution 1', 1, 2), ev(80, 'subst', 'Substitution 2', 2, 3)] }, TEAM)
    expect(m.find(x => x.apiPlayerId === 2)).toMatchObject({ inAt: 46, outAt: 80, minutes: 34 })
  })
  it('roja corta los minutos', () => {
    const m = computeMatchMinutes({ fixture: fixture(), lineup: tinyLineup([1], []),
      events: [ev(60, 'Card', 'Red Card', 1)] }, TEAM)
    expect(m[0]).toMatchObject({ minutes: 60, outAt: 60, sentOff: true })
  })
  it('alargue de Copa: 120 minutos', () => {
    const m = computeMatchMinutes({ fixture: fixture({ statusShort: 'PEN' }), lineup: tinyLineup([1], []), events: [] }, TEAM)
    expect(m[0].minutes).toBe(120)
  })
  it('entra en el descuento: mínimo 1 minuto', () => {
    const m = computeMatchMinutes({ fixture: fixture(), lineup: tinyLineup([1], [2]),
      events: [{ ...ev(90, 'subst', 'Substitution 1', 1, 2), time: { elapsed: 90, extra: 4 } }] }, TEAM)
    expect(m.find(x => x.apiPlayerId === 2)!.minutes).toBe(1)
  })
})

describe('computeHomegrownUsage + summarize', () => {
  const homegrown = new Map([
    [CALZON, { id: CALZON, name: 'Matías Calzón' }],
    [RICHARTE, { id: RICHARTE, name: 'Lucas Richarte' }],
    [AVALOS, { id: AVALOS, name: 'Nicolás Ávalos' }],
  ])
  const noData: MatchInput = { fixture: fixture({ fixtureId: 2, isHome: false,
    homeTeam: { id: 9, name: 'Patronato', logo: 'p.png' }, awayTeam: { id: TEAM, name: 'Temperley', logo: '' },
    goalsHome: 0, goalsAway: 0 }), lineup: null, events: [] }
  const usage = computeHomegrownUsage([real, noData], TEAM, homegrown)

  it('separa titulares e ingresados y usa el nombre de la carrera', () => {
    expect(usage[0].starters.map(p => p.name).sort()).toEqual(['Lucas Richarte', 'Matías Calzón'])
    expect(usage[0].subsIn.map(p => p.name)).toEqual(['Nicolás Ávalos'])
    expect(usage[0]).toMatchObject({ rival: 'Almagro', isHome: true, score: '3-1', hasData: true, teamMinutes: 990 })
  })
  it('partido sin alineación queda marcado sin datos', () => {
    expect(usage[1]).toMatchObject({ rival: 'Patronato', hasData: false, starters: [], subsIn: [], score: '0-0' })
  })
  it('resumen solo promedia partidos con datos', () => {
    const s = summarizeHomegrownUsage(usage)
    expect(s).toMatchObject({ matches: 2, matchesWithData: 1, matchesWithAny: 1, avgPlayersPerMatch: 3 })
    expect(s.totalMinutes).toBe(usage[0].totalMinutes)
    expect(s.minutesShare).toBeCloseTo(usage[0].totalMinutes / 990)
    expect(s.players[0]).toMatchObject({ appearances: 1 })
  })
  it('un id alias de la API se suma al jugador canónico', () => {
    // Ávalos: la API usó otro id (356282) antes de abril. Mismo jugador en el resumen.
    const OLD_ID = 356282
    const aliasLineup: ApiFixtureLineup = { ...tinyLineup([OLD_ID], []) }
    const aliasMatch: MatchInput = { fixture: fixture({ fixtureId: 3 }), lineup: aliasLineup, events: [] }
    const withAlias = new Map([...homegrown, [OLD_ID, { id: AVALOS, name: 'Nicolás Ávalos' }]])
    const s = summarizeHomegrownUsage(computeHomegrownUsage([real, aliasMatch], TEAM, withAlias))
    const avalos = s.players.filter(p => p.name === 'Nicolás Ávalos')
    expect(avalos).toHaveLength(1)
    expect(avalos[0]).toMatchObject({ apiPlayerId: AVALOS, appearances: 2, starts: 1, minutes: 61 + 90 })
  })
})
