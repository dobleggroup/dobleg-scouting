import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import {
  addPlayerComment,
  COMMENT_KIND_LABEL,
  setCommentKind,
  deletePlayerComment,
  fetchCommentViews,
  fetchPlayerComments,
  markCommentsSeen,
  playerNameKey,
  type CommentView,
  type CommentKind,
  type CommentSentiment,
  type CommentSource,
  type CommentTarget,
  type PlayerComment,
} from '@/services/playerCommentsService'
import { guessCommentKind } from '@/features/scouts/meetingFromComment'
import { useCanApproveActivities } from '@/hooks/useCanApproveActivities'

// Historial de comentarios de un jugador (ficha y listas de seguimiento ven lo
// mismo). Cada comentario queda con quién lo escribió y cuándo.

const SENTIMENT: Record<CommentSentiment, { label: string; dot: string; text: string }> = {
  positive: { label: 'Positivo', dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  neutral: { label: 'Neutral', dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  negative: { label: 'Negativo', dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400' },
}

const KINDS = Object.keys(COMMENT_KIND_LABEL) as CommentKind[]

const KIND_PILL: Record<CommentKind, string> = {
  comentario: 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300',
  reunion_presencial: 'bg-brand-green/15 text-apple-gray-900 dark:text-white',
  reunion_online: 'bg-sky-500/15 text-apple-gray-900 dark:text-white',
  contacto: 'bg-amber-500/15 text-apple-gray-900 dark:text-white',
}

/** Las cuatro etiquetas para elegir (al escribir y al cambiarla después). */
function KindPicker({ value, onChange, city, onCity }: {
  value: CommentKind
  onChange: (k: CommentKind) => void
  city: string
  onCity: (c: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {KINDS.map(k => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
            value === k
              ? 'border-brand-green bg-brand-green/10 text-apple-gray-900 dark:text-white'
              : 'border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-500 dark:text-apple-gray-400 hover:border-apple-gray-300'
          }`}
        >
          {COMMENT_KIND_LABEL[k]}
        </button>
      ))}
      {value === 'reunion_presencial' && (
        <input
          value={city}
          onChange={e => onCity(e.target.value)}
          placeholder="¿En qué ciudad?"
          className="input-apple text-xs py-1 px-2.5 w-40"
        />
      )}
    </div>
  )
}

const SOURCE_LABEL: Record<CommentSource, string> = {
  ficha: 'Ficha',
  seguimiento_gg: 'Seguimiento GG',
  seguimiento_datos: 'Seguimiento Datos',
}

// Los comentarios viejos vivían en el navegador de cada uno (localStorage). La
// primera vez que se abre el jugador acá, se suben a la base y se borran de ahí.
const LEGACY_KEY = 'player_comments_v1'
interface LegacyComment { id: string; playerKey: string; sentiment: CommentSentiment; text: string; author: string; createdAt: string }

// Evita subir dos veces el mismo jugador si el panel se monta dos veces seguidas
const migrating = new Set<string>()

async function migrateLegacy(target: CommentTarget, source: CommentSource, fallbackAuthor: string): Promise<void> {
  const key = playerNameKey(target.name)
  if (migrating.has(key)) return
  let all: LegacyComment[]
  try { all = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]') } catch { return }
  const mine = all.filter(c => playerNameKey(c.playerKey.split('|')[0] ?? '') === key)
  if (mine.length === 0) return
  migrating.add(key)
  try {
    const uploaded = new Set<string>()
    for (const c of mine) {
      const ok = await addPlayerComment(target, c.text, source, c.author || fallbackAuthor, c.sentiment ?? null, c.createdAt)
      if (ok) uploaded.add(c.id)
    }
    const current: LegacyComment[] = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]')
    localStorage.setItem(LEGACY_KEY, JSON.stringify(current.filter(c => !uploaded.has(c.id))))
  } catch { /* sin storage: quedan en el navegador, se reintenta la próxima vez */ } finally {
    migrating.delete(key)
  }
}

// "Visto por Gerardo, Guillermo y Federico" — chiquito, abajo de cada
// comentario. No cuenta al autor ni a uno mismo; el detalle (nombre completo y
// cuándo) queda en el tooltip.
function SeenBy({ views }: { views: CommentView[] }) {
  if (views.length === 0) return null
  const names = views.map(v => v.user_name.split(' ')[0] || v.user_name)
  const shown = names.length <= 3 ? names : [...names.slice(0, 2), `${names.length - 2} más`]
  const text = shown.length === 1 ? shown[0] : `${shown.slice(0, -1).join(', ')} y ${shown[shown.length - 1]}`
  const detail = views.map(v => `${v.user_name} · ${formatWhen(v.seen_at)}`).join('\n')
  return (
    <p className="mt-2 flex items-center justify-end gap-1 text-2xs text-apple-gray-400" title={detail}>
      <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      <span className="truncate">Visto por {text}</span>
    </p>
  )
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

export default function PlayerCommentsPanel({
  target,
  source,
  onChange,
  autoFocus = false,
}: {
  target: CommentTarget
  source: CommentSource
  /** Avisa la cantidad nueva (para refrescar contadores en las listas). */
  onChange?: (comments: PlayerComment[]) => void
  autoFocus?: boolean
}) {
  const { user, userDisplayName } = useAuth()
  const [comments, setComments] = useState<PlayerComment[] | null>(null)
  const [views, setViews] = useState<Record<string, CommentView[]>>({})
  const [text, setText] = useState('')
  const [sentiment, setSentiment] = useState<CommentSentiment | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Qué fue (comentario, reunión, contacto): se adivina del texto hasta que la persona elige.
  const [kind, setKind] = useState<CommentKind>('comentario')
  const [city, setCity] = useState('')
  const [kindTouched, setKindTouched] = useState(false)
  // Cambiar la etiqueta de un comentario ya guardado (quien lo escribió, Marcos o Matías).
  const canApprove = useCanApproveActivities()
  const [editing, setEditing] = useState<{ id: string; kind: CommentKind; city: string } | null>(null)

  useEffect(() => {
    if (kindTouched) return
    const g = guessCommentKind(text)
    setKind(g.kind)
    setCity(g.city ?? '')
  }, [text, kindTouched])

  const authorName = userDisplayName || user?.email?.split('@')[0] || 'Staff'

  const load = useCallback(async () => {
    const list = await fetchPlayerComments(target)
    setComments(list)
    onChange?.(list)

    // Abrir los comentarios = verlos: se marcan los de otros que todavía no vi.
    const seen = await fetchCommentViews(list.map(c => c.id))
    const unseen = user
      ? list.filter(c => c.author_id !== user.id && !seen[c.id]?.some(v => v.user_id === user.id)).map(c => c.id)
      : []
    for (const v of await markCommentsSeen(unseen, authorName)) (seen[v.comment_id] ??= []).push(v)
    setViews(seen)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.name, target.supabasePlayerId, target.scoutPlayerId, user?.id, authorName])

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (user) await migrateLegacy(target, source, authorName)
      if (alive) await load()
    })()
    return () => { alive = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, user])

  const handleSave = async () => {
    if (!text.trim() || saving) return
    setSaving(true)
    setError('')
    const created = await addPlayerComment(target, text, source, authorName, sentiment)
    if (!created) {
      setSaving(false)
      setError('No se pudo guardar. Probá de nuevo.')
      return
    }
    // La etiqueta (si es una reunión, queda cargada también como reunión).
    let kindError = ''
    if (kind !== 'comentario') {
      const err = await setCommentKind(created.id, kind, kind === 'reunion_presencial' ? city.trim() : null, authorName)
      if (err) kindError = 'El comentario se guardó, pero no la etiqueta. Tocá la etiqueta del comentario para ponerla de nuevo.'
      else Object.assign(created, { kind, place: kind === 'reunion_presencial' ? city.trim() : null })
    }
    setSaving(false)
    const next = [created, ...(comments ?? [])]
    setComments(next)
    onChange?.(next)
    setText('')
    setSentiment(null)
    setKind('comentario')
    setCity('')
    setKindTouched(false)
    setError(kindError)
  }

  const kindValid = kind !== 'reunion_presencial' || !!city.trim()

  const handleChangeKind = async () => {
    if (!editing) return
    if (editing.kind === 'reunion_presencial' && !editing.city.trim()) return
    const place = editing.kind === 'reunion_presencial' ? editing.city.trim() : null
    const err = await setCommentKind(editing.id, editing.kind, place, authorName)
    if (err) { setError('No se pudo cambiar la etiqueta. Probá de nuevo.'); return }
    const next = (comments ?? []).map(c => c.id === editing.id ? { ...c, kind: editing.kind, place } : c)
    setComments(next)
    onChange?.(next)
    setEditing(null)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Borrar este comentario?')) return
    if (!await deletePlayerComment(id)) return
    const next = (comments ?? []).filter(c => c.id !== id)
    setComments(next)
    onChange?.(next)
  }

  return (
    <div className="space-y-4">
      {user && (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSave() }}
            autoFocus={autoFocus}
            rows={3}
            placeholder="Escribí un comentario: contexto, lo que viste, con quién hablaste..."
            className="input-apple w-full resize-y min-h-[4.5rem] text-sm"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 mr-1">¿Qué fue?</span>
            <KindPicker
              value={kind}
              onChange={k => { setKind(k); setKindTouched(true) }}
              city={city}
              onCity={c => { setCity(c); setKindTouched(true) }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1.5">
              {(Object.keys(SENTIMENT) as CommentSentiment[]).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSentiment(prev => prev === s ? null : s)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                    sentiment === s
                      ? `border-current ${SENTIMENT[s].text} bg-apple-gray-50 dark:bg-apple-gray-800`
                      : 'border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-500 hover:border-apple-gray-300'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${SENTIMENT[s].dot}`} />
                  {SENTIMENT[s].label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={!text.trim() || saving || !kindValid}
              className="px-4 py-1.5 rounded-lg bg-brand-green text-white text-sm font-semibold hover:bg-emerald-600 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      )}

      {comments === null ? (
        <p className="text-sm text-apple-gray-400 py-4 text-center">Cargando comentarios...</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-apple-gray-400 py-4 text-center">Todavía no hay comentarios.</p>
      ) : (
        <ol className="space-y-2">
          {comments.map(c => (
            <li key={c.id} className="p-3 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-800/60 border border-apple-gray-100 dark:border-apple-gray-700/60">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-apple-gray-800 dark:text-white">{c.author_name}</p>
                  <p className="text-2xs text-apple-gray-400">
                    {formatWhen(c.created_at)} · {SOURCE_LABEL[c.source]}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {c.sentiment && (
                    <span className={`inline-flex items-center gap-1 text-2xs font-semibold ${SENTIMENT[c.sentiment].text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${SENTIMENT[c.sentiment].dot}`} />
                      {SENTIMENT[c.sentiment].label}
                    </span>
                  )}
                  {user && c.author_id === user.id && (
                    <button
                      type="button"
                      onClick={() => handleDelete(c.id)}
                      className="p-0.5 text-apple-gray-400 hover:text-red-500 transition-colors"
                      aria-label="Borrar comentario"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
              </div>
              <p className="mt-1.5 text-sm text-apple-gray-700 dark:text-apple-gray-300 leading-relaxed whitespace-pre-line">{c.body}</p>
              {(() => {
                const k: CommentKind = c.kind ?? 'comentario'
                const canEdit = !!user && (c.author_id === user.id || canApprove)
                if (editing?.id === c.id) {
                  return (
                    <div className="mt-2 space-y-2">
                      <KindPicker
                        value={editing.kind}
                        onChange={kk => setEditing({ ...editing, kind: kk })}
                        city={editing.city}
                        onCity={cc => setEditing({ ...editing, city: cc })}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleChangeKind}
                          disabled={editing.kind === 'reunion_presencial' && !editing.city.trim()}
                          className="px-3 py-1 rounded-lg bg-brand-green text-white text-xs font-semibold hover:bg-emerald-600 disabled:opacity-50"
                        >
                          Guardar
                        </button>
                        <button type="button" onClick={() => setEditing(null)} className="px-3 py-1 rounded-lg text-xs text-apple-gray-500 hover:text-apple-gray-800 dark:hover:text-white">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )
                }
                const label = `${COMMENT_KIND_LABEL[k]}${k === 'reunion_presencial' && c.place ? ` · ${c.place}` : ''}`
                return (
                  <div className="mt-2">
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => setEditing({ id: c.id, kind: k, city: c.place ?? '' })}
                        title="Cambiar qué fue"
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-2xs font-medium ${KIND_PILL[k]} hover:ring-1 hover:ring-brand-green/50`}
                      >
                        {label}
                        <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </button>
                    ) : (
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-2xs font-medium ${KIND_PILL[k]}`}>{label}</span>
                    )}
                  </div>
                )
              })()}
              <SeenBy views={(views[c.id] ?? []).filter(v => v.user_id !== c.author_id && v.user_id !== user?.id)} />
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
