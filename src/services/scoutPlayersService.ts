import { supabase } from '@/lib/supabase'
import type { ScoutPlayer, ScoutPlayerStatusRecord, ScoutPlayerFile } from '@/types'
import { nameKey, playerNamesMatch } from '@/utils/nameUtils'
import { currentSeasons } from '@/services/playerStatsService'
import { computeAge } from '@/utils/marketAlerts'

export interface NewScoutPlayer {
  full_name: string
  // Link to Wyscout DB player — populated from reports when player was found in DB
  player_db_id?: string           // Value of "Jugador" field in the DB (e.g. "L. Messi")
  player_db_source?: 'interno' | 'externo'
  supabase_player_id?: number
  club?: string
  liga?: string
  edad?: number
  fecha_nacimiento?: string
  posicion?: string
  rol?: string
  nacionalidad?: string
  altura?: number
  pie?: 'derecho' | 'izquierdo' | 'ambos'
  transfermarkt_url?: string
  agente?: string
  comentario?: string
  prioridad?: 'alta' | 'normal' | 'baja'
  fuente_deteccion?: string
  video_url?: string
}

/**
 * Find an existing scout_players record that matches this player.
 * Priority:
 *  1. Exact match by player_db_id (Wyscout ID) — most reliable
 *  2. Exact case-insensitive full_name match
 *  3. Name-key match (initial + surname) — handles "L. Messi" vs "Lionel Messi"
 */
async function findExistingScoutPlayer(
  player: NewScoutPlayer
): Promise<{ id: string; in_datos_list: boolean; in_scouts_gg_list: boolean; player_db_id: string | null; supabase_player_id: number | null } | null> {
  // Strategy 0: match by supabase_player_id — most precise
  if (player.supabase_player_id) {
    const { data } = await supabase
      .from('scout_players')
      .select('id, in_datos_list, in_scouts_gg_list, player_db_id, supabase_player_id')
      .eq('supabase_player_id', player.supabase_player_id)
      .maybeSingle()
    if (data) return data
  }

  // Strategy 1: match by player_db_id if provided
  if (player.player_db_id) {
    const { data } = await supabase
      .from('scout_players')
      .select('id, in_datos_list, in_scouts_gg_list, player_db_id, supabase_player_id')
      .eq('player_db_id', player.player_db_id)
      .maybeSingle()
    if (data) return data
  }

  // Strategy 2: exact name match (case-insensitive)
  const { data: exactMatch } = await supabase
    .from('scout_players')
    .select('id, in_datos_list, in_scouts_gg_list, player_db_id, supabase_player_id')
    .ilike('full_name', player.full_name.trim())
    .maybeSingle()
  if (exactMatch) return exactMatch

  // Strategy 3: name-key match (initial:surname) — handles Wyscout vs full-name format
  // Fetch recent players and compare in-memory (small dataset)
  const key = nameKey(player.full_name)
  const { data: candidates } = await supabase
    .from('scout_players')
    .select('id, in_datos_list, in_scouts_gg_list, player_db_id, supabase_player_id, full_name')
    .order('created_at', { ascending: false })
    .limit(500)

  if (candidates) {
    const match = candidates.find(c => playerNamesMatch(c.full_name, player.full_name))
    if (match) return match
  }

  return null
}

// Add a player to one or both tracking lists.
// Smart dedup: handles "L. Messi" (Wyscout) vs "Lionel Messi" (manual entry).
// If player exists: updates the list membership and links player_db_id if not yet set.
export async function addScoutPlayer(
  player: NewScoutPlayer,
  list: 'datos' | 'scouts_gg' | 'both',
  userId: string,
  userName: string
): Promise<ScoutPlayer | null> {
  const inDatos = list === 'datos' || list === 'both'
  const inScoutsGG = list === 'scouts_gg' || list === 'both'

  const existing = await findExistingScoutPlayer(player)

  if (existing) {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (inDatos && !existing.in_datos_list) {
      updates.in_datos_list = true
      updates.added_by_datos = userId
      updates.added_by_datos_name = userName
    }
    if (inScoutsGG && !existing.in_scouts_gg_list) {
      updates.in_scouts_gg_list = true
      updates.added_by_scouts = userId
      updates.added_by_scouts_name = userName
    }
    // Backfill player_db_id if we now have it and it wasn't set before
    if (player.player_db_id && !existing.player_db_id) {
      updates.player_db_id = player.player_db_id
      updates.player_db_source = player.player_db_source || null
    }
    if (player.supabase_player_id && !existing.supabase_player_id) {
      updates.supabase_player_id = player.supabase_player_id
    }

    const { data, error } = await supabase
      .from('scout_players')
      .update(updates)
      .eq('id', existing.id)
      .select()
      .single()

    if (error) { console.error('[ScoutPlayers] Error updating scout player:', error.message, error); return null }
    return data
  }

  // New player
  const { data, error } = await supabase
    .from('scout_players')
    .insert({
      ...player,
      full_name: player.full_name.trim(),
      player_db_id: player.player_db_id || null,
      player_db_source: player.player_db_source || null,
      supabase_player_id: player.supabase_player_id || null,
      in_datos_list: inDatos,
      in_scouts_gg_list: inScoutsGG,
      added_by_datos: inDatos ? userId : null,
      added_by_datos_name: inDatos ? userName : null,
      added_by_scouts: inScoutsGG ? userId : null,
      added_by_scouts_name: inScoutsGG ? userName : null,
      files: [],
    })
    .select()
    .single()

  if (error) { console.error('[ScoutPlayers] Error inserting scout player:', error.message, error); return null }
  return data
}

// Fetch all players for a specific list
export async function fetchScoutPlayers(list: 'datos' | 'scouts_gg'): Promise<ScoutPlayer[]> {
  const column = list === 'datos' ? 'in_datos_list' : 'in_scouts_gg_list'

  const { data, error } = await supabase
    .from('scout_players')
    .select('*')
    .eq(column, true)
    .order('created_at', { ascending: false })

  if (error) { console.error('Error fetching scout players:', error); return [] }
  return (data || []).map(p => ({ ...p, files: p.files || [] }))
}

export interface ScoutPlayerWithScore extends ScoutPlayer {
  gg_score: number | null
  gg_percentile: number | null
  gg_position: string | null
  gg_matches: number | null
  player_photo: string | null
  team_name: string | null
  team_logo: string | null
  /** Edad calculada desde `birth_date` de la base (API-Football/Sofascore),
   * cuando el jugador está vinculado por `supabase_player_id`. Null si no
   * está vinculado por ahí o no tiene fecha de nacimiento cargada. Ver
   * [[seguimiento_gg_edad_escudo_bug]]. */
  player_age: number | null
  /** Nombre/escudo reales del club vinculado directo por `club_team_id` —
   * independiente de si el JUGADOR está vinculado o no (útil para ascenso,
   * reserva, etc., que no están en la API pero cuyo club sí puede estarlo). */
  club_team_name: string | null
  club_team_logo: string | null
}

export async function fetchScoutPlayersWithScores(
  list: 'datos' | 'scouts_gg'
): Promise<ScoutPlayerWithScore[]> {
  const column = list === 'datos' ? 'in_datos_list' : 'in_scouts_gg_list'

  const { data, error } = await supabase
    .from('scout_players')
    .select('*')
    .eq(column, true)
    .order('created_at', { ascending: false })

  if (error) { console.error('Error fetching scout players:', error); return [] }
  const players: ScoutPlayer[] = (data || []).map(p => ({ ...p, files: p.files || [] }))

  const supabaseIds = players
    .map(p => p.supabase_player_id)
    .filter((id): id is number => id !== null)

  let scoreMap = new Map<number, { score: number; percentile: number | null; position: string; matches: number }>()
  let playerInfoMap = new Map<number, { photo: string | null; team_name: string | null; team_logo: string | null; age: number | null }>()

  if (supabaseIds.length > 0) {
    // Posición declarada de cada jugador -- se usa para preferir la fila de
    // temporada que coincide con su posición real (ver comparación de abajo).
    const primaryPositionMap = new Map<number, string | null>()
    {
      const { data: posData } = await supabase
        .from('players')
        .select('id, primary_position')
        .in('id', supabaseIds)
      for (const p of posData || []) primaryPositionMap.set(p.id, p.primary_position ?? null)
    }

    // Sin filtrar por temporada, un jugador con muchos partidos en una temporada
    // vieja y completa le ganaba a su temporada vigente parcial — mismo patrón que
    // el bug de currentSeasons() ya arreglado en playerStatsService.ts.
    const { data: scores } = await supabase
      .from('player_season_scores')
      .select('player_id, avg_rating, percentile, position, matches_played, season')
      .in('player_id', supabaseIds)
      .in('season', currentSeasons())
      .not('avg_rating', 'is', null)
      // Temporada mas nueva primero, y recien ahi por partidos jugados -- mismo
      // criterio que buildScoreLookup en playerStatsService.ts. Sin el orden por
      // temporada, un jugador con mas partidos en el año viejo le ganaba a su
      // temporada vigente (aunque tenga menos partidos todavia), mostrando un
      // score desactualizado en Seguimiento GG.
      .order('season', { ascending: false })
      .order('matches_played', { ascending: false })

    if (scores) {
      for (const s of scores) {
        const existing = scoreMap.get(s.player_id)
        if (!existing) {
          scoreMap.set(s.player_id, {
            score: s.avg_rating,
            percentile: s.percentile,
            position: s.position,
            matches: s.matches_played,
          })
          continue
        }
        // El primer encuentro por jugador ya es el mejor por temporada/partidos
        // (orden de la query). Sólo lo reemplaza una fila posterior si coincide con
        // su posición real y la que tenía elegida hasta ahora no -- evita que una
        // temporada nueva con pocos partidos en una posición ocasional tape la
        // posición de siempre del jugador (caso real: José Paradela, EXT 2026 con 3
        // partidos tapaba su VI 2025 con 34 -- ver mismo fix en playerStatsService.ts).
        const primaryPos = primaryPositionMap.get(s.player_id) ?? null
        const rowIsPrimary = primaryPos != null && s.position === primaryPos
        const existingIsPrimary = primaryPos != null && existing.position === primaryPos
        if (rowIsPrimary && !existingIsPrimary) {
          scoreMap.set(s.player_id, {
            score: s.avg_rating,
            percentile: s.percentile,
            position: s.position,
            matches: s.matches_played,
          })
        }
      }
    }

    const { data: playerInfos } = await supabase
      .from('players')
      .select('id, photo, birth_date, team:teams(name, logo)')
      .in('id', supabaseIds)

    if (playerInfos) {
      for (const p of playerInfos) {
        const team = p.team as any
        playerInfoMap.set(p.id, {
          photo: p.photo,
          team_name: team?.name ?? null,
          team_logo: team?.logo ?? null,
          age: computeAge(p.birth_date ?? null),
        })
      }
    }
  }

  // Club vinculado directo (`club_team_id`) — aparte del jugador, porque
  // varios jugadores en seguimiento (ascenso, reserva) nunca van a poder
  // vincularse como jugador pero su club sí puede estar en `teams`.
  const clubTeamIds = players
    .map(p => p.club_team_id)
    .filter((id): id is number => id !== null)

  const clubTeamMap = new Map<number, { name: string; logo: string | null }>()
  if (clubTeamIds.length > 0) {
    const { data: teamsData } = await supabase
      .from('teams')
      .select('id, name, logo')
      .in('id', clubTeamIds)
    if (teamsData) {
      for (const t of teamsData) clubTeamMap.set(t.id, { name: t.name, logo: t.logo })
    }
  }

  return players.map(p => {
    const s = p.supabase_player_id ? scoreMap.get(p.supabase_player_id) : undefined
    const info = p.supabase_player_id ? playerInfoMap.get(p.supabase_player_id) : undefined
    const clubTeam = p.club_team_id ? clubTeamMap.get(p.club_team_id) : undefined
    return {
      ...p,
      gg_score: s?.score ?? null,
      gg_percentile: s?.percentile ?? null,
      gg_position: s?.position ?? null,
      gg_matches: s?.matches ?? null,
      player_photo: info?.photo ?? null,
      team_name: info?.team_name ?? p.club,
      team_logo: info?.team_logo ?? null,
      player_age: info?.age ?? null,
      club_team_name: clubTeam?.name ?? null,
      club_team_logo: clubTeam?.logo ?? null,
    }
  })
}

// Fetch scout evaluation scores for all tracked players.
// Matches by player_db_id (linked) OR player_name (for unlinked players).
// Returns map: player_id (scout_players.id) → { avgScore, count }
export async function fetchScoutScores(
  players: ScoutPlayer[]
): Promise<Record<string, { avgScore: number; count: number }>> {
  if (players.length === 0) return {}

  // Collect all known player_db_ids and full_names for the query
  const dbIds = players.filter(p => p.player_db_id).map(p => p.player_db_id as string)
  const names = players.map(p => p.full_name)

  // Fetch evaluations matching by player_id (Wyscout linked) or player_name
  const { data, error } = await supabase
    .from('scout_evaluations')
    .select('player_id, player_name, technical_score, overall_score')
    .not('technical_score', 'is', null)

  if (error || !data) return {}

  const result: Record<string, { scores: number[]; count: number }> = {}

  for (const evaluation of data) {
    const score = evaluation.technical_score ?? evaluation.overall_score
    if (score === null || score === undefined) continue

    // Find which scout_player this evaluation belongs to
    const matchedPlayer = players.find(p => {
      // Match by linked DB id
      if (p.player_db_id && evaluation.player_id === p.player_db_id) return true
      // Match by name (handles both "L. Messi" and "Lionel Messi")
      if (evaluation.player_name && playerNamesMatch(evaluation.player_name, p.full_name)) return true
      // Match by player_id against full_name (for unlinked players)
      if (evaluation.player_id && playerNamesMatch(evaluation.player_id, p.full_name)) return true
      return false
    })

    if (matchedPlayer) {
      if (!result[matchedPlayer.id]) result[matchedPlayer.id] = { scores: [], count: 0 }
      result[matchedPlayer.id].scores.push(score)
      result[matchedPlayer.id].count++
    }
  }

  const avgResult: Record<string, { avgScore: number; count: number }> = {}
  for (const [id, d] of Object.entries(result)) {
    avgResult[id] = {
      avgScore: Math.round((d.scores.reduce((a, b) => a + b, 0) / d.scores.length) * 10) / 10,
      count: d.count,
    }
  }
  return avgResult
}

// Link (or unlink) a scout player to a DB player.
// supabasePlayerId links to the live Supabase `players.id` (API-Football/Sofascore) —
// when set, fetchScoutPlayersWithScores resolves the real Rating/photo/team from it
// instead of leaving those columns empty.
export async function linkScoutPlayerToDb(
  id: string,
  playerDbId: string | null,
  playerDbSource: 'interno' | 'externo' | null,
  supabasePlayerId?: number | null
): Promise<boolean> {
  const { error } = await supabase
    .from('scout_players')
    .update({
      player_db_id: playerDbId,
      player_db_source: playerDbSource,
      supabase_player_id: supabasePlayerId ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) { console.error('Error linking scout player:', error); return false }
  return true
}

// Vincula el CLUB directo del jugador en seguimiento a un `teams.id` real —
// aparte del vínculo de jugador (ver comentario en `ScoutPlayerWithScore`).
// `teamId: null` desvincula.
export async function linkScoutPlayerClub(id: string, teamId: number | null): Promise<boolean> {
  const { error } = await supabase
    .from('scout_players')
    .update({ club_team_id: teamId, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) { console.error('Error linking scout player club:', error); return false }
  return true
}

// Update a scout player's profile
export async function updateScoutPlayer(
  id: string,
  updates: Partial<NewScoutPlayer>
): Promise<boolean> {
  const { error } = await supabase
    .from('scout_players')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) { console.error('Error updating scout player:', error); return false }
  return true
}

// Remove a player from a specific list (deletes if not in the other list)
export async function removeScoutPlayerFromList(
  id: string,
  list: 'datos' | 'scouts_gg'
): Promise<boolean> {
  const { data } = await supabase
    .from('scout_players')
    .select('in_datos_list, in_scouts_gg_list')
    .eq('id', id)
    .single()

  if (!data) return false

  const isInOtherList = list === 'datos' ? data.in_scouts_gg_list : data.in_datos_list

  if (!isInOtherList) {
    const { error } = await supabase.from('scout_players').delete().eq('id', id)
    if (error) { console.error('Error deleting scout player:', error); return false }
    return true
  }

  const column = list === 'datos' ? 'in_datos_list' : 'in_scouts_gg_list'
  const { error } = await supabase
    .from('scout_players')
    .update({ [column]: false, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) { console.error('Error removing from list:', error); return false }
  return true
}

// Asigna (o desasigna, con userId/userName null) un jugador de Seguimiento GG a un
// scout puntual de la agencia -- distinto de "quién lo agregó" (added_by_scouts),
// para que dos personas no terminen negociando con el mismo jugador sin saberlo.
export async function setScoutPlayerAssignment(
  playerId: string,
  userId: string | null,
  userName: string | null
): Promise<boolean> {
  const { error } = await supabase
    .from('scout_players')
    .update({ assigned_to: userId, assigned_to_name: userName, updated_at: new Date().toISOString() })
    .eq('id', playerId)

  if (error) { console.error('Error setting scout player assignment:', error); return false }
  return true
}

// Set status for a player in a specific list
export async function setScoutPlayerStatus(
  playerId: string,
  listType: 'datos' | 'scouts_gg',
  status: string,
  userId: string,
  userName: string,
  notes?: string
): Promise<ScoutPlayerStatusRecord | null> {
  const { data, error } = await supabase
    .from('scout_players_status')
    .insert({
      player_id: playerId,
      list_type: listType,
      status,
      changed_by: userId,
      changed_by_name: userName,
      notes: notes || null,
    })
    .select()
    .single()

  if (error) { console.error('Error setting scout player status:', error); return null }
  return data
}

// Fetch latest status per player for a given list
export async function fetchScoutPlayerStatuses(
  listType: 'datos' | 'scouts_gg'
): Promise<Record<string, ScoutPlayerStatusRecord>> {
  const { data, error } = await supabase
    .from('scout_players_status')
    .select('*')
    .eq('list_type', listType)
    .order('changed_at', { ascending: false })

  if (error) { console.error('Error fetching scout player statuses:', error); return {} }

  const statusMap: Record<string, ScoutPlayerStatusRecord> = {}
  for (const record of data || []) {
    if (!statusMap[record.player_id]) statusMap[record.player_id] = record
  }
  return statusMap
}

// Upload a file for a player (requires Supabase Storage bucket 'scout-player-files')
export async function uploadScoutPlayerFile(
  playerId: string,
  file: File,
  userName: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  const fileName = `${playerId}/${Date.now()}-${file.name}`

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('scout-player-files')
    .upload(fileName, file, { upsert: false })

  if (uploadError) { console.error('Error uploading file:', uploadError); return { success: false, error: uploadError.message } }

  const { data: { publicUrl } } = supabase.storage
    .from('scout-player-files')
    .getPublicUrl(uploadData.path)

  const { data: player } = await supabase
    .from('scout_players')
    .select('files')
    .eq('id', playerId)
    .single()

  const currentFiles: ScoutPlayerFile[] = (player?.files as ScoutPlayerFile[]) || []
  const newFile: ScoutPlayerFile = {
    name: file.name,
    url: publicUrl,
    size: file.size,
    uploaded_at: new Date().toISOString(),
    uploaded_by_name: userName,
  }

  await supabase
    .from('scout_players')
    .update({ files: [...currentFiles, newFile] })
    .eq('id', playerId)

  return { success: true, url: publicUrl }
}

// Fetch a single scout_players record by player name or DB id (for profile pages)
export async function fetchScoutPlayerRecord(
  playerName: string,
  playerDbId?: string | null,
  supabasePlayerId?: number | null
): Promise<ScoutPlayer | null> {
  if (supabasePlayerId) {
    const { data } = await supabase
      .from('scout_players')
      .select('*')
      .eq('supabase_player_id', supabasePlayerId)
      .maybeSingle()
    if (data) return { ...data, files: data.files || [] }
  }

  if (playerDbId) {
    const { data } = await supabase
      .from('scout_players')
      .select('*')
      .eq('player_db_id', playerDbId)
      .maybeSingle()
    if (data) return { ...data, files: data.files || [] }
  }

  const { data } = await supabase
    .from('scout_players')
    .select('*')
    .ilike('full_name', playerName.trim())
    .maybeSingle()

  return data ? { ...data, files: data.files || [] } : null
}

// Fetch all tracked player names for list indicators (lightweight)
export async function fetchScoutsGGPlayers(): Promise<Array<{
  full_name: string
  player_db_id: string | null
}>> {
  const { data } = await supabase
    .from('scout_players')
    .select('full_name, player_db_id')
    .eq('in_scouts_gg_list', true)
  return data || []
}

export async function fetchTrackedPlayerNames(): Promise<Array<{
  full_name: string
  in_datos_list: boolean
  in_scouts_gg_list: boolean
  added_by_datos_name: string | null
  added_by_scouts_name: string | null
}>> {
  const { data } = await supabase
    .from('scout_players')
    .select('full_name, in_datos_list, in_scouts_gg_list, added_by_datos_name, added_by_scouts_name')
    .or('in_datos_list.eq.true,in_scouts_gg_list.eq.true')
  return data || []
}

// Remove a file from a player
export async function removeScoutPlayerFile(
  playerId: string,
  fileName: string
): Promise<boolean> {
  const { data: player } = await supabase
    .from('scout_players')
    .select('files')
    .eq('id', playerId)
    .single()

  if (!player) return false

  const files = (player.files as ScoutPlayerFile[]) || []
  const updated = files.filter(f => f.name !== fileName)

  const { error } = await supabase
    .from('scout_players')
    .update({ files: updated })
    .eq('id', playerId)

  return !error
}
