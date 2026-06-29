import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { addPlayerVideo, updatePlayerVideo, parseYouTubeId } from '@/services/playerVideosService'
import type { PlayerVideo } from '@/types/videos'

interface Props {
  playerName: string
  existing?: PlayerVideo | null
  onClose: () => void
  onSaved: () => void
}

export default function AddVideoModal({ playerName, existing, onClose, onSaved }: Props) {
  const { user, userDisplayName } = useAuth()
  const [url, setUrl] = useState(existing?.youtube_url ?? '')
  const [title, setTitle] = useState(existing?.title ?? '')
  const [materialDate, setMaterialDate] = useState(existing?.material_date ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const videoId = parseYouTubeId(url)

  const handleSave = async () => {
    if (!url.trim()) { setError('Pegá un link de YouTube.'); return }
    if (!videoId) { setError('No reconozco ese link de YouTube.'); return }
    setBusy(true); setError('')
    const name = userDisplayName || user?.email?.split('@')[0] || 'Scout'
    const ok = existing
      ? await updatePlayerVideo(existing.id, {
          youtubeUrl: url.trim(),
          title: title.trim() || null,
          materialDate: materialDate || null,
        })
      : await addPlayerVideo(
          { playerName, youtubeUrl: url.trim(), title: title.trim() || null, materialDate: materialDate || null },
          user?.id, name,
        )
    setBusy(false)
    if (ok) { onSaved(); onClose() } else { setError('No se pudo guardar. Intentá de nuevo.') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-apple-gray-900 rounded-2xl shadow-2xl p-5 space-y-4">
        <h3 className="font-semibold text-apple-gray-800 dark:text-white">{existing ? 'Editar video' : 'Agregar video'}</h3>

        <div className="space-y-1">
          <label className="text-xs font-medium text-apple-gray-500">Link de YouTube</label>
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://youtu.be/..."
            className="w-full px-3 py-2 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-800 text-sm border border-apple-gray-200 dark:border-apple-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-green/40" />
          {videoId && (
            <img src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`} alt="" className="mt-2 w-full rounded-lg" />
          )}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-apple-gray-500">Título (opcional)</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej: vs Boca - resumen"
            className="w-full px-3 py-2 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-800 text-sm border border-apple-gray-200 dark:border-apple-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-green/40" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-apple-gray-500">Fecha del material (opcional)</label>
          <input type="date" value={materialDate ?? ''} onChange={e => setMaterialDate(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-800 text-sm border border-apple-gray-200 dark:border-apple-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-green/40" />
          <p className="text-2xs text-apple-gray-400">Fecha del último partido/material del video. Si la dejás vacía, se usa la fecha de carga para la frescura.</p>
        </div>

        {error && <p className="text-xs text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} disabled={busy}
            className="flex-1 py-2 rounded-lg text-sm text-apple-gray-600 dark:text-apple-gray-300 bg-apple-gray-100 dark:bg-apple-gray-700 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={busy}
            className="flex-1 py-2 rounded-lg text-sm font-semibold text-white bg-brand-green hover:bg-brand-green/90 disabled:opacity-50 transition-colors flex items-center justify-center">
            {busy ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
