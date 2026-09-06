import { supabase } from '@/lib/supabase'

export interface AppNotification {
  id: string
  type: string
  message: string
  link: string | null
  read: boolean
  created_at: string
}

export async function fetchNotifications(limit = 20): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, message, link, read, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) { console.error('Error fetching notifications:', error); return [] }
  return data || []
}

export async function markNotificationRead(id: string): Promise<boolean> {
  const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id)
  if (error) { console.error('Error marking notification read:', error); return false }
  return true
}

export async function markAllNotificationsRead(ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true
  const { error } = await supabase.from('notifications').update({ read: true }).in('id', ids)
  if (error) { console.error('Error marking notifications read:', error); return false }
  return true
}

// El RLS de `notifications` sólo deja crear notificaciones para gente del
// MISMO club (ver migración) -- no hace falta validar acá, la base lo cuida.
export async function createNotification(
  targetUserId: string,
  type: string,
  message: string,
  link?: string
): Promise<boolean> {
  const { error } = await supabase.from('notifications').insert({
    user_id: targetUserId,
    type,
    message,
    link: link || null,
  })
  if (error) { console.error('Error creating notification:', error); return false }
  return true
}
