import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ScatterChart, Scatter, ReferenceLine,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, LabelList,
} from 'recharts'
import { useData } from '@/context/DataContext'
import type { EnrichedPlayer } from '@/types'

// ─── Leagues excluded from pool (no quality external data) ────────────────────

function isExcludedLeague(liga: string | null | undefined): boolean {
  if (!liga) return false
  const l = liga.toLowerCase().trim()
  return (
    l.includes('honduras') ||
    l.includes('emiratos') ||
    l.includes('bolivia') ||
    l.includes('portugal') ||
    l.includes('reserva') ||
    l === 'mexico' ||
    l.startsWith('mexico ') ||
    l === 'liga de mexico'
  )
}

// ─── All available metrics, grouped ───────────────────────────────────────────

interface MetricDef {
  key: string
  label: string   // Full label for selectors, bar chart, rankings
  radar: string   // Short label for radar axis
}

const ALL_METRIC_GROUPS: Array<{ label: string; keys: MetricDef[] }> = [
  {
    label: 'Gol & Creación',
    keys: [
      { key: 'Goles',                             label: 'Goles',                              radar: 'Goles' },
      { key: 'xG',                                label: 'Expected Goals (xG)',                radar: 'xG' },
      { key: 'Asistencias',                       label: 'Asistencias',                        radar: 'Asistencias' },
      { key: 'xA',                                label: 'Expected Assists (xA)',              radar: 'xA' },
      { key: 'xA/90',                             label: 'xA /90\'',                           radar: 'xA /90\'' },
      { key: 'Remates/90',                        label: 'Remates /90\'',                      radar: 'Remates /90\'' },
      { key: 'Toques en el área de penalti/90',   label: 'Toques en área rival /90\'',        radar: 'Toques área /90\'' },
    ],
  },
  {
    label: 'Pases',
    keys: [
      { key: 'Pases precisos/90',                      label: 'Pases precisos /90\'',                  radar: 'Pases prec. /90\'' },
      { key: 'Precisión pases, %',                     label: 'Precisión de pases (%)',                radar: 'Precisión pases %' },
      { key: 'Precisión pases hacia adelante, %',      label: 'Precisión pases hacia adelante (%)',    radar: 'Pases adel. %' },
      { key: 'Pases hacia adelante/90',                label: 'Pases hacia adelante /90\'',            radar: 'Pases adel. /90\'' },
      { key: 'Precisión pases largos, %',              label: 'Precisión pases largos (%)',            radar: 'Pases largos %' },
      { key: 'Pases progresivos exitosos/90',          label: 'Pases progresivos exitosos /90\'',     radar: 'Pases prog. /90\'' },
      { key: 'Pases al tercer tercio/90',              label: 'Pases al último tercio /90\'',         radar: '3er tercio /90\'' },
      { key: 'Centros precisos/90',                    label: 'Centros precisos /90\'',               radar: 'Centros /90\'' },
      { key: 'Jugadas claves/90',                      label: 'Jugadas clave /90\'',                  radar: 'Jug. clave /90\'' },
    ],
  },
  {
    label: 'Conducción',
    keys: [
      { key: 'Dribling completados/90',            label: 'Dribling completados /90\'',          radar: 'Dribling /90\'' },
      { key: 'Gambetas completadas, %',            label: 'Precisión de regates (%)',            radar: 'Regates %' },
      { key: 'Carreras en progresión/90',          label: 'Carreras en progresión /90\'',       radar: 'Carrer. prog. /90\'' },
      { key: 'Ataque en profundidad/90',           label: 'Ataques en profundidad /90\'',       radar: 'Ataq. prof. /90\'' },
      { key: 'Acciones de ataque exitosas/90',     label: 'Acciones de ataque exitosas /90\'',  radar: 'Ataq. exit. /90\'' },
      { key: 'Faltas recibidas/90',                label: 'Faltas recibidas /90\'',             radar: 'Faltas rec. /90\'' },
    ],
  },
  {
    label: 'Duelos',
    keys: [
      { key: 'Duelos ganados, %',                  label: 'Duelos ganados (total) %',           radar: 'Duelos tot. %' },
      { key: 'Duelos defensivos ganados, %',       label: 'Duelos defensivos ganados %',        radar: 'Duelos def. %' },
      { key: 'Duelos aéreos ganados, %',           label: 'Duelos aéreos ganados %',            radar: 'Duelos aéreos %' },
      { key: 'Duelos atacantes ganados/90',        label: 'Duelos atacantes ganados /90\'',     radar: 'Duelos atac. /90\'' },
      { key: 'Duelos atacantes ganados, %',        label: 'Duelos atacantes ganados %',         radar: 'Duelos atac. %' },
    ],
  },
  {
    label: 'Defensiva',
    keys: [
      { key: 'Interceptaciones/90',                   label: 'Interceptaciones /90\'',                radar: 'Intercep. /90\'' },
      { key: 'Entradas/90',                           label: 'Entradas (tackles) /90\'',              radar: 'Entradas /90\'' },
      { key: 'Acciones defensivas realizadas/90',     label: 'Acciones defensivas realizadas /90\'',  radar: 'Acc. def. /90\'' },
    ],
  },
]

const MAX_METRICS = 10

function findMetric(key: string): MetricDef | undefined {
  for (const g of ALL_METRIC_GROUPS) {
    const m = g.keys.find(m => m.key === key)
    if (m) return m
  }
  return undefined
}

function getAllMetricKeys(): string[] {
  return ALL_METRIC_GROUPS.flatMap(g => g.keys.map(m => m.key))
}

// ─── Position default metrics ─────────────────────────────────────────────────

const POSITION_DEFAULT_METRICS: Record<string, string[]> = {
  'Defensor central':  ['Duelos aéreos ganados, %', 'Duelos defensivos ganados, %', 'Interceptaciones/90', 'Entradas/90', 'Precisión pases, %'],
  'Lateral derecho':   ['Duelos defensivos ganados, %', 'Carreras en progresión/90', 'Centros precisos/90', 'Pases progresivos exitosos/90', 'Jugadas claves/90'],
  'Lateral izquierdo': ['Duelos defensivos ganados, %', 'Carreras en progresión/90', 'Centros precisos/90', 'Pases progresivos exitosos/90', 'Jugadas claves/90'],
  'Lateral':           ['Duelos defensivos ganados, %', 'Carreras en progresión/90', 'Centros precisos/90', 'Pases progresivos exitosos/90', 'Jugadas claves/90'],
  'Volante central':   ['Interceptaciones/90', 'Entradas/90', 'Pases progresivos exitosos/90', 'Precisión pases hacia adelante, %', 'Duelos defensivos ganados, %'],
  'Volante interno':   ['Pases progresivos exitosos/90', 'Jugadas claves/90', 'xA', 'Asistencias', 'Dribling completados/90'],
  'Mediapunta':        ['Jugadas claves/90', 'xA', 'Asistencias', 'Goles', 'Dribling completados/90'],
  'Extremo derecho':   ['Goles', 'xG', 'Asistencias', 'Dribling completados/90', 'Carreras en progresión/90'],
  'Extremo izquierdo': ['Goles', 'xG', 'Asistencias', 'Dribling completados/90', 'Carreras en progresión/90'],
  'Extremo':           ['Goles', 'xG', 'Asistencias', 'Dribling completados/90', 'Carreras en progresión/90'],
  'Delantero':         ['Goles', 'xG', 'Asistencias', 'xA', 'Duelos atacantes ganados/90'],
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMetricValue(player: EnrichedPlayer, key: string): number | null {
  const raw = (player as Record<string, unknown>)[key]
  if (raw === null || raw === undefined || raw === '' || raw === '-') return null
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(',', '.'))
  return isNaN(n) ? null : n
}

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
}

function scoreColor(s: number | null | undefined) {
  if (s == null) return 'text-apple-gray-400'
  return s >= 7 ? 'text-green-500' : s >= 5 ? 'text-amber-400' : 'text-red-400'
}

function scoreBg(s: number | null | undefined) {
  if (s == null) return 'bg-apple-gray-100 dark:bg-apple-gray-700'
  return s >= 7 ? 'bg-green-100 dark:bg-green-900/30' : s >= 5 ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-red-100 dark:bg-red-900/30'
}

// Normalize string for search (remove accents, lowercase)
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '')
}

function playerNameJitter(name: string): number {
  const c0 = name.charCodeAt(0) || 0
  const c1 = name.charCodeAt(1) || 0
  return Math.abs(c0 * 31 + c1) % 100 / 100 * 0.5 + 0.25
}

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
  name: string; club: string; liga: string; position: string
  source: 'externo' | 'interno'; player: EnrichedPlayer
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BusquedaPage() {
  const { external, internal, monitoring, loading } = useData()
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedPlayer, setSelectedPlayer] = useState<EnrichedPlayer | null>(null)
  const [selectedSource, setSelectedSource] = useState<'externo' | 'interno'>('externo')
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)

  // Cascading search filters
  const [searchLigaFilter, setSearchLigaFilter] = useState('')
  const [searchEquipoFilter, setSearchEquipoFilter] = useState('')
  const [searchPositionFilter, setSearchPositionFilter] = useState('')

  // Context filters
  const [sourceFilter, setSourceFilter] = useState<'todos' | 'externo' | 'interno'>('todos')
  const [ligaFilter, setLigaFilter] = useState('')
  const [samePosition, setSamePosition] = useState(true)

  // Active metrics (shared by bar + radar)
  const [activeMetrics, setActiveMetrics] = useState<string[]>([])
  const [scatterMetrics, setScatterMetrics] = useState<string[]>([])

  // ─── Candidates ─────────────────────────────────────────────────────────────

  const candidates = useMemo<SearchCandidate[]>(() => {
    const seen = new Set<string>()
    const result: SearchCandidate[] = []
    const add = (p: EnrichedPlayer, src: 'externo' | 'interno') => {
      const key = `${src}::${p.Jugador}`
      if (seen.has(key)) return
      seen.add(key)
      result.push({ name: p.Jugador, club: p.Equipo, liga: p.Liga, position: p['Posición'], source: src, player: p })
    }
    for (const p of external) add(p, 'externo')
    for (const p of internal) add(p, 'interno')
    for (const mp of monitoring) {
      const ep = mp.metricsPlayer ?? mp.externalPlayer
      if (ep) add(ep, ep.source ?? 'externo')
    }
    return result
  }, [external, internal, monitoring])

  const allLeagues = useMemo<string[]>(() => {
    const set = new Set<string>()
    for (const c of candidates) if (c.liga) set.add(c.liga)
    return Array.from(set).sort()
  }, [candidates])

  const equiposByLiga = useMemo<string[]>(() => {
    const set = new Set<string>()
    for (const c of candidates) {
      if (searchLigaFilter && c.liga !== searchLigaFilter) continue
      if (c.club) set.add(c.club)
    }
    return Array.from(set).sort()
  }, [candidates, searchLigaFilter])

  const positionsByFilters = useMemo<string[]>(() => {
    const set = new Set<string>()
    for (const c of candidates) {
      if (searchLigaFilter && c.liga !== searchLigaFilter) continue
      if (searchEquipoFilter && c.club !== searchEquipoFilter) continue
      if (c.position) set.add(c.position)
    }
    return Array.from(set).sort()
  }, [candidates, searchLigaFilter, searchEquipoFilter])

  const filteredCandidates = useMemo<SearchCandidate[]>(() => {
    if (!query.trim() && !searchLigaFilter && !searchPositionFilter && !searchEquipoFilter) return []
    const q = norm(query)
    return candidates
      .filter(c => {
        const matchesQuery = !q || norm(c.name).includes(q) || norm(c.club).includes(q) || norm(c.position).includes(q)
        return matchesQuery
          && (!searchLigaFilter || c.liga === searchLigaFilter)
          && (!searchEquipoFilter || c.club === searchEquipoFilter)
          && (!searchPositionFilter || c.position === searchPositionFilter)
      })
      .slice(0, 30)
  }, [candidates, query, searchLigaFilter, searchEquipoFilter, searchPositionFilter])

  // ─── Pool (excludes bad leagues) ─────────────────────────────────────────────

  const pool = useMemo<EnrichedPlayer[]>(() => {
    if (!selectedPlayer) return []
    let base: EnrichedPlayer[] =
      sourceFilter === 'externo' ? external
      : sourceFilter === 'interno' ? internal
      : [...external, ...internal]
    if (ligaFilter) base = base.filter(p => p.Liga === ligaFilter)
    if (samePosition) base = base.filter(p => p['Posición'] === selectedPlayer['Posición'])
    base = base.filter(p => !isExcludedLeague(p.Liga))
    return base
  }, [selectedPlayer, external, internal, sourceFilter, ligaFilter, samePosition])

  const availableLeagues = useMemo<string[]>(() => {
    const set = new Set<string>()
    for (const p of [...external, ...internal]) if (p.Liga && !isExcludedLeague(p.Liga)) set.add(p.Liga)
    return Array.from(set).sort()
  }, [external, internal])

  // ─── League score context ─────────────────────────────────────────────────────

  const leagueScoreContext = useMemo(() => {
    if (!selectedPlayer || selectedPlayer.ggScore == null) return null
    const liga = selectedPlayer.Liga
    const leaguePlayers = [...external, ...internal].filter(p =>
      p.Liga === liga && !isExcludedLeague(p.Liga) && p.ggScore != null
    )
    if (leaguePlayers.length < 5) return null
    const sorted = [...leaguePlayers].sort((a, b) => (b.ggScore ?? 0) - (a.ggScore ?? 0))
    const rank = sorted.findIndex(p => p.Jugador === selectedPlayer.Jugador) + 1
    const avg = leaguePlayers.reduce((s, p) => s + (p.ggScore ?? 0), 0) / leaguePlayers.length
    return { rank: rank > 0 ? rank : null, total: leaguePlayers.length, avg, liga }
  }, [selectedPlayer, external, internal])

  // ─── Smart minutes for rankings ───────────────────────────────────────────────
  // Try min-minutes thresholds 0→400 and pick the one that gives player most top-8 rankings

  const smartMinutes = useMemo(() => {
    if (!selectedPlayer || pool.length === 0) return 0
    let bestTop8 = -1
    let bestThreshold = 0
    for (const minMin of [0, 100, 200, 300, 400]) {
      const filteredPool = pool.filter(p =>
        p.Jugador === selectedPlayer.Jugador || p.minutesPlayed >= minMin
      )
      const others = filteredPool.filter(p => p.Jugador !== selectedPlayer.Jugador)
      if (others.length < 3) continue
      let top8 = 0
      for (const group of ALL_METRIC_GROUPS) {
        for (const m of group.keys) {
          const pv = getMetricValue(selectedPlayer, m.key)
          if (pv === null) continue
          const allVals = others.map(p => getMetricValue(p, m.key)).filter((v): v is number => v !== null)
          if (!allVals.length) continue
          if (allVals.filter(v => v > pv).length + 1 <= 8) top8++
        }
      }
      if (top8 > bestTop8) { bestTop8 = top8; bestThreshold = minMin }
    }
    return bestThreshold
  }, [selectedPlayer, pool])

  const rankingPool = useMemo(() =>
    smartMinutes > 0
      ? pool.filter(p => p.Jugador === selectedPlayer?.Jugador || p.minutesPlayed >= smartMinutes)
      : pool
  , [pool, smartMinutes, selectedPlayer])

  // ─── Rankings (top 8) ─────────────────────────────────────────────────────────

  const rankings = useMemo<Array<{ key: string; label: string; rank: number; total: number; playerVal: number; avg: number }>>(() => {
    if (!selectedPlayer || rankingPool.length === 0) return []
    const result: Array<{ key: string; label: string; rank: number; total: number; playerVal: number; avg: number }> = []
    for (const group of ALL_METRIC_GROUPS) {
      for (const m of group.keys) {
        const playerVal = getMetricValue(selectedPlayer, m.key)
        if (playerVal === null) continue
        const others = rankingPool.filter(p => p.Jugador !== selectedPlayer.Jugador)
        const allVals = others.map(p => getMetricValue(p, m.key)).filter((v): v is number => v !== null)
        if (!allVals.length) continue
        const rank = allVals.filter(v => v > playerVal).length + 1
        const avg = allVals.reduce((a, b) => a + b, 0) / allVals.length
        result.push({ key: m.key, label: m.label, rank, total: allVals.length + 1, playerVal, avg })
      }
    }
    return result.filter(r => r.rank <= 8).sort((a, b) => a.rank - b.rank)
  }, [selectedPlayer, rankingPool])

  // ─── Bar chart data ───────────────────────────────────────────────────────────

  const barData = useMemo(() => {
    if (!selectedPlayer || !pool.length || !activeMetrics.length) return []
    return activeMetrics.map(key => {
      const m = findMetric(key)
      const playerVal = getMetricValue(selectedPlayer, key)
      const poolVals = pool.map(p => getMetricValue(p, key)).filter((v): v is number => v !== null)
      const avg = poolVals.length ? poolVals.reduce((a, b) => a + b, 0) / poolVals.length : null
      const minV = poolVals.length ? Math.min(...poolVals) : 0
      const maxV = poolVals.length ? Math.max(...poolVals) : 1
      const range = maxV - minV || 1
      const norm = (v: number | null) => v === null ? 0 : Math.max(0, Math.min(100, ((v - minV) / range) * 100))
      return {
        name: m?.label ?? key,
        jugador: norm(playerVal),
        promedio: avg !== null ? norm(avg) : 0,
        jugadorRaw: playerVal !== null ? parseFloat(playerVal.toFixed(2)) : null,
        promedioRaw: avg !== null ? parseFloat(avg.toFixed(2)) : null,
      }
    })
  }, [selectedPlayer, pool, activeMetrics])

  const barWins = barData.filter(d => (d.jugadorRaw ?? 0) > (d.promedioRaw ?? 0)).length
  const barLosses = barData.filter(d => (d.jugadorRaw ?? 0) < (d.promedioRaw ?? 0)).length

  // ─── Radar chart data ─────────────────────────────────────────────────────────

  const radarData = useMemo(() => {
    if (!selectedPlayer || !pool.length || activeMetrics.length < 3) return []
    return activeMetrics.map(key => {
      const m = findMetric(key)
      const playerVal = getMetricValue(selectedPlayer, key)
      const poolVals = pool.map(p => getMetricValue(p, key)).filter((v): v is number => v !== null)
      if (!poolVals.length) return { subject: m?.radar ?? key, jugador: 0, promedio: 0 }
      const minV = Math.min(...poolVals), maxV = Math.max(...poolVals)
      const range = maxV - minV
      const normalize = (v: number | null) => {
        if (v === null) return 0
        return range === 0 ? 50 : Math.max(0, Math.min(100, ((v - minV) / range) * 100))
      }
      const avg = poolVals.reduce((a, b) => a + b, 0) / poolVals.length
      return { subject: m?.radar ?? key, jugador: normalize(playerVal), promedio: normalize(avg) }
    })
  }, [selectedPlayer, pool, activeMetrics])

  // ─── Scatter data ─────────────────────────────────────────────────────────────
  // Player point is ALWAYS computed from selectedPlayer directly,
  // regardless of which league the pool is filtered to.

  const buildScatterData = useCallback((metricKey: string) => {
    if (!selectedPlayer) return { poolPoints: [] as Array<{ name: string; x: number; y: number }>, playerPoint: null as null | { name: string; x: number; y: number } }
    const poolPoints: Array<{ name: string; x: number; y: number }> = []
    for (const p of pool) {
      if (p.Jugador === selectedPlayer.Jugador) continue
      const xVal = getMetricValue(p, metricKey)
      if (xVal === null) continue
      poolPoints.push({ name: p.Jugador, x: xVal, y: playerNameJitter(p.Jugador) })
    }
    const playerXVal = getMetricValue(selectedPlayer, metricKey)
    const playerPoint = playerXVal !== null ? { name: selectedPlayer.Jugador, x: playerXVal, y: 0.5 } : null
    return { poolPoints, playerPoint }
  }, [selectedPlayer, pool])

  // ─── Conclusions ──────────────────────────────────────────────────────────────

  const conclusions = useMemo(() => {
    if (!selectedPlayer || !pool.length) return null
    const playerScore = selectedPlayer.ggScore
    const poolScores = pool.map(p => p.ggScore).filter((s): s is number => s != null)
    const avgScore = poolScores.length ? poolScores.reduce((a, b) => a + b, 0) / poolScores.length : null
    const scoreRank = poolScores.length && playerScore != null ? poolScores.filter(s => s > playerScore).length + 1 : null
    const scorePct = scoreRank && poolScores.length ? Math.round(((poolScores.length - scoreRank + 1) / poolScores.length) * 100) : null
    const top1 = rankings.filter(r => r.rank === 1)
    const top3 = rankings.filter(r => r.rank <= 3)
    const above: string[] = [], below: string[] = []
    for (const group of ALL_METRIC_GROUPS) {
      for (const m of group.keys) {
        const pv = getMetricValue(selectedPlayer, m.key)
        if (pv === null) continue
        const poolVals = pool.map(p => getMetricValue(p, m.key)).filter((v): v is number => v !== null)
        if (!poolVals.length) continue
        const avg = poolVals.reduce((a, b) => a + b, 0) / poolVals.length
        if (pv > avg * 1.05) above.push(m.label)
        else if (pv < avg * 0.95) below.push(m.label)
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
    const sampleWarning = pool.length < 5 ? `Muestra pequeña (${pool.length} jugador${pool.length !== 1 ? 'es' : ''}). Los datos son referenciales.` : null
    return { playerScore, avgScore, scoreRank, scorePct, poolSize: pool.length, top1, top3, above, below, recommendation, recommendationLevel, sampleWarning }
  }, [selectedPlayer, pool, rankings])

  // ─── Actions ─────────────────────────────────────────────────────────────────

  function selectCandidate(c: SearchCandidate) {
    setSelectedPlayer(c.player)
    setSelectedSource(c.source)
    setQuery(c.name)
    setShowDropdown(false)
    setLigaFilter(c.player.Liga || '')
    setSourceFilter('todos')
    setSamePosition(true)
    const posDefaults = POSITION_DEFAULT_METRICS[c.player['Posición']]
    const allKeys = getAllMetricKeys()
    if (posDefaults) {
      const filtered = posDefaults.filter(key => getMetricValue(c.player, key) !== null)
      setActiveMetrics(filtered.length ? filtered : allKeys.filter(k => getMetricValue(c.player, k) !== null).slice(0, 5))
    } else {
      setActiveMetrics(allKeys.filter(k => getMetricValue(c.player, k) !== null).slice(0, 5))
    }
    setScatterMetrics([])
  }

  function addMetric(key: string) {
    setActiveMetrics(prev => prev.includes(key) || prev.length >= MAX_METRICS ? prev : [...prev, key])
  }
  function removeMetric(key: string) {
    setActiveMetrics(prev => prev.filter(k => k !== key))
  }
  function addScatterMetric() {
    const used = new Set(scatterMetrics)
    for (const g of ALL_METRIC_GROUPS) {
      const next = g.keys.find(m => !used.has(m.key))
      if (next) { setScatterMetrics(prev => [...prev, next.key]); return }
    }
  }
  function removeScatterMetric(idx: number) { setScatterMetrics(prev => prev.filter((_, i) => i !== idx)) }
  function updateScatterMetric(idx: number, key: string) { setScatterMetrics(prev => prev.map((k, i) => i === idx ? key : k)) }

  // ─── PDF export ───────────────────────────────────────────────────────────────

  async function exportToPDF() {
    if (!contentRef.current || !selectedPlayer) return
    setExporting(true)
    try {
      const html2canvas = (await import('html2canvas')).default
      const { jsPDF } = await import('jspdf')
      const el = contentRef.current
      const canvas = await html2canvas(el, {
        scale: 1.8,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: el.offsetWidth,
        height: el.scrollHeight,
        windowWidth: el.offsetWidth,
        windowHeight: el.scrollHeight,
      })
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pdfW = pdf.internal.pageSize.getWidth()
      const pdfH = pdf.internal.pageSize.getHeight()
      const imgH = (canvas.height * pdfW) / canvas.width
      const imgData = canvas.toDataURL('image/jpeg', 0.88)
      let left = imgH, pos = 0
      pdf.addImage(imgData, 'JPEG', 0, pos, pdfW, imgH)
      left -= pdfH
      while (left > 0) { pos -= pdfH; pdf.addPage(); pdf.addImage(imgData, 'JPEG', 0, pos, pdfW, imgH); left -= pdfH }
      pdf.save(`Análisis_${selectedPlayer.Jugador.replace(/\s+/g, '_')}.pdf`)
    } catch (e) { console.error('PDF export error:', e) }
    finally { setExporting(false) }
  }

  // ─── Click outside ────────────────────────────────────────────────────────────

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

  // ─── Loading ──────────────────────────────────────────────────────────────────

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

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-apple-gray-900 dark:text-white tracking-tight">Análisis Completo</h1>
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-1">
            Buscá un jugador para analizar su rendimiento en contexto.
          </p>
        </div>
        {selectedPlayer && (
          <button
            onClick={exportToPDF}
            disabled={exporting}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-700 dark:text-apple-gray-200 text-sm font-medium hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
        )}
      </div>

      {/* Search + cascading filters */}
      <div className="bg-white dark:bg-apple-gray-800 rounded-2xl border border-apple-gray-200 dark:border-apple-gray-700 p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap gap-2">
          <select
            value={searchLigaFilter}
            onChange={e => { setSearchLigaFilter(e.target.value); setSearchEquipoFilter(''); setSearchPositionFilter(''); setShowDropdown(true) }}
            className="px-3 py-2 rounded-xl text-sm border border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50 dark:bg-apple-gray-700 text-apple-gray-700 dark:text-apple-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green"
          >
            <option value="">Todas las ligas</option>
            {allLeagues.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <select
            value={searchEquipoFilter}
            onChange={e => { setSearchEquipoFilter(e.target.value); setSearchPositionFilter(''); setShowDropdown(true) }}
            className="px-3 py-2 rounded-xl text-sm border border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50 dark:bg-apple-gray-700 text-apple-gray-700 dark:text-apple-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green"
          >
            <option value="">Todos los equipos</option>
            {equiposByLiga.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          <select
            value={searchPositionFilter}
            onChange={e => { setSearchPositionFilter(e.target.value); setShowDropdown(true) }}
            className="px-3 py-2 rounded-xl text-sm border border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50 dark:bg-apple-gray-700 text-apple-gray-700 dark:text-apple-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green"
          >
            <option value="">Todas las posiciones</option>
            {positionsByFilters.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {(searchLigaFilter || searchEquipoFilter || searchPositionFilter) && (
            <button onClick={() => { setSearchLigaFilter(''); setSearchEquipoFilter(''); setSearchPositionFilter('') }} className="px-3 py-2 rounded-xl text-sm text-apple-gray-500 hover:text-apple-gray-700 dark:hover:text-white transition-colors">
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
            placeholder={searchEquipoFilter ? `Buscar en ${searchEquipoFilter}...` : searchLigaFilter ? `Buscar en ${searchLigaFilter}...` : 'Buscar jugador por nombre...'}
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
                  <div className="w-8 h-8 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-semibold text-apple-gray-600 dark:text-apple-gray-300">{getInitials(c.name)}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-apple-gray-900 dark:text-white truncate">{c.name}</p>
                    <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 truncate">{c.club} · {c.position}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500 flex-shrink-0">{c.liga}</span>
                </button>
              ))}
            </div>
          )}
          {showDropdown && (query.trim().length > 1 || searchLigaFilter || searchEquipoFilter || searchPositionFilter) && filteredCandidates.length === 0 && (
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
                  {selectedPlayer.Imagen ? (
                    <img src={selectedPlayer.Imagen} alt={selectedPlayer.Jugador} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-xl font-bold text-apple-gray-500 dark:text-apple-gray-300">{getInitials(selectedPlayer.Jugador)}</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => navigate(`/jugador/${encodeURIComponent(selectedPlayer.Jugador)}?source=${selectedSource}`)} className="text-xl font-semibold text-apple-gray-900 dark:text-white hover:text-brand-green transition-colors">
                      {selectedPlayer.Jugador}
                    </button>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300">
                      {selectedSource === 'interno' ? 'Interno' : 'Externo'}
                    </span>
                  </div>
                  <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
                    {selectedPlayer.Equipo}{selectedPlayer.Liga ? ` · ${selectedPlayer.Liga}` : ''}{selectedPlayer['Posición'] ? ` · ${selectedPlayer['Posición']}` : ''}{selectedPlayer.Edad ? ` · ${selectedPlayer.Edad} años` : ''}
                  </p>
                </div>
                {selectedPlayer.ggScore != null && (
                  <div className={`flex-shrink-0 flex flex-col items-center justify-center w-16 h-16 rounded-2xl ${scoreBg(selectedPlayer.ggScore)}`}>
                    <span className={`text-2xl font-bold ${scoreColor(selectedPlayer.ggScore)}`}>{selectedPlayer.ggScore.toFixed(1)}</span>
                    <span className="text-xs text-apple-gray-500 dark:text-apple-gray-400">Score GG</span>
                    {leagueScoreContext?.rank && (
                      <span className="text-2xs text-apple-gray-400 dark:text-apple-gray-500 leading-none mt-0.5">
                        {leagueScoreContext.rank}° / {leagueScoreContext.total}
                      </span>
                    )}
                  </div>
                )}
              </div>
              {/* League score comparison */}
              {leagueScoreContext && selectedPlayer.ggScore != null && (
                <div className="mt-3 pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700/50 flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-apple-gray-400 dark:text-apple-gray-500">Score en {leagueScoreContext.liga}:</span>
                  {leagueScoreContext.rank && (
                    <span className={`text-xs font-semibold ${leagueScoreContext.rank <= 5 ? 'text-brand-green' : leagueScoreContext.rank <= 15 ? 'text-amber-500' : 'text-apple-gray-500'}`}>
                      {leagueScoreContext.rank}° de {leagueScoreContext.total}
                    </span>
                  )}
                  <span className="text-xs text-apple-gray-400 dark:text-apple-gray-500">
                    · prom. liga: {leagueScoreContext.avg.toFixed(1)}
                    · diferencia: {selectedPlayer.ggScore > leagueScoreContext.avg ? '+' : ''}{(selectedPlayer.ggScore - leagueScoreContext.avg).toFixed(1)}
                  </span>
                </div>
              )}
            </div>

            {/* Context filters */}
            <div className="mt-6 bg-white dark:bg-apple-gray-800 rounded-2xl border border-apple-gray-200 dark:border-apple-gray-700 p-4 shadow-sm">
              <h2 className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mb-3">Contexto de análisis</h2>
              <div className="flex flex-wrap gap-4 items-end">
                <div className="space-y-1">
                  <label className="text-xs text-apple-gray-500 dark:text-apple-gray-400">Fuente</label>
                  <div className="flex gap-1">
                    {(['todos', 'externo', 'interno'] as const).map(s => (
                      <button key={s} onClick={() => setSourceFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${sourceFilter === s ? 'bg-brand-green text-black' : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600'}`}>
                        {s === 'todos' ? 'Todos' : s === 'externo' ? 'Externos' : 'Internos'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-apple-gray-500 dark:text-apple-gray-400">Liga</label>
                  <select value={ligaFilter} onChange={e => setLigaFilter(e.target.value)} className="px-3 py-1.5 rounded-lg text-xs border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 text-apple-gray-700 dark:text-apple-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green">
                    <option value="">Todas las ligas</option>
                    {availableLeagues.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={samePosition} onChange={e => setSamePosition(e.target.checked)} className="w-4 h-4 rounded border-apple-gray-300 text-brand-green focus:ring-brand-green" />
                  <span className="text-xs text-apple-gray-700 dark:text-apple-gray-300">Solo misma posición</span>
                </label>
                <div className="ml-auto text-xs text-apple-gray-400 dark:text-apple-gray-500">
                  {pool.length} jugadores en el pool
                  {smartMinutes > 0 && <span className="ml-1 text-brand-green/70"> · mín. {smartMinutes}' jugados</span>}
                </div>
              </div>
            </div>

            {/* Rankings */}
            <div className="mt-6 bg-white dark:bg-apple-gray-800 rounded-2xl border border-apple-gray-200 dark:border-apple-gray-700 p-6 shadow-sm">
              <div className="flex items-baseline gap-2 mb-1">
                <h2 className="text-base font-semibold text-apple-gray-900 dark:text-white">Posicionamiento en el grupo</h2>
                <span className="text-xs text-apple-gray-400 dark:text-apple-gray-500">entre {rankingPool.length} jugadores</span>
              </div>
              <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 mb-5">
                Métricas donde {selectedPlayer.Jugador} se ubica en los primeros puestos. Incluye su valor real y el promedio del grupo.
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
                          <p className="text-2xs text-apple-gray-400 dark:text-apple-gray-500">
                            prom: {r.avg.toFixed(2)}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                  <div className="mt-4 pt-4 border-t border-apple-gray-100 dark:border-apple-gray-700/50">
                    <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 leading-relaxed">
                      {rankings.filter(r => r.rank === 1).length > 0
                        ? `${selectedPlayer.Jugador} lidera el grupo en ${rankings.filter(r => r.rank === 1).map(r => r.label).join(' y ')}${rankings.filter(r => r.rank === 1).length === 1 ? ` con ${rankings.find(r => r.rank === 1)!.playerVal.toFixed(2)} (prom. ${rankings.find(r => r.rank === 1)!.avg.toFixed(2)})` : ''}.`
                        : `${selectedPlayer.Jugador} aparece en el top 8 en ${rankings.length} métricas dentro del grupo.`
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
                    const m = findMetric(key)
                    return (
                      <span key={key} className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1 rounded-full bg-brand-green/10 border border-brand-green/25 text-xs font-medium text-brand-green dark:text-green-400">
                        {m?.label ?? key}
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
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-5">
                {ALL_METRIC_GROUPS.map(group => {
                  const available = group.keys.filter(m => !activeMetrics.includes(m.key) && getMetricValue(selectedPlayer, m.key) !== null)
                  return (
                    <select
                      key={group.label}
                      value=""
                      onChange={e => { if (e.target.value) addMetric(e.target.value) }}
                      disabled={activeMetrics.length >= MAX_METRICS || available.length === 0}
                      className="w-full px-3 py-2 rounded-xl text-xs border border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50 dark:bg-apple-gray-700/60 text-apple-gray-600 dark:text-apple-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <option value="">+ {group.label}</option>
                      {available.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
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
                    <div className="mb-10">
                      <h3 className="text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-200 mb-1">Radar vs promedio</h3>
                      <div className="flex items-center gap-5 mb-4">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-brand-green" />
                          <span className="text-sm font-medium text-apple-gray-700 dark:text-apple-gray-200">{selectedPlayer.Jugador}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#94A3B8" strokeWidth="2.5" strokeDasharray="5 4" /></svg>
                          <span className="text-sm text-apple-gray-500 dark:text-apple-gray-400">Promedio del grupo</span>
                        </div>
                      </div>
                      <div style={{ height: Math.max(340, activeMetrics.length * 28) }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <RadarChart data={radarData} margin={{ top: 20, right: 55, bottom: 20, left: 55 }}>
                            <PolarGrid stroke="rgba(156,163,175,0.2)" />
                            <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: 'currentColor', fontWeight: 500 }} />
                            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                            {/* Player first (green fill underneath) */}
                            <Radar name={selectedPlayer.Jugador} dataKey="jugador" stroke="#22C55E" strokeWidth={2.5} fill="#22C55E" fillOpacity={0.22} />
                            {/* Promedio on top — prominent dashed line, no fill */}
                            <Radar name="Promedio" dataKey="promedio" stroke="#94A3B8" strokeWidth={3} strokeDasharray="6 4" fill="#94A3B8" fillOpacity={0.06} />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>
                      <p className="text-xs text-apple-gray-400 dark:text-apple-gray-500 mt-2 text-center">
                        Cada eje es una métrica normalizada 0-100 dentro del grupo. Área verde = jugador analizado. Línea punteada gris = promedio.
                      </p>
                    </div>
                  )}

                  {/* Bar chart */}
                  <div>
                    <h3 className="text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-200 mb-1">Barras comparativas</h3>
                    <div className="flex items-center gap-5 mb-4">
                      <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-brand-green" /><span className="text-sm text-apple-gray-600 dark:text-apple-gray-300">{selectedPlayer.Jugador}</span></div>
                      <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-apple-gray-400/50" /><span className="text-sm text-apple-gray-500 dark:text-apple-gray-400">Promedio del grupo</span></div>
                    </div>
                    <div style={{ height: Math.max(300, activeMetrics.length * 68) }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={barData} layout="vertical" margin={{ top: 4, right: 70, left: 10, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(156,163,175,0.1)" />
                          <XAxis type="number" domain={[0, 100]} tick={false} axisLine={false} tickLine={false} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 13, fontWeight: 500 }} width={200} />
                          <Tooltip
                            cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null
                              const d = payload[0]?.payload as { name: string; jugadorRaw: number | null; promedioRaw: number | null }
                              return (
                                <div className="bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 rounded-lg px-3 py-2.5 shadow-lg text-sm">
                                  <p className="font-semibold text-apple-gray-700 dark:text-apple-gray-200 mb-1.5">{d.name}</p>
                                  <p className="text-brand-green font-medium">{selectedPlayer.Jugador}: <strong>{d.jugadorRaw?.toFixed(2) ?? '—'}</strong></p>
                                  <p className="text-apple-gray-500 dark:text-apple-gray-400">Promedio: <strong>{d.promedioRaw?.toFixed(2) ?? '—'}</strong></p>
                                </div>
                              )
                            }}
                          />
                          <Bar dataKey="jugador" name={selectedPlayer.Jugador} fill="#22C55E" radius={[0, 5, 5, 0]} barSize={14}>
                            <LabelList dataKey="jugadorRaw" position="right" formatter={(v: number | null) => v?.toFixed(2) ?? ''} style={{ fontSize: 12, fill: '#22C55E', fontWeight: 700 }} />
                          </Bar>
                          <Bar dataKey="promedio" name="Promedio" fill="rgba(156,163,175,0.4)" radius={[0, 5, 5, 0]} barSize={14}>
                            <LabelList dataKey="promedioRaw" position="right" formatter={(v: number | null) => v?.toFixed(2) ?? ''} style={{ fontSize: 11, fill: '#9CA3AF' }} />
                          </Bar>
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
                      Las barras están normalizadas (0–100) dentro del grupo para comparación visual. El número a la derecha es el valor real.
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Scatter */}
            <div className="mt-6 bg-white dark:bg-apple-gray-800 rounded-2xl border border-apple-gray-200 dark:border-apple-gray-700 p-6 shadow-sm">
              <h2 className="text-base font-semibold text-apple-gray-900 dark:text-white mb-1">Dispersión en el contexto</h2>
              <p className="text-xs text-apple-gray-400 dark:text-apple-gray-500 mb-4">
                Cada punto es un jugador del pool. El verde es siempre {selectedPlayer.Jugador}, aunque esté en otra liga. Agregá varios gráficos para distintas métricas.
              </p>
              <div className="flex items-center gap-5 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-brand-green border-2 border-white dark:border-apple-gray-800 shadow" />
                  <span className="text-sm font-medium text-apple-gray-700 dark:text-apple-gray-200">{selectedPlayer.Jugador}</span>
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
                  const metricMeta = findMetric(metricKey)
                  const { poolPoints, playerPoint } = buildScatterData(metricKey)
                  const allX = [...poolPoints.map(p => p.x), ...(playerPoint ? [playerPoint.x] : [])]
                  const avgX = allX.length ? allX.reduce((a, b) => a + b, 0) / allX.length : 0

                  return (
                    <div key={idx} className="border border-apple-gray-100 dark:border-apple-gray-700 rounded-xl p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <select
                          value={metricKey}
                          onChange={e => updateScatterMetric(idx, e.target.value)}
                          className="flex-1 px-3 py-1.5 rounded-lg text-sm border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 text-apple-gray-700 dark:text-apple-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green"
                        >
                          {ALL_METRIC_GROUPS.map(group => (
                            <optgroup key={group.label} label={group.label}>
                              {group.keys.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                            </optgroup>
                          ))}
                        </select>
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
                                {/* Pool — gray dots */}
                                {poolPoints.length > 0 && (
                                  <Scatter name="Pool" data={poolPoints} shape={(props: { cx?: number; cy?: number }) => (
                                    <circle cx={props.cx} cy={props.cy} r={4.5} fill="rgba(148,163,184,0.55)" />
                                  )} />
                                )}
                                {/* Analyzed player — always green, always on top */}
                                {playerPoint && (
                                  <Scatter name={selectedPlayer.Jugador} data={[playerPoint]} shape={(props: { cx?: number; cy?: number }) => (
                                    <circle cx={props.cx} cy={props.cy} r={9} fill="#22C55E" stroke="white" strokeWidth={2.5} />
                                  )} />
                                )}
                              </ScatterChart>
                            </ResponsiveContainer>
                          </div>
                          <p className="text-xs text-apple-gray-400 dark:text-apple-gray-500 mt-1">
                            {playerPoint
                              ? `${selectedPlayer.Jugador} registra ${playerPoint.x.toFixed(2)} en ${metricMeta?.label ?? metricKey}${allX.length > 1 ? `, ${playerPoint.x > avgX ? 'por encima' : 'por debajo'} del promedio (${avgX.toFixed(2)})` : ''}.`
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
                disabled={scatterMetrics.length >= ALL_METRIC_GROUPS.flatMap(g => g.keys).length}
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
                    <div className="grid grid-cols-2 gap-3">
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
