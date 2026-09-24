import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

// Una consulta por cuenta: la tabla de Scouting Interno la usa en varias partes.
const cache = new Map<string, Promise<boolean>>()

/**
 * True si la cuenta puede ver el estado de los videos en Scouting Interno (lista
 * `video_status_viewers`: Marcos y Matías Roberti). Mientras consulta devuelve false, así
 * nadie más lo ve ni por un instante.
 */
export function useCanSeeVideoStatus(): boolean {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    setAllowed(false)
    if (!userId) return
    let cancelled = false
    let pending = cache.get(userId)
    if (!pending) {
      pending = Promise.resolve(supabase.rpc('can_see_video_status'))
        .then(({ data, error }) => {
          if (error) throw error
          return !!data
        })
        .catch(() => {
          cache.delete(userId) // un error de red no deja la respuesta fija hasta recargar
          return false
        })
      cache.set(userId, pending)
    }
    pending.then(ok => { if (!cancelled) setAllowed(ok) })
    return () => { cancelled = true }
  }, [userId])

  return allowed
}
