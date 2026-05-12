import type { ApiResponse, ApiFixture, AgencyFixture } from '@/types/footballApi'
import { AGENCY_PLAYERS, getPlayersByTeamId, getUniqueTeamIds } from '@/constants/agencyPlayers'

const API_KEY = import.meta.env.VITE_FOOTBALL_API_KEY as string
const BASE_URL = 'https://v3.football.api-sports.io'
const CACHE_KEY = 'dg-fixtures-cache'
const CACHE_TTL = 4 * 60 * 60 * 1000

interface CachedData {
  fixtures: AgencyFixture[]
  timestamp: number
}

async function apiFetch<T>(endpoint: string, params: Record<string, string>): Promise<ApiResponse<T>> {
  const url = new URL(`${BASE_URL}${endpoint}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const res = await fetch(url.toString(), {
    headers: { 'x-apisports-key': API_KEY },
  })

  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

async function getTeamFixtures(teamId: number): Promise<ApiFixture[]> {
  try {
    const data = await apiFetch<ApiFixture[]>('/fixtures', {
      team: String(teamId),
      next: '15',
      timezone: 'America/Argentina/Buenos_Aires',
    })
    return data.response || []
  } catch {
    return []
  }
}

function mapFixture(fixture: ApiFixture, teamId: number): AgencyFixture {
  const players = getPlayersByTeamId(teamId)
  const isHome = fixture.teams.home.id === teamId

  return {
    fixtureId: fixture.fixture.id,
    date: fixture.fixture.date,
    timestamp: fixture.fixture.timestamp,
    venue: fixture.fixture.venue.name,
    city: fixture.fixture.venue.city,
    status: fixture.fixture.status.long,
    statusShort: fixture.fixture.status.short,
    elapsed: fixture.fixture.status.elapsed,
    leagueName: fixture.league.name,
    leagueLogo: fixture.league.logo,
    leagueCountry: fixture.league.country,
    round: fixture.league.round,
    homeTeam: {
      id: fixture.teams.home.id,
      name: fixture.teams.home.name,
      logo: fixture.teams.home.logo,
    },
    awayTeam: {
      id: fixture.teams.away.id,
      name: fixture.teams.away.name,
      logo: fixture.teams.away.logo,
    },
    goalsHome: fixture.goals.home,
    goalsAway: fixture.goals.away,
    isHome,
    players: players.map(p => ({
      shortName: p.shortName,
      fullName: p.fullName,
      image: p.image,
    })),
  }
}

function getCached(): AgencyFixture[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const cached: CachedData = JSON.parse(raw)
    if (Date.now() - cached.timestamp > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY)
      return null
    }
    return cached.fixtures
  } catch {
    return null
  }
}

function setCache(fixtures: AgencyFixture[]) {
  try {
    const data: CachedData = { fixtures, timestamp: Date.now() }
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch { /* quota exceeded */ }
}

export async function fetchAllAgencyFixtures(forceRefresh = false): Promise<AgencyFixture[]> {
  if (!forceRefresh) {
    const cached = getCached()
    if (cached) return cached
  }

  const teamIds = getUniqueTeamIds()
  const batchSize = 5
  const allFixtures: AgencyFixture[] = []

  for (let i = 0; i < teamIds.length; i += batchSize) {
    const batch = teamIds.slice(i, i + batchSize)
    const results = await Promise.all(batch.map(id => getTeamFixtures(id)))
    for (let j = 0; j < batch.length; j++) {
      for (const fixture of results[j]) {
        allFixtures.push(mapFixture(fixture, batch[j]))
      }
    }
  }

  const deduped = Array.from(
    new Map(allFixtures.map(f => [f.fixtureId, f])).values()
  )

  const merged: AgencyFixture[] = []
  const fixtureMap = new Map<number, AgencyFixture>()

  for (const f of deduped) {
    const existing = fixtureMap.get(f.fixtureId)
    if (existing) {
      const newPlayers = f.players.filter(
        p => !existing.players.some(ep => ep.fullName === p.fullName)
      )
      existing.players.push(...newPlayers)
    } else {
      fixtureMap.set(f.fixtureId, { ...f })
      merged.push(fixtureMap.get(f.fixtureId)!)
    }
  }

  merged.sort((a, b) => a.timestamp - b.timestamp)
  setCache(merged)
  return merged
}

const AR_TZ = 'America/Argentina/Buenos_Aires'

function toArDateKey(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('sv-SE', { timeZone: AR_TZ }).format(d)
}

export function getFixturesForDate(fixtures: AgencyFixture[], date: Date): AgencyFixture[] {
  const target = toArDateKey(date)
  return fixtures.filter(f => toArDateKey(f.date) === target)
}

export function groupFixturesByDate(fixtures: AgencyFixture[]): Map<string, AgencyFixture[]> {
  const groups = new Map<string, AgencyFixture[]>()
  for (const f of fixtures) {
    const key = toArDateKey(f.date)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(f)
  }
  return groups
}

export { AGENCY_PLAYERS }
