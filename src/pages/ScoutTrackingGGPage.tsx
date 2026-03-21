import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import {
  fetchScoutPlayers,
  fetchScoutPlayerStatuses,
  fetchScoutScores,
  setScoutPlayerStatus,
  removeScoutPlayerFromList,
  uploadScoutPlayerFile,
  removeScoutPlayerFile,
} from '@/services/scoutPlayersService'
import AddPlayerModal from '@/components/tracking/AddPlayerModal'
import type { ScoutPlayer, ScoutPlayerStatusRecord, ScoutsGGStatus } from '@/types'

// ─── STATUS CONFIG ────────────────────────────────────────────────────────────

export const GG_STATUS_CONFIG: Record<ScoutsGGStatus, { label: string; color: string; bg: string; dot: string }> = {
  en_seguimiento_gg: { label: 'En Seguimiento GG', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20', dot: 'bg-blue-500' },
  pre_seleccionado:  { label: 'Pre-seleccionado',  color: 'text-cyan-600 dark:text-cyan-400',  bg: 'bg-cyan-500/10 border-cyan-500/20',  dot: 'bg-cyan-500' },
  contactado:        { label: 'Contactado',         color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', dot: 'bg-amber-500' },
  reunion_pactada:   { label: 'Reunión Pactada',    color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20', dot: 'bg-orange-500' },
  en_negociacion:    { label: 'En Negociación',     color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20', dot: 'bg-purple-500' },
  oferta_enviada:    { label: 'Oferta Enviada',     color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20', dot: 'bg-indigo-500' },
  contratado:        { label: 'Contratado',          color: 'text-green-600 dark:text-green-400',  bg: 'bg-green-500/10 border-green-500/20',  dot: 'bg-green-500' },
  descartado:        { label: 'Descartado',          color: 'text-apple-gray-500',                 bg: 'bg-apple-gray-200/50 dark:bg-apple-gray-700/50 border-apple-gray-300/30 dark:border-apple-gray-600/30', dot: 'bg-apple-gray-400' },
  no_disponible:     { label: 'No Disponible',       color: 'text-red-500',                        bg: 'bg-red-500/10 border-red-500/20',      dot: 'bg-red-500' },
}

const PRIORITY_CONFIG = {
  alta:   { label: 'ALTA',   border: 'border-l-rose-500',   badge: 'bg-rose-500/10 text-rose-500 border-rose-500/20' },
  normal: { label: 'NORMAL', border: 'border-l-blue-500',   badge: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  baja:   { label: 'BAJA',   border: 'border-l-apple-gray-400', badge: 'bg-apple-gray-200 text-apple-gray-500 border-apple-gray-300 dark:bg-apple-gray-700 dark:text-apple-gray-400' },
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 30) return `hace ${days}d`
  if (days < 365) return `hace ${Math.floor(days / 30)}m`
  return `hace ${Math.floor(days / 365)}a`
}

// ─── STATUS BADGE (dropdown) ──────────────────────────────────────────────────

function StatusDropdown({
  playerId,
  currentStatus,
  currentRecord,
  onStatusChange,
  requiresAuth,
}: {
  playerId: string
  currentStatus: ScoutsGGStatus
  currentRecord: ScoutPlayerStatusRecord | undefined
  onStatusChange: (id: string, status: ScoutsGGStatus) => Promise<void>
  requiresAuth: boolean
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const cfg = GG_STATUS_CONFIG[currentStatus]

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (requiresAuth) return
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      // 9 opciones × ~36px + padding ≈ 340px
      const dropdownH = 350
      const spaceBelow = window.innerHeight - rect.bottom
      const top = spaceBelow >= dropdownH ? rect.bottom + 4 : rect.top - dropdownH - 4
      const left = Math.min(rect.left, window.innerWidth - 212)
      setDropdownStyle({ top, left })
    }
    setOpen(o => !o)
  }

  const handleSelect = async (status: ScoutsGGStatus) => {
    if (status === currentStatus) { setOpen(false); return }
    setLoading(true)
    await onStatusChange(playerId, status)
    setLoading(false)
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={handleOpen}
        disabled={loading}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all hover:opacity-80 disabled:opacity-50 ${cfg.bg} ${cfg.color}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
        {cfg.label}
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {currentRecord?.changed_by_name && currentStatus !== 'en_seguimiento_gg' && (
        <p className="text-2xs text-apple-gray-400 mt-0.5">por {currentRecord.changed_by_name}</p>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-[300]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[301] bg-white dark:bg-apple-gray-800 rounded-xl shadow-2xl border border-apple-gray-200 dark:border-apple-gray-700 py-1 min-w-[200px] overflow-hidden"
            style={{ top: dropdownStyle.top, left: dropdownStyle.left }}
          >
            {(Object.entries(GG_STATUS_CONFIG) as [ScoutsGGStatus, typeof cfg][]).map(([key, c]) => (
              <button
                key={key}
                onClick={() => handleSelect(key)}
                className={`w-full px-4 py-2.5 text-left text-xs font-medium hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700 transition-colors flex items-center gap-2 ${c.color} ${key === currentStatus ? 'bg-apple-gray-50 dark:bg-apple-gray-700 font-semibold' : ''}`}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.dot}`} />
                {c.label}
                {key === currentStatus && (
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

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function ScoutTrackingGGPage() {
  const { user, userDisplayName } = useAuth()
  const navigate = useNavigate()

  const [players, setPlayers] = useState<ScoutPlayer[]>([])
  const [statuses, setStatuses] = useState<Record<string, ScoutPlayerStatusRecord>>({})
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [fileUploadPlayerId, setFileUploadPlayerId] = useState<string | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [posFilter, setPosFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<ScoutsGGStatus | ''>('')
  const [priorityFilter, setPriorityFilter] = useState<'alta' | 'normal' | 'baja' | ''>('')
  const [scoutFilter, setScoutFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const requiresAuth = !user

  const load = useCallback(async () => {
    setLoading(true)
    const [playersData, statusesData] = await Promise.all([
      fetchScoutPlayers('scouts_gg'),
      fetchScoutPlayerStatuses('scouts_gg'),
    ])
    // Fetch scout evaluation scores and merge into player objects
    const scoresData = await fetchScoutScores(playersData)
    const enriched = playersData.map(p => ({
      ...p,
      scoutScore: scoresData[p.id]?.avgScore ?? null,
      scoutEvalCount: scoresData[p.id]?.count ?? 0,
    }))
    setPlayers(enriched)
    setStatuses(statusesData)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleStatusChange = useCallback(async (playerId: string, status: ScoutsGGStatus) => {
    if (!user) return
    const result = await setScoutPlayerStatus(playerId, 'scouts_gg', status, user.id, userDisplayName)
    if (result) {
      setStatuses(prev => ({ ...prev, [playerId]: result }))
    }
  }, [user, userDisplayName])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('¿Querés quitar este jugador de la lista Scouts GG?')) return
    await removeScoutPlayerFromList(id, 'scouts_gg')
    setPlayers(prev => prev.filter(p => p.id !== id))
  }, [])

  const handleFileUpload = useCallback(async (id: string, file: File) => {
    if (!user) return
    const result = await uploadScoutPlayerFile(id, file, userDisplayName)
    if (result.success) await load()
  }, [user, userDisplayName, load])

  const handleFileDelete = useCallback(async (id: string, name: string) => {
    await removeScoutPlayerFile(id, name)
    await load()
  }, [load])

  // Stats
  const stats = useMemo(() => {
    const counts: Record<string, number> = {}
    Object.keys(GG_STATUS_CONFIG).forEach(k => counts[k] = 0)
    players.forEach(p => {
      const s = (statuses[p.id]?.status as ScoutsGGStatus) || 'en_seguimiento_gg'
      counts[s] = (counts[s] || 0) + 1
    })
    return counts
  }, [players, statuses])

  // Unique scouts for filter
  const scouts = useMemo(() => {
    const set = new Set<string>()
    players.forEach(p => { if (p.added_by_scouts_name) set.add(p.added_by_scouts_name) })
    return [...set].sort()
  }, [players])

  // Unique positions for filter
  const positions = useMemo(() => {
    const set = new Set<string>()
    players.forEach(p => { if (p.posicion) set.add(p.posicion) })
    return [...set].sort()
  }, [players])

  // Filtered + sorted players
  const filtered = useMemo(() => {
    return players.filter(p => {
      if (search) {
        const s = search.toLowerCase()
        if (!p.full_name.toLowerCase().includes(s) &&
            !p.club?.toLowerCase().includes(s) &&
            !p.liga?.toLowerCase().includes(s)) return false
      }
      if (posFilter && p.posicion !== posFilter) return false
      if (priorityFilter && p.prioridad !== priorityFilter) return false
      if (scoutFilter && p.added_by_scouts_name !== scoutFilter) return false
      if (statusFilter) {
        const s = (statuses[p.id]?.status as ScoutsGGStatus) || 'en_seguimiento_gg'
        if (s !== statusFilter) return false
      }
      return true
    }).sort((a, b) => {
      // Sort: alta > normal > baja, then by date
      const pOrder = { alta: 0, normal: 1, baja: 2 }
      const diff = pOrder[a.prioridad] - pOrder[b.prioridad]
      if (diff !== 0) return diff
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [players, statuses, search, posFilter, statusFilter, priorityFilter, scoutFilter])

  const activeFilters = [search, posFilter, statusFilter, priorityFilter, scoutFilter].filter(Boolean).length

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-green to-emerald-600 flex items-center justify-center shadow-sm">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-apple-gray-900 dark:text-white tracking-tight">
              Seguimiento Scouts GG
            </h1>
          </div>
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">
            Lista de seguimiento del cuerpo de scouts · {filtered.length} de {players.length} jugadores
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-green text-white rounded-xl font-semibold text-sm hover:bg-emerald-600 active:scale-95 transition-all shadow-sm shadow-brand-green/20"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Agregar Jugador
        </button>
      </div>

      {/* Status pipeline */}
      <div className="flex flex-wrap gap-2 mb-5">
        {(Object.entries(GG_STATUS_CONFIG) as [ScoutsGGStatus, typeof GG_STATUS_CONFIG.en_seguimiento_gg][]).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => setStatusFilter(statusFilter === key ? '' : key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              statusFilter === key
                ? `${cfg.bg} ${cfg.color} ring-2 ring-offset-1 ring-current dark:ring-offset-apple-gray-900`
                : 'bg-white dark:bg-apple-gray-800 text-apple-gray-500 border-apple-gray-200 dark:border-apple-gray-700 hover:border-apple-gray-300'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
            <span className="font-bold opacity-70">{stats[key] || 0}</span>
          </button>
        ))}
      </div>

      {/* Search + filter bar */}
      <div className="flex gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar por nombre, club, liga..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm text-apple-gray-800 dark:text-white placeholder-apple-gray-400 focus:outline-none focus:border-brand-green focus:ring-2 focus:ring-brand-green/20 transition-all"
          />
        </div>

        <button
          onClick={() => setShowFilters(o => !o)}
          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium border transition-all ${
            showFilters || activeFilters > 0
              ? 'bg-brand-green/10 border-brand-green/30 text-brand-green'
              : 'bg-white dark:bg-apple-gray-800 border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Filtros
          {activeFilters > 0 && (
            <span className="w-5 h-5 rounded-full bg-brand-green text-white text-2xs font-bold flex items-center justify-center">{activeFilters}</span>
          )}
        </button>

        {activeFilters > 0 && (
          <button
            onClick={() => { setSearch(''); setPosFilter(''); setStatusFilter(''); setPriorityFilter(''); setScoutFilter('') }}
            className="px-3 py-2.5 rounded-xl text-sm text-apple-gray-500 hover:text-apple-gray-700 dark:hover:text-apple-gray-300 transition-colors"
          >
            Limpiar
          </button>
        )}
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="mb-5 p-4 bg-white dark:bg-apple-gray-800 rounded-2xl border border-apple-gray-200 dark:border-apple-gray-700 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-apple-gray-500 uppercase tracking-wider mb-1.5">Posición</label>
            <select value={posFilter} onChange={e => setPosFilter(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-700 border border-apple-gray-200 dark:border-apple-gray-600 text-sm text-apple-gray-800 dark:text-white focus:outline-none focus:border-brand-green transition-all">
              <option value="">Todas</option>
              {positions.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-apple-gray-500 uppercase tracking-wider mb-1.5">Prioridad</label>
            <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value as typeof priorityFilter)} className="w-full px-3 py-2 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-700 border border-apple-gray-200 dark:border-apple-gray-600 text-sm text-apple-gray-800 dark:text-white focus:outline-none focus:border-brand-green transition-all">
              <option value="">Todas</option>
              <option value="alta">Alta</option>
              <option value="normal">Normal</option>
              <option value="baja">Baja</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-apple-gray-500 uppercase tracking-wider mb-1.5">Scout</label>
            <select value={scoutFilter} onChange={e => setScoutFilter(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-700 border border-apple-gray-200 dark:border-apple-gray-600 text-sm text-apple-gray-800 dark:text-white focus:outline-none focus:border-brand-green transition-all">
              <option value="">Todos</option>
              {scouts.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="w-10 h-10 border-3 border-brand-green border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-apple-gray-500">Cargando jugadores...</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-apple-gray-100 dark:bg-apple-gray-800 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-apple-gray-700 dark:text-apple-gray-300 mb-1">
            {players.length === 0 ? 'La lista está vacía' : 'Sin resultados'}
          </h3>
          <p className="text-sm text-apple-gray-500 mb-4">
            {players.length === 0 ? 'Agregá el primer jugador al seguimiento de Scouts GG.' : 'Probá con otros filtros.'}
          </p>
          {players.length === 0 && (
            <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-brand-green text-white rounded-xl text-sm font-semibold hover:bg-emerald-600 transition-all">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
              Agregar primer jugador
            </button>
          )}
        </div>
      ) : (
        <>
          {/* ── Desktop table (hidden on mobile) ── */}
          <div className="hidden lg:block card-apple overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-apple-gray-200 dark:border-apple-gray-700">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wider">Jugador</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wider">Posición</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wider">Estado</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wider">Score Scouts</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wider">Agregado</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wider">Links</th>
                    {!requiresAuth && (
                      <th className="px-4 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wider">Acciones</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700/50">
                  {filtered.map(player => {
                    const statusRecord = statuses[player.id]
                    const currentStatus: ScoutsGGStatus = (statusRecord?.status as ScoutsGGStatus) || 'en_seguimiento_gg'
                    const initials = player.full_name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
                    const files = player.files ?? []
                    const priorBorder = player.prioridad === 'alta'
                      ? 'border-l-rose-500'
                      : player.prioridad === 'baja'
                        ? 'border-l-apple-gray-300 dark:border-l-apple-gray-600'
                        : 'border-l-blue-400'

                    return (
                      <>
                        <tr
                          key={player.id}
                          className={`border-l-4 ${priorBorder} hover:bg-brand-green/5 dark:hover:bg-brand-green/10 transition-colors cursor-pointer group`}
                          onClick={() => navigate(`/jugador/${encodeURIComponent(player.full_name)}?source=externo`)}
                        >
                          {/* Jugador */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-lg bg-apple-gray-200 dark:bg-apple-gray-700 flex items-center justify-center text-apple-gray-600 dark:text-apple-gray-300 font-bold text-xs flex-shrink-0">
                                {initials}
                              </div>
                              <div className="min-w-0">
                                <p
                                  className="font-semibold text-apple-gray-900 dark:text-white truncate hover:text-brand-green transition-colors"
                                  title={player.comentario || undefined}
                                  onClick={e => { e.stopPropagation(); navigate(`/jugador/${encodeURIComponent(player.full_name)}?source=externo`) }}
                                >
                                  {player.full_name}
                                </p>
                                <p className="text-xs text-apple-gray-500 truncate">
                                  {[player.club, player.liga, player.edad ? `${player.edad}a` : null].filter(Boolean).join(' · ')}
                                </p>
                              </div>
                              <button
                                onClick={e => { e.stopPropagation(); handleDelete(player.id) }}
                                className="ml-1 p-1 rounded-lg text-apple-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all opacity-0 group-hover:opacity-100 flex-shrink-0"
                                title="Quitar de lista"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </td>

                          {/* Posición */}
                          <td className="px-4 py-3">
                            {player.posicion ? (
                              <span className="px-2 py-0.5 rounded-md bg-apple-gray-100 dark:bg-apple-gray-700 text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 whitespace-nowrap">
                                {player.posicion}
                              </span>
                            ) : (
                              <span className="text-apple-gray-400">—</span>
                            )}
                          </td>

                          {/* Estado */}
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <StatusDropdown
                              playerId={player.id}
                              currentStatus={currentStatus}
                              currentRecord={statusRecord}
                              onStatusChange={handleStatusChange}
                              requiresAuth={requiresAuth}
                            />
                          </td>

                          {/* Score Scouts */}
                          <td className="px-4 py-3">
                            {player.scoutScore !== null && player.scoutScore !== undefined ? (
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-bold tabular-nums ${
                                  player.scoutScore >= 8 ? 'text-brand-green' :
                                  player.scoutScore >= 6 ? 'text-emerald-500' :
                                  player.scoutScore >= 4 ? 'text-amber-500' : 'text-red-500'
                                }`}>
                                  {player.scoutScore.toFixed(1)}
                                </span>
                                <div className="w-16 h-1.5 bg-apple-gray-200 dark:bg-apple-gray-700 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      player.scoutScore >= 8 ? 'bg-brand-green' :
                                      player.scoutScore >= 6 ? 'bg-emerald-500' :
                                      player.scoutScore >= 4 ? 'bg-amber-500' : 'bg-red-500'
                                    }`}
                                    style={{ width: `${(player.scoutScore / 10) * 100}%` }}
                                  />
                                </div>
                                <span className="text-2xs text-apple-gray-400 bg-apple-gray-100 dark:bg-apple-gray-700 px-1.5 py-0.5 rounded-md whitespace-nowrap">
                                  {player.scoutEvalCount} eval{player.scoutEvalCount !== 1 ? 's' : ''}
                                </span>
                              </div>
                            ) : (
                              <span className="text-apple-gray-400">—</span>
                            )}
                          </td>

                          {/* Agregado */}
                          <td className="px-4 py-3">
                            <p className="text-xs font-medium text-apple-gray-700 dark:text-apple-gray-300 whitespace-nowrap">
                              {player.added_by_scouts_name || 'Sistema'}
                            </p>
                            <p className="text-2xs text-apple-gray-400">{timeAgo(player.created_at)}</p>
                          </td>

                          {/* Links */}
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-1.5">
                              {player.transfermarkt_url && (
                                <a
                                  href={player.transfermarkt_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                                  title="Transfermarkt"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                </a>
                              )}
                              {player.video_url && (
                                <a
                                  href={player.video_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 rounded-lg text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
                                  title="Video"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                </a>
                              )}
                              {files.length > 0 && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500 text-2xs font-medium">
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                  </svg>
                                  {files.length}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Acciones */}
                          {!requiresAuth && (
                            <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                              <button
                                onClick={() => setFileUploadPlayerId(prev => prev === player.id ? null : player.id)}
                                className="p-1.5 rounded-lg text-apple-gray-400 hover:text-brand-green hover:bg-brand-green/10 transition-colors"
                                title="Subir archivo"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                </svg>
                              </button>
                            </td>
                          )}
                        </tr>

                        {/* File upload row */}
                        {fileUploadPlayerId === player.id && (
                          <tr key={`${player.id}-upload`} className="bg-apple-gray-50 dark:bg-apple-gray-800/50">
                            <td colSpan={requiresAuth ? 6 : 7} className="px-4 py-2">
                              <input
                                type="file"
                                accept=".xlsx,.xls,.csv"
                                onChange={async e => {
                                  const file = e.target.files?.[0]
                                  if (file) {
                                    await handleFileUpload(player.id, file)
                                    setFileUploadPlayerId(null)
                                  }
                                }}
                                className="w-full text-xs text-apple-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:bg-brand-green/10 file:text-brand-green file:text-xs file:font-medium cursor-pointer"
                              />
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Mobile cards (block lg:hidden) ── */}
          <div className="block lg:hidden space-y-3">
            {filtered.map(player => {
              const statusRecord = statuses[player.id]
              const currentStatus: ScoutsGGStatus = (statusRecord?.status as ScoutsGGStatus) || 'en_seguimiento_gg'
              const initials = player.full_name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
              const files = player.files ?? []
              const priorBorder = player.prioridad === 'alta'
                ? 'border-l-rose-500'
                : player.prioridad === 'baja'
                  ? 'border-l-apple-gray-300 dark:border-l-apple-gray-600'
                  : 'border-l-blue-400'

              return (
                <div
                  key={player.id}
                  className={`bg-white dark:bg-apple-gray-800 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 p-3 border-l-4 ${priorBorder}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-apple-gray-200 dark:bg-apple-gray-700 flex items-center justify-center text-apple-gray-600 dark:text-apple-gray-300 font-bold text-xs flex-shrink-0">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className="font-semibold text-sm truncate cursor-pointer hover:text-brand-green transition-colors"
                        onClick={() => navigate(`/jugador/${encodeURIComponent(player.full_name)}?source=externo`)}
                      >
                        {player.full_name}
                      </p>
                      <p className="text-xs text-apple-gray-500">
                        {[player.club, player.liga].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    {player.scoutScore !== null && player.scoutScore !== undefined && (
                      <span className={`text-sm font-bold tabular-nums flex-shrink-0 ${
                        player.scoutScore >= 8 ? 'text-brand-green' :
                        player.scoutScore >= 6 ? 'text-emerald-500' :
                        player.scoutScore >= 4 ? 'text-amber-500' : 'text-red-500'
                      }`}>
                        {player.scoutScore.toFixed(1)}
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <StatusDropdown
                      playerId={player.id}
                      currentStatus={currentStatus}
                      currentRecord={statusRecord}
                      onStatusChange={handleStatusChange}
                      requiresAuth={requiresAuth}
                    />
                    <div className="flex items-center gap-1.5">
                      {player.transfermarkt_url && (
                        <a href={player.transfermarkt_url} target="_blank" rel="noopener noreferrer"
                          className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" title="Transfermarkt">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      )}
                      {player.video_url && (
                        <a href={player.video_url} target="_blank" rel="noopener noreferrer"
                          className="p-1.5 rounded-lg text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors" title="Video">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </a>
                      )}
                      {files.length > 0 && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500 text-2xs font-medium">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                          </svg>
                          {files.length}
                        </span>
                      )}
                      {!requiresAuth && (
                        <button
                          onClick={() => setFileUploadPlayerId(prev => prev === player.id ? null : player.id)}
                          className="p-1.5 rounded-lg text-apple-gray-400 hover:text-brand-green hover:bg-brand-green/10 transition-colors"
                          title="Subir archivo"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {player.comentario && (
                    <p className="mt-2 text-xs text-apple-gray-500 italic line-clamp-2">"{player.comentario}"</p>
                  )}

                  {fileUploadPlayerId === player.id && (
                    <div className="mt-2">
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={async e => {
                          const file = e.target.files?.[0]
                          if (file) {
                            await handleFileUpload(player.id, file)
                            setFileUploadPlayerId(null)
                          }
                        }}
                        className="w-full text-xs text-apple-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:bg-brand-green/10 file:text-brand-green file:text-xs file:font-medium cursor-pointer"
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Add Player Modal */}
      <AddPlayerModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        defaultList="scouts_gg"
        onSuccess={load}
      />
    </div>
  )
}
