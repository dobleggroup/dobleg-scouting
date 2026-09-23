// src/services/teamTwinService.ts
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { usePlayersList } from '@/hooks/usePlayerStats'

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

function nameTokens(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .map(t => t.replace(/\./g, ''))
    .filter(Boolean)
}

/** Índice "inicial:apellido" -> jugador con rating, con una entrada por CADA apellido: API-
 *  Football dice "O. Pacheco" y Sofascore "Oswaldo Enrique Pacheco Oliveros". Si dos
 *  jugadores comparten clave (misma persona con dos filas en Sofascore) gana el que tiene
 *  rating. */
export function buildSquadRatingIndex(players: { id: number; name: string; primary_score: number | null }[]): Map<string, SquadRating> {
  const index = new Map<string, SquadRating>()
  for (const p of players) {
    const tokens = nameTokens(p.name)
    if (tokens.length < 2) continue
    const entry: SquadRating = { playerId: p.id, name: p.name, rating: p.primary_score }
    for (const surname of tokens.slice(1)) {
      const key = `${tokens[0][0]}:${surname}`
      const current = index.get(key)
      if (!current || (current.rating === null && entry.rating !== null)) index.set(key, entry)
    }
  }
  return index
}

/** Busca a un jugador del plantel ("M. Calzon", "Franco Tirotta") en el índice: prueba con
 *  la inicial y cada uno de sus apellidos, del último al primero. */
export function lookupSquadRating(index: Map<string, SquadRating>, name: string): SquadRating | undefined {
  const tokens = nameTokens(name)
  if (tokens.length < 2) return undefined
  for (const surname of tokens.slice(1).reverse()) {
    const hit = index.get(`${tokens[0][0]}:${surname}`)
    if (hit) return hit
  }
  return undefined
}

/** Ratings del plantel actual de un equipo de API-Football. Usar con lookupSquadRating. */
export function useSquadRatings(apiTeamId: number | null | undefined): Map<string, SquadRating> {
  const [ratedTeamId, setRatedTeamId] = useState<number | null>(null)
  useEffect(() => {
    let active = true
    setRatedTeamId(null)
    if (apiTeamId) resolveRatedTeamId(apiTeamId).then(id => { if (active) setRatedTeamId(id) })
    return () => { active = false }
  }, [apiTeamId])
  const { players } = usePlayersList(ratedTeamId ? { team_id: ratedTeamId, pageSize: 80 } : { pageSize: 0 })
  return useMemo(() => buildSquadRatingIndex(players), [players])
}
