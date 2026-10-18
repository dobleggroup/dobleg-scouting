import { useCallback, useEffect, useMemo, useState } from 'react'
import { AGENCY_PLAYERS } from '@/constants/agencyPlayers'
import { FILTER_POSITION_MAP } from '@/constants/scoring'
import { useData } from '@/context/DataContext'
import { normalizeName } from '@/utils/scoring'
import { agencyKey } from '@/services/agencyPlayersService'
import { fetchMonthly } from '@/services/wyscoutPerfService'
import { splitByPlayer } from './analysis'
import { setPositionOverrides } from './conclusions'
import type { PosGroup } from './metrics'
import type { MonthRow } from './periods'

const APP_POSITION_GROUP: Record<string, PosGroup> = {
  'Arquero': 'ARQ', 'Defensor Central': 'DEF',
  'Lateral Derecho': 'LAT', 'Lateral Izquierdo': 'LAT', 'Lateral': 'LAT',
  'Volante Central': 'MED', 'Volante Interno': 'MED',
  'Extremo Derecho': 'EXT', 'Extremo Izquierdo': 'EXT', 'Extremo': 'EXT',
  'Delantero': 'DEL',
}

/** Datos de Wyscout por mes de toda la agencia + helpers de nombre y foto. */
export function useWyscoutMonthly() {
  const [rows, setRows] = useState<MonthRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback((force = false) => {
    fetchMonthly(force).then(r => { setRows(r); setError(null) }).catch(e => { setError((e as Error).message); setRows(prev => prev ?? []) })
  }, [])
  useEffect(() => { load() }, [load])

  const { internal } = useData()
  const roster = useMemo(() => new Map(AGENCY_PLAYERS.map(p => [agencyKey(p.fullName), p])), [])
  // Posición de la ficha (planilla interna, o la del alta) → grupo. Se registra
  // antes de armar `byPlayer` para que todos los cálculos la usen.
  const overrides = useMemo(() => {
    const m = new Map<string, PosGroup>()
    const byName = new Map<string, string>()
    for (const p of AGENCY_PLAYERS) {
      byName.set(normalizeName(p.fullName), agencyKey(p.fullName))
      byName.set(normalizeName(p.shortName), agencyKey(p.fullName))
    }
    for (const p of internal) {
      const key = byName.get(normalizeName(p.Jugador))
      const g = APP_POSITION_GROUP[FILTER_POSITION_MAP[p['Posición']] ?? '']
      if (key && g) m.set(key, g)
    }
    for (const a of AGENCY_PLAYERS) {
      const key = agencyKey(a.fullName)
      const g = APP_POSITION_GROUP[FILTER_POSITION_MAP[a.position ?? ''] ?? '']
      if (!m.has(key) && g) m.set(key, g)
    }
    return m
  }, [internal])
  const byPlayer = useMemo(() => {
    setPositionOverrides(overrides)
    return splitByPlayer(rows ?? [])
  }, [rows, overrides])
  const photo = useCallback((key: string) => roster.get(key)?.image ?? null, [roster])
  const name = useCallback((key: string) => roster.get(key)?.fullName ?? byPlayer.get(key)?.[0]?.player_name ?? key, [roster, byPlayer])

  return { rows, byPlayer, error, reload: load, photo, name, roster }
}
