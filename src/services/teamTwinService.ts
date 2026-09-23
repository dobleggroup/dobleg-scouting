// src/services/teamTwinService.ts
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { usePlayersList } from '@/hooks/usePlayerStats'
import { identityKey } from '@/context/DataContext'

/** Los equipos que sincroniza Sofascore (Primera Nacional, Liga Profesional, ...) se guardan
 *  con su id de Sofascore + este offset (ver scripts/sync-sofascore/sync.py). El plantel de
 *  un DT viene de API-Football con otro id, así que para leer ratings hay que ir al "gemelo". */
export const SOFASCORE_ID_OFFSET = 20_000_000

const twinCache = new Map<number, number>()

/** Id del equipo que tiene jugadores con rating para `apiTeamId`: su gemelo de Sofascore
 *  (mismo nombre en `teams`) si existe, si no el mismo id. */
export async function resolveRatedTeamId(apiTeamId: number): Promise<number> {
  const cached = twinCache.get(apiTeamId)
  if (cached !== undefined) return cached
  const { data: own } = await supabase.from('teams').select('name').eq('id', apiTeamId).maybeSingle()
  let resolved = apiTeamId
  if (own?.name) {
    const { data: twins } = await supabase
      .from('teams')
      .select('id')
      .eq('name', own.name)
      .gte('id', SOFASCORE_ID_OFFSET)
    if (twins && twins.length === 1) resolved = twins[0].id as number
  }
  twinCache.set(apiTeamId, resolved)
  return resolved
}

export interface SquadRating {
  /** Id del jugador con rating (el del gemelo de Sofascore): abre su ficha completa. */
  playerId: number
  name: string
  rating: number | null
}

/** Ratings del plantel actual de un equipo de API-Football, indexados por identityKey del
 *  nombre ("M. Calzon" y "Matías Calzón" dan la misma clave). */
export function useSquadRatings(apiTeamId: number | null | undefined): Map<string, SquadRating> {
  const [ratedTeamId, setRatedTeamId] = useState<number | null>(null)
  useEffect(() => {
    let active = true
    setRatedTeamId(null)
    if (apiTeamId) resolveRatedTeamId(apiTeamId).then(id => { if (active) setRatedTeamId(id) })
    return () => { active = false }
  }, [apiTeamId])
  const { players } = usePlayersList(ratedTeamId ? { team_id: ratedTeamId, pageSize: 80 } : { pageSize: 0 })
  return useMemo(() => {
    const byKey = new Map<string, SquadRating>()
    for (const p of players) byKey.set(identityKey(p.name), { playerId: p.id, name: p.name, rating: p.primary_score })
    return byKey
  }, [players])
}
