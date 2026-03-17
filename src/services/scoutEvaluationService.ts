import { supabase } from '@/lib/supabase'

export type PlayerSource = 'interno' | 'externo' | 'seguimiento'

export interface ScoutEvaluation {
  id: string
  player_id: string | null
  player_name: string
  team: string | null
  position: string | null
  role: string | null
  match_date: string
  competition: string | null
  rival: string | null

  technical_score: number | null  // Used as single match performance score
  tactical_score: number | null
  physical_score: number | null
  mental_score: number | null
  potential_score: number | null
  overall_score: number | null

  strengths: string | null
  weaknesses: string | null
  notes: string | null
  recommendation: 'fichar' | 'seguir_observando' | 'descartar' | null

  source: PlayerSource | null  // Where the player comes from
  auto_added_to_monitoring: boolean | null  // If auto-added to seguimiento

  scout_id: string
  scout_name: string
  created_at: string
}

export interface NewEvaluation {
  player_id?: string
  player_name: string
  team?: string
  position?: string
  role?: string
  match_date: string
  competition?: string
  rival?: string
  technical_score?: number  // Used as the single match performance score
  tactical_score?: number
  physical_score?: number
  mental_score?: number
  potential_score?: number
  strengths?: string
  weaknesses?: string
  notes?: string
  recommendation?: 'fichar' | 'seguir_observando' | 'descartar'
  source?: PlayerSource
  auto_added_to_monitoring?: boolean
}

// Create a new evaluation
export async function createEvaluation(
  evaluation: NewEvaluation,
  scoutId: string,
  scoutName: string
): Promise<ScoutEvaluation | null> {
  const { data, error } = await supabase
    .from('scout_evaluations')
    .insert({
      ...evaluation,
      scout_id: scoutId,
      scout_name: scoutName,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating evaluation:', error)
    return null
  }

  return data
}

// Fetch all evaluations for a player
export async function fetchPlayerEvaluations(playerId: string): Promise<ScoutEvaluation[]> {
  const { data, error } = await supabase
    .from('scout_evaluations')
    .select('*')
    .eq('player_id', playerId)
    .order('match_date', { ascending: false })

  if (error) {
    console.error('Error fetching evaluations:', error)
    return []
  }

  return data || []
}

// Fetch evaluations by player name (for players not in database yet)
export async function fetchEvaluationsByName(playerName: string): Promise<ScoutEvaluation[]> {
  const { data, error } = await supabase
    .from('scout_evaluations')
    .select('*')
    .ilike('player_name', `%${playerName}%`)
    .order('match_date', { ascending: false })

  if (error) {
    console.error('Error fetching evaluations:', error)
    return []
  }

  return data || []
}

// Fetch recent evaluations (for dashboard)
export async function fetchRecentEvaluations(limit = 10): Promise<ScoutEvaluation[]> {
  const { data, error } = await supabase
    .from('scout_evaluations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Error fetching recent evaluations:', error)
    return []
  }

  return data || []
}

// Fetch evaluations by scout
export async function fetchScoutEvaluations(scoutId: string): Promise<ScoutEvaluation[]> {
  const { data, error } = await supabase
    .from('scout_evaluations')
    .select('*')
    .eq('scout_id', scoutId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching scout evaluations:', error)
    return []
  }

  return data || []
}

// Get average scout score for a player
export async function getPlayerScoutScore(playerId: string): Promise<number | null> {
  const evaluations = await fetchPlayerEvaluations(playerId)

  if (evaluations.length === 0) return null

  const scores = evaluations
    .map(e => e.overall_score)
    .filter((s): s is number => s !== null)

  if (scores.length === 0) return null

  return scores.reduce((a, b) => a + b, 0) / scores.length
}

// Get all player scout scores (for batch processing)
export async function fetchAllScoutScores(): Promise<Record<string, { avgScore: number; count: number }>> {
  const { data, error } = await supabase
    .from('scout_evaluations')
    .select('player_id, overall_score')
    .not('player_id', 'is', null)

  if (error) {
    console.error('Error fetching scout scores:', error)
    return {}
  }

  const scoreMap: Record<string, { scores: number[]; count: number }> = {}

  for (const record of data || []) {
    if (!record.player_id || record.overall_score === null) continue

    if (!scoreMap[record.player_id]) {
      scoreMap[record.player_id] = { scores: [], count: 0 }
    }
    scoreMap[record.player_id].scores.push(record.overall_score)
    scoreMap[record.player_id].count++
  }

  const result: Record<string, { avgScore: number; count: number }> = {}
  for (const [playerId, data] of Object.entries(scoreMap)) {
    const avg = data.scores.reduce((a, b) => a + b, 0) / data.scores.length
    result[playerId] = { avgScore: Math.round(avg * 10) / 10, count: data.count }
  }

  return result
}

// Update an evaluation
export async function updateEvaluation(
  id: string,
  updates: Partial<NewEvaluation>
): Promise<boolean> {
  console.log('[updateEvaluation] Updating evaluation:', { id, updates })

  const { data, error, count } = await supabase
    .from('scout_evaluations')
    .update(updates)
    .eq('id', id)
    .select()

  if (error) {
    console.error('[updateEvaluation] Error:', error)
    return false
  }

  if (!data || data.length === 0) {
    console.warn('[updateEvaluation] No rows updated - RLS may be blocking the update')
    return false
  }

  console.log('[updateEvaluation] Success:', data)
  return true
}

// Delete an evaluation
export async function deleteEvaluation(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('scout_evaluations')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting evaluation:', error)
    return false
  }

  return true
}
