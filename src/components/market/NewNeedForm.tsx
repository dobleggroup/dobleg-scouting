import { useEffect, useState } from 'react'
import MobileSheet from '@/components/ui/MobileSheet'
import PitchPositionPicker from './PitchPositionPicker'
import { createClubNeed, addNoteTo, needGroupKey, mergePitchSelection, pitchSpotsTaken } from '@/services/marketService'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import type { ClubNeed } from '@/types/market'

// Formulario corto a propósito: se escribe el club y se marcan en la canchita
// las posiciones que busca. Queda UNA búsqueda por club en la lista (por
// dentro, una fila por posición). El club queda sin vincular (team_id null);
// responsable, fecha, detalle de cada posición y ofrecidos se cargan al abrirla.
export default function NewNeedForm({ open, onClose, onCreated, existingNeeds }: {
  open: boolean
  onClose: () => void
  onCreated: (need: ClubNeed) => void
  existingNeeds: ClubNeed[]
}) {
  const { user, userDisplayName } = useAuth()
  const { t } = useLanguage()
  const [clubName, setClubName] = useState('')
  const [positions, setPositions] = useState<string[]>([])
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Reiniciar el formulario cada vez que se abre la hoja: MobileSheet no desmonta
  // sus hijos al cerrar (retorna null visualmente pero mantiene el árbol montado),
  // así que sin este efecto el estado local sobrevive a un cierre por backdrop
  // sin guardar y reaparece con datos de un intento abandonado al reabrir.
  useEffect(() => {
    if (!open) return
    setClubName('')
    setPositions([])
    setComment('')
    setSaving(false)
    setError('')
  }, [open])

  // Si ese club ya tiene una búsqueda activa, sus posiciones se ven marcadas
  // y lo nuevo se suma a la misma búsqueda (no se crea otro "Necaxa").
  const clubKey = clubName.trim() ? needGroupKey({ team_name: clubName, hidden_at: null }) : null
  const sameClub = clubKey ? existingNeeds.filter(n => needGroupKey(n) === clubKey) : []
  const alreadyIn = sameClub.map(n => n.position_label)
  // Los dos extremos marcados = una búsqueda de "Extremo" (ídem interiores).
  const toSave = mergePitchSelection(positions).filter(p => !alreadyIn.includes(p))
  const canSave = clubName.trim().length > 0 && toSave.length > 0

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    setError('')
    // Mismo nombre, escudo y responsable que la búsqueda que ya existe, si hay.
    const base = sameClub[0]
    const created: ClubNeed[] = []
    for (const position of toSave) {
      const result = await createClubNeed(
        {
          team_id: base?.team_id ?? null,
          team_name: base?.team_name ?? clubName.trim(),
          team_logo: base?.team_logo ?? null,
          position_label: position,
          assigned_to_id: base?.assigned_to_id ?? null,
          assigned_to_name: base?.assigned_to_name ?? null,
          next_followup_date: null,
        },
        user?.id ?? null,
        userDisplayName || 'Usuario',
      )
      if (!result) break
      created.push(result)
      onCreated(result)
    }
    if (created.length < toSave.length) {
      setSaving(false)
      setPositions(pitchSpotsTaken(toSave.slice(created.length)))
      setError(t('mercado.errorGuardar'))
      return
    }
    const noteTarget = base ?? created[0]
    if (comment.trim()) await addNoteTo({ needId: noteTarget.id }, comment.trim(), false, null, user?.id ?? null, userDisplayName || 'Usuario')
    setSaving(false)
    onClose()
  }

  return (
    <MobileSheet open={open} onClose={onClose} title={t('mercado.nuevoObjetivo')}>
      <div className="space-y-4 p-4">
        <div>
          <label className="block text-sm font-medium text-apple-gray-700 dark:text-apple-gray-200 mb-1.5">{t('mercado.club')}</label>
          <input
            type="text"
            value={clubName}
            onChange={e => setClubName(e.target.value)}
            placeholder={t('mercado.clubPlaceholderLibre')}
            className="input-apple text-sm w-full"
            autoFocus
          />
          {sameClub.length > 0 && (
            <p className="mt-1.5 text-xs text-apple-gray-600 dark:text-apple-gray-300">{t('mercado.seSumaABusqueda').replace('{club}', sameClub[0].team_name)}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-apple-gray-700 dark:text-apple-gray-200 mb-2">{t('mercado.queBuscaCancha')}</label>
          <PitchPositionPicker value={positions} onChange={setPositions} disabled={pitchSpotsTaken(alreadyIn)} />
          <p className="mt-2 text-sm text-center text-apple-gray-700 dark:text-apple-gray-200 min-h-[1.25rem]">
            {toSave.length > 0 ? toSave.join(' · ') : <span className="text-apple-gray-500 dark:text-apple-gray-400">{t('mercado.tocaPosiciones')}</span>}
          </p>
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
          {saving ? t('mercado.guardando') : t('mercado.guardarObjetivo')}
        </button>
      </div>
    </MobileSheet>
  )
}
