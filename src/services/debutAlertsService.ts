import { supabase } from '@/lib/supabase'
import { addScoutPlayer, removeScoutPlayerFromList } from '@/services/scoutPlayersService'
import { currentSeasons } from '@/services/playerStatsService'

export interface DebutAlert {
  playerId: number
  /** Liga/competencia donde se resolvió el debut para AGRUPAR (Libertadores/
   * Sudamericana se resuelven acá a la liga doméstica del equipo). */
  displayLeagueId: number
  /** Competencia real donde ocurrió el debut (puede ser "Copa Libertadores"
   * aunque displayLeagueId agrupe por el país del equipo). */
  competitionName: string | null
  playerName: string
  photo: string | null
  position: string | null
  nationality: string | null
  marketValueEur: number | null
  contractEndDate: string | null
  agent: string | null
  teamName: string | null
  teamLogo: string | null
  ageAtDebut: number
  minutes: number
  debutDate: string
  /** Minutos/partidos jugados DESPUÉS del partido de debut (para saber si
   * el jugador siguió sumando rodaje o fue flor de un día). */
  minutesSince: number
  matchesSince: number
  /** Mejor `avg_rating` de player_season_scores en las temporadas vigentes,
   * null si todavía no tiene datos suficientes para tener un rating. */
  rating: number | null
}

interface DebutAlertRow {
  player_id: number
  display_league_id: number
  age_at_debut: number
  minutes: number
  debut_date: string
  player: {
    name: string
    photo: string | null
    primary_position: string | null
    nationality: string | null
    market_value_eur: number | null
    contract_end_date: string | null
    agent: string | null
  } | null
  team: { name: string; logo: string | null } | null
  league: { name: string } | null
}

// Los debuts son permanentes (nunca se borran), así que la tabla crece para
// siempre. Se muestran sólo los de los últimos DAYS_WINDOW días -- es un feed
// de alertas recientes, no un archivo histórico completo. El límite es sólo
// una red de seguridad (bien por debajo del corte silencioso de 1000 filas de
// PostgREST, ver `_shared/fetchAll.ts`) para el caso de que la ventana de
// fecha por sí sola no alcance a acotarlo.
const DAYS_WINDOW = 40
const SAFETY_LIMIT = 300

async function fetchActivitySince(
  playerIds: number[]
): Promise<Map<number, { minutesSince: number; matchesSince: number }>> {
  if (playerIds.length === 0) return new Map()

  const { data, error } = await supabase.rpc('debut_activity_since', {
    target_player_ids: playerIds,
  })
  if (error) throw error

  return new Map(
    (data || []).map((r: { player_id: number; minutes_since: number; matches_since: number }) => [
      r.player_id,
      { minutesSince: r.minutes_since, matchesSince: r.matches_since },
    ])
  )
}

// El rating no está atado a una posición específica del debutante -- se
// muestra el mejor avg_rating que tenga en las temporadas vigentes, sea cual
// sea la posición en la que lo consiguió.
async function fetchRatings(playerIds: number[]): Promise<Map<number, number>> {
  if (playerIds.length === 0) return new Map()

  const { data, error } = await supabase
    .from('player_season_scores')
    .select('player_id, avg_rating')
    .in('player_id', playerIds)
    .in('season', currentSeasons())
    .not('avg_rating', 'is', null)

  if (error) throw error

  const best = new Map<number, number>()
  for (const row of (data || []) as { player_id: number; avg_rating: number }[]) {
    const prev = best.get(row.player_id)
    if (prev === undefined || row.avg_rating > prev) best.set(row.player_id, row.avg_rating)
  }
  return best
}

export async function fetchDebutAlerts(): Promise<DebutAlert[]> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - DAYS_WINDOW)
  const cutoffDate = cutoff.toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('debut_alerts')
    .select(`
      player_id, display_league_id, age_at_debut, minutes, debut_date,
      player:players(name, photo, primary_position, nationality, market_value_eur, contract_end_date, agent),
      team:teams(name, logo),
      league:leagues!debut_alerts_league_id_fkey(name)
    `)
    .gte('debut_date', cutoffDate)
    .order('debut_date', { ascending: false })
    .limit(SAFETY_LIMIT)

  if (error) throw error

  const rows = (data as unknown as DebutAlertRow[]) || []
  const playerIds = rows.map(r => r.player_id)

  const [activity, ratings] = await Promise.all([
    fetchActivitySince(playerIds),
    fetchRatings(playerIds),
  ])

  return rows.map(row => ({
    playerId: row.player_id,
    displayLeagueId: row.display_league_id,
    competitionName: row.league?.name ?? null,
    playerName: row.player?.name ?? 'Desconocido',
    photo: row.player?.photo ?? null,
    position: row.player?.primary_position ?? null,
    nationality: row.player?.nationality ?? null,
    marketValueEur: row.player?.market_value_eur ?? null,
    contractEndDate: row.player?.contract_end_date ?? null,
    agent: row.player?.agent ?? null,
    // Club en el momento del debut (via debut_alerts.team_id) -- no el club
    // actual del jugador, que puede haber cambiado desde entonces.
    teamName: row.team?.name ?? null,
    teamLogo: row.team?.logo ?? null,
    ageAtDebut: row.age_at_debut,
    minutes: row.minutes,
    debutDate: row.debut_date,
    minutesSince: activity.get(row.player_id)?.minutesSince ?? 0,
    matchesSince: activity.get(row.player_id)?.matchesSince ?? 0,
    rating: ratings.get(row.player_id) ?? null,
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
      nacionalidad: alert.nationality ?? undefined,
      agente: alert.agent ?? undefined,
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
