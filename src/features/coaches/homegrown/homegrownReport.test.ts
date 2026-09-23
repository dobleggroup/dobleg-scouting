import { describe, it, expect } from 'vitest'
import { ageOn, buildHomegrownReport, cleanClub, reportFileName } from './homegrownReport'
import { buildHomegrownPdf, niceAxis } from './exportHomegrownPdf'
import type { HomegrownUsageResult } from '@/services/homegrownUsageService'
import type { SquadCareer } from '@/services/squadCareersService'
import type { HomegrownMatchUsage, PlayerMinutes } from './homegrownMatchUsage'

function career(apiPlayerId: number | null, fullName: string, extra: Partial<SquadCareer> = {}): SquadCareer {
  return {
    tmPlayerId: apiPlayerId ?? 999, apiPlayerId, apiPlayerAliasIds: [], fullName, shortName: null, squad: 'primera',
    position: 'Centrocampista', birthDate: '2005-05-19', nationality: 'Argentina', heightCm: 180, foot: 'Derecho',
    photoUrl: null, marketValueEur: 100000, contractUntil: '2027-12-31', youthClubs: ['Club Atlético Temperley II'], agent: null,
    proDebutDate: '2024-04-21', proDebutClub: 'CA Temperley', proDebutCompetition: 'Primera Nacional',
    proDebutOpponent: 'CA Colón', proDebutCoach: 'Mariano Campodónico', transferHistory: [], homegrown: true, homegrownReason: null,
    ...extra,
  }
}
const pm = (apiPlayerId: number, name: string, minutes: number, started: boolean, inAt: number | null = null): PlayerMinutes =>
  ({ apiPlayerId, name, minutes, started, inAt, outAt: null, sentOff: false })
function match(fixtureId: number, date: string, starters: PlayerMinutes[], subsIn: PlayerMinutes[], hasData = true): HomegrownMatchUsage {
  return {
    fixtureId, date, rival: 'CA Ferrocarril Midland', rivalLogo: '', isHome: true, score: '1-0', competition: 'Primera Nacional',
    hasData, starters, subsIn, totalMinutes: [...starters, ...subsIn].reduce((s, p) => s + p.minutes, 0), teamMinutes: 990,
  }
}

const richarte = career(1, 'Lucas Richarte')
const avalos = career(2, 'Nicolás Ávalos', { proDebutDate: '2026-04-04', proDebutCoach: 'Nicolás Domingo', proDebutOpponent: 'CA Ferrocarril Midland' })
const nova = career(null, 'Cristopher Nova', { squad: 'reserva', proDebutDate: null })
const usage = [
  match(10, '2026-02-01T20:00:00+00:00', [pm(1, 'Lucas Richarte', 90, true)], []),
  match(11, '2026-04-04T20:00:00+00:00', [pm(1, 'Lucas Richarte', 90, true)], [pm(2, 'Nicolás Ávalos', 20, false, 70)]),
  match(12, '2026-04-11T20:00:00+00:00', [], [], false),
  match(13, '2026-04-18T20:00:00+00:00', [pm(2, 'Nicolás Ávalos', 90, true)], [pm(1, 'Lucas Richarte', 30, false, 60)]),
]
const data: HomegrownUsageResult = {
  tenureStart: '2026-01-01',
  usage,
  summary: {
    matches: 4, matchesWithData: 3, matchesWithAny: 3, avgPlayersPerMatch: 5 / 3, totalMinutes: 320, teamMinutes: 2970, minutesShare: 320 / 2970,
    players: [
      { apiPlayerId: 1, name: 'Lucas Richarte', appearances: 3, starts: 2, minutes: 210 },
      { apiPlayerId: 2, name: 'Nicolás Ávalos', appearances: 2, starts: 1, minutes: 110 },
    ],
  },
  careers: [richarte, avalos, nova],
  debutedWithCoach: [avalos],
  starterAges: usage.map(u => ({ fixtureId: u.fixtureId, avgAge: u.hasData ? 25 : null, known: 11 })),
  goalsByFixture: new Map([[13, [{ playerId: 2, name: 'Nicolás Ávalos', minute: 55 }]]]),
}

describe('buildHomegrownReport', () => {
  const r = buildHomegrownReport(data, { fullName: 'Nicolás Domingo', club: 'CA Temperley' })

  it('marca el debut en el primer partido del debutante', () => {
    expect(r.matches.find(m => m.fixtureId === 11)!.debutNames).toEqual(['Ávalos'])
    expect(r.players.find(p => p.apiPlayerId === 2)!.debutFixtureId).toBe(11)
    expect(r.players.find(p => p.apiPlayerId === 1)!.debutFixtureId).toBeNull()
  })

  it('cuenta los goles por jugador y en total', () => {
    expect(r.totalGoals).toBe(1)
    expect(r.players.find(p => p.apiPlayerId === 2)!.goals).toBe(1)
    expect(r.matches.find(m => m.fixtureId === 13)!.goals).toEqual([{ playerId: 2, name: 'Nicolás Ávalos', minute: 55 }])
  })

  it('arma los minutos partido por partido de cada chico (null = no jugó)', () => {
    expect(r.players[0].perMatch).toEqual([
      { minutes: 90, started: true }, { minutes: 90, started: true }, null, { minutes: 30, started: false },
    ])
  })

  it('el % de minutos es null en partidos sin alineación', () => {
    expect(r.matches[2].minutesPct).toBeNull()
    expect(r.matches[1].minutesPct).toBeCloseTo((110 / 990) * 100)
  })

  it('limpia el nombre del rival', () => {
    expect(r.matches[0].rival).toBe('Ferrocarril Midland')
    expect(r.matches[0].label).toBe('01/02')
  })
})

describe('helpers', () => {
  it('cleanClub saca la sigla societaria', () => {
    expect(cleanClub('Club Atlético Temperley')).toBe('Temperley')
    expect(cleanClub('CA Colón')).toBe('Colón')
  })
  it('ageOn respeta si ya cumplió años', () => {
    expect(ageOn('2005-05-19', '2026-05-18')).toBe(20)
    expect(ageOn('2005-05-19', '2026-05-19')).toBe(21)
  })
  it('nombre de archivo sin acentos', () => {
    expect(reportFileName('Nicolás Domingo', '2026-09-23')).toBe('surgidos-del-club_nicolas-domingo_2026-09-23.pdf')
  })
})

describe('niceAxis', () => {
  it('porcentajes: marcas redondas desde 0', () => {
    expect(niceAxis(0, 44)).toEqual({ lo: 0, hi: 50, step: 10 })
  })
  it('edades: marcas de a un año, sin repetir', () => {
    expect(niceAxis(25.4, 29.5)).toEqual({ lo: 25, hi: 30, step: 1 })
  })
})

describe('buildHomegrownPdf', () => {
  it('genera el documento sin errores, con las secciones en hojas separadas', async () => {
    const r = buildHomegrownReport(data, { fullName: 'Nicolás Domingo', club: 'CA Temperley' })
    const pdf = await buildHomegrownPdf(r, { today: '2026-09-23' })
    // resumen, gráfico por partido, minutos/edad, mapa, tabla
    expect(pdf.getNumberOfPages()).toBe(5)
    const bytes = pdf.output('arraybuffer')
    expect(bytes.byteLength).toBeGreaterThan(5000)
  })

  it('sin chicos que hayan jugado no rompe', async () => {
    const empty: HomegrownUsageResult = { ...data, summary: { ...data.summary, players: [] }, debutedWithCoach: [], goalsByFixture: new Map() }
    const pdf = await buildHomegrownPdf(buildHomegrownReport(empty, { fullName: 'Nicolás Domingo', club: null }), { today: '2026-09-23' })
    expect(pdf.getNumberOfPages()).toBeGreaterThan(0)
  })
})
