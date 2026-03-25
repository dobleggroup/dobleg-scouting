import { POSITION_MAP, SCORING_CONFIG } from '@/constants/scoring'
import { getLeagueInfo } from '@/constants/leagues'
import type { RawExternalPlayer, RawInternalPlayer, EnrichedPlayer } from '@/types'

// League tier adjustment applied after normalizing score within position group
// Tier 4 (Top Sudamérica = Argentina, Brasil, Colombia...) is the baseline (0)
const LEAGUE_TIER_ADJUSTMENT: Record<number, number> = {
  1: +10,  // Elite (Big 5 europeas)
  2: +6,   // Top Europa
  3: +3,   // Europa media / Norteamérica
  4: 0,    // Top Sudamérica (baseline)
  5: -2,   // Sudamérica media
  6: -4,   // Desarrollo / segundas divisiones
}

function getLeagueAdjustment(liga: string): number {
  const info = getLeagueInfo(liga)
  if (!info) return 0
  return LEAGUE_TIER_ADJUSTMENT[info.tier] ?? 0
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

export function parseMarketValue(raw: string): number {
  if (!raw || raw === '-' || raw === '') return 0

  const str = raw.trim().toLowerCase()

  // Handle Spanish format: "900 mil €", "1,5 mill €"
  const milMatch = str.match(/([\d.,]+)\s*mil+\s*€?/i)
  if (milMatch) {
    const numStr = milMatch[1].replace(',', '.')
    const num = parseFloat(numStr)
    if (!isNaN(num)) return num * 1_000
  }

  // Handle Transfermarkt format: €200k, €2.80m, €1.5M, etc.
  // Match patterns like: €200k, €2.80m, 500k, 1.5m
  const match = str.match(/[€$]?\s*([\d.,]+)\s*(k|m)?/i)
  if (match) {
    const numStr = match[1].replace(',', '.')
    const num = parseFloat(numStr)
    if (isNaN(num)) return 0

    const suffix = match[2]?.toLowerCase()
    if (suffix === 'm') return num * 1_000_000
    if (suffix === 'k') return num * 1_000
    return num
  }

  // Fallback: remove currency symbols and parse
  const cleaned = raw.replace(/[€$\s]/g, '').replace(/\./g, '').replace(/,/g, '.')
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

export function formatMarketValue(value: number): string {
  if (!value || value === 0) return '-'
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `€${Math.round(value / 1_000)}K`
  return `€${value}`
}

export function parseContractDate(raw: string): Date | null {
  if (!raw || raw === '-' || raw === '') return null
  // Try DD/MM/YYYY
  const ddmmyyyy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (ddmmyyyy) {
    return new Date(parseInt(ddmmyyyy[3]), parseInt(ddmmyyyy[2]) - 1, parseInt(ddmmyyyy[1]))
  }
  // Try YYYY-MM-DD
  const yyyymmdd = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (yyyymmdd) {
    return new Date(parseInt(yyyymmdd[1]), parseInt(yyyymmdd[2]) - 1, parseInt(yyyymmdd[3]))
  }
  return null
}

export function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
}

export function getNumericValue(player: Record<string, string>, column: string): number {
  const raw = player[column] ?? ''
  if (!raw || raw === '-') return 0
  const num = parseFloat(raw.replace(',', '.'))
  return isNaN(num) ? 0 : num
}

export function normalizeName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

// ─── ENRICHMENT ───────────────────────────────────────────────────────────────

function enrichPlayer(
  player: Record<string, string>,
  ggScore: number | null,
  ggScorePercentile: number | null,
  source: 'externo' | 'interno'
): EnrichedPlayer {
  // Try multiple column names for market value (different CSV formats)
  const rawValue = player['Valor de mercado (Transfermarkt)'] || player['Valor de mercado'] || ''
  const marketValueRaw = parseMarketValue(rawValue)

  // Try multiple column names for contract date
  const contractStr = player['Vencimiento contrato'] || player['Fecha fin de contrato'] || ''
  const contractDate = parseContractDate(contractStr)
  const now = new Date()
  const monthsRemaining = contractDate ? monthsBetween(now, contractDate) : null

  // For internal players, use "Posición específica" as main position
  const posEspecifica = player['Posición específica'] ?? ''
  const posGeneral = player['Posición'] ?? ''

  return {
    Jugador: player['Jugador'] ?? '',
    Liga: player['Liga'] ?? '',
    Equipo: player['Equipo'] ?? '',
    'Posición': posEspecifica || posGeneral,
    Edad: player['Edad'] ?? '',
    'País de nacimiento': player['País de nacimiento'] ?? '',
    Pie: player['Pie'] ?? '',
    Altura: player['Altura'] ?? '',
    'Valor de mercado (Transfermarkt)': rawValue,
    'Vencimiento contrato': contractStr,
    'Partidos jugados': player['Partidos jugados'] ?? '',
    'Minutos jugados': player['Minutos jugados'] ?? '',
    Goles: player['Goles'] ?? '',
    xG: player['xG'] ?? '',
    Asistencias: player['Asistencias'] ?? '',
    xA: player['xA'] ?? '',
    'Posición específica': player['Posición específica'] ?? '',
    id: player['id'] ?? '',
    Transfermkt: player['Transfermkt'] ?? '',
    Representante: player['Representante'] ?? '',
    Imagen: player['Imagen'] ?? '',
    ggScore,
    ggScorePercentile,
    source,
    contractStatus:
      monthsRemaining === null ? 'ok'
      : monthsRemaining < 7   ? 'critical'
      : monthsRemaining < 13  ? 'warning'
      : 'ok',
    monthsRemaining,
    marketValueFormatted: formatMarketValue(marketValueRaw),
    marketValueRaw,
    minutesPlayed: getNumericValue(player, 'Minutos jugados'),
    ageNum: parseInt(player['Edad'] ?? '0', 10) || 0,
    // Spread all raw columns for stat access
    ...player,
  }
}

// ─── MAIN SCORING FUNCTION ────────────────────────────────────────────────────

function getPositionKey(player: Record<string, string>): string | null {
  // Internal uses "Posición específica", external uses "Posición"
  const rawPos = (player['Posición específica'] || player['Posición'])?.trim() ?? ''
  return POSITION_MAP[rawPos] ?? null
}

/**
 * Rank-based normalization for a single value within a sorted array.
 * Uses midpoint ranking to handle ties fairly.
 * Returns 0-100; defaults to 50 when there is only 1 player in the group.
 */
function rankNormalize(value: number, sortedAsc: number[]): number {
  const N = sortedAsc.length
  if (N <= 1) return 50

  let below = 0
  let equal = 0
  for (const v of sortedAsc) {
    if (v < value) below++
    else if (v === value) equal++
  }
  // Midpoint rank — treats all ties symmetrically
  const rank = below + (equal - 1) / 2
  return Math.max(0, Math.min(100, (rank / (N - 1)) * 100))
}

export function computeGGScores(
  players: (RawExternalPlayer | RawInternalPlayer)[],
  source: 'externo' | 'interno',
  precomputedScores?: Map<string, number | null>,
  precomputedPercentiles?: Map<string, number | null>
): EnrichedPlayer[] {
  // Fast path: scores already computed externally (second call in DataContext)
  if (precomputedScores) {
    return players.map(player => {
      const key = (player['Jugador'] ?? '') + '|' + (player['Equipo'] ?? '')
      const score = precomputedScores.get(key) ?? null
      const percentile = precomputedPercentiles?.get(key) ?? null
      return enrichPlayer(player as Record<string, string>, score, percentile, source)
    })
  }

  // ── Pass 0: group players by position ────────────────────────────────────
  const byPosition = new Map<string, (RawExternalPlayer | RawInternalPlayer)[]>()
  for (const p of players) {
    const posKey = getPositionKey(p as Record<string, string>)
    if (!posKey) continue
    if (!byPosition.has(posKey)) byPosition.set(posKey, [])
    byPosition.get(posKey)!.push(p)
  }

  // ── Pass 1a: build sorted value arrays per metric per position ───────────
  // These replace the old min/max stats — we store the sorted array so we can
  // compute rank-based normalization in O(n) per player.
  const positionSorted = new Map<string, Map<string, number[]>>()
  for (const [posKey, group] of byPosition) {
    const config = SCORING_CONFIG[posKey]
    if (!config) continue
    const colSorted = new Map<string, number[]>()
    for (const { column } of config) {
      const values = group.map(p => getNumericValue(p as Record<string, string>, column))
      colSorted.set(column, [...values].sort((a, b) => a - b))
    }
    positionSorted.set(posKey, colSorted)
  }

  // ── Pass 1b: compute ggScore for every player ────────────────────────────
  const playerKeys: string[] = new Array(players.length)
  const playerPosKeys: string[] = new Array(players.length)
  const rawScores: (number | null)[] = new Array(players.length).fill(null)

  for (let i = 0; i < players.length; i++) {
    const player = players[i]
    const posKey = getPositionKey(player as Record<string, string>)
    const key = (player['Jugador'] ?? '') + '|' + (player['Equipo'] ?? '')
    playerKeys[i] = key
    playerPosKeys[i] = posKey ?? ''

    if (!posKey || !SCORING_CONFIG[posKey]) continue

    const config = SCORING_CONFIG[posKey]
    const colSorted = positionSorted.get(posKey)!
    let score = 0

    for (const { column, weight } of config) {
      const raw = getNumericValue(player as Record<string, string>, column)
      const sorted = colSorted.get(column)!
      score += rankNormalize(raw, sorted) * (weight / 100)
    }

    // League tier adjustment (additive, same as before)
    const liga = (player as Record<string, string>)['Liga'] ?? ''
    const leagueAdj = getLeagueAdjustment(liga)
    rawScores[i] = Math.round(Math.max(0, Math.min(100, score + leagueAdj)) * 10) / 10
  }

  // ── Pass 2: compute ggScorePercentile per position group ─────────────────
  // Group indices by position, sort by ggScore, assign rank percentile.
  const posIndices = new Map<string, number[]>()
  for (let i = 0; i < players.length; i++) {
    const posKey = playerPosKeys[i]
    if (!posKey || rawScores[i] === null) continue
    if (!posIndices.has(posKey)) posIndices.set(posKey, [])
    posIndices.get(posKey)!.push(i)
  }

  const percentiles: (number | null)[] = new Array(players.length).fill(null)
  for (const indices of posIndices.values()) {
    // Sort the group's indices by their ggScore ascending
    const sorted = [...indices].sort((a, b) => (rawScores[a] as number) - (rawScores[b] as number))
    const N = sorted.length
    sorted.forEach((origIdx, rank) => {
      percentiles[origIdx] = N <= 1 ? 50 : Math.round((rank / (N - 1)) * 100 * 10) / 10
    })
  }

  // ── Final: build enriched players ────────────────────────────────────────
  return players.map((player, i) =>
    enrichPlayer(
      player as Record<string, string>,
      rawScores[i],
      percentiles[i],
      source
    )
  )
}

// ─── NORMALIZATION FOR RADAR (internal players) ───────────────────────────────

export interface PositionMinMax {
  [column: string]: { min: number; max: number }
}

export function computePositionMinMax(
  players: EnrichedPlayer[],
  posKey: string,
  metrics: string[]
): PositionMinMax {
  const posPlayers = players.filter(p => {
    const rawPos = (p['Posición específica'] || p['Posición'])?.trim() ?? ''
    const pk = POSITION_MAP[rawPos] ?? ''
    return pk === posKey
  })

  const result: PositionMinMax = {}
  for (const metric of metrics) {
    const values = posPlayers.map(p => {
      const v = p[metric]
      if (typeof v === 'number') return v
      const num = parseFloat(String(v ?? '').replace(',', '.'))
      return isNaN(num) ? 0 : num
    })
    result[metric] = {
      min: values.length ? Math.min(...values) : 0,
      max: values.length ? Math.max(...values) : 1,
    }
  }
  return result
}
