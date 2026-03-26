import { createContext, useContext, useEffect, useState } from 'react'
import { fetchScoutsGGPlayers } from '@/services/scoutPlayersService'

interface ScoutsGGContextValue {
  isInScoutsGG: (playerName: string) => boolean
  /** Recargar la lista (útil al agregar/quitar jugadores desde ScoutTrackingGGPage) */
  refresh: () => void
}

const ScoutsGGContext = createContext<ScoutsGGContextValue>({
  isInScoutsGG: () => false,
  refresh: () => {},
})

export function useScoutsGG() {
  return useContext(ScoutsGGContext)
}

export function ScoutsGGProvider({ children }: { children: React.ReactNode }) {
  const [lookup, setLookup] = useState<Set<string>>(new Set())

  const load = () => {
    fetchScoutsGGPlayers().then(players => {
      const set = new Set<string>()
      for (const p of players) {
        set.add(p.full_name.toLowerCase().trim())
        if (p.player_db_id) set.add(p.player_db_id.toLowerCase().trim())
      }
      setLookup(set)
    })
  }

  useEffect(() => { load() }, [])

  const isInScoutsGG = (playerName: string) =>
    lookup.has(playerName.toLowerCase().trim())

  return (
    <ScoutsGGContext.Provider value={{ isInScoutsGG, refresh: load }}>
      {children}
    </ScoutsGGContext.Provider>
  )
}
