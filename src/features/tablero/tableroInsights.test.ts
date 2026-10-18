import { describe, it, expect } from 'vitest'
import { DAY_MS, type Appearance, type RosterEntry, type TeamFixture } from './tableroData'
import { coverageGaps, coverageSentence, teamImpact, raceFrames, valueVsRating } from './tableroInsights'

const NOW = new Date('2026-10-13T15:00:00Z').getTime()
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY_MS).toISOString()

let seq = 1
function app(fullName: string, teamId: number, daysAgo: number, extra: Partial<Appearance> = {}): Appearance {
  return {
    fullName, teamId, fixtureId: seq++, date: iso(daysAgo), dayKey: iso(daysAgo).slice(0, 10),
    leagueId: 128, rivalId: 999, isHome: true, goalsFor: 1, goalsAgainst: 0,
    minutes: 90, goals: 0, assists: 0, shotsTotal: 0, shotsOn: 0, passesKey: 0,
    tackles: 0, interceptions: 0, duelsWon: 0, duelsTotal: 0, dribblesSuccess: 0, rating: 7,
    ...extra,
  }
}
const fx = (teamId: number, daysAgo: number, gf: number, ga: number): TeamFixture => ({ teamId, date: iso(daysAgo), goalsFor: gf, goalsAgainst: ga })

describe('coverageGaps', () => {
  const roster: RosterEntry[] = [
    { fullName: 'Con Datos', apiTeamId: 1, team: 'Uno' },
    { fullName: 'Sin Liga', apiTeamId: 2, team: 'Bhayangkara' },
    { fullName: 'Sin Club', apiTeamId: null },
    { fullName: 'Club Texto', apiTeamId: null, team: 'Santo Domingo' },
    { fullName: 'No Juega', apiTeamId: 3, team: 'Tres' },
    { fullName: 'Reserva', apiTeamId: 4, team: 'Cuatro', isReserve: true },
    { fullName: 'Viejo', apiTeamId: 5, team: 'Cinco' },
    { fullName: 'Gemelo', apiTeamId: 6, team: 'Seis' },
  ]
  const apps = [
    app('Con Datos', 1, 3),
    app('Reserva', 4, 10, { minutes: 0, rating: null }),
    app('Viejo', 5, 90), app('Viejo', 5, 20, { minutes: 0, rating: null }),
    app('Sin Liga', 7, 150),
  ]
  const fixtures = [
    fx(3, 5, 1, 1), fx(3, 40, 0, 0),
    fx(5, 90, 1, 0), fx(5, 60, 1, 0), fx(5, 20, 0, 0), fx(20000005, 20.5, 0, 0), fx(5, 10, 2, 2),
    fx(20000006, 5, 0, 0),
  ]
  const { gaps, withData } = coverageGaps(roster, apps, fixtures, new Map([[20000006, 6], [20000005, 5]]), NOW, id => `Club ${id}`)
  const by = Object.fromEntries(gaps.map(g => [g.fullName, g]))

  it('cuenta con datos sólo a quien jugó en los últimos 2 meses', () => {
    expect(withData).toBe(1)
  })

  it('distingue liga no cargada, sin club, reserva y "no viene jugando"', () => {
    expect(by['Sin Liga'].reason).toBe('noLeague')
    expect(by['Sin Liga'].lastPlayed?.teamId).toBe(7)
    expect(by['Sin Club'].reason).toBe('noClub')
    expect(by['Club Texto'].reason).toBe('noLeague')
    expect(by['Reserva'].reason).toBe('reserve')
    expect(by['No Juega'].reason).toBe('notPlaying')
    expect(by['Gemelo'].reason).toBe('notPlaying')
  })

  it('cuenta los partidos que su club jugó sin él (los repetidos entre proveedores, una vez)', () => {
    expect(by['Viejo']).toMatchObject({ reason: 'notPlaying', missed: 3, bench: 1 })
    expect(by['No Juega'].missed).toBe(2)
  })

  it('arma una oración simple', () => {
    const txt = coverageSentence(by['Viejo'], () => '15 jul', id => `Club ${id}`)
    expect(txt).toContain('Cinco jugó 3 partidos desde el 15 jul')
    expect(txt).toContain('al banco una vez')
    expect(coverageSentence(by['Sin Liga'], () => '15 may', id => `Club ${id}`)).toBe('No cargamos la liga de Bhayangkara. Su último partido que tenemos es del 15 may, con Club 7.')
  })
})

describe('teamImpact', () => {
  it('compara puntos con él (45+ min) y sin él, desde que llegó al club', () => {
    const apps = [
      app('A', 10, 30, { minutes: 90 }), app('A', 10, 23, { minutes: 80 }), app('A', 10, 16, { minutes: 60 }),
      app('A', 10, 9, { minutes: 0, rating: null }), app('A', 10, 5, { minutes: 20 }), app('A', 10, 26, { minutes: 70 }),
    ]
    const fixtures = [
      fx(10, 60, 0, 3), // antes de que llegue: no cuenta
      fx(10, 30, 2, 0), fx(10, 26, 0, 1), fx(10, 23, 1, 1), fx(10, 16, 3, 1), // con él: 7 pts / 4
      fx(10, 9, 0, 1), fx(10, 2, 0, 0), fx(20000010, 2.5, 0, 0), fx(10, 12, 0, 2), fx(10, 19, 1, 0), // sin él (el gemelo cuenta una vez)
      fx(10, 5, 1, 0), // 20 min: no entra
    ]
    const [r] = teamImpact(apps, new Map([['A', 10]]), fixtures, new Map([[20000010, 10]]), NOW - 365 * DAY_MS)
    expect(r.withMatches).toBe(4)
    expect(r.withPpg).toBeCloseTo(7 / 4)
    expect(r.withoutMatches).toBe(4)
    expect(r.withoutPpg).toBeCloseTo(4 / 4)
    expect(r.withWins).toBe(2)
  })

  it('con menos de 4 partidos de un lado no se muestra', () => {
    const apps = [app('A', 10, 30)]
    expect(teamImpact(apps, new Map([['A', 10]]), [fx(10, 30, 1, 0), fx(10, 20, 0, 0)], new Map(), NOW - 365 * DAY_MS)).toHaveLength(0)
  })
})

describe('raceFrames', () => {
  it('acumula semana a semana y el último cuadro llega a hoy', () => {
    const apps = [app('A', 1, 20, { goals: 1 }), app('B', 1, 10, { goals: 2, assists: 1 }), app('A', 1, 2, { goals: 1, minutes: 0 })]
    const frames = raceFrames(apps, 'contributions', NOW - 28 * DAY_MS, NOW)
    // la primera semana (sin datos) se saltea: arranca con el gol de A
    expect(frames).toHaveLength(3)
    expect(frames[0].totals.get('A')).toBe(1)
    expect(frames[0].totals.get('B')).toBeUndefined()
    expect(frames[2].totals.get('B')).toBe(3)
    expect(frames[2].totals.get('A')).toBe(1) // el de 0 minutos no suma
  })
})

describe('valueVsRating', () => {
  it('el que rinde por encima de la recta tiene residuo positivo', () => {
    const { points } = valueVsRating([
      { fullName: 'Caro', value: 10_000_000, rating: 7.4, matches: 10 },
      { fullName: 'Medio', value: 1_000_000, rating: 6.9, matches: 10 },
      { fullName: 'Barato', value: 100_000, rating: 6.4, matches: 10 },
      { fullName: 'Ganga', value: 100_000, rating: 7.2, matches: 10 },
    ])
    const ganga = points.find(p => p.fullName === 'Ganga')!
    expect(ganga.residual).toBeGreaterThan(0.3)
  })
})
