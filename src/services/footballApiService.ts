import type { ApiResponse, ApiFixture, AgencyFixture } from '@/types/footballApi'
import { getPlayersByTeamId, getUniqueTeamIds } from '@/constants/agencyPlayers'

const API_KEY = import.meta.env.VITE_FOOTBALL_API_KEY as string
const BASE_URL = 'https://v3.football.api-sports.io'
const CACHE_KEY = 'dg-fixtures-cache-v2'
const CACHE_TTL = 4 * 60 * 60 * 1000
const AR_TZ = 'America/Argentina/Buenos_Aires'

interface CachedData {
  fixtures: AgencyFixture[]
  timestamp: number
}

async function apiFetch<T>(endpoint: string, params: Record<string, string>): Promise<ApiResponse<T>> {
  if (!API_KEY) throw new Error('VITE_FOOTBALL_API_KEY no configurada')

  const url = new URL(`${BASE_URL}${endpoint}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const res = await fetch(url.toString(), {
    headers: { 'x-apisports-key': API_KEY },
  })

  if (!res.ok) throw new Error(`API error: ${res.status}`)
  const data = await res.json()

  if (data.errors && Object.keys(data.errors).length > 0) {
    throw new Error(`API: ${JSON.stringify(data.errors)}`)
  }

  return data
}

async function getTeamFixtures(teamId: number): Promise<ApiFixture[]> {
  const [upcoming, past] = await Promise.all([
    apiFetch<ApiFixture[]>('/fixtures', {
      team: String(teamId),
      next: '20',
      timezone: AR_TZ,
    }).catch(() => null),
    apiFetch<ApiFixture[]>('/fixtures', {
      team: String(teamId),
      last: '10',
      timezone: AR_TZ,
    }).catch(() => null),
  ])

  return [
    ...(upcoming?.response || []),
    ...(past?.response || []),
  ]
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
    leagueFlag: fixture.league.flag ?? null,
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
    localStorage.setItem(CACHE_KEY, JSON.stringify({ fixtures, timestamp: Date.now() }))
  } catch { /* quota exceeded */ }
}

export async function fetchAllAgencyFixtures(forceRefresh = false): Promise<AgencyFixture[]> {
  if (!API_KEY) throw new Error('API key no configurada. Agregá VITE_FOOTBALL_API_KEY en las variables de entorno.')

  if (!forceRefresh) {
    const cached = getCached()
    if (cached) return cached
  }

  const teamIds = getUniqueTeamIds()
  const batchSize = 5
  const allFixtures: AgencyFixture[] = []
  let hasAnyResults = false

  for (let i = 0; i < teamIds.length; i += batchSize) {
    const batch = teamIds.slice(i, i + batchSize)
    const results = await Promise.all(batch.map(id => getTeamFixtures(id)))
    for (let j = 0; j < batch.length; j++) {
      if (results[j].length > 0) hasAnyResults = true
      for (const fixture of results[j]) {
        allFixtures.push(mapFixture(fixture, batch[j]))
      }
    }
  }

  if (!hasAnyResults && allFixtures.length === 0) {
    throw new Error('No se pudieron obtener fixtures. Verificá la API key y la conexión.')
  }

  const fixtureMap = new Map<number, AgencyFixture>()
  for (const f of allFixtures) {
    const existing = fixtureMap.get(f.fixtureId)
    if (existing) {
      const newPlayers = f.players.filter(
        p => !existing.players.some(ep => ep.fullName === p.fullName)
      )
      existing.players.push(...newPlayers)
    } else {
      fixtureMap.set(f.fixtureId, { ...f })
    }
  }

  const merged = Array.from(fixtureMap.values()).sort((a, b) => a.timestamp - b.timestamp)
  setCache(merged)
  return merged
}

export function toArDateKey(date: Date | string): string {
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

// ─── PLAYER ID LOOKUP ────────────────────────────────────────────────────────

const PLAYER_ID_CACHE_KEY = 'dg-playerid-cache'
const PLAYER_ID_CACHE_TTL = 7 * 24 * 60 * 60 * 1000

export async function searchApiPlayerId(playerName: string, teamId: number): Promise<number | null> {
  if (!API_KEY) return null

  const cacheKey = `${PLAYER_ID_CACHE_KEY}:${playerName}:${teamId}`
  try {
    const raw = localStorage.getItem(cacheKey)
    if (raw) {
      const cached = JSON.parse(raw)
      if (Date.now() - cached.timestamp < PLAYER_ID_CACHE_TTL) return cached.data
    }
  } catch { /* ignore */ }

  try {
    const res = await apiFetch<Array<{ player: { id: number; name: string } }>>('/players/squads', { team: String(teamId) })
    const squad = res.response?.[0] as any
    if (!squad?.players) return null

    const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    const target = normalize(playerName)

    let match: number | null = null
    for (const p of squad.players) {
      const name = normalize(p.name ?? '')
      if (name === target) { match = p.id; break }
      const targetParts = target.split(' ')
      const nameParts = name.split(' ')
      const targetLast = targetParts[targetParts.length - 1]
      const nameLast = nameParts[nameParts.length - 1]
      if (targetLast === nameLast && targetParts[0]?.[0] === nameParts[0]?.[0]) {
        match = p.id
      }
    }

    try {
      localStorage.setItem(cacheKey, JSON.stringify({ data: match, timestamp: Date.now() }))
    } catch { /* quota */ }
    return match
  } catch {
    return null
  }
}

// ─── INJURIES ───────────────────────────────────────────────────────────────

export interface PlayerInjury {
  player: { id: number; name: string; photo: string }
  team: { id: number; name: string; logo: string }
  fixture: { id: number; date: string } | null
  league: { name: string; country: string; flag: string | null } | null
  type: string
  reason: string
}

export interface PlayerSidelined {
  type: string
  start: string
  end: string | null
}

const INJURY_CACHE_KEY = 'dg-injuries-cache'
const INJURY_CACHE_TTL = 12 * 60 * 60 * 1000

export async function fetchPlayerInjuries(playerId: number): Promise<PlayerSidelined[]> {
  if (!API_KEY) return []

  const cacheKey = `${INJURY_CACHE_KEY}:${playerId}`
  try {
    const raw = localStorage.getItem(cacheKey)
    if (raw) {
      const cached = JSON.parse(raw)
      if (Date.now() - cached.timestamp < INJURY_CACHE_TTL) return cached.data
    }
  } catch { /* ignore */ }

  try {
    const res = await apiFetch<PlayerSidelined[]>('/sidelined', { player: String(playerId) })
    const injuries = res.response ?? []
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ data: injuries, timestamp: Date.now() }))
    } catch { /* quota */ }
    return injuries
  } catch {
    return []
  }
}

// ─── TRANSFERS ──────────────────────────────────────────────────────────────

export interface PlayerTransfer {
  date: string
  type: string
  teams: {
    in: { id: number; name: string; logo: string }
    out: { id: number; name: string; logo: string }
  }
}

const TRANSFER_CACHE_KEY = 'dg-transfers-cache'
const TRANSFER_CACHE_TTL = 24 * 60 * 60 * 1000

export async function fetchPlayerTransfers(playerId: number): Promise<PlayerTransfer[]> {
  if (!API_KEY) return []

  const cacheKey = `${TRANSFER_CACHE_KEY}:${playerId}`
  try {
    const raw = localStorage.getItem(cacheKey)
    if (raw) {
      const cached = JSON.parse(raw)
      if (Date.now() - cached.timestamp < TRANSFER_CACHE_TTL) return cached.data
    }
  } catch { /* ignore */ }

  try {
    const res = await apiFetch<Array<{ player: any; update: string; transfers: PlayerTransfer[] }>>('/transfers', { player: String(playerId) })
    const transfers = res.response?.[0]?.transfers ?? []
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ data: transfers, timestamp: Date.now() }))
    } catch { /* quota */ }
    return transfers
  } catch {
    return []
  }
}

