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
import { NEGOTIATION_STATUS_LABEL_KEY, NEGOTIATION_STATUS_COLOR, NEGOTIATION_STATUS_ORDER } from './marketLabels'
import { buildPlayerPhotoUrl } from '@/utils/marketAlerts'
import { useLinkedPlayerAge } from '@/hooks/useLinkedPlayerAge'
import { updateNegotiationStatus, updateFollowupDate, reassignNegotiation, linkNegotiationPlayer, updateNegotiationFields, isMarketLinkAdmin, setNegotiationHidden } from '@/services/marketService'
import type { Negotiation, NegotiationStatus } from '@/types/market'

/**
 * Un dato que se completa después de crear la negociación. Siempre se ve si
 * está guardado: botón "Guardar" mientras hay cambios y "✓ Guardado" después
 * (también guarda con Enter).
 */
function SavedTextField({ label, value, placeholder, onSave }: {
  label: string
  value: string
  placeholder: string
  onSave: (next: string) => Promise<boolean>
}) {
  const { t } = useLanguage()
  const [draft, setDraft] = useState(value)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  useEffect(() => { setDraft(value) }, [value])
  const dirty = draft.trim() !== value.trim()

  const save = async () => {
    if (!dirty || state === 'saving') return
    setState('saving')
    setState(await onSave(draft.trim()) ? 'saved' : 'error')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-semibold text-apple-gray-600 dark:text-apple-gray-300">{label}</label>
        {state === 'error'
          ? <span className="text-xs font-medium text-red-600 dark:text-red-400">{t('mercado.errorGuardar')}</span>
          : !dirty && state === 'saved' && <span className="text-xs font-medium text-brand-green">✓ {t('mercado.guardado')}</span>}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={e => { setDraft(e.target.value); if (state !== 'saving') setState('idle') }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save() } }}
          placeholder={placeholder}
          className="input-apple text-sm flex-1 min-w-0"
        />
        {dirty && (
          <button
            type="button"
            onClick={save}
            disabled={state === 'saving'}
            className="px-4 rounded-apple text-sm font-semibold text-white bg-brand-green hover:bg-emerald-600 disabled:opacity-60 transition-colors flex-shrink-0"
          >
            {state === 'saving' ? t('mercado.guardando') : t('mercado.guardar')}
          </button>
        )}
      </div>
    </div>
  )
}

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

  const isHidden = !!negotiation.hidden_at
  const handleToggleHidden = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isHidden && !confirm(t('mercado.confirmarOcultar').replace('{jugador}', negotiation.player_name))) return
    const name = userDisplayName || 'Usuario'
    if (await setNegotiationHidden(negotiation.id, !isHidden, name)) {
      onUpdated({ ...negotiation, hidden_at: isHidden ? null : new Date().toISOString(), hidden_by_name: isHidden ? null : name })
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

  const saveFields = async (patch: Parameters<typeof updateNegotiationFields>[1]) => {
    const ok = await updateNegotiationFields(negotiation.id, patch)
    if (ok) onUpdated({ ...negotiation, ...patch })
    return ok
  }
  const contactsText = negotiation.target_club_contacts.map(c => (c.role ? `${c.name}, ${c.role}` : c.name)).join(' · ')

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
      } ${defaultExpanded || flash ? 'border-brand-green ring-1 ring-brand-green/30' : 'border-apple-gray-200 dark:border-apple-gray-700'} ${negotiation.hidden_at ? 'opacity-60' : ''}`}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(e => !e)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(x => !x) } }}
        className="w-full flex flex-col gap-2 sm:grid sm:grid-cols-[auto_minmax(0,2fr)_7rem_7rem_5.5rem_2rem] sm:items-center sm:gap-3 px-4 py-3 sm:py-3.5 text-left hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/40 transition-colors font-sans cursor-pointer"
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
                {[negotiation.current_team_name, negotiation.team_name].filter(Boolean).join(' → ')}
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
          <button
            type="button"
            onClick={handleToggleHidden}
            title={isHidden ? t('mercado.volverAMostrar') : t('mercado.ocultarNegociacion')}
            aria-label={isHidden ? t('mercado.volverAMostrar') : t('mercado.ocultarNegociacion')}
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${isHidden
              ? 'text-brand-green hover:bg-brand-green/10'
              : 'text-apple-gray-300 dark:text-apple-gray-600 hover:text-red-500 hover:bg-red-500/10'}`}
          >
            {isHidden ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            )}
          </button>
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
            <SavedTextField
              label={t('mercado.clubActual')}
              value={negotiation.current_team_name ?? ''}
              placeholder={t('mercado.clubActualPlaceholder')}
              onSave={next => saveFields({ current_team_name: next || null, current_team_id: null, current_team_logo: null })}
            />
            <SavedTextField
              label={t('mercado.posicionLibre')}
              value={negotiation.position_label ?? ''}
              placeholder={t('mercado.posicionPlaceholderLibre')}
              onSave={next => saveFields({ position_label: next || null })}
            />
            <SavedTextField
              label={`${t('mercado.hablamosCon')}${negotiation.team_name ? ` (${negotiation.team_name})` : ''}`}
              value={contactsText}
              placeholder={t('mercado.hablamosConPlaceholder')}
              onSave={next => saveFields({ target_club_contacts: next ? [{ name: next, role: null }] : [] })}
            />
            <div>
              <p className="text-xs font-semibold text-apple-gray-600 dark:text-apple-gray-300 mb-1">{t('mercado.perteneceDobleG')}</p>
              <p className="text-sm text-apple-gray-800 dark:text-apple-gray-100 py-2">
                {negotiation.belongs_to_agency == null ? '—' : negotiation.belongs_to_agency ? t('mercado.si') : (negotiation.agent_name ? `${t('mercado.no')} · ${negotiation.agent_name}` : t('mercado.no'))}
              </p>
            </div>
          </div>

          {/* Quién la lleva: solo en las que se armaron desde Negociaciones (las
              que salen de una búsqueda no tienen responsable). */}
          {(!negotiation.need_id || negotiation.assigned_to_id) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-apple-gray-700 dark:text-apple-gray-200 min-w-0 truncate">
                  <span className="text-xs font-semibold text-apple-gray-600 dark:text-apple-gray-300">{t('mercado.quienLaLlevaCorto')}: </span>
                  {negotiation.assigned_to_name || t('mercado.sinAsignar')}
                </p>
                <button onClick={() => setReassigning(r => !r)} className="text-sm font-medium text-brand-green hover:text-emerald-600 flex-shrink-0">
                  {reassigning ? t('mercado.cancelar') : negotiation.assigned_to_id ? t('mercado.reasignar') : t('mercado.asignar')}
                </button>
              </div>
              {reassigning && <AssigneeSelect value={negotiation.assigned_to_id} onChange={handleReassign} />}
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
