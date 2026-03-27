import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '@/context/DataContext'
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend, ResponsiveContainer, Tooltip } from 'recharts'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { RADAR_METRICS as POSITION_RADAR_METRICS, METRIC_ABBREVIATIONS, sortLeaguesByPriority } from '@/constants/scoring'
import { smartSearch } from '@/lib/search'
import AddToReportButton from '@/components/pdf/AddToReportButton'
import CopyChartButton from '@/components/ui/CopyChartButton'
import type { EnrichedPlayer } from '@/types'

// Metrics organized by category for dropdown
const METRIC_CATEGORIES = {
  'Goles y Creacion': [
    { key: 'ggScore', label: 'GG Score' },
    { key: 'Goles', label: 'Goles' },
    { key: 'Asistencias', label: 'Asistencias' },
    { key: 'xG', label: 'xG (Goles esperados)' },
    { key: 'xA/90', label: 'xA (Asistencias esperadas)' },
  ],
  'Ataque': [
    { key: 'Gambetas completadas/90', label: 'Gambetas' },
    { key: 'Duelos atacantes ganados/90', label: 'Duelos ofensivos' },
    { key: 'Acciones de ataque exitosas/90', label: 'Acciones de ataque' },
    { key: 'Jugadas claves/90', label: 'Jugadas claves' },
    { key: 'Carreras en progresión/90', label: 'Progresiones' },
    { key: 'Toques en el área de penalti/90', label: 'Toques en area' },
    { key: 'Centros precisos/90', label: 'Centros precisos' },
  ],
  'Defensa': [
    { key: 'Duelos ganados, %', label: 'Duelos ganados %' },
    { key: 'Duelos defensivos ganados, %', label: 'Duelos defensivos %' },
    { key: 'Duelos aéreos ganados, %', label: 'Duelos aereos %' },
    { key: 'Interceptaciones/90', label: 'Interceptaciones' },
    { key: 'Entradas/90', label: 'Entradas' },
  ],
  'Pases': [
    { key: 'Pases progresivos exitosos/90', label: 'Pases progresivos' },
    { key: 'Pases hacia adelante/90', label: 'Pases hacia adelante' },
    { key: 'Precisión pases largos, %', label: 'Precision pases largos %' },
    { key: 'Precisión pases hacia adelante, %', label: 'Precision pases %' },
  ],
}

// Flatten for lookups
const ALL_RADAR_METRICS = Object.values(METRIC_CATEGORIES).flat()

// Position presets
const POSITION_PRESETS = [
  { key: 'Defensor Central', label: 'Defensor Central' },
  { key: 'Lateral', label: 'Lateral' },
  { key: 'Volante central', label: 'Volante Central' },
  { key: 'Volante interno', label: 'Volante Interno' },
  { key: 'Extremo', label: 'Extremo' },
  { key: 'Delantero', label: 'Delantero' },
]

const PLAYER_COLORS = [
  { bg: 'bg-brand-green', stroke: '#22C55E', fill: 'rgba(34, 197, 94, 0.3)' },
  { bg: 'bg-blue-500', stroke: '#3B82F6', fill: 'rgba(59, 130, 246, 0.3)' },
  { bg: 'bg-amber-500', stroke: '#F59E0B', fill: 'rgba(245, 158, 11, 0.3)' },
  { bg: 'bg-purple-500', stroke: '#A855F7', fill: 'rgba(168, 85, 247, 0.3)' },
]

// Normalize value to 0-100 scale based on percentile (allValues must be pre-sorted)
function normalizeToPercentile(value: number, sortedValues: number[]): number {
  if (sortedValues.length === 0) return 50
  // Binary search for faster lookup
  let left = 0, right = sortedValues.length - 1
  while (left < right) {
    const mid = (left + right) >> 1
    if (sortedValues[mid] < value) left = mid + 1
    else right = mid
  }
  if (sortedValues[left] < value) return 100
  return Math.round((left / sortedValues.length) * 100)
}

export default function RadarAnalysisPage() {
  const { external, internal, loading } = useData()
  const allPlayers = useMemo(() => [...external, ...internal], [external, internal])

  // State
  const [selectedPlayers, setSelectedPlayers] = useState<EnrichedPlayer[]>([])
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([
    'ggScore', 'Goles', 'xG', 'Gambetas completadas/90', 'Duelos ganados, %', 'Jugadas claves/90'
  ])
  const [playerSearch, setPlayerSearch] = useState('')
  const [positionFilters, setPositionFilters] = useState<string[]>([])
  const [leagueFilters, setLeagueFilters] = useState<string[]>([])
  const [minMinutes, setMinMinutes] = useState<number>(0)
  const [ageRange, setAgeRange] = useState<[number, number]>([15, 40])
  const [marketValueRange, setMarketValueRange] = useState<[number, number]>([0, 100])
  const [contractMonthsMax, setContractMonthsMax] = useState<number>(60)
  const [selectedPreset, setSelectedPreset] = useState<string>('')
  const [showHiddenGems, setShowHiddenGems] = useState(false)

  // Calculate market value bounds from data
  const marketValueBounds = useMemo(() => {
    const values = allPlayers.map(p => p.marketValueRaw || 0).filter(v => v > 0)
    if (values.length === 0) return { min: 0, max: 100 }
    return { min: 0, max: Math.max(...values) / 1_000_000 } // in millions
  }, [allPlayers])

  // Update market value range when bounds change (data loads)
  useEffect(() => {
    if (marketValueBounds.max > 0) {
      setMarketValueRange([0, Math.ceil(marketValueBounds.max)])
    }
  }, [marketValueBounds.max])

  // Get unique positions and leagues
  const { positions, leagues } = useMemo(() => {
    const posSet = new Set<string>()
    const leagueSet = new Set<string>()
    allPlayers.forEach(p => {
      const pos = p['Posición'] || p['Posicion']
      if (pos) posSet.add(String(pos))
      if (p.Liga) leagueSet.add(p.Liga)
    })
    return {
      positions: [...posSet].sort(),
      leagues: sortLeaguesByPriority([...leagueSet]),
    }
  }, [allPlayers])

  // Filter players for search - using smart search (handles accents, case, etc.)
  const filteredPlayers = useMemo(() => {
    // First apply position/league/age/marketValue/contract/minutes filters
    const preFiltered = allPlayers.filter(p => {
      const playerPos = String(p['Posición'] || p['Posicion'] || '')
      if (positionFilters.length > 0 && !positionFilters.includes(playerPos)) return false
      if (leagueFilters.length > 0 && !leagueFilters.includes(p.Liga)) return false
      // Minutes filter
      if (minMinutes > 0 && (p.minutesPlayed || 0) < minMinutes) return false
      if (p.ageNum < ageRange[0] || p.ageNum > ageRange[1]) return false
      // Market value filter (in millions)
      const mvMillions = (p.marketValueRaw || 0) / 1_000_000
      if (mvMillions < marketValueRange[0] || mvMillions > marketValueRange[1]) return false
      // Contract months filter
      if (p.monthsRemaining !== null && p.monthsRemaining > contractMonthsMax) return false
      return true
    })
    // Then apply smart search
    return smartSearch(preFiltered, playerSearch, p => `${p.Jugador} ${p.Equipo}`, 10)
  }, [allPlayers, playerSearch, positionFilters, leagueFilters, minMinutes, ageRange, marketValueRange, contractMonthsMax])

  // Pre-calculate and cache percentile data for all metrics (only depends on allPlayers)
  const metricPercentiles = useMemo(() => {
    const percentiles: Record<string, number[]> = {}
    ALL_RADAR_METRICS.forEach(m => {
      const values = allPlayers
        .map(p => {
          const val = p[m.key]
          return typeof val === 'number' ? val : parseFloat(String(val || '0'))
        })
        .filter(v => !isNaN(v) && v > 0)
        .sort((a, b) => a - b) // Pre-sort for faster percentile calculation
      percentiles[m.key] = values
    })
    return percentiles
  }, [allPlayers])

  // Prepare radar chart data
  const radarData = useMemo(() => {
    if (selectedPlayers.length === 0) return []

    return selectedMetrics.map(metricKey => {
      const metric = ALL_RADAR_METRICS.find(m => m.key === metricKey)
      const dataPoint: Record<string, string | number> = {
        metric: metric?.label || METRIC_ABBREVIATIONS[metricKey] || metricKey,
      }

      selectedPlayers.forEach((player, i) => {
        const rawValue = player[metricKey]
        const numValue = typeof rawValue === 'number' ? rawValue : parseFloat(String(rawValue || '0'))
        const percentile = normalizeToPercentile(numValue, metricPercentiles[metricKey] || [])
        dataPoint[`player${i}`] = percentile
        dataPoint[`player${i}Raw`] = numValue
      })

      return dataPoint
    })
  }, [selectedPlayers, selectedMetrics, metricPercentiles])

  // Find top talents - players with high avg percentile in selected metrics, respecting filters
  const topTalents = useMemo(() => {
    if (!showHiddenGems) return []

    const gems: Array<{ player: EnrichedPlayer; topMetrics: string[]; avgPercentile: number }> = []

    allPlayers.forEach(player => {
      // Apply filters
      const playerPos = String(player['Posición'] || player['Posicion'] || '')
      if (positionFilters.length > 0 && !positionFilters.includes(playerPos)) return
      if (leagueFilters.length > 0 && !leagueFilters.includes(player.Liga)) return
      // Minutes filter
      if (minMinutes > 0 && (player.minutesPlayed || 0) < minMinutes) return
      if (player.ageNum < ageRange[0] || player.ageNum > ageRange[1]) return
      // Market value filter
      const mvMillions = (player.marketValueRaw || 0) / 1_000_000
      if (mvMillions < marketValueRange[0] || mvMillions > marketValueRange[1]) return
      // Contract months filter
      if (player.monthsRemaining !== null && player.monthsRemaining > contractMonthsMax) return

      const topMetrics: string[] = []
      let totalPercentile = 0
      let metricCount = 0

      selectedMetrics.forEach(metricKey => {
        const rawValue = player[metricKey]
        const numValue = typeof rawValue === 'number' ? rawValue : parseFloat(String(rawValue || '0'))
        if (isNaN(numValue) || numValue === 0) return

        const percentile = normalizeToPercentile(numValue, metricPercentiles[metricKey] || [])
        totalPercentile += percentile
        metricCount++

        // Mark as top metric if in top 30%
        if (percentile >= 70) {
          const label = ALL_RADAR_METRICS.find(m => m.key === metricKey)?.label || METRIC_ABBREVIATIONS[metricKey] || metricKey
          topMetrics.push(label)
        }
      })

      // Include if has data for most metrics and good avg percentile
      const avgPercentile = metricCount > 0 ? totalPercentile / metricCount : 0
      // More inclusive: at least 2 metrics with data and avg percentile >= 45
      if (metricCount >= Math.min(2, selectedMetrics.length) && avgPercentile >= 45) {
        gems.push({
          player,
          topMetrics,
          avgPercentile,
        })
      }
    })

    return gems
      .sort((a, b) => b.avgPercentile - a.avgPercentile)
      .slice(0, 50)
  }, [allPlayers, showHiddenGems, selectedMetrics, metricPercentiles, positionFilters, leagueFilters, minMinutes, ageRange, marketValueRange, contractMonthsMax])

  // Add player to comparison
  const addPlayer = (player: EnrichedPlayer) => {
    if (selectedPlayers.length >= 4) return
    if (selectedPlayers.find(p => p.Jugador === player.Jugador)) return
    setSelectedPlayers(prev => [...prev, player])
    setPlayerSearch('')
  }

  // Remove player from comparison
  const removePlayer = (index: number) => {
    setSelectedPlayers(prev => prev.filter((_, i) => i !== index))
  }

  // Toggle metric selection
  const toggleMetric = (key: string) => {
    setSelectedPreset('')
    setSelectedMetrics(prev =>
      prev.includes(key)
        ? prev.filter(k => k !== key)
        : prev.length < 8 ? [...prev, key] : prev
    )
  }

  // Apply position preset from scoring.ts
  const applyPreset = (positionKey: string) => {
    if (!positionKey) {
      setSelectedPreset('')
      return
    }
    const metrics = POSITION_RADAR_METRICS[positionKey]
    if (metrics) {
      setSelectedPreset(positionKey)
      setSelectedMetrics(metrics.slice(0, 8)) // Max 8 metrics
    }
  }

  if (loading) return <LoadingSpinner fullScreen message="Cargando datos..." />

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-apple-gray-800 dark:text-white tracking-tight">
          Detector de Talentos
        </h1>
        <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-1">
          Compara jugadores en multiples metricas y descubre joyas ocultas
        </p>
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <aside className="lg:col-span-1 space-y-6">
          {/* Player search */}
          <div className="bg-white dark:bg-apple-gray-800 rounded-2xl p-5 shadow-sm border border-apple-gray-100 dark:border-apple-gray-700">
            <h3 className="text-sm font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mb-4">
              Agregar Jugador ({selectedPlayers.length}/4)
            </h3>

            <div className="space-y-3">
              <div className="relative">
                <input
                  type="text"
                  value={playerSearch}
                  onChange={e => setPlayerSearch(e.target.value)}
                  placeholder="Buscar jugador..."
                  className="w-full px-4 py-2.5 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-700 border border-apple-gray-200 dark:border-apple-gray-600 text-apple-gray-800 dark:text-white placeholder-apple-gray-400 focus:outline-none focus:border-brand-green text-sm"
                />
                {filteredPlayers.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full bg-white dark:bg-apple-gray-800 rounded-xl shadow-xl border border-apple-gray-200 dark:border-apple-gray-700 py-1 max-h-48 overflow-auto">
                    {filteredPlayers.map((p, i) => (
                      <button
                        key={i}
                        onClick={() => addPlayer(p)}
                        className="w-full px-3 py-2 text-left hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700 transition-colors"
                      >
                        <div className="font-medium text-apple-gray-900 dark:text-white text-sm">{p.Jugador}</div>
                        <div className="text-xs text-apple-gray-500">{p.Equipo} - {p.Liga}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Position filter - multi-select */}
              <div>
                <p className="text-xs text-apple-gray-500 mb-1.5">Posiciones {positionFilters.length > 0 && `(${positionFilters.length})`}</p>
                <div className="flex flex-wrap gap-1">
                  {positions.map(p => (
                    <button
                      key={p}
                      onClick={() => setPositionFilters(prev =>
                        prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
                      )}
                      className={`px-2 py-1 rounded text-2xs transition-all ${
                        positionFilters.includes(p)
                          ? 'bg-brand-green text-gray-900 font-medium'
                          : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-400 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* League filter - multi-select */}
              <div>
                <p className="text-xs text-apple-gray-500 mb-1.5">Ligas {leagueFilters.length > 0 && `(${leagueFilters.length})`}</p>
                <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                  {leagues.map(l => (
                    <button
                      key={l}
                      onClick={() => setLeagueFilters(prev =>
                        prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l]
                      )}
                      className={`px-2 py-1 rounded text-2xs transition-all ${
                        leagueFilters.includes(l)
                          ? 'bg-brand-green text-gray-900 font-medium'
                          : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-400 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600'
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Minutes Filter */}
              <div className="pt-3 space-y-2">
                <div className="flex justify-between items-center text-xs text-apple-gray-500">
                  <span>Minutos jugados</span>
                  <span className="text-brand-green font-medium">
                    {minMinutes === 0 ? 'Todos' : `≥ ${minMinutes}`}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2000}
                  step={100}
                  value={minMinutes}
                  onChange={e => setMinMinutes(Number(e.target.value))}
                  className="w-full h-2 bg-apple-gray-200 dark:bg-apple-gray-600 rounded-full appearance-none cursor-pointer accent-brand-green"
                />
                <div className="flex gap-1">
                  {[0, 500, 1000, 1500].map(mins => (
                    <button
                      key={mins}
                      onClick={() => setMinMinutes(mins)}
                      className={`flex-1 py-1 text-2xs rounded transition-all ${
                        minMinutes === mins
                          ? 'bg-brand-green text-black font-medium'
                          : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500 hover:bg-apple-gray-200'
                      }`}
                    >
                      {mins === 0 ? 'Todos' : `${mins}+`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Age Range */}
              <div className="pt-3 space-y-2">
                <div className="flex justify-between items-center text-xs text-apple-gray-500">
                  <span>Edad</span>
                  <span className="text-brand-green font-medium">{ageRange[0]} - {ageRange[1]} años</span>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <input
                      type="range"
                      min={15}
                      max={35}
                      value={ageRange[0]}
                      onChange={e => setAgeRange([Math.min(Number(e.target.value), ageRange[1] - 1), ageRange[1]])}
                      className="w-full h-2 bg-apple-gray-200 dark:bg-apple-gray-600 rounded-full appearance-none cursor-pointer accent-brand-green"
                    />
                    <p className="text-2xs text-apple-gray-400 text-center mt-0.5">Min</p>
                  </div>
                  <div className="flex-1">
                    <input
                      type="range"
                      min={18}
                      max={40}
                      value={ageRange[1]}
                      onChange={e => setAgeRange([ageRange[0], Math.max(Number(e.target.value), ageRange[0] + 1)])}
                      className="w-full h-2 bg-apple-gray-200 dark:bg-apple-gray-600 rounded-full appearance-none cursor-pointer accent-brand-green"
                    />
                    <p className="text-2xs text-apple-gray-400 text-center mt-0.5">Max</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  {[
                    { label: 'Sub-21', range: [15, 21] as [number, number] },
                    { label: 'Sub-23', range: [15, 23] as [number, number] },
                    { label: 'Todos', range: [15, 40] as [number, number] },
                  ].map(preset => (
                    <button
                      key={preset.label}
                      onClick={() => setAgeRange(preset.range)}
                      className={`flex-1 py-1 text-2xs rounded transition-all ${
                        ageRange[0] === preset.range[0] && ageRange[1] === preset.range[1]
                          ? 'bg-brand-green text-black font-medium'
                          : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500 hover:bg-apple-gray-200'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Market Value Range */}
              <div className="pt-3 space-y-2">
                <div className="flex justify-between items-center text-xs text-apple-gray-500">
                  <span>Valor de mercado</span>
                  <span className="text-brand-green font-medium">
                    {marketValueRange[1] >= marketValueBounds.max ? 'Todos' : `≤ ${marketValueRange[1]}M`}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.ceil(marketValueBounds.max) || 50}
                  step={1}
                  value={marketValueRange[1]}
                  onChange={e => setMarketValueRange([0, Number(e.target.value)])}
                  className="w-full h-2 bg-apple-gray-200 dark:bg-apple-gray-600 rounded-full appearance-none cursor-pointer accent-brand-green"
                />
                <div className="flex gap-1">
                  {[2, 5, 10, Math.ceil(marketValueBounds.max) || 50].map(max => (
                    <button
                      key={max}
                      onClick={() => setMarketValueRange([0, max])}
                      className={`flex-1 py-1 text-2xs rounded transition-all ${
                        marketValueRange[1] === max
                          ? 'bg-brand-green text-black font-medium'
                          : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500 hover:bg-apple-gray-200'
                      }`}
                    >
                      {max === Math.ceil(marketValueBounds.max) ? 'Todos' : `≤${max}M`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Contract End Filter */}
              <div className="pt-3 space-y-2">
                <div className="flex justify-between items-center text-xs text-apple-gray-500">
                  <span>Fin de contrato</span>
                  <span className="text-brand-green font-medium">
                    {contractMonthsMax >= 60 ? 'Todos' : `≤ ${contractMonthsMax} meses`}
                  </span>
                </div>
                <input
                  type="range"
                  min={6}
                  max={60}
                  step={6}
                  value={contractMonthsMax}
                  onChange={e => setContractMonthsMax(Number(e.target.value))}
                  className="w-full h-2 bg-apple-gray-200 dark:bg-apple-gray-600 rounded-full appearance-none cursor-pointer accent-brand-green"
                />
                <div className="flex gap-1">
                  {[12, 24, 36, 60].map(months => (
                    <button
                      key={months}
                      onClick={() => setContractMonthsMax(months)}
                      className={`flex-1 py-1 text-2xs rounded transition-all ${
                        contractMonthsMax === months
                          ? 'bg-brand-green text-black font-medium'
                          : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500 hover:bg-apple-gray-200'
                      }`}
                    >
                      {months >= 60 ? 'Todos' : `${months}m`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Selected players */}
            {selectedPlayers.length > 0 && (
              <div className="mt-4 space-y-2">
                {selectedPlayers.map((player, i) => (
                  <div
                    key={player.Jugador}
                    className="flex items-center gap-2 p-2 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-700/50"
                  >
                    <div className={`w-3 h-3 rounded-full ${PLAYER_COLORS[i].bg}`} />
                    <div className="flex-1 min-w-0">
                      <Link
                        to={`/jugador/${encodeURIComponent(player.Jugador)}`}
                        className="text-sm font-medium text-apple-gray-800 dark:text-white truncate block hover:text-brand-green transition-colors"
                      >
                        {player.Jugador}
                      </Link>
                      <p className="text-xs text-apple-gray-500 truncate">{player.Equipo}</p>
                    </div>
                    <Link
                      to={`/jugador/${encodeURIComponent(player.Jugador)}`}
                      className="p-1 text-apple-gray-400 hover:text-brand-green transition-colors"
                      title="Ver ficha"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </Link>
                    <button
                      onClick={() => removePlayer(i)}
                      className="p-1 text-apple-gray-400 hover:text-red-500 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Position Presets - Dropdown */}
          <div className="bg-white dark:bg-apple-gray-800 rounded-2xl p-5 shadow-sm border border-apple-gray-100 dark:border-apple-gray-700">
            <h3 className="text-sm font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mb-3">
              Cargar métricas de posición
            </h3>
            <select
              value={selectedPreset}
              onChange={e => applyPreset(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-700 border border-apple-gray-200 dark:border-apple-gray-600 text-apple-gray-800 dark:text-white text-sm focus:outline-none focus:border-brand-green"
            >
              <option value="">Seleccionar posición...</option>
              {POSITION_PRESETS.map(p => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
            {selectedPreset && (
              <p className="text-xs text-apple-gray-500 mt-2">
                Se cargaron las métricas clave para {POSITION_PRESETS.find(p => p.key === selectedPreset)?.label}
              </p>
            )}
          </div>

          {/* Metric selector - by category */}
          <div className="bg-white dark:bg-apple-gray-800 rounded-2xl p-5 shadow-sm border border-apple-gray-100 dark:border-apple-gray-700">
            <h3 className="text-sm font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mb-3">
              Métricas ({selectedMetrics.length}/8)
            </h3>

            {/* Add from dropdown */}
            <select
              value=""
              onChange={e => {
                if (e.target.value && !selectedMetrics.includes(e.target.value) && selectedMetrics.length < 8) {
                  setSelectedPreset('')
                  setSelectedMetrics(prev => [...prev, e.target.value])
                }
              }}
              className="w-full px-3 py-2.5 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-700 border border-apple-gray-200 dark:border-apple-gray-600 text-apple-gray-800 dark:text-white text-sm focus:outline-none focus:border-brand-green mb-3"
            >
              <option value="">+ Agregar métrica...</option>
              {Object.entries(METRIC_CATEGORIES).map(([category, metrics]) => (
                <optgroup key={category} label={category}>
                  {metrics.map(m => (
                    <option
                      key={m.key}
                      value={m.key}
                      disabled={selectedMetrics.includes(m.key)}
                    >
                      {m.label} {selectedMetrics.includes(m.key) ? '✓' : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            {/* Selected metrics as removable tags */}
            <div className="space-y-1.5">
              {selectedMetrics.map(metricKey => {
                const metric = ALL_RADAR_METRICS.find(m => m.key === metricKey)
                return (
                  <div
                    key={metricKey}
                    className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-brand-green/10 border border-brand-green/30"
                  >
                    <span className="text-xs text-brand-green font-medium truncate">
                      {metric?.label || metricKey}
                    </span>
                    <button
                      onClick={() => {
                        setSelectedPreset('')
                        setSelectedMetrics(prev => prev.filter(k => k !== metricKey))
                      }}
                      className="ml-2 text-brand-green/60 hover:text-red-500 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )
              })}
              {selectedMetrics.length === 0 && (
                <p className="text-xs text-apple-gray-400 text-center py-2">
                  Selecciona metricas del dropdown
                </p>
              )}
            </div>
          </div>

          {/* Detect talents button */}
          <button
            onClick={() => setShowHiddenGems(!showHiddenGems)}
            disabled={selectedMetrics.length === 0}
            className={`w-full p-4 rounded-2xl text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              showHiddenGems
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg'
                : 'bg-white dark:bg-apple-gray-800 border border-apple-gray-100 dark:border-apple-gray-700 text-apple-gray-700 dark:text-apple-gray-300 hover:border-amber-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${showHiddenGems ? 'bg-white/20' : 'bg-amber-500/10'}`}>
                <svg className={`w-5 h-5 ${showHiddenGems ? 'text-white' : 'text-amber-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold">Detectar Talentos</p>
                <p className={`text-xs ${showHiddenGems ? 'text-white/80' : 'text-apple-gray-500'}`}>
                  {selectedMetrics.length === 0
                    ? 'Primero selecciona metricas arriba'
                    : `Buscar jugadores top en ${selectedMetrics.length} métrica${selectedMetrics.length > 1 ? 's' : ''}`
                  }
                </p>
              </div>
            </div>
          </button>

          {/* Info about talent detection */}
          {showHiddenGems && (
            <div className="text-xs text-apple-gray-500 dark:text-apple-gray-400 bg-apple-gray-50 dark:bg-apple-gray-800/50 rounded-xl p-3">
              <p className="font-medium mb-1">¿Cómo funciona?</p>
              <ul className="space-y-0.5 list-disc list-inside">
                <li>Analiza todos los jugadores con los filtros activos</li>
                <li>Calcula el percentil en cada métrica seleccionada</li>
                <li>Muestra los que tienen mejor promedio general</li>
              </ul>
            </div>
          )}
        </aside>

        {/* Main content */}
        <div className="lg:col-span-3 space-y-6">
          {/* Radar Chart */}
          <div id="radar-detector-container" className="bg-white dark:bg-apple-gray-800 rounded-2xl p-6 shadow-sm border border-apple-gray-100 dark:border-apple-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-apple-gray-800 dark:text-white">
                Comparacion Radar
              </h3>
              {selectedPlayers.length > 0 && (
                <div className="flex items-center gap-2">
                  <CopyChartButton targetId="radar-detector-container" filename={`radar_${selectedPlayers.map(p => p.Jugador.split(' ')[0]).join('_vs_')}`} />
                  <AddToReportButton
                    type="detector"
                    title={`Detector: ${selectedPlayers.map(p => p.Jugador).join(' vs ')}`}
                    description={`Comparacion radar de ${selectedPlayers.length} jugadores en ${selectedMetrics.length} metricas.`}
                    captureId="radar-detector-container"
                    source="Detector de Talentos"
                    variant="compact"
                    players={selectedPlayers.map(p => p.Jugador)}
                  />
                </div>
              )}
            </div>

            {selectedPlayers.length === 0 ? (
              <div className="h-96 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-apple-gray-100 dark:bg-apple-gray-700 flex items-center justify-center">
                    <svg className="w-8 h-8 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                  </div>
                  <p className="text-apple-gray-500 dark:text-apple-gray-400">
                    Agrega jugadores para comparar
                  </p>
                </div>
              </div>
            ) : (
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#374151" strokeOpacity={0.3} />
                    <PolarAngleAxis
                      dataKey="metric"
                      tick={{ fill: '#9CA3AF', fontSize: 11 }}
                    />
                    <PolarRadiusAxis
                      angle={30}
                      domain={[0, 100]}
                      tick={{ fill: '#6B7280', fontSize: 10 }}
                    />
                    {selectedPlayers.map((player, i) => (
                      <Radar
                        key={player.Jugador}
                        name={player.Jugador}
                        dataKey={`player${i}`}
                        stroke={PLAYER_COLORS[i].stroke}
                        fill={PLAYER_COLORS[i].fill}
                        fillOpacity={0.5}
                        strokeWidth={2}
                      />
                    ))}
                    <Legend />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        return (
                          <div className="bg-white dark:bg-apple-gray-800 rounded-lg shadow-lg border border-apple-gray-200 dark:border-apple-gray-700 p-3">
                            <p className="font-medium text-apple-gray-800 dark:text-white text-sm mb-2">
                              {payload[0]?.payload?.metric}
                            </p>
                            {payload.map((entry: any, i: number) => (
                              <div key={i} className="flex items-center gap-2 text-xs">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.stroke }} />
                                <span className="text-apple-gray-600 dark:text-apple-gray-400">{entry.name}:</span>
                                <span className="font-medium text-apple-gray-800 dark:text-white">
                                  P{entry.value} ({entry.payload[`player${i}Raw`]?.toFixed?.(1) ?? '-'})
                                </span>
                              </div>
                            ))}
                          </div>
                        )
                      }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Percentile Rankings */}
          {selectedPlayers.length > 0 && (
            <div className="bg-white dark:bg-apple-gray-800 rounded-2xl p-6 shadow-sm border border-apple-gray-100 dark:border-apple-gray-700">
              <h3 className="text-lg font-semibold text-apple-gray-800 dark:text-white mb-4">
                Rankings Percentiles
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-apple-gray-200 dark:border-apple-gray-700">
                      <th className="text-left py-3 px-2 text-xs font-semibold text-apple-gray-500 uppercase">Métrica</th>
                      {selectedPlayers.map((p, i) => (
                        <th key={p.Jugador} className="text-center py-3 px-2">
                          <div className="flex items-center justify-center gap-2">
                            <div className={`w-2.5 h-2.5 rounded-full ${PLAYER_COLORS[i].bg}`} />
                            <span className="text-xs font-semibold text-apple-gray-700 dark:text-apple-gray-300 truncate max-w-20">
                              {p.Jugador.split(' ').slice(-1)[0]}
                            </span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedMetrics.map(metricKey => {
                      const metric = ALL_RADAR_METRICS.find(m => m.key === metricKey)
                      // Calculate percentiles for all players to find the best
                      const playerPercentiles = selectedPlayers.map(player => {
                        const rawValue = player[metricKey]
                        const numValue = typeof rawValue === 'number' ? rawValue : parseFloat(String(rawValue || '0'))
                        return normalizeToPercentile(numValue, metricPercentiles[metricKey] || [])
                      })
                      const maxPercentile = Math.max(...playerPercentiles)
                      const hasMultiplePlayers = selectedPlayers.length > 1

                      return (
                        <tr key={metricKey} className="border-b border-apple-gray-100 dark:border-apple-gray-700/50">
                          <td className="py-3 px-2 text-sm text-apple-gray-600 dark:text-apple-gray-400">
                            {metric?.label || METRIC_ABBREVIATIONS[metricKey] || metricKey}
                          </td>
                          {selectedPlayers.map((player, i) => {
                            const rawValue = player[metricKey]
                            const numValue = typeof rawValue === 'number' ? rawValue : parseFloat(String(rawValue || '0'))
                            const percentile = playerPercentiles[i]
                            const isBest = hasMultiplePlayers && percentile === maxPercentile && percentile > 0
                            return (
                              <td key={player.Jugador} className="py-3 px-2 text-center">
                                <div className={`inline-flex flex-col items-center relative ${isBest ? 'px-2' : ''}`}>
                                  {isBest && (
                                    <div className="absolute -left-0.5 top-0 w-1 h-full bg-brand-green rounded-full" />
                                  )}
                                  <span className={`text-sm font-bold ${
                                    percentile >= 80 ? 'text-brand-green' :
                                    percentile >= 60 ? 'text-emerald-500' :
                                    percentile >= 40 ? 'text-amber-500' : 'text-red-500'
                                  }`}>
                                    P{percentile}
                                  </span>
                                  <span className="text-xs text-apple-gray-400">
                                    {numValue.toFixed(1)}
                                  </span>
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Talentos Detectados */}
          {showHiddenGems && (
            <div className="bg-gradient-to-br from-amber-500/5 to-orange-500/5 rounded-2xl p-6 border border-amber-200/50 dark:border-amber-800/50">
              <h3 className="text-lg font-semibold text-apple-gray-800 dark:text-white mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Talentos Detectados
                <span className="text-sm font-normal text-apple-gray-500">({topTalents.length})</span>
              </h3>

              {topTalents.length === 0 ? (
                <p className="text-apple-gray-500 dark:text-apple-gray-400 text-center py-8">
                  No se encontraron jugadores destacados con los filtros actuales
                </p>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {topTalents.map(({ player, topMetrics, avgPercentile }) => (
                    <button
                      key={player.Jugador}
                      onClick={() => addPlayer(player)}
                      disabled={selectedPlayers.length >= 4 || selectedPlayers.some(p => p.Jugador === player.Jugador)}
                      className="p-4 rounded-xl bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 hover:border-amber-400 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-apple-gray-800 dark:text-white">
                            {player.Jugador}
                          </p>
                          <p className="text-xs text-apple-gray-500">
                            {player.Equipo} - {player.Edad}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-brand-green">
                            {player.ggScore?.toFixed(1)}
                          </p>
                          <p className="text-xs text-apple-gray-400">
                            P{Math.round(avgPercentile)} avg
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {topMetrics.slice(0, 3).map(m => (
                          <span key={m} className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs">
                            {m}
                          </span>
                        ))}
                        {topMetrics.length > 3 && (
                          <span className="px-2 py-0.5 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500 text-xs">
                            +{topMetrics.length - 3}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Explanatory section */}
          <div className="bg-gradient-to-br from-apple-gray-50 to-apple-gray-100 dark:from-apple-gray-800/50 dark:to-apple-gray-900/50 rounded-2xl p-6 border border-apple-gray-200 dark:border-apple-gray-700">
            <h3 className="text-lg font-semibold text-apple-gray-800 dark:text-white mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Cómo interpretar los datos
            </h3>

            <div className="grid md:grid-cols-2 gap-6 text-sm text-apple-gray-600 dark:text-apple-gray-400">
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-apple-gray-800 dark:text-white mb-1">¿Qué es el Percentil?</h4>
                  <p>
                    El percentil (P) indica cómo se compara un jugador con todos los demás.
                    Un <span className="text-brand-green font-semibold">P85</span> significa que el jugador supera al 85% de los jugadores en esa métrica.
                    Cuanto más alto el número, mejor es el rendimiento comparado con el resto.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-apple-gray-800 dark:text-white mb-1">El número verde en cada jugador</h4>
                  <p>
                    Es el <span className="text-brand-green font-semibold">GG Score</span>, una puntuación propia que resume el rendimiento general
                    del jugador considerando múltiples estadísticas clave según su posición. Va de 0 a 10.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-apple-gray-800 dark:text-white mb-1">¿Qué significa "P84 avg"?</h4>
                  <p>
                    Es el <span className="font-semibold">promedio de percentiles</span> del jugador en todas las métricas seleccionadas.
                    Un P84 avg significa que, en promedio, ese jugador está en el top 16% en las métricas elegidas.
                    Es útil para encontrar jugadores consistentemente buenos.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-apple-gray-800 dark:text-white mb-1">La barra verde en comparaciones</h4>
                  <p>
                    Cuando comparás 2 o más jugadores, la <span className="inline-block w-1 h-3 bg-brand-green rounded-full align-middle mx-1"></span> barra verde
                    indica quién es el mejor en cada métrica. Te permite ver rápidamente las fortalezas de cada jugador.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
