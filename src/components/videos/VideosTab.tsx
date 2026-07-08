import { useMemo, useState } from 'react'
import { useData } from '@/context/DataContext'
import { playerVideoKey, deletePlayerVideo, videoEffectiveDate, freshnessFromMonths } from '@/services/playerVideosService'
import { monthsBetween } from '@/utils/scoring'
import type { EnrichedPlayer } from '@/types'
import type { PlayerVideo, VideoFreshness } from '@/types/videos'
import AddVideoModal from './AddVideoModal'

const DOT: Record<VideoFreshness, string> = {
  green: 'bg-green-500', amber: 'bg-amber-500', red: 'bg-red-500', none: 'bg-apple-gray-300',
}
const LABEL: Record<VideoFreshness, string> = {
  green: 'Actualizado', amber: 'Necesita atención', red: 'Desactualizado', none: 'Sin video',
}

function freshnessOf(v: PlayerVideo): VideoFreshness {
  return freshnessFromMonths(monthsBetween(videoEffectiveDate(v), new Date()))
}

export default function VideosTab({ player }: { player: EnrichedPlayer }) {
  const { playerVideos, refreshPlayerVideos } = useData()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<PlayerVideo | null>(null)

  const key = playerVideoKey(player.Jugador)
  const videos = useMemo(
    () => playerVideos
      .filter(v => v.player_key === key)
      .sort((a, b) => videoEffectiveDate(b).getTime() - videoEffectiveDate(a).getTime()),
    [playerVideos, key],
  )

  const openAdd = () => { setEditing(null); setModalOpen(true) }
  const openEdit = (v: PlayerVideo) => { setEditing(v); setModalOpen(true) }
  const handleDelete = async (v: PlayerVideo) => {
    if (!confirm('¿Eliminar este video?')) return
    if (await deletePlayerVideo(v.id)) await refreshPlayerVideos()
  }

  return (
    <div className="space-y-4 animate-fade-in" id="tab-content-videos">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-apple-gray-800 dark:text-white">Videos</h2>
        <button onClick={openAdd}
          className="px-3 py-2 rounded-lg text-sm font-medium text-white bg-brand-green hover:bg-brand-green/90 transition-colors">
          + Agregar video
        </button>
      </div>

      {videos.length === 0 ? (
        <div className="text-center py-12 text-apple-gray-400">
          <p className="text-sm">Todavía no hay videos cargados para este jugador.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {videos.map(v => {
            const fr = freshnessOf(v)
            return (
              <div key={v.id} className="card-apple overflow-hidden">
                <a href={v.youtube_url} target="_blank" rel="noopener noreferrer" className="block relative">
                  {v.video_id
                    ? <img src={`https://img.youtube.com/vi/${v.video_id}/hqdefault.jpg`} alt="" className="w-full aspect-video object-cover" />
                    : <div className="w-full aspect-video bg-apple-gray-100 dark:bg-apple-gray-800" />}
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center">
                      <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                    </span>
                  </span>
                </a>
                <div className="p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${DOT[fr]}`} />
                    <span className="text-xs text-apple-gray-500 dark:text-apple-gray-400">{LABEL[fr]}</span>
                  </div>
                  {v.title && <p className="text-sm font-medium text-apple-gray-800 dark:text-white">{v.title}</p>}
                  <p className="text-2xs text-apple-gray-400">
                    {v.material_date ? `Material: ${v.material_date}` : `Cargado: ${new Date(v.upload_date).toLocaleDateString()}`}
                  </p>
                  <div className="flex gap-3 pt-1">
                    <button onClick={() => openEdit(v)} className="text-xs text-apple-gray-500 hover:text-brand-green transition-colors">Editar</button>
                    <button onClick={() => handleDelete(v)} className="text-xs text-red-500 hover:text-red-600 transition-colors">Eliminar</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modalOpen && (
        <AddVideoModal
          playerName={player.Jugador}
          existing={editing}
          onClose={() => setModalOpen(false)}
          onSaved={refreshPlayerVideos}
        />
      )}
    </div>
  )
}
