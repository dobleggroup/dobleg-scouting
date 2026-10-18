import { describe, expect, it } from 'vitest'
import { coachRecords, currentClub, debutOf, isHomegrown, movesOfYear, seasonLine, type CareerSpell, type ClubPerson, type ClubSnapshot } from './clubData'

const TEM = 'tem'
const spell = (team: string, from: string, to: string | null, seasons: CareerSpell['seasons'], extra: Partial<CareerSpell> = {}): CareerSpell => ({
  team, teamId: team === 'Temperley' ? TEM : team.toLowerCase(), national: false, role: 'player', from, to, active: to === null, transfer: null, seasons, ...extra,
})
const person = (name: string, career: CareerSpell[]): ClubPerson => ({
  id: name, name, fullName: name, matchName: null, position: 'Midfielder', dob: '2004-01-01', nat: null, birthPlace: null, height: null, weight: null, foot: null, career,
})

describe('debutOf', () => {
  it('toma el primer club con partidos oficiales, no el primer club', () => {
    const p = person('Morrone', [
      spell('Temperley', '2024-10-30', null, [['2024', 'Primera Nacional', 0, 0, 0, 0, 0, 0, 0, 1], ['2026', 'Primera Nacional', 4, 329, 0, 0, 0, 0, 1, 28]]),
    ])
    expect(debutOf(p)).toMatchObject({ teamId: TEM, season: '2026' })
    expect(isHomegrown(p, TEM)).toBe(true)
  })

  it('ordena por temporada aunque la carrera venga desordenada', () => {
    const p = person('Brandan', [
      spell('Temperley', '2013-07-01', '2016-06-30', [['2013/2014', 'Prim B Metro', 37, 2849, 0, 0, 0, 0, 0, 0]]),
      spell('Olavarria', '2012-01-06', '2012-06-30', [['2011/2012', 'Copa Argentina', 1, 74, 0, 0, 0, 0, 0, 0]]),
    ])
    expect(debutOf(p)?.team).toBe('Olavarria')
    expect(isHomegrown(p, TEM)).toBe(false)
  })

  it('ignora selecciones y amistosos ya filtrados', () => {
    const p = person('X', [spell('Argentina', '2019-01-01', '2019-06-30', [['2019', 'Sudamericano', 3, 200, 0, 0, 0, 0, 0, 0]], { national: true })])
    expect(debutOf(p)).toBeNull()
  })
})

describe('seasonLine', () => {
  const p = person('Souto', [
    spell('Temperley', '2026-01-01', null, [['2026', 'Primera Nacional', 20, 1360, 1, 2, 5, 1, 3, 4], ['2026', 'Copa Argentina', 1, 90, 0, 0, 0, 0, 0, 0]]),
    spell('Independiente', '2025-01-13', '2025-12-31', [['2025', 'Liga Profesional Argentina', 15, 749, 0, 0, 2, 0, 6, 10]]),
  ])
  it('suma solo la competición pedida y calcula titularidades', () => {
    expect(seasonLine(p, '2026', { teamId: TEM, competition: 'Primera Nacional' })).toMatchObject({ apps: 20, starts: 17, minutes: 1360, goals: 1, assists: 2 })
  })
  it('"liga" deja afuera las copas', () => {
    expect(seasonLine(p, '2026', { competition: 'liga' }).minutes).toBe(1360)
    expect(seasonLine(p, '2025', { competition: 'liga' }).minutes).toBe(749)
  })
  it('club actual con su liga', () => {
    expect(currentClub(p)).toMatchObject({ team: 'Temperley', league: 'Primera Nacional', season: '2026' })
  })
})

describe('coachRecords', () => {
  it('calcula puntos y efectividad', () => {
    const c = person('Domingo', [spell('Temperley', '2026-01-01', null, [['2026', 'Primera Nacional', 16, 11, 6]], { role: 'coach' })])
    expect(coachRecords(c, TEM)[0]).toMatchObject({ played: 33, points: 59, efficiency: 60 })
  })
})

describe('movesOfYear', () => {
  it('altas con el club de origen y bajas con el destino', () => {
    const snap: ClubSnapshot = {
      updatedAt: '', team: { id: TEM, name: 'Temperley', short: 'Temperley', nickname: null, venue: null }, coach: null,
      squad: [person('Llega', [
        spell('Banfield', '2024-01-01', '2025-12-31', []),
        spell('Temperley', '2026-01-01', null, [], { transfer: 'Loan' }),
      ]), person('Viejo', [spell('Temperley', '2022-01-01', null, [])])],
      alumni: [person('Se va', [
        spell('Temperley', '2023-01-01', '2025-12-31', []),
        spell('Patronato', '2026-01-01', null, [], { transfer: 'Loan' }),
      ]), person('Hace rato', [spell('Temperley', '2018-01-01', '2019-06-30', [])])],
    }
    const { arrivals, departures } = movesOfYear(snap, 2026)
    expect(arrivals.map(m => [m.person.name, m.other, m.loan])).toEqual([['Llega', 'Banfield', true]])
    expect(departures.map(m => [m.person.name, m.other, m.loan])).toEqual([['Se va', 'Patronato', true]])
  })
})
