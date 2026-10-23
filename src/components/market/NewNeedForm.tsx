import { useEffect, useState } from 'react'
import MobileSheet from '@/components/ui/MobileSheet'
import TeamSearchSelect from './TeamSearchSelect'
import AssigneeSelect from './AssigneeSelect'
import { createClubNeed, MARKET_POSITION_OPTIONS } from '@/services/marketService'
import { isValidFollowupDate } from '@/utils/marketAlerts'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import type { ClubNeed, MarketTeamChoice } from '@/types/market'

export default function NewNeedForm({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (need: ClubNeed) => void }) {
  const { user, userDisplayName } = useAuth()
  const { t } = useLanguage()
  const [team, setTeam] = useState<MarketTeamChoice | null>(null)
  const [positionLabel, setPositionLabel] = useState('')
  const [assigneeId, setAssigneeId] = useState<number | null>(null)
  const [assigneeName, setAssigneeName] = useState('')
  const [followupDate, setFollowupDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const canSave = team != null && positionLabel.trim().length > 0

  // Reiniciar el formulario cada vez que se abre la hoja: MobileSheet no desmonta
  // sus hijos al cerrar (retorna null visualmente pero mantiene el árbol montado),
  // así que sin este efecto el estado local sobrevive a un cierre por backdrop
  // sin guardar y reaparece con datos de un intento abandonado al reabrir.
  useEffect(() => {
    if (!open) return
    setTeam(null)
    setPositionLabel('')
    setAssigneeId(null)
    setAssigneeName('')
    setFollowupDate('')
    setSaving(false)
    setError('')
  }, [open])

  const handleSave = async () => {
    if (!team || !positionLabel.trim()) return
    setSaving(true)
    setError('')
    const result = await createClubNeed(
      {
        team_id: team.id,
        team_name: team.name,
        team_logo: team.logo,
        position_label: positionLabel.trim(),
        assigned_to_id: assigneeId,
        assigned_to_name: assigneeName || null,
        next_followup_date: followupDate && isValidFollowupDate(followupDate) ? followupDate : null,
      },
      user?.id ?? null,
      userDisplayName || 'Usuario',
    )
    setSaving(false)
    if (!result) { setError(t('mercado.errorGuardar')); return }
    onCreated(result)
    setTeam(null)
    setPositionLabel('')
    setAssigneeId(null)
    setAssigneeName('')
    setFollowupDate('')
    onClose()
  }

  return (
    <MobileSheet open={open} onClose={onClose} title={t('mercado.nuevoObjetivo')}>
      <div className="space-y-4 p-4">
        <div>
          <label className="block text-xs font-medium text-apple-gray-500 mb-1.5">{t('mercado.club')} *</label>
          <TeamSearchSelect value={team} onChange={setTeam} onCustom={name => setTeam({ id: null, name, logo: null })} />
        </div>
        <div>
          <label className="block text-xs font-medium text-apple-gray-500 mb-1.5">{t('mercado.queBusca')} *</label>
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
        <div>
          <label className="block text-xs font-medium text-apple-gray-500 mb-1.5">{t('mercado.responsableBusqueda')}</label>
          <AssigneeSelect value={assigneeId} onChange={(id, name) => { setAssigneeId(id); setAssigneeName(name) }} />
        </div>
        <div>
          <label className="block text-xs font-medium text-apple-gray-500 mb-1.5">{t('mercado.volverAHablar')}</label>
          <input
            type="date"
            value={followupDate}
            onChange={e => setFollowupDate(e.target.value)}
            min="2020-01-01"
            max="2100-12-31"
            className="input-apple text-sm w-full"
          />
        </div>
        {error && <p className="text-xs text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>}
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-brand-green hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {saving ? t('mercado.guardando') : t('mercado.guardarObjetivo')}
        </button>
      </div>
    </MobileSheet>
  )
}
