import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import {
  fetchAllStatuses,
  setPlayerStatus as setStatusInDb,
  type MonitoringStatusRecord,
} from '@/services/monitoringService'
import type { ManagementStatus } from '@/types'

export function useMonitoringStatus() {
  const { user, userDisplayName } = useAuth()
  const [statuses, setStatuses] = useState<Record<string, MonitoringStatusRecord>>({})
  const [loading, setLoading] = useState(true)

  // Load statuses from Supabase on mount
  useEffect(() => {
    async function load() {
      setLoading(true)
      const data = await fetchAllStatuses()
      setStatuses(data)
      setLoading(false)
    }
    load()
  }, [])

  // Get status for a specific player
  const getPlayerStatus = useCallback((playerId: string): MonitoringStatusRecord | null => {
    return statuses[playerId] || null
  }, [statuses])

  // Set management status for a player
  const setPlayerStatus = useCallback(async (playerId: string, status: ManagementStatus, notes?: string) => {
    if (!user) return false

    const record = await setStatusInDb(playerId, status, user.id, userDisplayName, notes)
    if (record) {
      setStatuses(prev => ({
        ...prev,
        [playerId]: record,
      }))
      return true
    }
    return false
  }, [user, userDisplayName])

  // Get all players with a specific status
  const getPlayersByStatus = useCallback((status: ManagementStatus): string[] => {
    return Object.entries(statuses)
      .filter(([, record]) => record.status === status)
      .map(([playerId]) => playerId)
  }, [statuses])

  // Check if user is logged in (for showing login prompt)
  const requiresAuth = !user

  return {
    statuses,
    loading,
    getPlayerStatus,
    setPlayerStatus,
    getPlayersByStatus,
    requiresAuth,
  }
}

// Status labels and colors
export const STATUS_CONFIG: Record<ManagementStatus, { label: string; color: string; bgColor: string }> = {
  en_seguimiento: {
    label: 'En seguimiento',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
  },
  contactado: {
    label: 'Contactado',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
  },
  en_negociacion: {
    label: 'En negociacion',
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
  },
  descartado: {
    label: 'Descartado',
    color: 'text-gray-500 dark:text-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-800/50',
  },
}

// Format status with scout name
export function formatStatusWithScout(record: MonitoringStatusRecord | null): string {
  if (!record) return ''
  const config = STATUS_CONFIG[record.status]
  const date = new Date(record.changed_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
  return `${config.label} por ${record.changed_by_name} (${date})`
}
