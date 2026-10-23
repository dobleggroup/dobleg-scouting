import { supabase } from '@/lib/supabase'

// Comentarios de jugadores compartidos por el staff (tabla player_comments).
// Son historial: se agregan, nunca se editan; cada autor puede borrar los suyos.

export type CommentSentiment = 'positive' | 'neutral' | 'negative'
export type CommentSource = 'ficha' | 'seguimiento_gg' | 'seguimiento_datos'

export interface PlayerComment {
  id: string
  supabase_player_id: number | null
  scout_player_id: string | null
  player_key: string
  player_name: string
  body: string
  sentiment: CommentSentiment | null
  source: CommentSource
  author_id: string | null
  author_name: string
  created_at: string
}

/** Cómo se identifica al jugador. Con más datos, más comentarios se encuentran. */
export interface CommentTarget {
  name: string
  supabasePlayerId?: number | null
  scoutPlayerId?: string | null
}

/** Mismo criterio que player_name_key() en la base: minúsculas, sin acentos, solo letras. */
export function playerNameKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function targetFilter(target: CommentTarget): string {
  const parts: string[] = []
  if (target.supabasePlayerId) parts.push(`supabase_player_id.eq.${target.supabasePlayerId}`)
  if (target.scoutPlayerId) parts.push(`scout_player_id.eq.${target.scoutPlayerId}`)
  // Por nombre solo los que no tienen id de la base (evita mezclar homónimos)
  parts.push(`and(player_key.eq.${playerNameKey(target.name)},supabase_player_id.is.null)`)
  return parts.join(',')
}

export async function fetchPlayerComments(target: CommentTarget): Promise<PlayerComment[]> {
  const { data, error } = await supabase
    .from('player_comments')
    .select('*')
    .or(targetFilter(target))
    .order('created_at', { ascending: false })
  if (error) {
    console.error('Error fetching player comments:', error)
    return []
  }
  return (data ?? []) as PlayerComment[]
}

/** Cantidad y último comentario de varias filas de seguimiento a la vez. */
export async function fetchCommentSummaries(
  targets: { scoutPlayerId: string; supabasePlayerId: number | null; name: string }[]
): Promise<Record<string, { count: number; last: PlayerComment | null }>> {
  const result: Record<string, { count: number; last: PlayerComment | null }> = {}
  if (targets.length === 0) return result
  const scoutIds = targets.map(t => t.scoutPlayerId)
  const apiIds = targets.map(t => t.supabasePlayerId).filter((id): id is number => id != null)
  const keys = targets.map(t => playerNameKey(t.name))

  const filters = [`scout_player_id.in.(${scoutIds.join(',')})`]
  if (apiIds.length) filters.push(`supabase_player_id.in.(${apiIds.join(',')})`)
  filters.push(`and(player_key.in.(${keys.map(k => `"${k}"`).join(',')}),supabase_player_id.is.null)`)

  const { data, error } = await supabase
    .from('player_comments')
    .select('*')
    .or(filters.join(','))
    .order('created_at', { ascending: false })
  if (error) {
    console.error('Error fetching comment summaries:', error)
    return result
  }
  const comments = (data ?? []) as PlayerComment[]
  for (const t of targets) {
    const key = playerNameKey(t.name)
    const mine = comments.filter(c =>
      c.scout_player_id === t.scoutPlayerId ||
      (t.supabasePlayerId != null && c.supabase_player_id === t.supabasePlayerId) ||
      (c.supabase_player_id == null && c.player_key === key)
    )
    result[t.scoutPlayerId] = { count: mine.length, last: mine[0] ?? null }
  }
  return result
}

export async function addPlayerComment(
  target: CommentTarget,
  body: string,
  source: CommentSource,
  authorName: string,
  sentiment: CommentSentiment | null = null,
  createdAt?: string,
): Promise<PlayerComment | null> {
  const { data: auth } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('player_comments')
    .insert({
      supabase_player_id: target.supabasePlayerId ?? null,
      scout_player_id: target.scoutPlayerId ?? null,
      player_key: playerNameKey(target.name),
      player_name: target.name,
      body: body.trim(),
      sentiment,
      source,
      author_id: auth.user?.id,
      author_name: authorName,
      ...(createdAt && { created_at: createdAt }),
    })
    .select()
    .single()
  if (error) {
    console.error('Error adding player comment:', error)
    return null
  }
  return data as PlayerComment
}

export async function deletePlayerComment(id: string): Promise<boolean> {
  const { error } = await supabase.from('player_comments').delete().eq('id', id)
  if (error) {
    console.error('Error deleting player comment:', error)
    return false
  }
  return true
}
