import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { canApproveActivities } from '@/services/scoutsPanelService'

const cache = new Map<string, Promise<boolean>>()

/** True si la cuenta acepta reuniones y viajes de los scouts (Marcos y Matías Roberti). */
export function useCanApproveActivities(): boolean {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    setAllowed(false)
    if (!userId) return
    let cancelled = false
    let pending = cache.get(userId)
    if (!pending) {
      pending = canApproveActivities().catch(() => {
        cache.delete(userId)
        return false
      })
      cache.set(userId, pending)
    }
    pending.then(ok => { if (!cancelled) setAllowed(ok) })
    return () => { cancelled = true }
  }, [userId])

  return allowed
}
