import { supabase } from '@/lib/supabase'
import { normalizeName } from '@/utils/scoring'
import { agencyNameVariants } from '@/services/agencyPerformanceService'
import { fetchAgencyPlayerLinks, normalizeTeamName, type SquadStatRow } from '@/services/playerStatsService'
import { SOFASCORE_ID_OFFSET } from '@/services/teamTwinService'

const PAGE = 1000

/**
 * Una fila de `player_match_stats` con lo que piden el Inicio y el Tablero:
 * las columnas de siempre más el partido completo (liga, local/visitante, resultado).
 */
export type AgencyMatchRow = SquadStatRow & {
  fixture?: {
    date: string
    league_id: number | null
    home_team_id: number | null
    away_team_id: number | null
    score_home: number | null
    score_away: number | null
  } | null
}

const STAT_COLUMNS = `
  player_id, team_id, fixture_id, minutes, goals, assists,
  shots_total, shots_on, passes_total, passes_key, passes_accuracy,
  tackles, interceptions, duels_won, duels_total, dribbles_success, dribbles_attempted,
  rating, detected_position,
  player:players(name),
  fixture:fixtures!inner(date, league_id, home_team_id, away_team_id, score_home, score_away)
`

export interface AgencyRosterEntry {
  fullName: string
  shortName?: string
  apiTeamId: number | null
}

export interface AgencyMatchRows {
  rows: AgencyMatchRow[]
  /** Id de fila de `players` → jugador del roster (por identidad oficial). */
  owners: Map<number, string>
  /** Club de Sofascore → club de API-Football del roster (mismo nombre sin acentos). */
  teamTwins: Map<number, number>
}

export async function paged<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let page = 0; ; page++) {
    const { data, error } = await withRetry(() => build(page * PAGE, (page + 1) * PAGE - 1))
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
}

/**
 * Reintenta una consulta que se cortó por el límite de tiempo de Supabase
 * (`57014 statement timeout`): con la base "fría" la búsqueda por nombre en
 * `players` puede pasar los 8 s la primera vez y tardar <1 s la segunda.
 */
async function withRetry<T>(run: () => PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }>, tries = 3) {
  for (let i = 1; ; i++) {
    const res = await run()
    const timedOut = res.error && (res.error.code === '57014' || /statement timeout/i.test(res.error.message))
    if (!timedOut || i >= tries) return res
  }
}

const statsQuery = (playerIds: number[], fromISO: string, teamIds?: number[]) =>
  paged<AgencyMatchRow>((from, to) => {
    let q = supabase
      .from('player_match_stats')
      .select(STAT_COLUMNS)
      .in('player_id', playerIds)
      .gte('fixture.date', fromISO)
    if (teamIds) q = q.in('team_id', teamIds)
    return q
      .order('fixture_id', { ascending: true })
      .order('player_id', { ascending: true })
      .range(from, to)
  })

let sofascoreTeams: Promise<{ id: number; name: string }[]> | null = null

/**
 * Club de Sofascore (id ≥ 20.000.000) → club del roster con el mismo nombre
 * sin acentos ni prefijo ("Unión Magdalena" = "Union Magdalena"). Son ~130
 * clubes: se piden una vez por sesión.
 */
export async function fetchTeamTwins(apiTeamIds: number[]): Promise<Map<number, number>> {
  if (apiTeamIds.length === 0) return new Map()
  sofascoreTeams ??= paged<{ id: number; name: string }>((from, to) =>
    supabase.from('teams').select('id, name').gte('id', SOFASCORE_ID_OFFSET).order('id').range(from, to),
  ).catch(e => { sofascoreTeams = null; throw e })
  const [sofa, own] = await Promise.all([
    sofascoreTeams,
    supabase.from('teams').select('id, name').in('id', apiTeamIds),
  ])
  if (own.error) throw new Error(own.error.message)
  const byName = new Map<string, number>()
  for (const t of own.data ?? []) byName.set(normalizeTeamName(t.name as string), t.id as number)
  const twins = new Map<number, number>()
  for (const t of sofa) {
    const api = byName.get(normalizeTeamName(t.name))
    if (api != null) twins.set(t.id, api)
  }
  return twins
}

/**
 * Todos los partidos de los jugadores Doble G desde `fromISO`, buscados de dos
 * maneras (lo repetido se funde después, ver `ownedRows` en el Tablero):
 * - por identidad oficial (`fetchAgencyPlayerLinks` → todas las filas con su
 *   mismo `canonical_id`), sin filtrar por club: entran las ligas que carga
 *   Sofascore con otros ids de club y los partidos con su club anterior;
 * - por nombre dentro de su club (o el gemelo de Sofascore de su club): hay
 *   jugadores cuya identidad oficial todavía no está unida a la fila que trae
 *   sus partidos.
 *
 * Antes el Inicio usaba sólo la segunda: los jugadores de ligas que carga
 * Sofascore (Kabalin, Farías, Mulet, Ginzo, Sanabria) no aparecían nunca.
 */
/** Desde cuándo piden partidos el Inicio y el Tablero (un año y un día): mismo valor = un solo pedido compartido. */
export const AGENCY_ROWS_DAYS = 366

/** 'YYYY-MM-DD' de hace `AGENCY_ROWS_DAYS` días. */
export function agencyRowsFromISO(): string {
  return new Date(Date.now() - AGENCY_ROWS_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

const CACHE_MS = 60_000
const cache = new Map<string, { at: number; promise: Promise<AgencyMatchRows> }>()

/**
 * El Inicio y el Tablero piden lo mismo: si ya hay un pedido en curso o de
 * hace menos de un minuto para el mismo roster y la misma fecha, se reusa
 * en vez de volver a pegarle a la base (que tiene poca capacidad).
 * `force` lo pide de nuevo igual (botón "Actualizar").
 */
export function fetchAgencyMatchRows(roster: AgencyRosterEntry[], fromISO: string, force = false): Promise<AgencyMatchRows> {
  const key = `${fromISO}|${roster.map(p => `${p.fullName}:${p.apiTeamId ?? ''}`).join(',')}`
  const hit = cache.get(key)
  if (!force && hit && Date.now() - hit.at < CACHE_MS) return hit.promise
  const promise = loadAgencyMatchRows(roster, fromISO)
  cache.set(key, { at: Date.now(), promise })
  promise.catch(() => { if (cache.get(key)?.promise === promise) cache.delete(key) })
  return promise
}

async function loadAgencyMatchRows(roster: AgencyRosterEntry[], fromISO: string): Promise<AgencyMatchRows> {
  const apiTeamIds = [...new Set(roster.map(p => p.apiTeamId).filter((id): id is number => id != null))]
  const owners = new Map<number, string>()

  const [links, teamTwins] = await Promise.all([fetchAgencyPlayerLinks(), fetchTeamTwins(apiTeamIds)])
  const canonicalOwner = new Map<number, string>()
  for (const p of roster) {
    const canonical = links.get(normalizeName(p.fullName))
    if (canonical != null) canonicalOwner.set(canonical, p.fullName)
  }

  const linkedRowsPromise = (async () => {
    const canonicalIds = [...canonicalOwner.keys()]
    if (canonicalIds.length === 0) return [] as AgencyMatchRow[]
    const { data, error } = await withRetry(() => supabase.from('players').select('id, canonical_id').in('canonical_id', canonicalIds))
    if (error) throw new Error(error.message)
    for (const r of data ?? []) {
      const owner = canonicalOwner.get(r.canonical_id as number)
      if (owner) owners.set(r.id as number, owner)
    }
    for (const [canonical, owner] of canonicalOwner) owners.set(canonical, owner)
    return statsQuery([...owners.keys()], fromISO)
  })()

  const namedRowsPromise = (async () => {
    const teamIds = [...apiTeamIds, ...teamTwins.keys()]
    if (teamIds.length === 0) return [] as AgencyMatchRow[]
    const { data, error } = await withRetry(() => supabase.from('players').select('id, name').in('name', agencyNameVariants(roster)))
    if (error) throw new Error(error.message)
    const keys = new Set(roster.flatMap(p => [p.fullName, p.shortName].filter(Boolean).map(n => normalizeName(n!))))
    const ids = (data ?? []).filter(p => keys.has(normalizeName(p.name as string))).map(p => p.id as number)
    return ids.length ? statsQuery(ids, fromISO, teamIds) : []
  })()

  const [linkedRows, namedRows] = await Promise.all([linkedRowsPromise, namedRowsPromise])
  const seen = new Set<string>()
  const rows = [...linkedRows, ...namedRows].filter(r => {
    const key = `${r.player_id}|${r.fixture_id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return { rows, owners, teamTwins }
}
