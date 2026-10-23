import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { PlayerPhoto } from '@/components/ui/PlayerPhoto'
import PlayerLinkField from './PlayerLinkField'
import StatusPill from './StatusPill'
import FollowupDateField from './FollowupDateField'
import AssigneeSelect from './AssigneeSelect'
import { CANDIDATE_STATUS_ORDER, CANDIDATE_STATUS_LABEL_KEY, CANDIDATE_STATUS_COLOR } from './marketLabels'
import { buildPlayerPhotoUrl } from '@/utils/marketAlerts'
import { useLinkedPlayerAge } from '@/hooks/useLinkedPlayerAge'
import {
  addCandidate,
  updateCandidateStatus,
  removeCandidate,
  removeCandidateAndNegotiation,
  linkCandidatePlayer,
  ensureCandidateNegotiation,
  updateFollowupDate,
  reassignNegotiation,
  updateNegotiationTargetContacts,
  isMarketLinkAdmin,
  findMe,
} from '@/services/marketService'
import type { ClubNeed, ClubContact, NeedCandidate, CandidateStatus, Negotiation, TeamMember } from '@/types/market'

/** Chip de la segunda línea de cada ofrecido: muestra el dato o, vacío, una invitación punteada a cargarlo. */
function DetailChip({ icon, filled, label, onClick }: { icon: React.ReactNode; filled: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 max-w-full px-2.5 py-1 rounded-lg text-xs transition-colors ${
        filled
          ? 'text-apple-gray-600 dark:text-apple-gray-300 bg-white dark:bg-apple-gray-700/60 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700'
          : 'text-apple-gray-400 border border-dashed border-apple-gray-300 dark:border-apple-gray-600 hover:border-brand-green hover:text-brand-green'
      }`}
    >
      <span className="flex-shrink-0 opacity-70">{icon}</span>
      <span className="truncate">{filled ? label : `+ ${label}`}</span>
    </button>
  )
}

const ICON_PERSON = (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
)
const ICON_CHAT = (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5m-9 6l2.5-3H19a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v9a2 2 0 002 2h.5" /></svg>
)

function CandidateRow({
  candidate,
  negotiation,
  overdue,
  canLink,
  members,
  onStatusChange,
  onRemove,
  onLinked,
  onEnsureNegotiation,
  onNegotiationUpdated,
  onOpenNegotiation,
}: {
  candidate: NeedCandidate
  negotiation: Negotiation | null
  overdue: boolean
  canLink: boolean
  members: TeamMember[]
  onStatusChange: (status: CandidateStatus) => void
  onRemove: (alsoNegotiation: boolean) => void
  onLinked: (apiId: number, name: string | null) => void
  onEnsureNegotiation: () => Promise<Negotiation | null>
  onNegotiationUpdated: (n: Negotiation) => void
  onOpenNegotiation: (id: number) => void
}) {
  const { user, userDisplayName } = useAuth()
  const { t } = useLanguage()
  const age = useLinkedPlayerAge(candidate.player_api_id)
  const [editing, setEditing] = useState<null | 'assignee' | 'contact' | 'link'>(null)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [contactDraft, setContactDraft] = useState<ClubContact>({ name: '', role: null })
  const [pendingApiId, setPendingApiId] = useState<number | null>(null)
  const [pendingIdentity, setPendingIdentity] = useState<{ name: string; age: number | null } | null>(null)
  const contactInputRef = useRef<HTMLInputElement>(null)

  const discarded = candidate.status === 'descartado'
  const signed = candidate.status === 'fichado'
  const contacts = negotiation?.target_club_contacts ?? []
  const firstContact = contacts[0]
  const statusLabels = Object.fromEntries(
    CANDIDATE_STATUS_ORDER.map(s => [s, t(CANDIDATE_STATUS_LABEL_KEY[s])]),
  ) as Record<CandidateStatus, string>

  useEffect(() => {
    if (editing === 'contact') contactInputRef.current?.focus()
  }, [editing])

  const openContact = () => {
    setContactDraft(firstContact ?? { name: '', role: null })
    setEditing(e => e === 'contact' ? null : 'contact')
  }

  const saveContact = async () => {
    const n = negotiation ?? await onEnsureNegotiation()
    if (!n) return
    const cleaned: ClubContact = { name: contactDraft.name.trim(), role: contactDraft.role?.trim() || null }
    const next = cleaned.name ? [cleaned, ...contacts.slice(1)] : contacts.slice(1)
    if (await updateNegotiationTargetContacts(n.id, next)) {
      onNegotiationUpdated({ ...n, target_club_contacts: next })
      setEditing(null)
    }
  }

  const saveAssignee = async (id: number, name: string) => {
    const n = negotiation ?? await onEnsureNegotiation()
    if (!n) return
    if (await reassignNegotiation(n.id, id, name, user?.id ?? null, userDisplayName || 'Usuario')) {
      onNegotiationUpdated({ ...n, assigned_to_id: id, assigned_to_name: name })
      setEditing(null)
    }
  }

  const saveFollowup = async (date: string | null) => {
    const n = negotiation ?? await onEnsureNegotiation()
    if (!n) return
    if (await updateFollowupDate({ negotiationId: n.id }, date)) onNegotiationUpdated({ ...n, next_followup_date: date })
  }

  const saveLink = async () => {
    if (pendingApiId == null) return
    if (await linkCandidatePlayer(candidate.id, pendingApiId, 'externo', pendingIdentity?.name)) {
      onLinked(pendingApiId, pendingIdentity?.name ?? null)
      setEditing(null)
    }
  }

  return (
    <div
      className={`rounded-xl p-2.5 transition-colors ${
        discarded
          ? 'bg-apple-gray-50/70 dark:bg-apple-gray-800/30 border border-dashed border-apple-gray-200 dark:border-apple-gray-700'
          : signed
            ? 'bg-emerald-50/70 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800/50'
            : 'bg-apple-gray-50 dark:bg-apple-gray-800/50 border border-transparent'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <div className={discarded ? 'opacity-40 grayscale' : ''}>
          <PlayerPhoto src={buildPlayerPhotoUrl(candidate.player_api_id)} name={candidate.player_name} size="xs" />
        </div>
        <span className="flex-1 min-w-0">
          <span className={`block text-sm truncate ${discarded ? 'text-apple-gray-400 line-through decoration-apple-gray-300' : 'font-medium text-apple-gray-800 dark:text-apple-gray-100'}`}>
            {candidate.player_name}
            {age != null && <span className="font-normal text-apple-gray-400">, {age} {t('externo.anios')}</span>}
          </span>
        </span>
        <StatusPill
          value={candidate.status}
          options={CANDIDATE_STATUS_ORDER}
          labels={statusLabels}
          colors={CANDIDATE_STATUS_COLOR}
          onChange={onStatusChange}
          title={t('mercado.cambiarEstado')}
        />
        <button onClick={() => setConfirmingRemove(c => !c)} className="text-apple-gray-300 hover:text-red-500 flex-shrink-0" title={t('mercado.quitar')}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {confirmingRemove && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-9 text-2xs">
          <span className="text-apple-gray-500">{t('mercado.quitarJugadorPregunta').replace('{name}', candidate.player_name)}</span>
          <button onClick={() => onRemove(false)} className="px-2 py-1 rounded-md bg-white dark:bg-apple-gray-700 border border-apple-gray-200 dark:border-apple-gray-600 text-apple-gray-700 dark:text-apple-gray-200 hover:border-red-300 hover:text-red-600">
            {t('mercado.quitarSoloBusqueda')}
          </button>
          {candidate.negotiation_id && (
            <button onClick={() => onRemove(true)} className="px-2 py-1 rounded-md bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40">
              {t('mercado.quitarTambienNegociacion')}
            </button>
          )}
          <button onClick={() => setConfirmingRemove(false)} className="text-apple-gray-400 hover:text-apple-gray-700 dark:hover:text-white">
            {t('mercado.cancelar')}
          </button>
        </div>
      )}

      {/* Los descartados no necesitan seguimiento: sin chips, para que se lean como "terminado". */}
      {!discarded && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-9">
          <DetailChip
            icon={ICON_PERSON}
            filled={!!negotiation?.assigned_to_name}
            label={negotiation?.assigned_to_name ?? t('mercado.agregarResponsable')}
            onClick={() => setEditing(e => e === 'assignee' ? null : 'assignee')}
          />
          <DetailChip
            icon={ICON_CHAT}
            filled={!!firstContact}
            label={firstContact
              ? `${firstContact.name}${firstContact.role ? ` · ${firstContact.role}` : ''}${contacts.length > 1 ? ` +${contacts.length - 1}` : ''}`
              : t('mercado.agregarContacto')}
            onClick={openContact}
          />
          <span className="inline-flex items-center gap-1.5 px-1">
            <svg className="w-3.5 h-3.5 text-apple-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            <FollowupDateField value={negotiation?.next_followup_date ?? null} overdue={overdue} onChange={saveFollowup} />
          </span>
          {canLink && (
            <button
              onClick={() => { setPendingApiId(candidate.player_api_id); setPendingIdentity(null); setEditing(e => e === 'link' ? null : 'link') }}
              className="text-2xs font-medium text-brand-green hover:text-emerald-600"
            >
              {candidate.player_api_id ? '✓ API' : t('mercado.vincular')}
            </button>
          )}
          {negotiation && (
            <button
              onClick={() => onOpenNegotiation(negotiation.id)}
              className="ml-auto text-2xs font-medium text-apple-gray-400 hover:text-brand-green inline-flex items-center gap-0.5"
            >
              {t('mercado.verNegociacion')}
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
          )}
        </div>
      )}

      {editing === 'assignee' && (
        <div className="mt-2 pl-9 max-w-xs">
          <AssigneeSelect value={negotiation?.assigned_to_id ?? null} onChange={saveAssignee} members={members} />
        </div>
      )}

      {editing === 'contact' && (
        <div className="mt-2 pl-9 flex flex-wrap items-center gap-2">
          <input
            ref={contactInputRef}
            type="text"
            value={contactDraft.name}
            onChange={e => setContactDraft(d => ({ ...d, name: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') saveContact() }}
            placeholder={t('mercado.responsableClubPlaceholder')}
            className="input-apple text-sm flex-1 min-w-[9rem]"
          />
          <input
            type="text"
            value={contactDraft.role ?? ''}
            onChange={e => setContactDraft(d => ({ ...d, role: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') saveContact() }}
            placeholder={t('mercado.cargoPlaceholder')}
            className="input-apple text-sm w-32"
          />
          <button onClick={saveContact} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-brand-green hover:bg-emerald-600">
            {t('mercado.guardar')}
          </button>
        </div>
      )}

      {canLink && editing === 'link' && (
        <div className="mt-2 pl-9 space-y-2">
          <PlayerLinkField
            playerName={candidate.player_name}
            playerApiId={pendingApiId}
            onChange={setPendingApiId}
            onResolved={setPendingIdentity}
          />
          <button
            onClick={saveLink}
            disabled={pendingApiId == null}
            className="text-xs font-semibold text-white bg-brand-green px-3 py-1.5 rounded-lg hover:bg-emerald-600 disabled:opacity-50"
          >
            {t('mercado.guardarVinculo')}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Un club no busca "un" jugador puntual — va evaluando varios candidatos para
 * el mismo puesto a medida que se los ofrecen. Esta lista vive dentro de cada
 * búsqueda y es el registro de "le ofrecimos a X, después a Y". Cada ofrecido
 * es además una negociación (ver `addCandidate`): ahí viven su responsable,
 * con quién hablamos y cuándo volver a hablar.
 */
export default function NeedCandidatesPanel({
  need,
  readOnly = false,
  candidates,
  negotiationsById,
  overdueNegotiationIds,
  members,
  onCandidatesChange,
  onNegotiationUpserted,
  onNegotiationRemoved,
  onNegotiationMightHaveChanged,
  onOpenNegotiation,
}: {
  need: ClubNeed
  /** Búsqueda cerrada: se ve lo que se ofreció, pero no se cargan nombres nuevos. */
  readOnly?: boolean
  candidates: NeedCandidate[]
  negotiationsById: Map<number, Negotiation>
  overdueNegotiationIds: Set<number>
  members: TeamMember[]
  onCandidatesChange: (update: (prev: NeedCandidate[]) => NeedCandidate[]) => void
  onNegotiationUpserted: (n: Negotiation) => void
  onNegotiationRemoved: (id: number) => void
  /** Cambiar el estado de un ofrecido se sincroniza server-side a su
   * negociación — se llama para que esa lista hermana no quede vieja. */
  onNegotiationMightHaveChanged?: () => void
  onOpenNegotiation: (id: number) => void
}) {
  const { user, userDisplayName } = useAuth()
  const { t } = useLanguage()
  const canLink = isMarketLinkAdmin(user?.email)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)

  // Lo ofrecido por uno queda a su nombre; si quien carga no está en la lista
  // de responsables, hereda el responsable de la búsqueda.
  const me = findMe(members, user?.id, userDisplayName)
  const defaultAssignee = me
    ? { id: me.id, name: me.name }
    : need.assigned_to_id != null && need.assigned_to_name ? { id: need.assigned_to_id, name: need.assigned_to_name } : null

  const active = candidates.filter(c => c.status !== 'descartado')
  const discarded = candidates.filter(c => c.status === 'descartado')

  const handleAdd = async () => {
    if (!newName.trim()) return
    setAdding(true)
    const result = await addCandidate(need, newName.trim(), defaultAssignee, user?.id ?? null, userDisplayName || 'Usuario')
    setAdding(false)
    if (result) {
      onCandidatesChange(prev => [result.candidate, ...prev])
      onNegotiationUpserted(result.negotiation)
      setNewName('')
    }
  }

  const handleStatusChange = async (candidate: NeedCandidate, status: CandidateStatus) => {
    if (await updateCandidateStatus(candidate.id, status)) {
      onCandidatesChange(prev => prev.map(c => c.id === candidate.id ? { ...c, status } : c))
      if (candidate.negotiation_id) onNegotiationMightHaveChanged?.()
    }
  }

  const handleRemove = async (candidate: NeedCandidate, alsoNegotiation: boolean) => {
    const ok = alsoNegotiation ? await removeCandidateAndNegotiation(candidate) : await removeCandidate(candidate.id)
    if (!ok) return
    onCandidatesChange(prev => prev.filter(c => c.id !== candidate.id))
    if (alsoNegotiation && candidate.negotiation_id) onNegotiationRemoved(candidate.negotiation_id)
  }

  const handleEnsureNegotiation = async (candidate: NeedCandidate) => {
    const negotiation = await ensureCandidateNegotiation(candidate, need, user?.id ?? null, userDisplayName || 'Usuario')
    if (negotiation) {
      onCandidatesChange(prev => prev.map(c => c.id === candidate.id ? { ...c, negotiation_id: negotiation.id } : c))
      onNegotiationUpserted(negotiation)
    }
    return negotiation
  }

  const renderRow = (candidate: NeedCandidate) => {
    const negotiation = candidate.negotiation_id != null ? negotiationsById.get(candidate.negotiation_id) ?? null : null
    return (
      <CandidateRow
        key={candidate.id}
        candidate={candidate}
        negotiation={negotiation}
        overdue={negotiation != null && overdueNegotiationIds.has(negotiation.id)}
        canLink={canLink}
        members={members}
        onStatusChange={status => handleStatusChange(candidate, status)}
        onRemove={also => handleRemove(candidate, also)}
        onLinked={(apiId, name) => onCandidatesChange(prev => prev.map(c => c.id === candidate.id
          ? { ...c, player_api_id: apiId, player_source: 'externo', player_name: name ?? c.player_name }
          : c))}
        onEnsureNegotiation={() => handleEnsureNegotiation(candidate)}
        onNegotiationUpdated={onNegotiationUpserted}
        onOpenNegotiation={onOpenNegotiation}
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold text-apple-gray-500 uppercase tracking-wider">
          {t('mercado.jugadoresPropuestos')} ({active.length})
        </p>
        {!readOnly && <p className="text-2xs text-apple-gray-400 hidden sm:block">{t('mercado.ofrecidoSeCreaNegociacion')}</p>}
      </div>

      {!readOnly && <div className="flex items-center gap-2">
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          placeholder={t('mercado.nombreJugadorPlaceholder')}
          className="input-apple text-sm flex-1"
        />
        <button
          onClick={handleAdd}
          disabled={!newName.trim() || adding}
          className="px-3 py-2 rounded-lg text-xs font-semibold text-white bg-brand-green hover:bg-emerald-600 disabled:opacity-50 flex-shrink-0"
        >
          {t('mercado.ofrecer')}
        </button>
      </div>}

      {candidates.length === 0 ? (
        <p className="text-xs text-apple-gray-400">{t('mercado.sinCandidatos')}</p>
      ) : (
        <div className="space-y-2">
          {active.map(renderRow)}
          {discarded.length > 0 && (
            <>
              <p className="pt-1 text-2xs font-semibold text-apple-gray-400 uppercase tracking-wider">
                {t('mercado.descartadosTitulo')} ({discarded.length})
              </p>
              {discarded.map(renderRow)}
            </>
          )}
        </div>
      )}
    </div>
  )
}
