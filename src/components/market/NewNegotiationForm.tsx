import { useEffect, useState } from 'react'
import MobileSheet from '@/components/ui/MobileSheet'
import TeamSearchSelect from './TeamSearchSelect'
import AssigneeSelect from './AssigneeSelect'
import ClubContactsField from './ClubContactsField'
import { NEGOTIATION_STATUS_ORDER, NEGOTIATION_STATUS_LABEL_KEY } from './marketLabels'
import { createNegotiation, addNoteTo, MARKET_POSITION_OPTIONS } from '@/services/marketService'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import type { Negotiation, NegotiationStatus, MarketTeamChoice, ClubContact } from '@/types/market'

const EMPTY_CONTACTS: ClubContact[] = [{ name: '', role: null }]

export default function NewNegotiationForm({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (negotiation: Negotiation) => void }) {
  const { user, userDisplayName } = useAuth()
  const { t } = useLanguage()

  const [playerName, setPlayerName] = useState('')
  const [positionLabel, setPositionLabel] = useState('')

  const [isFreeAgent, setIsFreeAgent] = useState(false)
  const [currentTeam, setCurrentTeam] = useState<MarketTeamChoice | null>(null)
  const [currentContacts, setCurrentContacts] = useState<ClubContact[]>(EMPTY_CONTACTS)

  const [noTargetYet, setNoTargetYet] = useState(false)
  const [targetTeam, setTargetTeam] = useState<MarketTeamChoice | null>(null)
  const [targetContacts, setTargetContacts] = useState<ClubContact[]>(EMPTY_CONTACTS)

  const [belongsToAgency, setBelongsToAgency] = useState<boolean | null>(null)
  const [agentName, setAgentName] = useState('')

  const [status, setStatus] = useState<NegotiationStatus>('ofrecido')
  const [assigneeId, setAssigneeId] = useState<number | null>(null)
  const [assigneeName, setAssigneeName] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const canSave = playerName.trim().length > 0
    && positionLabel.trim().length > 0
    && (isFreeAgent || currentTeam != null || noTargetYet || targetTeam != null)
    && belongsToAgency != null

  // Reiniciar el formulario cada vez que se abre la hoja: MobileSheet no desmonta
  // sus hijos al cerrar (retorna null visualmente pero mantiene el árbol montado),
  // así que sin este efecto el estado local sobrevive a un cierre por backdrop
  // sin guardar y reaparece con datos de un intento abandonado al reabrir.
  useEffect(() => {
    if (!open) return
    setPlayerName('')
    setPositionLabel('')
    setIsFreeAgent(false)
    setCurrentTeam(null)
    setCurrentContacts(EMPTY_CONTACTS)
    setNoTargetYet(false)
    setTargetTeam(null)
    setTargetContacts(EMPTY_CONTACTS)
    setBelongsToAgency(null)
    setAgentName('')
    setStatus('ofrecido')
    setAssigneeId(null)
    setAssigneeName('')
    setNotes('')
    setSaving(false)
    setError('')
  }, [open])

  const cleanContacts = (contacts: ClubContact[]): ClubContact[] =>
    contacts
      .filter(c => c.name.trim().length > 0)
      .map(c => ({ name: c.name.trim(), role: c.role?.trim() || null }))

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    setError('')
    const result = await createNegotiation(
      {
        team_id: noTargetYet ? null : (targetTeam?.id ?? null),
        team_name: noTargetYet ? null : (targetTeam?.name ?? null),
        team_logo: noTargetYet ? null : (targetTeam?.logo ?? null),
        current_team_id: isFreeAgent ? null : (currentTeam?.id ?? null),
        current_team_name: isFreeAgent ? null : (currentTeam?.name ?? null),
        current_team_logo: isFreeAgent ? null : (currentTeam?.logo ?? null),
        player_name: playerName.trim(),
        player_api_id: null,
        player_source: null,
        position_label: positionLabel || null,
        belongs_to_agency: belongsToAgency,
        agent_name: belongsToAgency ? null : (agentName.trim() || null),
        target_club_contacts: noTargetYet ? [] : cleanContacts(targetContacts),
        current_club_contacts: isFreeAgent ? [] : cleanContacts(currentContacts),
        status,
        assigned_to_id: assigneeId,
        assigned_to_name: assigneeName || null,
      },
      user?.id ?? null,
      userDisplayName || 'Usuario',
    )
    if (!result) { setSaving(false); setError(t('mercado.errorGuardar')); return }
    if (notes.trim()) {
      await addNoteTo({ negotiationId: result.id }, notes.trim(), false, null, user?.id ?? null, userDisplayName || 'Usuario')
    }
    setSaving(false)
    onCreated(result)
    onClose()
  }

  return (
    <MobileSheet open={open} onClose={onClose} title={t('mercado.nuevaNegociacion')}>
      <div className="space-y-4 p-4">
        <div>
          <label className="block text-xs font-medium text-apple-gray-500 mb-1.5">{t('mercado.jugador')} *</label>
          <input
            type="text"
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            placeholder={t('mercado.nombreJugadorPlaceholder')}
            className="input-apple text-sm w-full"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-apple-gray-500 mb-1.5">{t('mercado.posicion')} *</label>
          <select
            value={positionLabel}
            onChange={e => setPositionLabel(e.target.value)}
            className="input-apple text-sm w-full"
          >
            <option value="" disabled>{t('mercado.posicionSinEspecificar')}</option>
            {MARKET_POSITION_OPTIONS.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {/* Club actual */}
        <div className="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-medium text-apple-gray-500">{t('mercado.clubActual')}</label>
            <label className="flex items-center gap-1.5 text-2xs text-apple-gray-500 cursor-pointer">
              <input type="checkbox" checked={isFreeAgent} onChange={e => { setIsFreeAgent(e.target.checked); if (e.target.checked) setCurrentTeam(null) }} className="rounded" />
              {t('mercado.jugadorLibre')}
            </label>
          </div>
          {!isFreeAgent && (
            <>
              <TeamSearchSelect value={currentTeam} onChange={setCurrentTeam} onCustom={name => setCurrentTeam({ id: null, name, logo: null })} />
              <ClubContactsField value={currentContacts} onChange={setCurrentContacts} />
            </>
          )}
        </div>

        {/* Club destino */}
        <div className="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-medium text-apple-gray-500">{t('mercado.clubDestino')}</label>
            <label className="flex items-center gap-1.5 text-2xs text-apple-gray-500 cursor-pointer">
              <input type="checkbox" checked={noTargetYet} onChange={e => { setNoTargetYet(e.target.checked); if (e.target.checked) setTargetTeam(null) }} className="rounded" />
              {t('mercado.soloLiberarlo')}
            </label>
          </div>
          {!noTargetYet && (
            <>
              <TeamSearchSelect value={targetTeam} onChange={setTargetTeam} onCustom={name => setTargetTeam({ id: null, name, logo: null })} />
              <ClubContactsField value={targetContacts} onChange={setTargetContacts} />
            </>
          )}
        </div>

        {/* Pertenencia a la agencia */}
        <div>
          <label className="block text-xs font-medium text-apple-gray-500 mb-1.5">{t('mercado.perteneceDobleG')} *</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setBelongsToAgency(true)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${belongsToAgency === true ? 'bg-brand-green text-white border-brand-green' : 'border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-500'}`}
            >
              {t('mercado.si')}
            </button>
            <button
              type="button"
              onClick={() => setBelongsToAgency(false)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${belongsToAgency === false ? 'bg-brand-green text-white border-brand-green' : 'border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-500'}`}
            >
              {t('mercado.no')}
            </button>
          </div>
          {belongsToAgency === false && (
            <input
              type="text"
              value={agentName}
              onChange={e => setAgentName(e.target.value)}
              placeholder={t('mercado.representantePlaceholder')}
              className="input-apple text-sm w-full mt-2"
            />
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-apple-gray-500 mb-1.5">{t('mercado.estado')}</label>
          <select
            value={status}
            onChange={e => setStatus(e.target.value as NegotiationStatus)}
            className="input-apple text-sm w-full"
          >
            {NEGOTIATION_STATUS_ORDER.map(s => (
              <option key={s} value={s}>{t(NEGOTIATION_STATUS_LABEL_KEY[s])}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-apple-gray-500 mb-1.5">{t('mercado.responsableNegociacion')}</label>
          <AssigneeSelect value={assigneeId} onChange={(id, name) => { setAssigneeId(id); setAssigneeName(name) }} />
        </div>

        <div>
          <label className="block text-xs font-medium text-apple-gray-500 mb-1.5">{t('mercado.notas')}</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder={t('mercado.escribirNota')}
            rows={2}
            className="input-apple text-sm w-full resize-none"
          />
        </div>

        {error && <p className="text-xs text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>}
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-brand-green hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {saving ? t('mercado.guardando') : t('mercado.guardarNegociacion')}
        </button>
      </div>
    </MobileSheet>
  )
}
