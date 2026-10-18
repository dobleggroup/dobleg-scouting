import { useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { loadLeague, type OptaLeague } from '@/features/opta/data'
import { buildPercentiles, type PercentileIndex } from '@/features/opta/metrics'
import { matchAgencyPlayers, useAsync } from '@/features/opta/hooks'
import type { AgencyPlayer } from '@/constants/agencyPlayers'
import { matchTransfermarkt, valuate, type TmRow, type Valuation } from './value'

const COLS = 'id,name,birth_date,market_value_eur,contract_end_date,agent,canonical_id,photo,transfermarkt_url'
/** Liga Profesional en la tabla `leagues`. */
const LPF_LEAGUE_ID = 128

/**
 * Fichas de Transfermarkt que pueden ser de jugadores de la liga: las nacidas el
 * mismo día que alguno de Opta y las de los planteles de la Liga Profesional (por
 * si la fecha difiere por unos días).
 */
async function loadTmRows(dobs: string[]): Promise<TmRow[]> {
  const chunks: string[][] = []
  for (let i = 0; i < dobs.length; i += 100) chunks.push(dobs.slice(i, i + 100))
  const byDob = Promise.all(chunks.map(async c => {
    const { data, error } = await supabase.from('players').select(COLS).in('birth_date', c)
    if (error) throw new Error(error.message)
    return (data ?? []) as TmRow[]
  }))
  const squads = (async () => {
    const out: TmRow[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('players').select(`${COLS},teams!inner(league_id)`)
        .eq('teams.league_id', LPF_LEAGUE_ID).order('id').range(from, from + 999)
      if (error) throw new Error(error.message)
      out.push(...((data ?? []) as unknown as TmRow[]))
      if (!data || data.length < 1000) return out
    }
  })()
  const [a, b] = await Promise.all([byDob, squads])
  const seen = new Map<number, TmRow>()
  for (const r of [...a.flat(), ...b]) if (!seen.has(r.id)) seen.set(r.id, r)
  return [...seen.values()]
}

export interface ValueData {
  league: OptaLeague
  idx: PercentileIndex
  rows: Valuation[]
  byId: Map<string, Valuation>
  dg: Map<string, AgencyPlayer>
  /** Puesto de cada jugador por nota dentro de su grupo (solo los que tienen nota). */
  rank: Map<string, { rank: number; total: number }>
}

async function load(): Promise<Omit<ValueData, 'byId' | 'rank'>> {
  const league = await loadLeague()
  const idx = buildPercentiles(league.players)
  const dobs = [...new Set(league.players.map(p => p.dob).filter((d): d is string => Boolean(d)))].sort()
  const tm = matchTransfermarkt(league.players, await loadTmRows(dobs))
  return { league, idx, rows: valuate(league, idx, tm), dg: matchAgencyPlayers(league.players) }
}

let cached: ReturnType<typeof load> | null = null
const loadOnce = () => {
  if (!cached) { cached = load(); cached.catch(() => { cached = null }) }
  return cached
}

export function useValueData() {
  const state = useAsync(loadOnce, [])
  const data = useMemo<ValueData | null>(() => {
    if (!state.data) return null
    const { rows } = state.data
    const rank = new Map<string, { rank: number; total: number }>()
    const groups = new Map<string, Valuation[]>()
    for (const r of rows) if (r.score !== null) groups.set(r.p.group, [...(groups.get(r.p.group) ?? []), r])
    for (const list of groups.values()) {
      list.sort((a, b) => b.score! - a.score!)
      list.forEach((r, i) => rank.set(r.p.id, { rank: i + 1, total: list.length }))
    }
    return { ...state.data, byId: new Map(rows.map(r => [r.p.id, r])), rank }
  }, [state.data])
  return { data, loading: state.loading, error: state.error }
}
