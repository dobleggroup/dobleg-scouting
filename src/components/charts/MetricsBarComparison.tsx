import { useState, useMemo } from 'react'
import { RADAR_METRICS } from '@/constants/radarMetrics'
import type { PlayerMatchStat, Position, PositionMetricAverages, LeagueInfo } from '@/types/scoring'

const POSITION_LABELS: Record<Position, string> = {
  ARQ: 'Arquero', CB: 'Central', LD: 'Lateral derecho', LI: 'Lateral izquierdo',
  VC: 'Volante central', VI: 'Volante interior', EXT: 'Extremo', DEL: 'Delantero',
}

interface MetricDelta {
  label: string
  delta: number
  inverse: boolean
}

function generateInsight(position: Position, deltas: MetricDelta[], leagueName: string, matchCount: number): { summary: string; strengths: string[]; weaknesses: string[] } {
  const sorted = [...deltas].sort((a, b) => {
    const aAdj = a.inverse ? -a.delta : a.delta
    const bAdj = b.inverse ? -b.delta : b.delta
    return bAdj - aAdj
  })

  const strengths = sorted
    .filter(d => (d.inverse ? -d.delta : d.delta) > 10)
    .slice(0, 3)
    .map(d => {
      const pct = Math.abs(d.delta).toFixed(0)
      return `${d.label} ${d.inverse ? 'inferior' : 'superior'} al promedio (+${pct}%)`
    })

  const weaknesses = sorted
    .filter(d => (d.inverse ? -d.delta : d.delta) < -10)
    .slice(-2)
    .map(d => {
      const pct = Math.abs(d.delta).toFixed(0)
      const dir = d.inverse ? 'por encima' : 'por debajo'
      return `${d.label} ${dir} del promedio (-${pct}%)`
    })

  const aboveAvg = deltas.filter(d => (d.inverse ? -d.delta : d.delta) > 0).length
  const total = deltas.length
  const ratio = aboveAvg / total

  const posLabel = POSITION_LABELS[position] ?? position
  let profile: string
  if (ratio >= 0.85) profile = `Rendimiento excepcional como ${posLabel}`
  else if (ratio >= 0.65) profile = `Por encima del promedio como ${posLabel}`
  else if (ratio >= 0.4) profile = `Rendimiento mixto como ${posLabel}`
  else profile = `Por debajo del promedio como ${posLabel}`

  const summary = `${profile} en ${leagueName}. Supera al promedio en ${aboveAvg} de ${total} métricas analizadas (${matchCount} partidos evaluados).`

  return { summary, strengths, weaknesses }
}

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

export default function MetricsBarComparison({ matches, position, metricAverages, playerLeagueId, leagues }: Props) {
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

      return {
        label: metric.label,
        player: playerVal,
        average: avgVal,
        inverse: metric.inverse ?? false,
      }
    })
  }, [positionMatches, leagueAvg, metrics])

  const insight = useMemo(() => {
    if (data.length === 0 || !leagueAvg) return null
    const deltas: MetricDelta[] = data.map(d => ({
      label: d.label,
      delta: d.average > 0 ? ((d.player - d.average) / d.average) * 100 : (d.player > 0 ? 100 : 0),
      inverse: d.inverse,
    }))
    const leagueName = leagues.find(l => l.id === selectedLeagueId)?.name ?? 'Liga'
    return generateInsight(position, deltas, leagueName, positionMatches.length)
  }, [data, leagueAvg, position, selectedLeagueId, leagues, positionMatches.length])

  if (positionMatches.length === 0) return null

  const selectedLeagueName = leagues.find(l => l.id === selectedLeagueId)?.name ?? 'Liga'

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-apple-gray-800 dark:text-white">
          Detalle de métricas
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

      <div className="flex items-center gap-4 mb-4 text-[11px] text-apple-gray-500 dark:text-apple-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-emerald-500" />
          Jugador
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-apple-gray-300 dark:bg-apple-gray-600" />
          Prom. {selectedLeagueName}
        </span>
      </div>

      <div className="space-y-3">
        {data.map(item => {
          const maxVal = Math.max(item.player, item.average, 0.01)
          const playerPct = (item.player / maxVal) * 100
          const avgPct = (item.average / maxVal) * 100
          const isBetter = item.inverse ? item.player < item.average : item.player > item.average

          return (
            <div key={item.label}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-apple-gray-700 dark:text-apple-gray-300">
                  {item.label}
                  {item.inverse && (
                    <span className="ml-1 text-[10px] text-apple-gray-400">(↓)</span>
                  )}
                </span>
                <div className="flex items-center gap-3 text-xs tabular-nums">
                  <span className={`font-semibold ${isBetter ? 'text-emerald-600 dark:text-emerald-400' : 'text-apple-gray-700 dark:text-apple-gray-300'}`}>
                    {formatValue(item.player)}
                  </span>
                  <span className="text-apple-gray-400 dark:text-apple-gray-500">
                    {formatValue(item.average)}
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <div className="h-[6px] rounded-full bg-apple-gray-100 dark:bg-apple-gray-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isBetter ? 'bg-emerald-500' : 'bg-emerald-400/70'
                    }`}
                    style={{ width: `${Math.min(playerPct, 100)}%` }}
                  />
                </div>
                <div className="h-[6px] rounded-full bg-apple-gray-100 dark:bg-apple-gray-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-apple-gray-300 dark:bg-apple-gray-600 transition-all duration-500"
                    style={{ width: `${Math.min(avgPct, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {insight && (
        <div className="mt-5 pt-4 border-t border-apple-gray-100 dark:border-apple-gray-800">
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-md bg-brand-green/10 flex items-center justify-center">
              <svg className="w-3 h-3 text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-apple-gray-800 dark:text-white mb-1">Análisis</p>
              <p className="text-xs text-apple-gray-600 dark:text-apple-gray-300 leading-relaxed">
                {insight.summary}
              </p>
              {insight.strengths.length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold mb-1">Fortalezas</p>
                  <ul className="space-y-0.5">
                    {insight.strengths.map(s => (
                      <li key={s} className="text-xs text-apple-gray-600 dark:text-apple-gray-300 flex items-center gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-emerald-500 flex-shrink-0" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {insight.weaknesses.length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-semibold mb-1">A mejorar</p>
                  <ul className="space-y-0.5">
                    {insight.weaknesses.map(w => (
                      <li key={w} className="text-xs text-apple-gray-600 dark:text-apple-gray-300 flex items-center gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-amber-500 flex-shrink-0" />
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
