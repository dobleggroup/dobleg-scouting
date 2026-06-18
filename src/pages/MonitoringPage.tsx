import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { fuzzyMatch } from '@/lib/search'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import MobileFilterPanel from '@/components/filters/MobileFilterPanel'
import AuthModal from '@/components/auth/AuthModal'
import { getScoreColorClass, getScoreBgClass } from '@/components/ui/ScoreBar'
import { PlayerPhoto } from '@/components/ui/PlayerPhoto'
import AddPlayerModal from '@/components/tracking/AddPlayerModal'
import LinkPlayerModal from '@/components/tracking/LinkPlayerModal'
import FichaManualModal from '@/components/tracking/FichaManualModal'
import {
  fetchScoutPlayersWithScores,
  fetchScoutPlayerStatuses,
  setScoutPlayerStatus,
  removeScoutPlayerFromList,
  type ScoutPlayerWithScore,
} from '@/services/scoutPlayersService'
import type { TrackingStatus, ScoutPlayerStatusRecord, ScoutPlayer } from '@/types'
import { TRACKING_STATUS_CONFIG } from '@/hooks/useMonitoringStatus'
import { displayPosition } from '@/types/scoring'

const ADMIN_EMAIL = 'marcoscucho99@gmail.com'

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
}: {
  statusRecord: ScoutPlayerStatusRecord | null
  playerId: string
  onStatusChange: (id: string, status: TrackingStatus) => Promise<boolean>
  requiresAuth: boolean
  onAuthRequired: () => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const status: TrackingStatus = (statusRecord?.status as TrackingStatus) || 'en_seguimiento'
  const config = TRACKING_STATUS_CONFIG[status]

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const dropdownH = 170
      const spaceBelow = window.innerHeight - rect.bottom
      const top = spaceBelow >= dropdownH ? rect.bottom + 4 : rect.top - dropdownH - 4
      const left = Math.min(rect.right - 180, window.innerWidth - 188)
      setDropdownStyle({ top, left })
    }
    setIsOpen(o => !o)
  }

  const handleChange = async (newStatus: TrackingStatus) => {
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
    await onStatusChange(playerId, newStatus)
    setIsUpdating(false)
    setIsOpen(false)
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={handleOpen}
        disabled={isUpdating}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${config.bgColor} ${config.color} hover:opacity-80 whitespace-nowrap disabled:opacity-50 flex items-center gap-1`}
      >
        {config.label}
        <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {statusRecord?.changed_by_name && status !== 'en_seguimiento' && (
        <p className="text-2xs text-apple-gray-400 mt-0.5 truncate max-w-[140px]">
          por {statusRecord.changed_by_name}
        </p>
      )}

      {isOpen && (
        <>
          <div className="fixed inset-0 z-[300]" onClick={() => setIsOpen(false)} />
          <div
            className="fixed z-[301] bg-white dark:bg-apple-gray-800 rounded-xl shadow-2xl border border-apple-gray-200 dark:border-apple-gray-700 py-1.5 min-w-[180px] overflow-hidden"
            style={{ top: dropdownStyle.top, left: dropdownStyle.left }}
          >
            {requiresAuth && (
              <p className="px-4 py-2 text-xs text-apple-gray-500 border-b border-apple-gray-100 dark:border-apple-gray-700">
                Iniciá sesión para cambiar
              </p>
            )}
            {(Object.entries(TRACKING_STATUS_CONFIG) as [TrackingStatus, typeof config][]).map(([key, cfg]) => (
              <button
                key={key}
                onClick={(e) => { e.stopPropagation(); handleChange(key) }}
                className={`w-full px-4 py-2.5 text-left text-xs font-medium hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/60 transition-colors flex items-center gap-2 ${cfg.color} ${key === status ? 'bg-apple-gray-50 dark:bg-apple-gray-700/40 font-semibold' : ''}`}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${{ en_seguimiento: 'bg-blue-500', contactado: 'bg-amber-500', en_negociacion: 'bg-purple-500', descartado: 'bg-gray-400' }[key]}`} />
                {cfg.label}
                {key === status && (
                  <svg className="w-3.5 h-3.5 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function MonitoringPage() {
  const navigate = useNavigate()
  const { user, userDisplayName } = useAuth()

  const [players, setPlayers] = useState<ScoutPlayerWithScore[]>([])
  const [statuses, setStatuses] = useState<Record<string, ScoutPlayerStatusRecord>>({})
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<TrackingStatus | 'todos'>('todos')
  const [positionFilter, setPositionFilter] = useState('')
  const [sortByScore, setSortByScore] = useState<'asc' | 'desc' | null>('desc')

  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [linkingPlayer, setLinkingPlayer] = useState<ScoutPlayer | null>(null)
  const [fichaPlayer, setFichaPlayer] = useState<ScoutPlayer | null>(null)

  const isAdmin = user?.email === ADMIN_EMAIL

  // ─── Data loading ─────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true)
    const [playersData, statusData] = await Promise.all([
      fetchScoutPlayersWithScores('datos'),
      fetchScoutPlayerStatuses('datos'),
    ])
    setPlayers(playersData)
    setStatuses(statusData)
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ─── Derived data ─────────────────────────────────────────────────────────

  const positions = useMemo(() => {
    const set = new Set<string>()
    players.forEach(p => {
      if (p.posicion) set.add(p.posicion)
      if (p.gg_position) set.add(p.gg_position)
    })
    return [...set].sort()
  }, [players])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { todos: players.length }
    for (const p of players) {
      const s = (statuses[p.id]?.status as TrackingStatus) || 'en_seguimiento'
      counts[s] = (counts[s] || 0) + 1
    }
    return counts
  }, [players, statuses])

  const filteredPlayers = useMemo(() => {
    let result = [...players]

    if (statusFilter !== 'todos') {
      result = result.filter(p => {
        const s = (statuses[p.id]?.status as TrackingStatus) || 'en_seguimiento'
        return s === statusFilter
      })
    }

    if (positionFilter) {
      result = result.filter(p => p.posicion === positionFilter || p.gg_position === positionFilter)
    }

    if (searchQuery) {
      result = result.filter(p => fuzzyMatch(searchQuery, p.full_name) || fuzzyMatch(searchQuery, p.club || ''))
    }

    if (sortByScore) {
      result = [...result].sort((a, b) => {
        const sa = a.gg_score ?? -1
        const sb = b.gg_score ?? -1
        return sortByScore === 'desc' ? sb - sa : sa - sb
      })
    }

    return result
  }, [players, statuses, statusFilter, positionFilter, searchQuery, sortByScore])

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleStatusChange = useCallback(async (playerId: string, newStatus: TrackingStatus): Promise<boolean> => {
    if (!user) return false
    const name = userDisplayName || user.email?.split('@')[0] || 'Scout'
    const result = await setScoutPlayerStatus(playerId, 'datos', newStatus, user.id, name)
    if (result) {
      setStatuses(prev => ({ ...prev, [playerId]: result }))
      return true
    }
    return false
  }, [user, userDisplayName])

  const handlePlayerClick = useCallback((player: ScoutPlayerWithScore) => {
    if (player.supabase_player_id) {
      navigate(`/jugador/${encodeURIComponent(player.full_name)}?source=externo&apiId=${player.supabase_player_id}`)
    } else if (player.player_db_id) {
      navigate(`/jugador/${encodeURIComponent(player.player_db_id)}?source=${player.player_db_source || 'externo'}`)
    } else {
      setFichaPlayer(player)
    }
  }, [navigate])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('¿Querés quitar este jugador de la lista de Datos?')) return
    await removeScoutPlayerFromList(id, 'datos')
    setPlayers(prev => prev.filter(p => p.id !== id))
  }, [])

  const handleSortScore = () => {
    setSortByScore(prev => prev === 'desc' ? 'asc' : prev === 'asc' ? null : 'desc')
  }

  const activeFilters = (positionFilter ? 1 : 0) + (statusFilter !== 'todos' ? 1 : 0)
  const resetFilters = () => {
    setPositionFilter('')
    setStatusFilter('todos')
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) return <LoadingSpinner fullScreen message="Cargando jugadores en seguimiento..." />

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-apple-gray-800 dark:text-white tracking-tight">
            Seguimiento de Datos
          </h1>
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
            {filteredPlayers.length.toLocaleString('es')} de {players.length.toLocaleString('es')} jugadores en seguimiento
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-brand-green text-white rounded-xl font-semibold text-sm hover:bg-emerald-600 active:scale-95 transition-all shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden sm:inline">Agregar Jugador</span>
          </button>
        </div>
      </div>

      {/* Status summary pills */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <button
          onClick={() => setStatusFilter('todos')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            statusFilter === 'todos'
              ? 'bg-apple-gray-800 dark:bg-white text-white dark:text-apple-gray-900 ring-2 ring-offset-1 ring-apple-gray-700 dark:ring-offset-apple-gray-900'
              : 'bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-400 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700'
          }`}
        >
          Todos ({statusCounts.todos})
        </button>
        {(Object.entries(TRACKING_STATUS_CONFIG) as [TrackingStatus, typeof TRACKING_STATUS_CONFIG.en_seguimiento][]).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => setStatusFilter(statusFilter === key ? 'todos' : key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              statusFilter === key
                ? `${cfg.bgColor} ${cfg.color} ring-2 ring-offset-1 ring-current dark:ring-offset-apple-gray-900`
                : 'bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-400 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700'
            }`}
          >
            {cfg.label} ({statusCounts[key] ?? 0})
          </button>
        ))}
      </div>

      {/* Search bar */}
      <div className="mb-6 flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar por nombre o club..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="input-apple pl-9 pr-4 w-full"
          />
        </div>
        {/* Mobile filter button */}
        <button
          onClick={() => setShowMobileFilters(true)}
          className="lg:hidden flex items-center gap-2 px-3.5 py-2 bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 rounded-xl text-sm font-medium text-apple-gray-700 dark:text-apple-gray-300 shadow-sm flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Filtros
          {activeFilters > 0 && (
            <span className="w-5 h-5 flex items-center justify-center bg-brand-green text-black text-xs font-bold rounded-full">{activeFilters}</span>
          )}
        </button>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <aside className="w-56 flex-shrink-0 hidden lg:block">
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
              <FilterSection title="Posición">
                <div className="space-y-2 max-h-56 overflow-y-auto scrollbar-thin pr-1">
                  {positions.map(pos => (
                    <label key={pos} className="flex items-center gap-2.5 cursor-pointer group">
                      <input
                        type="radio"
                        name="position"
                        checked={positionFilter === pos}
                        onChange={() => setPositionFilter(positionFilter === pos ? '' : pos)}
                        className="w-4 h-4 rounded-full border-apple-gray-300 dark:border-apple-gray-600 text-brand-green focus:ring-brand-green"
                      />
                      <span className="text-sm text-apple-gray-700 dark:text-apple-gray-300 group-hover:text-apple-gray-900 dark:group-hover:text-white transition-colors">{displayPosition(pos)}</span>
                    </label>
                  ))}
                </div>
              </FilterSection>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {filteredPlayers.length === 0 ? (
            <EmptyState
              title="Sin resultados"
              description={players.length === 0 ? 'No hay jugadores en la lista de Datos aún' : 'No se encontraron jugadores con los filtros aplicados'}
            />
          ) : (
            <>
              {/* Mobile cards (lg:hidden) */}
              <div className="lg:hidden space-y-2 pb-24">
                {filteredPlayers.map(player => {
                  const statusRecord = statuses[player.id] ?? null
                  const playerStatus = (statusRecord?.status as TrackingStatus) || 'en_seguimiento'
                  const statusCfg = TRACKING_STATUS_CONFIG[playerStatus]
                  return (
                    <div
                      key={player.id}
                      onClick={() => handlePlayerClick(player)}
                      className={`bg-white dark:bg-apple-gray-800 rounded-2xl border border-apple-gray-200 dark:border-apple-gray-700 p-3 cursor-pointer active:scale-[0.99] transition-all ${playerStatus === 'descartado' ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        <PlayerPhoto src={player.player_photo} name={player.full_name} size="sm" rounded="xl" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <p className="font-semibold text-sm text-apple-gray-800 dark:text-white truncate">{player.full_name}</p>
                            <span className={`flex-shrink-0 text-2xs font-semibold px-2 py-0.5 rounded-lg ${statusCfg.bgColor} ${statusCfg.color}`}>
                              {statusCfg.label}
                            </span>
                          </div>
                          <p className="text-xs text-apple-gray-500 truncate mb-1.5">
                            {[player.team_name, displayPosition(player.posicion || player.gg_position) || null, player.edad ? `${player.edad}a` : null].filter(Boolean).join(' · ') || '—'}
                          </p>
                          <div className="flex items-center gap-2">
                            {player.gg_score !== null && player.gg_score !== undefined ? (
                              <span className={`inline-block px-2.5 py-1 rounded-lg text-sm font-bold tabular-nums ${getScoreColorClass(player.gg_score, '10')} ${getScoreBgClass(player.gg_score, '10')}`}>
                                {player.gg_score.toFixed(1)}
                              </span>
                            ) : (
                              <span className="text-2xs text-apple-gray-400">Sin datos suficientes</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2.5 flex items-center justify-between" onClick={e => e.stopPropagation()}>
                        <StatusBadge
                          statusRecord={statusRecord}
                          playerId={player.id}
                          onStatusChange={handleStatusChange}
                          requiresAuth={!user}
                          onAuthRequired={() => setShowAuthModal(true)}
                        />
                        <div className="flex items-center gap-2">
                          {player.transfermarkt_url && (
                            <a href={player.transfermarkt_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                              className="p-1.5 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500 hover:text-brand-green transition-colors">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                            </a>
                          )}
                          {user && (
                            <button onClick={e => { e.stopPropagation(); handleDelete(player.id) }} className="p-1.5 text-apple-gray-400 hover:text-red-500 transition-colors">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Desktop table (hidden on mobile) */}
              <div className="hidden lg:block card-apple overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-apple-gray-200/50 dark:border-apple-gray-700/50 bg-apple-gray-50/80 dark:bg-apple-gray-800/50">
                        <th className="px-4 py-3 text-left text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">
                          Jugador
                        </th>
                        <th className="px-3 py-3 text-left text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">
                          Club
                        </th>
                        <th className="px-3 py-3 text-left text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">
                          Posición
                        </th>
                        <th className="px-3 py-3 text-left text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">
                          Edad
                        </th>
                        <th
                          className="px-3 py-3 text-left text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider cursor-pointer hover:text-brand-green transition-colors select-none"
                          onClick={handleSortScore}
                        >
                          <span className="flex items-center gap-1">
                            Score GG
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
                          Estado
                        </th>
                        <th className="px-3 py-3 text-left text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">
                          Actualizado por
                        </th>
                        <th className="px-3 py-3 text-left text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">
                          Agregado por
                        </th>
                        <th className="px-3 py-3 text-left text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider w-10">
                          Links
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-apple-gray-100 dark:divide-apple-gray-800/50">
                      {filteredPlayers.map(player => {
                        const statusRecord = statuses[player.id] ?? null
                        const playerStatus = (statusRecord?.status as TrackingStatus) || 'en_seguimiento'
                        const initials = player.full_name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()

                        return (
                          <tr
                            key={player.id}
                            onClick={() => handlePlayerClick(player)}
                            className={`hover:bg-brand-green/5 dark:hover:bg-brand-green/10 transition-colors duration-150 cursor-pointer group ${playerStatus === 'descartado' ? 'opacity-50' : ''}`}
                          >
                            {/* Player info */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                {player.player_photo ? (
                                  <img
                                    src={player.player_photo}
                                    alt={player.full_name}
                                    className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
                                    onError={e => { e.currentTarget.style.display = 'none' }}
                                  />
                                ) : (
                                  <div className="w-9 h-9 bg-apple-gray-100 dark:bg-apple-gray-700 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-brand-green/10 transition-colors">
                                    <span className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 group-hover:text-brand-green transition-colors">{initials}</span>
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <p className="font-medium text-apple-gray-800 dark:text-white truncate group-hover:text-brand-green transition-colors">
                                      {player.full_name}
                                    </p>
                                    {!player.player_db_id && !player.supabase_player_id && (
                                      <span title="Sin ficha vinculada" className="flex-shrink-0 text-apple-gray-300 dark:text-apple-gray-600">
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728M5.636 5.636a9 9 0 000 12.728M9 10h.01M15 10h.01M9.172 14.172a4 4 0 015.656 0" />
                                        </svg>
                                      </span>
                                    )}
                                    {isAdmin && (
                                      <button
                                        onClick={e => { e.stopPropagation(); setLinkingPlayer(player) }}
                                        title={player.player_db_id ? 'Cambiar vínculo' : 'Vincular a base de datos'}
                                        className={`flex-shrink-0 p-0.5 rounded transition-colors opacity-0 group-hover:opacity-100 ${player.player_db_id ? 'text-brand-green hover:bg-brand-green/10' : 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'}`}
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                        </svg>
                                      </button>
                                    )}
                                  </div>
                                  {player.nacionalidad && (
                                    <p className="text-xs text-apple-gray-500 truncate">{player.nacionalidad}</p>
                                  )}
                                </div>
                                {user && (
                                  <button
                                    onClick={e => { e.stopPropagation(); handleDelete(player.id) }}
                                    className="opacity-0 group-hover:opacity-100 p-1 text-apple-gray-300 hover:text-red-500 transition-all flex-shrink-0"
                                    title="Quitar de la lista"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </td>

                            {/* Club */}
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-1.5">
                                {player.team_logo && (
                                  <img src={player.team_logo} alt="" className="w-5 h-5 object-contain flex-shrink-0" onError={e => { e.currentTarget.style.display = 'none' }} />
                                )}
                                <span className="text-xs text-apple-gray-700 dark:text-apple-gray-300 truncate max-w-[120px]">
                                  {player.team_name || player.club || '—'}
                                </span>
                              </div>
                            </td>

                            {/* Position */}
                            <td className="px-3 py-3">
                              <span className="inline-flex px-2 py-0.5 bg-apple-gray-100 dark:bg-apple-gray-700 rounded text-xs text-apple-gray-600 dark:text-apple-gray-300">
                                {displayPosition(player.gg_position || player.posicion) || '—'}
                              </span>
                            </td>

                            {/* Age */}
                            <td className="px-3 py-3">
                              <span className="text-xs text-apple-gray-600 dark:text-apple-gray-400">
                                {player.edad ? `${player.edad}a` : '—'}
                              </span>
                            </td>

                            {/* Score GG */}
                            <td className="px-3 py-3">
                              {player.gg_score !== null && player.gg_score !== undefined ? (
                                <div className="flex flex-col gap-0.5">
                                  <span className={`inline-block px-2.5 py-1 rounded-lg text-sm font-bold tabular-nums ${getScoreColorClass(player.gg_score, '10')} ${getScoreBgClass(player.gg_score, '10')}`}>
                                    {player.gg_score.toFixed(1)}
                                  </span>
                                  {player.gg_matches !== null && player.gg_matches !== undefined && (
                                    <span className="text-2xs text-apple-gray-400">{player.gg_matches} PJ</span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-apple-gray-400 text-xs">—</span>
                              )}
                            </td>

                            {/* Status badge */}
                            <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                              <StatusBadge
                                statusRecord={statusRecord}
                                playerId={player.id}
                                onStatusChange={handleStatusChange}
                                requiresAuth={!user}
                                onAuthRequired={() => setShowAuthModal(true)}
                              />
                            </td>

                            {/* Updated by */}
                            <td className="px-3 py-3">
                              {statusRecord?.changed_by_name && playerStatus !== 'en_seguimiento' ? (
                                <div className="text-xs">
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

                            {/* Added by */}
                            <td className="px-3 py-3">
                              {player.added_by_datos_name ? (
                                <span className="text-xs text-apple-gray-500">por {player.added_by_datos_name}</span>
                              ) : (
                                <span className="text-2xs text-apple-gray-400">—</span>
                              )}
                            </td>

                            {/* Links */}
                            <td className="px-3 py-3">
                              {player.transfermarkt_url && (
                                <a
                                  href={player.transfermarkt_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="p-1.5 rounded-md bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-400 hover:text-brand-green hover:bg-brand-green/10 transition-colors inline-flex"
                                  title="Transfermarkt"
                                >
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                                  </svg>
                                </a>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Auth Modal */}
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />

      {/* Add Player Modal */}
      <AddPlayerModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        defaultList="datos"
        onSuccess={loadData}
      />

      {/* Link Player Modal (admin only) */}
      {linkingPlayer && (
        <LinkPlayerModal
          player={linkingPlayer}
          onClose={() => setLinkingPlayer(null)}
          onLinked={updated => {
            setPlayers(prev => prev.map(p =>
              p.id === updated.id
                ? { ...p, player_db_id: updated.player_db_id, player_db_source: updated.player_db_source }
                : p
            ))
          }}
        />
      )}

      {/* Ficha manual — for players not linked to DB */}
      {fichaPlayer && (
        <FichaManualModal
          player={fichaPlayer}
          onClose={() => setFichaPlayer(null)}
          onLinked={updated => {
            setPlayers(prev => prev.map(p =>
              p.id === updated.id
                ? { ...p, player_db_id: updated.player_db_id, player_db_source: updated.player_db_source }
                : p
            ))
            setFichaPlayer(null)
          }}
        />
      )}

      {/* Mobile filter panel */}
      <MobileFilterPanel
        isOpen={showMobileFilters}
        onClose={() => setShowMobileFilters(false)}
        activeCount={activeFilters}
      >
        <div className="divide-y divide-apple-gray-200/50 dark:divide-apple-gray-800/50">
          {activeFilters > 0 && (
            <button onClick={() => { resetFilters(); setShowMobileFilters(false) }}
              className="w-full mb-3 py-2 text-sm font-semibold text-red-500 hover:text-red-600 transition-colors text-center">
              Limpiar todos los filtros
            </button>
          )}
          <FilterSection title="Posición">
            <div className="space-y-2 max-h-56 overflow-y-auto scrollbar-thin pr-1">
              {positions.map(pos => (
                <label key={pos} className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="position-mobile"
                    checked={positionFilter === pos}
                    onChange={() => setPositionFilter(positionFilter === pos ? '' : pos)}
                    className="w-4 h-4 rounded-full border-apple-gray-300 dark:border-apple-gray-600 text-brand-green focus:ring-brand-green"
                  />
                  <span className="text-sm text-apple-gray-700 dark:text-apple-gray-300">{displayPosition(pos)}</span>
                </label>
              ))}
            </div>
          </FilterSection>
        </div>
      </MobileFilterPanel>
    </div>
  )
}
