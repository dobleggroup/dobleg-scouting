import { useCallback, useEffect, useMemo, useState } from 'react'
import { AGENCY_PLAYERS } from '@/constants/agencyPlayers'
import { FILTER_POSITION_MAP } from '@/constants/scoring'
import { useData } from '@/context/DataContext'
import { normalizeName } from '@/utils/scoring'
import { agencyKey } from '@/services/agencyPlayersService'
import { fetchMatchMinutes, fetchMonthly, storedMatchMinutes, storedMonthly, type MatchMinutes } from '@/services/wyscoutPerfService'
import { splitByPlayer } from './analysis'
import { buildParticipation, mergedMatches, type Participation } from './participation'
import { fetchTableroDataset } from '@/features/tablero/tableroService'
import { toAppearances } from '@/features/tablero/tableroData'
import { agencyRowsFromISO } from '@/services/agencyMatchRowsService'
import { setPositionOverrides } from './conclusions'
import { setAvailableStats, type PosGroup } from './metrics'
import type { MonthRow } from './periods'

const APP_POSITION_GROUP: Record<string, PosGroup> = {
  'Arquero': 'ARQ', 'Defensor Central': 'DEF',
  'Lateral Derecho': 'LAT', 'Lateral Izquierdo': 'LAT', 'Lateral': 'LAT',
  'Volante Central': 'VC', 'Volante Interno': 'MED',
  'Extremo Derecho': 'EXT', 'Extremo Izquierdo': 'EXT', 'Extremo': 'EXT',
  'Delantero': 'DEL',
}

/**
 * Partidos de API-Football / Sofascore de toda la agencia (titular, suplente,
 * no ingresó, minutos). Una sola carga compartida entre las pantallas.
 */
let participationPromise: Promise<Participation> | null = null
let participationRoster = ''
function loadParticipation(): Promise<Participation> {
  // El roster se completa cuando llegan las altas de la plataforma: si cambió, se vuelve a pedir.
  const sig = AGENCY_PLAYERS.map(p => `${p.fullName}:${p.apiTeamId}`).join('|')
  if (!participationPromise || sig !== participationRoster) {
    participationRoster = sig
    const roster = AGENCY_PLAYERS.map(p => ({ fullName: p.fullName, shortName: p.shortName, apiTeamId: p.apiTeamId, team: p.team, isReserve: p.isReserve }))
    participationPromise = fetchTableroDataset(roster).then(d => {
      const teamAlias = new Map<number, number>()
      const apps = toAppearances(d.rows, roster, { owners: d.owners, teamTwins: d.teamTwins, teamAliasOut: teamAlias })
      return buildParticipation(apps, d.teamFixtures, teamAlias, roster, agencyRowsFromISO())
    })
    participationPromise.catch(() => { participationPromise = null })
  }
  return participationPromise
}

export function useParticipation() {
  const { agencyPlayers } = useData()
  const [p, setP] = useState<Participation | null>(null)
  useEffect(() => {
    let alive = true
    loadParticipation().then(r => { if (alive) setP(r) }).catch(() => {})
    return () => { alive = false }
  }, [agencyPlayers])
  return p
}

/**
 * Partidos de cada jugador para contar titularidades y minutos: los de
 * API-Football / Sofascore y, donde no hay (antes de esos datos o en Reserva),
 * los de Wyscout.
 */
export function useMatchMinutes() {
  const [wyscout, setWyscout] = useState<Map<string, MatchMinutes[]>>(new Map())
  const participation = useParticipation()
  useEffect(() => {
    let fresh = false
    storedMatchMinutes().then(m => { if (m && !fresh) setWyscout(m) })
    fetchMatchMinutes().then(m => { fresh = true; setWyscout(m) }).catch(() => {})
  }, [])
  return useMemo(() => {
    const keys = new Set([...wyscout.keys(), ...(participation?.matches.keys() ?? [])])
    const out = new Map<string, MatchMinutes[]>()
    for (const k of keys) {
      const list = mergedMatches(k, participation, wyscout)
      if (list) out.set(k, list)
    }
    return out
  }, [wyscout, participation])
}

/** Datos de Wyscout por mes de toda la agencia + helpers de nombre y foto. */
export function useWyscoutMonthly() {
  const [rows, setRows] = useState<MonthRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback((force = false) => {
    fetchMonthly(force).then(r => { setRows(r); setError(null) }).catch(e => { setError((e as Error).message); setRows(prev => prev ?? []) })
  }, [])
  useEffect(() => {
    // La copia guardada en el navegador aparece al instante; la de la base la reemplaza al llegar.
    storedMonthly().then(r => { if (r) setRows(prev => prev ?? r) })
    load()
  }, [load])

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
    // Columnas del Excel que efectivamente llegaron (para no mostrar métricas sin datos)
    if (rows?.length) setAvailableStats(new Set(rows.flatMap(r => Object.keys(r.sums ?? {}))))
    return splitByPlayer(rows ?? [])
  }, [rows, overrides])
  const photo = useCallback((key: string) => roster.get(key)?.image ?? null, [roster])
  const name = useCallback((key: string) => roster.get(key)?.fullName ?? byPlayer.get(key)?.[0]?.player_name ?? key, [roster, byPlayer])

  return { rows, byPlayer, error, reload: load, photo, name, roster }
}
