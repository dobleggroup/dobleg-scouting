import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { canSeeScoutsPanel } from '@/services/scoutsPanelService'

const cache = new Map<string, Promise<boolean>>()

/**
 * True si la cuenta puede ver la página Scouts (lista `scouts_panel_viewers`).
 * `undefined` mientras consulta: el menú no muestra nada y la ruta espera.
 */
export function useCanSeeScoutsPanel(): boolean | undefined {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [allowed, setAllowed] = useState<boolean | undefined>(undefined)

  useEffect(() => {
    setAllowed(undefined)
    if (!userId) { setAllowed(false); return }
    let cancelled = false
    let pending = cache.get(userId)
    if (!pending) {
      pending = canSeeScoutsPanel().catch(() => {
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
