import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import {
  addPlayerComment,
  deletePlayerComment,
  fetchPlayerComments,
  playerNameKey,
  type CommentSentiment,
  type CommentSource,
  type CommentTarget,
  type PlayerComment,
} from '@/services/playerCommentsService'

// Historial de comentarios de un jugador (ficha y listas de seguimiento ven lo
// mismo). Cada comentario queda con quién lo escribió y cuándo.

const SENTIMENT: Record<CommentSentiment, { label: string; dot: string; text: string }> = {
  positive: { label: 'Positivo', dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  neutral: { label: 'Neutral', dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  negative: { label: 'Negativo', dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400' },
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
  const [text, setText] = useState('')
  const [sentiment, setSentiment] = useState<CommentSentiment | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const authorName = userDisplayName || user?.email?.split('@')[0] || 'Staff'

  const load = useCallback(async () => {
    const list = await fetchPlayerComments(target)
    setComments(list)
    onChange?.(list)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.name, target.supabasePlayerId, target.scoutPlayerId])

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
    setSaving(false)
    if (!created) {
      setError('No se pudo guardar. Probá de nuevo.')
      return
    }
    const next = [created, ...(comments ?? [])]
    setComments(next)
    onChange?.(next)
    setText('')
    setSentiment(null)
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
              disabled={!text.trim() || saving}
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
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
