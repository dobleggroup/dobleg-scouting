// src/features/coaches/homegrown/homegrownMatchUsage.ts
import type { AgencyFixture, ApiFixtureEvent, ApiFixtureLineup } from '@/types/footballApi'

export interface MatchInput { fixture: AgencyFixture; lineup: ApiFixtureLineup | null; events: ApiFixtureEvent[] }
export interface PlayerMinutes {
  apiPlayerId: number; name: string; minutes: number; started: boolean
  inAt: number | null; outAt: number | null; sentOff: boolean
}
export interface HomegrownMatchUsage {
  fixtureId: number; date: string; rival: string; rivalLogo: string; isHome: boolean
  score: string | null; competition: string; hasData: boolean
  starters: PlayerMinutes[]; subsIn: PlayerMinutes[]; totalMinutes: number; teamMinutes: number
}
export interface HomegrownPlayerTotals { apiPlayerId: number; name: string; appearances: number; starts: number; minutes: number }
export interface HomegrownSummary {
  matches: number; matchesWithData: number; matchesWithAny: number; avgPlayersPerMatch: number
  totalMinutes: number; teamMinutes: number; minutesShare: number; players: HomegrownPlayerTotals[]
}
/** id de API (canónico o alias) → jugador canónico. API-Football a veces reasigna a un
 *  jugador a otro id (Ávalos: 356282 hasta marzo, 647644 desde abril). */
export type HomegrownIndex = Map<number, { id: number; name: string }>

const EXTRA_TIME_STATUSES = new Set(['AET', 'PEN'])
const RED_CARD_DETAILS = new Set(['Red Card', 'Second Yellow card'])

function matchLength(fixture: AgencyFixture): number {
  return EXTRA_TIME_STATUSES.has(fixture.statusShort) ? 120 : 90
}

/** Minutos de cada jugador del equipo que pisó la cancha. API-Football no da minutos
 *  en Primera Nacional: se reconstruyen con titulares + cambios (`player` sale,
 *  `assist` entra) + rojas. El descuento se ignora (se cuenta hasta 90/120). */
export function computeMatchMinutes({ fixture, lineup, events }: MatchInput, teamId: number): PlayerMinutes[] {
  if (!lineup) return []
  const end = matchLength(fixture)
  const names = new Map<number, string>()
  for (const p of [...lineup.startXI, ...lineup.substitutes]) names.set(p.player.id, p.player.name)
  const state = new Map<number, PlayerMinutes>()
  for (const p of lineup.startXI) {
    state.set(p.player.id, { apiPlayerId: p.player.id, name: p.player.name, minutes: 0, started: true, inAt: null, outAt: null, sentOff: false })
  }
  const ours = events
    .filter(e => e.team.id === teamId)
    .sort((a, b) => a.time.elapsed - b.time.elapsed || (a.time.extra ?? 0) - (b.time.extra ?? 0))
  for (const e of ours) {
    const minute = Math.min(e.time.elapsed, end)
    if (e.type === 'subst') {
      const out = e.player.id != null ? state.get(e.player.id) : undefined
      if (out && out.outAt === null) out.outAt = minute
      const inId = e.assist.id
      if (inId != null && !state.has(inId)) {
        state.set(inId, { apiPlayerId: inId, name: names.get(inId) ?? e.assist.name ?? String(inId), minutes: 0, started: false, inAt: minute, outAt: null, sentOff: false })
      }
    } else if (e.type === 'Card' && RED_CARD_DETAILS.has(e.detail) && e.player.id != null) {
      const p = state.get(e.player.id)
      if (p && p.outAt === null) { p.outAt = minute; p.sentOff = true }
    }
  }
  return [...state.values()].map(p => {
    const from = p.started ? 0 : (p.inAt ?? 0)
    const to = p.outAt ?? end
    return { ...p, minutes: p.started ? Math.max(0, to - from) : Math.max(1, to - from) }
  })
}

export function computeHomegrownUsage(matches: MatchInput[], teamId: number, homegrown: HomegrownIndex): HomegrownMatchUsage[] {
  return matches.map(m => {
    const { fixture } = m
    const rivalTeam = fixture.isHome ? fixture.awayTeam : fixture.homeTeam
    const minutes = computeMatchMinutes(m, teamId)
      .flatMap(p => {
        const player = homegrown.get(p.apiPlayerId)
        return player ? [{ ...p, apiPlayerId: player.id, name: player.name }] : []
      })
      .sort((a, b) => b.minutes - a.minutes)
    const scored = fixture.goalsHome !== null && fixture.goalsAway !== null
    const ownGoals = fixture.isHome ? fixture.goalsHome : fixture.goalsAway
    const rivalGoals = fixture.isHome ? fixture.goalsAway : fixture.goalsHome
    return {
      fixtureId: fixture.fixtureId,
      date: fixture.date,
      rival: rivalTeam.name,
      rivalLogo: rivalTeam.logo,
      isHome: fixture.isHome,
      score: scored ? `${ownGoals}-${rivalGoals}` : null,
      competition: fixture.leagueName,
      hasData: m.lineup !== null,
      starters: minutes.filter(p => p.started),
      subsIn: minutes.filter(p => !p.started),
      totalMinutes: minutes.reduce((s, p) => s + p.minutes, 0),
      teamMinutes: 11 * matchLength(fixture),
    }
  })
}

export function summarizeHomegrownUsage(usage: HomegrownMatchUsage[]): HomegrownSummary {
  const withData = usage.filter(u => u.hasData)
  const totals = new Map<number, HomegrownPlayerTotals>()
  for (const u of withData) {
    for (const p of [...u.starters, ...u.subsIn]) {
      const t = totals.get(p.apiPlayerId) ?? { apiPlayerId: p.apiPlayerId, name: p.name, appearances: 0, starts: 0, minutes: 0 }
      t.appearances += 1
      if (p.started) t.starts += 1
      t.minutes += p.minutes
      totals.set(p.apiPlayerId, t)
    }
  }
  const totalMinutes = withData.reduce((s, u) => s + u.totalMinutes, 0)
  const teamMinutes = withData.reduce((s, u) => s + u.teamMinutes, 0)
  const used = withData.reduce((s, u) => s + u.starters.length + u.subsIn.length, 0)
  return {
    matches: usage.length,
    matchesWithData: withData.length,
    matchesWithAny: withData.filter(u => u.starters.length + u.subsIn.length > 0).length,
    avgPlayersPerMatch: withData.length ? used / withData.length : 0,
    totalMinutes,
    teamMinutes,
    minutesShare: teamMinutes ? totalMinutes / teamMinutes : 0,
    players: [...totals.values()].sort((a, b) => b.minutes - a.minutes),
  }
}
