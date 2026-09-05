import { supabase } from '@/lib/supabase'
import { addScoutPlayer, removeScoutPlayerFromList } from '@/services/scoutPlayersService'

export interface DebutAlert {
  playerId: number
  leagueId: number
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

interface DebutAlertRow {
  player_id: number
  league_id: number
  age_at_debut: number
  minutes: number
  debut_date: string
  player: { name: string; photo: string | null; primary_position: string | null } | null
  team: { name: string; logo: string | null } | null
  league: { name: string } | null
}

// Los debuts son permanentes (nunca se borran), así que la tabla crece para
// siempre. Esta pantalla es un feed de "lo más reciente", no un archivo
// histórico completo -- se trae un límite fijo, bien por debajo del límite de
// 1000 filas por página que impone PostgREST (ver `_shared/fetchAll.ts`), y
// se resuelven jugador/equipo/liga con un solo query (embeds) en vez de una
// ronda de queries por tabla.
const RECENT_LIMIT = 100

export async function fetchDebutAlerts(): Promise<DebutAlert[]> {
  const { data, error } = await supabase
    .from('debut_alerts')
    .select(`
      player_id, league_id, age_at_debut, minutes, debut_date,
      player:players(name, photo, primary_position),
      team:teams(name, logo),
      league:leagues(name)
    `)
    .order('debut_date', { ascending: false })
    .limit(RECENT_LIMIT)

  if (error) throw error

  return ((data as unknown as DebutAlertRow[]) || []).map(row => ({
    playerId: row.player_id,
    leagueId: row.league_id,
    playerName: row.player?.name ?? 'Desconocido',
    photo: row.player?.photo ?? null,
    position: row.player?.primary_position ?? null,
    // Club en el momento del debut (via debut_alerts.team_id) -- no el club
    // actual del jugador, que puede haber cambiado desde entonces.
    teamName: row.team?.name ?? null,
    teamLogo: row.team?.logo ?? null,
    leagueName: row.league?.name ?? null,
    ageAtDebut: row.age_at_debut,
    minutes: row.minutes,
    debutDate: row.debut_date,
  }))
}

// Estado de "Seguimiento" (scout_players.in_scouts_gg_list) para un lote de
// debutantes, matcheado por supabase_player_id (= players.id de API-Football,
// el mismo id que usa debut_alerts.player_id). RLS de scout_players ya scopea
// por club (current_club_id()) -- esta consulta automáticamente devuelve
// sólo lo que corresponde a la plataforma que la corre, sin código extra acá.
export async function fetchSeguimientoStatus(playerIds: number[]): Promise<Map<number, string>> {
  if (playerIds.length === 0) return new Map()

  const { data, error } = await supabase
    .from('scout_players')
    .select('id, supabase_player_id')
    .in('supabase_player_id', playerIds)
    .eq('in_scouts_gg_list', true)

  if (error) throw error

  return new Map(
    (data || [])
      .filter((r): r is { id: string; supabase_player_id: number } => r.supabase_player_id !== null)
      .map(r => [r.supabase_player_id, r.id])
  )
}

export async function addDebutAlertToSeguimiento(
  alert: DebutAlert,
  userId: string,
  userName: string
): Promise<string | null> {
  const created = await addScoutPlayer(
    {
      full_name: alert.playerName,
      supabase_player_id: alert.playerId,
      club: alert.teamName ?? undefined,
      posicion: alert.position ?? undefined,
    },
    'scouts_gg',
    userId,
    userName
  )
  return created?.id ?? null
}

export async function removeDebutAlertFromSeguimiento(scoutPlayerId: string): Promise<boolean> {
  return removeScoutPlayerFromList(scoutPlayerId, 'scouts_gg')
}
