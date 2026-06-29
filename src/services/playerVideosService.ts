import { supabase } from '@/lib/supabase'
import { agencyKey } from '@/services/agencyPlayersService'
import { monthsBetween } from '@/utils/scoring'
import type { PlayerVideo, VideoFreshness } from '@/types/videos'

/** Clave de identidad del jugador (misma normalización que la agencia). */
export const playerVideoKey = agencyKey

const YT_PATTERNS: RegExp[] = [
  /[?&]v=([A-Za-z0-9_-]{11})/,            // watch?v=ID
  /youtu\.be\/([A-Za-z0-9_-]{11})/,       // youtu.be/ID
  /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/, // /shorts/ID
  /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,  // /embed/ID
]

/** Extrae el id de 11 chars de una URL de YouTube. null si no matchea. */
export function parseYouTubeId(url: string): string | null {
  if (!url) return null
  for (const re of YT_PATTERNS) {
    const m = url.match(re)
    if (m) return m[1]
  }
  return null
}

/** Fecha que manda para la frescura: material_date si existe, si no upload_date. */
export function videoEffectiveDate(v: PlayerVideo): Date {
  return new Date(v.material_date || v.upload_date)
}

export function freshnessFromMonths(months: number): Exclude<VideoFreshness, 'none'> {
  if (months < 4) return 'green'
  if (months <= 7) return 'amber'
  return 'red'
}

/** Frescura del jugador = la del video más reciente (mayor fecha efectiva). */
export function computePlayerFreshness(videos: PlayerVideo[]): VideoFreshness {
  if (!videos || videos.length === 0) return 'none'
  const newest = videos.reduce((a, b) =>
    videoEffectiveDate(b).getTime() > videoEffectiveDate(a).getTime() ? b : a
  )
  const months = monthsBetween(videoEffectiveDate(newest), new Date())
  return freshnessFromMonths(months)
}

// ─── Datos ──────────────────────────────────────────────────────────────────────

export async function fetchAllPlayerVideos(): Promise<PlayerVideo[]> {
  const { data, error } = await supabase
    .from('player_videos')
    .select('*')
    .order('material_date', { ascending: false, nullsFirst: false })
  if (error || !data) {
    console.error('fetchAllPlayerVideos error:', error)
    return []
  }
  return data as PlayerVideo[]
}

export interface AddVideoInput {
  playerName: string
  youtubeUrl: string
  title?: string | null
  materialDate?: string | null // 'YYYY-MM-DD'
}

export async function addPlayerVideo(
  input: AddVideoInput,
  userId?: string,
  userName?: string,
): Promise<boolean> {
  const { error } = await supabase.from('player_videos').insert({
    player_key: playerVideoKey(input.playerName),
    youtube_url: input.youtubeUrl,
    video_id: parseYouTubeId(input.youtubeUrl),
    title: input.title ?? null,
    material_date: input.materialDate ?? null,
    added_by: userId ?? null,
    added_by_name: userName ?? null,
  })
  if (error) { console.error('addPlayerVideo error:', error); return false }
  return true
}

export async function updatePlayerVideo(
  id: number,
  patch: { title?: string | null; materialDate?: string | null; youtubeUrl?: string },
): Promise<boolean> {
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.title !== undefined) upd.title = patch.title
  if (patch.materialDate !== undefined) upd.material_date = patch.materialDate
  if (patch.youtubeUrl !== undefined) {
    upd.youtube_url = patch.youtubeUrl
    upd.video_id = parseYouTubeId(patch.youtubeUrl)
  }
  const { error } = await supabase.from('player_videos').update(upd).eq('id', id)
  if (error) { console.error('updatePlayerVideo error:', error); return false }
  return true
}

export async function deletePlayerVideo(id: number): Promise<boolean> {
  const { error } = await supabase.from('player_videos').delete().eq('id', id)
  if (error) { console.error('deletePlayerVideo error:', error); return false }
  return true
}
