import { supabase } from '@/lib/supabase'

export interface DebutAlert {
  playerId: number
  playerName: string
  photo: string | null
  position: string | null
  teamName: string | null
  teamLogo: string | null
  leagueName: string | null
  ageAtDebut: number
  minutes: number
  debutDate: string
}

export async function fetchDebutAlerts(): Promise<DebutAlert[]> {
  const { data: alerts, error } = await supabase
    .from('debut_alerts')
    .select('player_id, league_id, age_at_debut, minutes, debut_date')
    .order('debut_date', { ascending: false })

  if (error || !alerts || alerts.length === 0) return []

  const playerIds = alerts.map(a => a.player_id)
  const leagueIds = [...new Set(alerts.map(a => a.league_id))]

  const { data: players } = await supabase
    .from('players')
    .select('id, name, photo, primary_position, current_team_id')
    .in('id', playerIds)

  const teamIds = [...new Set((players || []).map(p => p.current_team_id).filter((id): id is number => id !== null))]

  const { data: teams } = teamIds.length > 0
    ? await supabase.from('teams').select('id, name, logo').in('id', teamIds)
    : { data: [] as { id: number; name: string; logo: string | null }[] }

  const { data: leagues } = await supabase
    .from('leagues')
    .select('id, name')
    .in('id', leagueIds)

  const playerMap = new Map((players || []).map(p => [p.id, p]))
  const teamMap = new Map((teams || []).map(t => [t.id, t]))
  const leagueMap = new Map((leagues || []).map(l => [l.id, l]))

  return alerts.map(a => {
    const player = playerMap.get(a.player_id)
    const team = player?.current_team_id != null ? teamMap.get(player.current_team_id) : undefined
    const league = leagueMap.get(a.league_id)
    return {
      playerId: a.player_id,
      playerName: player?.name ?? 'Desconocido',
      photo: player?.photo ?? null,
      position: player?.primary_position ?? null,
      teamName: team?.name ?? null,
      teamLogo: team?.logo ?? null,
      leagueName: league?.name ?? null,
      ageAtDebut: a.age_at_debut,
      minutes: a.minutes,
      debutDate: a.debut_date,
    }
  })
}
