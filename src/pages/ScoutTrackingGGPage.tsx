import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useData } from '@/context/DataContext'
import {
  fetchScoutPlayersWithScores,
  fetchScoutPlayerStatuses,
  fetchScoutScores,
  setScoutPlayerStatus,
  setScoutPlayerAssignment,
  removeScoutPlayerFromList,
  uploadScoutPlayerFile,
  removeScoutPlayerFile,
  type ScoutPlayerWithScore,
} from '@/services/scoutPlayersService'
import AddPlayerModal from '@/components/tracking/AddPlayerModal'
import LinkPlayerModal from '@/components/tracking/LinkPlayerModal'
import LinkClubModal from '@/components/tracking/LinkClubModal'
import FichaManualModal from '@/components/tracking/FichaManualModal'
import { PlayerPhoto, TeamLogo } from '@/components/ui/PlayerPhoto'
import { isMarketLinkAdmin } from '@/services/marketService'
import type { ScoutPlayer, ScoutPlayerStatusRecord, TrackingStatus, EnrichedPlayer } from '@/types'
import { fuzzyMatch } from '@/lib/search'
import { useLanguage } from '@/context/LanguageContext'

// ─── STATUS CONFIG ────────────────────────────────────────────────────────────

const TRACKING_STATUS_CONFIG: Record<TrackingStatus, { labelKey: string; color: string; bg: string; dot: string }> = {
  en_seguimiento: { labelKey: 'seguimiento.estadoEnSeguimiento', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20', dot: 'bg-blue-500' },
  contactado:     { labelKey: 'seguimiento.estadoContactado',     color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', dot: 'bg-amber-500' },
  en_negociacion: { labelKey: 'seguimiento.estadoEnNegociacion', color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20', dot: 'bg-purple-500' },
  completado:     { labelKey: 'seguimiento.estadoCompletado',     color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', dot: 'bg-emerald-500' },
  descartado:     { labelKey: 'seguimiento.estadoDescartado',     color: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/10 border-red-500/20', dot: 'bg-red-500' },
}

// Completados y descartados van al final de la lista (ya no requieren
// seguimiento activo) — descartado hasta más abajo que completado, para que
// lo "andá a buscar si te importa" quede lo más lejos posible de lo urgente.
const STATUS_SORT_RANK: Record<TrackingStatus, number> = {
  en_seguimiento: 0,
  contactado: 0,
  en_negociacion: 0,
  completado: 1,
  descartado: 2,
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function timeAgo(date: string, t: (key: string) => string) {
  const diff = Date.now() - new Date(date).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return t('seguimiento.hoy')
  if (days === 1) return t('seguimiento.ayer')
  if (days < 30) return t('seguimiento.haceDias').replace('{n}', String(days))
  if (days < 365) return t('seguimiento.haceMeses').replace('{n}', String(Math.floor(days / 30)))
  return t('seguimiento.haceAnios').replace('{n}', String(Math.floor(days / 365)))
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
  currentStatus: TrackingStatus
  currentRecord: ScoutPlayerStatusRecord | undefined
  onStatusChange: (id: string, status: TrackingStatus) => Promise<void>
  requiresAuth: boolean
}) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const cfg = TRACKING_STATUS_CONFIG[currentStatus]

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (requiresAuth) return
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      // 5 opciones × ~36px + padding ≈ 210px
      const dropdownH = 220
      const spaceBelow = window.innerHeight - rect.bottom
      const top = spaceBelow >= dropdownH ? rect.bottom + 4 : rect.top - dropdownH - 4
      const left = Math.min(rect.left, window.innerWidth - 212)
      setDropdownStyle({ top, left })
    }
    setOpen(o => !o)
  }

  const handleSelect = async (status: TrackingStatus) => {
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
        {t(cfg.labelKey)}
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {currentRecord?.changed_by_name && currentStatus !== 'en_seguimiento' && (
        <p className="text-2xs text-apple-gray-400 mt-0.5">{t('seguimiento.por')} {currentRecord.changed_by_name}</p>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-[300]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[301] bg-white dark:bg-apple-gray-800 rounded-xl shadow-2xl border border-apple-gray-200 dark:border-apple-gray-700 py-1 min-w-[200px] overflow-hidden"
            style={{ top: dropdownStyle.top, left: dropdownStyle.left }}
          >
            {(Object.entries(TRACKING_STATUS_CONFIG) as [TrackingStatus, typeof cfg][]).map(([key, c]) => (
              <button
                key={key}
                onClick={() => handleSelect(key)}
                className={`w-full px-4 py-2.5 text-left text-xs font-medium hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700 transition-colors flex items-center gap-2 ${c.color} ${key === currentStatus ? 'bg-apple-gray-50 dark:bg-apple-gray-700 font-semibold' : ''}`}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.dot}`} />
                {t(c.labelKey)}
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

// ─── ASIGNADO A (dropdown) ─────────────────────────────────────────────────────

function AssignedToDropdown({
  playerId,
  currentUserId,
  currentUserName,
  options,
  onAssign,
  requiresAuth,
}: {
  playerId: string
  currentUserId: string | null
  currentUserName: string | null
  options: { userId: string; userName: string }[]
  onAssign: (playerId: string, userId: string | null, userName: string | null) => Promise<void>
  requiresAuth: boolean
}) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (requiresAuth) return
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const dropdownH = Math.min(280, 60 + options.length * 36)
      const spaceBelow = window.innerHeight - rect.bottom
      const top = spaceBelow >= dropdownH ? rect.bottom + 4 : rect.top - dropdownH - 4
      const left = Math.min(rect.left, window.innerWidth - 212)
      setDropdownStyle({ top, left })
    }
    setOpen(o => !o)
  }

  const handleSelect = async (userId: string | null, userName: string | null) => {
    if (userId === currentUserId) { setOpen(false); return }
    setLoading(true)
    await onAssign(playerId, userId, userName)
    setLoading(false)
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={handleOpen}
        disabled={loading}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all hover:opacity-80 disabled:opacity-50 ${
          currentUserName
            ? 'bg-brand-green/10 border-brand-green/20 text-brand-green'
            : 'bg-apple-gray-100 dark:bg-apple-gray-700 border-apple-gray-200 dark:border-apple-gray-600 text-apple-gray-500 dark:text-apple-gray-400'
        }`}
      >
        {currentUserName || t('seguimiento.sinAsignar')}
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[300]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[301] bg-white dark:bg-apple-gray-800 rounded-xl shadow-2xl border border-apple-gray-200 dark:border-apple-gray-700 py-1 min-w-[200px] max-h-72 overflow-y-auto"
            style={{ top: dropdownStyle.top, left: dropdownStyle.left }}
          >
            <button
              onClick={() => handleSelect(null, null)}
              className={`w-full px-4 py-2.5 text-left text-xs font-medium hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700 transition-colors text-apple-gray-500 dark:text-apple-gray-400 ${!currentUserId ? 'bg-apple-gray-50 dark:bg-apple-gray-700 font-semibold' : ''}`}
            >
              {t('seguimiento.sinAsignar')}
            </button>
            {options.map(opt => (
              <button
                key={opt.userId}
                onClick={() => handleSelect(opt.userId, opt.userName)}
                className={`w-full px-4 py-2.5 text-left text-xs font-medium hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700 transition-colors flex items-center gap-2 text-apple-gray-700 dark:text-apple-gray-300 ${opt.userId === currentUserId ? 'bg-apple-gray-50 dark:bg-apple-gray-700 font-semibold' : ''}`}
              >
                {opt.userName}
                {opt.userId === currentUserId && (
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
  const { external, internal } = useData()
  const navigate = useNavigate()
  const { t } = useLanguage()

  // Build a map: player_db_id (Jugador) → full EnrichedPlayer, for real data when linked
  const dbPlayerMap = useMemo(() => {
    const map = new Map<string, EnrichedPlayer>()
    for (const p of external) map.set(p.Jugador, p)
    for (const p of internal) map.set(p.Jugador, p)
    return map
  }, [external, internal])

  // Returns effective display data: real DB values when linked, manual values otherwise.
  // Dos vínculos posibles y NO excluyentes — `player_db_id` (planilla Wyscout,
  // vía `external`/`internal`) y `supabase_player_id` (API-Football/Sofascore,
  // ya resuelto en `player.team_name/team_logo/player_age/player_photo` por
  // `fetchScoutPlayersWithScores`). Antes esta función solo miraba el primero:
  // un jugador vinculado por Supabase pero ausente de la planilla Wyscout
  // (típico en altas recientes, ver el comentario en `LinkPlayerModal`) quedaba
  // "sin vincular" a los ojos de la tabla — sin edad, sin escudo, nada.
  const getEffective = useCallback((player: ScoutPlayerWithScore) => {
    const db = player.player_db_id ? dbPlayerMap.get(player.player_db_id) : null
    const supabaseLinked = player.supabase_player_id != null
    return {
      name:   db ? db.Jugador : player.full_name,
      // El club vinculado a mano (`club_team_id`) gana siempre que exista —
      // es la elección explícita de un admin, más confiable que lo que haya
      // resuelto automático el vínculo del jugador o la planilla vieja.
      club:     player.club_team_name ?? player.team_name ?? (db ? db.Equipo : (player.club ?? null)),
      teamLogo: player.club_team_logo ?? player.team_logo,
      liga:   db ? db.Liga : (player.liga ?? null),
      agente: db ? (db.Representante || null) : (player.agente ?? null),
      edad:   player.player_age != null ? String(player.player_age)
            : db ? (db.ageNum != null ? String(db.ageNum) : db.Edad || null)
            : (player.edad != null ? String(player.edad) : null),
      photo: player.player_photo,
      isLinked: !!db || supabaseLinked,
    }
  }, [dbPlayerMap])

  const [players, setPlayers] = useState<ScoutPlayerWithScore[]>([])
  const [statuses, setStatuses] = useState<Record<string, ScoutPlayerStatusRecord>>({})
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [fileUploadPlayerId, setFileUploadPlayerId] = useState<string | null>(null)
  const [linkingPlayer, setLinkingPlayer] = useState<ScoutPlayerWithScore | null>(null)
  const [linkingClubPlayer, setLinkingClubPlayer] = useState<ScoutPlayerWithScore | null>(null)
  const [fichaPlayer, setFichaPlayer] = useState<ScoutPlayerWithScore | null>(null)

  // Mismo criterio de admin que Mercado (Marcos + Matías) — antes esto solo
  // dejaba vincular jugadores con el email del dueño de la cuenta, Matías no
  // podía hacerlo acá aunque sí puede en Mercado.
  const isAdmin = isMarketLinkAdmin(user?.email)

  // Filters
  const [search, setSearch] = useState('')
  const [posFilter, setPosFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<TrackingStatus | ''>('')
  const [scoutFilter, setScoutFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const requiresAuth = !user

  const load = useCallback(async () => {
    setLoading(true)
    const [playersData, statusesData] = await Promise.all([
      fetchScoutPlayersWithScores('scouts_gg'),
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

  const handleStatusChange = useCallback(async (playerId: string, status: TrackingStatus) => {
    if (!user) return
    const result = await setScoutPlayerStatus(playerId, 'scouts_gg', status, user.id, userDisplayName)
    if (result) {
      setStatuses(prev => ({ ...prev, [playerId]: result }))
    }
  }, [user, userDisplayName])

  const handleAssignChange = useCallback(async (playerId: string, userId: string | null, userName: string | null) => {
    const ok = await setScoutPlayerAssignment(playerId, userId, userName)
    if (ok) {
      setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, assigned_to: userId, assigned_to_name: userName } : p))
    }
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm(t('seguimiento.confirmarQuitar'))) return
    await removeScoutPlayerFromList(id, 'scouts_gg')
    setPlayers(prev => prev.filter(p => p.id !== id))
  }, [t])

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
    Object.keys(TRACKING_STATUS_CONFIG).forEach(k => counts[k] = 0)
    players.forEach(p => {
      const s = (statuses[p.id]?.status as TrackingStatus) || 'en_seguimiento'
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

  // Opciones para "Asignado a" -- gente que ya agregó o ya tiene algo asignado
  // en esta lista, más el usuario actual (así siempre puede asignarse a sí
  // mismo aunque todavía no haya cargado ningún jugador).
  const assigneeOptions = useMemo(() => {
    const map = new Map<string, string>()
    players.forEach(p => {
      if (p.added_by_scouts && p.added_by_scouts_name) map.set(p.added_by_scouts, p.added_by_scouts_name)
      if (p.assigned_to && p.assigned_to_name) map.set(p.assigned_to, p.assigned_to_name)
    })
    if (user && userDisplayName) map.set(user.id, userDisplayName)
    return [...map.entries()]
      .map(([userId, userName]) => ({ userId, userName }))
      .sort((a, b) => a.userName.localeCompare(b.userName))
  }, [players, user, userDisplayName])

  // Filtered + sorted players
  const filtered = useMemo(() => {
    return players.filter(p => {
      if (search) {
        if (!fuzzyMatch(search, p.full_name) &&
            !fuzzyMatch(search, p.club || '') &&
            !fuzzyMatch(search, p.liga || '')) return false
      }
      if (posFilter && p.posicion !== posFilter) return false
      if (scoutFilter && p.added_by_scouts_name !== scoutFilter) return false
      if (statusFilter) {
        const s = (statuses[p.id]?.status as TrackingStatus) || 'en_seguimiento'
        if (s !== statusFilter) return false
      }
      return true
    }).sort((a, b) => {
      const statusA = (statuses[a.id]?.status as TrackingStatus) || 'en_seguimiento'
      const statusB = (statuses[b.id]?.status as TrackingStatus) || 'en_seguimiento'
      const rankDiff = STATUS_SORT_RANK[statusA] - STATUS_SORT_RANK[statusB]
      if (rankDiff !== 0) return rankDiff
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [players, statuses, search, posFilter, statusFilter, scoutFilter])

  const activeFilters = [search, posFilter, statusFilter, scoutFilter].filter(Boolean).length

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
              {t('seguimiento.title')}
            </h1>
          </div>
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">
            {t('seguimiento.subtitulo')} · {filtered.length} {t('seguimiento.de')} {players.length} {t('seguimiento.jugadores')}
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-green text-white rounded-xl font-semibold text-sm hover:bg-emerald-600 active:scale-95 transition-all shadow-sm shadow-brand-green/20"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          {t('seguimiento.agregarJugador')}
        </button>
      </div>

      {/* Status pipeline */}
      <div className="flex flex-wrap gap-2 mb-5">
        {(Object.entries(TRACKING_STATUS_CONFIG) as [TrackingStatus, typeof TRACKING_STATUS_CONFIG.en_seguimiento][]).map(([key, cfg]) => (
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
            {t(cfg.labelKey)}
            <span className="font-bold opacity-70">{stats[key] || 0}</span>
          </button>
        ))}
      </div>

      {/* Search + filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1 sm:max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder={t('seguimiento.buscarPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm text-apple-gray-800 dark:text-white placeholder-apple-gray-400 focus:outline-none focus:border-brand-green focus:ring-2 focus:ring-brand-green/20 transition-all"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setShowFilters(o => !o)}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium border transition-all ${
              showFilters || activeFilters > 0
                ? 'bg-brand-green/10 border-brand-green/30 text-brand-green'
                : 'bg-white dark:bg-apple-gray-800 border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            {t('seguimiento.filtros')}
            {activeFilters > 0 && (
              <span className="w-5 h-5 rounded-full bg-brand-green text-white text-2xs font-bold flex items-center justify-center">{activeFilters}</span>
            )}
          </button>

          {activeFilters > 0 && (
            <button
              onClick={() => { setSearch(''); setPosFilter(''); setStatusFilter(''); setScoutFilter('') }}
              className="px-3 py-2.5 rounded-xl text-sm text-apple-gray-500 hover:text-apple-gray-700 dark:hover:text-apple-gray-300 transition-colors"
            >
              {t('seguimiento.limpiar')}
            </button>
          )}
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="mb-5 p-4 bg-white dark:bg-apple-gray-800 rounded-2xl border border-apple-gray-200 dark:border-apple-gray-700 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-apple-gray-500 uppercase tracking-wider mb-1.5">{t('seguimiento.posicion')}</label>
            <select value={posFilter} onChange={e => setPosFilter(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-700 border border-apple-gray-200 dark:border-apple-gray-600 text-sm text-apple-gray-800 dark:text-white focus:outline-none focus:border-brand-green transition-all">
              <option value="">{t('seguimiento.todasPosiciones')}</option>
              {positions.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-apple-gray-500 uppercase tracking-wider mb-1.5">{t('seguimiento.scout')}</label>
            <select value={scoutFilter} onChange={e => setScoutFilter(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-700 border border-apple-gray-200 dark:border-apple-gray-600 text-sm text-apple-gray-800 dark:text-white focus:outline-none focus:border-brand-green transition-all">
              <option value="">{t('seguimiento.todosScouts')}</option>
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
            <p className="text-sm text-apple-gray-500">{t('seguimiento.cargandoJugadores')}</p>
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
            {players.length === 0 ? t('seguimiento.listaVacia') : t('seguimiento.sinResultados')}
          </h3>
          <p className="text-sm text-apple-gray-500 mb-4">
            {players.length === 0 ? t('seguimiento.agregaPrimerJugador') : t('seguimiento.probaOtrosFiltros')}
          </p>
          {players.length === 0 && (
            <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-brand-green text-white rounded-xl text-sm font-semibold hover:bg-emerald-600 transition-all">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
              {t('seguimiento.agregarPrimerJugador')}
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
                    <th className="px-4 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wider">{t('seguimiento.colJugador')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wider">{t('seguimiento.colEdad')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wider">{t('seguimiento.colClub')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wider">{t('seguimiento.colLiga')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wider">{t('seguimiento.colAgente')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wider">{t('seguimiento.colPosicion')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wider">{t('seguimiento.colEstado')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wider">{t('seguimiento.colAsignado')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wider">{t('seguimiento.colScoreScouts')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wider">{t('seguimiento.colScoreGG')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wider">{t('seguimiento.colAgregado')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wider">{t('seguimiento.colLinks')}</th>
                    {!requiresAuth && (
                      <th className="px-4 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wider">{t('seguimiento.colAcciones')}</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700/50">
                  {filtered.map(player => {
                    const statusRecord = statuses[player.id]
                    const currentStatus: TrackingStatus = (statusRecord?.status as TrackingStatus) || 'en_seguimiento'
                    const eff = getEffective(player)
                    const files = player.files ?? []

                    return (
                      <>
                        <tr
                          key={player.id}
                          className="hover:bg-brand-green/5 dark:hover:bg-brand-green/10 transition-colors cursor-pointer group"
                          onClick={() => {
                            if (player.supabase_player_id) {
                              navigate(`/jugador/${encodeURIComponent(player.full_name)}?source=externo&apiId=${player.supabase_player_id}`)
                            } else if (player.player_db_id) {
                              navigate(`/jugador/${encodeURIComponent(player.player_db_id)}?source=${player.player_db_source || 'externo'}`)
                            } else {
                              setFichaPlayer(player)
                            }
                          }}
                        >
                          {/* Jugador */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <PlayerPhoto src={eff.photo} name={eff.name} size="sm" rounded="lg" className="flex-shrink-0" />
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p
                                    className="font-semibold truncate transition-colors text-apple-gray-900 dark:text-white hover:text-brand-green cursor-pointer"
                                    title={player.comentario || undefined}
                                    onClick={e => {
                                      e.stopPropagation()
                                      if (player.supabase_player_id) {
                                        navigate(`/jugador/${encodeURIComponent(player.full_name)}?source=externo&apiId=${player.supabase_player_id}`)
                                      } else if (player.player_db_id) {
                                        navigate(`/jugador/${encodeURIComponent(player.player_db_id)}?source=${player.player_db_source || 'externo'}`)
                                      } else {
                                        setFichaPlayer(player)
                                      }
                                    }}
                                  >
                                    {eff.name}
                                  </p>
                                  {!player.player_db_id && (
                                    <span title={t('seguimiento.sinFichaVinculada')} className="flex-shrink-0 text-apple-gray-300 dark:text-apple-gray-600">
                                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728M5.636 5.636a9 9 0 000 12.728M9 10h.01M15 10h.01M9.172 14.172a4 4 0 015.656 0" />
                                      </svg>
                                    </span>
                                  )}
                                  {isAdmin && (
                                    <button
                                      onClick={e => { e.stopPropagation(); setLinkingPlayer(player) }}
                                      title={player.player_db_id ? t('seguimiento.cambiarVinculo') : t('seguimiento.vincularBaseDatos')}
                                      className={`flex-shrink-0 p-0.5 rounded transition-colors opacity-0 group-hover:opacity-100 ${player.player_db_id ? 'text-brand-green hover:bg-brand-green/10' : 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'}`}
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                      </svg>
                                    </button>
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={e => { e.stopPropagation(); handleDelete(player.id) }}
                                className="ml-1 p-1 rounded-lg text-apple-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all opacity-0 group-hover:opacity-100 flex-shrink-0"
                                title={t('seguimiento.quitarDeLista')}
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </td>

                          {/* Edad */}
                          <td className="px-4 py-3 text-sm text-apple-gray-700 dark:text-apple-gray-300 whitespace-nowrap">
                            {eff.edad ? (
                              <span>{eff.edad}<span className="text-xs text-apple-gray-400 ml-0.5">{t('seguimiento.aniosAbbr')}</span></span>
                            ) : (
                              <span className="text-apple-gray-400">—</span>
                            )}
                          </td>

                          {/* Club */}
                          <td className="px-4 py-3 text-sm text-apple-gray-700 dark:text-apple-gray-300 max-w-[140px]" onClick={e => e.stopPropagation()}>
                            <span className="flex items-center gap-1.5 min-w-0">
                              {eff.club ? (
                                <>
                                  <TeamLogo src={eff.teamLogo} className="w-4 h-4 flex-shrink-0" />
                                  <span className="truncate" title={eff.club}>{eff.club}</span>
                                </>
                              ) : (
                                <span className="text-apple-gray-400">—</span>
                              )}
                              {isAdmin && (
                                <button
                                  onClick={() => setLinkingClubPlayer(player)}
                                  title={player.club_team_id ? t('seguimiento.cambiarVinculo') : t('seguimiento.vincularClub')}
                                  className={`flex-shrink-0 p-0.5 rounded transition-colors opacity-0 group-hover:opacity-100 ${player.club_team_id ? 'text-brand-green hover:bg-brand-green/10' : 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'}`}
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                  </svg>
                                </button>
                              )}
                            </span>
                          </td>

                          {/* Liga */}
                          <td className="px-4 py-3 text-sm text-apple-gray-500 dark:text-apple-gray-400 max-w-[120px]">
                            {eff.liga ? (
                              <span className="truncate block" title={eff.liga}>{eff.liga}</span>
                            ) : (
                              <span className="text-apple-gray-400">—</span>
                            )}
                          </td>

                          {/* Agente */}
                          <td className="px-4 py-3 text-sm text-apple-gray-600 dark:text-apple-gray-400 max-w-[140px]">
                            {eff.agente ? (
                              <span className="truncate block" title={eff.agente}>{eff.agente}</span>
                            ) : (
                              <span className="text-apple-gray-400">—</span>
                            )}
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

                          {/* Asignado a */}
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <AssignedToDropdown
                              playerId={player.id}
                              currentUserId={player.assigned_to}
                              currentUserName={player.assigned_to_name}
                              options={assigneeOptions}
                              onAssign={handleAssignChange}
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
                                  {player.scoutEvalCount} {player.scoutEvalCount !== 1 ? t('seguimiento.evalPlural') : t('seguimiento.evalSingular')}
                                </span>
                              </div>
                            ) : (
                              <span className="text-apple-gray-400">—</span>
                            )}
                          </td>

                          {/* Rating (Supabase 1-10) */}
                          <td className="px-4 py-3">
                            {player.gg_score !== null && player.gg_score !== undefined ? (
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-bold tabular-nums ${
                                  player.gg_score >= 7.5 ? 'text-brand-green' :
                                  player.gg_score >= 5.5 ? 'text-emerald-500' :
                                  player.gg_score >= 4 ? 'text-amber-500' : 'text-red-500'
                                }`}>
                                  {player.gg_score.toFixed(1)}
                                </span>
                                <div className="w-14 h-1.5 bg-apple-gray-200 dark:bg-apple-gray-700 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      player.gg_score >= 7.5 ? 'bg-brand-green' :
                                      player.gg_score >= 5.5 ? 'bg-emerald-500' :
                                      player.gg_score >= 4 ? 'bg-amber-500' : 'bg-red-500'
                                    }`}
                                    style={{ width: `${(player.gg_score / 10) * 100}%` }}
                                  />
                                </div>
                              </div>
                            ) : (
                              <span className="text-apple-gray-400 text-sm">—</span>
                            )}
                          </td>

                          {/* Agregado */}
                          <td className="px-4 py-3">
                            <p className="text-xs font-medium text-apple-gray-700 dark:text-apple-gray-300 whitespace-nowrap">
                              {player.added_by_scouts_name || t('seguimiento.sistema')}
                            </p>
                            <p className="text-2xs text-apple-gray-400">{timeAgo(player.created_at, t)}</p>
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
                                  title={t('seguimiento.transfermarkt')}
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
                                  title={t('seguimiento.video')}
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
                                title={t('seguimiento.subirArchivo')}
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
                            <td colSpan={requiresAuth ? 11 : 12} className="px-4 py-2">
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
              const currentStatus: TrackingStatus = (statusRecord?.status as TrackingStatus) || 'en_seguimiento'
              const eff = getEffective(player)
              const files = player.files ?? []

              return (
                <div
                  key={player.id}
                  className="bg-white dark:bg-apple-gray-800 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 p-3"
                >
                  <div className="flex items-center gap-3">
                    <PlayerPhoto src={eff.photo} name={eff.name} size="sm" rounded="lg" className="flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p
                        className="font-semibold text-sm truncate cursor-pointer hover:text-brand-green transition-colors"
                        onClick={() => {
                          if (player.supabase_player_id) {
                            navigate(`/jugador/${encodeURIComponent(player.full_name)}?source=externo&apiId=${player.supabase_player_id}`)
                          } else if (player.player_db_id) {
                            navigate(`/jugador/${encodeURIComponent(player.player_db_id)}?source=${player.player_db_source || 'externo'}`)
                          } else {
                            setFichaPlayer(player)
                          }
                        }}
                      >
                        {eff.name}
                      </p>
                      <p className="text-xs text-apple-gray-500 flex items-center gap-1 min-w-0">
                        {eff.teamLogo && <TeamLogo src={eff.teamLogo} className="w-3.5 h-3.5 flex-shrink-0" />}
                        <span className="truncate">
                          {[eff.club, eff.liga, eff.edad ? `${eff.edad}${t('seguimiento.aniosAbbr')}` : null].filter(Boolean).join(' · ')}
                        </span>
                        {isAdmin && (
                          <button
                            onClick={() => setLinkingClubPlayer(player)}
                            title={player.club_team_id ? t('seguimiento.cambiarVinculo') : t('seguimiento.vincularClub')}
                            className={`flex-shrink-0 p-0.5 rounded transition-colors ${player.club_team_id ? 'text-brand-green' : 'text-amber-500'}`}
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                          </button>
                        )}
                      </p>
                      {eff.agente && (
                        <p className="text-xs text-apple-gray-400 truncate">{t('seguimiento.agente')}: {eff.agente}</p>
                      )}
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

                  <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
                    <StatusDropdown
                      playerId={player.id}
                      currentStatus={currentStatus}
                      currentRecord={statusRecord}
                      onStatusChange={handleStatusChange}
                      requiresAuth={requiresAuth}
                    />
                    <AssignedToDropdown
                      playerId={player.id}
                      currentUserId={player.assigned_to}
                      currentUserName={player.assigned_to_name}
                      options={assigneeOptions}
                      onAssign={handleAssignChange}
                      requiresAuth={requiresAuth}
                    />
                    <div className="flex items-center gap-1.5">
                      {player.transfermarkt_url && (
                        <a href={player.transfermarkt_url} target="_blank" rel="noopener noreferrer"
                          className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" title={t('seguimiento.transfermarkt')}>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      )}
                      {player.video_url && (
                        <a href={player.video_url} target="_blank" rel="noopener noreferrer"
                          className="p-1.5 rounded-lg text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors" title={t('seguimiento.video')}>
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
                          title={t('seguimiento.subirArchivo')}
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

      {/* Link Player Modal (admin only, from row button) */}
      {linkingPlayer && (
        <LinkPlayerModal
          player={linkingPlayer}
          onClose={() => setLinkingPlayer(null)}
          onLinked={() => {
            // Recarga desde el server en vez de parchear el estado local: cuando
            // se linkea supabase_player_id, fetchScoutPlayersWithScores recién ahí
            // resuelve el Rating/foto/equipo reales — un patch local los dejaría vacíos.
            load()
          }}
        />
      )}

      {/* Link Club Modal (admin only, para jugadores que no están en la API) */}
      {linkingClubPlayer && (
        <LinkClubModal
          player={linkingClubPlayer}
          onClose={() => setLinkingClubPlayer(null)}
          onLinked={load}
        />
      )}

      {/* Ficha manual — for players not linked to DB */}
      {fichaPlayer && (
        <FichaManualModal
          player={fichaPlayer}
          onClose={() => setFichaPlayer(null)}
          onLinked={() => {
            load()
            setFichaPlayer(null)
          }}
        />
      )}
    </div>
  )
}
