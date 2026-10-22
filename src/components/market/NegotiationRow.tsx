import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { PlayerPhoto } from '@/components/ui/PlayerPhoto'
import ClubTransferBadge from './ClubTransferBadge'
import AssigneeSelect from './AssigneeSelect'
import PlayerLinkField from './PlayerLinkField'
import MarketNotesPanel from './MarketNotesPanel'
import StatusPill from './StatusPill'
import FollowupDateField from './FollowupDateField'
import ClubContactsField from './ClubContactsField'
import { NEGOTIATION_STATUS_LABEL_KEY, NEGOTIATION_STATUS_COLOR, NEGOTIATION_STATUS_ORDER, NEGOTIATION_STATUS_ACCENT } from './marketLabels'
import { buildPlayerPhotoUrl } from '@/utils/marketAlerts'
import { useLinkedPlayerAge } from '@/hooks/useLinkedPlayerAge'
import { updateNegotiationStatus, updateFollowupDate, reassignNegotiation, linkNegotiationPlayer, updateNegotiationTargetContacts, isMarketLinkAdmin } from '@/services/marketService'
import type { ClubContact, Negotiation, NegotiationStatus } from '@/types/market'

export default function NegotiationRow({
  negotiation,
  onUpdated,
  defaultExpanded = false,
  overdue = false,
  flash = false,
  onNeedMightHaveChanged,
}: {
  negotiation: Negotiation
  onUpdated: (n: Negotiation) => void
  defaultExpanded?: boolean
  overdue?: boolean
  /** Resalte momentáneo al llegar desde el calendario semanal, para ubicar
   * la fila sin forzar que se expanda. */
  flash?: boolean
  /** Un cambio de estado acá se sincroniza server-side al candidato de la
   * búsqueda vinculada (si hay una) — se llama para que esa lista hermana no
   * quede desactualizada en pantalla. Ver [[market_negotiation_need_link]]. */
  onNeedMightHaveChanged?: () => void
}) {
  const { user, userDisplayName } = useAuth()
  const { t } = useLanguage()
  const [expanded, setExpanded] = useState(defaultExpanded)
  const rowRef = useRef<HTMLDivElement>(null)

  // Reacciona a `defaultExpanded` (no solo al montaje): si ya estabas en esta
  // página y tocás otra notificación de la campanita, la fila que corresponde
  // recién ahora pasa a `defaultExpanded=true` sin que el componente se
  // remonte — sin este efecto dependiendo del valor, ni se expandía ni
  // scrolleaba.
  useEffect(() => {
    if (defaultExpanded) {
      setExpanded(true)
      rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [defaultExpanded])
  const [reassigning, setReassigning] = useState(false)
  const [linking, setLinking] = useState(false)
  const [pendingApiId, setPendingApiId] = useState<number | null>(null)
  const [pendingIdentity, setPendingIdentity] = useState<{ name: string; age: number | null } | null>(null)
  const [notesRefreshSignal, setNotesRefreshSignal] = useState(0)
  const [editingContacts, setEditingContacts] = useState(false)
  const [contactsDraft, setContactsDraft] = useState<ClubContact[]>([])

  const canLink = isMarketLinkAdmin(user?.email)
  const age = useLinkedPlayerAge(negotiation.player_api_id)
  const photoUrl = buildPlayerPhotoUrl(negotiation.player_api_id)
  const negotiationStatusLabels = Object.fromEntries(
    NEGOTIATION_STATUS_ORDER.map(s => [s, t(NEGOTIATION_STATUS_LABEL_KEY[s])]),
  ) as Record<NegotiationStatus, string>

  const handleStatusChange = async (status: NegotiationStatus) => {
    const ok = await updateNegotiationStatus(negotiation.id, status)
    if (ok) {
      onUpdated({ ...negotiation, status })
      if (negotiation.need_id) onNeedMightHaveChanged?.()
    }
  }

  const handleFollowupChange = async (date: string | null) => {
    const ok = await updateFollowupDate({ negotiationId: negotiation.id }, date)
    if (ok) onUpdated({ ...negotiation, next_followup_date: date })
  }

  const handleReassign = async (id: number, name: string) => {
    const ok = await reassignNegotiation(negotiation.id, id, name, user?.id ?? null, userDisplayName || 'Usuario')
    if (ok) {
      onUpdated({ ...negotiation, assigned_to_id: id, assigned_to_name: name })
      setReassigning(false)
      setNotesRefreshSignal(s => s + 1)
    }
  }

  const handleSaveContacts = async () => {
    const cleaned = contactsDraft
      .map(c => ({ name: c.name.trim(), role: c.role?.trim() || null }))
      .filter(c => c.name)
    if (await updateNegotiationTargetContacts(negotiation.id, cleaned)) {
      onUpdated({ ...negotiation, target_club_contacts: cleaned })
      setEditingContacts(false)
    }
  }

  const openLinking = () => {
    setPendingApiId(negotiation.player_api_id)
    setPendingIdentity(null)
    setLinking(l => !l)
  }

  const handleSaveLink = async () => {
    if (pendingApiId == null) return
    const ok = await linkNegotiationPlayer(negotiation.id, pendingApiId, 'externo', pendingIdentity?.name)
    if (ok) {
      onUpdated({
        ...negotiation,
        player_api_id: pendingApiId,
        player_source: 'externo',
        player_name: pendingIdentity?.name ?? negotiation.player_name,
      })
      setLinking(false)
    }
  }

  return (
    <div
      ref={rowRef}
      id={`market-negotiation-${negotiation.id}`}
      className={`rounded-xl border overflow-hidden transition-all ${
        negotiation.status === 'cerrado_caido' ? 'bg-apple-gray-50 dark:bg-apple-gray-800/40 border-dashed' : 'bg-white dark:bg-apple-gray-800'
      } ${defaultExpanded || flash ? 'border-brand-green ring-1 ring-brand-green/30' : 'border-apple-gray-200 dark:border-apple-gray-700'}`}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(e => !e)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(x => !x) } }}
        className="w-full flex flex-col gap-2 sm:grid sm:grid-cols-[auto_minmax(0,2fr)_7rem_7rem_5.5rem] sm:items-center sm:gap-3 px-4 py-3 sm:py-3.5 text-left hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/40 transition-colors font-sans cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0 sm:contents">
          <div className="flex items-center gap-2 flex-shrink-0">
            <ClubTransferBadge
              currentLogo={negotiation.current_team_logo}
              currentName={negotiation.current_team_name}
              targetLogo={negotiation.team_logo}
              targetName={negotiation.team_name}
            />
          </div>

          <div className="flex items-center gap-2 min-w-0 flex-1 sm:flex-none">
            <PlayerPhoto src={photoUrl} name={negotiation.player_name} size="sm" />
            <div className="min-w-0">
              <p className={`font-semibold text-sm truncate ${negotiation.status === 'cerrado_caido' ? 'text-apple-gray-400 line-through decoration-apple-gray-300' : 'text-apple-gray-800 dark:text-white'}`}>
                {negotiation.player_name}
                {age != null && <span className="font-normal text-apple-gray-400">, {age} {t('externo.anios')}</span>}
              </p>
              <p className="text-2xs text-apple-gray-400 truncate">
                {negotiation.current_team_name ?? t('mercado.jugadorLibre')} → {negotiation.team_name ?? t('mercado.quedaLibre')}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap pl-[3.25rem] sm:pl-0 sm:contents">
          <StatusPill
            value={negotiation.status}
            options={NEGOTIATION_STATUS_ORDER}
            labels={negotiationStatusLabels}
            colors={NEGOTIATION_STATUS_COLOR}
            onChange={handleStatusChange}
            title={t('mercado.cambiarEstado')}
          />
          <span className="text-xs text-apple-gray-500 dark:text-apple-gray-400 truncate min-w-0">{negotiation.assigned_to_name || '—'}</span>
          <div className="ml-auto sm:ml-0 sm:text-right">
            <FollowupDateField value={negotiation.next_followup_date} overdue={overdue} onChange={handleFollowupChange} />
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-apple-gray-100 dark:border-apple-gray-700 space-y-4">
          {negotiation.need_id && (
            <p className="text-2xs text-apple-gray-400 pt-3 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l3-3a4 4 0 015.656 5.656l-1.5 1.5" />
              </svg>
              {t('mercado.vinculadaBusqueda')} {negotiation.team_name} · {negotiation.position_label}
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
            <div>
              <label className="block text-2xs font-medium text-apple-gray-400 mb-1">{t('mercado.estado')}</label>
              <select
                value={negotiation.status}
                onChange={e => handleStatusChange(e.target.value as NegotiationStatus)}
                className={`input-apple text-sm w-full ${NEGOTIATION_STATUS_ACCENT[negotiation.status]}`}
              >
                {(Object.keys(NEGOTIATION_STATUS_LABEL_KEY) as NegotiationStatus[]).map(s => (
                  <option key={s} value={s}>{t(NEGOTIATION_STATUS_LABEL_KEY[s])}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end justify-between gap-2">
              <div className="min-w-0">
                <p className="text-2xs font-medium text-apple-gray-400 mb-1">{t('mercado.responsableNegociacion')}</p>
                <p className="text-sm text-apple-gray-700 dark:text-apple-gray-200 truncate">{negotiation.assigned_to_name || t('mercado.sinAsignar')}</p>
              </div>
              <button onClick={() => setReassigning(r => !r)} className="text-xs font-medium text-brand-green hover:text-emerald-600 flex-shrink-0">
                {t('mercado.reasignar')}
              </button>
            </div>
            {reassigning && <div className="sm:col-span-2"><AssigneeSelect value={negotiation.assigned_to_id} onChange={handleReassign} /></div>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-2xs font-medium text-apple-gray-400 mb-0.5">{t('mercado.perteneceDobleG')}</p>
              <p className="text-apple-gray-700 dark:text-apple-gray-200">
                {negotiation.belongs_to_agency == null ? '—' : negotiation.belongs_to_agency ? t('mercado.si') : (negotiation.agent_name || t('mercado.no'))}
              </p>
            </div>
            <div>
              <p className="text-2xs font-medium text-apple-gray-400 mb-0.5">{t('mercado.contactoClubActual')}</p>
              {negotiation.current_club_contacts.length === 0 ? (
                <p className="text-apple-gray-700 dark:text-apple-gray-200">—</p>
              ) : negotiation.current_club_contacts.map((c, i) => (
                <p key={i} className="text-apple-gray-700 dark:text-apple-gray-200">{c.name}{c.role ? ` · ${c.role}` : ''}</p>
              ))}
            </div>
            <div>
              <p className="text-2xs font-medium text-apple-gray-400 mb-0.5 flex items-center gap-2">
                {t('mercado.hablamosCon')}{negotiation.team_name ? ` (${negotiation.team_name})` : ''}
                {!editingContacts && (
                  <button
                    onClick={() => { setContactsDraft(negotiation.target_club_contacts); setEditingContacts(true) }}
                    className="font-medium text-brand-green hover:text-emerald-600"
                  >
                    {t('mercado.editar')}
                  </button>
                )}
              </p>
              {negotiation.target_club_contacts.length === 0 ? (
                <p className="text-apple-gray-700 dark:text-apple-gray-200">—</p>
              ) : negotiation.target_club_contacts.map((c, i) => (
                <p key={i} className="text-apple-gray-700 dark:text-apple-gray-200">{c.name}{c.role ? ` · ${c.role}` : ''}</p>
              ))}
            </div>
          </div>

          {editingContacts && (
            <div className="space-y-2 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-800/50 p-3">
              <ClubContactsField value={contactsDraft} onChange={setContactsDraft} />
              <div className="flex items-center gap-3">
                <button onClick={handleSaveContacts} className="text-xs font-semibold text-white bg-brand-green px-3 py-1.5 rounded-lg hover:bg-emerald-600">
                  {t('mercado.guardar')}
                </button>
                <button onClick={() => setEditingContacts(false)} className="text-xs text-apple-gray-400 hover:text-apple-gray-700 dark:hover:text-white">
                  {t('mercado.cancelar')}
                </button>
              </div>
            </div>
          )}

          {canLink && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xs text-apple-gray-400">
                  {negotiation.player_api_id ? t('mercado.vinculadoApi').replace('{id}', String(negotiation.player_api_id)) : t('mercado.sinVincularApi')}
                </p>
                <button onClick={openLinking} className="text-xs font-medium text-brand-green hover:text-emerald-600 flex-shrink-0">
                  {t('mercado.vincularJugador')}
                </button>
              </div>
              {linking && (
                <div className="space-y-2">
                  <PlayerLinkField
                    playerName={negotiation.player_name}
                    playerApiId={pendingApiId}
                    onChange={setPendingApiId}
                    onResolved={setPendingIdentity}
                  />
                  <button
                    onClick={handleSaveLink}
                    disabled={pendingApiId == null}
                    className="text-xs font-semibold text-white bg-brand-green px-3 py-1.5 rounded-lg hover:bg-emerald-600 disabled:opacity-50"
                  >
                    {t('mercado.guardarVinculo')}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="pt-2 border-t border-apple-gray-100 dark:border-apple-gray-700">
            <MarketNotesPanel
              target={{ negotiationId: negotiation.id }}
              refreshSignal={notesRefreshSignal}
            />
          </div>
        </div>
      )}
    </div>
  )
}
