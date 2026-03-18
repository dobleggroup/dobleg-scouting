import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { RADAR_METRICS, METRIC_ABBREVIATIONS, POSITION_MAP } from '@/constants/scoring'
import { normalizeName, computePositionMinMax } from '@/utils/scoring'
import type { EnrichedPlayer, NormalizedPlayer, RadarDataPoint } from '@/types'

interface PlayerRadarChartProps {
  player: EnrichedPlayer
  allNormalized: NormalizedPlayer[]
  allPlayers: EnrichedPlayer[]
  comparePlayer?: EnrichedPlayer
  compareColor?: string
  comparisonLeague?: string // 'all' for global average, or specific league name
  overridePosition?: string // Override player position (e.g., from seguimiento list)
  customMetrics?: string[] // Override default position metrics
}

// Get posKey from a position string (handles multiple positions like "RCB , LCB")
function getPosKeyFromPosition(rawPosition: string): string {
  const separator = rawPosition.includes(',') ? ',' : rawPosition.includes('/') ? '/' : null
  if (separator) {
    for (const pos of rawPosition.split(separator).map(p => p.trim())) {
      if (POSITION_MAP[pos]) return POSITION_MAP[pos]
    }
  }
  return POSITION_MAP[rawPosition.trim()] ?? ''
}

function getPlayerNormalizedValues(
  player: EnrichedPlayer,
  allNormalized: NormalizedPlayer[],
  allPlayers: EnrichedPlayer[],
  metrics: string[],
  posKey: string // Pass posKey explicitly for seguimiento players
): Record<string, number> {
  // Try finding in the Normalizado sheet first (pre-computed 0-1 values)
  const normPlayer = allNormalized.find(n =>
    normalizeName(n.Jugador) === normalizeName(player.Jugador)
  )

  if (normPlayer) {
    const result: Record<string, number> = {}
    for (const metric of metrics) {
      const val = normPlayer[metric]
      result[metric] = typeof val === 'number' ? Math.min(1, Math.max(0, val)) * 100 : 0
    }
    return result
  }

  // Fallback: compute normalization from players array
  // Use the passed posKey (which is correctly calculated for seguimiento players)
  const minMax = computePositionMinMax(allPlayers, posKey, metrics)
  const result: Record<string, number> = {}

  for (const metric of metrics) {
    const raw = player[metric]
    const rawNum = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '').replace(',', '.')) || 0
    const { min, max } = minMax[metric] ?? { min: 0, max: 1 }
    result[metric] = max > min ? ((rawNum - min) / (max - min)) * 100 : 50
  }
  return result
}

function getPositionAverage(
  allNormalized: NormalizedPlayer[],
  posKey: string, // Use posKey instead of raw position for matching
  metrics: string[],
  league?: string
): Record<string, number> {
  // Filter by position using posKey (more reliable for seguimiento)
  let posPlayers = allNormalized.filter(p => {
    const playerPosKey = getPosKeyFromPosition(p['Posición'] ?? '')
    return playerPosKey === posKey
  })

  // Filter by league if specified and not 'all'
  if (league && league !== 'all') {
    posPlayers = posPlayers.filter(p => p.Liga === league)
  }

  if (posPlayers.length === 0) return {}
  const result: Record<string, number> = {}
  for (const metric of metrics) {
    const sum = posPlayers.reduce((s, p) => {
      const v = p[metric]
      return s + (typeof v === 'number' ? v : 0)
    }, 0)
    result[metric] = (sum / posPlayers.length) * 100
  }
  return result
}

// Calculate average from EnrichedPlayer array (for internal players or when normalized data isn't available)
function getPositionAverageFromPlayers(
  allPlayers: EnrichedPlayer[],
  posKey: string,
  metrics: string[],
  league?: string
): Record<string, number> {
  let posPlayers = allPlayers.filter(p => {
    const rawPos = p['Posición específica']?.trim() || p['Posición']?.trim() || ''
    const playerPosKey = getPosKeyFromPosition(rawPos)
    return playerPosKey === posKey
  })

  // Filter by league if specified and not 'all'
  if (league && league !== 'all') {
    posPlayers = posPlayers.filter(p => p.Liga === league)
  }

  if (posPlayers.length === 0) return {}

  // First compute min/max for normalization
  const minMax = computePositionMinMax(posPlayers, posKey, metrics)

  const result: Record<string, number> = {}
  for (const metric of metrics) {
    const { min, max } = minMax[metric] ?? { min: 0, max: 1 }
    const values = posPlayers.map(p => {
      const raw = p[metric]
      return typeof raw === 'number' ? raw : parseFloat(String(raw ?? '').replace(',', '.')) || 0
    })
    const avgRaw = values.reduce((a, b) => a + b, 0) / values.length
    // Normalize the average
    result[metric] = max > min ? ((avgRaw - min) / (max - min)) * 100 : 50
  }
  return result
}

export default function PlayerRadarChart({
  player, allNormalized, allPlayers, comparePlayer, compareColor = '#3B82F6', comparisonLeague, overridePosition, customMetrics
}: PlayerRadarChartProps) {
  // Use override position if provided (e.g., from seguimiento list), otherwise use player position
  // Try 'Posición específica' first as it has Wyscout codes
  const rawPosition = overridePosition ||
    player['Posición específica']?.trim() ||
    player['Posición']?.trim() || ''

  // Calculate posKey from the raw position
  const posKey = getPosKeyFromPosition(rawPosition)

  // Get metrics for this position (use custom if provided and not empty)
  const defaultMetrics = RADAR_METRICS[posKey] ?? RADAR_METRICS['Defensor Central']
  const metrics = (customMetrics && customMetrics.length > 0) ? customMetrics : defaultMetrics

  // Get player's normalized values (pass posKey explicitly)
  const playerValues = getPlayerNormalizedValues(player, allNormalized, allPlayers, metrics, posKey)

  // Try to get averages from normalized data first (using posKey for matching)
  let avgValues = getPositionAverage(allNormalized, posKey, metrics, comparisonLeague)

  // If no data found (e.g., league not in normalized), fall back to computing from allPlayers
  const hasAvgData = Object.keys(avgValues).length > 0 && Object.values(avgValues).some(v => v > 0)
  if (!hasAvgData) {
    avgValues = getPositionAverageFromPlayers(allPlayers, posKey, metrics, comparisonLeague)
  }

  const compareValues = comparePlayer
    ? getPlayerNormalizedValues(comparePlayer, allNormalized, allPlayers, metrics, posKey)
    : null

  // Etiqueta corta que mantiene el indicador de tipo (% o /90)
  const getLabel = (metric: string): string => {
    const abbr = METRIC_ABBREVIATIONS[metric]
    if (abbr) {
      // Si hay abreviación, agregar el tipo si no lo tiene
      if (metric.includes(', %') && !abbr.includes('%')) return abbr + ' %'
      if (metric.includes('/90') && !abbr.includes('/90')) return abbr + '/90'
      return abbr
    }
    // Sin abreviación, usar nombre original pero acortado si es necesario
    if (metric.length > 20) {
      const suffix = metric.includes(', %') ? ' %' : metric.includes('/90') ? '/90' : ''
      return metric.substring(0, 16) + '…' + suffix
    }
    return metric
  }

  const data: RadarDataPoint[] = metrics.map(metric => ({
    subject: getLabel(metric),
    fullMetric: metric,
    player: Math.round(playerValues[metric] ?? 0),
    average: Math.round(avgValues[metric] ?? 50),
    fullMark: 100,
    ...(compareValues ? { compare: Math.round(compareValues[metric] ?? 0) } : {}),
  }))

  const playerName = player.Jugador.split(' ').pop() ?? player.Jugador
  const avgLabel = comparisonLeague && comparisonLeague !== 'all'
    ? `Promedio ${comparisonLeague}`
    : 'Promedio general'

  return (
    <ResponsiveContainer width="100%" height={380}>
      <RadarChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
        <PolarGrid stroke="#374151" strokeOpacity={0.5} />
        <PolarAngleAxis
          dataKey="subject"
          tick={{ fontSize: 11, fill: '#9CA3AF' }}
          tickLine={false}
        />
        {/* Position average */}
        <Radar
          name={avgLabel}
          dataKey="average"
          stroke="#6B7280"
          fill="#6B7280"
          fillOpacity={0.1}
          strokeWidth={1}
          strokeDasharray="4 2"
        />
        {/* Main player */}
        <Radar
          name={playerName}
          dataKey="player"
          stroke="#22C55E"
          fill="#22C55E"
          fillOpacity={0.2}
          strokeWidth={2}
        />
        {/* Compare player */}
        {comparePlayer && (
          <Radar
            name={comparePlayer.Jugador.split(' ').pop() ?? comparePlayer.Jugador}
            dataKey="compare"
            stroke={compareColor}
            fill={compareColor}
            fillOpacity={0.15}
            strokeWidth={2}
          />
        )}
        <Tooltip
          contentStyle={{
            backgroundColor: '#1F2937',
            border: '1px solid #374151',
            borderRadius: '8px',
            fontSize: '12px',
            maxWidth: '300px',
          }}
          labelFormatter={(label: string) => {
            const point = data.find(d => d.subject === label)
            return point?.fullMetric || label
          }}
          formatter={(value: number, name: string) => [`${value}`, name]}
        />
        <Legend
          wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
          formatter={(value) => <span style={{ color: '#9CA3AF' }}>{value}</span>}
        />
      </RadarChart>
    </ResponsiveContainer>
  )
}
