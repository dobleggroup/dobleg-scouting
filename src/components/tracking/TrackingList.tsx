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
  type ScoutPlayerWithScore,
} from '@/services/scoutPlayersService'
import AddPlayerModal from '@/components/tracking/AddPlayerModal'
import LinkPlayerModal from '@/components/tracking/LinkPlayerModal'
import LinkClubModal from '@/components/tracking/LinkClubModal'
import FichaManualModal from '@/components/tracking/FichaManualModal'
import { PlayerPhoto, TeamLogo } from '@/components/ui/PlayerPhoto'
import { AgentBadge, AgentColumnLabel } from '@/components/ui/AgentBadge'
import PlayerCommentsPanel from '@/components/players/PlayerCommentsPanel'
import { fetchCommentSummaries, type PlayerComment } from '@/services/playerCommentsService'
import { isMarketLinkAdmin, fetchTeamMembers, memberAccounts } from '@/services/marketService'
import { notifyAccounts } from '@/services/notificationsService'
import type { ScoutPlayer, ScoutPlayerStatusRecord, TrackingStatus, EnrichedPlayer } from '@/types'
import type { TeamMember } from '@/types/market'
import { fuzzyMatch } from '@/lib/search'
import { useLanguage } from '@/context/LanguageContext'
import { DISPLAY_POSITION_MAP } from '@/constants/scoring'

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

// ─── POSICIÓN (chip verde, se lee de un vistazo) ─────────────────────────────

// Algunos jugadores tienen guardado el código ("ARQ", "VI", "CB") y otros el
// nombre: se muestran y se filtran siempre con el nombre completo.
const displayPosition = (pos: string | null) => (pos ? DISPLAY_POSITION_MAP[pos] ?? pos : null)

const PENCIL_PATH = 'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zM19.5 7.125L16.875 4.5'

function PositionChip({ position }: { position: string }) {
  return (
    <span className="inline-flex items-center px-1.5 py-px rounded-md ring-1 ring-inset ring-brand-green/25 bg-brand-green/10 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold leading-4 whitespace-nowrap">
      {position}
    </span>
  )
}

// ─── STATUS BADGE (dropdown) ──────────────────────────────────────────────────

function StatusDropdown({
  playerId,
  currentStatus,
  currentRecord,
  onStatusChange,
  requiresAuth,
  showChangedBy = true,
}: {
  playerId: string
  currentStatus: TrackingStatus
  currentRecord: ScoutPlayerStatusRecord | undefined
  onStatusChange: (id: string, status: TrackingStatus) => Promise<void>
  requiresAuth: boolean
  /** "por Fulano" debajo (en la tabla va en el tooltip para que la fila no crezca). */
  showChangedBy?: boolean
}) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const cfg = TRACKING_STATUS_CONFIG[currentStatus]
  const changedBy = currentRecord?.changed_by_name && currentStatus !== 'en_seguimiento' ? currentRecord.changed_by_name : null

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
        title={changedBy ? `${t('seguimiento.por')} ${changedBy}` : undefined}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border whitespace-nowrap transition-all hover:opacity-80 disabled:opacity-50 ${cfg.bg} ${cfg.color}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
        {t(cfg.labelKey)}
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {showChangedBy && changedBy && (
        <p className="text-2xs text-apple-gray-400 mt-0.5">{t('seguimiento.por')} {changedBy}</p>
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
  currentUserName,
  options,
  onAssign,
  requiresAuth,
}: {
  playerId: string
  currentUserName: string | null
  options: TeamMember[]
  onAssign: (playerId: string, member: TeamMember | null) => Promise<void>
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

  const handleSelect = async (member: TeamMember | null) => {
    if ((member?.name ?? null) === currentUserName) { setOpen(false); return }
    setLoading(true)
    await onAssign(playerId, member)
    setLoading(false)
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={handleOpen}
        disabled={loading}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border whitespace-nowrap transition-all hover:opacity-80 disabled:opacity-50 ${
          currentUserName
            ? 'bg-brand-green/10 border-brand-green/20 text-brand-green'
            : 'bg-apple-gray-100 dark:bg-apple-gray-700 border-apple-gray-200 dark:border-apple-gray-600 text-apple-gray-500 dark:text-apple-gray-400'
        }`}
      >
        <span className="truncate max-w-[110px]">{currentUserName || t('seguimiento.sinAsignar')}</span>
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
              onClick={() => handleSelect(null)}
              className={`w-full px-4 py-2.5 text-left text-xs font-medium hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700 transition-colors text-apple-gray-500 dark:text-apple-gray-400 ${!currentUserName ? 'bg-apple-gray-50 dark:bg-apple-gray-700 font-semibold' : ''}`}
            >
              {t('seguimiento.sinAsignar')}
            </button>
            {options.map(member => (
              <button
                key={member.id}
                onClick={() => handleSelect(member)}
                className={`w-full px-4 py-2.5 text-left text-xs font-medium hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700 transition-colors flex items-center gap-2 text-apple-gray-700 dark:text-apple-gray-300 ${member.name === currentUserName ? 'bg-apple-gray-50 dark:bg-apple-gray-700 font-semibold' : ''}`}
              >
                {member.name}
                {member.name === currentUserName && (
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

// ─── PUNTAJE (línea compacta) ─────────────────────────────────────────────────

function ScoreLine({ label, value, good, ok, extra }: { label: string; value: number | null; good: number; ok: number; extra?: string }) {
  const color = value === null ? 'text-apple-gray-400'
    : value >= good ? 'text-brand-green' : value >= ok ? 'text-emerald-500' : value >= 4 ? 'text-amber-500' : 'text-red-500'
  return (
    <p className="flex items-baseline gap-1.5">
      <span className="text-2xs uppercase tracking-wider text-apple-gray-400 w-12">{label}</span>
      <span className={`text-sm font-bold tabular-nums ${color}`}>{value === null ? '—' : value.toFixed(1)}</span>
      {extra && <span className="text-2xs text-apple-gray-400">{extra}</span>}
    </p>
  )
}

// ─── COMENTARIOS (columna + ventana) ─────────────────────────────────────────

type CommentSummary = { count: number; last: PlayerComment | null }

function CommentsCell({ summary, onOpen, compact = false, oneLine = false }: { summary: CommentSummary | undefined; onOpen: () => void; compact?: boolean; oneLine?: boolean }) {
  const { t } = useLanguage()
  const count = summary?.count ?? 0
  const last = summary?.last
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onOpen() }}
      className={`group/c text-left flex gap-2 rounded-lg px-2 py-1 -mx-2 hover:bg-brand-green/10 transition-colors ${oneLine ? 'items-center max-w-[150px] 2xl:max-w-[200px]' : 'items-start'} ${compact ? '' : oneLine ? '' : 'max-w-[190px]'}`}
      title={last ? `${last.author_name} · ${new Date(last.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}: ${last.body}` : t('seguimiento.verComentarios')}
    >
      <span className={`flex-shrink-0 inline-flex items-center gap-1 text-xs font-semibold ${count > 0 ? 'text-brand-green' : 'text-apple-gray-400 group-hover/c:text-brand-green'}`}>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        {count > 0 ? count : '+'}
      </span>
      {last && oneLine && (
        <span className="min-w-0 truncate text-xs text-apple-gray-600 dark:text-apple-gray-300">{last.body}</span>
      )}
      {last && !compact && !oneLine && (
        <span className="min-w-0">
          <span className="block text-xs text-apple-gray-600 dark:text-apple-gray-300 line-clamp-2">{last.body}</span>
          <span className="block text-2xs text-apple-gray-400 truncate">
            {last.author_name} · {new Date(last.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
          </span>
        </span>
      )}
    </button>
  )
}

function CommentsModal({ player, list, onClose, onChange }: {
  player: ScoutPlayerWithScore
  list: TrackingListKind
  onClose: () => void
  onChange: (comments: PlayerComment[]) => void
}) {
  const { t } = useLanguage()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[400] flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-white dark:bg-apple-gray-900 shadow-2xl overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 p-4 border-b border-apple-gray-100 dark:border-apple-gray-700 bg-white/95 dark:bg-apple-gray-900/95 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <PlayerPhoto src={player.player_photo} name={player.full_name} size="sm" rounded="lg" className="flex-shrink-0" />
            <div className="min-w-0">
              <h3 className="font-semibold text-apple-gray-900 dark:text-white truncate">{player.full_name}</h3>
              <p className="text-xs text-apple-gray-500">{t('seguimiento.comentarios')}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" aria-label={t('seguimiento.cerrar')}>
            <svg className="w-5 h-5 text-apple-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-5">
          <PlayerCommentsPanel
            target={{ name: player.full_name, supabasePlayerId: player.supabase_player_id, scoutPlayerId: player.id }}
            source={list === 'datos' ? 'seguimiento_datos' : 'seguimiento_gg'}
            onChange={onChange}
            autoFocus
          />
        </div>
      </div>
    </div>
  )
}

// ─── LISTA (Seguimiento Datos y Seguimiento GG usan la misma) ─────────────────

export type TrackingListKind = 'datos' | 'scouts_gg'

const LIST_META: Record<TrackingListKind, { titleKey: string; subtitleKey: string; path: string; label: string; confirmKey: string }> = {
  datos: { titleKey: 'seguimiento.tituloDatos', subtitleKey: 'seguimiento.subtituloDatos', path: '/seguimiento-datos', label: 'Seguimiento Datos', confirmKey: 'seguimiento.confirmarQuitarDatos' },
  scouts_gg: { titleKey: 'seguimiento.title', subtitleKey: 'seguimiento.subtitulo', path: '/seguimiento-gg', label: 'Seguimiento GG', confirmKey: 'seguimiento.confirmarQuitar' },
}

export default function TrackingList({ list }: { list: TrackingListKind }) {
  const meta = LIST_META[list]
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
      agente: player.player_agent ?? (db ? (db.Representante || null) : (player.agente ?? null)),
      edad:   player.player_age != null ? String(player.player_age)
            : db ? (db.ageNum != null ? String(db.ageNum) : db.Edad || null)
            : (player.edad != null ? String(player.edad) : null),
      photo: player.player_photo,
      isLinked: !!db || supabaseLinked,
    }
  }, [dbPlayerMap])

  const [players, setPlayers] = useState<ScoutPlayerWithScore[]>([])
  const [statuses, setStatuses] = useState<Record<string, ScoutPlayerStatusRecord>>({})
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [commentsPlayer, setCommentsPlayer] = useState<ScoutPlayerWithScore | null>(null)
  const [commentSummaries, setCommentSummaries] = useState<Record<string, CommentSummary>>({})
  const [linkingPlayer, setLinkingPlayer] = useState<ScoutPlayerWithScore | null>(null)
  const [linkingClubPlayer, setLinkingClubPlayer] = useState<ScoutPlayerWithScore | null>(null)
  const [fichaPlayer, setFichaPlayer] = useState<ScoutPlayerWithScore | null>(null)
  const [editingPlayer, setEditingPlayer] = useState<ScoutPlayerWithScore | null>(null)

  // Mismo criterio de admin que Mercado (Marcos + Matías) — antes esto solo
  // dejaba vincular jugadores con el email del dueño de la cuenta, Matías no
  // podía hacerlo acá aunque sí puede en Mercado.
  const isAdmin = isMarketLinkAdmin(user?.email)

  // Filters
  const [search, setSearch] = useState('')
  const [posFilter, setPosFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<TrackingStatus | ''>('')
  const [scoutFilter, setScoutFilter] = useState('')

  const requiresAuth = !user

  const load = useCallback(async () => {
    setLoading(true)
    const [playersData, statusesData] = await Promise.all([
      fetchScoutPlayersWithScores(list),
      fetchScoutPlayerStatuses(list),
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
    setCommentSummaries(await fetchCommentSummaries(enriched.map(p => ({
      scoutPlayerId: p.id, supabasePlayerId: p.supabase_player_id ?? null, name: p.full_name,
    }))))
  }, [list])

  useEffect(() => { load() }, [load])

  // Roster real del staff de la agencia (misma tabla que usa Mercado para
  // asignar negociaciones) -- ya trae el user_id vinculado de cada uno, así
  // se puede notificar de verdad al asignar, no sólo guardar un nombre suelto.
  useEffect(() => {
    fetchTeamMembers().then(setTeamMembers).catch(() => setTeamMembers([]))
  }, [])

  const handleStatusChange = useCallback(async (playerId: string, status: TrackingStatus) => {
    if (!user) return
    const result = await setScoutPlayerStatus(playerId, list, status, user.id, userDisplayName)
    if (result) {
      setStatuses(prev => ({ ...prev, [playerId]: result }))
    }
  }, [user, userDisplayName, list])

  const handleAssignChange = useCallback(async (playerId: string, member: TeamMember | null) => {
    const ok = await setScoutPlayerAssignment(playerId, member?.user_id ?? null, member?.name ?? null)
    if (!ok) return
    setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, assigned_to: member?.user_id ?? null, assigned_to_name: member?.name ?? null } : p))

    // Se avisa a todas las cuentas de la persona asignada (algunos entran con
    // dos mails), salvo a uno mismo.
    if (member) {
      const playerName = players.find(p => p.id === playerId)?.full_name ?? ''
      await notifyAccounts(
        memberAccounts(member),
        'seguimiento_asignacion',
        `${userDisplayName} te asignó a ${playerName} en ${meta.label}`,
        meta.path,
        user?.id,
      )
    }
  }, [players, user, userDisplayName, meta])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm(t(meta.confirmKey))) return
    await removeScoutPlayerFromList(id, list)
    setPlayers(prev => prev.filter(p => p.id !== id))
  }, [t, meta, list])

  const openPlayer = useCallback((player: ScoutPlayerWithScore) => {
    if (player.supabase_player_id) {
      navigate(`/jugador/${encodeURIComponent(player.full_name)}?source=externo&apiId=${player.supabase_player_id}`)
    } else if (player.player_db_id) {
      navigate(`/jugador/${encodeURIComponent(player.player_db_id)}?source=${player.player_db_source || 'externo'}`)
    } else {
      setFichaPlayer(player)
    }
  }, [navigate])

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

  // Scouts para el filtro: todo el staff, más quien haya agregado o tenga
  // asignado a algún jugador (antes salían solo los que agregaron jugadores).
  const addedByOf = useCallback((p: ScoutPlayerWithScore) =>
    list === 'datos' ? p.added_by_datos_name : p.added_by_scouts_name, [list])
  const scouts = useMemo(() => {
    const set = new Set<string>()
    teamMembers.forEach(m => set.add(m.name))
    players.forEach(p => {
      const added = addedByOf(p)
      if (added) set.add(added)
      if (p.assigned_to_name) set.add(p.assigned_to_name)
    })
    return [...set].sort((a, b) => a.localeCompare(b, 'es'))
  }, [players, teamMembers, addedByOf])

  // Unique positions for filter
  const positions = useMemo(() => {
    const set = new Set<string>()
    players.forEach(p => { const pos = displayPosition(p.posicion); if (pos) set.add(pos) })
    return [...set].sort()
  }, [players])


  // Filtered + sorted players
  const filtered = useMemo(() => {
    return players.filter(p => {
      if (search) {
        if (!fuzzyMatch(search, p.full_name) &&
            !fuzzyMatch(search, p.club || '') &&
            !fuzzyMatch(search, p.liga || '')) return false
      }
      if (posFilter && displayPosition(p.posicion) !== posFilter) return false
      if (scoutFilter && addedByOf(p) !== scoutFilter && p.assigned_to_name !== scoutFilter) return false
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
  }, [players, statuses, search, posFilter, statusFilter, scoutFilter, addedByOf])

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
              {t(meta.titleKey)}
            </h1>
          </div>
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">
            {t(meta.subtitleKey)} · {filtered.length} {t('seguimiento.de')} {players.length} {t('seguimiento.jugadores')}
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

      {/* Status pipeline -- mientras `loading` es true, `players` todavía es
          el [] inicial y `stats` da todo en 0: sin este gate, cada carga (y
          cada refetch tras cambiar un estado) mostraba un flash real de "En
          Seguimiento 0 / Contactado 0 / ..." antes de los números reales. */}
      {loading ? (
        <div className="flex flex-wrap gap-2 mb-5">
          {Object.keys(TRACKING_STATUS_CONFIG).map(key => (
            <div key={key} className="h-8 w-32 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-700/40 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 mb-5">
          {([['', t('seguimiento.todos'), players.length]] as [TrackingStatus | '', string, number][])
            .concat((Object.entries(TRACKING_STATUS_CONFIG) as [TrackingStatus, typeof TRACKING_STATUS_CONFIG.en_seguimiento][])
              .map(([key, cfg]) => [key, t(cfg.labelKey), stats[key] || 0]))
            .map(([key, label, count]) => (
              <button
                key={key || 'todos'}
                onClick={() => setStatusFilter(key === '' || statusFilter === key ? '' : key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  statusFilter === key
                    ? 'bg-apple-gray-800 dark:bg-white text-white dark:text-apple-gray-900 border-apple-gray-800 dark:border-white'
                    : 'bg-white dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-300 border-apple-gray-200 dark:border-apple-gray-700 hover:border-apple-gray-300 dark:hover:border-apple-gray-600'
                }`}
              >
                {label}
                <span className="font-bold opacity-60 tabular-nums">{count}</span>
              </button>
            ))}
        </div>
      )}

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

        <div className="flex flex-wrap gap-3">
          <select
            value={posFilter}
            onChange={e => setPosFilter(e.target.value)}
            aria-label={t('seguimiento.posicion')}
            className={`flex-1 sm:flex-initial min-w-0 px-3.5 py-2.5 rounded-xl bg-white dark:bg-apple-gray-800 border text-sm focus:outline-none focus:border-brand-green transition-all ${posFilter ? 'border-brand-green/50 text-brand-green font-medium' : 'border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-700 dark:text-apple-gray-200'}`}
          >
            <option value="">{t('seguimiento.todasPosiciones')}</option>
            {positions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select
            value={scoutFilter}
            onChange={e => setScoutFilter(e.target.value)}
            aria-label={t('seguimiento.scout')}
            className={`flex-1 sm:flex-initial min-w-0 px-3.5 py-2.5 rounded-xl bg-white dark:bg-apple-gray-800 border text-sm focus:outline-none focus:border-brand-green transition-all ${scoutFilter ? 'border-brand-green/50 text-brand-green font-medium' : 'border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-700 dark:text-apple-gray-200'}`}
          >
            <option value="">{t('seguimiento.todosScouts')}</option>
            {scouts.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
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
          {/* ── Tabla (desde 1280px) ──
              Todo entra en el ancho de la pantalla, sin deslizar: edad y posición
              van debajo del nombre y la liga debajo del club. Hasta 2xl, estado y
              asignado, y los dos puntajes, van apilados para ganar ancho. */}
          <div className="hidden xl:block card-apple overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-apple-gray-200 dark:border-apple-gray-700">
                    <th className="px-3 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wider">{t('seguimiento.colJugador')}</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wider">{t('seguimiento.colClub')}</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wider"><AgentColumnLabel /></th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wider whitespace-nowrap">{t('seguimiento.colEstadoAsignado')}</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wider">{t('seguimiento.comentarios')}</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wider">{t('seguimiento.colPuntajes')}</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase tracking-wider whitespace-nowrap">{t('seguimiento.colAgregado')}</th>
                    <th className="w-10 px-1 py-3"><span className="sr-only">{t('seguimiento.quitarDeLista')}</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700/50">
                  {filtered.map(player => {
                    const statusRecord = statuses[player.id]
                    const currentStatus: TrackingStatus = (statusRecord?.status as TrackingStatus) || 'en_seguimiento'
                    const eff = getEffective(player)
                    const files = player.files ?? []
                    const addedBy = list === 'datos' ? player.added_by_datos_name : player.added_by_scouts_name

                    return (
                        <tr
                          key={player.id}
                          className="hover:bg-brand-green/5 dark:hover:bg-brand-green/10 transition-colors cursor-pointer group"
                          onClick={() => openPlayer(player)}
                        >
                          {/* Jugador: nombre, posición · edad, links */}
                          <td className="px-3 py-2.5">
                            <div className="flex items-start gap-2.5 min-w-[160px] max-w-[220px]">
                              <PlayerPhoto src={eff.photo} name={eff.name} size="sm" rounded="lg" className="flex-shrink-0" />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1">
                                  <p className="font-semibold truncate text-apple-gray-900 dark:text-white group-hover:text-brand-green transition-colors">
                                    {eff.name}
                                  </p>
                                  {!player.player_db_id && !player.supabase_player_id && (
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
                                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-apple-gray-500 dark:text-apple-gray-400" onClick={e => e.stopPropagation()}>
                                  {player.posicion && <PositionChip position={displayPosition(player.posicion)!} />}
                                  {eff.edad && <span className="whitespace-nowrap">{eff.edad} {t('seguimiento.aniosAbbr')}</span>}
                                  {player.transfermarkt_url && (
                                    <a href={player.transfermarkt_url} target="_blank" rel="noopener noreferrer" title={t('seguimiento.transfermarkt')} className="text-blue-500 hover:text-blue-600">
                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                    </a>
                                  )}
                                  {player.video_url && (
                                    <a href={player.video_url} target="_blank" rel="noopener noreferrer" title={t('seguimiento.video')} className="text-purple-500 hover:text-purple-600">
                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    </a>
                                  )}
                                  {files.length > 0 && (
                                    <span className="inline-flex items-center gap-0.5 text-2xs" title={t('seguimiento.archivos')}>
                                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                                      {files.length}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Club + liga */}
                          <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                            <div className="max-w-[160px]">
                              <span className="flex items-center gap-1.5 min-w-0 text-apple-gray-700 dark:text-apple-gray-300">
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
                              {eff.liga && <p className="mt-0.5 text-xs text-apple-gray-400 truncate" title={eff.liga}>{eff.liga}</p>}
                            </div>
                          </td>

                          {/* Agente */}
                          <td className="px-3 py-2.5">
                            <div className="max-w-[150px]">
                              <AgentBadge agent={eff.agente} className="block max-w-full" />
                            </div>
                          </td>

                          {/* Estado + asignado */}
                          <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                            <div className="flex flex-col 2xl:flex-row items-start 2xl:items-center gap-1 2xl:gap-1.5">
                              <StatusDropdown
                                playerId={player.id}
                                currentStatus={currentStatus}
                                currentRecord={statusRecord}
                                onStatusChange={handleStatusChange}
                                requiresAuth={requiresAuth}
                                showChangedBy={false}
                              />
                              <AssignedToDropdown
                                playerId={player.id}
                                currentUserName={player.assigned_to_name}
                                options={teamMembers}
                                onAssign={handleAssignChange}
                                requiresAuth={requiresAuth}
                              />
                            </div>
                          </td>

                          {/* Comentarios */}
                          <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                            <CommentsCell summary={commentSummaries[player.id]} onOpen={() => setCommentsPlayer(player)} oneLine />
                          </td>

                          {/* Puntajes: scouts (reportes) y rating de partidos */}
                          <td className="px-3 py-2.5">
                            <div className="flex flex-col 2xl:flex-row 2xl:items-center gap-0.5 2xl:gap-3 text-xs whitespace-nowrap">
                              <ScoreLine
                                label={t('seguimiento.puntajeScouts')}
                                value={player.scoutScore ?? null}
                                good={8} ok={6}
                                extra={player.scoutEvalCount ? `${player.scoutEvalCount} ${player.scoutEvalCount !== 1 ? t('seguimiento.evalPlural') : t('seguimiento.evalSingular')}` : undefined}
                              />
                              <ScoreLine label={t('seguimiento.puntajeRating')} value={player.gg_score ?? null} good={7.5} ok={5.5} />
                            </div>
                          </td>

                          {/* Agregado */}
                          <td className="px-3 py-2.5">
                            <p className="text-xs font-medium text-apple-gray-700 dark:text-apple-gray-300 whitespace-nowrap truncate max-w-[120px]" title={addedBy || undefined}>
                              {addedBy || t('seguimiento.sistema')}
                            </p>
                            <p className="text-2xs text-apple-gray-400 whitespace-nowrap">{timeAgo(player.created_at, t)}</p>
                          </td>

                          {/* Editar + eliminar */}
                          <td className="px-1 py-2.5" onClick={e => e.stopPropagation()}>
                            {!requiresAuth && (
                              <div className="flex items-center">
                                <button
                                  onClick={() => setEditingPlayer(player)}
                                  className="p-1 rounded-lg text-apple-gray-400 dark:text-apple-gray-500 hover:text-brand-green hover:bg-brand-green/10 transition-colors"
                                  title={t('seguimiento.editarJugador')}
                                  aria-label={t('seguimiento.editarJugador')}
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={PENCIL_PATH} />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleDelete(player.id)}
                                  className="p-1 rounded-lg text-apple-gray-300 dark:text-apple-gray-600 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                                  title={t('seguimiento.quitarDeLista')}
                                  aria-label={t('seguimiento.quitarDeLista')}
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Tarjetas (celular y pantallas medianas, donde la tabla no entra) ── */}
          <div className="block xl:hidden space-y-3">
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
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p
                          className="font-semibold text-sm truncate cursor-pointer text-apple-gray-900 dark:text-white hover:text-brand-green transition-colors"
                          onClick={() => openPlayer(player)}
                        >
                          {eff.name}
                        </p>
                        {player.posicion && <span className="flex-shrink-0"><PositionChip position={displayPosition(player.posicion)!} /></span>}
                      </div>
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
                      <div className="mt-0.5 flex min-w-0"><AgentBadge agent={eff.agente} className="max-w-full" /></div>
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
                      currentUserName={player.assigned_to_name}
                      options={teamMembers}
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
                          onClick={() => setEditingPlayer(player)}
                          className="p-1.5 rounded-lg text-apple-gray-400 hover:text-brand-green hover:bg-brand-green/10 transition-colors"
                          title={t('seguimiento.editarJugador')}
                          aria-label={t('seguimiento.editarJugador')}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={PENCIL_PATH} />
                          </svg>
                        </button>
                      )}
                      {!requiresAuth && (
                        <button
                          onClick={() => handleDelete(player.id)}
                          className="p-1.5 rounded-lg text-apple-gray-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                          title={t('seguimiento.quitarDeLista')}
                          aria-label={t('seguimiento.quitarDeLista')}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 pt-2 border-t border-apple-gray-100 dark:border-apple-gray-700/60">
                    <CommentsCell summary={commentSummaries[player.id]} onOpen={() => setCommentsPlayer(player)} />
                  </div>
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
        defaultList={list}
        onSuccess={load}
      />

      {/* Editar la ficha del jugador (lápiz de cada fila) */}
      <AddPlayerModal
        isOpen={!!editingPlayer}
        onClose={() => setEditingPlayer(null)}
        editPlayer={editingPlayer}
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

      {/* Comentarios del jugador (historial compartido con su ficha) */}
      {commentsPlayer && (
        <CommentsModal
          player={commentsPlayer}
          list={list}
          onClose={() => setCommentsPlayer(null)}
          onChange={comments => setCommentSummaries(prev => ({
            ...prev,
            [commentsPlayer.id]: { count: comments.length, last: comments[0] ?? null },
          }))}
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
