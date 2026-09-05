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

interface DebutAlertRow {
  player_id: number
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
      player_id, age_at_debut, minutes, debut_date,
      player:players(name, photo, primary_position),
      team:teams(name, logo),
      league:leagues(name)
    `)
    .order('debut_date', { ascending: false })
    .limit(RECENT_LIMIT)

  if (error) throw error

  return ((data as unknown as DebutAlertRow[]) || []).map(row => ({
    playerId: row.player_id,
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
