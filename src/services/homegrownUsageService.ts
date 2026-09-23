import type { AgencyCoach } from '@/constants/agencyCoaches'
import { fetchCoachProfile, fetchFixtureEvents, fetchFixtureLineups, fetchSeasonFixtures } from '@/services/footballApiService'
import { isMatchFinished } from '@/utils/coachCalendar'
import { normalizeForSearch } from '@/lib/search'
import { listSquadCareers, type SquadCareer } from '@/services/squadCareersService'
import {
  computeHomegrownUsage, summarizeHomegrownUsage,
  type HomegrownIndex, type HomegrownMatchUsage, type HomegrownSummary, type MatchInput,
} from '@/features/coaches/homegrown/homegrownMatchUsage'
import { homegrownGoalsByMatch, starterAgeByMatch } from '@/features/coaches/homegrown/homegrownInsights'

export interface HomegrownUsageResult {
  tenureStart: string
  usage: HomegrownMatchUsage[]
  summary: HomegrownSummary
  /** Solo los surgidos del club. */
  careers: SquadCareer[]
  /** Surgidos que debutaron en Primera con este DT, durante su ciclo. */
  debutedWithCoach: SquadCareer[]
  /** Edad promedio de los titulares por partido (mismo orden que `usage`). */
  starterAges: { fixtureId: number; avgAge: number | null; known: number }[]
  /** Goles de chicos del club por partido (fixtureId -> goles). */
  goalsByFixture: Map<number, { playerId: number; name: string; minute: number }[]>
}

export function resolveTenureStart(coach: AgencyCoach, apiStart: string | null): string | null {
  return coach.tenureStart ?? apiStart
}

export function debutedWithCoach(careers: SquadCareer[], coachFullName: string, tenureStart: string): SquadCareer[] {
  const target = normalizeForSearch(coachFullName)
  return careers
    .filter(c => c.homegrown && c.proDebutDate && c.proDebutDate >= tenureStart && c.proDebutCoach
      && normalizeForSearch(c.proDebutCoach) === target)
    .sort((a, b) => (a.proDebutDate ?? '').localeCompare(b.proDebutDate ?? ''))
}

export function buildHomegrownIndex(careers: SquadCareer[]): HomegrownIndex {
  const index: HomegrownIndex = new Map()
  for (const c of careers) {
    if (!c.homegrown || c.apiPlayerId === null) continue
    const player = { id: c.apiPlayerId, name: c.fullName }
    for (const id of [c.apiPlayerId, ...c.apiPlayerAliasIds]) index.set(id, player)
  }
  return index
}

/** Lotes chicos para no pegarle ~60 requests juntos a la API (cache de 7 días en footballApiService). */
async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += size) out.push(...await Promise.all(items.slice(i, i + size).map(fn)))
  return out
}

/** `null` = no se puede mostrar (sin equipo, sin inicio de ciclo o sin plantel enriquecido).
 *  Rechaza si falla Supabase, para que la UI muestre el error en vez de esconderse. */
export async function loadHomegrownUsage(coach: AgencyCoach): Promise<HomegrownUsageResult | null> {
  const teamId = coach.apiTeamId
  if (!teamId) return null
  const careers = await listSquadCareers(teamId)
  if (careers === null) throw new Error('No se pudo leer club_squad_careers')
  if (careers.length === 0) return null

  let apiStart: string | null = null
  if (!coach.tenureStart) {
    const profile = await fetchCoachProfile(coach.key, coach.fullName, coach.coachApiId)
    apiStart = profile?.career.find(c => c.teamId === teamId && c.end === null)?.start ?? null
  }
  const tenureStart = resolveTenureStart(coach, apiStart)
  if (!tenureStart) return null

  const firstSeason = Number(tenureStart.slice(0, 4))
  const lastSeason = new Date().getFullYear()
  const seasons = Array.from({ length: lastSeason - firstSeason + 1 }, (_, i) => firstSeason + i)
  const fixtures = (await Promise.all(seasons.map(s => fetchSeasonFixtures(teamId, s))))
    .flat()
    .filter(f => isMatchFinished(f.statusShort) && f.date.slice(0, 10) >= tenureStart)
    .sort((a, b) => a.timestamp - b.timestamp)
  const unique = [...new Map(fixtures.map(f => [f.fixtureId, f])).values()]

  const matches: MatchInput[] = await inBatches(unique, 6, async fixture => {
    const [lineups, events] = await Promise.all([fetchFixtureLineups(fixture.fixtureId), fetchFixtureEvents(fixture.fixtureId)])
    return { fixture, lineup: lineups.find(l => l.team.id === teamId) ?? null, events }
  })

  const homegrownCareers = careers.filter(c => c.homegrown)
  const homegrownIndex = buildHomegrownIndex(homegrownCareers)
  const usage = computeHomegrownUsage(matches, teamId, homegrownIndex)
  // Fecha de nacimiento de TODO el plantel enriquecido (no solo los surgidos), por id de
  // API-Football incluidos los alias, para la edad de los titulares.
  const birthByApiId = new Map<number, string>()
  for (const c of careers) {
    if (!c.birthDate) continue
    for (const id of [c.apiPlayerId, ...c.apiPlayerAliasIds]) if (id !== null) birthByApiId.set(id, c.birthDate)
  }
  return {
    tenureStart,
    usage,
    summary: summarizeHomegrownUsage(usage),
    careers: homegrownCareers,
    debutedWithCoach: debutedWithCoach(homegrownCareers, coach.fullName, tenureStart),
    starterAges: starterAgeByMatch(matches, teamId, birthByApiId),
    goalsByFixture: homegrownGoalsByMatch(matches, teamId, homegrownIndex),
  }
}
