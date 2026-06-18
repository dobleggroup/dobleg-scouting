import { useState, useMemo } from 'react'
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { usePlayersList } from '@/hooks/usePlayerStats'
import type { PlayerWithScore } from '@/types/scoring'
import {
  API_METRICS,
  METRICS_BY_POSITION,
  getMetricValue,
  type ApiMetricKey,
} from '@/constants/apiMetrics'
import { getScoreColorClass } from '@/components/ui/ScoreBar'
import AddToReportButton from '@/components/pdf/AddToReportButton'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { fuzzyMatch } from '@/lib/search'

// ─── Constants ────────────────────────────────────────────────────────────────

const PLAYER_COLORS = ['#22C55E', '#3B82F6', '#F59E0B']

// ─── Helpers ─────────────────────────────────────────────────────────────────

const METRIC_BY_KEY = new Map(API_METRICS.map(m => [m.key, m]))

function getPlayerMetricValue(player: PlayerWithScore, key: ApiMetricKey): number | null {
  if (!player.season_scores?.length) return null
  return getMetricValue(player.season_scores[0], key)
}

function getAge(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null
  return Math.floor((Date.now() - new Date(birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
}

function formatMarketValue(mv: number | null): string {
  if (mv == null) return '—'
  if (mv >= 1_000_000) return `€${(mv / 1_000_000).toFixed(mv % 1_000_000 === 0 ? 0 : 1)}M`
  if (mv >= 1_000) return `€${(mv / 1_000).toFixed(0)}K`
  return `€${mv}`
}

function scoreColor(s: number | null | undefined) {
  return getScoreColorClass(s ?? null, '10')
}

// ─── PlayerSearch (API-based) ─────────────────────────────────────────────────

interface PlayerSearchProps {
  players: PlayerWithScore[]
  selected: PlayerWithScore | null
  onSelect: (p: PlayerWithScore | null) => void
  color: string
  label: string
}

function PlayerSearch({ players, selected, onSelect, color, label }: PlayerSearchProps) {
  const [searchText, setSearchText] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)

  const searchResults = useMemo(() => {
    if (!searchText.trim()) return []
    return players
      .filter(p => fuzzyMatch(searchText, p.name) || fuzzyMatch(searchText, p.team?.name ?? ''))
      .slice(0, 10)
  }, [players, searchText])

  const handleSelect = (p: PlayerWithScore) => {
    onSelect(p)
    setSearchText('')
    setShowDropdown(false)
  }

  const initials = (name: string) =>
    name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')

  return (
    <div className="space-y-3">
      <label className="block text-xs font-semibold uppercase tracking-wider" style={{ color }}>{label}</label>

      {selected ? (
        <div
          className="flex items-center justify-between p-4 rounded-apple-lg border-2 bg-white dark:bg-apple-gray-800 shadow-apple dark:shadow-apple-dark transition-all"
          style={{ borderColor: color + '60' }}
        >
          <div className="flex items-center gap-3">
            {selected.photo ? (
              <img src={selected.photo} alt="" className="w-10 h-10 rounded-lg object-cover" />
            ) : (
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                style={{ backgroundColor: color }}
              >
                {initials(selected.name)}
              </div>
            )}
            <div>
              <p className="font-semibold text-apple-gray-800 dark:text-white text-sm">{selected.name}</p>
              <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400">
                {selected.team?.name ?? '—'} · {selected.primary_position ?? '—'}
              </p>
            </div>
          </div>
          <button
            onClick={() => { onSelect(null); setSearchText('') }}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-apple-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="relative">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Escribir nombre del jugador..."
              value={searchText}
              onChange={e => { setSearchText(e.target.value); setShowDropdown(true) }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              className="input-apple pl-9 pr-4 w-full"
              style={{ borderColor: searchText ? color : undefined }}
            />
          </div>
          {showDropdown && searchResults.length > 0 && (
            <div className="absolute z-20 mt-1 w-full bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 rounded-xl shadow-lg overflow-hidden">
              {searchResults.map(p => (
                <button
                  key={p.id}
                  onMouseDown={() => handleSelect(p)}
                  className="w-full px-4 py-3 text-left hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700 transition-colors flex items-center gap-3"
                >
                  {p.photo ? (
                    <img src={p.photo} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-apple-gray-200 dark:bg-apple-gray-600 flex items-center justify-center text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300">
                      {initials(p.name)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-apple-gray-800 dark:text-white text-sm truncate block">{p.name}</span>
                    <span className="text-xs text-apple-gray-500 dark:text-apple-gray-400 truncate block">
                      {p.team?.name ?? '—'} · {p.league?.name ?? '—'} · {p.primary_position ?? '—'}
                    </span>
                  </div>
                  {p.primary_score != null && (
                    <span className={`text-xs font-semibold tabular-nums ${scoreColor(p.primary_score)}`}>
                      {p.primary_score.toFixed(1)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── QuickSummaryCard ─────────────────────────────────────────────────────────

function QuickSummaryCard({
  label,
  players,
  getValue,
  formatValue,
  higherIsBetter = true,
  winnerLabel = 'Mejor',
  icon,
}: {
  label: string
  players: PlayerWithScore[]
  getValue: (p: PlayerWithScore) => number
  formatValue: (v: number) => string
  higherIsBetter?: boolean
  winnerLabel?: string
  icon: React.ReactNode
}) {
  const values = players.map(getValue)
  const best = higherIsBetter ? Math.max(...values) : Math.min(...values)
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
              key={p.id}
              className={`text-center p-3 rounded-xl transition-all ${
                isWinner
                  ? 'bg-gradient-to-br from-brand-green/10 to-emerald-500/10 ring-2 ring-brand-green/30'
                  : 'bg-apple-gray-50 dark:bg-apple-gray-700/50'
              }`}
            >
              <div className={`text-xl font-bold ${isWinner ? 'text-brand-green' : 'text-apple-gray-700 dark:text-apple-gray-300'}`}>
                {formatValue(values[i])}
              </div>
              <div className="text-2xs text-apple-gray-500 dark:text-apple-gray-400 mt-1 truncate">
                {p.name.split(' ').pop()}
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

// ─── ComparisonContent (replaces ComparisonView) ──────────────────────────────

function ComparisonContent({ players }: { players: PlayerWithScore[] }) {
  // Derive position from first player (for defaults)
  const pos = players[0]?.primary_position ?? null

  // Active metrics: position defaults capped at 8, or all
  const defaultMetrics = useMemo<ApiMetricKey[]>(() => {
    if (!pos) return API_METRICS.map(m => m.key).slice(0, 8)
    return (METRICS_BY_POSITION[pos] ?? API_METRICS.map(m => m.key)).slice(0, 8)
  }, [pos])

  const [customMetrics, setCustomMetrics] = useState<ApiMetricKey[] | null>(null)
  const [showMetricSelector, setShowMetricSelector] = useState(false)

  const activeMetrics = customMetrics ?? defaultMetrics

  // Available metrics: any metric where at least one player has data
  const availableMetrics = useMemo<ApiMetricKey[]>(() => {
    return API_METRICS
      .map(m => m.key)
      .filter(key => players.some(p => getPlayerMetricValue(p, key) !== null))
  }, [players])

  const toggleMetric = (key: ApiMetricKey) => {
    const current = customMetrics ?? defaultMetrics
    setCustomMetrics(
      current.includes(key) ? current.filter(k => k !== key) : [...current, key]
    )
  }

  // ─── Radar data (normalized 0-100 per metric) ────────────────────────────

  const radarData = useMemo(() => {
    return activeMetrics.map(key => {
      const meta = METRIC_BY_KEY.get(key)
      const rawVals = players.map(p => getPlayerMetricValue(p, key) ?? 0)
      const minV = Math.min(...rawVals)
      const maxV = Math.max(...rawVals)
      const range = maxV - minV || 1
      const norm = (v: number) => Math.max(0, Math.min(100, ((v - minV) / range) * 100))

      const point: Record<string, unknown> = {
        subject: meta?.short ?? key,
        fullMark: 100,
      }
      players.forEach((p, i) => {
        point[`p${i}`] = Math.round(norm(getPlayerMetricValue(p, key) ?? 0))
      })
      return point
    })
  }, [players, activeMetrics])

  // ─── Stats table winners ─────────────────────────────────────────────────

  const metricWins = useMemo(() => {
    return players.map((_, pi) =>
      activeMetrics.filter(key => {
        const meta = METRIC_BY_KEY.get(key)
        const vals = players.map(p => getPlayerMetricValue(p, key) ?? 0)
        const best = meta?.higherIsBetter !== false ? Math.max(...vals) : Math.min(...vals)
        return vals[pi] === best && vals.filter(v => v === best).length === 1
      }).length
    )
  }, [players, activeMetrics])

  return (
    <div className="space-y-6">
      {/* Quick summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <QuickSummaryCard
          label="Score GG"
          players={players}
          getValue={p => p.primary_score ?? 0}
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
          getValue={p => getAge(p.birth_date) ?? 0}
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
          getValue={p => p.market_value_eur ?? 0}
          formatValue={v => v > 0 ? formatMarketValue(v) : '—'}
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
            key={player.id}
            className="p-4 card-apple border-l-4 transition-all"
            style={{ borderLeftColor: PLAYER_COLORS[i] }}
          >
            <div className="flex items-center gap-3">
              {player.photo ? (
                <img src={player.photo} alt="" className="w-12 h-12 rounded-xl object-cover" />
              ) : (
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: PLAYER_COLORS[i] }}
                >
                  {player.name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('')}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-apple-gray-800 dark:text-white text-sm truncate">{player.name}</h3>
                <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 truncate">
                  {player.team?.name ?? '—'} · {player.primary_position ?? '—'}
                  {player.league?.name ? ` · ${player.league.name}` : ''}
                </p>
                {player.primary_score != null && (
                  <p className={`text-xs font-semibold mt-0.5 ${scoreColor(player.primary_score)}`}>
                    Score GG: {player.primary_score.toFixed(1)}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Radar chart */}
      {activeMetrics.length >= 3 && (
        <div className="card-apple p-5">
          <h4 className="text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-300 mb-5">
            Comparación Radar{pos ? ` — ${pos}` : ''}
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
                  key={player.id}
                  name={player.name.split(' ').pop() ?? player.name}
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
      )}

      {/* Stats comparison table */}
      <div className="card-apple overflow-hidden">
        <div className="px-5 py-4 border-b border-apple-gray-200/50 dark:border-apple-gray-700/50 bg-apple-gray-50 dark:bg-apple-gray-800/50 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-300">
              Métricas clave{pos ? ` — ${pos}` : ''}
            </h4>
            <p className="text-xs text-apple-gray-500 mt-0.5">
              {customMetrics ? 'Personalizado' : 'Métricas importantes para esta posición'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {customMetrics && (
              <button
                onClick={() => { setCustomMetrics(null); setShowMetricSelector(false) }}
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
              {availableMetrics.map(key => {
                const meta = METRIC_BY_KEY.get(key)
                const isSelected = activeMetrics.includes(key)
                return (
                  <button
                    key={key}
                    onClick={() => toggleMetric(key)}
                    className={`px-3 py-1.5 text-xs rounded-full transition-all ${
                      isSelected
                        ? 'bg-brand-green text-white'
                        : 'bg-white dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 border border-apple-gray-200 dark:border-apple-gray-600 hover:border-brand-green'
                    }`}
                  >
                    {meta?.label ?? key}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Metrics rows */}
        <div className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700/50">
          {activeMetrics.map(key => {
            const meta = METRIC_BY_KEY.get(key)
            const rawVals = players.map(p => getPlayerMetricValue(p, key) ?? 0)
            const best = meta?.higherIsBetter !== false ? Math.max(...rawVals) : Math.min(...rawVals)
            const maxAbs = Math.max(...rawVals.map(Math.abs)) || 1

            return (
              <div key={key} className="px-5 py-3 flex items-center gap-4 hover:bg-apple-gray-50/50 dark:hover:bg-apple-gray-800/30 transition-colors">
                <div className="w-44 flex-shrink-0">
                  <span className="text-xs font-medium text-apple-gray-600 dark:text-apple-gray-400">
                    {meta?.label ?? key}
                  </span>
                </div>
                <div className={`flex-1 grid gap-4 ${players.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  {rawVals.map((v, i) => {
                    const isWinner = v === best && rawVals.filter(x => x === best).length === 1
                    const barWidth = (v / maxAbs) * 100
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <div className="flex-1 h-1.5 bg-apple-gray-200 dark:bg-apple-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${barWidth}%`,
                              backgroundColor: isWinner ? PLAYER_COLORS[i] : PLAYER_COLORS[i] + '50',
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
            {players.map((p, i) => (
              <div key={p.id} className="text-center">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PLAYER_COLORS[i] }} />
                  <span className="text-xl font-bold" style={{ color: PLAYER_COLORS[i] }}>
                    {metricWins[i]}
                  </span>
                </div>
                <div className="text-2xs text-apple-gray-500 dark:text-apple-gray-400 mt-1">
                  {p.name.split(' ').pop()}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ComparisonPage() {
  const { players: allPlayers, loading } = usePlayersList({ pageSize: 500 })

  const [playerA, setPlayerA] = useState<PlayerWithScore | null>(null)
  const [playerB, setPlayerB] = useState<PlayerWithScore | null>(null)
  const [playerC, setPlayerC] = useState<PlayerWithScore | null>(null)
  const [showC, setShowC] = useState(false)

  const activePlayers = [playerA, playerB, ...(showC && playerC ? [playerC] : [])].filter(Boolean) as PlayerWithScore[]
  const canCompare = activePlayers.length >= 2

  if (loading) return <LoadingSpinner fullScreen message="Cargando datos para comparación..." />

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-apple-gray-800 dark:text-white tracking-tight">
            Comparación de Jugadores
          </h1>
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
            Selecciona 2 o 3 jugadores para comparar
          </p>
        </div>
        {canCompare && (
          <div className="flex items-center gap-2">
            <AddToReportButton
              type="comparison"
              title={`Comparacion: ${activePlayers.map(p => p.name).join(' vs ')}`}
              description={`Comparacion detallada de ${activePlayers.length} jugadores.`}
              captureId="comparison-container"
              source="Comparacion"
              variant="compact"
              players={activePlayers.map(p => p.name)}
            />
          </div>
        )}
      </div>

      {/* Player selectors */}
      <div className="card-apple p-6 mb-6">
        <div className="flex flex-wrap items-start gap-5">
          <div className="flex-1 min-w-[240px]">
            <PlayerSearch
              players={allPlayers}
              selected={playerA}
              onSelect={setPlayerA}
              color={PLAYER_COLORS[0]}
              label="Jugador A"
            />
          </div>
          <div className="flex-shrink-0 text-2xl font-bold text-apple-gray-300 dark:text-apple-gray-600 pt-8">VS</div>
          <div className="flex-1 min-w-[240px]">
            <PlayerSearch
              players={allPlayers}
              selected={playerB}
              onSelect={setPlayerB}
              color={PLAYER_COLORS[1]}
              label="Jugador B"
            />
          </div>
          {showC && (
            <>
              <div className="flex-shrink-0 text-2xl font-bold text-apple-gray-300 dark:text-apple-gray-600 pt-8">VS</div>
              <div className="flex-1 min-w-[240px]">
                <PlayerSearch
                  players={allPlayers}
                  selected={playerC}
                  onSelect={setPlayerC}
                  color={PLAYER_COLORS[2]}
                  label="Jugador C"
                />
              </div>
            </>
          )}
          <div className="flex flex-col gap-2 pt-8">
            {!showC && (
              <button
                onClick={() => setShowC(true)}
                className="btn-apple-secondary text-brand-green border-brand-green hover:bg-brand-green/10"
              >
                + 3er jugador
              </button>
            )}
            {showC && !playerC && (
              <button
                onClick={() => { setShowC(false); setPlayerC(null) }}
                className="text-sm text-apple-gray-400 hover:text-red-500 transition-colors"
              >
                Quitar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Comparison content */}
      {canCompare ? (
        <div id="comparison-container" className="animate-fade-in">
          <ComparisonContent players={activePlayers} />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
          <div className="w-20 h-20 bg-apple-gray-100 dark:bg-apple-gray-800 rounded-2xl flex items-center justify-center mb-5 shadow-apple dark:shadow-apple-dark">
            <svg className="w-10 h-10 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-apple-gray-800 dark:text-white mb-1.5">
            Selecciona al menos 2 jugadores
          </h3>
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 max-w-sm leading-relaxed">
            Busca y selecciona los jugadores que quieres comparar usando los campos de búsqueda de arriba.
          </p>
        </div>
      )}
    </div>
  )
}
