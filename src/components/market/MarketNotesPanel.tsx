import { useEffect, useState } from 'react'
import { fetchNotesFor, addNoteTo } from '@/services/marketService'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { LANGUAGE_LOCALES } from '@/constants/translations'
import type { MarketNote } from '@/types/market'

/** Notas más viejas que la 4ta se quedan en el tono más apagado (nunca menos
 * legible que esto) — el resto de la lista, si hay más, comparte ese mismo
 * tono en vez de seguir apagándose sin límite. */
const FADE_STEPS = ['opacity-100', 'opacity-90', 'opacity-75', 'opacity-60']

export default function MarketNotesPanel({
  target,
  refreshSignal,
}: {
  /** `needIds`: búsqueda de club con varias posiciones — muestra las notas de
   * todas y las nuevas se guardan en `needId` (la posición principal). */
  target: { negotiationId?: number; needId?: number; needIds?: number[] }
  /** Incrementar desde el padre para forzar un refetch (ej. después de una
   * reasignación, que inserta una nota de sistema fuera de este componente). */
  refreshSignal?: number
}) {
  const { user, userDisplayName } = useAuth()
  const { t, language } = useLanguage()
  const [notes, setNotes] = useState<MarketNote[]>([])
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)

  const targetKey = target.negotiationId ?? target.needIds?.join(',') ?? target.needId

  useEffect(() => {
    let active = true
    setLoading(true)
    fetchNotesFor(target).then(data => { if (active) setNotes(data) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey, refreshSignal])

  const handleAdd = async () => {
    if (!body.trim()) return
    setSaving(true)
    setError(false)
    const note = await addNoteTo({ negotiationId: target.negotiationId, needId: target.needId }, body.trim(), false, null, user?.id ?? null, userDisplayName || 'Usuario')
    setSaving(false)
    // Si falla, el texto queda escrito y se avisa: antes no pasaba nada y
    // parecía que no se podía escribir.
    if (!note) { setError(true); return }
    setNotes(prev => [note, ...prev])
    setBody('')
  }

  const locale = LANGUAGE_LOCALES[language]
  const formatWhen = (iso: string) => {
    const d = new Date(iso)
    const datePart = d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
    const timePart = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    return `${datePart} · ${timePart}`
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-apple-gray-500 uppercase tracking-wider">
        {t('mercado.notas')}
      </p>

      <div className="flex items-center gap-2">
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdd() } }}
          placeholder={t('mercado.escribirNota')}
          rows={2}
          className="input-apple text-sm w-full resize-none"
        />
        <button
          onClick={handleAdd}
          disabled={!body.trim() || saving}
          className="self-stretch px-4 rounded-lg text-sm font-semibold text-white bg-brand-green hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex-shrink-0"
        >
          {saving ? t('mercado.guardando') : t('mercado.agregar')}
        </button>
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{t('mercado.errorGuardarNota')}</p>}

      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {loading ? (
          <p className="text-xs text-apple-gray-400">{t('mercado.cargandoNotas')}</p>
        ) : notes.length === 0 ? (
          <p className="text-xs text-apple-gray-400">{t('mercado.sinNotas')}</p>
        ) : (
          notes.map((n, i) => (
            <div
              key={n.id}
              className={`p-3 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-800/50 transition-opacity ${FADE_STEPS[Math.min(i, FADE_STEPS.length - 1)]}`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-5 h-5 rounded-full bg-apple-gray-200 dark:bg-apple-gray-700 flex items-center justify-center text-[10px] font-bold text-apple-gray-500 dark:text-apple-gray-300 flex-shrink-0">
                  {(n.author_name || t('mercado.sistema')).slice(0, 1).toUpperCase()}
                </div>
                <span className="text-xs font-bold text-apple-gray-900 dark:text-white truncate">
                  {n.author_name || t('mercado.sistema')}
                </span>
                <span className="text-2xs text-apple-gray-400 flex-shrink-0 tabular-nums ml-auto">{formatWhen(n.created_at)}</span>
              </div>
              <p className={`text-sm leading-snug pl-7 ${n.is_system ? 'italic text-apple-gray-400' : 'text-apple-gray-700 dark:text-apple-gray-200'}`}>
                {n.body}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
