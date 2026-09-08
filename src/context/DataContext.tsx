import { createContext, useContext, useEffect, useRef, useCallback, useMemo, useState, type ReactNode } from 'react'
import { loadAllData, type MasDatosEntry, type SeguimientoMetricsPlayer } from '@/services/csvService'
import { applyRating, normalizeName, parseMarketValue, formatMarketValue, parseContractDate, monthsBetween, getNumericValue } from '@/utils/scoring'
import { POSITION_MAP, SCORING_CONFIG, FILTER_POSITION_MAP } from '@/constants/scoring'
import { loadAgencyPlayers } from '@/services/agencyPlayersService'
import { getAgencyPlayersList, AGENCY_OVERRIDES, type AgencyPlayer } from '@/constants/agencyPlayers'
import { fetchAllPlayerVideos, computePlayerFreshness } from '@/services/playerVideosService'
import { fetchScoreLookup, fetchAgencyLiveData, type ScoreLookupEntry, type AgencyLiveDataRow } from '@/services/playerStatsService'
import { fetchGpsEntries, fetchGpsCatalog, toLegacyGpsEntry } from '@/services/gpsService'
import { listManualExternalPlayers, createManualExternalPlayer, type ManualExternalPlayerRow } from '@/services/manualExternalPlayersService'
import { manualExternalToEnriched } from '@/features/coaches/manualExternalPlayer'
import type { GpsEntryRow, GpsMetric } from '@/features/gps/types'
import type { PlayerVideo, VideoFreshness } from '@/types/videos'
import { nameKey } from '@/utils/nameUtils'
import type { AppData, EnrichedPlayer, EvolutionEntry, TransfermarktData, MonitoringPlayer, MarketValueHistoryEntry, GPSEntry } from '@/types'

const DataContext = createContext<AppData | null>(null)

/** Edad en años a partir de una fecha 'YYYY-MM-DD'. 0 si no hay dato o es inválida. */
function ageFromBirthDate(birthDate: string | null | undefined): number {
  if (!birthDate) return 0
  const d = new Date(birthDate)
  if (Number.isNaN(d.getTime())) return 0
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const monthDiff = now.getMonth() - d.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < d.getDate())) age--
  return age
}

// Construye un EnrichedPlayer mínimo a partir de un AgencyPlayer (cuando no está en external)
function agencyToEnriched(a: AgencyPlayer): EnrichedPlayer {
  const marketValueRaw = parseMarketValue(a.marketValue ?? '')
  const ageNum = ageFromBirthDate(a.birthDate)
  const position = a.position ? (POSITION_MAP[a.position] ?? a.position) : ''
  return {
    Jugador: a.fullName,
    Liga: '',
    Equipo: a.team,
    'Posición': position,
    Edad: ageNum ? String(ageNum) : '',
    'País de nacimiento': '',
    Pie: '', Altura: '',
    'Valor de mercado (Transfermarkt)': a.marketValue ?? '',
    'Vencimiento contrato': a.contractEnd ?? '',
    'Partidos jugados': '', 'Minutos jugados': '',
    Goles: '', xG: '', Asistencias: '', xA: '',
    'Posición específica': position,
    id: '',
    Transfermkt: '',
    Representante: '',
    Imagen: a.image ?? '',
    rating: null,
    ratingPercentile: null,
    source: 'interno',
    contractStatus: 'ok',
    monthsRemaining: null,
    marketValueRaw,
    minutesPlayed: 0,
    ageNum,
  }
}

/**
 * Clave de identidad tolerante al formato del nombre (sin acentos).
 * Reconcilia "A. Steimbach" (formato corto del sheet) con "Alexis Steimbach"
 * (nombre completo de la lista Doble G) → ambos dan "a:steimbach".
 */
export function identityKey(name: string): string {
  return nameKey(name.normalize('NFD').replace(/[̀-ͯ]/g, ''))
}

/** internal base + jugadores Doble G agregados que no estén ya en internal. */
export function mergeAgencyIntoInternal(
  baseInternal: EnrichedPlayer[],
  external: EnrichedPlayer[],
  agencyPlayers: AgencyPlayer[],
): EnrichedPlayer[] {
  // "Interno" es el roster vigente de la agencia (37 filas del CSV, una por jugador
  // representado): si alguien deja de representarlo (p. ej. Marcos Enrique, Álvaro
  // López), su fila vieja no debe seguir apareciendo sólo porque nadie la borró del
  // Sheet a mano. Sin roster todavía cargado (arranque en frío) no se filtra nada,
  // para no vaciar la lista por una carrera con `loadAgencyPlayers()`.
  const agencyKeys = new Set<string>()
  for (const a of agencyPlayers) {
    agencyKeys.add(identityKey(a.fullName))
    agencyKeys.add(identityKey(a.shortName))
  }
  const currentBase = agencyKeys.size > 0
    ? baseInternal.filter(p => agencyKeys.has(identityKey(p.Jugador)))
    : baseInternal

  // Presencia por nombre exacto Y por clave inicial:apellido, para no re-agregar
  // a un jugador que ya está bajo otro formato de nombre (causa de duplicados).
  const present = new Set<string>()
  for (const p of currentBase) {
    present.add(normalizeName(p.Jugador))
    present.add(identityKey(p.Jugador))
  }
  const extByExact = new Map(external.map(p => [normalizeName(p.Jugador), p]))
  const extByKey = new Map<string, EnrichedPlayer>()
  for (const p of external) {
    const k = identityKey(p.Jugador)
    if (!extByKey.has(k)) extByKey.set(k, p)
  }
  const additions: EnrichedPlayer[] = []
  for (const a of agencyPlayers) {
    const exact = normalizeName(a.fullName)
    const keyFull = identityKey(a.fullName)
    const keyShort = identityKey(a.shortName)
    if (present.has(exact) || present.has(keyFull) || present.has(keyShort)) continue
    const fromExternal = extByExact.get(exact) ?? extByKey.get(keyFull) ?? extByKey.get(keyShort)
    additions.push(fromExternal ? { ...fromExternal, source: 'interno' } : agencyToEnriched(a))
    present.add(exact)
    present.add(keyFull)
  }
  return applyAgencyOverrides([...currentBase, ...additions], agencyPlayers)
}

/**
 * Pisa Equipo y Vencimiento contrato con lo que dice `agencyPlayers` (curado a mano)
 * más las correcciones puntuales de AGENCY_OVERRIDES. Necesario para todo jugador que
 * ya tenía una fila en el CSV (interno) antes de fichar por la agencia: sin esto, el
 * merge lo salta por completo (`present.has` ya da true) y el club/contrato del CSV
 * legacy — que nadie actualiza — queda pisando al dato real para siempre.
 */
function applyAgencyOverrides(players: EnrichedPlayer[], agencyPlayers: AgencyPlayer[]): EnrichedPlayer[] {
  const byKey = new Map<string, { fullName?: string; team?: string; contractEnd?: string; position?: string }>()
  for (const a of agencyPlayers) {
    const patch = {
      fullName: a.fullName,
      team: a.team || undefined,
      contractEnd: a.contractEnd ?? undefined,
      position: a.position ?? undefined,
    }
    byKey.set(identityKey(a.fullName), patch)
    byKey.set(identityKey(a.shortName), patch)
  }
  for (const o of AGENCY_OVERRIDES) {
    byKey.set(identityKey(o.name), { ...byKey.get(identityKey(o.name)), ...o })
  }
  if (byKey.size === 0) return players

  return players.map(p => {
    const o = byKey.get(identityKey(p.Jugador))
    if (!o) return p
    const patched = { ...p }
    // Algunas filas viejas del CSV interno quedaron con el nombre corto tipo
    // "J. Palacios" como `Jugador` en vez del nombre completo — eso rompe cualquier
    // navegación/lookup que use el nombre completo de agencyPlayers (ej. Home).
    if (o.fullName && o.fullName !== p.Jugador) patched.Jugador = o.fullName
    if (o.team) patched.Equipo = o.team
    if (o.position) {
      const position = POSITION_MAP[o.position] ?? o.position
      patched['Posición'] = position
      patched['Posición específica'] = position
    }
    if (o.contractEnd) {
      patched['Vencimiento contrato'] = o.contractEnd
      const d = parseContractDate(o.contractEnd)
      if (d) {
        const mr = monthsBetween(new Date(), d)
        patched.monthsRemaining = mr
        patched.contractStatus = mr < 7 ? 'critical' : mr < 13 ? 'warning' : 'ok'
      }
    }
    return patched
  })
}

/**
 * Pisa marketValueRaw/marketValueFormatted y el link de Transfermarkt (`Transfermkt`)
 * con el dato vivo de Supabase (`fetchAgencyLiveData`, refrescado semanalmente desde
 * Transfermarkt) cuando existe. Sin esto, un valor o link cargado una vez en el
 * Sheet/`agencyPlayers.ts` — o directamente nunca cargado ahí — queda tapando al dato
 * real para siempre, o la ficha se queda sin el link aunque Supabase ya lo tenga
 * (caso real: Rodrigo Schlegel sin fila en el Sheet legacy). Mismo problema que
 * `applyAgencyOverrides` ya resuelve para Equipo/Vencimiento contrato, acá aplicado
 * a valor de mercado y Transfermarkt.
 */
export function applyLiveAgencyData(
  players: EnrichedPlayer[],
  liveRows: AgencyLiveDataRow[],
): EnrichedPlayer[] {
  if (liveRows.length === 0) return players
  const byKey = new Map<string, AgencyLiveDataRow>()
  for (const r of liveRows) byKey.set(identityKey(r.name), r)

  return players.map(p => {
    const live = byKey.get(identityKey(p.Jugador))
    if (!live) return p
    const patch: {
      marketValueRaw?: number; marketValueFormatted?: string; Transfermkt?: string
      birthDateLive?: string | null; nationalityLive?: string | null
    } = {}
    if (live.market_value_eur != null && live.market_value_eur !== p.marketValueRaw) {
      patch.marketValueRaw = live.market_value_eur
      patch.marketValueFormatted = formatMarketValue(live.market_value_eur)
    }
    if (live.transfermarkt_url && live.transfermarkt_url !== p.Transfermkt) {
      patch.Transfermkt = live.transfermarkt_url
    }
    // birth_date/nationality vivos de Transfermarkt (`players`) — el Sheet legacy
    // casi nunca tiene fecha de nacimiento cargada (sólo 2 de 39 jugadores la
    // tenían en agencyPlayers.ts), esto es lo que realmente alcanza a casi todo
    // el plantel para el widget de cumpleaños y el de nacionalidades.
    if (live.birth_date) patch.birthDateLive = live.birth_date
    if (live.nationality) patch.nationalityLive = live.nationality
    if (Object.keys(patch).length === 0) return p
    return { ...p, ...patch }
  })
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
  const score = player.rating ?? 0
  const pos = normalizeName(player['Posición'] || '')

  // Different base values per league
  // Argentina 1st: Values range €250k - €10M based on analysis
  // Colombia 2nd: Values range €50k - €1M based on analysis
  const isArgentina = leagueType === 'argentina1'

  let baseValue: number

  // Cortes sobre el Rating (1-10), recalibrados sobre la distribución real
  // (comprimida entre ~5.7 y ~8.6, p5-p95 6.5-7.3) — misma familia que
  // ScoreBar.tsx/GaugeScore.tsx/DashboardPage.tsx (7.3/6.8/6.4/6.0).
  // Argentina vale ~4-5x más que Colombia.
  if (isArgentina) {
    // Liga Argentina base values
    if (score >= 7.3) baseValue = 3_000_000      // Elite performers
    else if (score >= 6.8) baseValue = 1_800_000 // Very good
    else if (score >= 6.4) baseValue = 1_000_000 // Good
    else if (score >= 6.0) baseValue = 600_000   // Average
    else if (score > 0) baseValue = 350_000      // Below average
    else baseValue = 400_000                     // No score - use age
  } else {
    // Colombia 2nd division base values
    if (score >= 7.3) baseValue = 400_000
    else if (score >= 6.8) baseValue = 250_000
    else if (score >= 6.4) baseValue = 175_000
    else if (score >= 6.0) baseValue = 125_000
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
  allPlayersForScoring: EnrichedPlayer[],  // Combined external + internal, para reusar su score
  internalOnly: EnrichedPlayer[],  // Internal only for comparison averages
  tmMap: Map<string, TransfermarktData>,
  scoreLookup: Map<string, ScoreLookupEntry>
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
    if (existingPlayer && existingPlayer.rating !== null) {
      const avgInternalScore = getInternalAverageByPosition(internalOnly, m['Posición'])
      const scoreDiff = existingPlayer.rating !== null && avgInternalScore !== null
        ? Math.round((existingPlayer.rating - avgInternalScore) * 10) / 10
        : null

      return {
        ...m,
        rating: existingPlayer.rating,
        hasEnoughData: true,
        metricsPlayer: existingPlayer,
        opportunityScore: calculateOpportunityScore(existingPlayer.rating, existingPlayer.marketValueRaw),
        marketValueRaw: existingPlayer.marketValueRaw,
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
      scoreLookup
    )

    // Get market value from metrics or Transfermarkt
    let marketValueRaw = parseMarketValue(metricsPlayer['Valor de mercado'] ?? '')
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
      rating: score,
      hasEnoughData,
      metricsPlayer: enrichedPlayer,
      opportunityScore,
      marketValueRaw,
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
        rating: extPlayer.rating,
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
          rating: teamMatch.rating,
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

/**
 * Enriquece un jugador de Seguimiento y le pega el Rating (1-10) de la API.
 *
 * Antes calculaba un score propio de 0-100 normalizando las columnas del CSV
 * contra los jugadores de la misma posición. Ese número no era comparable con el
 * Rating del resto de la plataforma, así que se sacó: si la API no tiene al
 * jugador, queda sin score.
 */
function scoreSeguimientoPlayer(
  player: SeguimientoMetricsPlayer,
  lookup: Map<string, ScoreLookupEntry>
): { score: number | null; hasEnoughData: boolean; enrichedPlayer: EnrichedPlayer | null } {
  const hasData = hasEnoughMetrics(player)

  if (!hasData) {
    return { score: null, hasEnoughData: false, enrichedPlayer: null }
  }

  const finalScore = lookup.get(normalizeName(player.Jugador ?? ''))?.score ?? null

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
    rating: finalScore,
    ratingPercentile: null,
    source: 'externo',
    contractStatus: monthsRemaining === null ? 'ok' : monthsRemaining < 7 ? 'critical' : monthsRemaining < 13 ? 'warning' : 'ok',
    monthsRemaining,
    marketValueRaw,
    minutesPlayed: parseInt(player['Minutos jugados'] ?? '0', 10),
    ageNum: parseInt(player.Edad ?? '0', 10) || 0,
  }

  return { score: finalScore, hasEnoughData: true, enrichedPlayer }
}

// Calculate opportunity score (score / market value ratio, higher = better opportunity)
function calculateOpportunityScore(rating: number | null, marketValue: number): number | null {
  if (rating === null || marketValue <= 0) return null
  // Normalize: score per €100k of market value
  return Math.round((rating / (marketValue / 100000)) * 10) / 10
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
    return pk === posKey && p.rating !== null
  })

  if (positionPlayers.length === 0) return null

  const sum = positionPlayers.reduce((acc, p) => acc + (p.rating ?? 0), 0)
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
    gpsEntries: [],
    gpsMetrics: [],
    refreshGps: async () => {},
    positionAverages: {},
    agencyPlayers: [],
    refreshAgencyPlayers: async () => {},
    createManualPlayerAndRefresh: async () => { throw new Error('Los datos todavía no cargaron') },
    playerVideos: [],
    refreshPlayerVideos: async () => {},
    videoFreshnessByKey: new Map(),
    loading: true,
    error: null,
    lastUpdated: null,
  })

  // Base internal (derivada del CSV) y external, para re-derivar internal al cambiar Doble G
  const baseInternalRef = useRef<EnrichedPlayer[]>([])
  const externalRef = useRef<EnrichedPlayer[]>([])
  const scoreLookupRef = useRef<Map<string, ScoreLookupEntry>>(new Map())
  const agencyLiveDataRef = useRef<AgencyLiveDataRow[]>([])

  const refreshAgencyPlayers = useCallback(async () => {
    await loadAgencyPlayers()
    const agencyPlayers = getAgencyPlayersList()
    setData(prev => ({
      ...prev,
      agencyPlayers,
      external: applyLiveAgencyData(prev.external, agencyLiveDataRef.current),
      internal: applyLiveAgencyData(
        mergeAgencyIntoInternal(baseInternalRef.current, externalRef.current, agencyPlayers),
        agencyLiveDataRef.current,
      ),
    }))
  }, [])

  const refreshPlayerVideos = useCallback(async () => {
    const videos = await fetchAllPlayerVideos()
    setData(prev => ({ ...prev, playerVideos: videos }))
  }, [])

  const createManualPlayerAndRefresh = useCallback(async (row: ManualExternalPlayerRow): Promise<EnrichedPlayer> => {
    const saved = await createManualExternalPlayer(row)
    const score = scoreLookupRef.current.get(normalizeName(saved.full_name))?.score ?? null
    const enriched = manualExternalToEnriched(saved, score)
    externalRef.current = [...externalRef.current, enriched]
    setData(prev => ({
      ...prev,
      external: applyLiveAgencyData([...prev.external, enriched], agencyLiveDataRef.current),
      internal: applyLiveAgencyData(
        mergeAgencyIntoInternal(baseInternalRef.current, externalRef.current, prev.agencyPlayers),
        agencyLiveDataRef.current,
      ),
    }))
    return enriched
  }, [])

  // GPS: vive en Supabase (no en el CSV). Se carga aparte del resto de los datos
  // para que una demora de la hoja no retrase el físico y viceversa.
  const [gps, setGps] = useState<{ entries: GpsEntryRow[]; metrics: GpsMetric[] }>({
    entries: [], metrics: [],
  })

  const refreshGps = useCallback(async () => {
    const [entries, catalog] = await Promise.all([fetchGpsEntries(), fetchGpsCatalog()])
    setGps({ entries, metrics: catalog.metrics })
  }, [])

  useEffect(() => { void refreshGps() }, [refreshGps])

  useEffect(() => {
    let cancelled = false

    loadAllData()
      .then(async raw => {
        if (cancelled) return

        // Cargar overlay Doble G (altas/bajas) antes de derivar internal
        await loadAgencyPlayers()
        if (cancelled) return

        // Cargar videos de jugadores
        const playerVideos = await fetchAllPlayerVideos()
        if (cancelled) return

        // Build lookup maps
        const tmMap = buildTransfermarktMap(raw.transfermarkt)
        const tmByLinkMap = buildTransfermarktByLinkMap(raw.transfermarkt)
        const masDatosMap = buildMasDatosMap(raw.masDatos)

        // El Rating (1-10) lo calcula la API por posición: acá sólo se le pega a
        // cada fila del CSV por nombre. El scoring viejo de 0-100 sobre columnas del
        // CSV ya no existe. Si la API no responde, los jugadores quedan sin score
        // en vez de caer a la escala vieja.
        const scoreLookup = await fetchScoreLookup().catch(() => new Map<string, ScoreLookupEntry>())
        if (cancelled) return

        scoreLookupRef.current = scoreLookup

        // Valor de mercado y link de Transfermarkt vivos del roster Doble G
        // (Supabase, refrescado semanal desde Transfermarkt) — pisa el dato stale
        // o ausente del Sheet/agencyPlayers.ts.
        const agencyLiveData = await fetchAgencyLiveData().catch(() => [] as AgencyLiveDataRow[])
        if (cancelled) return
        agencyLiveDataRef.current = agencyLiveData

        // Score and enrich external players with Transfermarkt data + Más Datos + Estimated values
        const externalScored = applyRating(raw.external, 'externo', scoreLookup)
        const externalBase = externalScored.map(p =>
          enrichWithEstimatedValue(enrichWithMasDatos(enrichWithTransfermarkt(p, tmMap), masDatosMap))
        )

        // Fichas creadas al vuelo desde el plantel de un entrenador (overlay en
        // Supabase, mismo espiritu que agencyPlayers para `internal`). Si el
        // Sheet legacy ya tiene a ese jugador por nombre, gana el Sheet.
        const manualRows = await listManualExternalPlayers().catch(() => [])
        const existingExternalNames = new Set<string>()
        for (const p of externalBase) {
          existingExternalNames.add(normalizeName(p.Jugador))
          existingExternalNames.add(identityKey(p.Jugador))
        }
        const manualPlayers = manualRows
          .filter(r => !existingExternalNames.has(normalizeName(r.full_name)) && !existingExternalNames.has(identityKey(r.full_name)))
          .map(r => manualExternalToEnriched(r, scoreLookup.get(normalizeName(r.full_name))?.score ?? null))
        const external = [...externalBase, ...manualPlayers]

        const internalScored = applyRating(raw.internal, 'interno', scoreLookup)

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
          if (p.rating === null) continue
          const rawPos = p['Posición'] || ''
          const normPos = FILTER_POSITION_MAP[rawPos] ?? ''
          if (!normPos) continue
          if (!positionGroups[normPos]) positionGroups[normPos] = []
          positionGroups[normPos].push(p.rating)
        }
        const positionAverages: Record<string, number> = {}
        for (const [pos, scores] of Object.entries(positionGroups)) {
          positionAverages[pos] = scores.reduce((a, b) => a + b, 0) / scores.length
        }

        // Guardar base para re-derivar internal al cambiar Doble G, y fusionar agregados
        baseInternalRef.current = internal
        externalRef.current = external
        const agencyPlayers = getAgencyPlayersList()
        const externalWithLiveData = applyLiveAgencyData(external, agencyLiveData)
        const internalMerged = applyLiveAgencyData(
          mergeAgencyIntoInternal(internal, external, agencyPlayers),
          agencyLiveData,
        )

        setData({
          external: externalWithLiveData,
          internal: internalMerged,
          monitoring,
          normalized: raw.normalized,
          evolution: raw.evolution,
          subjectiveMetrics: raw.subjectiveMetrics,
          marketValueHistory: raw.marketValueHistory,
          // El GPS lo pisa `contextValue` con lo que viene de Supabase.
          gpsData: [],
          gpsEntries: [],
          gpsMetrics: [],
          refreshGps,
          positionAverages,
          agencyPlayers,
          refreshAgencyPlayers,
          createManualPlayerAndRefresh,
          playerVideos,
          refreshPlayerVideos,
          videoFreshnessByKey: new Map(),
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

  const videoFreshnessByKey = useMemo(() => {
    const byKey = new Map<string, PlayerVideo[]>()
    for (const v of data.playerVideos) {
      const arr = byKey.get(v.player_key) ?? []
      arr.push(v)
      byKey.set(v.player_key, arr)
    }
    const out = new Map<string, VideoFreshness>()
    for (const [key, vids] of byKey) out.set(key, computePlayerFreshness(vids))
    return out
  }, [data.playerVideos])

  const contextValue = useMemo(
    () => ({
      ...data,
      videoFreshnessByKey,
      gpsEntries: gps.entries,
      gpsMetrics: gps.metrics,
      gpsData: gps.entries.map(e => toLegacyGpsEntry(e, gps.metrics)),
      refreshGps,
    }),
    [data, videoFreshnessByKey, gps, refreshGps]
  )

  return (
    <DataContext.Provider value={contextValue}>
      {children}
    </DataContext.Provider>
  )
}

export function useData(): AppData {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
