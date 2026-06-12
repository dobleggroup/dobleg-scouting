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
  fee: string | null
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
    const res = await apiFetch<Array<{ player: any; update: string; transfers: Array<{ date: string; type: string; teams: PlayerTransfer['teams'] }> }>>('/transfers', { player: String(playerId) })
    const raw = res.response?.[0]?.transfers ?? []
    const transfers: PlayerTransfer[] = raw.map(t => ({
      date: t.date,
      type: t.type,
      teams: t.teams,
      fee: (t as any).fee ?? null,
    }))
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ data: transfers, timestamp: Date.now() }))
    } catch { /* quota */ }
    return transfers
  } catch {
    return []
  }
}

export interface AgencyTransfer extends PlayerTransfer {
  playerName: string
  playerImage: string | null
}

const AGENCY_TRANSFERS_CACHE_KEY = 'dg-agency-transfers'
const AGENCY_TRANSFERS_CACHE_TTL = 24 * 60 * 60 * 1000

const SQUAD_CACHE_KEY = 'dg-squad-cache'
const SQUAD_CACHE_TTL = 7 * 24 * 60 * 60 * 1000

async function fetchSquadCached(teamId: number): Promise<Array<{ id: number; name: string }>> {
  const cacheKey = `${SQUAD_CACHE_KEY}:${teamId}`
  try {
    const raw = localStorage.getItem(cacheKey)
    if (raw) {
      const cached = JSON.parse(raw)
      if (Date.now() - cached.timestamp < SQUAD_CACHE_TTL) return cached.data
    }
  } catch { /* ignore */ }

  if (!API_KEY) return []
  try {
    const res = await apiFetch<any>('/players/squads', { team: String(teamId) })
    const squad = res.response?.[0]
    const players: Array<{ id: number; name: string }> = (squad?.players ?? []).map((p: any) => ({ id: p.id as number, name: (p.name ?? '') as string }))
    try { localStorage.setItem(cacheKey, JSON.stringify({ data: players, timestamp: Date.now() })) } catch { /* quota */ }
    return players
  } catch {
    return []
  }
}

function resolvePlayerInSquad(playerName: string, squad: Array<{ id: number; name: string }>): number | null {
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const target = norm(playerName)
  for (const p of squad) {
    const name = norm(p.name)
    if (name === target) return p.id
    const tParts = target.split(' ')
    const nParts = name.split(' ')
    if (tParts[tParts.length - 1] === nParts[nParts.length - 1] && tParts[0]?.[0] === nParts[0]?.[0]) return p.id
  }
  return null
}

export async function fetchAgencyTransfers(onProgress?: (done: number, total: number) => void): Promise<AgencyTransfer[]> {
  try {
    const raw = localStorage.getItem(AGENCY_TRANSFERS_CACHE_KEY)
    if (raw) {
      const cached = JSON.parse(raw)
      if (Date.now() - cached.timestamp < AGENCY_TRANSFERS_CACHE_TTL) return cached.data
    }
  } catch { /* ignore */ }

  const { AGENCY_PLAYERS } = await import('@/constants/agencyPlayers')
  const active = AGENCY_PLAYERS.filter(p => !p.isReserve && p.apiTeamId)

  // Group by team to share squad API calls
  const byTeam = new Map<number, typeof active>()
  for (const p of active) {
    const list = byTeam.get(p.apiTeamId!) ?? []
    list.push(p)
    byTeam.set(p.apiTeamId!, list)
  }

  // Phase 1: Resolve API-Football IDs (1 squad call per team)
  const playerApiIds = new Map<string, number>()
  const teams = Array.from(byTeam.entries())
  for (let i = 0; i < teams.length; i += 3) {
    const batch = teams.slice(i, i + 3)
    await Promise.all(batch.map(async ([teamId, players]) => {
      const squad = await fetchSquadCached(teamId)
      for (const player of players) {
        const apiId = resolvePlayerInSquad(player.fullName, squad)
        if (apiId) playerApiIds.set(player.fullName, apiId)
      }
    }))
    if (i + 3 < teams.length) await new Promise(r => setTimeout(r, 800))
  }

  // Phase 2: Fetch transfers (cached individually for 24h)
  const resolved = active.filter(p => playerApiIds.has(p.fullName))
  const allTransfers: AgencyTransfer[] = []
  let done = 0

  for (let i = 0; i < resolved.length; i += 5) {
    const batch = resolved.slice(i, i + 5)
    const results = await Promise.all(
      batch.map(async (player) => {
        const apiId = playerApiIds.get(player.fullName)!
        const transfers = await fetchPlayerTransfers(apiId)
        done++
        onProgress?.(done, resolved.length)
        return transfers.map(t => ({ ...t, playerName: player.shortName, playerImage: player.image }))
      })
    )
    allTransfers.push(...results.flat())
    if (i + 5 < resolved.length) await new Promise(r => setTimeout(r, 800))
  }

  allTransfers.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  try {
    localStorage.setItem(AGENCY_TRANSFERS_CACHE_KEY, JSON.stringify({ data: allTransfers, timestamp: Date.now() }))
  } catch { /* quota */ }

  return allTransfers
}


export interface ResolvedTeam { teamId: number; teamName: string }

/** Resuelve el equipo actual de un jugador por su id API-Football (best-effort). */
export async function resolvePlayerTeam(apiPlayerId: number): Promise<ResolvedTeam | null> {
  if (!API_KEY) return null
  const season = String(new Date().getFullYear())
  try {
    const res = await apiFetch<any[]>('/players', { id: String(apiPlayerId), season })
    const stats = (res.response?.[0] as any)?.statistics
    if (!stats || stats.length === 0) return null
    // Tomar el primer equipo con id (suele ser el de la temporada en curso)
    const withTeam = stats.find((s: any) => s?.team?.id)
    if (!withTeam) return null
    return { teamId: withTeam.team.id, teamName: withTeam.team.name }
  } catch (e) {
    console.error('resolvePlayerTeam error:', e)
    return null
  }
}
