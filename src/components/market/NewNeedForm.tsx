import { useEffect, useState } from 'react'
import MobileSheet from '@/components/ui/MobileSheet'
import { createClubNeed, addNoteTo } from '@/services/marketService'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import type { ClubNeed } from '@/types/market'

// Formulario corto a propósito: se escribe el club y lo que busca, tal cual
// ("Necaxa" / "un 5, un 9 y un defensor central"). El club queda sin vincular
// (team_id null) y se vincula después; responsable, fecha y candidatos se
// cargan desde la fila.
export default function NewNeedForm({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (need: ClubNeed) => void }) {
  const { user, userDisplayName } = useAuth()
  const { t } = useLanguage()
  const [clubName, setClubName] = useState('')
  const [positions, setPositions] = useState('')
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const canSave = clubName.trim().length > 0 && positions.trim().length > 0

  // Reiniciar el formulario cada vez que se abre la hoja: MobileSheet no desmonta
  // sus hijos al cerrar (retorna null visualmente pero mantiene el árbol montado),
  // así que sin este efecto el estado local sobrevive a un cierre por backdrop
  // sin guardar y reaparece con datos de un intento abandonado al reabrir.
  useEffect(() => {
    if (!open) return
    setClubName('')
    setPositions('')
    setComment('')
    setSaving(false)
    setError('')
  }, [open])

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    setError('')
    const result = await createClubNeed(
      {
        team_id: null,
        team_name: clubName.trim(),
        team_logo: null,
        position_label: positions.trim(),
        assigned_to_id: null,
        assigned_to_name: null,
        next_followup_date: null,
      },
      user?.id ?? null,
      userDisplayName || 'Usuario',
    )
    if (!result) { setSaving(false); setError(t('mercado.errorGuardar')); return }
    if (comment.trim()) await addNoteTo({ needId: result.id }, comment.trim(), false, null, user?.id ?? null, userDisplayName || 'Usuario')
    setSaving(false)
    onCreated(result)
    onClose()
  }

  return (
    <MobileSheet open={open} onClose={onClose} title={t('mercado.nuevoObjetivo')}>
      <div className="space-y-4 p-4">
        <div>
          <label className="block text-xs font-medium text-apple-gray-500 mb-1.5">{t('mercado.club')}</label>
          <input
            type="text"
            value={clubName}
            onChange={e => setClubName(e.target.value)}
            placeholder={t('mercado.clubPlaceholderLibre')}
            className="input-apple text-sm w-full"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-apple-gray-500 mb-1.5">{t('mercado.queBuscaLibre')}</label>
          <input
            type="text"
            value={positions}
            onChange={e => setPositions(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            placeholder={t('mercado.posicionesPlaceholderLibre')}
            className="input-apple text-sm w-full"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-apple-gray-500 mb-1.5">{t('mercado.comentarioOpcional')}</label>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
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
          {saving ? t('mercado.guardando') : t('mercado.guardarObjetivo')}
        </button>
      </div>
    </MobileSheet>
  )
}
