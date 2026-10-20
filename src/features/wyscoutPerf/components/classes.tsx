import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AGENCY_PLAYERS } from '@/constants/agencyPlayers'
import { normalizeName } from '@/utils/scoring'
import { agencyPlayerKey, type AgencyClass } from '@/services/agencyClassificationService'
import { CLASS_BADGE_COLOR } from '@/constants/agencyClassification'

/** Clase de la agencia o "sin calificar" (null). */
export type ClassOrNone = AgencyClass | null
export type ClassFilter = 'all' | AgencyClass | 'none'

export const CLASS_GROUPS: Array<{ id: AgencyClass | 'none'; label: string; short: string }> = [
  { id: 'A', label: 'Clase A', short: 'A' },
  { id: 'B', label: 'Clase B', short: 'B' },
  { id: 'C', label: 'Clase C', short: 'C' },
  { id: 'none', label: 'Sin calificar', short: '—' },
]

export const CLASS_FILTER_OPTS: Array<{ id: ClassFilter; label: string }> = [
  { id: 'all', label: 'Todas' }, { id: 'A', label: 'Clase A' }, { id: 'B', label: 'Clase B' }, { id: 'C', label: 'Clase C' }, { id: 'none', label: 'Sin calificar' },
]

/** Para ordenar: A primero, sin calificar al final. */
export const classRank = (c: ClassOrNone) => (c === 'A' ? 0 : c === 'B' ? 1 : c === 'C' ? 2 : 3)

export const matchesClass = (c: ClassOrNone, f: ClassFilter) => f === 'all' || (f === 'none' ? c === null : c === f)

let cache: Promise<Array<{ player_key: string; player_name: string; class: AgencyClass }>> | null = null

/**
 * Clase de cada jugador por su nombre completo (la misma clave que usa
 * Clasificación interna). Cuando dos jugadores comparten clave ("F. Paradela"
 * es Federico y Francesco) manda el nombre guardado con la clase.
 */
export function useClassOf() {
  const [rows, setRows] = useState<Array<{ player_key: string; player_name: string; class: AgencyClass }>>([])
  useEffect(() => {
    cache ??= Promise.resolve(supabase.from('agency_classifications').select('player_key, player_name, class'))
      .then(({ data }) => (data ?? []) as Array<{ player_key: string; player_name: string; class: AgencyClass }>)
    let alive = true
    cache.then(r => { if (alive) setRows(r) }).catch(() => { cache = null })
    return () => { alive = false }
  }, [])
  const { byName, byKey } = useMemo(() => {
    const shared = new Map<string, number>()
    for (const p of AGENCY_PLAYERS) { const k = agencyPlayerKey(p.fullName); shared.set(k, (shared.get(k) ?? 0) + 1) }
    return {
      byName: new Map(rows.map(r => [normalizeName(r.player_name), r.class])),
      byKey: new Map(rows.filter(r => (shared.get(r.player_key) ?? 0) <= 1).map(r => [r.player_key, r.class])),
    }
  }, [rows])
  return useCallback((fullName: string): ClassOrNone =>
    byName.get(normalizeName(fullName)) ?? byKey.get(agencyPlayerKey(fullName)) ?? null, [byName, byKey])
}

export function ClassBadge({ c, size = 'sm' }: { c: ClassOrNone; size?: 'sm' | 'xs' }) {
  const box = size === 'xs' ? 'w-4 h-4 text-[9px]' : 'w-5 h-5 text-[10px]'
  if (!c) return <span title="Sin calificar" className={`${box} inline-flex items-center justify-center rounded-md font-bold shrink-0 bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-400`}>–</span>
  return <span title={`Clase ${c}`} className={`${box} inline-flex items-center justify-center rounded-md font-bold shrink-0 ${CLASS_BADGE_COLOR[c]}`}>{c}</span>
}
