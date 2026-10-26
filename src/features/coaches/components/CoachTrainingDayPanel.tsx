// src/features/coaches/components/CoachTrainingDayPanel.tsx
import { useState } from 'react'
import {
  upsertTrainingSession,
  deleteTrainingSession,
  type CoachTrainingSession,
  type TrainingSessionType,
} from '@/services/coachService'
import { TYPE_META, FOCUS_TAGS, FOCUS_TAG_LABEL_KEY } from '@/features/coaches/trainingConstants'
import { useLanguage } from '@/context/LanguageContext'
import RequiredMark from '@/components/ui/RequiredMark'

function DumbbellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6.75 6.75v10.5M17.25 6.75v10.5M3 9.75v4.5M21 9.75v4.5M6.75 12h10.5"
      />
    </svg>
  )
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M6 7.5h12M9.75 7.5V6a1.5 1.5 0 011.5-1.5h1.5A1.5 1.5 0 0114.25 6v1.5m-7.5 0 .621 10.556A2.25 2.25 0 009.615 19.5h4.77a2.25 2.25 0 002.244-2.444L17.25 7.5m-9 3.75v5.25m4.5-5.25v5.25"
      />
    </svg>
  )
}

const inputClass =
  'w-full min-h-[44px] rounded-lg border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-900 px-3 text-sm text-apple-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition-colors'

interface DraftSession {
  id?: number
  session_time: string
  type: TrainingSessionType
  title: string
  duration_minutes: string
  intensity: number | null
  focus_tags: string[]
  notes: string
}

function emptyDraft(): DraftSession {
  return { session_time: '', type: 'tactico', title: '', duration_minutes: '', intensity: null, focus_tags: [], notes: '' }
}

function sessionToDraft(s: CoachTrainingSession): DraftSession {
  return {
    id: s.id,
    session_time: s.session_time ?? '',
    type: s.type,
    title: s.title,
    duration_minutes: s.duration_minutes != null ? String(s.duration_minutes) : '',
    intensity: s.intensity,
    focus_tags: s.focus_tags,
    notes: s.notes ?? '',
  }
}

function IntensityPicker({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  const { t } = useLanguage()
  return (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3, 4, 5].map(level => (
        <button
          key={level}
          type="button"
          onClick={() => onChange(level)}
          aria-label={t('trainingDay.intensidadAria').replace('{n}', String(level))}
          className={`w-8 h-8 rounded-full border-2 text-xs font-bold transition-colors ${
            value !== null && level <= value
              ? 'bg-brand-green border-brand-green text-apple-gray-900'
              : 'border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-300 dark:text-apple-gray-600'
          }`}
        >
          {level}
        </button>
      ))}
    </div>
  )
}

function SessionForm({
  draft,
  onChange,
  onSubmit,
  onCancel,
  submitting,
  errorMessage,
}: {
  draft: DraftSession
  onChange: (draft: DraftSession) => void
  onSubmit: () => void
  onCancel: () => void
  submitting: boolean
  errorMessage: string | null
}) {
  const { t } = useLanguage()

  const toggleTag = (tag: string) => {
    onChange({
      ...draft,
      focus_tags: draft.focus_tags.includes(tag) ? draft.focus_tags.filter(x => x !== tag) : [...draft.focus_tags, tag],
    })
  }

  const canSubmit = draft.title.trim().length > 0 && !submitting

  return (
    <div className="space-y-3 bg-apple-gray-50 dark:bg-apple-gray-900/40 rounded-apple-lg p-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400 mb-1">{t('trainingDay.horario')}</label>
          <input type="time" value={draft.session_time} onChange={e => onChange({ ...draft, session_time: e.target.value })} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400 mb-1">{t('trainingDay.tipo')}</label>
          <select value={draft.type} onChange={e => onChange({ ...draft, type: e.target.value as TrainingSessionType })} className={inputClass}>
            {Object.entries(TYPE_META).map(([value, meta]) => (
              <option key={value} value={value}>
                {t(meta.labelKey)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400 mb-1">{t('trainingDay.duracionMin')}</label>
          <input
            type="number"
            min={1}
            value={draft.duration_minutes}
            onChange={e => onChange({ ...draft, duration_minutes: e.target.value })}
            className={inputClass}
          />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400 mb-1">{t('trainingDay.intensidad')}</label>
          <IntensityPicker value={draft.intensity} onChange={v => onChange({ ...draft, intensity: v })} />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400 mb-1">{t('trainingDay.titulo')}<RequiredMark /></label>
        <input
          type="text"
          value={draft.title}
          onChange={e => onChange({ ...draft, title: e.target.value })}
          placeholder={t('trainingDay.tituloPlaceholder')}
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400 mb-1">{t('trainingDay.focoDelDia')}</label>
        <div className="flex flex-wrap gap-1.5">
          {FOCUS_TAGS.map(tag => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={`text-xs font-medium px-2.5 py-1.5 rounded-full transition-colors ${
                draft.focus_tags.includes(tag)
                  ? 'bg-brand-green text-apple-gray-900'
                  : 'bg-white dark:bg-apple-gray-800 text-apple-gray-500 dark:text-apple-gray-400 border border-apple-gray-200 dark:border-apple-gray-700'
              }`}
            >
              {t(FOCUS_TAG_LABEL_KEY[tag])}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400 mb-1">{t('trainingDay.notas')}</label>
        <textarea
          value={draft.notes}
          onChange={e => onChange({ ...draft, notes: e.target.value })}
          rows={3}
          placeholder={t('trainingDay.notasPlaceholder')}
          className={`${inputClass} min-h-[80px] py-2`}
        />
      </div>

      {errorMessage && <p className="text-xs font-medium text-red-500">{errorMessage}</p>}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className="min-h-[40px] px-5 rounded-lg bg-brand-green text-apple-gray-900 text-sm font-semibold disabled:opacity-50 disabled:pointer-events-none"
        >
          {submitting ? t('coachNotes.guardando') : t('coachNotes.guardar')}
        </button>
        <button type="button" onClick={onCancel} className="min-h-[40px] px-4 rounded-lg text-sm text-apple-gray-500 hover:text-apple-gray-700 dark:hover:text-apple-gray-300">
          {t('perfil.cancelar')}
        </button>
      </div>
    </div>
  )
}

export default function CoachTrainingDayPanel({
  coachKey,
  dateKey,
  sessions,
  onChanged,
}: {
  coachKey: string
  dateKey: string
  sessions: CoachTrainingSession[]
  onChanged: () => void
}) {
  const { t } = useLanguage()
  const [editingId, setEditingId] = useState<number | 'new' | null>(null)
  const [draft, setDraft] = useState<DraftSession>(emptyDraft())
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const startEdit = (session: CoachTrainingSession) => {
    setDraft(sessionToDraft(session))
    setEditingId(session.id)
    setErrorMessage(null)
  }

  const startNew = () => {
    setDraft(emptyDraft())
    setEditingId('new')
    setErrorMessage(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraft(emptyDraft())
    setErrorMessage(null)
  }

  const handleSubmit = async () => {
    if (!draft.title.trim() || submitting) return
    setSubmitting(true)
    setErrorMessage(null)
    try {
      const result = await upsertTrainingSession({
        ...(typeof editingId === 'number' ? { id: editingId } : {}),
        coach_key: coachKey,
        session_date: dateKey,
        session_time: draft.session_time || null,
        type: draft.type,
        title: draft.title.trim(),
        notes: draft.notes.trim() || null,
        duration_minutes: draft.duration_minutes ? Number(draft.duration_minutes) : null,
        intensity: draft.intensity,
        focus_tags: draft.focus_tags,
      })
      if (result.success) {
        cancelEdit()
        onChanged()
      } else {
        setErrorMessage(result.error ?? t('trainingDay.errorGuardar'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (session: CoachTrainingSession) => {
    const ok = window.confirm(t('trainingDay.confirmarBorrar').replace('{title}', session.title))
    if (!ok) return
    setDeletingId(session.id)
    try {
      const result = await deleteTrainingSession(session.id)
      if (result.success) {
        onChanged()
      } else {
        window.alert(result.error ?? t('trainingDay.errorBorrar'))
      }
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-3">
      {sessions.map(session => {
        const meta = TYPE_META[session.type]
        if (editingId === session.id) {
          return (
            <SessionForm
              key={session.id}
              draft={draft}
              onChange={setDraft}
              onSubmit={() => void handleSubmit()}
              onCancel={cancelEdit}
              submitting={submitting}
              errorMessage={errorMessage}
            />
          )
        }
        return (
          <div
            key={session.id}
            className="flex items-start justify-between gap-3 bg-white dark:bg-apple-gray-800/60 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 px-4 py-3"
          >
            <div className="flex items-start gap-3 min-w-0">
              <span className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${meta.badgeClass}`}>
                <DumbbellIcon className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <button type="button" onClick={() => startEdit(session)} className="text-left">
                  <p className="text-sm font-semibold text-apple-gray-800 dark:text-white truncate hover:text-brand-green transition-colors">
                    {session.title}
                  </p>
                </button>
                <p className="text-xs text-apple-gray-400">
                  {t(meta.labelKey)}
                  {session.session_time && ` · ${session.session_time.slice(0, 5)}`}
                  {session.duration_minutes && ` · ${session.duration_minutes}'`}
                  {session.intensity && ` · ${t('trainingDay.intensidadValor').replace('{n}', String(session.intensity))}`}
                </p>
                {session.focus_tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {session.focus_tags.map(tag => (
                      <span
                        key={tag}
                        className="text-2xs font-medium px-2 py-0.5 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500 dark:text-apple-gray-400"
                      >
                        {t(FOCUS_TAG_LABEL_KEY[tag])}
                      </span>
                    ))}
                  </div>
                )}
                {session.notes && <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-1.5 whitespace-pre-wrap">{session.notes}</p>}
              </div>
            </div>
            <button
              onClick={() => void handleDelete(session)}
              disabled={deletingId === session.id}
              aria-label={t('trainingDay.borrarSesionAria').replace('{title}', session.title)}
              className="flex-shrink-0 min-w-[40px] min-h-[40px] rounded-lg flex items-center justify-center text-apple-gray-400 hover:text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
        )
      })}

      {editingId === 'new' ? (
        <SessionForm
          draft={draft}
          onChange={setDraft}
          onSubmit={() => void handleSubmit()}
          onCancel={cancelEdit}
          submitting={submitting}
          errorMessage={errorMessage}
        />
      ) : (
        <button
          type="button"
          onClick={startNew}
          className="w-full min-h-[44px] rounded-lg border-2 border-dashed border-apple-gray-200 dark:border-apple-gray-700 text-sm font-medium text-apple-gray-400 hover:text-brand-green hover:border-brand-green/40 transition-colors"
        >
          {t('trainingDay.agregarSesion')}
        </button>
      )}

      {sessions.length === 0 && editingId !== 'new' && (
        <p className="text-sm text-apple-gray-300 dark:text-apple-gray-600 text-center py-2">{t('trainingDay.sinEntrenamientosDia')}</p>
      )}
    </div>
  )
}
