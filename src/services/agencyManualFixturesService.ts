import { supabase } from '@/lib/supabase'
import { agencyKey } from '@/services/agencyPlayersService'
import type { AgencyFixture } from '@/types/footballApi'

export interface ManualFixtureRow {
  id: number
  player_key: string
  player_name: string
  match_date: string
  opponent: string
  is_home: boolean
  competition: string | null
  venue: string | null
}

export async function fetchManualFixtures(playerName?: string): Promise<ManualFixtureRow[]> {
  let q = supabase.from('agency_manual_fixtures').select('*').order('match_date')
  if (playerName) q = q.eq('player_key', agencyKey(playerName))
  const { data, error } = await q
  if (error) { console.error('fetchManualFixtures error:', error); return [] }
  return (data as ManualFixtureRow[]) ?? []
}

export async function addManualFixture(input: {
  playerName: string; matchDate: string; opponent: string; isHome: boolean;
  competition?: string; venue?: string;
}, userId?: string, userName?: string): Promise<boolean> {
  const { error } = await supabase.from('agency_manual_fixtures').insert({
    player_key: agencyKey(input.playerName),
    player_name: input.playerName,
    match_date: input.matchDate,
    opponent: input.opponent,
    is_home: input.isHome,
    competition: input.competition ?? null,
    venue: input.venue ?? null,
    added_by: userId ?? null,
    added_by_name: userName ?? null,
  })
  if (error) { console.error('addManualFixture error:', error); return false }
  return true
}

export async function deleteManualFixture(id: number): Promise<boolean> {
  const { error } = await supabase.from('agency_manual_fixtures').delete().eq('id', id)
  if (error) { console.error('deleteManualFixture error:', error); return false }
  return true
}

/** Convierte filas manuales al shape AgencyFixture para fusionar en el calendario. */
export function manualToAgencyFixtures(rows: ManualFixtureRow[], playerImage?: string | null): AgencyFixture[] {
  return rows.map(r => ({
    fixtureId: -r.id, // negativo para no chocar con ids de API
    date: new Date(r.match_date + 'T00:00:00').toISOString(),
    timestamp: Math.floor(new Date(r.match_date + 'T00:00:00').getTime() / 1000),
    venue: r.venue ?? '',
    city: '',
    status: 'Not Started',
    statusShort: 'NS',
    elapsed: null,
    leagueName: r.competition ?? 'Partido manual',
    leagueLogo: '',
    leagueCountry: '',
    leagueFlag: null,
    round: '',
    homeTeam: { id: 0, name: r.is_home ? r.player_name : r.opponent, logo: '' },
    awayTeam: { id: 0, name: r.is_home ? r.opponent : r.player_name, logo: '' },
    goalsHome: null,
    goalsAway: null,
    isHome: r.is_home,
    players: [{ shortName: r.player_name, fullName: r.player_name, image: playerImage ?? null }],
    source: 'manual' as const,
  }))
}
