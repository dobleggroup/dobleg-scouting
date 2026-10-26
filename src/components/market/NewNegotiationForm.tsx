import { useEffect, useState } from 'react'
import MobileSheet from '@/components/ui/MobileSheet'
import AssigneeSelect from './AssigneeSelect'
import { createNegotiation, addNoteTo } from '@/services/marketService'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import type { Negotiation } from '@/types/market'
import RequiredMark from '@/components/ui/RequiredMark'

// Formulario corto a propósito (como el de Búsquedas): jugador, a qué club se
// ofrece (escrito a mano), si es nuestro y quién la lleva. Club actual,
// posición y con quién se habló se completan después, al abrir la negociación;
// el vínculo con el jugador y el club real lo hacen Marcos o Mati.
export default function NewNegotiationForm({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (negotiation: Negotiation) => void }) {
  const { user, userDisplayName } = useAuth()
  const { t } = useLanguage()

  const [playerName, setPlayerName] = useState('')
  const [clubName, setClubName] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactRole, setContactRole] = useState('')
  const [belongsToAgency, setBelongsToAgency] = useState<boolean | null>(null)
  const [agentName, setAgentName] = useState('')
  const [assigneeId, setAssigneeId] = useState<number | null>(null)
  const [assigneeName, setAssigneeName] = useState('')
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const canSave = playerName.trim().length > 0 && clubName.trim().length > 0 && belongsToAgency != null

  // MobileSheet no desmonta sus hijos al cerrar: sin esto, un intento
  // abandonado reaparece al volver a abrir.
  useEffect(() => {
    if (!open) return
    setPlayerName('')
    setClubName('')
    setContactName('')
    setContactRole('')
    setBelongsToAgency(null)
    setAgentName('')
    setAssigneeId(null)
    setAssigneeName('')
    setComment('')
    setSaving(false)
    setError('')
  }, [open])

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    setError('')
    const result = await createNegotiation(
      {
        team_id: null,
        team_name: clubName.trim(),
        team_logo: null,
        current_team_id: null,
        current_team_name: null,
        current_team_logo: null,
        player_name: playerName.trim(),
        player_api_id: null,
        player_source: null,
        position_label: null,
        belongs_to_agency: belongsToAgency,
        agent_name: belongsToAgency ? null : (agentName.trim() || null),
        target_club_contacts: contactName.trim() ? [{ name: contactName.trim(), role: contactRole.trim() || null }] : [],
        current_club_contacts: [],
        status: 'ofrecido',
        assigned_to_id: assigneeId,
        assigned_to_name: assigneeName || null,
      },
      user?.id ?? null,
      userDisplayName || 'Usuario',
    )
    if (!result) { setSaving(false); setError(t('mercado.errorGuardar')); return }
    if (comment.trim()) {
      await addNoteTo({ negotiationId: result.id }, comment.trim(), false, null, user?.id ?? null, userDisplayName || 'Usuario')
    }
    setSaving(false)
    onCreated(result)
    onClose()
  }

  const choice = (selected: boolean) =>
    `flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${selected
      ? 'bg-brand-green text-white border-brand-green'
      : 'border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-700 dark:text-apple-gray-200 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/40'}`

  return (
    <MobileSheet open={open} onClose={onClose} title={t('mercado.nuevaNegociacion')}>
      <div className="space-y-4 p-4">
        <div>
          <label className="block text-sm font-medium text-apple-gray-700 dark:text-apple-gray-200 mb-1.5">{t('mercado.jugador')}<RequiredMark /></label>
          <input
            type="text"
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            placeholder={t('mercado.nombreJugadorPlaceholder')}
            className="input-apple text-sm w-full"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-apple-gray-700 dark:text-apple-gray-200 mb-1.5">{t('mercado.clubAlQueSeOfrece')}<RequiredMark /></label>
          <input
            type="text"
            value={clubName}
            onChange={e => setClubName(e.target.value)}
            placeholder={t('mercado.clubPlaceholderLibre')}
            className="input-apple text-sm w-full"
          />
          <p className="text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mt-3 mb-1.5">{t('mercado.conQuienSeHablo')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              value={contactName}
              onChange={e => setContactName(e.target.value)}
              placeholder={t('mercado.contactoNombrePlaceholder')}
              className="input-apple text-sm w-full"
            />
            <input
              type="text"
              value={contactRole}
              onChange={e => setContactRole(e.target.value)}
              placeholder={t('mercado.contactoCargoPlaceholder')}
              className="input-apple text-sm w-full"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-apple-gray-700 dark:text-apple-gray-200 mb-1.5">{t('mercado.perteneceDobleG')}<RequiredMark /></label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setBelongsToAgency(true)} className={choice(belongsToAgency === true)}>
              {t('mercado.si')}
            </button>
            <button type="button" onClick={() => setBelongsToAgency(false)} className={choice(belongsToAgency === false)}>
              {t('mercado.noOtroRepresentante')}
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
          <label className="block text-sm font-medium text-apple-gray-700 dark:text-apple-gray-200 mb-1.5">{t('mercado.quienLaLleva')}</label>
          <AssigneeSelect value={assigneeId} onChange={(id, name) => { setAssigneeId(id); setAssigneeName(name) }} />
        </div>

        <div>
          <label className="block text-sm font-medium text-apple-gray-700 dark:text-apple-gray-200 mb-1.5">{t('mercado.comentarioOpcional')}</label>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            rows={2}
            className="input-apple text-sm w-full resize-none"
          />
        </div>

        {error && <p className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>}
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="w-full py-3 rounded-xl text-sm font-semibold text-white bg-brand-green hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {saving ? t('mercado.guardando') : t('mercado.guardarNegociacion')}
        </button>
      </div>
    </MobileSheet>
  )
}
