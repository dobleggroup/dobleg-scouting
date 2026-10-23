import { supabase } from '@/lib/supabase'
import { notifyAccounts } from '@/services/notificationsService'
import { memberAccounts } from '@/services/marketService'
import type { TeamMember } from '@/types/market'

// ─── Notas del calendario de Mercado ─────────────────────────────────────────
// Cada nota avisa a quien está asignado o, si no tiene asignado, a quien la
// escribió (recordatorio propio).

export interface CalendarNote {
  id: number
  note_date: string
  body: string
  assigned_to_id: number | null
  assigned_to_name: string | null
  assigned_user_id: string | null
  created_by: string
  created_by_name: string
  done: boolean
  done_at: string | null
  created_at: string
}

/**
 * ¿Le toca a esta persona? Si la nota está asignada, a la persona del equipo
 * (con cualquiera de sus cuentas); si no, a quien la escribió.
 */
export function isNoteForMe(
  note: Pick<CalendarNote, 'assigned_to_id' | 'created_by'>,
  meMemberId: number | null,
  userId: string | null | undefined,
): boolean {
  if (note.assigned_to_id != null) return meMemberId != null && note.assigned_to_id === meMemberId
  return !!userId && note.created_by === userId
}

export async function fetchCalendarNotes(): Promise<CalendarNote[]> {
  const { data, error } = await supabase
    .from('market_calendar_notes')
    .select('*')
    .order('note_date', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) {
    console.error('Error fetching calendar notes:', error)
    return []
  }
  return (data ?? []) as CalendarNote[]
}

function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
}

export async function createCalendarNote(
  input: { note_date: string; body: string; assignee: TeamMember | null },
  userId: string,
  userName: string,
): Promise<CalendarNote | null> {
  const { data, error } = await supabase
    .from('market_calendar_notes')
    .insert({
      note_date: input.note_date,
      body: input.body.trim(),
      assigned_to_id: input.assignee?.id ?? null,
      assigned_to_name: input.assignee?.name ?? null,
      assigned_user_id: input.assignee?.user_id ?? null,
      created_by: userId,
      created_by_name: userName,
    })
    .select()
    .single()
  if (error) {
    console.error('Error creating calendar note:', error)
    return null
  }
  // Aviso inmediato a todas las cuentas del asignado (a uno mismo no hace
  // falta: le aparece en la campanita cuando llegue la fecha).
  const note = data as CalendarNote
  if (input.assignee) {
    await notifyAccounts(
      memberAccounts(input.assignee),
      'mercado_nota',
      `${userName} te dejó una nota para el ${formatDay(note.note_date)}: ${note.body.slice(0, 80)}`,
      `/mercado?nota=${note.id}`,
      userId,
    )
  }
  return note
}

export async function setCalendarNoteDone(id: number, done: boolean): Promise<CalendarNote | null> {
  const { data, error } = await supabase
    .from('market_calendar_notes')
    .update({ done, done_at: done ? new Date().toISOString() : null })
    .eq('id', id)
    .select()
    .single()
  if (error) {
    console.error('Error updating calendar note:', error)
    return null
  }
  return data as CalendarNote
}

export async function deleteCalendarNote(id: number): Promise<boolean> {
  const { error } = await supabase.from('market_calendar_notes').delete().eq('id', id)
  if (error) {
    console.error('Error deleting calendar note:', error)
    return false
  }
  return true
}

// ─── Contactos ───────────────────────────────────────────────────────────────

export type ContactRole =
  | 'director_deportivo' | 'manager' | 'presidente' | 'secretario_tecnico'
  | 'entrenador' | 'scout' | 'agente' | 'otro'

export const CONTACT_ROLE_LABEL: Record<ContactRole, string> = {
  director_deportivo: 'Director deportivo',
  manager: 'Mánager',
  presidente: 'Presidente',
  secretario_tecnico: 'Secretario técnico',
  entrenador: 'Entrenador',
  scout: 'Scout / ojeador',
  agente: 'Agente / intermediario',
  otro: 'Otro',
}

export interface MarketContact {
  id: number
  full_name: string
  role: ContactRole
  team_id: number | null
  team_name: string | null
  country: string | null
  phone: string | null
  email: string | null
  notes: string | null
  last_contact_date: string | null
  created_by: string | null
  created_by_name: string | null
  created_at: string
  updated_at: string
}

export type ContactInput = Omit<MarketContact, 'id' | 'created_by' | 'created_by_name' | 'created_at' | 'updated_at'>

export async function fetchContacts(): Promise<MarketContact[]> {
  const { data, error } = await supabase
    .from('market_contacts')
    .select('*')
    .order('team_name', { ascending: true, nullsFirst: false })
    .order('full_name', { ascending: true })
  if (error) {
    console.error('Error fetching contacts:', error)
    return []
  }
  return (data ?? []) as MarketContact[]
}

export async function saveContact(input: ContactInput, id: number | null, userName: string): Promise<MarketContact | null> {
  const clean = {
    ...input,
    full_name: input.full_name.trim(),
    team_name: input.team_name?.trim() || null,
    country: input.country?.trim() || null,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    notes: input.notes?.trim() || null,
  }
  const query = id
    ? supabase.from('market_contacts').update({ ...clean, updated_at: new Date().toISOString() }).eq('id', id)
    : supabase.from('market_contacts').insert({ ...clean, created_by_name: userName })
  const { data, error } = await query.select().single()
  if (error) {
    console.error('Error saving contact:', error)
    return null
  }
  return data as MarketContact
}

export async function deleteContact(id: number): Promise<boolean> {
  const { error } = await supabase.from('market_contacts').delete().eq('id', id)
  if (error) {
    console.error('Error deleting contact:', error)
    return false
  }
  return true
}
