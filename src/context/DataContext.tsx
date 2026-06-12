import { createContext, useContext, useEffect, useRef, useCallback, useState, type ReactNode } from 'react'
import { loadAllData, type MasDatosEntry, type SeguimientoMetricsPlayer } from '@/services/csvService'
import { computeGGScores, normalizeName, parseMarketValue, formatMarketValue, parseContractDate, monthsBetween, getNumericValue } from '@/utils/scoring'
import { POSITION_MAP, SCORING_CONFIG, FILTER_POSITION_MAP } from '@/constants/scoring'
import { loadAgencyPlayers } from '@/services/agencyPlayersService'
import { getAgencyPlayersList, type AgencyPlayer } from '@/constants/agencyPlayers'
import type { AppData, EnrichedPlayer, EvolutionEntry, TransfermarktData, MonitoringPlayer, MarketValueHistoryEntry, GPSEntry } from '@/types'

const DataContext = createContext<AppData | null>(null)

// Construye un EnrichedPlayer mínimo a partir de un AgencyPlayer (cuando no está en external)
function agencyToEnriched(a: AgencyPlayer): EnrichedPlayer {
  const marketValueRaw = parseMarketValue(a.marketValue ?? '')
  return {
    Jugador: a.fullName,
    Liga: '',
    Equipo: a.team,
    'Posición': '',
    Edad: '',
    'País de nacimiento': '',
    Pie: '', Altura: '',
    'Valor de mercado (Transfermarkt)': a.marketValue ?? '',
    'Vencimiento contrato': a.contractEnd ?? '',
    'Partidos jugados': '', 'Minutos jugados': '',
    Goles: '', xG: '', Asistencias: '', xA: '',
    'Posición específica': '',
    id: '',
    Transfermkt: '',
    Representante: '',
    Imagen: a.image ?? '',
    ggScore: null,
    ggScorePercentile: null,
    source: 'interno',
    contractStatus: 'ok',
    monthsRemaining: null,
    marketValueFormatted: formatMarketValue(marketValueRaw),
    marketValueRaw,
    minutesPlayed: 0,
    ageNum: 0,
  }
}

/** internal base + jugadores Doble G agregados que no estén ya en internal. */
export function mergeAgencyIntoInternal(
  baseInternal: EnrichedPlayer[],
  external: EnrichedPlayer[],
  agencyPlayers: AgencyPlayer[],
): EnrichedPlayer[] {
  const present = new Set(baseInternal.map(p => normalizeName(p.Jugador)))
  const extByName = new Map(external.map(p => [normalizeName(p.Jugador), p]))
  const additions: EnrichedPlayer[] = []
  for (const a of agencyPlayers) {
    const key = normalizeName(a.fullName)
    if (present.has(key)) continue
    const fromExternal = extByName.get(key)
    additions.push(fromExternal ? { ...fromExternal, source: 'interno' } : agencyToEnriched(a))
    present.add(key)
  }
  return [...baseInternal, ...additions]
}

function buildTransfermarktMap(tmData: TransfermarktData[]): Map<string, TransfermarktData> {
  const map = new Map<string, TransfermarktData>()
  for (const tm of tmData) {
    if (tm.Jugador) {
      map.set(normalizeName(tm.Jugador), tm)
    }
  }
  return map
}

// Build a map using Transfermarkt URL as key (more precise for internal players)
function buildTransfermarktByLinkMap(tmData: TransfermarktData[]): Map<string, TransfermarktData> {
  const map = new Map<string, TransfermarktData>()
  for (const tm of tmData) {
    if (tm.Transfermkt) {
      // Normalize the URL to handle variations (http/https, www, .es/.com)
      const normalizedUrl = tm.Transfermkt
        .toLowerCase()
        .replace('https://', '')
        .replace('http://', '')
        .replace('www.', '')
        .replace('transfermarkt.es', 'transfermarkt.com')
        .trim()
      map.set(normalizedUrl, tm)
    }
  }
  return map
}

// Enrich internal player using their Transfermarkt link (only fills missing data)
function enrichInternalWithTransfermarktLink(
  player: EnrichedPlayer,
  tmByLinkMap: Map<string, TransfermarktData>
): EnrichedPlayer {
  // Check if player has a Transfermarkt link
  const playerLink = player.Transfermkt
  if (!playerLink) return player

  // Normalize the player's link the same way
  const normalizedUrl = playerLink
    .toLowerCase()
    .replace('https://', '')
    .replace('http://', '')
    .replace('www.', '')
    .replace('transfermarkt.es', 'transfermarkt.com')
    .trim()

  const tm = tmByLinkMap.get(normalizedUrl)
  if (!tm) return player

  // Only fill in MISSING data - don't overwrite masDatos values
  const enriched = { ...player }

  // Image - only if missing
  if (!enriched.Imagen && tm.Imagen) {
    enriched.Imagen = tm.Imagen
  }

  // Representante - only if missing
  if (!enriched.Representante && tm.Representante) {
    enriched.Representante = tm.Representante
  }

  // Market value - only if missing
  if (enriched.marketValueRaw === 0 && tm['Valor de mercado']) {
    const marketValueRaw = parseMarketValue(tm['Valor de mercado'])
    if (marketValueRaw > 0) {
      enriched['Valor de mercado (Transfermarkt)'] = tm['Valor de mercado']
      enriched.marketValueRaw = marketValueRaw
      enriched.marketValueFormatted = formatMarketValue(marketValueRaw)
    }
  }

  // Contract - only if missing
  if (!enriched['Vencimiento contrato'] && tm['Fin de contrato']) {
    enriched['Vencimiento contrato'] = tm['Fin de contrato']
    const contractDate = parseContractDate(tm['Fin de contrato'])
    if (contractDate) {
      const now = new Date()
      const monthsRemaining = monthsBetween(now, contractDate)
      enriched.monthsRemaining = monthsRemaining
      enriched.contractStatus = monthsRemaining < 7 ? 'critical' : monthsRemaining < 13 ? 'warning' : 'ok'
    }
  }

  return enriched
}

function buildMasDatosMap(masDatos: MasDatosEntry[]): Map<string, MasDatosEntry> {
  const map = new Map<string, MasDatosEntry>()
  for (const entry of masDatos) {
    if (entry.Jugador) {
      // Key by player name (normalized) - primary key for interno matching
      const key = normalizeName(entry.Jugador)
      map.set(key, entry)
    }
  }
  return map
}

function enrichWithMasDatos(
  player: EnrichedPlayer,
  masDatosMap: Map<string, MasDatosEntry>
): EnrichedPlayer {
  // Match by normalized player name (masDatos "Jugador" column matches interno "Jugador")
  const nameKey = normalizeName(player.Jugador)
  const entry = masDatosMap.get(nameKey)

  if (!entry) return player

  // Build enriched player with ALL available data from masDatos
  const enriched = { ...player }

  // Always update Liga from masDatos (it has the correct current league)
  if (entry.Liga && entry.Liga.trim()) {
    enriched.Liga = entry.Liga
  }

  // Update Equipo if masDatos has it (current team)
  if (entry.Equipo && entry.Equipo.trim()) {
    enriched.Equipo = entry.Equipo
  }

  // Update market value
  if (entry['Valor de mercado']) {
    const marketValueRaw = parseMarketValue(entry['Valor de mercado'])
    if (marketValueRaw > 0) {
      enriched['Valor de mercado (Transfermarkt)'] = entry['Valor de mercado']
      enriched.marketValueRaw = marketValueRaw
      enriched.marketValueFormatted = formatMarketValue(marketValueRaw)
    }
  }

  // Update image
  if (entry.Imagen && entry.Imagen.trim()) {
    enriched.Imagen = entry.Imagen
  }

  // Update contract end date
  if (entry['Fecha fin de contrato'] && entry['Fecha fin de contrato'].trim()) {
    enriched['Vencimiento contrato'] = entry['Fecha fin de contrato']
    // Parse contract date for status
    const contractDate = parseContractDate(entry['Fecha fin de contrato'])
    if (contractDate) {
      const now = new Date()
      const monthsRemaining = monthsBetween(now, contractDate)
      enriched.monthsRemaining = monthsRemaining
      enriched.contractStatus = monthsRemaining < 7 ? 'critical' : monthsRemaining < 13 ? 'warning' : 'ok'
    }
  }

  // Update Transfermarkt link
  if (entry.Transfermkt && entry.Transfermkt.trim()) {
    enriched.Transfermkt = entry.Transfermkt
  }

  return enriched
}

// ─── MARKET VALUE ESTIMATION ─────────────────────────────────────────────────

// Argentina 1st Division - Team tiers for value estimation
const ARGENTINA_TIER_1 = ['river plate', 'boca juniors', 'racing club', 'independiente'] // Top clubs
const ARGENTINA_TIER_2 = ['san lorenzo', 'velez sarsfield', 'velez', 'estudiantes', 'talleres', 'talleres cordoba',
  'newell', 'newells', 'rosario central', 'belgrano'] // Big clubs
const ARGENTINA_TIER_3 = ['lanus', 'argentinos juniors', 'argentinos', 'union santa fe', 'union', 'defensa y justicia',
  'defensa', 'banfield', 'huracan', 'gimnasia la plata', 'gimnasia', 'godoy cruz', 'central cordoba'] // Mid clubs

// All Argentine teams for league detection (combine all tiers)
const ALL_ARGENTINA_TEAMS = [
  ...ARGENTINA_TIER_1, ...ARGENTINA_TIER_2, ...ARGENTINA_TIER_3,
  // Additional teams that might appear in interno data
  'colon', 'platense', 'tigre', 'sarmiento', 'instituto', 'barracas central',
  'central cordoba santiago', 'aldosivi', 'arsenal', 'patronato', 'atletico tucuman'
]

// Detect league type for a player
function getLeagueType(player: EnrichedPlayer): 'argentina1' | 'colombia' | 'other' {
  const league = normalizeName(player.Liga || '')

  if (league.includes('liga argentina') || league === 'liga argentina') {
    return 'argentina1'
  }

  if (league.includes('colombia') || league.includes('betplay') ||
      league.includes('dimayor') || league === '2° colombia' || league === '2 colombia') {
    return 'colombia'
  }

  // If Liga is unknown/desarrollo, try to detect from team name
  if (!league || league.includes('desarrollo') || league === 'sin datos') {
    const team = normalizeName(player.Equipo || '')
    // Check if team is a known Argentine club
    if (ALL_ARGENTINA_TEAMS.some(t => team.includes(t) || t.includes(team))) {
      return 'argentina1'
    }
  }

  return 'other'
}

// Get team tier multiplier for Argentine clubs
function getArgentinaTeamMultiplier(team: string): number {
  const normalizedTeam = normalizeName(team)

  if (ARGENTINA_TIER_1.some(t => normalizedTeam.includes(t))) return 1.5  // Top clubs get +50%
  if (ARGENTINA_TIER_2.some(t => normalizedTeam.includes(t))) return 1.25 // Big clubs get +25%
  if (ARGENTINA_TIER_3.some(t => normalizedTeam.includes(t))) return 1.1  // Mid clubs get +10%
  return 1.0 // Others
}

// Estimate market value based on analyzed patterns
function estimateMarketValue(player: EnrichedPlayer, leagueType: 'argentina1' | 'colombia'): number {
  const age = player.ageNum || 25
  const score = player.ggScore ?? 0
  const pos = normalizeName(player['Posición'] || '')

  // Different base values per league
  // Argentina 1st: Values range €250k - €10M based on analysis
  // Colombia 2nd: Values range €50k - €1M based on analysis
  const isArgentina = leagueType === 'argentina1'

  let baseValue: number

  // Score-based base value (Argentina values are ~4-5x higher than Colombia)
  if (isArgentina) {
    // Liga Argentina base values
    if (score >= 65) baseValue = 3_000_000      // Elite performers
    else if (score >= 55) baseValue = 1_800_000 // Very good
    else if (score >= 45) baseValue = 1_000_000 // Good
    else if (score >= 35) baseValue = 600_000   // Average
    else if (score > 0) baseValue = 350_000     // Below average
    else baseValue = 400_000                     // No score - use age
  } else {
    // Colombia 2nd division base values
    if (score >= 60) baseValue = 400_000
    else if (score >= 50) baseValue = 250_000
    else if (score >= 40) baseValue = 175_000
    else if (score >= 30) baseValue = 125_000
    else if (score > 0) baseValue = 75_000
    else baseValue = 100_000
  }

  // Age multiplier - young players are worth significantly more
  let ageMultiplier: number
  if (age <= 18) ageMultiplier = 2.8       // U18 premium
  else if (age <= 20) ageMultiplier = 2.2  // U21 high potential
  else if (age <= 22) ageMultiplier = 1.7  // Young with potential
  else if (age <= 24) ageMultiplier = 1.3  // Developing
  else if (age <= 26) ageMultiplier = 1.1  // Peak entry
  else if (age <= 28) ageMultiplier = 0.9  // Peak late
  else if (age <= 30) ageMultiplier = 0.6  // Declining
  else if (age <= 33) ageMultiplier = 0.35 // Veteran
  else ageMultiplier = 0.2                  // 34+

  // Position multiplier - attackers typically worth more
  let posMultiplier = 1.0
  if (pos.includes('delantero') || pos.includes('extremo')) {
    posMultiplier = 1.25
  } else if (pos.includes('mediapunta') || pos.includes('ofensivo') || pos.includes('interior')) {
    posMultiplier = 1.15
  } else if (pos.includes('mediocentro') || pos.includes('volante') || pos.includes('pivote')) {
    posMultiplier = 1.05
  } else if (pos.includes('lateral')) {
    posMultiplier = 0.95
  } else if (pos.includes('defensa') || pos.includes('central')) {
    posMultiplier = 0.9
  } else if (pos.includes('portero')) {
    posMultiplier = 0.8
  }

  // Team multiplier (only for Argentina)
  const teamMultiplier = isArgentina ? getArgentinaTeamMultiplier(player.Equipo) : 1.0

  // Calculate final value
  let finalValue = baseValue * ageMultiplier * posMultiplier * teamMultiplier

  // Round to nice numbers
  if (finalValue >= 1_000_000) {
    finalValue = Math.round(finalValue / 100_000) * 100_000 // €100k increments for millions
  } else if (finalValue >= 500_000) {
    finalValue = Math.round(finalValue / 50_000) * 50_000   // €50k increments
  } else {
    finalValue = Math.round(finalValue / 25_000) * 25_000   // €25k increments
  }

  // League-specific caps
  if (isArgentina) {
    return Math.max(150_000, Math.min(10_000_000, finalValue)) // €150k - €10M for Argentina
  } else {
    return Math.max(50_000, Math.min(1_000_000, finalValue))   // €50k - €1M for Colombia
  }
}

function enrichWithEstimatedValue(player: EnrichedPlayer): EnrichedPlayer {
  // Get league type (may detect from team name if Liga is desarrollo)
  const leagueType = getLeagueType(player)

  // Only estimate for Argentina 1st or Colombia
  if (leagueType === 'other') return player

  // Check if we need to fix Liga (was detected from team name, not from masDatos)
  const currentLiga = normalizeName(player.Liga || '')
  const needsLigaFix = !currentLiga || currentLiga.includes('desarrollo') || currentLiga === 'sin datos' || currentLiga === 'reserva'
  const detectedLiga = leagueType === 'argentina1' ? 'Liga Argentina' : 'Liga Colombia'

  // Only estimate if player has NO market value (don't override real TM values from masDatos)
  if (player.marketValueRaw === 0) {
    const estimatedValue = estimateMarketValue(player, leagueType)
    return {
      ...player,
      Liga: needsLigaFix ? detectedLiga : player.Liga,
      'Valor de mercado (Transfermarkt)': formatMarketValue(estimatedValue),
      marketValueRaw: estimatedValue,
      marketValueFormatted: formatMarketValue(estimatedValue),
    }
  }

  // Player has market value - only fix Liga if needed
  if (needsLigaFix) {
    return { ...player, Liga: detectedLiga }
  }

  return player
}

function enrichWithTransfermarkt(
  player: EnrichedPlayer,
  tmMap: Map<string, TransfermarktData>
): EnrichedPlayer {
  const key = normalizeName(player.Jugador)
  const tm = tmMap.get(key)

  if (!tm) return player

  // Get updated values from Transfermarkt
  const newMarketValueStr = tm['Valor de mercado'] || player['Valor de mercado (Transfermarkt)']
  const newContractStr = tm['Fin de contrato'] || player['Vencimiento contrato']

  // Recalculate derived values
  const marketValueRaw = parseMarketValue(newMarketValueStr)
  const marketValueFormatted = formatMarketValue(marketValueRaw)

  const contractDate = parseContractDate(newContractStr)
  const now = new Date()
  const monthsRemaining = contractDate ? monthsBetween(now, contractDate) : null
  const contractStatus: 'ok' | 'warning' | 'critical' =
    monthsRemaining === null ? 'ok'
    : monthsRemaining < 7 ? 'critical'
    : monthsRemaining < 13 ? 'warning'
    : 'ok'

  return {
    ...player,
    // Override with Transfermarkt data
    'Valor de mercado (Transfermarkt)': newMarketValueStr,
    'Vencimiento contrato': newContractStr,
    Transfermkt: tm.Transfermkt || player.Transfermkt,
    Representante: tm.Representante || '',
    Imagen: tm.Imagen || '',
    // Recalculated derived values
    marketValueRaw,
    marketValueFormatted,
    monthsRemaining,
    contractStatus,
  }
}

// Normalize name for matching: removes dots, extra spaces, accents, lowercase
function normalizeForMatching(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/\./g, '') // Remove dots (C. Haydar -> C Haydar)
    .replace(/\s+/g, ' ') // Multiple spaces to single space
}

// Extract last name from abbreviated names like "C. Haydar" or "Juan Pérez"
function extractLastName(name: string): string {
  const parts = name.trim().split(/\s+/)
  // If format is "X. LastName", return LastName
  if (parts.length >= 2 && parts[0].length <= 2) {
    return normalizeForMatching(parts[parts.length - 1])
  }
  // Otherwise return last word
  return normalizeForMatching(parts[parts.length - 1])
}

// Extract initial from abbreviated names like "C. Haydar"
function extractInitial(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 1) {
    return parts[0].replace('.', '').toLowerCase()[0] || ''
  }
  return ''
}

// STRICT age validation - monitoring players should all be ≤24 years old
// Returns true ONLY if ages are compatible
function isAgeCompatible(monitoringAge: number, externalAge: number): boolean {
  // If monitoring age is unknown, external player MUST be ≤24
  if (isNaN(monitoringAge)) {
    return externalAge <= 24
  }
  // If monitoring age is known, must match exactly or be within 1 year
  return Math.abs(monitoringAge - externalAge) <= 1
}

// Helper to extract last name from player name
function getLastName(name: string): string {
  const parts = name.trim().split(/\s+/)
  return normalizeForMatching(parts[parts.length - 1])
}

// Helper to extract initial from player name (handles "J. Doe" or "Juan Doe")
function getInitial(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts[0].replace('.', '').toLowerCase()[0] || ''
}

// Normalize team name for comparison
function normalizeTeam(team: string): string {
  return (team || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/fc|cf|club|deportivo|deportes|atletico|real|cd|sc|ec|ac/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Check if two team names are similar
function teamsMatch(team1: string, team2: string): boolean {
  const t1 = normalizeTeam(team1)
  const t2 = normalizeTeam(team2)
  if (!t1 || !t2) return false
  // Exact match after normalization
  if (t1 === t2) return true
  // One contains the other
  if (t1.includes(t2) || t2.includes(t1)) return true
  // Check individual words
  const words1 = t1.split(' ').filter(w => w.length > 2)
  const words2 = t2.split(' ').filter(w => w.length > 2)
  return words1.some(w => words2.includes(w))
}

function linkMonitoringToMetrics(
  monitoring: MonitoringPlayer[],
  seguimientoMetrics: SeguimientoMetricsPlayer[],
  allPlayersForScoring: EnrichedPlayer[],  // Combined external + internal for consistent scoring
  internalOnly: EnrichedPlayer[],  // Internal only for comparison averages
  tmMap: Map<string, TransfermarktData>
): MonitoringPlayer[] {
  // Build lookup map for existing players (external + internal) to reuse their scores
  const existingPlayersByName = new Map<string, EnrichedPlayer>()
  const existingPlayersByLastName = new Map<string, EnrichedPlayer[]>()

  for (const p of allPlayersForScoring) {
    const exactKey = normalizeForMatching(p.Jugador)
    existingPlayersByName.set(exactKey, p)

    const lastName = getLastName(p.Jugador)
    if (lastName) {
      if (!existingPlayersByLastName.has(lastName)) {
        existingPlayersByLastName.set(lastName, [])
      }
      existingPlayersByLastName.get(lastName)!.push(p)
    }
  }

  // Build multiple lookup maps for seguimiento metrics
  const metricsByExactName = new Map<string, SeguimientoMetricsPlayer>()
  const metricsByLastName = new Map<string, SeguimientoMetricsPlayer[]>()
  const metricsByInitialAndLastName = new Map<string, SeguimientoMetricsPlayer[]>()

  for (const p of seguimientoMetrics) {
    const jugador = p.Jugador?.trim()
    if (!jugador) continue

    // Exact name match
    const exactKey = normalizeForMatching(jugador)
    metricsByExactName.set(exactKey, p)

    // Last name lookup
    const lastName = getLastName(jugador)
    if (lastName) {
      if (!metricsByLastName.has(lastName)) {
        metricsByLastName.set(lastName, [])
      }
      metricsByLastName.get(lastName)!.push(p)

      // Initial + last name (can have multiple with same initial+lastName)
      const initial = getInitial(jugador)
      const initialLastKey = `${initial}|${lastName}`
      if (!metricsByInitialAndLastName.has(initialLastKey)) {
        metricsByInitialAndLastName.set(initialLastKey, [])
      }
      metricsByInitialAndLastName.get(initialLastKey)!.push(p)
    }
  }

  return monitoring.map(m => {
    const playerKey = m.Jugador?.trim()
    if (!playerKey) return m

    let metricsPlayer: SeguimientoMetricsPlayer | undefined

    // Strategy 1: Exact name match
    const exactKey = normalizeForMatching(playerKey)
    metricsPlayer = metricsByExactName.get(exactKey)

    // Strategy 2: Initial + last name with team disambiguation
    if (!metricsPlayer) {
      const initial = getInitial(playerKey)
      const lastName = getLastName(playerKey)
      const initialLastKey = `${initial}|${lastName}`
      const candidates = metricsByInitialAndLastName.get(initialLastKey) || []

      if (candidates.length === 1) {
        metricsPlayer = candidates[0]
      } else if (candidates.length > 1 && m.Club) {
        // Try to match by team
        const teamMatch = candidates.find(c => teamsMatch(c.Equipo, m.Club))
        if (teamMatch) {
          metricsPlayer = teamMatch
        } else {
          // Try matching by age
          const monAge = parseInt(m.Edad, 10)
          if (!isNaN(monAge)) {
            const ageMatch = candidates.find(c => {
              const metAge = parseInt(c.Edad, 10)
              return !isNaN(metAge) && Math.abs(metAge - monAge) <= 1
            })
            if (ageMatch) metricsPlayer = ageMatch
          }
        }
      }
    }

    // Strategy 3: Last name only with team/age disambiguation
    if (!metricsPlayer) {
      const lastName = getLastName(playerKey)
      const candidates = metricsByLastName.get(lastName) || []

      if (candidates.length === 1) {
        metricsPlayer = candidates[0]
      } else if (candidates.length > 1) {
        // Try team match
        if (m.Club) {
          const teamMatch = candidates.find(c => teamsMatch(c.Equipo, m.Club))
          if (teamMatch) {
            metricsPlayer = teamMatch
          }
        }
        // Try age match if still not found
        if (!metricsPlayer) {
          const monAge = parseInt(m.Edad, 10)
          if (!isNaN(monAge)) {
            const ageMatches = candidates.filter(c => {
              const metAge = parseInt(c.Edad, 10)
              return !isNaN(metAge) && Math.abs(metAge - monAge) <= 1
            })
            if (ageMatches.length === 1) {
              metricsPlayer = ageMatches[0]
            }
          }
        }
      }
    }

    // Strategy 4: Try full name from "Nombre jugador" field
    if (!metricsPlayer && m['Nombre jugador']) {
      const fullNameKey = normalizeForMatching(m['Nombre jugador'])
      metricsPlayer = metricsByExactName.get(fullNameKey)

      // Also try last name from full name
      if (!metricsPlayer) {
        const fullLastName = getLastName(m['Nombre jugador'])
        const candidates = metricsByLastName.get(fullLastName) || []
        if (candidates.length === 1) {
          metricsPlayer = candidates[0]
        } else if (candidates.length > 1 && m.Club) {
          const teamMatch = candidates.find(c => teamsMatch(c.Equipo, m.Club))
          if (teamMatch) metricsPlayer = teamMatch
        }
      }
    }

    if (!metricsPlayer) {
      // No metrics data found - return with flag
      return { ...m, hasEnoughData: false }
    }

    // FIRST: Check if this player already exists in external/internal data
    // If so, use their existing score for consistency
    let existingPlayer: EnrichedPlayer | undefined

    // Try exact name match
    const exactNameKey = normalizeForMatching(metricsPlayer.Jugador)
    existingPlayer = existingPlayersByName.get(exactNameKey)

    // Try matching by last name + team
    if (!existingPlayer) {
      const lastName = getLastName(metricsPlayer.Jugador)
      const candidates = existingPlayersByLastName.get(lastName) || []
      if (candidates.length === 1) {
        existingPlayer = candidates[0]
      } else if (candidates.length > 1 && metricsPlayer.Equipo) {
        existingPlayer = candidates.find(c => teamsMatch(c.Equipo, metricsPlayer.Equipo))
      }
    }

    // If player exists in external/internal, use their score directly
    if (existingPlayer && existingPlayer.ggScore !== null) {
      const avgInternalScore = getInternalAverageByPosition(internalOnly, m['Posición'])
      const scoreDiff = existingPlayer.ggScore !== null && avgInternalScore !== null
        ? Math.round((existingPlayer.ggScore - avgInternalScore) * 10) / 10
        : null

      return {
        ...m,
        ggScore: existingPlayer.ggScore,
        hasEnoughData: true,
        metricsPlayer: existingPlayer,
        opportunityScore: calculateOpportunityScore(existingPlayer.ggScore, existingPlayer.marketValueRaw),
        marketValueRaw: existingPlayer.marketValueRaw,
        marketValueFormatted: existingPlayer.marketValueFormatted,
        monthsRemaining: existingPlayer.monthsRemaining,
        contractStatus: existingPlayer.contractStatus,
        avgInternalScore,
        scoreDiff,
        Transfermkt: existingPlayer.Transfermkt || m.Transfermkt,
      }
    }

    // Player not found in external/internal - calculate score from seguimiento metrics
    const { score, hasEnoughData, enrichedPlayer } = scoreSeguimientoPlayer(
      metricsPlayer,
      allPlayersForScoring
    )

    // Get market value from metrics or Transfermarkt
    let marketValueRaw = parseMarketValue(metricsPlayer['Valor de mercado'] ?? '')
    let marketValueFormatted = formatMarketValue(marketValueRaw)
    let monthsRemaining: number | null = null
    let contractStatus: 'ok' | 'warning' | 'critical' = 'ok'

    // Try to get TM data from the link
    const tmLink = metricsPlayer.Transfermkt || m.Transfermkt || m['Ficha técnica']
    if (tmLink) {
      const normalizedUrl = tmLink
        .toLowerCase()
        .replace('https://', '')
        .replace('http://', '')
        .replace('www.', '')
        .replace('transfermarkt.es', 'transfermarkt.com')
        .trim()

      // Find TM entry by URL
      for (const [, tm] of tmMap) {
        const tmUrl = (tm.Transfermkt || '')
          .toLowerCase()
          .replace('https://', '')
          .replace('http://', '')
          .replace('www.', '')
          .replace('transfermarkt.es', 'transfermarkt.com')
          .trim()

        if (tmUrl === normalizedUrl) {
          const tmValue = parseMarketValue(tm['Valor de mercado'] || '')
          if (tmValue > 0) {
            marketValueRaw = tmValue
            marketValueFormatted = formatMarketValue(tmValue)
          }
          const contractDate = parseContractDate(tm['Fin de contrato'] || '')
          if (contractDate) {
            monthsRemaining = monthsBetween(new Date(), contractDate)
            contractStatus = monthsRemaining < 7 ? 'critical' : monthsRemaining < 13 ? 'warning' : 'ok'
          }
          break
        }
      }
    }

    // Calculate opportunity score
    const opportunityScore = calculateOpportunityScore(score, marketValueRaw)

    // Calculate internal average and difference
    const avgInternalScore = getInternalAverageByPosition(internalOnly, m['Posición'])
    const scoreDiff = score !== null && avgInternalScore !== null
      ? Math.round((score - avgInternalScore) * 10) / 10
      : null

    return {
      ...m,
      ggScore: score,
      hasEnoughData,
      metricsPlayer: enrichedPlayer,
      opportunityScore,
      marketValueRaw,
      marketValueFormatted,
      monthsRemaining,
      contractStatus,
      avgInternalScore,
      scoreDiff,
      Transfermkt: tmLink || m.Transfermkt,
    }
  })
}

// Legacy function for backward compatibility
function linkMonitoringToExternal(
  monitoring: MonitoringPlayer[],
  external: EnrichedPlayer[]
): MonitoringPlayer[] {
  const externalByExactName = new Map<string, EnrichedPlayer[]>()

  for (const p of external) {
    const exactKey = normalizeForMatching(p.Jugador)
    if (!externalByExactName.has(exactKey)) {
      externalByExactName.set(exactKey, [])
    }
    externalByExactName.get(exactKey)!.push(p)
  }

  return monitoring.map(m => {
    const playerKey = m.Jugador?.trim()
    if (!playerKey) return m

    const exactKey = normalizeForMatching(playerKey)
    const monitoringAge = parseInt(m.Edad, 10)
    const candidates = externalByExactName.get(exactKey) || []

    if (candidates.length === 0) return m

    const validCandidates = candidates.filter(p =>
      isAgeCompatible(monitoringAge, p.ageNum)
    )

    if (validCandidates.length === 0) return m

    if (validCandidates.length === 1) {
      const extPlayer = validCandidates[0]
      return {
        ...m,
        ggScore: extPlayer.ggScore,
        externalPlayer: extPlayer,
      }
    }

    const teamKey = normalizeForMatching(m.Club || '')
    if (teamKey) {
      const teamMatch = validCandidates.find(p => {
        const extTeam = normalizeForMatching(p.Equipo)
        return extTeam.includes(teamKey) || teamKey.includes(extTeam)
      })
      if (teamMatch) {
        return {
          ...m,
          ggScore: teamMatch.ggScore,
          externalPlayer: teamMatch,
        }
      }
    }

    return m
  })
}

// ─── SEGUIMIENTO METRICS SCORING ─────────────────────────────────────────────

// Minimum metrics required for reliable scoring
const MIN_METRICS_FOR_SCORE = 5

// Get position from player - checks both 'Posición específica' and 'Posición'
function getPlayerPosition(player: SeguimientoMetricsPlayer): string {
  // Wyscout uses 'Posición específica' with codes like RCB, LB, CF
  // Sometimes multiple positions are listed: "RCB , LCB" - take the first one
  const posEspecifica = player['Posición específica']?.trim()
  if (posEspecifica) {
    // Split by comma and try each position
    const positions = posEspecifica.split(',').map(p => p.trim())
    for (const pos of positions) {
      if (POSITION_MAP[pos]) {
        return pos
      }
    }
  }
  // Fallback to regular position
  const posGeneral = player['Posición']?.trim() ?? ''
  if (POSITION_MAP[posGeneral]) {
    return posGeneral
  }
  return posGeneral
}

function hasEnoughMetrics(player: SeguimientoMetricsPlayer): boolean {
  const minutesPlayed = parseInt(player['Minutos jugados'] ?? '0', 10)
  if (minutesPlayed < 200) return false  // Need at least 200 minutes

  // Count how many scoring metrics have data
  const rawPos = getPlayerPosition(player)
  const posKey = POSITION_MAP[rawPos] ?? ''
  const config = SCORING_CONFIG[posKey]
  if (!config) return false

  let metricsWithData = 0
  for (const { column } of config) {
    const val = getNumericValue(player as Record<string, string>, column)
    if (val > 0) metricsWithData++
  }

  return metricsWithData >= MIN_METRICS_FOR_SCORE
}

function scoreSeguimientoPlayer(
  player: SeguimientoMetricsPlayer,
  allPlayersForNormalization: EnrichedPlayer[]  // Use ALL players (external+internal) for consistent scoring
): { score: number | null; hasEnoughData: boolean; enrichedPlayer: EnrichedPlayer | null } {
  const hasData = hasEnoughMetrics(player)

  if (!hasData) {
    return { score: null, hasEnoughData: false, enrichedPlayer: null }
  }

  const rawPos = getPlayerPosition(player)
  const posKey = POSITION_MAP[rawPos] ?? ''
  const config = SCORING_CONFIG[posKey]

  if (!config) {
    return { score: null, hasEnoughData: false, enrichedPlayer: null }
  }

  // Get all players in same position from the GLOBAL pool (external + internal)
  // This ensures consistent scoring across ALL sources
  const positionPlayers = allPlayersForNormalization.filter(p => {
    const pk = POSITION_MAP[p['Posición']?.trim() ?? ''] ?? POSITION_MAP[p['Posición específica']?.trim() ?? ''] ?? ''
    return pk === posKey && p.minutesPlayed >= 300
  })

  // Compute min/max for each metric from the global pool
  const stats = new Map<string, { min: number; max: number }>()
  for (const { column } of config) {
    const values = positionPlayers.map(p => {
      const val = p[column]
      return typeof val === 'number' ? val : parseFloat(String(val ?? '').replace(',', '.')) || 0
    })
    const validValues = values.filter(v => v > 0)
    if (validValues.length > 0) {
      stats.set(column, { min: Math.min(...validValues), max: Math.max(...validValues) })
    } else {
      stats.set(column, { min: 0, max: 1 })
    }
  }

  // Calculate score
  let score = 0
  for (const { column, weight } of config) {
    const raw = getNumericValue(player as Record<string, string>, column)
    const { min, max } = stats.get(column) ?? { min: 0, max: 1 }
    const normalized = max > min ? ((raw - min) / (max - min)) * 100 : 50
    score += normalized * (weight / 100)
  }

  const finalScore = Math.round(score * 10) / 10

  // Create enriched player object
  const rawValue = player['Valor de mercado'] ?? ''
  const marketValueRaw = parseMarketValue(rawValue)
  const contractDate = parseContractDate(player['Vencimiento contrato'] ?? '')
  const now = new Date()
  const monthsRemaining = contractDate ? monthsBetween(now, contractDate) : null

  // Spread raw data first, then override with processed values
  const enrichedPlayer: EnrichedPlayer = {
    // Spread all raw columns first
    ...player as unknown as Record<string, string>,
    // Then override with required fields
    Jugador: player.Jugador,
    Liga: player.Liga,
    Equipo: player.Equipo,
    'Posición': player['Posición'],
    Edad: player.Edad,
    'País de nacimiento': player['País de nacimiento'] ?? '',
    Pie: player['Pie'] ?? '',
    Altura: player['Altura'] ?? '',
    'Valor de mercado (Transfermarkt)': rawValue,
    'Vencimiento contrato': player['Vencimiento contrato'] ?? '',
    'Partidos jugados': player['Partidos jugados'] ?? '',
    'Minutos jugados': player['Minutos jugados'] ?? '',
    Goles: player['Goles'] ?? '',
    xG: player['xG'] ?? '',
    Asistencias: player['Asistencias'] ?? '',
    xA: player['xA'] ?? '',
    'Posición específica': player['Posición específica'] ?? player['Posición'],
    id: '',
    Transfermkt: player.Transfermkt ?? '',
    Representante: player['Representante'] ?? '',
    Imagen: player['Imagen'] ?? '',
    ggScore: finalScore,
    ggScorePercentile: null,
    source: 'externo',
    contractStatus: monthsRemaining === null ? 'ok' : monthsRemaining < 7 ? 'critical' : monthsRemaining < 13 ? 'warning' : 'ok',
    monthsRemaining,
    marketValueFormatted: formatMarketValue(marketValueRaw),
    marketValueRaw,
    minutesPlayed: parseInt(player['Minutos jugados'] ?? '0', 10),
    ageNum: parseInt(player.Edad ?? '0', 10) || 0,
  }

  return { score: finalScore, hasEnoughData: true, enrichedPlayer }
}

// Calculate opportunity score (score / market value ratio, higher = better opportunity)
function calculateOpportunityScore(ggScore: number | null, marketValue: number): number | null {
  if (ggScore === null || marketValue <= 0) return null
  // Normalize: score per €100k of market value
  return Math.round((ggScore / (marketValue / 100000)) * 10) / 10
}

// Calculate average internal score by position
function getInternalAverageByPosition(
  internal: EnrichedPlayer[],
  position: string
): number | null {
  const posKey = POSITION_MAP[position?.trim() ?? ''] ?? ''
  if (!posKey) return null

  const positionPlayers = internal.filter(p => {
    const pk = POSITION_MAP[p['Posición']?.trim() ?? ''] ?? ''
    return pk === posKey && p.ggScore !== null
  })

  if (positionPlayers.length === 0) return null

  const sum = positionPlayers.reduce((acc, p) => acc + (p.ggScore ?? 0), 0)
  return Math.round((sum / positionPlayers.length) * 10) / 10
}

function matchPlayerToJugadorSK(
  player: EnrichedPlayer,
  evolution: EvolutionEntry[]
): string | null {
  // Build a map of normalized full-name → JugadorSK from evolution data
  const uniquePlayers = new Map<string, string>()
  for (const e of evolution) {
    if (e.JugadorNombre && e.JugadorSK) {
      uniquePlayers.set(normalizeName(e.JugadorNombre), e.JugadorSK)
    }
  }

  // Try exact abbreviated match: "J. Paradela" → first initial + last name
  const parts = player.Jugador.trim().split(/\s+/)
  if (parts.length >= 2) {
    const initial = parts[0].replace('.', '').toLowerCase()
    const lastName = normalizeName(parts[parts.length - 1])

    for (const [fullName, sk] of uniquePlayers) {
      const fullParts = fullName.split(/\s+/)
      const fullInitial = fullParts[0]?.[0] ?? ''
      const fullLast = fullParts[fullParts.length - 1] ?? ''
      if (fullInitial === initial[0] && fullLast === lastName) {
        return sk
      }
    }
  }

  // Fallback: try to match by last name only
  const lastName = normalizeName(parts[parts.length - 1])
  for (const [fullName, sk] of uniquePlayers) {
    const fullParts = fullName.split(/\s+/)
    if (normalizeName(fullParts[fullParts.length - 1]) === lastName) {
      return sk
    }
  }

  return null
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>({
    external: [],
    internal: [],
    monitoring: [],
    normalized: [],
    evolution: [],
    subjectiveMetrics: [],
    marketValueHistory: [],
    gpsData: [],
    positionAverages: {},
    agencyPlayers: [],
    refreshAgencyPlayers: async () => {},
    loading: true,
    error: null,
    lastUpdated: null,
  })

  // Base internal (derivada del CSV) y external, para re-derivar internal al cambiar Doble G
  const baseInternalRef = useRef<EnrichedPlayer[]>([])
  const externalRef = useRef<EnrichedPlayer[]>([])

  const refreshAgencyPlayers = useCallback(async () => {
    await loadAgencyPlayers()
    const agencyPlayers = getAgencyPlayersList()
    setData(prev => ({
      ...prev,
      agencyPlayers,
      internal: mergeAgencyIntoInternal(baseInternalRef.current, externalRef.current, agencyPlayers),
    }))
  }, [])

  useEffect(() => {
    let cancelled = false

    loadAllData()
      .then(async raw => {
        if (cancelled) return

        // Cargar overlay Doble G (altas/bajas) antes de derivar internal
        await loadAgencyPlayers()
        if (cancelled) return

        // Build lookup maps
        const tmMap = buildTransfermarktMap(raw.transfermarkt)
        const tmByLinkMap = buildTransfermarktByLinkMap(raw.transfermarkt)
        const masDatosMap = buildMasDatosMap(raw.masDatos)

        // Compute scores using ALL players as baseline (internal + external together)
        // This ensures consistent scoring and percentiles across both sources
        const allPlayers = [...raw.external, ...raw.internal]
        const allScored = computeGGScores(allPlayers, 'externo') // source is overwritten below

        // Split back into external and internal, preserving scores AND percentiles
        const scoreMap = new Map(allScored.map(p => [p.Jugador + '|' + p.Equipo, p.ggScore]))
        const percentileMap = new Map(allScored.map(p => [p.Jugador + '|' + p.Equipo, p.ggScorePercentile]))

        // Score and enrich external players with Transfermarkt data + Más Datos + Estimated values
        const externalScored = computeGGScores(raw.external, 'externo', scoreMap, percentileMap)
        const external = externalScored.map(p =>
          enrichWithEstimatedValue(enrichWithMasDatos(enrichWithTransfermarkt(p, tmMap), masDatosMap))
        )

        const internalScored = computeGGScores(raw.internal, 'interno', scoreMap, percentileMap)

        // Enrich internal players with:
        // 1. Transfermarkt data using their TM link (valor de mercado, contrato, imagen)
        // 2. JugadorSK for linking to evolution/metrics
        // 3. Más Datos fallback
        // 4. Estimated value if still missing
        const internal: EnrichedPlayer[] = internalScored.map(p => {
          const jsk = matchPlayerToJugadorSK(p, raw.evolution)
          // If interno already has value and liga, use them directly (no enrichment needed)
          // Only enrich if data is missing
          let enriched = p
          if (p.marketValueRaw === 0 || !p.Liga || p.Liga.toLowerCase().includes('desarrollo')) {
            // Try MasDatos for missing data
            enriched = enrichWithMasDatos(p, masDatosMap)
          }
          if (enriched.marketValueRaw === 0) {
            // Try Transfermarkt link
            enriched = enrichInternalWithTransfermarktLink(enriched, tmByLinkMap)
          }
          if (enriched.marketValueRaw === 0) {
            // Estimate only if still no value
            enriched = enrichWithEstimatedValue(enriched)
          }
          // Add jugadorSK
          return { ...enriched, jugadorSK: jsk ?? '' }
        })

        const monitoring: never[] = []

        // Compute position averages for relative score coloring
        const positionGroups: Record<string, number[]> = {}
        for (const p of [...external, ...internal]) {
          if (p.ggScore === null) continue
          const rawPos = p['Posición'] || ''
          const normPos = FILTER_POSITION_MAP[rawPos] ?? ''
          if (!normPos) continue
          if (!positionGroups[normPos]) positionGroups[normPos] = []
          positionGroups[normPos].push(p.ggScore)
        }
        const positionAverages: Record<string, number> = {}
        for (const [pos, scores] of Object.entries(positionGroups)) {
          positionAverages[pos] = scores.reduce((a, b) => a + b, 0) / scores.length
        }

        // Guardar base para re-derivar internal al cambiar Doble G, y fusionar agregados
        baseInternalRef.current = internal
        externalRef.current = external
        const agencyPlayers = getAgencyPlayersList()
        const internalMerged = mergeAgencyIntoInternal(internal, external, agencyPlayers)

        setData({
          external,
          internal: internalMerged,
          monitoring,
          normalized: raw.normalized,
          evolution: raw.evolution,
          subjectiveMetrics: raw.subjectiveMetrics,
          marketValueHistory: raw.marketValueHistory,
          gpsData: raw.gpsData,
          positionAverages,
          agencyPlayers,
          refreshAgencyPlayers,
          loading: false,
          error: null,
          lastUpdated: new Date(),
        })
      })
      .catch(err => {
        if (cancelled) return
        console.error('Error loading data:', err)
        setData(prev => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : 'Error desconocido al cargar los datos',
        }))
      })

    return () => { cancelled = true }
  }, [])

  return (
    <DataContext.Provider value={data}>
      {children}
    </DataContext.Provider>
  )
}

export function useData(): AppData {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
