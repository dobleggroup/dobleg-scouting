// src/features/coaches/homegrown/homegrownReport.ts
// Arma, sin I/O ni dibujo, todo lo que muestra el PDF de "Jugadores surgidos del club":
// los mismos números y gráficos de la pantalla de Entrenadores.
import type { HomegrownUsageResult } from '@/services/homegrownUsageService'
import type { SquadCareer } from '@/services/squadCareersService'
import type { HomegrownMatchUsage } from './homegrownMatchUsage'
import { linearTrend, movingAverage } from './homegrownInsights'

export const TREND_WINDOW = 5 // partidos del promedio móvil de las líneas de tendencia

/** "CA Ferrocarril Midland" -> "Ferrocarril Midland": las siglas societarias no le dicen nada al lector. */
export function cleanClub(name: string): string {
  return name.replace(/^(Club Atlético|Club Social y Deportivo|CA|CS|CSD|AA|Club) /, '')
}

export function surname(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  return parts.length > 1 ? parts.slice(1).join(' ') : fullName
}

export interface Trend { start: number; end: number }

export interface ReportMatch {
  fixtureId: number
  /** "04/04" */
  label: string
  date: string
  rival: string
  isHome: boolean
  score: string | null
  competition: string
  hasData: boolean
  starters: { name: string; minutes: number; sentOff: boolean }[]
  subsIn: { name: string; minutes: number; inAt: number | null; sentOff: boolean }[]
  /** Apellidos de los chicos que debutaron en Primera en este partido. */
  debutNames: string[]
  goals: { playerId: number; name: string; minute: number }[]
  /** Promedio móvil de chicos usados por partido. */
  countTrend: number | null
  /** % de los minutos del equipo jugados por chicos del club (null = sin alineación). */
  minutesPct: number | null
  minutesPctTrend: number | null
  /** Edad promedio de los titulares (null = pocos datos). */
  starterAge: number | null
  starterAgeTrend: number | null
}

export interface ReportPlayer {
  apiPlayerId: number
  name: string
  position: string | null
  birthDate: string | null
  appearances: number
  starts: number
  minutes: number
  goals: number
  career: SquadCareer | null
  /** Partido (fixtureId) en que debutó en Primera con este DT, si fue en el ciclo. */
  debutFixtureId: number | null
  /** Minutos por partido, en el orden de `matches` (null = no jugó). */
  perMatch: ({ minutes: number; started: boolean } | null)[]
}

export interface HomegrownReport {
  coachName: string
  club: string | null
  tenureStart: string
  matchesWithData: number
  matchesWithAny: number
  avgPlayersPerMatch: number
  totalMinutes: number
  minutesShare: number
  totalGoals: number
  debutants: SquadCareer[]
  matches: ReportMatch[]
  players: ReportPlayer[]
  countTrend: Trend | null
  minutesTrend: Trend | null
  ageTrend: Trend | null
}

function firstAppearance(usage: HomegrownMatchUsage[], apiPlayerId: number): number | null {
  const first = usage.find(u => [...u.starters, ...u.subsIn].some(p => p.apiPlayerId === apiPlayerId))
  return first ? first.fixtureId : null
}

export function buildHomegrownReport(
  data: HomegrownUsageResult,
  coach: { fullName: string; club: string | null },
): HomegrownReport {
  const { usage, summary } = data

  const debutByPlayer = new Map<number, number>()
  for (const c of data.debutedWithCoach) {
    if (c.apiPlayerId === null) continue
    const fx = firstAppearance(usage, c.apiPlayerId)
    if (fx !== null) debutByPlayer.set(c.apiPlayerId, fx)
  }
  const debutNamesByFixture = new Map<number, string[]>()
  for (const c of data.debutedWithCoach) {
    const fx = c.apiPlayerId !== null ? debutByPlayer.get(c.apiPlayerId) : undefined
    if (fx !== undefined) debutNamesByFixture.set(fx, [...(debutNamesByFixture.get(fx) ?? []), surname(c.fullName)])
  }

  const counts = usage.map(u => (u.hasData ? u.starters.length + u.subsIn.length : null))
  const countAvg = movingAverage(counts, TREND_WINDOW)
  const minutesPct = usage.map(u => (u.hasData && u.teamMinutes > 0 ? (u.totalMinutes / u.teamMinutes) * 100 : null))
  const minutesAvg = movingAverage(minutesPct, TREND_WINDOW)
  const ages = data.starterAges.map(a => a.avgAge)
  const agesAvg = movingAverage(ages, TREND_WINDOW)

  const matches: ReportMatch[] = usage.map((u, i) => ({
    fixtureId: u.fixtureId,
    label: `${u.date.slice(8, 10)}/${u.date.slice(5, 7)}`,
    date: u.date,
    rival: cleanClub(u.rival),
    isHome: u.isHome,
    score: u.score,
    competition: u.competition,
    hasData: u.hasData,
    starters: u.starters.map(p => ({ name: p.name, minutes: p.minutes, sentOff: p.sentOff })),
    subsIn: u.subsIn.map(p => ({ name: p.name, minutes: p.minutes, inAt: p.inAt, sentOff: p.sentOff })),
    debutNames: debutNamesByFixture.get(u.fixtureId) ?? [],
    goals: (data.goalsByFixture.get(u.fixtureId) ?? []).map(g => ({ playerId: g.playerId, name: g.name, minute: g.minute })),
    countTrend: countAvg[i],
    minutesPct: minutesPct[i],
    minutesPctTrend: minutesAvg[i],
    starterAge: ages[i] ?? null,
    starterAgeTrend: agesAvg[i] ?? null,
  }))

  const goalsByPlayer = new Map<number, number>()
  for (const goals of data.goalsByFixture.values()) {
    for (const g of goals) goalsByPlayer.set(g.playerId, (goalsByPlayer.get(g.playerId) ?? 0) + 1)
  }
  const careerById = new Map<number, SquadCareer>()
  for (const c of data.careers) if (c.apiPlayerId !== null) careerById.set(c.apiPlayerId, c)

  const players: ReportPlayer[] = summary.players.map(p => {
    const career = careerById.get(p.apiPlayerId) ?? null
    return {
      apiPlayerId: p.apiPlayerId,
      name: p.name,
      position: career?.position ?? null,
      birthDate: career?.birthDate ?? null,
      appearances: p.appearances,
      starts: p.starts,
      minutes: p.minutes,
      goals: goalsByPlayer.get(p.apiPlayerId) ?? 0,
      career,
      debutFixtureId: debutByPlayer.get(p.apiPlayerId) ?? null,
      perMatch: usage.map(u => {
        const e = [...u.starters, ...u.subsIn].find(x => x.apiPlayerId === p.apiPlayerId)
        return e ? { minutes: e.minutes, started: e.started } : null
      }),
    }
  })

  const trendOf = (values: (number | null)[]): Trend | null => {
    const t = linearTrend(values)
    return t ? { start: t.start, end: t.end } : null
  }

  return {
    coachName: coach.fullName,
    club: coach.club,
    tenureStart: data.tenureStart,
    matchesWithData: summary.matchesWithData,
    matchesWithAny: summary.matchesWithAny,
    avgPlayersPerMatch: summary.avgPlayersPerMatch,
    totalMinutes: summary.totalMinutes,
    minutesShare: summary.minutesShare,
    totalGoals: [...goalsByPlayer.values()].reduce((s, n) => s + n, 0),
    debutants: data.debutedWithCoach,
    matches,
    players,
    countTrend: trendOf(counts),
    minutesTrend: trendOf(minutesPct),
    ageTrend: trendOf(ages),
  }
}

/** Edad cumplida en una fecha (YYYY-MM-DD). */
export function ageOn(birthIso: string, onIso: string): number {
  const b = new Date(birthIso + 'T12:00:00')
  const d = new Date(onIso.slice(0, 10) + 'T12:00:00')
  let age = d.getFullYear() - b.getFullYear()
  if (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) age -= 1
  return age
}

/** Nombre de archivo sin acentos ni espacios: "surgidos-del-club_nicolas-domingo_2026-09-23.pdf". */
export function reportFileName(coachName: string, todayIso: string): string {
  const slug = coachName.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `surgidos-del-club_${slug}_${todayIso}.pdf`
}
