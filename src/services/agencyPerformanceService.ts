import { AGENCY_PLAYERS } from '@/constants/agencyPlayers'
import { normalizeName } from '@/utils/scoring'
import { supabase } from '@/lib/supabase'
import { fetchPlayersMatchStats, fetchTeamsWithStatsSince, type SquadStatRow } from './playerStatsService'

export type PerformancePeriod = 'month' | '6months' | 'year'

const PERIOD_DAYS: Record<PerformancePeriod, number> = { month: 30, '6months': 182, year: 365 }

export interface AgencyPlayerPerformance {
  fullName: string
  minutes: number
  matches: number
  starts: number   // proxy: minutos >= 60 en ese partido
  goals: number
  assists: number
  shotsTotal: number
  shotsOn: number
  passesTotal: number
  passesKey: number
  /** Suma de passes_accuracy (%) por partido — dividir por `matchesWithPassAcc` para el promedio. */
  passesAccuracySum: number
  matchesWithPassAcc: number
  /** Suma de pases completados (passes_total * passes_accuracy/100) por partido con dato de precisión. */
  passesCompletedSum: number
  matchesWithPassesCompleted: number
  tackles: number
  interceptions: number
  duelsWon: number
  duelsTotal: number
  dribbleSuccess: number
  dribbleAttempted: number
  /** Suma de rating de partido — dividir por `matchesWithRating` para el promedio (Top Rendimiento evolutivo). */
  ratingSum: number
  matchesWithRating: number
}

export interface AgencyPerformance {
  period: PerformancePeriod
  totalMinutes: number
  totalMatches: number
  totalStarts: number
  totalGoals: number
  totalAssists: number
  byPlayer: AgencyPlayerPerformance[]
  /** Jugadores de la agencia sin un solo minuto en el período (0 filas encontradas). */
  noMinutes: string[]
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/**
 * true si la fila cae dentro del período pedido. Si la fila no trae fecha de
 * fixture, se asume que ya vino filtrada por el `fromISO` de la query (no
 * bloquea el flujo viejo de `fetchAgencyPerformance` ni los tests existentes).
 */
function isWithinPeriod(row: SquadStatRow, period: PerformancePeriod): boolean {
  if (!row.fixture?.date) return true
  const cutoff = Date.now() - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000
  return new Date(row.fixture.date).getTime() >= cutoff
}

/**
 * Suma filas de `player_match_stats` (cualquier jugador de esos equipos) en
 * datos de la agencia: filtra por nombre contra el roster y acumula por
 * jugador. Separada de la parte de red para poder testearla con filas fijas.
 *
 * Filtra `rows` por `period` usando `row.fixture.date` cuando está presente,
 * para poder pedir una sola vez el rango más amplio (año) y recalcular los
 * demás períodos en el cliente sin volver a pegarle a Supabase — antes cada
 * cambio de pestaña (mes/6 meses/año) disparaba un fetch nuevo a ~30 equipos.
 */
export function aggregatePerformance(
  period: PerformancePeriod,
  rows: SquadStatRow[],
  roster: { fullName: string; shortName?: string; apiTeamId: number | null }[],
): AgencyPerformance {
  const byKey = new Map<string, AgencyPlayerPerformance>()
  // Algunos equipos traen el nombre del jugador abreviado en `player_match_stats`
  // ("A. Steimbach" en vez de "Alexis Steimbach") — sin indexar también por
  // `shortName`, esas filas no matcheaban nunca y el jugador quedaba invisible
  // en TODOS los widgets de rendimiento (caso real: Alexis Steimbach aparecía
  // en "Sin rodaje" con 13 minutos jugados hace 2 días).
  const rosterByNormalized = new Map<string, string>()
  for (const p of roster) {
    rosterByNormalized.set(normalizeName(p.fullName), p.fullName)
    if (p.shortName) rosterByNormalized.set(normalizeName(p.shortName), p.fullName)
  }

  for (const row of rows) {
    if (!isWithinPeriod(row, period)) continue
    const rawName = row.player?.name
    if (!rawName) continue
    const fullName = rosterByNormalized.get(normalizeName(rawName))
    if (!fullName) continue

    const acc = byKey.get(fullName) ?? {
      fullName, minutes: 0, matches: 0, starts: 0, goals: 0, assists: 0,
      shotsTotal: 0, shotsOn: 0, passesTotal: 0, passesKey: 0, passesAccuracySum: 0, matchesWithPassAcc: 0,
      passesCompletedSum: 0, matchesWithPassesCompleted: 0,
      tackles: 0, interceptions: 0,
      duelsWon: 0, duelsTotal: 0, dribbleSuccess: 0, dribbleAttempted: 0,
      ratingSum: 0, matchesWithRating: 0,
    }
    const minutes = row.minutes ?? 0
    acc.minutes += minutes
    acc.matches += 1
    if (minutes >= 60) acc.starts += 1
    acc.goals += row.goals ?? 0
    acc.assists += row.assists ?? 0
    acc.shotsTotal += row.shots_total ?? 0
    acc.shotsOn += row.shots_on ?? 0
    acc.passesTotal += row.passes_total ?? 0
    acc.passesKey += row.passes_key ?? 0
    if (row.passes_accuracy != null) {
      acc.passesAccuracySum += row.passes_accuracy
      acc.matchesWithPassAcc += 1
      acc.passesCompletedSum += (row.passes_total ?? 0) * (row.passes_accuracy / 100)
      acc.matchesWithPassesCompleted += 1
    }
    acc.tackles += row.tackles ?? 0
    acc.interceptions += row.interceptions ?? 0
    acc.duelsWon += row.duels_won ?? 0
    acc.duelsTotal += row.duels_total ?? 0
    acc.dribbleSuccess += row.dribbles_success ?? 0
    acc.dribbleAttempted += row.dribbles_attempted ?? 0
    if (row.rating != null) {
      acc.ratingSum += row.rating
      acc.matchesWithRating += 1
    }
    byKey.set(fullName, acc)
  }

  const byPlayer = [...byKey.values()].sort((a, b) => b.minutes - a.minutes)
  const playedNames = new Set(byPlayer.map(p => p.fullName))
  const noMinutes = roster
    .filter(p => p.apiTeamId != null && !playedNames.has(p.fullName))
    .map(p => p.fullName)

  return {
    period,
    totalMinutes: byPlayer.reduce((s, p) => s + p.minutes, 0),
    totalMatches: byPlayer.reduce((s, p) => s + p.matches, 0),
    totalStarts: byPlayer.reduce((s, p) => s + p.starts, 0),
    totalGoals: byPlayer.reduce((s, p) => s + p.goals, 0),
    totalAssists: byPlayer.reduce((s, p) => s + p.assists, 0),
    byPlayer,
    noMinutes,
  }
}

/**
 * Cómo puede venir escrito el nombre de un jugador de la agencia en `players`:
 * completo, abreviado ("A. Steimbach"), inicial + apellidos, y cada uno con y
 * sin acentos (caso real: la base tiene "M. Espíndola" y el roster
 * "M. Espindola"). La búsqueda en la base es exacta, así que se le pasan
 * todas las formas; el filtro fino (sin acentos/mayúsculas) lo hace después
 * `aggregatePerformance` igual que siempre.
 */
export function agencyNameVariants(roster: { fullName: string; shortName?: string }[]): string[] {
  const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  const out = new Set<string>()
  for (const p of roster) {
    const parts = p.fullName.trim().split(/\s+/)
    const forms = [p.fullName.trim(), p.shortName?.trim()]
    if (parts.length > 1) {
      forms.push(`${parts[0][0]}. ${parts.slice(1).join(' ')}`)
      forms.push(`${parts[0][0]}. ${parts[parts.length - 1]}`)
    }
    for (const f of forms) {
      if (!f) continue
      out.add(f)
      out.add(stripAccents(f))
    }
  }
  return [...out]
}

export interface AgencyPerformanceRows {
  /** Filas de `player_match_stats` de los jugadores de la agencia, último año. */
  rows: SquadStatRow[]
  /** Equipos de la agencia con partidos cargados en los últimos 30 días. */
  activeTeamIds: Set<number>
}

/**
 * Filas crudas de `player_match_stats` de los jugadores de la agencia, en el
 * rango más amplio soportado (año). Pensada para pedirse una sola vez y
 * reutilizarse para cualquier período vía `aggregatePerformance` (filtra por
 * fecha en el cliente), en vez de volver a pegarle a Supabase por cada pestaña.
 *
 * Primero busca los ids de los jugadores por nombre y después pide sólo sus
 * filas (ver `fetchPlayersMatchStats`: pedir los planteles completos se
 * cortaba por timeout y el Inicio quedaba vacío).
 */
export async function fetchAgencyPerformanceRows(): Promise<AgencyPerformanceRows> {
  const roster = AGENCY_PLAYERS
  const teamIds = [...new Set(
    roster.map(p => p.apiTeamId).filter((id): id is number => id != null),
  )]

  const rowsPromise = (async () => {
    const { data, error } = await supabase
      .from('players')
      .select('id, name')
      .in('name', agencyNameVariants(roster))
    if (error) throw error
    const rosterKeys = new Set(roster.flatMap(p => [p.fullName, p.shortName].filter(Boolean).map(n => normalizeName(n!))))
    const playerIds = (data ?? [])
      .filter(p => rosterKeys.has(normalizeName(p.name as string)))
      .map(p => p.id as number)
    return fetchPlayersMatchStats(playerIds, teamIds, isoDaysAgo(PERIOD_DAYS.year))
  })()

  const [rows, activeTeamIds] = await Promise.all([
    rowsPromise,
    fetchTeamsWithStatsSince(teamIds, new Date(Date.now() - PERIOD_DAYS.month * 24 * 60 * 60 * 1000).toISOString()),
  ])
  return { rows, activeTeamIds }
}

/**
 * Minutos/partidos/goles reales de la agencia en un período, desde
 * `player_match_stats` (Supabase) — la misma fuente que ya usan los informes
 * para "Continuidad"/"Últimos 5", filtrada a los jugadores Doble G por nombre.
 * Sin esto no hay minutos reales sin pegarle a una API externa partido por
 * partido (ver nota en HomePage).
 */
export async function fetchAgencyPerformance(period: PerformancePeriod): Promise<AgencyPerformance> {
  const { rows } = await fetchAgencyPerformanceRows()
  return aggregatePerformance(period, rows, AGENCY_PLAYERS)
}
