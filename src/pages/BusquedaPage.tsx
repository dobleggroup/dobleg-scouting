import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ScatterChart, Scatter, ReferenceLine,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, LabelList,
} from 'recharts'
import { fuzzyMatch } from '@/lib/search'
import { usePlayersList, usePositionMetricAverages } from '@/hooks/usePlayerStats'
import type { PlayerWithScore, Position, PositionMetricAverages } from '@/types/scoring'
import { POSITION_DISPLAY, displayPosition } from '@/types/scoring'
import {
  API_METRICS,
  METRICS_BY_POSITION,
  getMetricValue as apiGetMetricValue,
  type ApiMetricKey,
} from '@/constants/apiMetrics'
import { getScoreColorClass, getScoreBgClass } from '@/components/ui/ScoreBar'
import CanvaExportModal, { type CanvaExportOptions } from '@/components/pdf/CanvaExportModal'
import type { EnrichedPlayer } from '@/types'

// ─── Helper: adapt PlayerWithScore → EnrichedPlayer (for PDF/Canva export) ────

function playerToEnriched(p: PlayerWithScore): EnrichedPlayer {
  const score = p.season_scores[0]
  const age = p.birth_date
    ? Math.floor((Date.now() - new Date(p.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null

  const mv = p.market_value_eur
  const mvFormatted = mv == null ? '—'
    : mv >= 1_000_000 ? `€${(mv / 1_000_000).toFixed(mv % 1_000_000 === 0 ? 0 : 1)}M`
    : mv >= 1_000 ? `€${(mv / 1_000).toFixed(0)}K`
    : `€${mv}`

  return {
    Jugador: p.name,
    Liga: p.league?.name ?? '',
    Equipo: p.team?.name ?? '',
    'Posición': p.primary_position ?? '',
    'Posición específica': p.primary_position ?? '',
    Edad: age != null ? String(age) : '',
    'País de nacimiento': p.nationality ?? '',
    Pie: p.preferred_foot ?? '',
    Altura: p.height_cm != null ? String(p.height_cm) : '',
    'Valor de mercado (Transfermarkt)': mvFormatted,
    'Vencimiento contrato': p.contract_end_date ?? '',
    'Partidos jugados': score ? String(score.matches_played) : '',
    'Minutos jugados': '',
    Goles: score ? String(score.total_goals) : '',
    xG: '',
    Asistencias: score ? String(score.total_assists) : '',
    xA: '',
    id: String(p.id),
    Transfermkt: p.transfermarkt_url ?? '',
    Representante: p.agent ?? '',
    Imagen: p.photo ?? '',
    ggScore: p.primary_score,
    ggScorePercentile: p.primary_percentile,
    source: 'externo',
    contractStatus: 'ok',
    monthsRemaining: null,
    marketValueFormatted: mvFormatted,
    marketValueRaw: mv ?? 0,
    minutesPlayed: score ? score.matches_played * 90 : 0,
    ageNum: age ?? 0,
  } as unknown as EnrichedPlayer
}

// ─── Copy-as-PNG button ───────────────────────────────────────────────────────

function CopyBtn({ targetId, filename = 'grafico' }: { targetId: string; filename?: string }) {
  const [st, setSt] = useState<'idle' | 'busy' | 'done'>('idle')

  async function handle() {
    const el = document.getElementById(targetId)
    if (!el) return
    setSt('busy')
    try {
      const { default: html2canvas } = await import('html2canvas')
      const isDark = document.documentElement.classList.contains('dark')
      const canvas = await html2canvas(el, {
        scale: 2.5,
        useCORS: true,
        allowTaint: true,
        backgroundColor: isDark ? '#111111' : '#ffffff',
        onclone: (doc) => {
          if (isDark) doc.documentElement.classList.add('dark')
          else doc.documentElement.classList.remove('dark')
        },
      })
      canvas.toBlob(async (blob) => {
        if (!blob) { setSt('idle'); return }
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        } catch {
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url; a.download = `${filename}.png`; a.click()
          URL.revokeObjectURL(url)
        }
        setSt('done')
        setTimeout(() => setSt('idle'), 2200)
      })
    } catch { setSt('idle') }
  }

  return (
    <button
      onClick={handle}
      disabled={st === 'busy'}
      title="Copiar gráfico como PNG (para pegar en Canva u otros)"
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500 dark:text-apple-gray-400 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 transition-colors disabled:opacity-40 select-none"
    >
      {st === 'busy' ? (
        <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" strokeWidth="3" strokeOpacity="0.25" /><path d="M12 2a10 10 0 0 1 10 10" strokeWidth="3" /></svg>
      ) : st === 'done' ? (
        <svg className="w-3 h-3 text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
      ) : (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
      )}
      <span>{st === 'done' ? 'Copiado' : 'Copiar PNG'}</span>
    </button>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
}

function playerNameJitter(name: string): number {
  const c0 = name.charCodeAt(0) || 0
  const c1 = name.charCodeAt(1) || 0
  return Math.abs(c0 * 31 + c1) % 100 / 100 * 0.5 + 0.25
}

function getAge(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null
  const diff = Date.now() - new Date(birthDate).getTime()
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000))
}

// ─── Score color helpers ──────────────────────────────────────────────────────

function scoreColor(s: number | null | undefined) {
  return getScoreColorClass(s ?? null, '10')
}
function scoreBg(s: number | null | undefined) {
  return getScoreBgClass(s ?? null, '10')
}

// ─── Metric helpers ───────────────────────────────────────────────────────────

const MAX_METRICS = 10

/** Get value from player.season_scores[0] for a given ApiMetricKey */
function getPlayerMetricValue(player: PlayerWithScore, key: ApiMetricKey): number | null {
  if (!player.season_scores?.length) return null
  return apiGetMetricValue(player.season_scores[0], key)
}

/** Get avg value from PositionMetricAverages for a given key.
 * Note: the catalog uses `avg_rating` but PositionMetricAverages exposes it as `rating_avg`. */
function getAvgMetricValue(avg: PositionMetricAverages | null, key: ApiMetricKey): number | null {
  if (!avg) return null
  // Map catalog key → field name in PositionMetricAverages where they differ
  const fieldKey = key === 'avg_rating' ? 'rating_avg' : key
  const v = (avg as unknown as Record<string, number | null>)[fieldKey]
  return v ?? null
}

// Metric info lookup
const METRIC_BY_KEY = new Map(API_METRICS.map(m => [m.key, m]))

// Grouped metrics for dropdown UI  (reuse API_METRICS split into categories)
interface MetricGroup {
  label: string
  keys: ApiMetricKey[]
}

const METRIC_GROUPS: MetricGroup[] = [
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

// ─── Tooltip for Scatter ──────────────────────────────────────────────────────

function ScatterTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { name: string; x: number } }> }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-apple-gray-900 dark:text-white">{d.name}</p>
      <p className="text-apple-gray-500 dark:text-apple-gray-400">Valor: {d.x?.toFixed(2)}</p>
    </div>
  )
}

// ─── Candidate type ───────────────────────────────────────────────────────────

interface SearchCandidate {
  name: string
  club: string
  league: string
  position: string
  player: PlayerWithScore
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BusquedaPage() {
  const navigate = useNavigate()

  // ─── Data sources ─────────────────────────────────────────────────────────
  // Large pool from Supabase API (pageSize 500, no filters = full pool)
  const { players: allPlayers, loading } = usePlayersList({ pageSize: 500 })
  const { metricAverages } = usePositionMetricAverages()

  const [query, setQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerWithScore | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)
  const [exportingCanva, setExportingCanva] = useState(false)
  const [showCanvaModal, setShowCanvaModal] = useState(false)
  const [canvaModalData, setCanvaModalData] = useState<{ allMetrics: import('@/components/pdf/CanvaExportModal').CanvaMetricPreview[]; positionKeys: string[] } | null>(null)

  // Cascading search filters
  const [searchLeagueFilter, setSearchLeagueFilter] = useState('')
  const [searchTeamFilter, setSearchTeamFilter] = useState('')
  const [searchPositionFilter, setSearchPositionFilter] = useState('')

  // Context filters for the pool
  const [positionFilter, setPositionFilter] = useState<Position | ''>('')
  const [leagueIdFilter, setLeagueIdFilter] = useState<number | null>(null)
  const [samePosition, setSamePosition] = useState(true)

  // Second league comparison
  const [compareLeagueId2, setCompareLeagueId2] = useState<number | null>(null)

  // Active metrics (shared by bar + radar)
  const [activeMetrics, setActiveMetrics] = useState<ApiMetricKey[]>([])
  const [scatterMetrics, setScatterMetrics] = useState<ApiMetricKey[]>([])

  // ─── Derived: all leagues from loaded players ─────────────────────────────

  const allLeagues = useMemo<Array<{ id: number; name: string }>>(() => {
    const map = new Map<number, string>()
    for (const p of allPlayers) {
      if (p.league?.id && p.league?.name) map.set(p.league.id, p.league.name)
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [allPlayers])

  const teamsByLeague = useMemo<Array<{ name: string }>>(() => {
    const set = new Set<string>()
    for (const p of allPlayers) {
      if (searchLeagueFilter && p.league?.name !== searchLeagueFilter) continue
      if (p.team?.name) set.add(p.team.name)
    }
    return Array.from(set).sort().map(name => ({ name }))
  }, [allPlayers, searchLeagueFilter])

  const positionsByFilters = useMemo<string[]>(() => {
    const set = new Set<string>()
    for (const p of allPlayers) {
      if (searchLeagueFilter && p.league?.name !== searchLeagueFilter) continue
      if (searchTeamFilter && p.team?.name !== searchTeamFilter) continue
      if (p.primary_position) set.add(POSITION_DISPLAY[p.primary_position] ?? p.primary_position)
    }
    return Array.from(set).sort()
  }, [allPlayers, searchLeagueFilter, searchTeamFilter])

  // ─── Candidates (for search dropdown) ────────────────────────────────────

  const candidates = useMemo<SearchCandidate[]>(() => {
    return allPlayers.map(p => ({
      name: p.name,
      club: p.team?.name ?? '',
      league: p.league?.name ?? '',
      position: p.primary_position ? (POSITION_DISPLAY[p.primary_position] ?? p.primary_position) : '',
      player: p,
    }))
  }, [allPlayers])

  const filteredCandidates = useMemo<SearchCandidate[]>(() => {
    if (!query.trim() && !searchLeagueFilter && !searchPositionFilter && !searchTeamFilter) return []
    const q = query.trim()
    return candidates
      .filter(c => {
        const matchesQuery = !q || fuzzyMatch(q, c.name) || fuzzyMatch(q, c.club) || fuzzyMatch(q, c.position)
        return matchesQuery
          && (!searchLeagueFilter || c.league === searchLeagueFilter)
          && (!searchTeamFilter || c.club === searchTeamFilter)
          && (!searchPositionFilter || c.position === searchPositionFilter)
      })
      .slice(0, 30)
  }, [candidates, query, searchLeagueFilter, searchTeamFilter, searchPositionFilter])

  // ─── Pool (same position/league context for comparisons) ─────────────────

  const pool = useMemo<PlayerWithScore[]>(() => {
    if (!selectedPlayer) return []
    let base = allPlayers.filter(p => p.season_scores?.length > 0)
    if (leagueIdFilter != null) base = base.filter(p => p.league?.id === leagueIdFilter)
    if (samePosition && selectedPlayer.primary_position) {
      base = base.filter(p => p.primary_position === selectedPlayer.primary_position)
    }
    return base
  }, [selectedPlayer, allPlayers, leagueIdFilter, samePosition])

  const pool2 = useMemo<PlayerWithScore[]>(() => {
    if (!selectedPlayer || compareLeagueId2 == null) return []
    let base = allPlayers.filter(p => p.season_scores?.length > 0 && p.league?.id === compareLeagueId2)
    if (samePosition && selectedPlayer.primary_position) {
      base = base.filter(p => p.primary_position === selectedPlayer.primary_position)
    }
    return base
  }, [selectedPlayer, allPlayers, compareLeagueId2, samePosition])

  const pool2Label = useMemo(() =>
    compareLeagueId2 != null
      ? allLeagues.find(l => l.id === compareLeagueId2)?.name ?? ''
      : '',
    [compareLeagueId2, allLeagues]
  )

  const availableLeagues = useMemo(() => allLeagues, [allLeagues])

  // ─── League score context (1-10 scale) ────────────────────────────────────

  const leagueScoreContext = useMemo(() => {
    if (!selectedPlayer || selectedPlayer.primary_score == null) return null
    const liga = selectedPlayer.league?.name ?? ''
    const leagueId = selectedPlayer.league?.id
    if (!leagueId) return null
    const leaguePlayers = allPlayers.filter(p =>
      p.league?.id === leagueId && p.primary_score != null &&
      p.primary_position === selectedPlayer.primary_position
    )
    if (leaguePlayers.length < 5) return null
    const sorted = [...leaguePlayers].sort((a, b) => (b.primary_score ?? 0) - (a.primary_score ?? 0))
    const rank = sorted.findIndex(p => p.id === selectedPlayer.id) + 1
    const avg = leaguePlayers.reduce((s, p) => s + (p.primary_score ?? 0), 0) / leaguePlayers.length
    return { rank: rank > 0 ? rank : null, total: leaguePlayers.length, avg, liga }
  }, [selectedPlayer, allPlayers])

  // ─── Position averages from Supabase (for radar) ─────────────────────────

  const positionLeagueAvg = useMemo<PositionMetricAverages | null>(() => {
    if (!selectedPlayer?.primary_position) return null
    const leagueId = leagueIdFilter ?? selectedPlayer.league?.id ?? null
    if (leagueId == null) return null
    return metricAverages.find(
      a => a.position === selectedPlayer.primary_position && a.league_id === leagueId
    ) ?? null
  }, [selectedPlayer, metricAverages, leagueIdFilter])

  // ─── Rankings (top 8) ─────────────────────────────────────────────────────

  type RankingEntry = { key: ApiMetricKey; label: string; rank: number; total: number; playerVal: number; avg: number }

  const rankings = useMemo<RankingEntry[]>(() => {
    if (!selectedPlayer || pool.length === 0) return []
    const result: RankingEntry[] = []

    const metricsToRank = selectedPlayer.primary_position
      ? METRICS_BY_POSITION[selectedPlayer.primary_position]
      : API_METRICS.map(m => m.key)

    for (const key of metricsToRank) {
      const metaInfo = METRIC_BY_KEY.get(key)
      if (!metaInfo) continue
      const playerVal = getPlayerMetricValue(selectedPlayer, key)
      if (playerVal === null) continue

      const others = pool.filter(p => p.id !== selectedPlayer.id)
      const allVals = others
        .map(p => getPlayerMetricValue(p, key))
        .filter((v): v is number => v !== null)
      if (!allVals.length) continue

      const rank = metaInfo.higherIsBetter
        ? allVals.filter(v => v > playerVal).length + 1
        : allVals.filter(v => v < playerVal).length + 1

      const avg = allVals.reduce((a, b) => a + b, 0) / allVals.length
      result.push({ key, label: metaInfo.label, rank, total: allVals.length + 1, playerVal, avg })
    }

    return result.filter(r => r.rank <= 8).sort((a, b) => a.rank - b.rank)
  }, [selectedPlayer, pool])

  // ─── Bar chart data ───────────────────────────────────────────────────────

  const barData = useMemo(() => {
    if (!selectedPlayer || !pool.length || !activeMetrics.length) return []
    return activeMetrics.map(key => {
      const meta = METRIC_BY_KEY.get(key)
      const playerVal = getPlayerMetricValue(selectedPlayer, key)
      const poolVals = pool.map(p => getPlayerMetricValue(p, key)).filter((v): v is number => v !== null)
      const pool2Vals = pool2.map(p => getPlayerMetricValue(p, key)).filter((v): v is number => v !== null)
      const avg = poolVals.length ? poolVals.reduce((a, b) => a + b, 0) / poolVals.length : null
      const avg2 = pool2Vals.length ? pool2Vals.reduce((a, b) => a + b, 0) / pool2Vals.length : null
      const allVals = [...poolVals, ...pool2Vals, ...(playerVal !== null ? [playerVal] : [])]
      const minV = allVals.length ? Math.min(...allVals) : 0
      const maxV = allVals.length ? Math.max(...allVals) : 1
      const range = maxV - minV || 1
      const higherIsBetter = meta?.higherIsBetter !== false
      const norm = (v: number | null) => {
        if (v === null) return 0
        const raw = Math.max(0, Math.min(100, ((v - minV) / range) * 100))
        return higherIsBetter ? raw : 100 - raw
      }
      return {
        name: meta?.label ?? key,
        jugador: norm(playerVal),
        promedio: avg !== null ? norm(avg) : 0,
        ...(compareLeagueId2 != null && avg2 !== null ? { promedio2: norm(avg2) } : {}),
        jugadorRaw: playerVal !== null ? parseFloat(playerVal.toFixed(2)) : null,
        promedioRaw: avg !== null ? parseFloat(avg.toFixed(2)) : null,
        promedio2Raw: avg2 !== null ? parseFloat(avg2.toFixed(2)) : null,
      }
    })
  }, [selectedPlayer, pool, pool2, activeMetrics, compareLeagueId2])

  const barWins = barData.filter(d => (d.jugadorRaw ?? 0) > (d.promedioRaw ?? 0)).length
  const barLosses = barData.filter(d => (d.jugadorRaw ?? 0) < (d.promedioRaw ?? 0)).length

  // ─── Radar chart data (player vs position-league avg from Supabase) ───────

  const radarData = useMemo(() => {
    if (!selectedPlayer || activeMetrics.length < 3) return []
    return activeMetrics.map(key => {
      const meta = METRIC_BY_KEY.get(key)
      const playerVal = getPlayerMetricValue(selectedPlayer, key)
      // Use positionLeagueAvg if available, else fall back to pool average
      let avgVal: number | null = getAvgMetricValue(positionLeagueAvg, key)
      if (avgVal == null) {
        const poolVals = pool.map(p => getPlayerMetricValue(p, key)).filter((v): v is number => v !== null)
        avgVal = poolVals.length ? poolVals.reduce((a, b) => a + b, 0) / poolVals.length : null
      }

      const allVals = [
        ...(playerVal !== null ? [playerVal] : []),
        ...(avgVal !== null ? [avgVal] : []),
        // add pool for range
        ...pool.map(p => getPlayerMetricValue(p, key)).filter((v): v is number => v !== null),
      ]
      if (!allVals.length) return { subject: meta?.short ?? key, jugador: 0, promedio: 0 }

      const minV = Math.min(...allVals)
      const maxV = Math.max(...allVals)
      const range = maxV - minV
      const radarHigherIsBetter = meta?.higherIsBetter !== false
      const normalize = (v: number | null) => {
        if (v === null) return 0
        const raw = range === 0 ? 50 : Math.max(0, Math.min(100, ((v - minV) / range) * 100))
        return radarHigherIsBetter ? raw : 100 - raw
      }

      return {
        subject: meta?.short ?? key,
        jugador: normalize(playerVal),
        promedio: normalize(avgVal),
      }
    })
  }, [selectedPlayer, activeMetrics, positionLeagueAvg, pool])

  // ─── Scatter data ─────────────────────────────────────────────────────────

  const buildScatterData = useCallback((metricKey: ApiMetricKey) => {
    if (!selectedPlayer) return { poolPoints: [] as Array<{ name: string; x: number; y: number }>, playerPoint: null as null | { name: string; x: number; y: number } }
    const poolPoints: Array<{ name: string; x: number; y: number }> = []
    for (const p of pool) {
      if (p.id === selectedPlayer.id) continue
      const xVal = getPlayerMetricValue(p, metricKey)
      if (xVal === null) continue
      poolPoints.push({ name: p.name, x: xVal, y: playerNameJitter(p.name) })
    }
    const playerXVal = getPlayerMetricValue(selectedPlayer, metricKey)
    const playerPoint = playerXVal !== null ? { name: selectedPlayer.name, x: playerXVal, y: 0.5 } : null
    return { poolPoints, playerPoint }
  }, [selectedPlayer, pool])

  // ─── Conclusions ──────────────────────────────────────────────────────────

  const conclusions = useMemo(() => {
    if (!selectedPlayer || !pool.length) return null

    const playerScore = selectedPlayer.primary_score
    const poolScores = pool.map(p => p.primary_score).filter((s): s is number => s != null)
    const avgScore = poolScores.length ? poolScores.reduce((a, b) => a + b, 0) / poolScores.length : null
    const scoreRank = poolScores.length && playerScore != null
      ? poolScores.filter(s => s > playerScore).length + 1
      : null
    const scorePct = scoreRank && poolScores.length
      ? Math.round(((poolScores.length - scoreRank + 1) / poolScores.length) * 100)
      : null

    const top1 = rankings.filter(r => r.rank === 1)
    const top3 = rankings.filter(r => r.rank <= 3)

    const above: string[] = []
    const below: string[] = []
    const metricsToCheck = selectedPlayer.primary_position
      ? METRICS_BY_POSITION[selectedPlayer.primary_position]
      : API_METRICS.map(m => m.key)

    for (const key of metricsToCheck) {
      const meta = METRIC_BY_KEY.get(key)
      if (!meta) continue
      const pv = getPlayerMetricValue(selectedPlayer, key)
      if (pv === null) continue
      const poolVals = pool.map(p => getPlayerMetricValue(p, key)).filter((v): v is number => v !== null)
      if (!poolVals.length) continue
      const avg = poolVals.reduce((a, b) => a + b, 0) / poolVals.length
      if (meta.higherIsBetter) {
        if (pv > avg * 1.05) above.push(meta.label)
        else if (pv < avg * 0.95) below.push(meta.label)
      } else {
        // lower is better for goals_conceded_p90
        if (pv < avg * 0.95) above.push(meta.label)
        else if (pv > avg * 1.05) below.push(meta.label)
      }
    }

    let recommendation = '', recommendationLevel: 'green' | 'amber' | 'red' | 'neutral' = 'neutral'
    if (playerScore != null && avgScore != null) {
      const diff = playerScore - avgScore
      if (playerScore >= 7.5 && top1.length >= 1) { recommendation = 'Perfil de alto valor dentro del grupo. Recomendamos avanzar con el proceso de scouting.'; recommendationLevel = 'green' }
      else if (playerScore >= 6.5 && top3.length >= 2) { recommendation = 'Jugador competitivo con métricas destacadas. Vale la pena profundizar el seguimiento.'; recommendationLevel = 'green' }
      else if (diff > 0.5 && top3.length >= 1) { recommendation = 'Por encima del promedio del grupo. Puede ser una opción interesante según el contexto.'; recommendationLevel = 'amber' }
      else if (diff < -1.5 || (playerScore < 5 && below.length > above.length)) { recommendation = 'Por debajo del nivel del grupo en varios aspectos. Considerar con cautela.'; recommendationLevel = 'red' }
      else { recommendation = 'Perfil dentro del promedio del grupo. Se recomienda evaluar métricas clave para el puesto.'; recommendationLevel = 'neutral' }
    }

    const sampleWarning = pool.length < 5
      ? `Muestra pequeña (${pool.length} jugador${pool.length !== 1 ? 'es' : ''}). Los datos son referenciales.`
      : null

    return { playerScore, avgScore, scoreRank, scorePct, poolSize: pool.length, top1, top3, above, below, recommendation, recommendationLevel, sampleWarning }
  }, [selectedPlayer, pool, rankings])

  // ─── Actions ─────────────────────────────────────────────────────────────

  function selectCandidate(c: SearchCandidate) {
    setSelectedPlayer(c.player)
    setQuery(c.name)
    setShowDropdown(false)
    // Default league filter to player's league
    setLeagueIdFilter(c.player.league?.id ?? null)
    setCompareLeagueId2(null)
    setSamePosition(true)

    // Default active metrics: position defaults from METRICS_BY_POSITION
    const pos = c.player.primary_position
    const posMetrics = pos ? METRICS_BY_POSITION[pos] : null
    if (posMetrics) {
      const withData = posMetrics.filter(k => getPlayerMetricValue(c.player, k) !== null)
      setActiveMetrics(withData.length ? withData.slice(0, MAX_METRICS) : API_METRICS.map(m => m.key).filter(k => getPlayerMetricValue(c.player, k as ApiMetricKey) !== null).slice(0, 5) as ApiMetricKey[])
    } else {
      setActiveMetrics(API_METRICS.map(m => m.key).filter(k => getPlayerMetricValue(c.player, k) !== null).slice(0, 5) as ApiMetricKey[])
    }
    setScatterMetrics([])
  }

  function addMetric(key: ApiMetricKey) {
    setActiveMetrics(prev => prev.includes(key) || prev.length >= MAX_METRICS ? prev : [...prev, key])
  }
  function removeMetric(key: ApiMetricKey) {
    setActiveMetrics(prev => prev.filter(k => k !== key))
  }
  function addScatterMetric() {
    const used = new Set(scatterMetrics)
    for (const group of METRIC_GROUPS) {
      const next = group.keys.find(k => !used.has(k))
      if (next) { setScatterMetrics(prev => [...prev, next]); return }
    }
  }
  function removeScatterMetric(idx: number) { setScatterMetrics(prev => prev.filter((_, i) => i !== idx)) }
  function updateScatterMetric(idx: number, key: ApiMetricKey) { setScatterMetrics(prev => prev.map((k, i) => i === idx ? key : k)) }

  // ─── PDF export ───────────────────────────────────────────────────────────

  async function exportToPDF() {
    if (!selectedPlayer) return
    setExporting(true)
    try {
      const [{ pdf }, pdfMod] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/components/pdf/AnalisisCompletoPDF'),
      ])
      const AnalisisCompletoPDF = pdfMod.default
      const { createElement } = await import('react')

      const enriched = playerToEnriched(selectedPlayer)

      // Build bar data for PDF (use activeMetrics or position defaults)
      const pos = selectedPlayer.primary_position
      const pdfMetricKeys: ApiMetricKey[] = pos
        ? (METRICS_BY_POSITION[pos] ?? activeMetrics)
        : activeMetrics

      const pdfBarData = pdfMetricKeys
        .map(key => {
          const meta = METRIC_BY_KEY.get(key)
          const playerVal = getPlayerMetricValue(selectedPlayer, key)
          const poolVals = pool.map(p => getPlayerMetricValue(p, key)).filter((v): v is number => v !== null)
          const pool2Vals = pool2.map(p => getPlayerMetricValue(p, key)).filter((v): v is number => v !== null)
          const avg = poolVals.length ? poolVals.reduce((a, b) => a + b, 0) / poolVals.length : null
          const avg2 = pool2Vals.length ? pool2Vals.reduce((a, b) => a + b, 0) / pool2Vals.length : null
          const allVals = [...poolVals, ...pool2Vals, ...(playerVal !== null ? [playerVal] : [])]
          const minV = allVals.length ? Math.min(...allVals) : 0
          const maxV = allVals.length ? Math.max(...allVals) : 1
          const range = maxV - minV || 1
          const norm = (v: number | null) => v === null ? 0 : Math.max(0, Math.min(100, ((v - minV) / range) * 100))
          return {
            name: meta?.label ?? key,
            jugador: norm(playerVal),
            promedio: avg !== null ? norm(avg) : 0,
            ...(compareLeagueId2 != null && avg2 !== null ? { promedio2: norm(avg2) } : {}),
            jugadorRaw: playerVal !== null ? parseFloat(playerVal.toFixed(2)) : null,
            promedioRaw: avg !== null ? parseFloat(avg.toFixed(2)) : null,
            promedio2Raw: avg2 !== null ? parseFloat(avg2.toFixed(2)) : null,
          }
        })
        .filter(d => d.jugadorRaw !== null)

      const poolLabelStr = leagueIdFilter != null
        ? (allLeagues.find(l => l.id === leagueIdFilter)?.name ?? 'Pool general')
        : 'Pool general'

      const props = {
        player: enriched,
        barData: pdfBarData,
        radarData,
        rankings,
        conclusions,
        poolLabel: poolLabelStr,
        pool2Label: pool2Label || undefined,
        leagueContext: leagueScoreContext,
      }
      const doc = createElement(AnalisisCompletoPDF, props)
      const blob = await pdf(doc as Parameters<typeof pdf>[0]).toBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Informe_${selectedPlayer.name.replace(/[^a-zA-ZáéíóúñÁÉÍÓÚÑ\s]/g, '').replace(/\s+/g, '_')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) { console.error('PDF export error:', e) }
    finally { setExporting(false) }
  }

  // ─── Canva card export ────────────────────────────────────────────────────

  function openCanvaModal() {
    if (!selectedPlayer) return

    // Position metrics for "auto" mode
    const pos = selectedPlayer.primary_position
    const positionKeys: string[] = pos
      ? (METRICS_BY_POSITION[pos] ?? API_METRICS.map(m => m.key)).slice(0, 10)
      : activeMetrics.slice(0, 10)

    const allMetrics = API_METRICS
      .map(meta => {
        const playerVal = getPlayerMetricValue(selectedPlayer, meta.key)
        if (playerVal === null) return null
        const poolVals = pool.map(p => getPlayerMetricValue(p, meta.key)).filter((v): v is number => v !== null)
        const avg = poolVals.length ? poolVals.reduce((a, b) => a + b, 0) / poolVals.length : null
        const allVals = [...poolVals, playerVal]
        const minV = Math.min(...allVals)
        const maxV = Math.max(...allVals)
        const range = maxV - minV || 1
        const norm = (v: number) => Math.max(0, Math.min(100, ((v - minV) / range) * 100))
        return {
          key: meta.key,
          label: meta.label,
          jugador: norm(playerVal),
          promedio: avg !== null ? norm(avg) : 50,
          jugadorRaw: parseFloat(playerVal.toFixed(2)),
          promedioRaw: avg !== null ? parseFloat(avg.toFixed(2)) : null,
        }
      })
      .filter((m): m is NonNullable<typeof m> => m !== null)

    setCanvaModalData({ allMetrics, positionKeys })
    setShowCanvaModal(true)
  }

  async function exportInformeCanva(opts: CanvaExportOptions) {
    if (!selectedPlayer) return
    setShowCanvaModal(false)
    setExportingCanva(true)
    try {
      const [{ toPng }, { createRoot }, { createElement }, { default: CanvaCard }] = await Promise.all([
        import('html-to-image'),
        import('react-dom/client'),
        import('react'),
        import('@/components/pdf/InformeCanvaCard'),
      ])

      let logoDataUrl: string | undefined
      if (opts.showLogo) {
        try {
          const res = await fetch('/brand/logo-white.png')
          const blob = await res.blob()
          logoDataUrl = await new Promise<string>(resolve => {
            const fr = new FileReader()
            fr.onload = () => resolve(fr.result as string)
            fr.readAsDataURL(blob)
          })
        } catch { /* logo no disponible */ }
      }

      const enriched = playerToEnriched(selectedPlayer)

      const container = document.createElement('div')
      container.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;overflow:hidden;z-index:-1;pointer-events:none;'
      document.body.appendChild(container)

      let mountedRoot: { unmount: () => void } | null = null
      function cleanup() {
        try { mountedRoot?.unmount() } catch { /* ignore */ }
        if (container.parentNode) document.body.removeChild(container)
      }

      try {
        const canvaMetricKeys = opts.metricKeys
        const canvaBarData = canvaMetricKeys
          .map(key => {
            const meta = METRIC_BY_KEY.get(key as ApiMetricKey)
            const playerVal = getPlayerMetricValue(selectedPlayer, key as ApiMetricKey)
            const poolVals = pool.map(p => getPlayerMetricValue(p, key as ApiMetricKey)).filter((v): v is number => v !== null)
            const pool2Vals = pool2.map(p => getPlayerMetricValue(p, key as ApiMetricKey)).filter((v): v is number => v !== null)
            const avg = poolVals.length ? poolVals.reduce((a, b) => a + b, 0) / poolVals.length : null
            const avg2 = pool2Vals.length ? pool2Vals.reduce((a, b) => a + b, 0) / pool2Vals.length : null
            const allVals = [...poolVals, ...pool2Vals, ...(playerVal !== null ? [playerVal] : [])]
            const minV = allVals.length ? Math.min(...allVals) : 0
            const maxV = allVals.length ? Math.max(...allVals) : 1
            const range = maxV - minV || 1
            const norm = (v: number | null) => v === null ? 0 : Math.max(0, Math.min(100, ((v - minV) / range) * 100))
            const poolLabelStr = leagueIdFilter != null
              ? (allLeagues.find(l => l.id === leagueIdFilter)?.name ?? 'Pool general')
              : 'Pool general'
            return {
              name: meta?.label ?? key,
              jugador: norm(playerVal),
              promedio: avg !== null ? norm(avg) : 0,
              ...(compareLeagueId2 != null && avg2 !== null ? { promedio2: norm(avg2) } : {}),
              jugadorRaw: playerVal !== null ? parseFloat(playerVal.toFixed(2)) : null,
              promedioRaw: avg !== null ? parseFloat(avg.toFixed(2)) : null,
              promedio2Raw: avg2 !== null ? parseFloat(avg2.toFixed(2)) : null,
              _poolLabel: poolLabelStr,
            }
          })
          .filter(d => d.jugadorRaw !== null)

        const poolLabelStr = leagueIdFilter != null
          ? (allLeagues.find(l => l.id === leagueIdFilter)?.name ?? 'Pool general')
          : 'Pool general'

        const root = createRoot(container)
        mountedRoot = root
        root.render(createElement(CanvaCard, {
          player: enriched,
          barData: canvaBarData,
          poolLabel: poolLabelStr,
          pool2Label: pool2Label || undefined,
          leagueContext: leagueScoreContext,
          videoUrl: opts.videoUrl || undefined,
          logoDataUrl,
        }))

        await new Promise(r => setTimeout(r, 800))

        const baseName = `Informe_Canva_${selectedPlayer.name.replace(/[^a-zA-ZáéíóúñÁÉÍÓÚÑ\s]/g, '').replace(/\s+/g, '_')}`

        const cardEl = (container.firstElementChild as HTMLElement) ?? container
        const dataUrl = await toPng(cardEl, {
          width: 1120,
          height: 630,
          pixelRatio: 2,
          backgroundColor: '#0f0f11',
          skipFonts: true,
          filter: (node) => {
            if (node instanceof HTMLImageElement) {
              const src = node.getAttribute('src') || ''
              if (src.startsWith('http') && !src.startsWith(window.location.origin)) return false
            }
            return true
          },
        })

        cleanup()

        const { jsPDF } = await import('jspdf')
        const pdfDoc = new jsPDF({ orientation: 'landscape', unit: 'px', format: [1120, 630], hotfixes: ['px_scaling'] })
        pdfDoc.addImage(dataUrl, 'PNG', 0, 0, 1120, 630)
        if (opts.videoUrl) {
          pdfDoc.link(958, 520, 142, 30, { url: opts.videoUrl })
        }
        pdfDoc.save(`${baseName}.pdf`)
        setExportingCanva(false)
      } catch (e) {
        console.error('Canva export error:', e)
        cleanup()
        setExportingCanva(false)
      }
    } catch (e) {
      console.error('Canva export error:', e)
      setExportingCanva(false)
    }
  }

  // ─── Click outside ────────────────────────────────────────────────────────

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) setShowDropdown(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const currentLeagueName = useMemo(() =>
    leagueIdFilter != null
      ? (allLeagues.find(l => l.id === leagueIdFilter)?.name ?? '')
      : '',
    [leagueIdFilter, allLeagues]
  )

  // ─── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">Cargando datos...</p>
        </div>
      </div>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

      {/* Modal de configuración del informe Canva */}
      {showCanvaModal && canvaModalData && (
        <CanvaExportModal
          onConfirm={exportInformeCanva}
          onClose={() => setShowCanvaModal(false)}
          allMetrics={canvaModalData.allMetrics}
          positionKeys={canvaModalData.positionKeys}
        />
      )}

      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-apple-gray-900 dark:text-white tracking-tight">Análisis Completo</h1>
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-1">
            Buscá un jugador para analizar su rendimiento en contexto.
          </p>
        </div>
        {selectedPlayer && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Canva card export */}
            <button
              onClick={openCanvaModal}
              disabled={exportingCanva}
              title="Configura y genera un informe estilo Canva (PNG + PDF)"
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-green/10 border border-brand-green/30 text-brand-green text-sm font-medium hover:bg-brand-green/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exportingCanva ? (
                <div className="w-4 h-4 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              )}
              {exportingCanva ? 'Generando...' : 'Informe Canva'}
            </button>
            {/* PDF export */}
            <button
              onClick={exportToPDF}
              disabled={exporting}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-700 dark:text-apple-gray-200 text-sm font-medium hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? (
                <div className="w-4 h-4 border-2 border-apple-gray-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              )}
              {exporting ? 'Generando...' : 'Exportar PDF'}
            </button>
          </div>
        )}
      </div>

      {/* Search + cascading filters */}
      <div className="bg-white dark:bg-apple-gray-800 rounded-2xl border border-apple-gray-200 dark:border-apple-gray-700 p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap gap-2">
          <select
            value={searchLeagueFilter}
            onChange={e => { setSearchLeagueFilter(e.target.value); setSearchTeamFilter(''); setSearchPositionFilter(''); setShowDropdown(true) }}
            className="px-3 py-2 rounded-xl text-sm border border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50 dark:bg-apple-gray-700 text-apple-gray-700 dark:text-apple-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green"
          >
            <option value="">Todas las ligas</option>
            {allLeagues.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
          </select>
          <select
            value={searchTeamFilter}
            onChange={e => { setSearchTeamFilter(e.target.value); setSearchPositionFilter(''); setShowDropdown(true) }}
            className="px-3 py-2 rounded-xl text-sm border border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50 dark:bg-apple-gray-700 text-apple-gray-700 dark:text-apple-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green"
          >
            <option value="">Todos los equipos</option>
            {teamsByLeague.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
          </select>
          <select
            value={searchPositionFilter}
            onChange={e => { setSearchPositionFilter(e.target.value); setShowDropdown(true) }}
            className="px-3 py-2 rounded-xl text-sm border border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50 dark:bg-apple-gray-700 text-apple-gray-700 dark:text-apple-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green"
          >
            <option value="">Todas las posiciones</option>
            {positionsByFilters.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {(searchLeagueFilter || searchTeamFilter || searchPositionFilter) && (
            <button onClick={() => { setSearchLeagueFilter(''); setSearchTeamFilter(''); setSearchPositionFilter('') }} className="px-3 py-2 rounded-xl text-sm text-apple-gray-500 hover:text-apple-gray-700 dark:hover:text-white transition-colors">
              Limpiar
            </button>
          )}
        </div>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder={searchTeamFilter ? `Buscar en ${searchTeamFilter}...` : searchLeagueFilter ? `Buscar en ${searchLeagueFilter}...` : 'Buscar jugador por nombre...'}
            value={query}
            onChange={e => { setQuery(e.target.value); setShowDropdown(true); if (!e.target.value) setSelectedPlayer(null) }}
            onFocus={() => setShowDropdown(true)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 text-apple-gray-900 dark:text-white placeholder-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green text-sm"
          />
          {query && (
            <button onClick={() => { setQuery(''); setSelectedPlayer(null); setShowDropdown(false) }} className="absolute right-3 top-1/2 -translate-y-1/2 text-apple-gray-400 hover:text-apple-gray-600 dark:hover:text-apple-gray-200">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
          {showDropdown && filteredCandidates.length > 0 && (
            <div ref={dropdownRef} className="absolute z-50 left-0 right-0 top-full mt-1 bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 rounded-xl shadow-xl overflow-hidden max-h-72 overflow-y-auto">
              {filteredCandidates.map((c, i) => (
                <button key={i} onMouseDown={() => selectCandidate(c)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/60 transition-colors text-left border-b border-apple-gray-100 dark:border-apple-gray-700/50 last:border-0">
                  <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-apple-gray-100 dark:bg-apple-gray-700">
                    {c.player.photo
                      ? <img src={c.player.photo} alt={c.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      : <div className="w-full h-full flex items-center justify-center">
                          <span className="text-xs font-semibold text-apple-gray-600 dark:text-apple-gray-300">{getInitials(c.name)}</span>
                        </div>
                    }
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-apple-gray-900 dark:text-white truncate">{c.name}</p>
                    <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 truncate">{c.club} · {c.position}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500 flex-shrink-0">{c.league}</span>
                </button>
              ))}
            </div>
          )}
          {showDropdown && (query.trim().length > 1 || searchLeagueFilter || searchTeamFilter || searchPositionFilter) && filteredCandidates.length === 0 && (
            <div ref={dropdownRef} className="absolute z-50 left-0 right-0 top-full mt-1 bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 rounded-xl shadow-xl px-4 py-3">
              <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">Sin resultados</p>
            </div>
          )}
        </div>
      </div>

      {/* Content captured for PDF */}
      <div ref={contentRef}>
        {selectedPlayer && (
          <>
            {/* Player header */}
            <div className="bg-white dark:bg-apple-gray-800 rounded-2xl border border-apple-gray-200 dark:border-apple-gray-700 p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0 bg-apple-gray-100 dark:bg-apple-gray-700">
                  {selectedPlayer.photo ? (
                    <img src={selectedPlayer.photo} alt={selectedPlayer.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-xl font-bold text-apple-gray-500 dark:text-apple-gray-300">{getInitials(selectedPlayer.name)}</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => navigate(`/jugador/${encodeURIComponent(selectedPlayer.name)}?source=externo&apiId=${selectedPlayer.id}`)} className="text-xl font-semibold text-apple-gray-900 dark:text-white hover:text-brand-green transition-colors">
                      {selectedPlayer.name}
                    </button>
                  </div>
                  <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
                    {selectedPlayer.team?.name}{selectedPlayer.league?.name ? ` · ${selectedPlayer.league.name}` : ''}{selectedPlayer.primary_position ? ` · ${displayPosition(selectedPlayer.primary_position)}` : ''}{getAge(selectedPlayer.birth_date) ? ` · ${getAge(selectedPlayer.birth_date)} años` : ''}
                  </p>
                </div>
                {selectedPlayer.primary_score != null && (
                  <div className={`flex-shrink-0 flex flex-col items-center justify-center w-16 h-16 rounded-2xl ${scoreBg(selectedPlayer.primary_score)}`}>
                    <span className={`text-2xl font-bold ${scoreColor(selectedPlayer.primary_score)}`}>{selectedPlayer.primary_score.toFixed(1)}</span>
                    <span className="text-xs text-apple-gray-500 dark:text-apple-gray-400">Score GG</span>
                    {leagueScoreContext?.rank && (
                      <span className="text-[10px] text-apple-gray-400 dark:text-apple-gray-500 leading-none mt-0.5">
                        {leagueScoreContext.rank}° / {leagueScoreContext.total}
                      </span>
                    )}
                  </div>
                )}
              </div>
              {/* League score comparison */}
              {leagueScoreContext && selectedPlayer.primary_score != null && (
                <div className="mt-3 pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700/50 flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-apple-gray-400 dark:text-apple-gray-500">Score en {leagueScoreContext.liga}:</span>
                  {leagueScoreContext.rank && (
                    <span className={`text-xs font-semibold ${leagueScoreContext.rank <= 5 ? 'text-brand-green' : leagueScoreContext.rank <= 15 ? 'text-amber-500' : 'text-apple-gray-500'}`}>
                      {leagueScoreContext.rank}° de {leagueScoreContext.total}
                    </span>
                  )}
                  <span className="text-xs text-apple-gray-400 dark:text-apple-gray-500">
                    · prom. liga: {leagueScoreContext.avg.toFixed(1)}
                    · diferencia: {selectedPlayer.primary_score > leagueScoreContext.avg ? '+' : ''}{(selectedPlayer.primary_score - leagueScoreContext.avg).toFixed(1)}
                  </span>
                </div>
              )}
            </div>

            {/* Context filters */}
            <div className="mt-6 bg-white dark:bg-apple-gray-800 rounded-2xl border border-apple-gray-200 dark:border-apple-gray-700 p-4 shadow-sm">
              <h2 className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mb-3">Contexto de análisis</h2>
              <div className="flex flex-wrap gap-4 items-end">
                <div className="space-y-1">
                  <label className="text-xs text-apple-gray-500 dark:text-apple-gray-400">Liga principal</label>
                  <select
                    value={leagueIdFilter ?? ''}
                    onChange={e => setLeagueIdFilter(e.target.value ? Number(e.target.value) : null)}
                    className="px-3 py-1.5 rounded-lg text-xs border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 text-apple-gray-700 dark:text-apple-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green"
                  >
                    <option value="">Todas las ligas</option>
                    {availableLeagues.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-apple-gray-500 dark:text-apple-gray-400">
                    Comparar también vs
                    <span className="ml-1 text-blue-400">(2ª liga)</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={compareLeagueId2 ?? ''}
                      onChange={e => setCompareLeagueId2(e.target.value ? Number(e.target.value) : null)}
                      className="px-3 py-1.5 rounded-lg text-xs border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 text-apple-gray-700 dark:text-apple-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400/40 focus:border-blue-400"
                    >
                      <option value="">Sin comparación extra</option>
                      {availableLeagues.filter(l => l.id !== leagueIdFilter).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                    {compareLeagueId2 != null && (
                      <button onClick={() => setCompareLeagueId2(null)} className="text-apple-gray-400 hover:text-apple-gray-600 dark:hover:text-apple-gray-200 transition-colors p-1">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={samePosition} onChange={e => setSamePosition(e.target.checked)} className="w-4 h-4 rounded border-apple-gray-300 text-brand-green focus:ring-brand-green" />
                  <span className="text-xs text-apple-gray-700 dark:text-apple-gray-300">Solo misma posición</span>
                </label>
                <div className="ml-auto text-xs text-apple-gray-400 dark:text-apple-gray-500 text-right">
                  <div>{pool.length} jugadores en pool</div>
                  {compareLeagueId2 != null && pool2Label && <div className="text-blue-400 mt-0.5">{pool2.length} en {pool2Label}</div>}
                </div>
              </div>
            </div>

            {/* Rankings */}
            <div id="chart-rankings-section" className="mt-6 bg-white dark:bg-apple-gray-800 rounded-2xl border border-apple-gray-200 dark:border-apple-gray-700 p-6 shadow-sm">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-baseline gap-2">
                  <h2 className="text-base font-semibold text-apple-gray-900 dark:text-white">Posicionamiento en el grupo</h2>
                  <span className="text-xs text-apple-gray-400 dark:text-apple-gray-500">entre {pool.length} jugadores</span>
                </div>
                <CopyBtn targetId="chart-rankings-section" filename={`rankings_${selectedPlayer.name.replace(/\s+/g,'_')}`} />
              </div>
              <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 mb-5">
                Métricas donde {selectedPlayer.name} se ubica en los primeros puestos. Incluye su valor real y el promedio del grupo.
              </p>

              {rankings.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {rankings.map(r => {
                      const is1st = r.rank === 1
                      const is2nd = r.rank === 2
                      const is3rd = r.rank === 3
                      return (
                        <div key={r.key} className={`relative overflow-hidden rounded-xl p-3 border transition-all ${
                          is1st ? 'bg-gradient-to-br from-brand-green/15 to-emerald-500/5 border-brand-green/30 dark:from-brand-green/20 dark:to-emerald-500/10'
                          : is2nd ? 'bg-brand-green/5 border-brand-green/15 dark:bg-brand-green/8'
                          : is3rd ? 'bg-apple-gray-50 dark:bg-apple-gray-700/50 border-apple-gray-200 dark:border-apple-gray-600'
                          : 'bg-apple-gray-50/50 dark:bg-apple-gray-800 border-apple-gray-100 dark:border-apple-gray-700/50'
                        }`}>
                          {is1st && <div className="absolute top-0 right-0 w-10 h-10 bg-brand-green/10 rounded-bl-full" />}
                          <div className={`text-2xl font-black leading-none mb-1 ${
                            is1st ? 'text-brand-green' : is2nd ? 'text-emerald-500/80 dark:text-emerald-400/80' : is3rd ? 'text-apple-gray-500 dark:text-apple-gray-400' : 'text-apple-gray-400 dark:text-apple-gray-500'
                          }`}>{r.rank}°</div>
                          <p className={`text-xs font-medium leading-tight ${is1st ? 'text-apple-gray-800 dark:text-white' : 'text-apple-gray-600 dark:text-apple-gray-300'}`}>
                            {r.label}
                          </p>
                          <p className={`text-sm font-bold mt-1 tabular-nums ${is1st ? 'text-brand-green' : 'text-apple-gray-600 dark:text-apple-gray-300'}`}>
                            {r.playerVal.toFixed(2)}
                          </p>
                          <p className="text-[10px] text-apple-gray-400 dark:text-apple-gray-500">
                            prom: {r.avg.toFixed(2)}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                  <div className="mt-4 pt-4 border-t border-apple-gray-100 dark:border-apple-gray-700/50">
                    <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 leading-relaxed">
                      {rankings.filter(r => r.rank === 1).length > 0
                        ? `${selectedPlayer.name} lidera el grupo en ${rankings.filter(r => r.rank === 1).map(r => r.label).join(' y ')}${rankings.filter(r => r.rank === 1).length === 1 ? ` con ${rankings.find(r => r.rank === 1)!.playerVal.toFixed(2)} (prom. ${rankings.find(r => r.rank === 1)!.avg.toFixed(2)})` : ''}.`
                        : `${selectedPlayer.name} aparece en el top 8 en ${rankings.length} métricas dentro del grupo.`
                      }
                      {rankings.length > 1 && ` Figura en el top 8 en ${rankings.length} métricas en total.`}
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 italic">Sin métricas destacadas en este contexto</p>
              )}
            </div>

            {/* Comparación vs promedio */}
            <div className="mt-6 bg-white dark:bg-apple-gray-800 rounded-2xl border border-apple-gray-200 dark:border-apple-gray-700 p-6 shadow-sm">
              <h2 className="text-base font-semibold text-apple-gray-900 dark:text-white mb-1">Comparación vs promedio del grupo</h2>
              <p className="text-xs text-apple-gray-400 dark:text-apple-gray-500 mb-5">
                Seleccioná métricas con los menús de categoría. Podés agregar hasta {MAX_METRICS}.
              </p>

              {/* Active chips */}
              {activeMetrics.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {activeMetrics.map(key => {
                    const meta = METRIC_BY_KEY.get(key)
                    return (
                      <span key={key} className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1 rounded-full bg-brand-green/10 border border-brand-green/25 text-xs font-medium text-brand-green dark:text-green-400">
                        {meta?.label ?? key}
                        <button onClick={() => removeMetric(key)} className="text-brand-green/50 hover:text-red-500 transition-colors ml-0.5">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </span>
                    )
                  })}
                  <button onClick={() => setActiveMetrics([])} className="text-xs text-apple-gray-400 hover:text-apple-gray-600 dark:hover:text-apple-gray-200 px-2 transition-colors">
                    Limpiar
                  </button>
                </div>
              )}

              {/* Category dropdowns */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-5">
                {METRIC_GROUPS.map(group => {
                  const available = group.keys.filter(k => !activeMetrics.includes(k) && getPlayerMetricValue(selectedPlayer, k) !== null)
                  return (
                    <select
                      key={group.label}
                      value=""
                      onChange={e => { if (e.target.value) addMetric(e.target.value as ApiMetricKey) }}
                      disabled={activeMetrics.length >= MAX_METRICS || available.length === 0}
                      className="w-full px-3 py-2 rounded-xl text-xs border border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50 dark:bg-apple-gray-700/60 text-apple-gray-600 dark:text-apple-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <option value="">+ {group.label}</option>
                      {available.map(k => {
                        const m = METRIC_BY_KEY.get(k)
                        return <option key={k} value={k}>{m?.label ?? k}</option>
                      })}
                    </select>
                  )
                })}
              </div>

              {activeMetrics.length === 0 ? (
                <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 italic py-8 text-center">
                  Seleccioná al menos una métrica del menú de arriba para ver los gráficos.
                </p>
              ) : (
                <>
                  {/* Radar */}
                  {activeMetrics.length >= 3 && (
                    <div className="mb-10" id="chart-radar-section">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-200">Radar vs promedio</h3>
                        <CopyBtn targetId="chart-radar-section" filename={`radar_${selectedPlayer.name.replace(/\s+/g,'_')}`} />
                      </div>
                      <div className="flex items-center gap-5 mb-4">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-brand-green" />
                          <span className="text-sm font-medium text-apple-gray-700 dark:text-apple-gray-200">{selectedPlayer.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#94A3B8" strokeWidth="2.5" strokeDasharray="5 4" /></svg>
                          <span className="text-sm text-apple-gray-500 dark:text-apple-gray-400">
                            Promedio {currentLeagueName || 'del grupo'}
                          </span>
                        </div>
                      </div>
                      <div style={{ height: Math.max(340, activeMetrics.length * 28) }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <RadarChart data={radarData} margin={{ top: 20, right: 55, bottom: 20, left: 55 }}>
                            <PolarGrid stroke="rgba(156,163,175,0.2)" />
                            <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: 'currentColor', fontWeight: 500 }} />
                            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                            <Radar name={selectedPlayer.name} dataKey="jugador" stroke="#22C55E" strokeWidth={2.5} fill="#22C55E" fillOpacity={0.22} />
                            <Radar name="Promedio" dataKey="promedio" stroke="#94A3B8" strokeWidth={3} strokeDasharray="6 4" fill="#94A3B8" fillOpacity={0.06} />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>
                      <p className="text-xs text-apple-gray-400 dark:text-apple-gray-500 mt-2 text-center">
                        Cada eje normalizado 0-100. Verde = jugador · Punteado gris = promedio {currentLeagueName || 'del grupo'}.
                      </p>
                    </div>
                  )}

                  {/* Bar chart */}
                  <div id="chart-bars-section">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-200">Barras comparativas</h3>
                      <CopyBtn targetId="chart-bars-section" filename={`barras_${selectedPlayer.name.replace(/\s+/g,'_')}`} />
                    </div>
                    <div className="flex items-center gap-4 mb-4 flex-wrap">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-brand-green" />
                        <span className="text-sm text-apple-gray-600 dark:text-apple-gray-300">{selectedPlayer.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-apple-gray-400/50" />
                        <span className="text-sm text-apple-gray-500 dark:text-apple-gray-400">{currentLeagueName || 'Pool general'}</span>
                      </div>
                      {compareLeagueId2 != null && pool2Label && (
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded bg-blue-400/60" />
                          <span className="text-sm text-blue-500 dark:text-blue-400">{pool2Label}</span>
                        </div>
                      )}
                    </div>
                    <div style={{ height: Math.max(240, activeMetrics.length * (compareLeagueId2 != null ? 65 : 50)) }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={barData} layout="vertical" margin={{ top: 4, right: 90, left: 10, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(156,163,175,0.1)" />
                          <XAxis type="number" domain={[0, 100]} tick={false} axisLine={false} tickLine={false} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fontWeight: 500 }} width={140} />
                          <Tooltip
                            cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null
                              const d = payload[0]?.payload as { name: string; jugadorRaw: number | null; promedioRaw: number | null; promedio2Raw?: number | null }
                              return (
                                <div className="bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 rounded-lg px-3 py-2.5 shadow-lg text-sm">
                                  <p className="font-semibold text-apple-gray-700 dark:text-apple-gray-200 mb-1.5">{d.name}</p>
                                  <p className="text-brand-green font-medium">{selectedPlayer.name}: <strong>{d.jugadorRaw?.toFixed(2) ?? '—'}</strong></p>
                                  <p className="text-apple-gray-500 dark:text-apple-gray-400">{currentLeagueName || 'Pool'}: <strong>{d.promedioRaw?.toFixed(2) ?? '—'}</strong></p>
                                  {compareLeagueId2 != null && d.promedio2Raw != null && (
                                    <p className="text-blue-500 dark:text-blue-400">{pool2Label}: <strong>{d.promedio2Raw.toFixed(2)}</strong></p>
                                  )}
                                </div>
                              )
                            }}
                          />
                          <Bar dataKey="jugador" name={selectedPlayer.name} fill="#22C55E" radius={[0, 5, 5, 0]} barSize={9}>
                            <LabelList dataKey="jugadorRaw" position="right" formatter={(v: number | null) => v?.toFixed(2) ?? ''} style={{ fontSize: 11, fill: '#22C55E', fontWeight: 700 }} />
                          </Bar>
                          <Bar dataKey="promedio" name={currentLeagueName || 'Promedio'} fill="rgba(156,163,175,0.4)" radius={[0, 5, 5, 0]} barSize={9}>
                            <LabelList dataKey="promedioRaw" position="right" formatter={(v: number | null) => v?.toFixed(2) ?? ''} style={{ fontSize: 10, fill: '#9CA3AF' }} />
                          </Bar>
                          {compareLeagueId2 != null && (
                            <Bar dataKey="promedio2" name={pool2Label} fill="rgba(59,130,246,0.45)" radius={[0, 5, 5, 0]} barSize={9}>
                              <LabelList dataKey="promedio2Raw" position="right" formatter={(v: number | null) => v?.toFixed(2) ?? ''} style={{ fontSize: 10, fill: '#60A5FA' }} />
                            </Bar>
                          )}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    {barData.length > 0 && (
                      <div className="mt-4 flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-green/10 border border-brand-green/20">
                          <span className="text-xl font-black text-brand-green">{barWins}</span>
                          <span className="text-xs text-apple-gray-600 dark:text-apple-gray-400">por encima del promedio</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-700/50 border border-apple-gray-200 dark:border-apple-gray-600">
                          <span className="text-xl font-black text-apple-gray-500 dark:text-apple-gray-400">{barLosses}</span>
                          <span className="text-xs text-apple-gray-600 dark:text-apple-gray-400">por debajo del promedio</span>
                        </div>
                        {barData.length - barWins - barLosses > 0 && (
                          <span className="text-xs text-apple-gray-400">en línea: {barData.length - barWins - barLosses}</span>
                        )}
                      </div>
                    )}
                    <p className="text-xs text-apple-gray-400 dark:text-apple-gray-500 mt-3">
                      Barras normalizadas (0–100) para comparación visual. Número a la derecha = valor real.
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Scatter */}
            <div className="mt-6 bg-white dark:bg-apple-gray-800 rounded-2xl border border-apple-gray-200 dark:border-apple-gray-700 p-6 shadow-sm">
              <h2 className="text-base font-semibold text-apple-gray-900 dark:text-white mb-1">Dispersión en el contexto</h2>
              <p className="text-xs text-apple-gray-400 dark:text-apple-gray-500 mb-4">
                Cada punto es un jugador del pool. El verde es siempre {selectedPlayer.name}, aunque esté en otra liga. Agregá varios gráficos para distintas métricas.
              </p>
              <div className="flex items-center gap-5 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-brand-green border-2 border-white dark:border-apple-gray-800 shadow" />
                  <span className="text-sm font-medium text-apple-gray-700 dark:text-apple-gray-200">{selectedPlayer.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 rounded-full bg-slate-300 dark:bg-slate-500" />
                  <span className="text-sm text-apple-gray-500 dark:text-apple-gray-400">Resto del pool</span>
                </div>
              </div>

              {scatterMetrics.length === 0 && (
                <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 italic py-4 text-center">
                  Hacé click en "+ Agregar gráfico" para visualizar una métrica en contexto.
                </p>
              )}

              <div className="space-y-5">
                {scatterMetrics.map((metricKey, idx) => {
                  const metricMeta = METRIC_BY_KEY.get(metricKey)
                  const { poolPoints, playerPoint } = buildScatterData(metricKey)
                  const allX = [...poolPoints.map(p => p.x), ...(playerPoint ? [playerPoint.x] : [])]
                  const avgX = allX.length ? allX.reduce((a, b) => a + b, 0) / allX.length : 0
                  const scatterId = `chart-scatter-${idx}`

                  return (
                    <div key={idx} id={scatterId} className="border border-apple-gray-100 dark:border-apple-gray-700 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <select
                          value={metricKey}
                          onChange={e => updateScatterMetric(idx, e.target.value as ApiMetricKey)}
                          className="flex-1 px-3 py-1.5 rounded-lg text-sm border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 text-apple-gray-700 dark:text-apple-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green"
                        >
                          {METRIC_GROUPS.map(group => (
                            <optgroup key={group.label} label={group.label}>
                              {group.keys.map(k => {
                                const m = METRIC_BY_KEY.get(k)
                                return <option key={k} value={k}>{m?.label ?? k}</option>
                              })}
                            </optgroup>
                          ))}
                        </select>
                        <CopyBtn targetId={scatterId} filename={`dispersion_${metricMeta?.label?.replace(/\s+/g,'_') ?? idx}`} />
                        <button onClick={() => removeScatterMetric(idx)} className="px-3 py-1.5 rounded-lg text-xs text-apple-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                          Quitar
                        </button>
                      </div>

                      {!playerPoint && poolPoints.length === 0 ? (
                        <div className="flex items-center justify-center h-24 text-sm text-apple-gray-400 italic">Sin datos disponibles</div>
                      ) : (
                        <>
                          <div style={{ height: 170 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <ScatterChart margin={{ top: 15, right: 20, left: 10, bottom: 25 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(156,163,175,0.1)" horizontal={false} />
                                <XAxis type="number" dataKey="x" tick={{ fontSize: 11 }} label={{ value: metricMeta?.label ?? metricKey, position: 'insideBottom', offset: -12, fontSize: 11, fill: '#9CA3AF' }} />
                                <YAxis type="number" dataKey="y" domain={[0, 1]} tick={false} axisLine={false} tickLine={false} width={0} />
                                <Tooltip content={<ScatterTooltip />} />
                                {allX.length > 1 && (
                                  <ReferenceLine x={avgX} stroke="rgba(156,163,175,0.5)" strokeDasharray="4 4" label={{ value: `prom: ${avgX.toFixed(2)}`, position: 'top', fontSize: 10, fill: '#9CA3AF' }} />
                                )}
                                {poolPoints.length > 0 && (
                                  <Scatter name="Pool" data={poolPoints} shape={(props: { cx?: number; cy?: number }) => (
                                    <circle cx={props.cx} cy={props.cy} r={4.5} fill="rgba(148,163,184,0.55)" />
                                  )} />
                                )}
                                {playerPoint && (
                                  <Scatter name={selectedPlayer.name} data={[playerPoint]} shape={(props: { cx?: number; cy?: number }) => (
                                    <circle cx={props.cx} cy={props.cy} r={9} fill="#22C55E" stroke="white" strokeWidth={2.5} />
                                  )} />
                                )}
                              </ScatterChart>
                            </ResponsiveContainer>
                          </div>
                          <p className="text-xs text-apple-gray-400 dark:text-apple-gray-500 mt-1">
                            {playerPoint
                              ? `${selectedPlayer.name} registra ${playerPoint.x.toFixed(2)} en ${metricMeta?.label ?? metricKey}${allX.length > 1 ? `, ${playerPoint.x > avgX ? 'por encima' : 'por debajo'} del promedio (${avgX.toFixed(2)})` : ''}.`
                              : `No hay dato para esta métrica.`
                            }
                            {poolPoints.length === 0 && playerPoint && ' No hay otros jugadores en el pool para comparar.'}
                          </p>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>

              <button
                onClick={addScatterMetric}
                disabled={scatterMetrics.length >= API_METRICS.length}
                className="mt-4 w-full py-2.5 rounded-xl text-sm font-medium border-2 border-dashed border-apple-gray-300 dark:border-apple-gray-600 text-apple-gray-500 dark:text-apple-gray-400 hover:border-brand-green hover:text-brand-green transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                + Agregar gráfico
              </button>
            </div>

            {/* Analysis */}
            {conclusions && (
              <div className="mt-6 bg-white dark:bg-apple-gray-800 rounded-2xl border border-apple-gray-200 dark:border-apple-gray-700 p-6 shadow-sm">
                <h2 className="text-base font-semibold text-apple-gray-900 dark:text-white mb-4">Análisis automático</h2>
                {conclusions.sampleWarning && (
                  <div className="mb-4 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                    <p className="text-xs text-amber-700 dark:text-amber-300">{conclusions.sampleWarning}</p>
                  </div>
                )}
                <div className="space-y-3">
                  {/* Score */}
                  {conclusions.playerScore != null && conclusions.avgScore != null && (
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-700/40">
                      <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg ${scoreBg(conclusions.playerScore)} ${scoreColor(conclusions.playerScore)}`}>
                        {conclusions.playerScore.toFixed(1)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-apple-gray-800 dark:text-white">Score GG</p>
                        <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
                          {conclusions.scorePct != null ? `Percentil ${conclusions.scorePct} del grupo (${conclusions.scoreRank}° de ${conclusions.poolSize}).` : `Promedio del grupo: ${conclusions.avgScore.toFixed(1)}.`}
                          {' '}{Math.abs(conclusions.playerScore - conclusions.avgScore) > 0.3
                            ? conclusions.playerScore > conclusions.avgScore
                              ? `Supera el promedio por ${(conclusions.playerScore - conclusions.avgScore).toFixed(1)} puntos.`
                              : `Está ${Math.abs(conclusions.playerScore - conclusions.avgScore).toFixed(1)} puntos por debajo.`
                            : 'En línea con el promedio del grupo.'
                          }
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Top rankings */}
                  {conclusions.top1.length > 0 && (
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-brand-green/5 border border-brand-green/20">
                      <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-brand-green/10 flex items-center justify-center">
                        <svg className="w-5 h-5 text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-brand-green">Lidera en {conclusions.top1.length} métrica{conclusions.top1.length > 1 ? 's' : ''}</p>
                        <p className="text-sm text-apple-gray-600 dark:text-apple-gray-300 mt-0.5">
                          {conclusions.top1.map(r => `${r.label} (${r.playerVal.toFixed(2)})`).join(', ')}.
                          {conclusions.top3.length > conclusions.top1.length && ` Top 3 también en: ${conclusions.top3.filter(r => r.rank > 1).map(r => r.label).join(', ')}.`}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Above/below */}
                  {(conclusions.above.length > 0 || conclusions.below.length > 0) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {conclusions.above.length > 0 && (
                        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/15 border border-emerald-200 dark:border-emerald-800">
                          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1.5">Supera el promedio ({conclusions.above.length})</p>
                          <p className="text-xs text-emerald-600 dark:text-emerald-500">{conclusions.above.slice(0, 5).join(', ')}{conclusions.above.length > 5 ? ` y ${conclusions.above.length - 5} más` : ''}.</p>
                        </div>
                      )}
                      {conclusions.below.length > 0 && (
                        <div className="p-3.5 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-700/30 border border-apple-gray-200 dark:border-apple-gray-600">
                          <p className="text-xs font-semibold text-apple-gray-600 dark:text-apple-gray-400 mb-1.5">Por debajo del promedio ({conclusions.below.length})</p>
                          <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400">{conclusions.below.slice(0, 4).join(', ')}{conclusions.below.length > 4 ? ` y ${conclusions.below.length - 4} más` : ''}.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Recommendation */}
                  {conclusions.recommendation && (
                    <div className={`flex items-start gap-3 p-4 rounded-xl border ${
                      conclusions.recommendationLevel === 'green' ? 'bg-brand-green/5 border-brand-green/20'
                      : conclusions.recommendationLevel === 'amber' ? 'bg-amber-50 dark:bg-amber-900/15 border-amber-200 dark:border-amber-800'
                      : conclusions.recommendationLevel === 'red'   ? 'bg-red-50 dark:bg-red-900/15 border-red-200 dark:border-red-800'
                      : 'bg-apple-gray-50 dark:bg-apple-gray-700/30 border-apple-gray-200 dark:border-apple-gray-600'
                    }`}>
                      <svg className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                        conclusions.recommendationLevel === 'green' ? 'text-brand-green'
                        : conclusions.recommendationLevel === 'amber' ? 'text-amber-500'
                        : conclusions.recommendationLevel === 'red'   ? 'text-red-500'
                        : 'text-apple-gray-400'
                      }`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className={`text-sm font-medium ${
                        conclusions.recommendationLevel === 'green' ? 'text-brand-green dark:text-green-400'
                        : conclusions.recommendationLevel === 'amber' ? 'text-amber-700 dark:text-amber-400'
                        : conclusions.recommendationLevel === 'red'   ? 'text-red-700 dark:text-red-400'
                        : 'text-apple-gray-700 dark:text-apple-gray-300'
                      }`}>{conclusions.recommendation}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Empty state */}
      {!selectedPlayer && !loading && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-apple-gray-100 dark:bg-apple-gray-800 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-apple-gray-300 dark:text-apple-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <p className="text-base font-medium text-apple-gray-700 dark:text-apple-gray-300">Buscá un jugador para comenzar</p>
          <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 mt-1 max-w-sm">
            Filtrá por liga, equipo y posición, o escribí el nombre directamente.
          </p>
        </div>
      )}

    </div>
  )
}
