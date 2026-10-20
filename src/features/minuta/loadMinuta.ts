/**
 * Minuta mensual: junta todo lo que hace falta para un mes (partidos de
 * API-Football/Sofascore, Wyscout, GPS, valores de Transfermarkt, contratos,
 * Mercado, clase de cada jugador y DTs de la agencia). Lo usan la página de
 * Rendimiento individual y el script del mail. Reutiliza la misma
 * búsqueda de partidos que el Tablero para que los números coincidan con la app.
 */
import { supabase } from '@/lib/supabase'
import { loadAgencyPlayers, agencyKey } from '@/services/agencyPlayersService'
import { fetchTableroDataset } from '@/features/tablero/tableroService'
import { toAppearances, type RosterEntry } from '@/features/tablero/tableroData'
import { FILTER_POSITION_MAP } from '@/constants/scoring'
import { normalizeName } from '@/utils/scoring'
import type { AgencyPlayer } from '@/constants/agencyPlayers'
import type { CoachMonth, MinutaData } from './analyze'
import type { PosGroup } from '@/features/wyscoutPerf/metrics'

/** Lo que cambia entre la app y el script: la planilla interna y la tabla de posiciones. */
export interface LoadOptions {
  /** Filas de la planilla de Scouting Interno (Jugador, Posición). */
  internalRows?: Array<Record<string, string | undefined>>
  /** Tabla de posiciones de un DT; sin esto no se pide (la cuota de API-Football es compartida). */
  standing?: (league: number, season: number, team: number) => Promise<CoachMonth['standing']>
  /** Sin DTs (la página no los muestra). */
  coaches?: boolean
}

const APP_POSITION_GROUP: Record<string, PosGroup> = {
  'Arquero': 'ARQ', 'Defensor Central': 'DEF',
  'Lateral Derecho': 'LAT', 'Lateral Izquierdo': 'LAT', 'Lateral': 'LAT',
  'Volante Central': 'VC', 'Volante Interno': 'MED',
  'Extremo Derecho': 'EXT', 'Extremo Izquierdo': 'EXT', 'Extremo': 'EXT',
  'Delantero': 'DEL',
}

async function paged<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return out
}

/** "31/12/2026" → "2026-12-31". */
function dmyToIso(s: string | null | undefined): string | null {
  const m = (s ?? '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null
}

/** Posición de la ficha (planilla de Scouting Interno, o la del alta). */
function loadGroups(roster: AgencyPlayer[], internalRows: LoadOptions['internalRows'] = []): Map<string, PosGroup> {
  const out = new Map<string, PosGroup>()
  const byName = new Map<string, string>()
  for (const p of roster) {
    byName.set(normalizeName(p.fullName), agencyKey(p.fullName))
    byName.set(normalizeName(p.shortName), agencyKey(p.fullName))
  }
  for (const r of internalRows) {
    const key = byName.get(normalizeName(r['Jugador'] ?? ''))
    const g = APP_POSITION_GROUP[FILTER_POSITION_MAP[r['Posición'] ?? ''] ?? '']
    if (key && g) out.set(key, g)
  }
  for (const p of roster) {
    const g = APP_POSITION_GROUP[FILTER_POSITION_MAP[p.position ?? ''] ?? '']
    if (!out.has(agencyKey(p.fullName)) && g) out.set(agencyKey(p.fullName), g)
  }
  return out
}

async function loadCoaches(month: string, standing: LoadOptions['standing']): Promise<CoachMonth[]> {
  const { data } = await supabase.from('agency_coaches')
    .select('key, full_name, status, club, api_team_id, league_api_id, league_name, league_season, active')
    .eq('active', true)
  const from = `${month}-01`
  const to = nextMonth(month) + '-01'
  const out: CoachMonth[] = []
  for (const c of (data ?? []) as any[]) {
    const coach: CoachMonth = { key: c.key, name: c.full_name, status: c.status, club: c.club, league: c.league_name, teamId: c.api_team_id, matches: [], standing: null }
    if (c.api_team_id) {
      // El club puede estar dos veces (API-Football y Sofascore): se buscan los dos.
      const { data: twins } = await supabase.from('teams').select('id').ilike('name', c.club ?? '')
      const teamIds = [...new Set([c.api_team_id, ...((twins ?? []) as any[]).map(t => t.id)])]
      const sel = 'date, home_team_id, away_team_id, score_home, score_away'
      const [h, a] = await Promise.all([
        supabase.from('fixtures').select(sel).in('home_team_id', teamIds).gte('date', from).lt('date', to),
        supabase.from('fixtures').select(sel).in('away_team_id', teamIds).gte('date', from).lt('date', to),
      ])
      const raw = [...(h.data ?? []), ...(a.data ?? [])].filter((f: any) => f.score_home != null)
        .sort((x: any, y: any) => x.date.localeCompare(y.date))
      const fx = raw.filter((f: any, i: number) => i === 0 || Date.parse(f.date) - Date.parse(raw[i - 1].date) > 36 * 3600e3)
      const ids = [...new Set(fx.flatMap((f: any) => [f.home_team_id, f.away_team_id]))]
      const { data: teams } = await supabase.from('teams').select('id, name').in('id', ids.length ? ids : [0])
      const name = new Map((teams ?? []).map((t: any) => [t.id, t.name]))
      coach.matches = fx.map((f: any) => {
        const home = teamIds.includes(f.home_team_id)
        return { date: f.date, rival: name.get(home ? f.away_team_id : f.home_team_id) ?? 'Rival', home, gf: home ? f.score_home : f.score_away, ga: home ? f.score_away : f.score_home }
      }).sort((x, y) => x.date.localeCompare(y.date))
      if (standing && c.league_api_id && c.league_season) coach.standing = await standing(c.league_api_id, c.league_season, c.api_team_id).catch(() => null)
    }
    out.push(coach)
  }
  return out
}

export function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

export function prevMonth(month: string, n = 1): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 - n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export async function loadMinuta(month: string, opts: LoadOptions = {}): Promise<MinutaData> {
  const players = await loadAgencyPlayers()
  const roster = players
  const tableroRoster: RosterEntry[] = roster.map(p => ({ fullName: p.fullName, shortName: p.shortName, apiTeamId: p.apiTeamId, team: p.team, isReserve: p.isReserve }))
  const dataset = await fetchTableroDataset(tableroRoster, true)
  const teamAlias = new Map<number, number>()
  const apps = toAppearances(dataset.rows, tableroRoster, { owners: dataset.owners, teamTwins: dataset.teamTwins, teamAliasOut: teamAlias })

  const keys = roster.map(p => agencyKey(p.fullName))
  const since = prevMonth(month, 12) + '-01'
  const until = nextMonth(month) + '-01'

  const [wy, gps, cls, groups, coaches, negs] = await Promise.all([
    paged<any>((f, t) => supabase.from('wyscout_player_matches')
      .select('player_key, match_date, match_label, competition, position, minutes, stats')
      .gte('match_date', prevMonth(month, 18) + '-01').lt('match_date', until).order('id').range(f, t)),
    paged<any>((f, t) => supabase.from('gps_entries').select('player_key, match_date, rival, minutos, metrics').lt('match_date', until).order('match_date').range(f, t)),
    supabase.from('agency_classifications').select('player_name, class'),
    loadGroups(roster, opts.internalRows),
    opts.coaches === false ? Promise.resolve([]) : loadCoaches(month, opts.standing),
    supabase.from('market_negotiations').select('player_name, team_name, status, player_source, created_at, updated_at, next_followup_date').order('updated_at', { ascending: false }),
  ])

  // Valores de Transfermarkt y contratos: filas de la agencia en `players`, por nombre.
  const { data: agencyRows } = await supabase.from('players')
    .select('id, canonical_id, name, contract_end_date').eq('agent', 'Doble G Sports Group')
  const keyOfName = new Map<string, string>()
  for (const p of roster) {
    keyOfName.set(normalizeName(p.fullName), agencyKey(p.fullName))
    if (!roster.some(o => o !== p && normalizeName(o.shortName) === normalizeName(p.shortName))) keyOfName.set(normalizeName(p.shortName), agencyKey(p.fullName))
  }
  const rowKey = new Map<number, string>()
  for (const r of (agencyRows ?? []) as any[]) {
    const k = keyOfName.get(normalizeName(r.name))
    if (k) rowKey.set(r.id, k)
  }
  const contracts = new Map<string, string>()
  for (const r of (agencyRows ?? []) as any[]) {
    const k = rowKey.get(r.id)
    if (k && r.contract_end_date && (!contracts.has(k) || (r.canonical_id ?? r.id) === r.id)) contracts.set(k, r.contract_end_date)
  }
  for (const p of roster) {
    const iso = dmyToIso(p.contractEnd)
    if (iso && !contracts.has(agencyKey(p.fullName))) contracts.set(agencyKey(p.fullName), iso)
  }
  const ids = [...rowKey.keys()]
  const mv = ids.length ? await paged<any>((f, t) => supabase.from('market_value_history')
    .select('player_id, recorded_at, value_eur').in('player_id', ids).gte('recorded_at', prevMonth(month, 13) + '-01')
    .order('recorded_at').range(f, t)) : []
  const values = new Map<string, Array<{ date: string; eur: number }>>()
  for (const r of mv) {
    const k = rowKey.get(r.player_id)!
    const list = values.get(k) ?? []
    // Gemelos: el mismo día puede venir dos veces; queda la última.
    if (list.length && list[list.length - 1].date === r.recorded_at) list[list.length - 1].eur = r.value_eur
    else list.push({ date: r.recorded_at, eur: r.value_eur })
    values.set(k, list)
  }

  const classes = new Map<string, 'A' | 'B' | 'C'>()
  for (const r of (cls.data ?? []) as any[]) {
    const p = roster.find(x => normalizeName(x.fullName) === normalizeName(r.player_name))
    if (p) classes.set(agencyKey(p.fullName), r.class)
  }


  return {
    month,
    players: roster.map(p => ({ key: agencyKey(p.fullName), fullName: p.fullName, shortName: p.shortName, team: p.team, apiTeamId: p.apiTeamId, isReserve: p.isReserve })),
    apps, teamFixtures: dataset.teamFixtures, teamAlias, teamNames: dataset.teamNames,
    wyscout: wy.filter(r => keys.includes(r.player_key)).map(r => ({
      key: r.player_key, date: r.match_date, label: r.match_label, competition: r.competition, position: r.position,
      minutes: Number(r.minutes) || 0,
      stats: Object.fromEntries(Object.entries(r.stats ?? {}).map(([k, v]) => [k, Number(v) || 0])),
    })),
    gps: gps.filter(r => keys.includes(r.player_key) && r.match_date >= since).map(r => ({
      key: r.player_key, date: r.match_date, rival: r.rival, minutes: r.minutos == null ? null : Number(r.minutos),
      metrics: Object.fromEntries(Object.entries(r.metrics ?? {}).map(([k, v]) => [k, Number(v)]).filter(([, v]) => Number.isFinite(v as number))),
    })),
    values, contracts, classes, groups,
    negotiations: ((negs.data ?? []) as any[]).map(n => ({
      player: n.player_name, team: n.team_name, status: n.status, source: n.player_source,
      createdAt: n.created_at, updatedAt: n.updated_at, followup: n.next_followup_date,
    })),
    coaches,
  }
}
