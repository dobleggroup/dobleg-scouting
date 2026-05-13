import type { ApiResponse, ApiFixture, AgencyFixture, ApiFixturePlayersResponse, MatchAppearance, PlayerAppearanceData } from '@/types/footballApi'
import { AGENCY_PLAYERS, getPlayersByTeamId, getUniqueTeamIds } from '@/constants/agencyPlayers'

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

// ─── Player Appearances (per-match lineup data) ─────────────────────────────

const LINEUPS_CACHE_KEY = 'dg-lineups-cache-v2'
const FINISHED_STATUSES = ['FT', 'AET', 'PEN']

function normalizeName(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

function namesMatch(apiName: string, agencyName: string): boolean {
  const a = normalizeName(apiName)
  const b = normalizeName(agencyName)
  if (a === b) return true
  const aParts = a.split(/\s+/)
  const bParts = b.split(/\s+/)
  const aLast = aParts[aParts.length - 1]
  const bLast = bParts[bParts.length - 1]
  if (aLast === bLast && aParts.length >= 2 && bParts.length >= 2 && aParts[0][0] === bParts[0][0]) return true
  if (a.includes(b) || b.includes(a)) return true
  return false
}

function getLineupsCache(): Record<string, ApiFixturePlayersResponse[]> {
  try {
    const raw = localStorage.getItem(LINEUPS_CACHE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, ApiFixturePlayersResponse[]>
  } catch { return {} }
}

function saveLineupsCache(data: Record<string, ApiFixturePlayersResponse[]>) {
  try {
    localStorage.setItem(LINEUPS_CACHE_KEY, JSON.stringify(data))
  } catch { /* quota */ }
}

async function fetchFixturePlayers(fixtureId: number): Promise<ApiFixturePlayersResponse[]> {
  const res = await apiFetch<ApiFixturePlayersResponse[]>('/fixtures/players', {
    fixture: String(fixtureId),
  })
  return res.response
}

export async function fetchAgencyPlayersAppearances(
  fixtures: AgencyFixture[],
  onProgress?: (loaded: number, total: number) => void,
): Promise<Map<string, PlayerAppearanceData>> {
  const result = new Map<string, PlayerAppearanceData>()
  if (!API_KEY) return result

  const finished = fixtures.filter(f => FINISHED_STATUSES.includes(f.statusShort))
  const activePlayers = AGENCY_PLAYERS.filter(p => !p.isReserve && p.apiTeamId)

  const teamFixturesMap = new Map<number, AgencyFixture[]>()
  for (const p of activePlayers) {
    if (teamFixturesMap.has(p.apiTeamId!)) continue
    teamFixturesMap.set(
      p.apiTeamId!,
      finished
        .filter(f => f.homeTeam.id === p.apiTeamId || f.awayTeam.id === p.apiTeamId)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 5),
    )
  }

  const fixtureIds = new Set<number>()
  for (const fixes of teamFixturesMap.values()) {
    for (const f of fixes) fixtureIds.add(f.fixtureId)
  }

  const cache = getLineupsCache()
  const uncached = [...fixtureIds].filter(id => !cache[String(id)])
  let loaded = fixtureIds.size - uncached.length
  onProgress?.(loaded, fixtureIds.size)

  const BATCH = 10
  for (let i = 0; i < uncached.length; i += BATCH) {
    const batch = uncached.slice(i, i + BATCH)
    const results = await Promise.all(batch.map(id => fetchFixturePlayers(id).catch(() => null)))
    for (let j = 0; j < batch.length; j++) {
      if (results[j]) cache[String(batch[j])] = results[j]!
      loaded++
    }
    onProgress?.(loaded, fixtureIds.size)
    saveLineupsCache(cache)
    if (i + BATCH < uncached.length) await new Promise(r => setTimeout(r, 150))
  }

  for (const player of activePlayers) {
    const teamFixes = teamFixturesMap.get(player.apiTeamId!) || []
    const matches: MatchAppearance[] = []
    let starts = 0
    let subs = 0

    for (const fix of teamFixes) {
      const data = cache[String(fix.fixtureId)]
      if (!data) { matches.push({ fixtureId: fix.fixtureId, date: fix.date, status: 'not_played' }); continue }

      const teamData = data.find(t => t.team.id === player.apiTeamId)
      if (!teamData) { matches.push({ fixtureId: fix.fixtureId, date: fix.date, status: 'not_played' }); continue }

      const found = teamData.players.find(p => namesMatch(p.player.name, player.fullName))
      if (!found || !found.statistics[0]?.games?.minutes) {
        matches.push({ fixtureId: fix.fixtureId, date: fix.date, status: 'not_played' })
      } else if (found.statistics[0].games.substitute) {
        matches.push({ fixtureId: fix.fixtureId, date: fix.date, status: 'sub' })
        subs++
      } else {
        matches.push({ fixtureId: fix.fixtureId, date: fix.date, status: 'starter' })
        starts++
      }
    }

    const appearances = starts + subs
    const startRate = teamFixes.length > 0 ? Math.round((starts / teamFixes.length) * 100) : 0

    result.set(player.fullName, { matches, startRate, appearances, starts, subIns: subs })
  }

  return result
}
