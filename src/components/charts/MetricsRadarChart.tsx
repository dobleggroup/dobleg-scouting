import { useState, useMemo } from 'react'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip,
} from 'recharts'
import { RADAR_METRICS } from '@/constants/radarMetrics'
import type { PlayerMatchStat, Position, PositionMetricAverages, LeagueInfo } from '@/types/scoring'

interface Props {
  matches: PlayerMatchStat[]
  position: Position
  metricAverages: PositionMetricAverages[]
  playerLeagueId: number
  leagues: LeagueInfo[]
}

function formatValue(v: number): string {
  if (v >= 100) return v.toFixed(0)
  if (v >= 10) return v.toFixed(1)
  return v.toFixed(2)
}

export default function MetricsRadarChart({ matches, position, metricAverages, playerLeagueId, leagues }: Props) {
  const [selectedLeagueId, setSelectedLeagueId] = useState<number>(playerLeagueId)

  const metrics = RADAR_METRICS[position]
  if (!metrics) return null

  const positionMatches = useMemo(
    () => matches.filter(m => m.detected_position === position && m.minutes >= 10),
    [matches, position]
  )

  const leagueAvg = useMemo(
    () => metricAverages.find(a => a.position === position && a.league_id === selectedLeagueId) ?? null,
    [metricAverages, position, selectedLeagueId]
  )

  const availableLeagues = useMemo(() => {
    const leagueIds = new Set(metricAverages.filter(a => a.position === position).map(a => a.league_id))
    return leagues.filter(l => leagueIds.has(l.id))
  }, [metricAverages, position, leagues])

  const data = useMemo(() => {
    if (positionMatches.length === 0) return []

    return metrics.map(metric => {
      const playerVal = metric.computePlayer(positionMatches)
      const avgVal = leagueAvg ? (leagueAvg[metric.key] as number ?? 0) : 0

      const ceiling = Math.max(playerVal, avgVal, 0.01) * 1.25
      let playerNorm = (playerVal / ceiling) * 100
      let avgNorm = (avgVal / ceiling) * 100

      if (metric.inverse) {
        const invCeiling = Math.max(playerVal, avgVal, 0.01) * 1.25
        playerNorm = Math.max(0, (1 - playerVal / invCeiling) * 100)
        avgNorm = Math.max(0, (1 - avgVal / invCeiling) * 100)
      }

      return {
        metric: metric.label,
        player: Math.round(playerNorm * 10) / 10,
        average: Math.round(avgNorm * 10) / 10,
        playerRaw: playerVal,
        avgRaw: avgVal,
        inverse: metric.inverse,
      }
    })
  }, [positionMatches, leagueAvg, metrics])

  if (positionMatches.length === 0) return null

  const selectedLeagueName = leagues.find(l => l.id === selectedLeagueId)?.name ?? 'Liga'

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-apple-gray-800 dark:text-white">
          Métricas vs Promedio
        </h3>
        {availableLeagues.length > 1 && (
          <select
            value={selectedLeagueId}
            onChange={e => setSelectedLeagueId(Number(e.target.value))}
            className="text-xs bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-700 dark:text-apple-gray-300 rounded-lg px-3 py-1.5 border-0 outline-none focus:ring-2 focus:ring-brand-green/40 cursor-pointer transition-all"
          >
            {availableLeagues.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-center gap-4 mb-3 text-[11px] text-apple-gray-500 dark:text-apple-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-emerald-500/30 border border-emerald-500" />
          Jugador
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-apple-gray-400/20 border border-apple-gray-400" />
          Prom. {selectedLeagueName}
        </span>
      </div>

      <ResponsiveContainer width="100%" height={340}>
        <RadarChart cx="50%" cy="50%" outerRadius="65%" data={data}>
          <PolarGrid
            stroke="currentColor"
            className="text-apple-gray-200 dark:text-apple-gray-700"
            strokeWidth={0.5}
          />
          <PolarAngleAxis
            dataKey="metric"
            tick={({ x, y, cx: chartCx, cy: chartCy, payload }) => {
              const dx = x - chartCx
              const dy = y - chartCy
              const dist = Math.sqrt(dx * dx + dy * dy)
              const offsetX = dist > 0 ? (dx / dist) * 14 : 0
              const offsetY = dist > 0 ? (dy / dist) * 14 : 0
              const finalX = x + offsetX
              const finalY = y + offsetY

              let anchor: 'start' | 'end' | 'middle' = 'middle'
              if (dx > 10) anchor = 'start'
              else if (dx < -10) anchor = 'end'

              return (
                <text
                  x={finalX}
                  y={finalY}
                  textAnchor={anchor}
                  dominantBaseline="central"
                  className="fill-apple-gray-500 dark:fill-apple-gray-400"
                  fontSize={10}
                  fontWeight={500}
                >
                  {payload.value}
                </text>
              )
            }}
          />
          <PolarRadiusAxis
            domain={[0, 100]}
            tick={false}
            axisLine={false}
          />
          <Radar
            name="Prom. liga"
            dataKey="average"
            stroke="#9ca3af"
            strokeWidth={1.5}
            fill="#9ca3af"
            fillOpacity={0.08}
            strokeDasharray="4 3"
          />
          <Radar
            name="Jugador"
            dataKey="player"
            stroke="#22c55e"
            strokeWidth={2}
            fill="#22c55e"
            fillOpacity={0.12}
            dot={{ r: 3, fill: '#22c55e', strokeWidth: 0 }}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const item = payload[0]?.payload
              if (!item) return null
              return (
                <div className="bg-white dark:bg-apple-gray-900 border border-apple-gray-200 dark:border-apple-gray-700 rounded-xl px-3 py-2 shadow-lg">
                  <p className="text-xs font-semibold text-apple-gray-800 dark:text-white mb-1">{item.metric}</p>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                    <span className="text-apple-gray-600 dark:text-apple-gray-300">
                      {formatValue(item.playerRaw)}{item.inverse ? ' (menos es mejor)' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="w-2 h-2 rounded-full bg-apple-gray-400 inline-block" />
                    <span className="text-apple-gray-500">
                      Prom: {formatValue(item.avgRaw)}
                    </span>
                  </div>
                </div>
              )
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}
