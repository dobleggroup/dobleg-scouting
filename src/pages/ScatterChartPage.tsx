import { useMemo, useState, useRef } from 'react'
import CopyChartButton from '@/components/ui/CopyChartButton'
import { useNavigate } from 'react-router-dom'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine, Label } from 'recharts'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import AddToReportButton from '@/components/pdf/AddToReportButton'
import ScoutsGGBadge from '@/components/ui/ScoutsGGBadge'
import { usePlayersList, useLeagues } from '@/hooks/usePlayerStats'
import type { PlayerWithScore, Position } from '@/types/scoring'
import { POSITION_DISPLAY } from '@/types/scoring'
import { API_METRICS, getMetricValue, type ApiMetricKey } from '@/constants/apiMetrics'

// ─── Color interpolation: red (bad) → yellow (medium) → green (good) ────────
// Input range recalibrated to 1-10 (Score GG scale)
function getColorForScore(score: number, min: number, max: number): string {
  if (max === min) return '#F59E0B'
  const normalized = Math.max(0, Math.min(1, (score - min) / (max - min)))

  if (normalized <= 0.25) {
    const t = normalized / 0.25
    const r = 239
    const g = Math.round(68 + (158 - 68) * t)
    const b = Math.round(68 + (11 - 68) * t)
    return `rgb(${r}, ${g}, ${b})`
  } else if (normalized <= 0.5) {
    const t = (normalized - 0.25) / 0.25
    const r = Math.round(245 - (245 - 234) * t)
    const g = Math.round(158 + (179 - 158) * t)
    const b = Math.round(11 + (8 - 11) * t)
    return `rgb(${r}, ${g}, ${b})`
  } else if (normalized <= 0.75) {
    const t = (normalized - 0.5) / 0.25
    const r = Math.round(234 - (234 - 132) * t)
    const g = Math.round(179 + (204 - 179) * t)
    const b = Math.round(8 + (22 - 8) * t)
    return `rgb(${r}, ${g}, ${b})`
  } else {
    const t = (normalized - 0.75) / 0.25
    const r = Math.round(132 - (132 - 34) * t)
    const g = Math.round(204 + (197 - 204) * t)
    const b = Math.round(22 + (94 - 22) * t)
    return `rgb(${r}, ${g}, ${b})`
  }
}

function getDarkerColor(color: string): string {
  const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
  if (!match) return color
  const r = Math.max(0, Math.round(parseInt(match[1]) * 0.7))
  const g = Math.max(0, Math.round(parseInt(match[2]) * 0.7))
  const b = Math.max(0, Math.round(parseInt(match[3]) * 0.7))
  return `rgb(${r}, ${g}, ${b})`
}

// ─── Metric groups for organized dropdowns ───────────────────────────────────
interface MetricGroup {
  label: string
  keys: ApiMetricKey[]
}

const SCATTER_METRIC_GROUPS: MetricGroup[] = [
  {
    label: 'Gol & Creación',
    keys: ['goals_p90', 'assists_p90', 'shots_on_p90', 'shots_pct'],
  },
  {
    label: 'Pases',
    keys: ['passes_accuracy', 'passes_key_p90', 'passes_total_p90'],
  },
  {
    label: 'Regates & Conducción',
    keys: ['dribbles_success_p90', 'dribbles_pct', 'fouls_drawn_p90'],
  },
  {
    label: 'Duelos',
    keys: ['duels_won_pct'],
  },
  {
    label: 'Defensiva',
    keys: ['tackles_p90', 'interceptions_p90', 'blocks_p90'],
  },
  {
    label: 'Rating & Portero',
    keys: ['avg_rating', 'saves_p90', 'goals_conceded_p90', 'penalty_saved_avg', 'clean_sheet_pct'],
  },
]

// Lookup metric info by key
const METRIC_BY_KEY = new Map(API_METRICS.map(m => [m.key, m]))

function getMetricLabel(key: ApiMetricKey): string {
  return METRIC_BY_KEY.get(key)?.label ?? key
}

// ─── Safe metric value from player ───────────────────────────────────────────
function getPlayerMetricValue(player: PlayerWithScore, key: ApiMetricKey): number | null {
  if (!player.season_scores?.length) return null
  return getMetricValue(player.season_scores[0], key)
}

// ─── Analysis ────────────────────────────────────────────────────────────────
function generateAnalysis(
  data: Array<{ player: PlayerWithScore; x: number; y: number }>,
  xKey: ApiMetricKey,
  yKey: ApiMetricKey
): string {
  if (data.length === 0) return 'Selecciona una liga para ver el análisis.'

  const xAvg = data.reduce((sum, d) => sum + d.x, 0) / data.length
  const yAvg = data.reduce((sum, d) => sum + d.y, 0) / data.length
  const topRight = data.filter(d => d.x > xAvg && d.y > yAvg)
  const best = [...data].sort((a, b) => (b.x + b.y) - (a.x + a.y)).slice(0, 3)

  let analysis = `Se analizaron **${data.length} jugadores**.\n\n`
  analysis += `**¿Dónde buscar los mejores?**\n`
  analysis += `Los jugadores más completos están arriba a la derecha del gráfico (${topRight.length} jugadores).\n`
  analysis += `El color verde indica mayor Score GG.\n\n`

  if (best.length > 0) {
    analysis += `**Los 3 mejores en este análisis:**\n`
    best.forEach((d, i) => {
      const medal = i === 0 ? '1.' : i === 1 ? '2.' : '3.'
      analysis += `${medal} **${d.player.name}** - ${d.player.team?.name ?? ''}\n`
    })
    analysis += '\n'
  }

  const topRightPct = Math.round((topRight.length / data.length) * 100)
  if (topRightPct > 25) {
    analysis += `**Resumen:** Hay varios buenos jugadores para elegir (${topRightPct}% en zona elite).`
  } else if (topRightPct > 10) {
    analysis += `**Resumen:** Pocos jugadores destacan en ambas métricas. Revisa los marcados arriba.`
  } else {
    analysis += `**Resumen:** Es difícil encontrar jugadores buenos en ambas métricas a la vez. Considera priorizar una.`
  }

  return analysis
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ScatterChartPage() {
  const navigate = useNavigate()
  const chartRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)

  // Metric axis selectors
  const [xKey, setXKey] = useState<ApiMetricKey>('goals_p90')
  const [yKey, setYKey] = useState<ApiMetricKey>('assists_p90')

  // Filters
  const [selectedLeagueId, setSelectedLeagueId] = useState<number | null>(null)
  const [selectedPositions, setSelectedPositions] = useState<Position[]>([])
  const [minMatches, setMinMatches] = useState(5)
  const [ageRange, setAgeRange] = useState<[number, number]>([15, 40])

  // Search / highlighting
  const [searchTerm, setSearchTerm] = useState('')
  const [highlightedId, setHighlightedId] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  // Fetch leagues for the filter chips
  const leagues = useLeagues()

  // Fetch full player pool (500 max, filtered by position/league)
  const { players: allPlayers, loading } = usePlayersList({
    pageSize: 500,
    positions: selectedPositions.length > 0 ? selectedPositions : undefined,
    league_id: selectedLeagueId ?? undefined,
  })

  // Derived positions from loaded pool
  const availablePositions = useMemo<Position[]>(() => {
    const set = new Set<Position>()
    allPlayers.forEach(p => { if (p.primary_position) set.add(p.primary_position) })
    return (Array.from(set) as Position[]).sort()
  }, [allPlayers])

  // Age extremes from loaded pool
  const { minAge, maxAge } = useMemo(() => {
    const ages = allPlayers
      .map(p => {
        if (!p.birth_date) return null
        return Math.floor((Date.now() - new Date(p.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      })
      .filter((a): a is number => a !== null)
    return {
      minAge: ages.length > 0 ? Math.min(...ages) : 15,
      maxAge: ages.length > 0 ? Math.max(...ages) : 45,
    }
  }, [allPlayers])

  // Search autocomplete against loaded pool
  const searchResults = useMemo<PlayerWithScore[]>(() => {
    if (!searchTerm.trim()) return []
    const q = searchTerm.toLowerCase()
    return allPlayers
      .filter(p => p.name.toLowerCase().includes(q) || (p.team?.name ?? '').toLowerCase().includes(q))
      .slice(0, 8)
  }, [allPlayers, searchTerm])

  // Chart data: apply age + minMatches + both metric values must be non-null
  const chartData = useMemo(() => {
    if (!selectedLeagueId) return []

    return allPlayers
      .filter(p => {
        const score = p.season_scores[0]
        if (!score) return false
        if (score.matches_played < minMatches) return false
        if (p.birth_date) {
          const age = Math.floor((Date.now() - new Date(p.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
          if (age < ageRange[0] || age > ageRange[1]) return false
        }
        return true
      })
      .map(player => {
        const x = getPlayerMetricValue(player, xKey)
        const y = getPlayerMetricValue(player, yKey)
        if (x === null || y === null) return null
        return { player, x, y }
      })
      .filter((d): d is NonNullable<typeof d> => d !== null)
  }, [allPlayers, xKey, yKey, selectedLeagueId, minMatches, ageRange])

  // Score range for color scale (1-10)
  const { scoreMin, scoreMax } = useMemo(() => {
    const scores = chartData.map(d => d.player.primary_score).filter((s): s is number => s !== null)
    return {
      scoreMin: scores.length > 0 ? Math.min(...scores) : 1,
      scoreMax: scores.length > 0 ? Math.max(...scores) : 10,
    }
  }, [chartData])

  // Averages for reference lines
  const xAvg = chartData.length > 0 ? chartData.reduce((s, d) => s + d.x, 0) / chartData.length : 0
  const yAvg = chartData.length > 0 ? chartData.reduce((s, d) => s + d.y, 0) / chartData.length : 0

  // Analysis text
  const analysis = useMemo(() => generateAnalysis(chartData, xKey, yKey), [chartData, xKey, yKey])

  // Handlers
  const togglePosition = (pos: Position) => {
    setSelectedPositions(prev =>
      prev.includes(pos) ? prev.filter(p => p !== pos) : [...prev, pos]
    )
  }

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const highlightPlayer = (player: PlayerWithScore) => {
    setHighlightedId(player.id)
    setSearchTerm('')
    setTimeout(() => setHighlightedId(null), 5000)
  }

  // Export to PDF
  const exportToPDF = async () => {
    if (!chartRef.current) return
    setExporting(true)
    try {
      const canvas = await html2canvas(chartRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = pdf.internal.pageSize.getHeight()
      const ratio = Math.min((pdfWidth - 20) / canvas.width, (pdfHeight - 20) / canvas.height)
      const imgX = (pdfWidth - canvas.width * ratio) / 2
      pdf.addImage(imgData, 'PNG', imgX, 10, canvas.width * ratio, canvas.height * ratio)
      const fileName = `dispersion_${xKey}_vs_${yKey}_${new Date().toISOString().split('T')[0]}.pdf`
      pdf.save(fileName)
    } catch (err) {
      console.error('Error exporting PDF:', err)
    } finally {
      setExporting(false)
    }
  }

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.[0]?.payload) return null
    const d = payload[0].payload as { player: PlayerWithScore; x: number; y: number }
    const score = d.player.primary_score
    const color = score !== null ? getColorForScore(score, scoreMin, scoreMax) : '#9CA3AF'
    const isSelected = selectedIds.has(d.player.id)
    const age = d.player.birth_date
      ? Math.floor((Date.now() - new Date(d.player.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : null

    return (
      <div className={`bg-white dark:bg-apple-gray-800 rounded-2xl shadow-2xl border-2 p-4 max-w-xs ${isSelected ? 'border-blue-500' : 'border-apple-gray-200 dark:border-apple-gray-700'}`}>
        <div className="flex items-center gap-3 mb-3">
          {d.player.photo ? (
            <img src={d.player.photo} alt="" className={`w-11 h-11 rounded-full object-cover ring-2 ${isSelected ? 'ring-blue-500' : 'ring-apple-gray-200 dark:ring-apple-gray-600'}`} />
          ) : (
            <div
              className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white ring-2 ${isSelected ? 'ring-blue-500 bg-blue-500' : 'ring-white/30'}`}
              style={{ backgroundColor: isSelected ? undefined : color }}
            >
              {d.player.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-bold text-apple-gray-800 dark:text-white truncate">{d.player.name}</p>
              <ScoutsGGBadge playerName={d.player.name} />
              {isSelected && <span className="text-2xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">MARCADO</span>}
            </div>
            <p className="text-xs text-apple-gray-500 truncate">{d.player.team?.name ?? ''}</p>
            <p className="text-2xs text-apple-gray-400">
              {d.player.primary_position ? (POSITION_DISPLAY[d.player.primary_position] ?? d.player.primary_position) : ''}
              {age !== null ? ` · ${age} años` : ''}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 bg-apple-gray-50 dark:bg-apple-gray-700/50 rounded-lg">
            <p className="text-lg font-bold text-apple-gray-800 dark:text-white">{d.x.toFixed(2)}</p>
            <p className="text-2xs text-apple-gray-400 truncate">{getMetricLabel(xKey)}</p>
          </div>
          <div className="p-2 bg-apple-gray-50 dark:bg-apple-gray-700/50 rounded-lg">
            <p className="text-lg font-bold text-apple-gray-800 dark:text-white">{d.y.toFixed(2)}</p>
            <p className="text-2xs text-apple-gray-400 truncate">{getMetricLabel(yKey)}</p>
          </div>
          <div className="p-2 rounded-lg" style={{ backgroundColor: `${color}15` }}>
            <p className="text-lg font-bold" style={{ color }}>{score !== null ? score.toFixed(1) : '—'}</p>
            <p className="text-2xs text-apple-gray-400">Score GG</p>
          </div>
        </div>
        <p className="mt-2 text-center text-2xs text-apple-gray-400">
          Click para {isSelected ? 'desmarcar' : 'marcar'}
        </p>
      </div>
    )
  }

  if (loading && allPlayers.length === 0) return <LoadingSpinner fullScreen message="Cargando datos..." />

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-apple-gray-800 dark:text-white tracking-tight">
            Gráfico de Dispersión
          </h1>
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
            Compara jugadores en múltiples dimensiones
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AddToReportButton
            type="scatter"
            title={`Dispersión: ${getMetricLabel(xKey)} vs ${getMetricLabel(yKey)}`}
            description={`Gráfico de dispersión con ${chartData.length} jugadores. Color por Score GG.`}
            captureId="scatter-chart-container"
            source="Dispersion"
            variant="compact"
            players={chartData.filter(d => selectedIds.has(d.player.id)).map(d => d.player.name)}
          />
          <CopyChartButton targetId="scatter-chart-container" filename="dispersion" />
          <button
            onClick={exportToPDF}
            disabled={exporting || chartData.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-apple-gray-800 dark:bg-white text-white dark:text-apple-gray-800 rounded-xl font-medium text-sm hover:bg-apple-gray-700 dark:hover:bg-apple-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Exportando...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Exportar PDF
              </>
            )}
          </button>
        </div>
      </div>

      {/* Metric Selectors */}
      <div className="bg-white dark:bg-apple-gray-800 rounded-2xl border border-apple-gray-200 dark:border-apple-gray-700 p-6 mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* X Axis */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium text-apple-gray-500 uppercase tracking-wider">
              <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 text-xs font-bold">X</span>
              Eje Horizontal
            </label>
            <select
              value={xKey}
              onChange={e => setXKey(e.target.value as ApiMetricKey)}
              className="w-full px-4 py-3 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-700 border-0 text-apple-gray-800 dark:text-white font-medium focus:ring-2 focus:ring-brand-green"
            >
              {SCATTER_METRIC_GROUPS.map(group => (
                <optgroup key={group.label} label={group.label}>
                  {group.keys.map(k => (
                    <option key={k} value={k}>{getMetricLabel(k)}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Y Axis */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium text-apple-gray-500 uppercase tracking-wider">
              <span className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-xs font-bold">Y</span>
              Eje Vertical
            </label>
            <select
              value={yKey}
              onChange={e => setYKey(e.target.value as ApiMetricKey)}
              className="w-full px-4 py-3 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-700 border-0 text-apple-gray-800 dark:text-white font-medium focus:ring-2 focus:ring-brand-green"
            >
              {SCATTER_METRIC_GROUPS.map(group => (
                <optgroup key={group.label} label={group.label}>
                  {group.keys.map(k => (
                    <option key={k} value={k}>{getMetricLabel(k)}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        {/* Advanced Filters */}
        <div className="pt-5 border-t border-apple-gray-100 dark:border-apple-gray-700 space-y-4">
          {/* Row 1: Min Matches + Age Range */}
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-3">
              <label className="text-xs text-apple-gray-500 font-medium whitespace-nowrap">Min. partidos:</label>
              <div className="flex items-center gap-2 flex-1 max-w-[180px]">
                <input
                  type="range"
                  min={0}
                  max={30}
                  step={1}
                  value={minMatches}
                  onChange={e => setMinMatches(parseInt(e.target.value))}
                  className="flex-1 h-1.5 bg-apple-gray-200 dark:bg-apple-gray-600 rounded-full appearance-none cursor-pointer accent-brand-green"
                />
                <span className="text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 w-8 text-right tabular-nums">{minMatches}</span>
              </div>
            </div>

            {/* Age Range */}
            <div className="flex items-center gap-3">
              <label className="text-xs text-apple-gray-500 font-medium">Edad:</label>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 w-6 tabular-nums">{ageRange[0]}</span>
                <div className="relative w-28 h-5 flex items-center">
                  <input
                    type="range"
                    min={minAge}
                    max={maxAge}
                    value={ageRange[0]}
                    onChange={e => {
                      const val = parseInt(e.target.value)
                      if (val < ageRange[1]) setAgeRange([val, ageRange[1]])
                    }}
                    className="absolute w-full h-1.5 bg-apple-gray-200 dark:bg-apple-gray-600 rounded-full appearance-none cursor-pointer accent-brand-green"
                  />
                  <input
                    type="range"
                    min={minAge}
                    max={maxAge}
                    value={ageRange[1]}
                    onChange={e => {
                      const val = parseInt(e.target.value)
                      if (val > ageRange[0]) setAgeRange([ageRange[0], val])
                    }}
                    className="absolute w-full h-1.5 bg-transparent rounded-full appearance-none cursor-pointer accent-brand-green"
                  />
                </div>
                <span className="text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 w-6 tabular-nums">{ageRange[1]}</span>
              </div>
            </div>
          </div>

          {/* Row 2: League selector */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className={`text-xs font-medium ${!selectedLeagueId ? 'text-brand-green' : 'text-apple-gray-500'}`}>
                Liga {!selectedLeagueId && <span className="text-brand-green">*</span>}
              </label>
              {selectedLeagueId && (
                <button
                  onClick={() => setSelectedLeagueId(null)}
                  className="text-2xs text-apple-gray-400 hover:text-red-500 transition-colors"
                >
                  Limpiar
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {leagues.map(l => (
                <button
                  key={l.id}
                  onClick={() => setSelectedLeagueId(l.id === selectedLeagueId ? null : l.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    selectedLeagueId === l.id
                      ? 'bg-brand-green text-gray-900 shadow-sm'
                      : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-400 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600'
                  }`}
                >
                  {l.name}
                </button>
              ))}
            </div>
          </div>

          {/* Row 3: Positions Multi-select */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-xs font-medium text-apple-gray-500">Posiciones</label>
              {selectedPositions.length > 0 && (
                <button
                  onClick={() => setSelectedPositions([])}
                  className="text-2xs text-apple-gray-400 hover:text-red-500 transition-colors"
                >
                  Limpiar
                </button>
              )}
              <span className="text-2xs text-apple-gray-400">
                {selectedPositions.length === 0 ? '(todas)' : `(${selectedPositions.length})`}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {availablePositions.map(p => (
                <button
                  key={p}
                  onClick={() => togglePosition(p)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    selectedPositions.includes(p)
                      ? 'bg-blue-500 text-white shadow-sm'
                      : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-400 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600'
                  }`}
                >
                  {POSITION_DISPLAY[p] ?? p}
                </button>
              ))}
            </div>
          </div>

          {/* Row 4: Search + Summary */}
          <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700">
            {/* Player Search */}
            <div className="relative flex-1 min-w-[250px] max-w-md">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Buscar jugador para ubicar en el gráfico..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl bg-apple-gray-100 dark:bg-apple-gray-700 border-0 text-sm placeholder:text-apple-gray-400 focus:ring-2 focus:ring-brand-green"
                />
              </div>
              {searchResults.length > 0 && (
                <div className="absolute z-20 w-full mt-1 bg-white dark:bg-apple-gray-800 rounded-xl shadow-xl border border-apple-gray-200 dark:border-apple-gray-700 max-h-64 overflow-y-auto">
                  {searchResults.map(player => {
                    const isInChart = chartData.some(d => d.player.id === player.id)
                    return (
                      <button
                        key={player.id}
                        onClick={() => highlightPlayer(player)}
                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700 transition-colors text-left"
                      >
                        <div className="flex-1">
                          <p className="text-sm font-medium text-apple-gray-800 dark:text-white">{player.name}</p>
                          <p className="text-xs text-apple-gray-500">{player.team?.name ?? ''} · {player.league?.name ?? ''}</p>
                        </div>
                        {isInChart ? (
                          <span className="text-xs bg-brand-green/20 text-brand-green px-2 py-0.5 rounded-full">En gráfico</span>
                        ) : (
                          <span className="text-xs text-apple-gray-400">No visible</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Selected count */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-1 rounded-lg font-medium">
                  {selectedIds.size} marcado{selectedIds.size > 1 ? 's' : ''}
                </span>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-apple-gray-400 hover:text-red-500 transition-colors"
                >
                  Limpiar
                </button>
              </div>
            )}

            {/* Summary */}
            <div className="ml-auto flex items-center gap-3">
              <span className="text-sm font-medium text-apple-gray-600 dark:text-apple-gray-400">
                {chartData.length} jugadores
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div ref={chartRef} id="scatter-chart-container" className="bg-white dark:bg-apple-gray-800 rounded-2xl border border-apple-gray-200 dark:border-apple-gray-700 p-6">
        {/* Title for PDF */}
        <div className="mb-6 text-center">
          <h2 className="text-xl font-bold text-apple-gray-800 dark:text-white">
            {getMetricLabel(xKey)} vs {getMetricLabel(yKey)}
          </h2>
          <p className="text-sm text-apple-gray-500 mt-1">
            Color: Score GG (1-10) | {chartData.length} jugadores analizados
          </p>
        </div>

        {chartData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[500px] text-apple-gray-500">
            <div className="w-20 h-20 mb-6 rounded-2xl bg-gradient-to-br from-brand-green/20 to-brand-green/5 flex items-center justify-center">
              <svg className="w-10 h-10 text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
            </div>
            {!selectedLeagueId ? (
              <>
                <p className="text-xl font-semibold text-apple-gray-700 dark:text-apple-gray-300 mb-2">Selecciona una liga</p>
                <p className="text-sm text-apple-gray-400 max-w-md text-center">Elige una liga en los filtros de arriba para cargar los jugadores</p>
              </>
            ) : (
              <>
                <p className="text-lg font-medium mb-1">Sin datos disponibles</p>
                <p className="text-sm">Ajusta los filtros para ver jugadores</p>
              </>
            )}
          </div>
        ) : (
          <div className="h-[400px] sm:h-[600px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 30, right: 30, bottom: 70, left: 50 }}>
                <XAxis
                  type="number"
                  dataKey="x"
                  name={getMetricLabel(xKey)}
                  tick={{ fill: '#6B7280', fontSize: 11 }}
                  tickLine={{ stroke: '#E5E7EB' }}
                  axisLine={{ stroke: '#D1D5DB', strokeWidth: 1 }}
                  domain={['dataMin - 0.1', 'dataMax + 0.1']}
                >
                  <Label
                    value={getMetricLabel(xKey)}
                    position="bottom"
                    offset={45}
                    style={{ fill: '#374151', fontWeight: 600, fontSize: 13 }}
                  />
                </XAxis>
                <YAxis
                  type="number"
                  dataKey="y"
                  name={getMetricLabel(yKey)}
                  tick={{ fill: '#6B7280', fontSize: 11 }}
                  tickLine={{ stroke: '#E5E7EB' }}
                  axisLine={{ stroke: '#D1D5DB', strokeWidth: 1 }}
                  domain={['dataMin - 0.1', 'dataMax + 0.1']}
                >
                  <Label
                    value={getMetricLabel(yKey)}
                    angle={-90}
                    position="left"
                    offset={50}
                    style={{ fill: '#374151', fontWeight: 600, fontSize: 13 }}
                  />
                </YAxis>
                <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#9CA3AF' }} />
                <ReferenceLine
                  x={xAvg}
                  stroke="#6B7280"
                  strokeDasharray="6 4"
                  strokeOpacity={0.5}
                  strokeWidth={1}
                >
                  <Label value="Prom." position="top" fill="#6B7280" fontSize={9} />
                </ReferenceLine>
                <ReferenceLine
                  y={yAvg}
                  stroke="#6B7280"
                  strokeDasharray="6 4"
                  strokeOpacity={0.5}
                  strokeWidth={1}
                />
                <Scatter
                  data={chartData}
                  onClick={(data: any) => {
                    if (data?.payload?.player?.id != null) {
                      toggleSelect(data.payload.player.id)
                    }
                  }}
                >
                  {chartData.map((entry, index) => {
                    const score = entry.player.primary_score
                    const color = score !== null ? getColorForScore(score, scoreMin, scoreMax) : '#9CA3AF'
                    const strokeColor = getDarkerColor(color)
                    const isHighlighted = highlightedId === entry.player.id
                    const isSelected = selectedIds.has(entry.player.id)
                    const isSpecial = isHighlighted || isSelected

                    return (
                      <Cell
                        key={`cell-${index}`}
                        fill={isSpecial ? '#3B82F6' : color}
                        stroke={isSpecial ? '#1D4ED8' : strokeColor}
                        strokeWidth={isSpecial ? 4 : 2}
                        fillOpacity={isSpecial ? 1 : 0.8}
                        style={{
                          cursor: 'pointer',
                          filter: isHighlighted
                            ? 'drop-shadow(0 0 12px rgba(59, 130, 246, 0.8))'
                            : isSelected
                            ? 'drop-shadow(0 0 6px rgba(59, 130, 246, 0.5))'
                            : 'none',
                        }}
                      />
                    )
                  })}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Selected Players List */}
        {selectedIds.size > 0 && (
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border-2 border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-4 h-4 rounded-full bg-blue-500 shadow-md" />
              <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">Jugadores Marcados ({selectedIds.size})</span>
              <span className="text-xs text-blue-500 ml-auto">Click en un círculo para desmarcar</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {chartData.filter(d => selectedIds.has(d.player.id)).map((d, idx) => {
                const score = d.player.primary_score
                const color = score !== null ? getColorForScore(score, scoreMin, scoreMax) : '#9CA3AF'
                return (
                  <div key={d.player.id} className="flex items-center gap-3 p-2 bg-white dark:bg-apple-gray-800 rounded-xl group">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ring-2 ring-blue-500 ring-offset-2"
                      style={{ backgroundColor: color }}
                    >
                      {idx + 1}
                    </div>
                    <button
                      onClick={() => navigate(`/jugador/${encodeURIComponent(d.player.name)}?source=externo&apiId=${d.player.id}`)}
                      className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
                    >
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-apple-gray-800 dark:text-white truncate group-hover:text-brand-green transition-colors">{d.player.name}</p>
                        <ScoutsGGBadge playerName={d.player.name} />
                      </div>
                      <p className="text-xs text-apple-gray-500 truncate">
                        {d.player.team?.name ?? ''} · {score !== null ? `Score GG: ${score.toFixed(1)}` : ''}
                      </p>
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => navigate(`/jugador/${encodeURIComponent(d.player.name)}?source=externo&apiId=${d.player.id}`)}
                        className="p-1.5 hover:bg-brand-green/10 rounded-lg transition-colors"
                        title="Ver ficha"
                      >
                        <svg className="w-4 h-4 text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </button>
                      <button
                        onClick={() => toggleSelect(d.player.id)}
                        className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                        title="Desmarcar"
                      >
                        <svg className="w-4 h-4 text-apple-gray-400 hover:text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Color Scale Legend */}
        {chartData.length > 0 && (
          <div className="mt-6 p-5 bg-apple-gray-50 dark:bg-apple-gray-700/50 rounded-2xl">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-apple-gray-600 dark:text-apple-gray-300">Score GG:</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-apple-gray-500 font-medium">{scoreMin.toFixed(1)}</span>
                <div className="w-48 h-4 rounded-full bg-gradient-to-r from-red-500 via-yellow-400 to-green-500 shadow-inner" />
                <span className="text-xs text-apple-gray-500 font-medium">{scoreMax.toFixed(1)}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-apple-gray-500">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <span>Bajo</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <span>Medio</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span>Alto</span>
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-xs text-apple-gray-400">
              <div className="flex items-center gap-2">
                <div className="w-5 h-0 border-t border-dashed border-apple-gray-400" />
                <span>Línea de promedio</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-blue-500 ring-2 ring-blue-300" />
                <span>Jugador marcado</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
                <span>Click para marcar/desmarcar</span>
              </div>
            </div>
          </div>
        )}

        {/* Analysis Section */}
        <div className="mt-8 pt-6 border-t border-apple-gray-100 dark:border-apple-gray-700">
          <h3 className="font-bold text-lg text-apple-gray-800 dark:text-white mb-4 flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-green to-emerald-600 flex items-center justify-center shadow-lg shadow-brand-green/20">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </span>
            Análisis Inteligente
          </h3>
          <div className="bg-gradient-to-br from-apple-gray-50 to-white dark:from-apple-gray-700/50 dark:to-apple-gray-800 rounded-2xl p-6 border border-apple-gray-100 dark:border-apple-gray-700">
            <div className="prose prose-sm dark:prose-invert max-w-none text-apple-gray-600 dark:text-apple-gray-300 leading-relaxed">
              {analysis.split('\n').map((line, i) => {
                if (line.startsWith('**') && line.endsWith('**')) {
                  return <h4 key={i} className="font-bold text-apple-gray-800 dark:text-white mt-4 mb-2">{line.replace(/\*\*/g, '')}</h4>
                }
                if (line.startsWith('**')) {
                  const parts = line.split('**')
                  return (
                    <p key={i} className="mb-2">
                      <strong className="text-apple-gray-800 dark:text-white">{parts[1]}</strong>
                      {parts[2]}
                    </p>
                  )
                }
                if (line.startsWith('•')) {
                  return <p key={i} className="ml-4 text-sm">{line}</p>
                }
                if (line.match(/^\d\./)) {
                  return <p key={i} className="ml-2 py-1 border-l-2 border-brand-green pl-3">{line}</p>
                }
                return line ? <p key={i} className="mb-2">{line}</p> : <br key={i} />
              })}
            </div>
          </div>
        </div>

        {/* Footer for PDF */}
        <div className="mt-8 pt-4 border-t border-apple-gray-100 dark:border-apple-gray-700 flex items-center justify-between text-xs text-apple-gray-400">
          <span>Scout Platform by Doble G Sports</span>
          <span>{new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </div>
      </div>
    </div>
  )
}
