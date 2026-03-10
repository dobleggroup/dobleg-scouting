import { supabase } from '@/lib/supabase'

// Types for formation with multiple players per position
export interface PositionPlayer {
  playerName: string
  playerId: string
  team: string
  ggScore: number | null
  addedBy: string      // user id
  addedByName: string  // user display name
  addedAt: string      // ISO date
}

export interface FormationData {
  id: string
  name: string
  formation_type: string
  positions: Record<string, PositionPlayer[]>  // position key -> array of players (max 3)
  created_by: string
  created_by_name: string
  created_at: string
  updated_at: string
  is_public: boolean
}

// Fetch all formations (public + own)
export async function fetchFormations(userId?: string): Promise<FormationData[]> {
  let query = supabase
    .from('formations')
    .select('*')
    .order('created_at', { ascending: false })

  if (userId) {
    query = query.or(`is_public.eq.true,created_by.eq.${userId}`)
  } else {
    query = query.eq('is_public', true)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching formations:', error)
    return []
  }

  return (data || []).map(f => ({
    ...f,
    positions: f.players || {},  // 'players' column stores positions data
  }))
}

// Save a new formation
export async function saveFormation(
  name: string,
  formationType: string,
  positions: Record<string, PositionPlayer[]>,
  userId: string,
  userName: string,
  isPublic: boolean = true
): Promise<FormationData | null> {
  const { data, error } = await supabase
    .from('formations')
    .insert({
      name,
      formation_type: formationType,
      players: positions,
      created_by: userId,
      created_by_name: userName,
      is_public: isPublic,
    })
    .select()
    .single()

  if (error) {
    console.error('Error saving formation:', error)
    return null
  }

  return {
    ...data,
    positions: data.players || {},
  }
}

// Update formation (add/remove player from position)
export async function updateFormationPositions(
  formationId: string,
  positions: Record<string, PositionPlayer[]>
): Promise<boolean> {
  const { error } = await supabase
    .from('formations')
    .update({
      players: positions,
      updated_at: new Date().toISOString(),
    })
    .eq('id', formationId)

  if (error) {
    console.error('Error updating formation:', error)
    return false
  }

  return true
}

// Delete formation
export async function deleteFormation(formationId: string): Promise<boolean> {
  const { error } = await supabase
    .from('formations')
    .delete()
    .eq('id', formationId)

  if (error) {
    console.error('Error deleting formation:', error)
    return false
  }

  return true
}

// Helper: Add player to a position (max 3)
export function addPlayerToPosition(
  positions: Record<string, PositionPlayer[]>,
  positionKey: string,
  player: PositionPlayer
): Record<string, PositionPlayer[]> {
  const current = positions[positionKey] || []

  // Check if player already exists in this position
  if (current.some(p => p.playerId === player.playerId)) {
    return positions
  }

  // Max 3 players per position
  if (current.length >= 3) {
    return positions
  }

  return {
    ...positions,
    [positionKey]: [...current, player],
  }
}

// Helper: Remove player from position
export function removePlayerFromPosition(
  positions: Record<string, PositionPlayer[]>,
  positionKey: string,
  playerId: string
): Record<string, PositionPlayer[]> {
  const current = positions[positionKey] || []
  return {
    ...positions,
    [positionKey]: current.filter(p => p.playerId !== playerId),
  }
}
