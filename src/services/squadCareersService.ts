import { supabase } from '@/lib/supabase'

export interface TransferEntry { date: string; fromName: string; toName: string; type: string }
export interface SquadCareer {
  tmPlayerId: number; apiPlayerId: number | null; apiPlayerAliasIds: number[]
  fullName: string; shortName: string | null
  squad: 'primera' | 'reserva' | 'baja'; position: string | null; birthDate: string | null; nationality: string | null
  heightCm: number | null; foot: string | null; photoUrl: string | null; marketValueEur: number | null
  contractUntil: string | null; youthClubs: string[]; agent: string | null
  proDebutDate: string | null; proDebutClub: string | null; proDebutCompetition: string | null
  proDebutOpponent: string | null; proDebutCoach: string | null
  transferHistory: TransferEntry[]; homegrown: boolean; homegrownReason: string | null
}

interface SquadCareerRow {
  tm_player_id: number; api_player_id: number | null; api_player_alias_ids: number[] | null
  full_name: string; short_name: string | null
  squad: 'primera' | 'reserva' | 'baja'; position: string | null; birth_date: string | null; nationality: string | null
  height_cm: number | null; foot: string | null; photo_url: string | null; market_value_eur: number | null
  contract_until: string | null; youth_clubs: string[] | null; agent: string | null
  pro_debut_date: string | null; pro_debut_club: string | null; pro_debut_competition: string | null
  pro_debut_opponent: string | null; pro_debut_coach: string | null
  transfer_history: { date: string; from_name: string; to_name: string; type: string }[] | null
  homegrown_auto: boolean; homegrown_reason: string | null; homegrown_override: boolean | null
}

function mapRow(r: SquadCareerRow): SquadCareer {
  return {
    tmPlayerId: r.tm_player_id, apiPlayerId: r.api_player_id, apiPlayerAliasIds: r.api_player_alias_ids ?? [],
    fullName: r.full_name, shortName: r.short_name,
    squad: r.squad, position: r.position, birthDate: r.birth_date, nationality: r.nationality,
    heightCm: r.height_cm, foot: r.foot, photoUrl: r.photo_url, marketValueEur: r.market_value_eur,
    contractUntil: r.contract_until, youthClubs: r.youth_clubs ?? [], agent: r.agent ?? null,
    proDebutDate: r.pro_debut_date, proDebutClub: r.pro_debut_club, proDebutCompetition: r.pro_debut_competition,
    proDebutOpponent: r.pro_debut_opponent, proDebutCoach: r.pro_debut_coach,
    transferHistory: (r.transfer_history ?? []).map(t => ({ date: t.date, fromName: t.from_name, toName: t.to_name, type: t.type })),
    homegrown: r.homegrown_override ?? r.homegrown_auto,
    homegrownReason: r.homegrown_reason,
  }
}

/** `null` = falla de Supabase; `[]` = el equipo todavía no tiene plantel enriquecido. */
export async function listSquadCareers(teamApiId: number): Promise<SquadCareer[] | null> {
  const { data, error } = await supabase.from('club_squad_careers').select('*').eq('team_api_id', teamApiId)
  if (error) return null
  return ((data ?? []) as SquadCareerRow[]).map(mapRow)
}
