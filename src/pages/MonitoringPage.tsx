import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '@/context/DataContext'
import { useAuth } from '@/context/AuthContext'
import { useMonitoringStatus, STATUS_CONFIG, formatStatusWithScout } from '@/hooks/useMonitoringStatus'
import type { MonitoringStatusRecord } from '@/services/monitoringService'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import ScoreBar from '@/components/ui/ScoreBar'
import AuthModal from '@/components/auth/AuthModal'
import { SELECTABLE_METRICS } from '@/components/filters/FilterSidebar'
import { FILTER_POSITION_MAP } from '@/constants/scoring'
// ScoreEvolutionMini removed - now showing status history instead
import type { MonitoringPlayer, ManagementStatus } from '@/types'

// ─── FILTER SECTION COMPONENT ────────────────────────────────────────────────

function FilterSection({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-apple-gray-200/50 dark:border-apple-gray-800/50 last:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-3.5 text-sm font-medium text-apple-gray-700 dark:text-apple-gray-300 hover:text-apple-gray-900 dark:hover:text-white transition-colors"
      >
        {title}
        <svg className={`w-4 h-4 text-apple-gray-400 transition-transform duration-200 ease-apple ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div className={`overflow-hidden transition-all duration-200 ease-apple ${open ? 'max-h-96 opacity-100 pb-4' : 'max-h-0 opacity-0'}`}>
        {children}
      </div>
    </div>
  )
}

// ─── STATUS BADGE COMPONENT ──────────────────────────────────────────────────

function StatusBadge({
  statusRecord,
  playerId,
  onStatusChange,
  requiresAuth,
  onAuthRequired,
  onStatusChanged,
}: {
  statusRecord: MonitoringStatusRecord | null
  playerId: string
  onStatusChange: (id: string, status: ManagementStatus) => Promise<boolean>
  requiresAuth: boolean
  onAuthRequired: () => void
  onStatusChanged?: () => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const status: ManagementStatus = statusRecord?.status || 'en_seguimiento'
  const config = STATUS_CONFIG[status]

  const handleChange = async (newStatus: ManagementStatus) => {
    if (requiresAuth) {
      onAuthRequired()
      setIsOpen(false)
      return
    }
    if (newStatus === status) {
      setIsOpen(false)
      return
    }
    setIsUpdating(true)
    const success = await onStatusChange(playerId, newStatus)
    setIsUpdating(false)
    setIsOpen(false)
    if (success && onStatusChanged) {
      onStatusChanged()
    }
  }

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen) }}
        disabled={isUpdating}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${config.bgColor} ${config.color} hover:opacity-80 whitespace-nowrap disabled:opacity-50`}
      >
        {config.label}
        <svg className="inline-block w-3.5 h-3.5 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Show who changed it - only for non-default statuses */}
      {statusRecord?.changed_by_name && status !== 'en_seguimiento' && (
        <p className="text-2xs text-apple-gray-400 mt-0.5 truncate max-w-[140px]">
          por {statusRecord.changed_by_name}
        </p>
      )}

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-apple-gray-800 rounded-xl shadow-xl border border-apple-gray-200 dark:border-apple-gray-700 py-1.5 min-w-[180px]">
            {requiresAuth && (
              <p className="px-4 py-2 text-xs text-apple-gray-500 border-b border-apple-gray-100 dark:border-apple-gray-700">
                Inicia sesion para cambiar
              </p>
            )}
            {(Object.entries(STATUS_CONFIG) as [ManagementStatus, typeof config][]).map(([key, cfg]) => (
              <button
                key={key}
                onClick={(e) => {
                  e.stopPropagation()
                  handleChange(key)
                }}
                className={`w-full px-4 py-2 text-left text-sm hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors ${
                  key === status ? 'font-semibold' : ''
                } ${cfg.color}`}
              >
                {cfg.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── OPPORTUNITY BADGE ───────────────────────────────────────────────────────

function OpportunityBadge({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) return null

  const getLevel = (s: number) => {
    if (s >= 8) return { label: 'Excelente', color: 'text-green-500 bg-green-500/10' }
    if (s >= 5) return { label: 'Buena', color: 'text-emerald-500 bg-emerald-500/10' }
    if (s >= 3) return { label: 'Regular', color: 'text-amber-500 bg-amber-500/10' }
    return { label: 'Baja', color: 'text-gray-400 bg-gray-500/10' }
  }

  const level = getLevel(score)

  return (
    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-2xs font-medium ${level.color}`}>
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
      <span>{score.toFixed(1)}</span>
    </div>
  )
}

// ─── COMPARISON BADGE ────────────────────────────────────────────────────────

function ComparisonBadge({ scoreDiff, avgScore }: { scoreDiff: number | null | undefined; avgScore: number | null | undefined }) {
  if (scoreDiff === null || scoreDiff === undefined) return null

  const isPositive = scoreDiff > 0
  const isNeutral = Math.abs(scoreDiff) < 2

  return (
    <div
      className={`inline-flex items-center gap-1 text-xs font-medium ${
        isNeutral
          ? 'text-gray-400'
          : isPositive
          ? 'text-green-500'
          : 'text-amber-500'
      }`}
      title={`Promedio Doble G: ${avgScore?.toFixed(1) ?? '-'}`}
    >
      {isPositive ? (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
        </svg>
      ) : scoreDiff < 0 ? (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      ) : null}
      <span>{scoreDiff > 0 ? '+' : ''}{scoreDiff.toFixed(1)} vs Doble G</span>
    </div>
  )
}

// ─── ALERT BADGES ────────────────────────────────────────────────────────────

function AlertBadges({ player }: { player: MonitoringPlayer }) {
  const alerts = []

  // Contract alert
  if (player.monthsRemaining !== null && player.monthsRemaining !== undefined) {
    if (player.monthsRemaining < 7) {
      alerts.push(
        <span key="contract" className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 text-2xs font-medium">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {player.monthsRemaining}m
        </span>
      )
    } else if (player.monthsRemaining < 13) {
      alerts.push(
        <span key="contract" className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 text-2xs font-medium">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {player.monthsRemaining}m
        </span>
      )
    }
  }

  if (alerts.length === 0) return null

  return <div className="flex items-center gap-1">{alerts}</div>
}

// ─── LOW DATA WARNING ────────────────────────────────────────────────────────

function LowDataWarning() {
  return (
    <div className="inline-flex items-center gap-1.5 text-2xs text-apple-gray-400 italic">
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>Datos insuficientes</span>
    </div>
  )
}

// ─── FILTER PERSISTENCE ──────────────────────────────────────────────────────

const FILTERS_KEY = 'monitoring_filters'

interface MonitoringFilters {
  search: string
  posFilters: string[]
  ligaFilters: string[]
  clubSearch: string
  rolFilter: string
  repreFilter: string
  statusFilter: ManagementStatus | ''
  sortByScore: 'asc' | 'desc' | null
  sortByOpportunity: 'asc' | 'desc' | null
  pie: string
  minHeight: number
  maxHeight: number
  selectedMetrics: string[]
}

function loadFilters(): Partial<MonitoringFilters> {
  try {
    const stored = sessionStorage.getItem(FILTERS_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

function saveFilters(filters: MonitoringFilters): void {
  try {
    sessionStorage.setItem(FILTERS_KEY, JSON.stringify(filters))
  } catch { /* ignore */ }
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function MonitoringPage() {
  const navigate = useNavigate()
  const { monitoring, loading, error, positionAverages } = useData()
  const { user } = useAuth()
  const {
    getPlayerStatus,
    setPlayerStatus,
    requiresAuth,
    loading: statusLoading,
  } = useMonitoringStatus()
  const [showAuthModal, setShowAuthModal] = useState(false)

  // Load persisted filters on mount
  const savedFilters = loadFilters()

  // Filters with persistence
  const [search, setSearch] = useState(savedFilters.search ?? '')
  const [posFilters, setPosFilters] = useState<string[]>(savedFilters.posFilters ?? [])
  const [ligaFilters, setLigaFilters] = useState<string[]>(savedFilters.ligaFilters ?? [])
  const [clubSearch, setClubSearch] = useState(savedFilters.clubSearch ?? '')
  const [rolFilter, setRolFilter] = useState(savedFilters.rolFilter ?? '')
  const [repreFilter, setRepreFilter] = useState(savedFilters.repreFilter ?? '')
  const [statusFilter, setStatusFilter] = useState<ManagementStatus | ''>(savedFilters.statusFilter ?? '')
  const [sortByScore, setSortByScore] = useState<'asc' | 'desc' | null>(savedFilters.sortByScore ?? 'desc')
  const [sortByOpportunity, setSortByOpportunity] = useState<'asc' | 'desc' | null>(savedFilters.sortByOpportunity ?? null)
  const [sortByMetric, setSortByMetric] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null)
  const [pie, setPie] = useState(savedFilters.pie ?? '')
  const [minHeight, setMinHeight] = useState(savedFilters.minHeight ?? 0)
  const [maxHeight, setMaxHeight] = useState(savedFilters.maxHeight ?? 0)
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(savedFilters.selectedMetrics ?? [])

  // Save filters whenever they change
  useEffect(() => {
    saveFilters({
      search, posFilters, ligaFilters, clubSearch, rolFilter, repreFilter,
      statusFilter, sortByScore, sortByOpportunity, pie, minHeight, maxHeight, selectedMetrics
    })
  }, [search, posFilters, ligaFilters, clubSearch, rolFilter, repreFilter, statusFilter, sortByScore, sortByOpportunity, pie, minHeight, maxHeight, selectedMetrics])


  // Extract unique values for filters
  const { positions, ligas, roles, representantes, statusCounts } = useMemo(() => {
    const posSet = new Set<string>()
    const ligaSet = new Set<string>()
    const rolSet = new Set<string>()
    const repreSet = new Set<string>()
    const counts: Record<ManagementStatus, number> = {
      en_seguimiento: 0,
      contactado: 0,
      en_negociacion: 0,
      descartado: 0,
    }

    monitoring.forEach(p => {
      if (p['Posición']) posSet.add(p['Posición'])
      if (p.Liga) ligaSet.add(p.Liga)
      if (p.Rol) rolSet.add(p.Rol)
      if (p.Repre) repreSet.add(p.Repre)
      if (p.metricsPlayer?.Representante) repreSet.add(p.metricsPlayer.Representante)

      const status = getPlayerStatus(p.Jugador)?.status || 'en_seguimiento'
      counts[status]++
    })

    return {
      positions: [...posSet].sort(),
      ligas: [...ligaSet].sort(),
      roles: [...rolSet].sort(),
      representantes: [...repreSet].filter(r => r && r !== '-').sort(),
      statusCounts: counts,
    }
  }, [monitoring, getPlayerStatus])

  const toggleFilter = (arr: string[], setArr: (v: string[]) => void, item: string) => {
    setArr(arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item])
  }

  // Filter and sort players
  const filtered = useMemo(() => {
    let result = monitoring.filter(p => {
      // Text search
      if (search) {
        const s = search.toLowerCase()
        if (
          !p.Jugador.toLowerCase().includes(s) &&
          !p['Nombre jugador'].toLowerCase().includes(s) &&
          !(p.Club?.toLowerCase().includes(s))
        ) return false
      }
      // Position filter
      if (posFilters.length > 0 && !posFilters.includes(p['Posición'])) return false
      // League filter
      if (ligaFilters.length > 0 && !ligaFilters.includes(p.Liga)) return false
      // Club search
      if (clubSearch && !p.Club?.toLowerCase().includes(clubSearch.toLowerCase())) return false
      // Role filter
      if (rolFilter && p.Rol !== rolFilter) return false
      // Representative filter
      if (repreFilter) {
        const playerRepre = p.Repre || p.metricsPlayer?.Representante || ''
        if (!playerRepre.toLowerCase().includes(repreFilter.toLowerCase())) return false
      }
      // Status filter
      if (statusFilter) {
        const playerStatus = getPlayerStatus(p.Jugador)?.status || 'en_seguimiento'
        if (playerStatus !== statusFilter) return false
      }
      // Pie filter
      if (pie) {
        const playerPie = (p.metricsPlayer?.Pie || '').toLowerCase().trim()
        if (playerPie !== pie.toLowerCase()) return false
      }
      // Altura filter
      if (minHeight > 0 || maxHeight > 0) {
        const alturaStr = String(p.metricsPlayer?.Altura ?? '').replace(/[^\d]/g, '')
        const altura = parseInt(alturaStr, 10)
        if (isNaN(altura) || altura < 100) return false
        if (minHeight > 0 && altura < minHeight) return false
        if (maxHeight > 0 && altura > maxHeight) return false
      }
      return true
    })

    // Sort
    if (sortByScore) {
      result = [...result].sort((a, b) => {
        const scoreA = a.ggScore ?? -1
        const scoreB = b.ggScore ?? -1
        return sortByScore === 'desc' ? scoreB - scoreA : scoreA - scoreB
      })
    } else if (sortByOpportunity) {
      result = [...result].sort((a, b) => {
        const oppA = a.opportunityScore ?? -1
        const oppB = b.opportunityScore ?? -1
        return sortByOpportunity === 'desc' ? oppB - oppA : oppA - oppB
      })
    } else if (sortByMetric) {
      result = [...result].sort((a, b) => {
        const valA = a.metricsPlayer?.[sortByMetric.key]
        const valB = b.metricsPlayer?.[sortByMetric.key]
        const numA = typeof valA === 'number' ? valA : parseFloat(String(valA ?? '').replace(',', '.')) || -999
        const numB = typeof valB === 'number' ? valB : parseFloat(String(valB ?? '').replace(',', '.')) || -999
        return sortByMetric.direction === 'desc' ? numB - numA : numA - numB
      })
    }

    return result
  }, [monitoring, search, posFilters, ligaFilters, clubSearch, rolFilter, repreFilter, statusFilter, sortByScore, sortByOpportunity, sortByMetric, getPlayerStatus, pie, minHeight, maxHeight])

  const activeFilters = posFilters.length + ligaFilters.length + (clubSearch ? 1 : 0) + (rolFilter ? 1 : 0) + (repreFilter ? 1 : 0) + (statusFilter ? 1 : 0) + (pie ? 1 : 0) + (minHeight > 0 ? 1 : 0) + (maxHeight > 0 ? 1 : 0)
  const resetFilters = () => {
    setPosFilters([])
    setLigaFilters([])
    setClubSearch('')
    setRolFilter('')
    setRepreFilter('')
    setStatusFilter('')
    setPie('')
    setMinHeight(0)
    setMaxHeight(0)
  }

  const toggleMetric = (key: string) => {
    setSelectedMetrics(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  const handleRowClick = (player: MonitoringPlayer) => {
    if (player.metricsPlayer) {
      const id = encodeURIComponent(player.Jugador)
      // Get position from metricsPlayer (Wyscout codes like RCB, LCB) for radar
      const pos = player.metricsPlayer['Posición específica'] || player.metricsPlayer['Posición'] || player['Posición'] || ''
      navigate(`/jugador/${id}?source=seguimiento&pos=${encodeURIComponent(pos)}`)
    } else if (player.externalPlayer) {
      const id = encodeURIComponent(player.externalPlayer.Jugador)
      navigate(`/jugador/${id}?source=externo`)
    }
  }

  const handleSortScore = () => {
    setSortByOpportunity(null)
    setSortByMetric(null)
    setSortByScore(prev => prev === 'desc' ? 'asc' : prev === 'asc' ? null : 'desc')
  }

  const handleSortOpportunity = () => {
    setSortByScore(null)
    setSortByMetric(null)
    setSortByOpportunity(prev => prev === 'desc' ? 'asc' : prev === 'asc' ? null : 'desc')
  }

  const handleSortMetric = (key: string) => {
    setSortByScore(null)
    setSortByOpportunity(null)
    setSortByMetric(prev => {
      if (prev?.key === key) {
        if (prev.direction === 'desc') return { key, direction: 'asc' }
        return null // Third click removes sorting
      }
      return { key, direction: 'desc' }
    })
  }

  if (loading) return <LoadingSpinner fullScreen message="Cargando jugadores en seguimiento..." />
  if (error) return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-8">
      <EmptyState title="Error al cargar datos" description={error} icon="error" />
    </div>
  )

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-apple-gray-800 dark:text-white tracking-tight">
            Jugadores en Seguimiento
          </h1>
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
            {filtered.length.toLocaleString('es')} de {monitoring.length.toLocaleString('es')} jugadores monitoreados
          </p>
        </div>

        {/* Status summary pills */}
        <div className="flex flex-wrap items-center gap-2">
          {(Object.entries(STATUS_CONFIG) as [ManagementStatus, typeof STATUS_CONFIG.en_seguimiento][]).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(statusFilter === key ? '' : key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                statusFilter === key
                  ? `${cfg.bgColor} ${cfg.color} ring-2 ring-offset-1 ring-current dark:ring-offset-apple-gray-900`
                  : 'bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-400 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700'
              }`}
            >
              {cfg.label} ({statusCounts[key]})
            </button>
          ))}
        </div>
      </div>

      {/* Search bar */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar por nombre o club..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-apple pl-9 pr-4 w-full"
          />
        </div>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <aside className="w-60 flex-shrink-0 hidden lg:block">
          <div className="sticky top-[4rem] card-apple overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-apple-gray-200/50 dark:border-apple-gray-700/50 bg-apple-gray-50 dark:bg-apple-gray-800/50">
              <span className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider flex items-center gap-2">
                Filtros
                {activeFilters > 0 && (
                  <span className="px-1.5 py-0.5 bg-brand-green text-black rounded-full text-2xs font-bold">{activeFilters}</span>
                )}
              </span>
              {activeFilters > 0 && (
                <button onClick={resetFilters} className="text-xs font-medium text-brand-green hover:text-green-400 transition-colors">
                  Limpiar
                </button>
              )}
            </div>
            <div className="px-4 divide-y divide-apple-gray-200/50 dark:divide-apple-gray-800/50 max-h-[calc(100vh-12rem)] overflow-y-auto scrollbar-thin">
              <FilterSection title="Posicion">
                <div className="space-y-2 max-h-40 overflow-y-auto scrollbar-thin pr-1">
                  {positions.map(pos => (
                    <label key={pos} className="flex items-center gap-2.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={posFilters.includes(pos)}
                        onChange={() => toggleFilter(posFilters, setPosFilters, pos)}
                        className="w-4 h-4 rounded border-apple-gray-300 dark:border-apple-gray-600 text-brand-green focus:ring-brand-green"
                      />
                      <span className="text-sm text-apple-gray-700 dark:text-apple-gray-300 group-hover:text-apple-gray-900 dark:group-hover:text-white transition-colors">{pos}</span>
                    </label>
                  ))}
                </div>
              </FilterSection>
              <FilterSection title="Liga">
                <div className="space-y-2 max-h-40 overflow-y-auto scrollbar-thin pr-1">
                  {ligas.map(lg => (
                    <label key={lg} className="flex items-center gap-2.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={ligaFilters.includes(lg)}
                        onChange={() => toggleFilter(ligaFilters, setLigaFilters, lg)}
                        className="w-4 h-4 rounded border-apple-gray-300 dark:border-apple-gray-600 text-brand-green focus:ring-brand-green"
                      />
                      <span className="text-xs text-apple-gray-700 dark:text-apple-gray-300 truncate group-hover:text-apple-gray-900 dark:group-hover:text-white transition-colors" title={lg}>{lg}</span>
                    </label>
                  ))}
                </div>
              </FilterSection>
              <FilterSection title="Club" defaultOpen={false}>
                <input
                  type="text"
                  placeholder="Buscar club..."
                  value={clubSearch}
                  onChange={e => setClubSearch(e.target.value)}
                  className="input-apple text-sm"
                />
              </FilterSection>
              <FilterSection title="Rol" defaultOpen={false}>
                <select
                  value={rolFilter}
                  onChange={e => setRolFilter(e.target.value)}
                  className="input-apple text-sm"
                >
                  <option value="">Todos</option>
                  {roles.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </FilterSection>
              <FilterSection title="Representante" defaultOpen={false}>
                <input
                  type="text"
                  placeholder="Buscar representante..."
                  value={repreFilter}
                  onChange={e => setRepreFilter(e.target.value)}
                  className="input-apple text-sm mb-2"
                />
                <div className="space-y-1.5 max-h-40 overflow-y-auto scrollbar-thin pr-1">
                  {representantes.slice(0, 20).map(r => (
                    <button
                      key={r}
                      onClick={() => setRepreFilter(r)}
                      className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${
                        repreFilter === r
                          ? 'bg-brand-green text-black'
                          : 'text-apple-gray-600 dark:text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </FilterSection>
              <FilterSection title="Pie" defaultOpen={false}>
                <div className="flex flex-wrap gap-2">
                  {['izquierdo', 'derecho', 'ambos'].map(p => (
                    <button
                      key={p}
                      onClick={() => setPie(pie === p ? '' : p)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                        pie === p
                          ? 'bg-brand-green text-black'
                          : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600'
                      }`}
                    >
                      {p === 'izquierdo' ? 'Zurdo' : p === 'derecho' ? 'Diestro' : 'Ambos'}
                    </button>
                  ))}
                </div>
              </FilterSection>
              <FilterSection title="Altura" defaultOpen={false}>
                <div className="flex gap-2 mb-2">
                  <input
                    type="number"
                    placeholder="Min cm"
                    value={minHeight || ''}
                    onChange={e => setMinHeight(parseInt(e.target.value) || 0)}
                    className="input-apple text-sm w-20"
                  />
                  <span className="text-apple-gray-400 self-center">-</span>
                  <input
                    type="number"
                    placeholder="Max cm"
                    value={maxHeight || ''}
                    onChange={e => setMaxHeight(parseInt(e.target.value) || 0)}
                    className="input-apple text-sm w-20"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setMinHeight(185); setMaxHeight(0) }}
                    className={`flex-1 text-xs px-2 py-1.5 rounded-lg transition-colors ${
                      minHeight === 185 && !maxHeight
                        ? 'bg-brand-green text-black'
                        : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300'
                    }`}
                  >
                    +185cm
                  </button>
                  <button
                    onClick={() => { setMinHeight(0); setMaxHeight(175) }}
                    className={`flex-1 text-xs px-2 py-1.5 rounded-lg transition-colors ${
                      !minHeight && maxHeight === 175
                        ? 'bg-brand-green text-black'
                        : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300'
                    }`}
                  >
                    -175cm
                  </button>
                </div>
              </FilterSection>
              <FilterSection title={`Métricas ${selectedMetrics.length > 0 ? `(${selectedMetrics.length})` : ''}`} defaultOpen={false}>
                <p className="text-2xs text-apple-gray-500 mb-2">Agregar columnas a la tabla</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin pr-1">
                  {SELECTABLE_METRICS.map(m => (
                    <label key={m.key} className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={selectedMetrics.includes(m.key)}
                        onChange={() => toggleMetric(m.key)}
                        className="w-3.5 h-3.5 rounded border-apple-gray-300 dark:border-apple-gray-600 text-brand-green focus:ring-brand-green"
                      />
                      <span className="text-xs text-apple-gray-700 dark:text-apple-gray-300 group-hover:text-white transition-colors">{m.label}</span>
                    </label>
                  ))}
                </div>
                {selectedMetrics.length > 0 && (
                  <button onClick={() => setSelectedMetrics([])} className="mt-2 text-xs text-brand-green hover:underline">
                    Limpiar métricas
                  </button>
                )}
              </FilterSection>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {filtered.length === 0 ? (
            <EmptyState
              title="Sin resultados"
              description="No se encontraron jugadores con los filtros aplicados"
            />
          ) : (
            <div className="card-apple overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-apple-gray-200/50 dark:border-apple-gray-700/50 bg-apple-gray-50/80 dark:bg-apple-gray-800/50">
                      <th className="px-4 py-3 text-left text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">
                        Jugador
                      </th>
                      <th className="px-3 py-3 text-left text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">
                        Club / Liga
                      </th>
                      <th className="px-3 py-3 text-left text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">
                        Posicion
                      </th>
                      <th
                        className="px-3 py-3 text-left text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider cursor-pointer hover:text-brand-green transition-colors select-none"
                        onClick={handleSortScore}
                      >
                        <span className="flex items-center gap-1">
                          Score
                          <span className="inline-flex flex-col">
                            <svg className={`w-2.5 h-2.5 -mb-0.5 ${sortByScore === 'asc' ? 'text-brand-green' : 'text-apple-gray-400'}`} fill="currentColor" viewBox="0 0 20 20">
                              <path d="M5 12l5-5 5 5H5z" />
                            </svg>
                            <svg className={`w-2.5 h-2.5 -mt-0.5 ${sortByScore === 'desc' ? 'text-brand-green' : 'text-apple-gray-400'}`} fill="currentColor" viewBox="0 0 20 20">
                              <path d="M5 8l5 5 5-5H5z" />
                            </svg>
                          </span>
                        </span>
                      </th>
                      <th className="px-3 py-3 text-left text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">
                        Actualizado
                      </th>
                      <th
                        className="px-3 py-3 text-left text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider cursor-pointer hover:text-brand-green transition-colors select-none"
                        onClick={handleSortOpportunity}
                      >
                        <span className="flex items-center gap-1">
                          Oportunidad
                          <span className="inline-flex flex-col">
                            <svg className={`w-2.5 h-2.5 -mb-0.5 ${sortByOpportunity === 'asc' ? 'text-brand-green' : 'text-apple-gray-400'}`} fill="currentColor" viewBox="0 0 20 20">
                              <path d="M5 12l5-5 5 5H5z" />
                            </svg>
                            <svg className={`w-2.5 h-2.5 -mt-0.5 ${sortByOpportunity === 'desc' ? 'text-brand-green' : 'text-apple-gray-400'}`} fill="currentColor" viewBox="0 0 20 20">
                              <path d="M5 8l5 5 5-5H5z" />
                            </svg>
                          </span>
                        </span>
                      </th>
                      <th className="px-3 py-3 text-left text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">
                        vs Doble G
                      </th>
                      <th className="px-3 py-3 text-left text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">
                        Estado
                      </th>
                      <th className="px-3 py-3 text-left text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">
                        TM
                      </th>
                      {selectedMetrics.map(key => {
                        const metricInfo = SELECTABLE_METRICS.find(m => m.key === key)
                        const isActive = sortByMetric?.key === key
                        return (
                          <th
                            key={key}
                            onClick={() => handleSortMetric(key)}
                            className="px-3 py-3 text-center text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider bg-brand-green/5 dark:bg-brand-green/10 whitespace-nowrap cursor-pointer hover:text-brand-green transition-colors select-none"
                            title={metricInfo?.label}
                          >
                            <span className="flex items-center justify-center gap-1">
                              {metricInfo?.short || key.slice(0, 6)}
                              <span className="inline-flex flex-col">
                                <svg className={`w-2.5 h-2.5 -mb-0.5 ${isActive && sortByMetric?.direction === 'asc' ? 'text-brand-green' : 'text-apple-gray-400'}`} fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M5 12l5-5 5 5H5z" />
                                </svg>
                                <svg className={`w-2.5 h-2.5 -mt-0.5 ${isActive && sortByMetric?.direction === 'desc' ? 'text-brand-green' : 'text-apple-gray-400'}`} fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M5 8l5 5 5-5H5z" />
                                </svg>
                              </span>
                            </span>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-apple-gray-100 dark:divide-apple-gray-800/50">
                    {filtered.map((player, idx) => {
                      const hasData = player.hasEnoughData !== false
                      const hasExternalData = !!(player.metricsPlayer || player.externalPlayer)
                      const playerImage = player.metricsPlayer?.Imagen || player.externalPlayer?.Imagen
                      const displayName = player['Nombre jugador'] || player.Jugador
                      const initials = displayName.split(' ').map(w => w[0]).slice(0, 2).join('')
                      const statusRecord = getPlayerStatus(player.Jugador)
                      const playerStatus = statusRecord?.status || 'en_seguimiento'

                      return (
                        <tr
                          key={idx}
                          onClick={() => handleRowClick(player)}
                          className={`hover:bg-brand-green/5 dark:hover:bg-brand-green/10 transition-colors duration-150 ${
                            hasExternalData ? 'cursor-pointer group' : ''
                          } ${playerStatus === 'descartado' ? 'opacity-50' : ''}`}
                        >
                          {/* Player info */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              {playerImage ? (
                                <img
                                  src={playerImage}
                                  alt={displayName}
                                  className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
                                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                                />
                              ) : (
                                <div className="w-9 h-9 bg-apple-gray-100 dark:bg-apple-gray-700 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-brand-green/10 transition-colors">
                                  <span className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 group-hover:text-brand-green transition-colors">
                                    {initials}
                                  </span>
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className={`font-medium text-apple-gray-800 dark:text-white truncate ${hasExternalData ? 'group-hover:text-brand-green transition-colors' : ''}`}>
                                    {displayName}
                                  </p>
                                  <AlertBadges player={player} />
                                </div>
                                <div className="flex items-center gap-2 text-xs text-apple-gray-500">
                                  <span>{player.Nacionalidad}</span>
                                  <span>|</span>
                                  <span>{player.Edad} años</span>
                                  {player.marketValueFormatted && (
                                    <>
                                      <span>|</span>
                                      <span className="text-brand-green font-medium">{player.marketValueFormatted}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Club / Liga */}
                          <td className="px-3 py-3">
                            <div className="text-xs">
                              <p className="text-apple-gray-700 dark:text-apple-gray-300 font-medium truncate max-w-[140px]">{player.Club || '—'}</p>
                              <p className="text-apple-gray-500 truncate max-w-[140px]">{player.Liga || '—'}</p>
                            </div>
                          </td>

                          {/* Position */}
                          <td className="px-3 py-3">
                            <span className="inline-flex px-2 py-0.5 bg-apple-gray-100 dark:bg-apple-gray-700 rounded text-xs text-apple-gray-600 dark:text-apple-gray-300">
                              {player['Posición'] || '—'}
                            </span>
                          </td>

                          {/* Score */}
                          <td className="px-3 py-3">
                            {hasData && player.ggScore !== undefined && player.ggScore !== null ? (
                              <ScoreBar
                                score={player.ggScore}
                                size="sm"
                                posAvg={positionAverages[FILTER_POSITION_MAP[player['Posición']] ?? ''] ?? null}
                              />
                            ) : (
                              <LowDataWarning />
                            )}
                          </td>

                          {/* Status changed by - only show for non-default statuses */}
                          <td className="px-3 py-3">
                            {statusRecord?.changed_by_name && playerStatus !== 'en_seguimiento' ? (
                              <div className="text-xs">
                                <span className="text-apple-gray-500">por </span>
                                <span className="font-medium text-apple-gray-700 dark:text-apple-gray-300">
                                  {statusRecord.changed_by_name}
                                </span>
                                <p className="text-2xs text-apple-gray-400">
                                  {new Date(statusRecord.changed_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                                </p>
                              </div>
                            ) : (
                              <span className="text-2xs text-apple-gray-400">—</span>
                            )}
                          </td>

                          {/* Opportunity */}
                          <td className="px-3 py-3">
                            {hasData ? (
                              <OpportunityBadge score={player.opportunityScore} />
                            ) : (
                              <span className="text-2xs text-apple-gray-400">—</span>
                            )}
                          </td>

                          {/* vs Internal */}
                          <td className="px-3 py-3">
                            {hasData ? (
                              <ComparisonBadge scoreDiff={player.scoreDiff} avgScore={player.avgInternalScore} />
                            ) : (
                              <span className="text-2xs text-apple-gray-400">—</span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                            <StatusBadge
                              statusRecord={statusRecord}
                              playerId={player.Jugador}
                              onStatusChange={setPlayerStatus}
                              requiresAuth={requiresAuth}
                              onAuthRequired={() => setShowAuthModal(true)}
                              onStatusChanged={() => setStatusFilter('')}
                            />
                          </td>

                          {/* Links */}
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              {/* Transfermarkt */}
                              {(player.Transfermkt || player['Ficha técnica']) && (
                                <a
                                  href={player.Transfermkt || player['Ficha técnica']}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="p-1.5 rounded-md bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-400 hover:text-brand-green hover:bg-brand-green/10 transition-colors"
                                  title="Transfermarkt"
                                >
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                                  </svg>
                                </a>
                              )}
                              {/* Wyscout Video - prepared for future */}
                              {player.WyscoutVideo && (
                                <a
                                  href={player.WyscoutVideo}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="p-1.5 rounded-md bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                                  title="Wyscout Video"
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                </a>
                              )}
                            </div>
                          </td>

                          {/* Dynamic metric columns */}
                          {selectedMetrics.map(key => {
                            const value = player.metricsPlayer?.[key]
                            const formatted = value !== null && value !== undefined && value !== ''
                              ? typeof value === 'number'
                                ? value.toFixed(value >= 10 ? 1 : 2)
                                : String(value)
                              : '—'
                            return (
                              <td key={key} className="px-3 py-3 text-center bg-brand-green/5 dark:bg-brand-green/5">
                                <span className="text-xs font-medium text-apple-gray-700 dark:text-apple-gray-300 tabular-nums">
                                  {formatted}
                                </span>
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
        </div>
      </div>

      {/* Auth Modal */}
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  )
}
