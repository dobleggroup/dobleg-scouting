import { supabase } from '@/lib/supabase'
import { BASE_AGENCY_PLAYERS, _setRuntimeAgencyPlayers, type AgencyPlayer } from '@/constants/agencyPlayers'

export interface AgencyOverlayRow {
  kind: 'add' | 'remove'
  player_key: string
  full_name: string
  short_name: string | null
  api_player_id: number | null
  supabase_player_id: number | null
  image: string | null
  contract_end: string | null
  market_value: string | null
  team: string | null
  api_team_id: number | null
  is_reserve: boolean
}

/** Clave de identidad: NFD, lower, sin acentos ni puntos, espacios colapsados. */
export function agencyKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
}

function rowToAgencyPlayer(r: AgencyOverlayRow): AgencyPlayer {
  return {
    shortName: r.short_name || r.full_name,
    fullName: r.full_name,
    image: r.image,
    contractEnd: r.contract_end,
    marketValue: r.market_value,
    team: r.team || '',
    apiTeamId: r.api_team_id,
    isReserve: r.is_reserve,
  }
}

/** Fusiona base − bajas + altas. De-dup por clave de nombre. */
export function mergeAgencyPlayers(base: AgencyPlayer[], overlay: AgencyOverlayRow[]): AgencyPlayer[] {
  const removed = new Set(overlay.filter(r => r.kind === 'remove').map(r => r.player_key))
  const result = base.filter(p => !removed.has(agencyKey(p.fullName)))
  const present = new Set(result.map(p => agencyKey(p.fullName)))
  for (const r of overlay) {
    if (r.kind !== 'add') continue
    if (present.has(r.player_key)) continue
    result.push(rowToAgencyPlayer(r))
    present.add(r.player_key)
  }
  return result
}

/** True si `target` (por nombre) está en la lista Doble G provista. */
export function matchAgency(
  list: AgencyPlayer[],
  target: { name: string; apiPlayerId?: number | null },
): boolean {
  const key = agencyKey(target.name)
  return list.some(p =>
    agencyKey(p.fullName) === key || agencyKey(p.shortName) === key
  )
}

// ─── Runtime cache (lectura síncrona para consumidores no-React) ───────────────
let _cache: AgencyPlayer[] = [...BASE_AGENCY_PLAYERS]

export function getAgencyPlayers(): AgencyPlayer[] {
  return _cache
}

/** Carga el overlay de Supabase y actualiza el cache. Si falla, deja la base. */
export async function loadAgencyPlayers(): Promise<AgencyPlayer[]> {
  const { data, error } = await supabase.from('agency_players').select('*')
  if (error || !data) {
    console.error('Error loading agency_players overlay:', error)
    _cache = [...BASE_AGENCY_PLAYERS]
    _setRuntimeAgencyPlayers(_cache)
    return _cache
  }
  _cache = mergeAgencyPlayers(BASE_AGENCY_PLAYERS, data as AgencyOverlayRow[])
  _setRuntimeAgencyPlayers(_cache)
  return _cache
}

// ─── Mutaciones ────────────────────────────────────────────────────────────────

export interface AddAgencyInput {
  fullName: string
  shortName?: string | null
  apiPlayerId?: number | null
  supabasePlayerId?: number | null
  image?: string | null
  contractEnd?: string | null
  marketValue?: string | null
  team?: string | null
  apiTeamId?: number | null
  isReserve?: boolean
}

export async function addAgencyPlayer(
  input: AddAgencyInput,
  userId?: string,
  userName?: string,
): Promise<boolean> {
  const { error } = await supabase.from('agency_players').upsert({
    kind: 'add',
    player_key: agencyKey(input.fullName),
    full_name: input.fullName,
    short_name: input.shortName ?? null,
    api_player_id: input.apiPlayerId ?? null,
    supabase_player_id: input.supabasePlayerId ?? null,
    image: input.image ?? null,
    contract_end: input.contractEnd ?? null,
    market_value: input.marketValue ?? null,
    team: input.team ?? null,
    api_team_id: input.apiTeamId ?? null,
    is_reserve: input.isReserve ?? false,
    added_by: userId ?? null,
    added_by_name: userName ?? null,
  }, { onConflict: 'player_key' })
  if (error) { console.error('addAgencyPlayer error:', error); return false }
  await loadAgencyPlayers()
  return true
}

/**
 * Quita a un jugador de Doble G. Para los 41 base inserta una fila kind='remove'
 * (tapa la base). Para un agregado, también lo deja como 'remove' (idempotente).
 */
export async function removeAgencyPlayer(
  fullName: string,
  userId?: string,
  userName?: string,
): Promise<boolean> {
  const { error } = await supabase.from('agency_players').upsert({
    kind: 'remove',
    player_key: agencyKey(fullName),
    full_name: fullName,
    is_reserve: false,
    added_by: userId ?? null,
    added_by_name: userName ?? null,
  }, { onConflict: 'player_key' })
  if (error) { console.error('removeAgencyPlayer error:', error); return false }
  await loadAgencyPlayers()
  return true
}
