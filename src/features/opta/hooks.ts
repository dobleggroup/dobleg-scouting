import { useEffect, useMemo, useState } from 'react'
import { agencyKey, getAgencyPlayers } from '@/services/agencyPlayersService'
import type { AgencyPlayer } from '@/constants/agencyPlayers'
import { loadLeague, type OptaLeague, type OptaPlayer } from './data'
import { buildPercentiles, DEFAULT_MIN_MINUTES, type PercentileIndex } from './metrics'

export function useAsync<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true })
  useEffect(() => {
    let alive = true
    setState(s => ({ ...s, loading: true, error: null }))
    load().then(
      data => { if (alive) setState({ data, error: null, loading: false }) },
      err => { if (alive) setState({ data: null, error: (err as Error).message, loading: false }) },
    )
    return () => { alive = false }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  return state
}

export function useOptaLeague() {
  return useAsync(loadLeague, [])
}

const pctCache = new Map<number, PercentileIndex>()
export function usePercentiles(league: OptaLeague | null, minMinutes = DEFAULT_MIN_MINUTES): PercentileIndex | null {
  return useMemo(() => {
    if (!league) return null
    if (!pctCache.has(minMinutes)) pctCache.set(minMinutes, buildPercentiles(league.players, minMinutes))
    return pctCache.get(minMinutes)!
  }, [league, minMinutes])
}

const tokens = (s: string) => agencyKey(s).split(' ').filter(t => t.length > 1)

/**
 * Jugadores Doble G que están en la base de Opta. Todas las palabras del nombre
 * de la agencia tienen que estar en el nombre completo de Opta (que trae segundos
 * nombres) y el apellido tiene que coincidir: "Nicolás Figal" ↔ "Jorge Nicolás Figal".
 */
export function matchAgencyPlayers(players: OptaPlayer[], roster: AgencyPlayer[] = getAgencyPlayers()) {
  const out = new Map<string, AgencyPlayer>() // optaId → agencia
  for (const ag of roster) {
    const want = tokens(ag.fullName)
    if (want.length < 2) continue
    const surname = want[want.length - 1]
    const hits = players.filter(p => {
      const have = new Set([...tokens(p.fullName ?? ''), ...tokens(p.name)])
      return have.has(surname) && want.every(t => have.has(t))
    })
    // Si hay más de uno (homónimos), se queda con el que más minutos tiene.
    const best = hits.sort((a, b) => b.minutes - a.minutes)[0]
    if (best && !out.has(best.id)) out.set(best.id, ag)
  }
  return out
}

export function useAgencyInOpta(league: OptaLeague | null) {
  return useMemo(() => (league ? matchAgencyPlayers(league.players) : new Map<string, AgencyPlayer>()), [league])
}
