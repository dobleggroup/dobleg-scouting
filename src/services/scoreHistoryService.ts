import { supabase } from '@/lib/supabase'

export interface ScoreHistoryRecord {
  id: string
  player_id: string
  player_name: string
  gg_score: number
  opportunity_score: number | null
  recorded_at: string
  source: string
}

// Fetch score history for a player
export async function fetchPlayerScoreHistory(playerId: string, limit = 20): Promise<ScoreHistoryRecord[]> {
  const { data, error } = await supabase
    .from('score_history')
    .select('*')
    .eq('player_id', playerId)
    .order('recorded_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Error fetching score history:', error)
    return []
  }

  return data || []
}

// Save a batch of scores (called when data refreshes)
export async function saveScoreBatch(
  scores: Array<{
    playerId: string
    playerName: string
    ggScore: number
    opportunityScore?: number
  }>
): Promise<boolean> {
  if (scores.length === 0) return true

  // Get today's date (without time) to check if we already saved today
  const today = new Date().toISOString().split('T')[0]

  // Check if we already have records for today
  const { data: existingToday } = await supabase
    .from('score_history')
    .select('id')
    .gte('recorded_at', `${today}T00:00:00`)
    .lt('recorded_at', `${today}T23:59:59`)
    .limit(1)

  // If we already saved today, skip (to avoid duplicates on page refresh)
  if (existingToday && existingToday.length > 0) {
    console.log('Score history already saved for today, skipping...')
    return true
  }

  const records = scores.map(s => ({
    player_id: s.playerId,
    player_name: s.playerName,
    gg_score: s.ggScore,
    opportunity_score: s.opportunityScore || null,
    source: 'auto',
  }))

  const { error } = await supabase
    .from('score_history')
    .insert(records)

  if (error) {
    console.error('Error saving score batch:', error)
    return false
  }

  console.log(`Saved ${records.length} score records to history`)
  return true
}

// Get latest scores for all players (for comparison)
export async function fetchLatestScores(): Promise<Record<string, ScoreHistoryRecord>> {
  const { data, error } = await supabase
    .from('score_history')
    .select('*')
    .order('recorded_at', { ascending: false })

  if (error) {
    console.error('Error fetching latest scores:', error)
    return {}
  }

  // Group by player_id, keeping only the latest
  const scoreMap: Record<string, ScoreHistoryRecord> = {}
  for (const record of data || []) {
    if (!scoreMap[record.player_id]) {
      scoreMap[record.player_id] = record
    }
  }

  return scoreMap
}

// Get score trend for a player (last N records)
export async function getScoreTrend(playerId: string, limit = 5): Promise<number[]> {
  const history = await fetchPlayerScoreHistory(playerId, limit)
  // Return scores in chronological order (oldest first)
  return history.map(h => h.gg_score).reverse()
}
