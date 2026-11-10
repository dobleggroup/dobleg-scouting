import { supabase } from '@/lib/supabase'
import { agencyRosterFilter } from '@/services/playerStatsService'
import type { ValuePoint } from './portfolioMetrics'

const AGENCY = 'Doble G Sports Group'

/** Clubes de ligas que no sincronizamos: ningún otro jugador sirve de referencia para ubicarlos. */
const CLUB_COUNTRY_MANUAL: Record<number, string> = {
  53944: 'Indonesia', // Bhayangkara Presisi Lampung FC
}

const NO_CLUB = /without club|career break|retired|unknown/i
const NOT_A_COUNTRY = new Set(['Europe', 'South America', 'North America', 'Asia', 'Africa', 'World'])

export interface PortfolioLiveRow {
  name: string
  transfermarktId: number | null
  country: string | null
  noClub: boolean
  contractEnd: string | null
  snapshots: ValuePoint[]
}

interface TeamEmbed { leagues?: { country?: string | null; is_cup?: boolean | null } | null }

function domesticCountry(team: TeamEmbed | null | undefined): string | null {
  const league = team?.leagues
  if (!league?.country || league.is_cup || NOT_A_COUNTRY.has(league.country)) return null
  return league.country
}

async function paged<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

/**
 * El país sale del club actual de Transfermarkt, no de `current_team_id`: ese queda viejo
 * cuando un jugador pasa a un equipo que no seguimos (Vera sigue figurando en Nacional).
 * Cada club de Transfermarkt se ubica por dónde juegan los otros futbolistas de ese club;
 * los de la agencia no votan, justamente porque son los que pueden estar viejos.
 */
async function fetchClubCountries(clubIds: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  if (clubIds.length === 0) return out
  const rows = await paged<{ tm_club_id: number; teams: TeamEmbed | null }>((f, t) => supabase
    .from('players')
    .select('tm_club_id, teams:current_team_id(leagues:league_id(country, is_cup))')
    .in('tm_club_id', clubIds)
    .not('current_team_id', 'is', null)
    .or(`agent.is.null,agent.neq."${AGENCY}"`)
    .order('id')
    .range(f, t))
  const votes = new Map<number, Map<string, number>>()
  for (const r of rows) {
    const country = domesticCountry(r.teams)
    if (!country) continue
    const club = votes.get(r.tm_club_id) ?? new Map<string, number>()
    club.set(country, (club.get(country) ?? 0) + 1)
    votes.set(r.tm_club_id, club)
  }
  for (const [club, counts] of votes) {
    out.set(club, [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0])
  }
  return out
}

/**
 * País de los clubes de la lista de la agencia. Hace falta para los representados que en
 * Transfermarkt figuran con otro representante (Prestianni con Gestifute): esos no vienen
 * en la consulta por `agent`.
 */
export async function fetchTeamCountries(teamIds: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  if (teamIds.length === 0) return out
  const { data, error } = await supabase
    .from('teams')
    .select('id, leagues:league_id(country, is_cup)')
    .in('id', teamIds)
  if (error) throw new Error(error.message)
  for (const t of (data ?? []) as unknown as Array<TeamEmbed & { id: number }>) {
    const country = domesticCountry(t)
    if (country) out.set(t.id, country)
  }
  return out
}

/** `rosterTmIds`: ids de Transfermarkt del plantel, para incluir a los que TM lista con otro representante. */
type PlayerRow = {
  id: number
  canonical_id: number | null
  name: string
  transfermarkt_id: number | null
  tm_club_id: number | null
  tm_club_name: string | null
  contract_end_date: string | null
  teams: TeamEmbed | null
}

const PLAYER_COLUMNS = 'id, canonical_id, name, transfermarkt_id, tm_club_id, tm_club_name, contract_end_date, teams:current_team_id(leagues:league_id(country, is_cup))'

export async function fetchPortfolioLiveRows(rosterTmIds: number[] = []): Promise<PortfolioLiveRow[]> {
  const { data, error } = await supabase.from('players').select(PLAYER_COLUMNS).or(agencyRosterFilter(rosterTmIds))
  if (error) throw new Error(error.message)
  const all = (data ?? []) as unknown as PlayerRow[]

  // La fila oficial de un gemelo puede no tener agente ni id de Transfermarkt (la del
  // proveedor de partidos): se la trae aparte y se completa con los datos de su gemela.
  const fetched = new Set(all.map(r => r.id))
  const missingOwners = [...new Set(all.map(r => r.canonical_id).filter((id): id is number => id != null && !fetched.has(id)))]
  if (missingOwners.length) {
    const { data: owners, error: ownersErr } = await supabase.from('players').select(PLAYER_COLUMNS).in('id', missingOwners)
    if (ownersErr) throw new Error(ownersErr.message)
    all.push(...((owners ?? []) as unknown as PlayerRow[]))
  }
  const twinsOf = new Map<number, PlayerRow[]>()
  for (const r of all) {
    const owner = r.canonical_id ?? r.id
    twinsOf.set(owner, [...(twinsOf.get(owner) ?? []), r])
  }
  const officials = all
    .filter(r => r.canonical_id == null || r.canonical_id === r.id)
    .map(r => {
      const twins = twinsOf.get(r.id) ?? []
      const withTm = r.transfermarkt_id != null ? r : twins.find(t => t.transfermarkt_id != null)
      return {
        ...r,
        transfermarkt_id: r.transfermarkt_id ?? withTm?.transfermarkt_id ?? null,
        tm_club_id: r.tm_club_id ?? withTm?.tm_club_id ?? null,
        tm_club_name: r.tm_club_name ?? withTm?.tm_club_name ?? null,
        contract_end_date: r.contract_end_date ?? twins.find(t => t.contract_end_date)?.contract_end_date ?? null,
      }
    })

  const clubIds = [...new Set(officials
    .filter(r => r.tm_club_id != null && !NO_CLUB.test(r.tm_club_name ?? '') && !CLUB_COUNTRY_MANUAL[r.tm_club_id])
    .map(r => r.tm_club_id as number))]

  const [clubCountries, history] = await Promise.all([
    fetchClubCountries(clubIds),
    paged<{ player_id: number; recorded_at: string; value_eur: number }>((f, t) => supabase
      .from('market_value_history')
      .select('player_id, recorded_at, value_eur')
      .in('player_id', all.map(r => r.id))
      .order('recorded_at')
      .order('player_id')
      .range(f, t)),
  ])

  // Gemelos: el mismo día puede venir dos veces; gana el de la fila oficial.
  const ownerOf = new Map(all.map(r => [r.id, r.canonical_id ?? r.id]))
  const byOwner = new Map<number, Map<string, { value: number; official: boolean }>>()
  for (const h of history) {
    if (!(h.value_eur > 0)) continue
    const owner = ownerOf.get(h.player_id) ?? h.player_id
    const official = h.player_id === owner
    const dates = byOwner.get(owner) ?? new Map<string, { value: number; official: boolean }>()
    if (!dates.has(h.recorded_at) || official) dates.set(h.recorded_at, { value: h.value_eur, official })
    byOwner.set(owner, dates)
  }

  return officials.map(r => {
    const noClub = NO_CLUB.test(r.tm_club_name ?? '')
    const country = noClub
      ? null
      : r.tm_club_id != null
        ? CLUB_COUNTRY_MANUAL[r.tm_club_id] ?? clubCountries.get(r.tm_club_id) ?? null
        : domesticCountry(r.teams)
    const dates = byOwner.get(r.id)
    return {
      name: r.name,
      transfermarktId: r.transfermarkt_id,
      country,
      noClub,
      contractEnd: r.contract_end_date,
      snapshots: dates
        ? [...dates.entries()].map(([date, v]) => ({ date, value: v.value })).sort((a, b) => a.date.localeCompare(b.date))
        : [],
    }
  })
}
