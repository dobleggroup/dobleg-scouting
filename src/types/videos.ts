export type VideoFreshness = 'green' | 'amber' | 'red' | 'none'

export interface PlayerVideo {
  id: number
  player_key: string
  youtube_url: string
  video_id: string | null
  title: string | null
  upload_date: string          // ISO timestamp (default now())
  material_date: string | null // 'YYYY-MM-DD' u null
  added_by: string | null
  added_by_name: string | null
  created_at: string
  updated_at: string
}
