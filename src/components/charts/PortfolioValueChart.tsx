import { useMemo, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend
} from 'recharts'
import type { MarketValueHistoryEntry, EnrichedPlayer } from '@/types'

interface PortfolioValueChartProps {
  data: MarketValueHistoryEntry[]
  players: EnrichedPlayer[]
  onPlayerClick?: (playerName: string) => void
}

function formatValue(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`
  return `${value}`
}

function formatFullValue(value: number): string {
  if (value >= 1_000_000) {
    return `€${(value / 1_000_000).toFixed(2)} millones`
  }
  return `€${value.toLocaleString('es-AR')}`
}

// Colors for player comparison
const PLAYER_COLORS = [
  '#22C55E', // green
  '#3B82F6', // blue
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // purple
  '#EC4899', // pink
]

interface TooltipPayloadItem {
  name: string
  value: number
  color: string
}

interface CustomTooltipProps {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: string
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null

  return (
    <div className="bg-white dark:bg-apple-gray-800 rounded-xl shadow-lg border border-apple-gray-200 dark:border-apple-gray-700 p-4">
      <p className="text-xs text-apple-gray-400 mb-2">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 mb-1">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-xs text-apple-gray-600 dark:text-apple-gray-300">{entry.name}:</span>
          <span className="text-xs font-bold text-apple-gray-800 dark:text-white">
            €{formatValue(entry.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

// Mini sparkline for player cards
function Sparkline({ data, trend }: { data: number[]; trend: 'up' | 'down' | 'stable' }) {
  if (data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const height = 24
  const width = 60

  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((val - min) / range) * height
    return `${x},${y}`
  }).join(' ')

  const color = trend === 'up' ? '#22C55E' : trend === 'down' ? '#EF4444' : '#F59E0B'

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Current value dot */}
      <circle
        cx={width}
        cy={height - ((data[data.length - 1] - min) / range) * height}
        r={3}
        fill={color}
      />
    </svg>
  )
}

export default function PortfolioValueChart({ data, players, onPlayerClick }: PortfolioValueChartProps) {
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([])
  const [view, setView] = useState<'portfolio' | 'compare' | 'trends'>('portfolio')

  // Group data by player
  const playerData = useMemo(() => {
    const grouped = new Map<string, MarketValueHistoryEntry[]>()
    for (const entry of data) {
      if (!grouped.has(entry.Jugador)) {
        grouped.set(entry.Jugador, [])
      }
      grouped.get(entry.Jugador)!.push(entry)
    }
    return grouped
  }, [data])

  // Get players with value history
  const playersWithHistory = useMemo(() => {
    return Array.from(playerData.keys())
  }, [playerData])

  // Sum of current market values for players WITHOUT history entries (fills gap vs KPI)
  const playersWithoutHistoryValue = useMemo(() => {
    const namesWithHistory = new Set(Array.from(playerData.keys()).map(n => n.trim().toLowerCase()))
    return players
      .filter(p => !namesWithHistory.has((p.Jugador || '').trim().toLowerCase()))
      .reduce((sum, p) => sum + (p.marketValueRaw || 0), 0)
  }, [playerData, players])

  // Calculate portfolio total over time
  const portfolioTimeline = useMemo(() => {
    // Get all unique dates
    const allDates = [...new Set(data.map(d => d.fecha.toISOString().split('T')[0]))]
      .sort()
      .map(d => new Date(d))

    // For each date, calculate cumulative portfolio value
    const timeline: { date: string; dateNum: number; total: number; [key: string]: number | string }[] = []

    for (let i = 0; i < allDates.length; i++) {
      const date = allDates[i]
      const isLastPoint = i === allDates.length - 1
      const point: { date: string; dateNum: number; total: number; [key: string]: number | string } = {
        date: date.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' }),
        dateNum: date.getTime(),
        total: 0
      }

      // For each player, get their value at or before this date
      for (const [playerName, entries] of playerData) {
        const relevantEntries = entries.filter(e => e.fecha <= date)
        if (relevantEntries.length > 0) {
          const latestValue = relevantEntries[relevantEntries.length - 1].valor
          point[playerName] = latestValue
          point.total += latestValue
        }
      }

      // On the last point, add players without history so total matches the KPI
      if (isLastPoint) {
        point.total += playersWithoutHistoryValue
      }

      timeline.push(point)
    }

    return timeline
  }, [data, playerData, playersWithoutHistoryValue])

  // Calculate player trends and stats
  const playerStats = useMemo(() => {
    const stats: {
      name: string
      currentValue: number
      peakValue: number
      initialValue: number
      change: number
      changePercent: number
      trend: 'up' | 'down' | 'stable'
      sparklineData: number[]
    }[] = []

    for (const [name, entries] of playerData) {
      if (entries.length === 0) continue

      const values = entries.map(e => e.valor)
      const current = values[values.length - 1]
      const initial = values[0]
      const peak = Math.max(...values)
      const change = current - initial
      const changePercent = (change / initial) * 100

      // Trend based on last 3 entries
      const lastThree = values.slice(-3)
      let trend: 'up' | 'down' | 'stable' = 'stable'
      if (lastThree.length >= 2) {
        const recentChange = (lastThree[lastThree.length - 1] - lastThree[0]) / lastThree[0]
        if (recentChange > 0.1) trend = 'up'
        else if (recentChange < -0.1) trend = 'down'
      }

      stats.push({
        name,
        currentValue: current,
        peakValue: peak,
        initialValue: initial,
        change,
        changePercent,
        trend,
        sparklineData: values,
      })
    }

    return stats.sort((a, b) => b.currentValue - a.currentValue)
  }, [playerData])

  // Top gainers and losers
  const topGainers = useMemo(() =>
    [...playerStats].sort((a, b) => b.changePercent - a.changePercent).slice(0, 3),
    [playerStats]
  )

  const topLosers = useMemo(() =>
    [...playerStats].sort((a, b) => a.changePercent - b.changePercent).slice(0, 3),
    [playerStats]
  )

  // Current portfolio total
  // Current total = sum of ALL internal players' current market value (matches KPI)
  const currentTotal = useMemo(() => {
    return players.reduce((sum, p) => sum + (p.marketValueRaw || 0), 0)
  }, [players])

  // Historical portfolio total (first entry)
  const historicalTotal = useMemo(() => {
    if (portfolioTimeline.length === 0) return 0
    return portfolioTimeline[0].total
  }, [portfolioTimeline])

  // Portfolio growth
  const portfolioGrowth = useMemo(() => {
    if (historicalTotal === 0) return 0
    return ((currentTotal - historicalTotal) / historicalTotal) * 100
  }, [currentTotal, historicalTotal])

  const togglePlayerSelection = (name: string) => {
    setSelectedPlayers(prev => {
      if (prev.includes(name)) {
        return prev.filter(n => n !== name)
      }
      if (prev.length >= 6) return prev // Max 6 players
      return [...prev, name]
    })
  }

  // Comparison chart data
  const comparisonData = useMemo(() => {
    if (selectedPlayers.length === 0) return []

    const allDates = new Set<string>()
    for (const name of selectedPlayers) {
      const entries = playerData.get(name) || []
      entries.forEach(e => allDates.add(e.fecha.toISOString().split('T')[0]))
    }

    const sortedDates = [...allDates].sort().map(d => new Date(d))

    return sortedDates.map(date => {
      const point: { date: string; [key: string]: number | string } = {
        date: date.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
      }

      for (const name of selectedPlayers) {
        const entries = playerData.get(name) || []
        const relevantEntries = entries.filter(e => e.fecha <= date)
        if (relevantEntries.length > 0) {
          point[name] = relevantEntries[relevantEntries.length - 1].valor
        }
      }

      return point
    })
  }, [selectedPlayers, playerData])

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-apple-gray-500">
        <p>No hay datos de evolución de valor disponibles</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* View Selector */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-apple-gray-100 dark:bg-apple-gray-800 rounded-lg p-1">
          {[
            { key: 'portfolio', label: 'Portfolio' },
            { key: 'compare', label: 'Comparar' },
            { key: 'trends', label: 'Tendencias' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setView(tab.key as typeof view)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                view === tab.key
                  ? 'bg-white dark:bg-apple-gray-700 text-apple-gray-800 dark:text-white shadow-sm'
                  : 'text-apple-gray-500 hover:text-apple-gray-700 dark:hover:text-apple-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {view === 'portfolio' && (
          <div className="text-right">
            <p className="text-xs text-apple-gray-400">Valor total del portfolio</p>
            <p className="text-xl font-bold text-apple-gray-800 dark:text-white">
              €{formatValue(currentTotal)}
            </p>
            <p className={`text-xs font-medium ${portfolioGrowth >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {portfolioGrowth >= 0 ? '+' : ''}{portfolioGrowth.toFixed(1)}% historico
            </p>
          </div>
        )}
      </div>

      {/* Portfolio View */}
      {view === 'portfolio' && (
        <div className="bg-apple-gray-50/50 dark:bg-apple-gray-800/30 rounded-xl p-4">
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={portfolioTimeline} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22C55E" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-apple-gray-200 dark:text-apple-gray-700" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(val) => `€${formatValue(val)}`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={70} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="total"
                  name="Portfolio Total"
                  stroke="#22C55E"
                  strokeWidth={2.5}
                  fill="url(#portfolioGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Compare View */}
      {view === 'compare' && (
        <div className="space-y-4">
          {/* Player selector */}
          <div>
            <p className="text-sm font-medium text-apple-gray-600 dark:text-apple-gray-400 mb-2">
              Selecciona jugadores para comparar (max 6)
            </p>
            <div className="flex flex-wrap gap-2">
              {playersWithHistory.map((name, i) => {
                const isSelected = selectedPlayers.includes(name)
                const colorIndex = selectedPlayers.indexOf(name)

                return (
                  <button
                    key={name}
                    onClick={() => togglePlayerSelection(name)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border-2 ${
                      isSelected
                        ? 'text-white'
                        : 'border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:border-apple-gray-300'
                    }`}
                    style={isSelected ? {
                      backgroundColor: PLAYER_COLORS[colorIndex],
                      borderColor: PLAYER_COLORS[colorIndex]
                    } : {}}
                  >
                    {name}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Comparison chart */}
          {selectedPlayers.length > 0 ? (
            <div className="bg-apple-gray-50/50 dark:bg-apple-gray-800/30 rounded-xl p-4">
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={comparisonData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-apple-gray-200 dark:text-apple-gray-700" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={(val) => `€${formatValue(val)}`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={70} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    {selectedPlayers.map((name, i) => (
                      <Line
                        key={name}
                        type="monotone"
                        dataKey={name}
                        stroke={PLAYER_COLORS[i]}
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                        activeDot={{ r: 6 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-apple-gray-400">
              Selecciona jugadores para ver la comparacion
            </div>
          )}
        </div>
      )}

      {/* Trends View */}
      {view === 'trends' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Top Gainers */}
          <div className="bg-emerald-50/50 dark:bg-emerald-900/10 rounded-xl p-4 border border-emerald-200/50 dark:border-emerald-800/30">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <h4 className="font-semibold text-emerald-800 dark:text-emerald-400">Mayor Crecimiento</h4>
            </div>
            <div className="space-y-3">
              {topGainers.map((p, i) => (
                <button
                  key={p.name}
                  onClick={() => onPlayerClick?.(p.name)}
                  className="w-full flex items-center gap-3 p-3 bg-white dark:bg-apple-gray-800 rounded-lg hover:shadow-md transition-all text-left"
                >
                  <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-apple-gray-800 dark:text-white text-sm truncate">{p.name}</p>
                    <p className="text-xs text-apple-gray-500">
                      €{formatValue(p.initialValue)} → €{formatValue(p.currentValue)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      +{p.changePercent.toFixed(0)}%
                    </p>
                    <Sparkline data={p.sparklineData} trend="up" />
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Top Losers */}
          <div className="bg-red-50/50 dark:bg-red-900/10 rounded-xl p-4 border border-red-200/50 dark:border-red-800/30">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6" />
                </svg>
              </div>
              <h4 className="font-semibold text-red-800 dark:text-red-400">Mayor Caida</h4>
            </div>
            <div className="space-y-3">
              {topLosers.map((p, i) => (
                <button
                  key={p.name}
                  onClick={() => onPlayerClick?.(p.name)}
                  className="w-full flex items-center gap-3 p-3 bg-white dark:bg-apple-gray-800 rounded-lg hover:shadow-md transition-all text-left"
                >
                  <div className="w-7 h-7 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center text-xs font-bold text-red-600 dark:text-red-400">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-apple-gray-800 dark:text-white text-sm truncate">{p.name}</p>
                    <p className="text-xs text-apple-gray-500">
                      €{formatValue(p.peakValue)} → €{formatValue(p.currentValue)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-red-600 dark:text-red-400">
                      {p.changePercent.toFixed(0)}%
                    </p>
                    <Sparkline data={p.sparklineData} trend="down" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Player cards with sparklines */}
      {view === 'trends' && (
        <div className="mt-6">
          <h4 className="text-sm font-semibold text-apple-gray-600 dark:text-apple-gray-400 mb-3">
            Todos los jugadores
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {playerStats.map(p => (
              <button
                key={p.name}
                onClick={() => onPlayerClick?.(p.name)}
                className="flex items-center justify-between p-3 bg-white dark:bg-apple-gray-800 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 hover:shadow-md transition-all text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-apple-gray-800 dark:text-white text-sm truncate">{p.name}</p>
                  <p className="text-xs text-apple-gray-500">€{formatValue(p.currentValue)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold ${
                    p.trend === 'up' ? 'text-emerald-500' :
                    p.trend === 'down' ? 'text-red-500' :
                    'text-amber-500'
                  }`}>
                    {p.trend === 'up' ? '↑' : p.trend === 'down' ? '↓' : '→'}
                  </span>
                  <Sparkline data={p.sparklineData} trend={p.trend} />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
