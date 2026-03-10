import { supabase } from '@/lib/supabase'
import type { ManagementStatus } from '@/types'

export interface MonitoringStatusRecord {
  id: string
  player_id: string
  status: ManagementStatus
  changed_by: string
  changed_by_name: string
  changed_at: string
  notes: string | null
}

// Fetch latest status for all players
export async function fetchAllStatuses(): Promise<Record<string, MonitoringStatusRecord>> {
  const { data, error } = await supabase
    .from('monitoring_status')
    .select('*')
    .order('changed_at', { ascending: false })

  if (error) {
    console.error('Error fetching monitoring statuses:', error)
    return {}
  }

  // Group by player_id, keeping only the latest status per player
  const statusMap: Record<string, MonitoringStatusRecord> = {}
  for (const record of data || []) {
    if (!statusMap[record.player_id]) {
      statusMap[record.player_id] = record
    }
  }

  return statusMap
}

// Fetch status history for a specific player
export async function fetchPlayerStatusHistory(playerId: string): Promise<MonitoringStatusRecord[]> {
  const { data, error } = await supabase
    .from('monitoring_status')
    .select('*')
    .eq('player_id', playerId)
    .order('changed_at', { ascending: false })
    .limit(10)

  if (error) {
    console.error('Error fetching player status history:', error)
    return []
  }

  return data || []
}

// Set status for a player
export async function setPlayerStatus(
  playerId: string,
  status: ManagementStatus,
  userId: string,
  userName: string,
  notes?: string
): Promise<MonitoringStatusRecord | null> {
  const { data, error } = await supabase
    .from('monitoring_status')
    .insert({
      player_id: playerId,
      status,
      changed_by: userId,
      changed_by_name: userName,
      notes: notes || null,
    })
    .select()
    .single()

  if (error) {
    console.error('Error setting player status:', error)
    return null
  }

  return data
}

// Get players by status
export async function fetchPlayersByStatus(status: ManagementStatus): Promise<string[]> {
  const allStatuses = await fetchAllStatuses()
  return Object.entries(allStatuses)
    .filter(([, record]) => record.status === status)
    .map(([playerId]) => playerId)
}
