import { supabase } from '@/lib/supabase'

// Página Scouts: cuánto usa la plataforma cada scout y qué trabajo cargó.
// Los datos salen de la función `scouts_panel` (solo responde a las cuentas habilitadas).

export type ActivityKind = 'reunion' | 'viaje'
export type MeetingMode = 'presencial' | 'online'
export type WatchMode = 'presencial' | 'tv'
export type ReviewStatus = 'pendiente' | 'aceptada' | 'rechazada'

export interface ScoutActivity {
  id: number
  kind: ActivityKind
  day: string
  end_day: string | null
  /** Reunión: con quién. */
  title: string | null
  /** Reunión presencial: ciudad. Viaje: a dónde. */
  place: string | null
  mode: MeetingMode | null
  /** Jugadores escritos separados por coma. */
  player: string | null
  /** De esos, los que ya están en las listas de Seguimiento. */
  tracked: string[]
  notes: string | null
  created_by_name: string | null
  created_at: string
  /** Lo que carga un scout queda pendiente hasta que Marcos o Matías lo aceptan. */
  review_status: ReviewStatus
}

export interface MatchSeen {
  day: string
  label: string | null
  competition: string | null
  mode: WatchMode | null
  place: string | null
  players: string | null
}

export interface Trip {
  day: string
  end_day: string | null
  place: string
  detail: string | null
  /** 'viaje' = cargado a mano; 'partido' / 'reunion' = se sumó solo. */
  source: 'viaje' | 'partido' | 'reunion'
  /** id de scout_activities cuando es un viaje cargado a mano. */
  id: number | null
}

export interface ScoutSummary {
  user_id: string
  name: string
  photo_url: string | null
  last_active: string | null
  active_days: string[]
  /** Días que entró en los últimos 30 (sin importar el período elegido). */
  recent_days: string[]
  tracking_now: number
  added: number
  reports: number
  /** Partidos que fue a ver a la cancha. */
  matches: number
  matches_tv: number
  meetings: number
  trips: number
  negotiations: number
  /** Comentarios sobre jugadores (ficha / Seguimiento) + notas en negociaciones. */
  comments: number
  /** Comentarios marcados como contacto (llamada, mensaje). */
  contacts: number
  comments_by_player: { player: string; comments: number; negotiation_notes: number; last: string }[]
  /** Búsquedas de clubes que cargó en Mercado (una por club). */
  searches: number
  search_list: { club: string; day: string; positions: string[] }[]
  match_list: MatchSeen[]
  trip_list: Trip[]
  report_list: { player: string; day: string | null; score: number | null; team: string | null }[]
  activities: ScoutActivity[]
}

export interface ScoutListItem {
  user_id: string
  name: string
}

export async function canSeeScoutsPanel(): Promise<boolean> {
  const { data, error } = await supabase.rpc('can_see_scouts_panel')
  if (error) throw error
  return !!data
}

export async function fetchScoutsPanel(from: string | null, to: string | null): Promise<ScoutSummary[]> {
  const { data, error } = await supabase.rpc('scouts_panel', { p_from: from, p_to: to })
  if (error) throw error
  return (data ?? []) as ScoutSummary[]
}

export interface NewActivity {
  scout_id: string
  scout_name: string
  kind: ActivityKind
  activity_date: string
  end_date?: string | null
  title?: string | null
  place?: string | null
  mode?: MeetingMode | null
  player_name?: string | null
  notes?: string | null
}

export async function createActivity(a: NewActivity, createdByName: string): Promise<string | null> {
  const { error } = await supabase.from('scout_activities').insert({ ...a, created_by_name: createdByName })
  return error ? error.message : null
}

/** "Con el director de Banfield", o "Reunión sobre R. Morínigo" si salió de un comentario. */
export function meetingTitle(a: Pick<ScoutActivity, 'title' | 'player'>): string {
  if (a.title?.trim()) return `Con ${a.title.trim()}`
  return a.player ? `Reunión sobre ${a.player}` : 'Reunión'
}

/** Marcos y Matías Roberti aceptan o rechazan las reuniones y viajes que cargan los scouts. */
export async function canApproveActivities(): Promise<boolean> {
  const { data, error } = await supabase.rpc('can_approve_scout_activities')
  if (error) throw error
  return !!data
}

export async function reviewActivity(id: number, status: 'aceptada' | 'rechazada', reviewerName: string): Promise<string | null> {
  const { error } = await supabase.rpc('review_scout_activity', { p_id: id, p_status: status, p_reviewer_name: reviewerName })
  return error ? error.message : null
}

export async function deleteActivity(id: number): Promise<string | null> {
  const { error } = await supabase.from('scout_activities').delete().eq('id', id)
  return error ? error.message : null
}

// ─── Uso de la plataforma ────────────────────────────────────────────────────

const TOUCH_EVERY_MS = 5 * 60 * 1000
let lastTouch = 0

/** Marca que la cuenta está usando la plataforma hoy (como mucho cada 5 minutos). */
export function touchActivity(): void {
  const now = Date.now()
  if (now - lastTouch < TOUCH_EVERY_MS) return
  lastTouch = now
  void Promise.resolve(supabase.rpc('touch_user_activity')).catch(() => { lastTouch = 0 })
}

// ─── Fechas ──────────────────────────────────────────────────────────────────

/** Fecha de hoy en Argentina, YYYY-MM-DD. */
export function todayAR(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

/** Días entre una fecha (YYYY-MM-DD) y hoy. */
export function daysAgo(iso: string): number {
  const [y, m, d] = todayAR().split('-').map(Number)
  const [y2, m2, d2] = iso.slice(0, 10).split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y2, m2 - 1, d2)) / 86400000)
}

/** "Hoy", "Ayer", "Hace 5 días", "Hace 3 semanas"... */
export function lastActiveLabel(ts: string | null): string {
  if (!ts) return 'Nunca entró'
  const n = daysAgo(new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }))
  if (n <= 0) return 'Hoy'
  if (n === 1) return 'Ayer'
  if (n < 14) return `Hace ${n} días`
  if (n < 60) return `Hace ${Math.round(n / 7)} semanas`
  return `Hace ${Math.round(n / 30)} meses`
}

export function lastActiveDays(ts: string | null): number {
  if (!ts) return 9999
  return daysAgo(new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }))
}

export function formatDay(iso: string | null, withYear = false): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) })
}
