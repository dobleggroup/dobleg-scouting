import { useMemo, useState } from 'react'
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import type { EnrichedPlayer, NormalizedPlayer } from '@/types'
import { RADAR_METRICS, METRIC_ABBREVIATIONS, POSITION_MAP, SCORING_CONFIG } from '@/constants/scoring'
import { normalizeName, computePositionMinMax } from '@/utils/scoring'

interface ComparisonViewProps {
  players: EnrichedPlayer[]
  allNormalized: NormalizedPlayer[]
  allPlayers: EnrichedPlayer[]
}

const PLAYER_COLORS = ['#22C55E', '#3B82F6', '#F59E0B']

// Get default metrics for a position (based on scoring config)
function getDefaultMetricsForPosition(posKey: string): string[] {
  const config = SCORING_CONFIG[posKey] || SCORING_CONFIG['Defensor Central']
  // Return the columns sorted by weight (most important first)
  return config
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 8) // Top 8 most important
    .map(m => m.column)
}

// All available metrics for selection (exact column names from data)
const ALL_COMPARISON_METRICS = [
  // General
  'Partidos jugados', 'Minutos jugados', 'Goles', 'Asistencias', 'xG', 'xA',
  // Duelos
  'Duelos ganados, %', 'Duelos defensivos ganados, %', 'Duelos aéreos ganados, %',
  'Duelos atacantes ganados/90', 'Duelos atacantes ganados, %',
  // Pases
  'Pases progresivos exitosos/90', 'Pases hacia adelante/90', 'Precisión pases hacia adelante, %',
  'Precisión pases largos, %', 'Pases precisos/90',
  // Defensa
  'Interceptaciones/90', 'Entradas/90', 'Acciones defensivas realizadas/90',
  // Ataque
  'Carreras en progresión/90', 'Gambetas completadas/90', 'Gambetas completadas, %',
  'xA/90', 'Jugadas claves/90', 'Toques en el área de penalti/90',
  'Acciones de ataque exitosas/90', 'Ataque en profundidad/90',
  'Centros precisos/90', 'Remates/90', 'Faltas recibidas/90',
]

// Clearer display names for metrics (shows what the metric actually measures)
const CLEAR_METRIC_NAMES: Record<string, string> = {
  // Duelos
  'Duelos ganados, %': 'Duelos ganados %',
  'Duelos defensivos ganados, %': 'Duelos def. %',
  'Duelos aéreos ganados, %': 'Duelos aéreos %',
  'Duelos atacantes ganados/90': 'Duelos ofens./90',
  'Duelos atacantes ganados, %': 'Duelos ofens. %',
  // Pases
  'Pases progresivos exitosos/90': 'Pases progres./90',
  'Precisión pases hacia adelante, %': 'Prec. pases adel. %',
  'Precisión pases largos, %': 'Prec. pases largos %',
  'Pases hacia adelante/90': 'Pases adelante/90',
  'Pases al tercer tercio/90': 'Pases últ. tercio/90',
  'Pases precisos/90': 'Pases precisos/90',
  // Gambetas/Regates
  'Gambetas completadas/90': 'Regates complet./90',
  'Gambetas completadas, %': 'Regates complet. %',
  // Ataque
  'Acciones de ataque exitosas/90': 'Acc. ofensivas/90',
  'Toques en el área de penalti/90': 'Toques en área/90',
  'Ataque en profundidad/90': 'Profundidad/90',
  'Carreras en progresión/90': 'Conducciones progresivas/90',
  'Jugadas claves/90': 'Jugadas clave/90',
  'Centros precisos/90': 'Centros prec./90',
  'Remates/90': 'Remates/90',
  'xA/90': 'xA/90',
  // Defensa
  'Acciones defensivas realizadas/90': 'Acc. defensivas/90',
  'Interceptaciones/90': 'Intercep./90',
  'Entradas/90': 'Entradas/90',
  // Otros
  'Faltas recibidas/90': 'Faltas recib./90',
}

// Get display name for a metric
function getMetricDisplayName(metric: string): string {
  return CLEAR_METRIC_NAMES[metric] || metric
}

function getVal(player: EnrichedPlayer, metric: string): number {
  const v = player[metric]
  if (typeof v === 'number') return v
  const n = parseFloat(String(v ?? '').replace(',', '.'))
  return isNaN(n) ? 0 : n
}

function pctDiff(a: number, b: number): string {
  if (a === 0) return '—'
  const diff = ((b - a) / Math.abs(a)) * 100
  return `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`
}

function getNormalized(
  player: EnrichedPlayer,
  allNormalized: NormalizedPlayer[],
  allPlayers: EnrichedPlayer[],
  metrics: string[]
): Record<string, number> {
  const found = allNormalized.find(n => normalizeName(n.Jugador) === normalizeName(player.Jugador))
  if (found) {
    return Object.fromEntries(metrics.map(m => [m, ((found[m] as number) ?? 0) * 100]))
  }
  const posKey = POSITION_MAP[player['Posición']?.trim() ?? ''] ?? ''
  const minMax = computePositionMinMax(allPlayers, posKey, metrics)
  return Object.fromEntries(metrics.map(m => {
    const raw = getVal(player, m)
    const { min, max } = minMax[m] ?? { min: 0, max: 1 }
    return [m, max > min ? ((raw - min) / (max - min)) * 100 : 50]
  }))
}

function getComparisonStats(players: EnrichedPlayer[], posKey: string): string[] {
  const base = players[0]
  if (!base) return []
  // Get position-specific metrics first
  const positionMetrics = getDefaultMetricsForPosition(posKey)
  // Filter to only include metrics that have data
  return positionMetrics.filter(m => base[m] !== undefined && base[m] !== '')
}

// Quick summary card component
function QuickSummaryCard({
  label,
  players,
  getValue,
  formatValue,
  higherIsBetter = true,
  winnerLabel = 'Mejor',
  icon
}: {
  label: string
  players: EnrichedPlayer[]
  getValue: (p: EnrichedPlayer) => number
  formatValue: (v: number) => string
  higherIsBetter?: boolean
  winnerLabel?: string
  icon: React.ReactNode
}) {
  const values = players.map(getValue)
  const best = higherIsBetter ? Math.max(...values) : Math.min(...values)
  const winnerIndex = values.indexOf(best)
  const allEqual = values.every(v => v === best)

  return (
    <div className="bg-white dark:bg-apple-gray-800 rounded-2xl p-4 shadow-sm border border-apple-gray-100 dark:border-apple-gray-700">
      <div className="flex items-center gap-2 text-apple-gray-500 dark:text-apple-gray-400 mb-3">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className={`grid gap-2 ${players.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {players.map((p, i) => {
          const isWinner = !allEqual && values[i] === best
          return (
            <div
              key={p.Jugador}
              className={`text-center p-3 rounded-xl transition-all ${
                isWinner
                  ? 'bg-gradient-to-br from-brand-green/10 to-emerald-500/10 ring-2 ring-brand-green/30'
                  : 'bg-apple-gray-50 dark:bg-apple-gray-700/50'
              }`}
            >
              <div
                className={`text-xl font-bold ${isWinner ? 'text-brand-green' : 'text-apple-gray-700 dark:text-apple-gray-300'}`}
              >
                {formatValue(values[i])}
              </div>
              <div className="text-2xs text-apple-gray-500 dark:text-apple-gray-400 mt-1 truncate">
                {p.Jugador.split(' ').pop()}
              </div>
              {isWinner && (
                <div className="mt-1">
                  <span className="inline-flex items-center gap-1 text-2xs font-semibold text-brand-green">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    {winnerLabel}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function ComparisonView({ players, allNormalized, allPlayers }: ComparisonViewProps) {
  const posKey = POSITION_MAP[players[0]?.['Posición']?.trim() ?? ''] ?? 'Defensor Central'
  const radarMetrics = RADAR_METRICS[posKey] ?? RADAR_METRICS['Defensor Central']

  // State for customizable metrics
  const [showMetricSelector, setShowMetricSelector] = useState(false)
  const [customMetrics, setCustomMetrics] = useState<string[] | null>(null)

  // Use custom metrics if set, otherwise position-based defaults
  const statsToCompare = useMemo(() => {
    if (customMetrics) return customMetrics.filter(m => players[0]?.[m] !== undefined)
    return getComparisonStats(players, posKey)
  }, [players, posKey, customMetrics])

  // Available metrics that have data
  const availableMetrics = useMemo(() => {
    return ALL_COMPARISON_METRICS.filter(m =>
      players[0]?.[m] !== undefined && players[0]?.[m] !== ''
    )
  }, [players])

  const toggleMetric = (metric: string) => {
    const current = customMetrics || statsToCompare
    if (current.includes(metric)) {
      setCustomMetrics(current.filter(m => m !== metric))
    } else {
      setCustomMetrics([...current, metric])
    }
  }

  const resetToDefaults = () => {
    setCustomMetrics(null)
    setShowMetricSelector(false)
  }

  const radarData = useMemo(() => {
    const normalizedValues = players.map(p => getNormalized(p, allNormalized, allPlayers, radarMetrics))
    return radarMetrics.map(metric => {
      const point: Record<string, unknown> = {
        subject: getMetricDisplayName(metric),
        fullMetric: metric,
        fullMark: 100,
      }
      players.forEach((p, i) => {
        point[`p${i}`] = Math.round(normalizedValues[i][metric] ?? 0)
      })
      return point
    })
  }, [players, allNormalized, allPlayers, radarMetrics])

  return (
    <div className="space-y-6">
      {/* QUICK SUMMARY - Who's better at a glance */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <QuickSummaryCard
          label="Score GG"
          players={players}
          getValue={p => p.ggScore ?? 0}
          formatValue={v => v.toFixed(1)}
          higherIsBetter={true}
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          }
        />
        <QuickSummaryCard
          label="Edad"
          players={players}
          getValue={p => p.ageNum || parseInt(p.Edad) || 0}
          formatValue={v => `${v} años`}
          higherIsBetter={false}
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
        />
        <QuickSummaryCard
          label="Valor de Mercado"
          players={players}
          getValue={p => p.marketValueRaw || 0}
          formatValue={v => v > 0 ? `€${(v / 1000000).toFixed(1)}M` : '—'}
          higherIsBetter={false}
          winnerLabel="Más económico"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* Player info cards */}
      <div className={`grid gap-4 ${players.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {players.map((player, i) => (
          <div
            key={player.Jugador}
            className="p-4 card-apple border-l-4 transition-all"
            style={{ borderLeftColor: PLAYER_COLORS[i] }}
          >
            <div className="flex items-center gap-3">
              {player.Imagen ? (
                <img src={player.Imagen} alt="" className="w-12 h-12 rounded-xl object-cover" />
              ) : (
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: PLAYER_COLORS[i] }}
                >
                  {player.Jugador.split(' ').map(w => w[0]).slice(0, 2).join('')}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-apple-gray-800 dark:text-white text-sm truncate">
                  {player.Jugador}
                </h3>
                <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 truncate">
                  {player.Equipo || '—'} · {player['Posición'] || '—'}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Radar charts */}
      <div className="card-apple p-5">
        <h4 className="text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-300 mb-5">
          Comparación Radar — {posKey}
        </h4>
        <ResponsiveContainer width="100%" height={360}>
          <RadarChart data={radarData} margin={{ top: 10, right: 40, bottom: 10, left: 40 }}>
            <PolarGrid stroke="#6E6E73" strokeOpacity={0.3} />
            <PolarAngleAxis
              dataKey="subject"
              tick={{ fontSize: 11, fill: '#86868B' }}
              tickLine={false}
            />
            {players.map((player, i) => (
              <Radar
                key={player.Jugador}
                name={player.Jugador.split(' ').pop() ?? player.Jugador}
                dataKey={`p${i}`}
                stroke={PLAYER_COLORS[i]}
                fill={PLAYER_COLORS[i]}
                fillOpacity={0.15}
                strokeWidth={2}
              />
            ))}
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(29, 29, 31, 0.95)',
                border: '1px solid rgba(110, 110, 115, 0.3)',
                borderRadius: '12px',
                fontSize: '12px',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
              }}
              formatter={(v: number, name: string) => [v, name]}
            />
            <Legend
              wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }}
              formatter={(v) => <span style={{ color: '#86868B' }}>{v}</span>}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Stats comparison - Compact table with customization */}
      <div className="card-apple overflow-hidden">
        <div className="px-5 py-4 border-b border-apple-gray-200/50 dark:border-apple-gray-700/50 bg-apple-gray-50 dark:bg-apple-gray-800/50 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-300">
              Métricas clave — {posKey}
            </h4>
            <p className="text-xs text-apple-gray-500 mt-0.5">
              {customMetrics ? 'Personalizado' : 'Métricas importantes para esta posición'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {customMetrics && (
              <button
                onClick={resetToDefaults}
                className="px-3 py-1.5 text-xs font-medium text-apple-gray-500 hover:text-apple-gray-700 dark:hover:text-apple-gray-300 transition-colors"
              >
                Restablecer
              </button>
            )}
            <button
              onClick={() => setShowMetricSelector(!showMetricSelector)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                showMetricSelector
                  ? 'bg-brand-green text-white'
                  : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600'
              }`}
            >
              {showMetricSelector ? 'Cerrar' : 'Personalizar'}
            </button>
          </div>
        </div>

        {/* Metric selector panel */}
        {showMetricSelector && (
          <div className="px-5 py-4 bg-apple-gray-50/50 dark:bg-apple-gray-800/30 border-b border-apple-gray-200/50 dark:border-apple-gray-700/50">
            <p className="text-xs text-apple-gray-500 mb-3">Selecciona las métricas a comparar:</p>
            <div className="flex flex-wrap gap-2">
              {availableMetrics.map(metric => {
                const isSelected = (customMetrics || statsToCompare).includes(metric)
                return (
                  <button
                    key={metric}
                    onClick={() => toggleMetric(metric)}
                    className={`px-3 py-1.5 text-xs rounded-full transition-all ${
                      isSelected
                        ? 'bg-brand-green text-white'
                        : 'bg-white dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 border border-apple-gray-200 dark:border-apple-gray-600 hover:border-brand-green'
                    }`}
                  >
                    {getMetricDisplayName(metric)}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Compact metrics table */}
        <div className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700/50">
          {statsToCompare.map(metric => {
            const values = players.map(p => getVal(p, metric))
            const maxVal = Math.max(...values)

            return (
              <div key={metric} className="px-5 py-3 flex items-center gap-4 hover:bg-apple-gray-50/50 dark:hover:bg-apple-gray-800/30 transition-colors">
                <div className="w-44 flex-shrink-0">
                  <span className="text-xs font-medium text-apple-gray-600 dark:text-apple-gray-400">
                    {getMetricDisplayName(metric)}
                  </span>
                </div>
                <div className={`flex-1 grid gap-4 ${players.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  {values.map((v, i) => {
                    const isWinner = v === maxVal && values.filter(x => x === maxVal).length === 1
                    const barWidth = maxVal > 0 ? (v / maxVal) * 100 : 0

                    return (
                      <div key={i} className="flex items-center gap-3">
                        <div className="flex-1 h-1.5 bg-apple-gray-200 dark:bg-apple-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${barWidth}%`,
                              backgroundColor: isWinner ? PLAYER_COLORS[i] : PLAYER_COLORS[i] + '50'
                            }}
                          />
                        </div>
                        <span
                          className={`text-sm font-semibold tabular-nums min-w-[45px] text-right ${
                            isWinner ? '' : 'text-apple-gray-500 dark:text-apple-gray-400'
                          }`}
                          style={isWinner ? { color: PLAYER_COLORS[i] } : {}}
                        >
                          {v % 1 === 0 ? v.toFixed(0) : v.toFixed(2)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Summary footer */}
        <div className="px-5 py-4 border-t border-apple-gray-200/50 dark:border-apple-gray-700/50 bg-apple-gray-50/50 dark:bg-apple-gray-800/30">
          <div className="flex items-center justify-center gap-8">
            {players.map((p, i) => {
              const wins = statsToCompare.filter(metric => {
                const values = players.map(pl => getVal(pl, metric))
                const maxVal = Math.max(...values)
                return getVal(p, metric) === maxVal && values.filter(x => x === maxVal).length === 1
              }).length
              return (
                <div key={p.Jugador} className="text-center">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: PLAYER_COLORS[i] }}
                    />
                    <span
                      className="text-xl font-bold"
                      style={{ color: PLAYER_COLORS[i] }}
                    >
                      {wins}
                    </span>
                  </div>
                  <div className="text-2xs text-apple-gray-500 dark:text-apple-gray-400 mt-1">
                    {p.Jugador.split(' ').pop()}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
