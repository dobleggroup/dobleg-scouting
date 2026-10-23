import { useEffect, useState } from 'react'
import MobileSheet from '@/components/ui/MobileSheet'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import {
  createCalendarNote,
  deleteCalendarNote,
  setCalendarNoteDone,
  type CalendarNote,
} from '@/services/marketNotesService'
import { updateFollowupDate } from '@/services/marketService'
import type { Negotiation, TeamMember } from '@/types/market'

function dayTitle(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const text = new Date(y, m - 1, d).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Notas y recordatorios de un día del calendario de Mercado. Una nota asignada
 * le avisa a esa persona; sin asignar, es un recordatorio para quien la escribe.
 */
export default function CalendarDaySheet({
  date,
  notes,
  members,
  onClose,
  onChange,
  negotiations = [],
  onNegotiationUpdated,
}: {
  date: string | null
  notes: CalendarNote[]
  members: TeamMember[]
  onClose: () => void
  onChange: (next: CalendarNote[]) => void
  /** Negociaciones en curso: se pueden agendar para este día con un toque. */
  negotiations?: Negotiation[]
  onNegotiationUpdated?: (n: Negotiation) => void
}) {
  const { user, userDisplayName } = useAuth()
  const { t } = useLanguage()
  const [body, setBody] = useState('')
  const [assigneeId, setAssigneeId] = useState<number | ''>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [negSearch, setNegSearch] = useState('')
  const [scheduling, setScheduling] = useState<number | null>(null)

  useEffect(() => {
    if (!date) return
    setBody('')
    setAssigneeId('')
    setError('')
    setNegSearch('')
  }, [date])

  const dayNotes = date ? notes.filter(n => n.note_date === date) : []
  const assignee = members.find(m => m.id === assigneeId) ?? null

  const handleSave = async () => {
    if (!date || !user || !body.trim() || saving) return
    setSaving(true)
    setError('')
    const created = await createCalendarNote({ note_date: date, body, assignee }, user.id, userDisplayName || 'Usuario')
    setSaving(false)
    if (!created) { setError(t('mercado.errorGuardar')); return }
    onChange([...notes, created])
    setBody('')
    setAssigneeId('')
  }

  const schedule = async (n: Negotiation) => {
    if (!date || scheduling != null) return
    setScheduling(n.id)
    if (await updateFollowupDate({ negotiationId: n.id }, date)) onNegotiationUpdated?.({ ...n, next_followup_date: date })
    setScheduling(null)
  }
  const term = negSearch.trim().toLowerCase()
  const openNegotiations = negotiations
    .filter(n => !n.hidden_at && n.status !== 'cerrado_exito' && n.status !== 'cerrado_caido')
    .filter(n => !term || `${n.player_name} ${n.team_name ?? ''} ${n.current_team_name ?? ''}`.toLowerCase().includes(term))

  const toggleDone = async (note: CalendarNote) => {
    const updated = await setCalendarNoteDone(note.id, !note.done)
    if (updated) onChange(notes.map(n => n.id === updated.id ? updated : n))
  }

  const remove = async (note: CalendarNote) => {
    if (!confirm(t('mercado.confirmarBorrarNota'))) return
    if (await deleteCalendarNote(note.id)) onChange(notes.filter(n => n.id !== note.id))
  }

  return (
    <MobileSheet open={date != null} onClose={onClose} title={date ? dayTitle(date) : ''}>
      <div className="space-y-5 p-4">
        <div className="space-y-3">
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={3}
            autoFocus
            placeholder={t('mercado.notaPlaceholder')}
            className="input-apple w-full text-sm resize-y min-h-[5rem]"
          />
          <div>
            <label className="block text-xs font-medium text-apple-gray-500 mb-1.5">{t('mercado.notaAQuienAvisar')}</label>
            <select
              value={assigneeId}
              onChange={e => setAssigneeId(e.target.value ? Number(e.target.value) : '')}
              className="input-apple text-sm w-full"
            >
              <option value="">{t('mercado.notaSoloAMi')}</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <p className="mt-1.5 text-2xs text-apple-gray-400">
              {assignee
                ? assignee.user_id
                  ? t('mercado.notaAvisoAsignado').replace('{nombre}', assignee.name)
                  : t('mercado.notaSinCuenta').replace('{nombre}', assignee.name)
                : t('mercado.notaAvisoPropio')}
            </p>
          </div>
          {error && <p className="text-xs text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>}
          <button
            onClick={handleSave}
            disabled={!body.trim() || saving}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-brand-green hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {saving ? t('mercado.guardando') : t('mercado.guardarNota')}
          </button>
        </div>

        {negotiations.length > 0 && (
          <div className="space-y-2 pt-4 border-t border-apple-gray-100 dark:border-apple-gray-700">
            <p className="text-2xs font-semibold uppercase tracking-wider text-apple-gray-400">{t('mercado.agendarNegociacion')}</p>
            {openNegotiations.length > 6 || term ? (
              <input
                type="text"
                value={negSearch}
                onChange={e => setNegSearch(e.target.value)}
                placeholder={t('mercado.filtrarJugador')}
                className="input-apple w-full text-sm"
              />
            ) : null}
            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
              {openNegotiations.length === 0 ? (
                <p className="text-xs text-apple-gray-400 py-2">{t('mercado.sinNegociacionesEnCurso')}</p>
              ) : openNegotiations.map(n => {
                const isThisDay = n.next_followup_date === date
                return (
                  <div key={n.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-800/60">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-apple-gray-800 dark:text-white truncate">{n.player_name}</p>
                      <p className="text-2xs text-apple-gray-400 truncate">
                        {n.current_team_name ?? t('mercado.jugadorLibre')} → {n.team_name ?? t('mercado.quedaLibre')}
                        {n.next_followup_date && !isThisDay && ` · ${t('mercado.agendadaPara')} ${n.next_followup_date.split('-').reverse().slice(0, 2).join('/')}`}
                      </p>
                    </div>
                    {isThisDay ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-green flex-shrink-0">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                        {t('mercado.agendadaEsteDia')}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => schedule(n)}
                        disabled={scheduling != null}
                        className="flex-shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold border border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:border-brand-green hover:text-brand-green disabled:opacity-50 transition-colors"
                      >
                        {scheduling === n.id ? '…' : t('mercado.agendar')}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {dayNotes.length > 0 && (
          <div className="space-y-2">
            <p className="text-2xs font-semibold uppercase tracking-wider text-apple-gray-400">{t('mercado.notasDelDia')}</p>
            {dayNotes.map(note => (
              <div key={note.id} className="flex items-start gap-3 p-3 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-800/60 border border-apple-gray-100 dark:border-apple-gray-700/60">
                <button
                  type="button"
                  onClick={() => toggleDone(note)}
                  aria-label={note.done ? t('mercado.notaReabrir') : t('mercado.notaMarcarHecha')}
                  className={`mt-0.5 w-5 h-5 flex-shrink-0 rounded-md border-2 flex items-center justify-center transition-colors ${note.done ? 'bg-brand-green border-brand-green text-white' : 'border-apple-gray-300 dark:border-apple-gray-600 hover:border-brand-green'}`}
                >
                  {note.done && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm text-apple-gray-800 dark:text-apple-gray-100 whitespace-pre-line break-words ${note.done ? 'line-through opacity-60' : ''}`}>{note.body}</p>
                  <p className="mt-1 text-2xs text-apple-gray-400">
                    {note.created_by_name}
                    {note.assigned_to_name ? ` → ${note.assigned_to_name}` : ` · ${t('mercado.notaRecordatorio')}`}
                  </p>
                </div>
                {user && note.created_by === user.id && (
                  <button type="button" onClick={() => remove(note)} aria-label={t('mercado.borrarNota')} className="p-0.5 text-apple-gray-400 hover:text-red-500 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </MobileSheet>
  )
}
