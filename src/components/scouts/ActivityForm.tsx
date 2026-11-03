import { useEffect, useState } from 'react'
import MobileSheet from '@/components/ui/MobileSheet'
import RequiredMark from '@/components/ui/RequiredMark'
import { useAuth } from '@/context/AuthContext'
import {
  createActivity,
  todayAR,
  type ActivityKind,
  type MeetingMode,
  type ScoutListItem,
} from '@/services/scoutsPanelService'

// Carga de una reunión o un viaje. Se usa en las páginas "Cargar reunión" y "Cargar viaje"
// y, para cargar por otro scout, desde la página Scouts.

/** "juan perez ,  lucas gomez," → "juan perez, lucas gomez" (o null si no hay nada). */
export function cleanNames(s: string): string | null {
  const names = s.split(',').map(n => n.trim().replace(/\s+/g, ' ')).filter(Boolean)
  return names.length ? names.join(', ') : null
}

const label = 'block text-sm font-medium text-apple-gray-700 dark:text-apple-gray-200 mb-1.5'
const input = 'input-apple text-base w-full'
const hint = 'mt-1.5 text-sm text-apple-gray-600 dark:text-apple-gray-400'

export function ChoiceButtons<T extends string>({ value, onChange, options }: {
  value: T | null | undefined
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-4 py-3 rounded-xl text-base font-medium border transition-all ${
            value === o.value
              ? 'bg-brand-green/10 border-brand-green text-apple-gray-900 dark:text-white'
              : 'bg-white dark:bg-apple-gray-900 border-apple-gray-300 dark:border-apple-gray-600 text-apple-gray-700 dark:text-apple-gray-200 hover:border-apple-gray-400'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function ActivityForm({ kind, onSaved, scouts, defaultScoutId }: {
  kind: ActivityKind
  onSaved: () => void
  /** Solo para las cuentas de la página Scouts: cargar por otro scout. */
  scouts?: ScoutListItem[]
  defaultScoutId?: string
}) {
  const { user, userDisplayName } = useAuth()
  const [scoutId, setScoutId] = useState('')
  const [date, setDate] = useState(todayAR())
  const [endDate, setEndDate] = useState('')
  const [title, setTitle] = useState('')
  const [mode, setMode] = useState<MeetingMode | null>(null)
  const [place, setPlace] = useState('')
  const [players, setPlayers] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setScoutId(defaultScoutId ?? user?.id ?? '')
  }, [defaultScoutId, user?.id])

  const valid = !!scoutId && !!date && (
    kind === 'reunion'
      ? !!title.trim() && !!mode && (mode === 'online' || !!place.trim())
      : !!place.trim()
  )

  const scoutName = scouts?.find(s => s.user_id === scoutId)?.name ?? userDisplayName ?? 'Scout'

  const handleSave = async () => {
    if (!valid || saving) return
    setSaving(true)
    setError('')
    const err = await createActivity({
      scout_id: scoutId,
      scout_name: scoutName,
      kind,
      activity_date: date,
      end_date: kind === 'viaje' && endDate ? endDate : null,
      title: kind === 'reunion' ? title.trim() : null,
      mode: kind === 'reunion' ? mode : null,
      place: kind === 'viaje' || mode === 'presencial' ? place.trim() : null,
      player_name: kind === 'reunion' ? cleanNames(players) : null,
      notes: notes.trim() || null,
    }, userDisplayName || 'Usuario')
    setSaving(false)
    if (err) { setError('No se pudo guardar. Probá de nuevo.'); return }
    setTitle(''); setMode(null); setPlace(''); setPlayers(''); setNotes(''); setEndDate(''); setDate(todayAR())
    onSaved()
  }

  return (
    <div className="space-y-5">
      {scouts && scouts.length > 0 && (
        <div>
          <label className={label}>Scout<RequiredMark /></label>
          <select value={scoutId} onChange={e => setScoutId(e.target.value)} className={input}>
            {!scouts.some(s => s.user_id === scoutId) && <option value={scoutId}>{userDisplayName || 'Yo'}</option>}
            {scouts.map(s => <option key={s.user_id} value={s.user_id}>{s.name}</option>)}
          </select>
        </div>
      )}

      {kind === 'reunion' ? (
        <>
          <div className="rounded-xl bg-sky-500/10 border border-sky-500/25 px-4 py-3 text-sm text-apple-gray-800 dark:text-apple-gray-100">
            Si la reunión fue sobre un jugador, también podés escribirla en sus comentarios y marcar
            que fue una reunión: se carga sola y no hace falta cargarla acá.
          </div>
          <div>
            <label className={label}>¿Con quién?<RequiredMark /></label>
            <input value={title} onChange={e => setTitle(e.target.value)} className={input}
              placeholder="Ej: un jugador, su representante o el director deportivo de Banfield" />
          </div>
          <div>
            <label className={label}>¿Sobre qué jugadores?</label>
            <input value={players} onChange={e => setPlayers(e.target.value)} className={input} placeholder="Ej: Juan Pérez, Lucas Gómez" />
            <p className={hint}>Si son varios, separalos con una coma.</p>
          </div>
          <div>
            <label className={label}>¿Cómo fue?<RequiredMark /></label>
            <ChoiceButtons value={mode} onChange={setMode} options={[{ value: 'presencial', label: 'Presencial' }, { value: 'online', label: 'Online' }]} />
          </div>
          {mode === 'presencial' && (
            <div>
              <label className={label}>¿En qué ciudad?<RequiredMark /></label>
              <input value={place} onChange={e => setPlace(e.target.value)} className={input} placeholder="Ej: Rosario" />
            </div>
          )}
          <div>
            <label className={label}>Fecha<RequiredMark /></label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} min="2020-01-01" max="2100-12-31" className={input} />
          </div>
        </>
      ) : (
        <>
          <div className="rounded-xl bg-sky-500/10 border border-sky-500/25 px-4 py-3 text-sm text-apple-gray-800 dark:text-apple-gray-100">
            Si fuiste a ver un partido y en el reporte pusiste el lugar, o tuviste una reunión presencial y pusiste la ciudad,
            el viaje ya se sumó solo: no hace falta cargarlo acá.
          </div>
          <div>
            <label className={label}>¿A dónde?<RequiredMark /></label>
            <input value={place} onChange={e => setPlace(e.target.value)} className={input} placeholder="Ej: Córdoba" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Desde<RequiredMark /></label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} min="2020-01-01" max="2100-12-31" className={input} />
            </div>
            <div>
              <label className={label}>Hasta</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min={date} max="2100-12-31" className={input} />
            </div>
          </div>
        </>
      )}

      <div>
        <label className={label}>Comentario</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className={`${input} resize-y`}
          placeholder={kind === 'viaje' ? 'Ej: a qué fuiste, a quién viste' : 'De qué hablaron'} />
      </div>

      {error && <p className="text-sm text-red-700 dark:text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={!valid || saving}
        className="w-full py-3.5 rounded-xl text-base font-semibold text-gray-900 bg-brand-green hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {saving ? 'Guardando...' : kind === 'reunion' ? 'Guardar reunión' : 'Guardar viaje'}
      </button>
    </div>
  )
}

/** Hoja para cargar desde la página Scouts (por cualquier scout). */
export function ActivitySheet({ kind, onClose, onSaved, scouts, defaultScoutId }: {
  kind: ActivityKind | null
  onClose: () => void
  onSaved?: () => void
  scouts?: ScoutListItem[]
  defaultScoutId?: string
}) {
  if (!kind) return null
  return (
    <MobileSheet open onClose={onClose} title={kind === 'reunion' ? 'Cargar reunión' : 'Cargar viaje'}>
      <div className="pt-1">
        <ActivityForm kind={kind} scouts={scouts} defaultScoutId={defaultScoutId} onSaved={() => { onSaved?.(); onClose() }} />
      </div>
    </MobileSheet>
  )
}
