// Calendario de cada scout: qué hizo y qué cargó cada día. Lo usan la página Scouts
// (semana / mes) y el PDF. Los datos salen de la función `scout_calendar`.
import { supabase } from '@/lib/supabase'
import { addDays, meetingTitle, type ReviewStatus } from '@/services/scoutsPanelService'
import { fullTeamName } from '@/utils/teamNames'

export type CalendarKind =
  | 'entro' | 'partido' | 'reporte' | 'reunion' | 'viaje' | 'busqueda' | 'comentario' | 'agrego' | 'negociacion'

export interface CalendarEvent {
  user_id: string
  day: string
  kind: CalendarKind
  title: string | null
  detail: string | null
  /** partido: presencial/tv · reunión y viaje: pendiente/aceptada · comentario: comentario/contacto/negociacion · reporte: nota */
  status: string | null
  /** reunión: "modo|ciudad" · partido: lugar */
  place: string | null
  players: string | null
  at: string | null
}

export async function fetchScoutCalendar(from: string, to: string, scoutId: string | null): Promise<CalendarEvent[]> {
  const { data, error } = await supabase.rpc('scout_calendar', { p_from: from, p_to: to, p_scout: scoutId })
  if (error) throw error
  return (data ?? []) as CalendarEvent[]
}

// ─── Cómo se ve cada cosa ────────────────────────────────────────────────────

export type ItemKind = Exclude<CalendarKind, 'entro'>

/** Orden en que aparecen dentro de un día (y en la leyenda). */
export const ITEM_KINDS: ItemKind[] = ['partido', 'reporte', 'reunion', 'viaje', 'busqueda', 'negociacion', 'agrego', 'comentario']

export const KIND_META: Record<ItemKind, { label: string; plural: string; dot: string; soft: string; text: string; pdf: string }> = {
  partido:     { label: 'Partido',        plural: 'Partidos',          dot: 'bg-emerald-500', soft: 'bg-emerald-500/10 border-emerald-500/30', text: 'text-emerald-700 dark:text-emerald-300', pdf: '#10B981' },
  reporte:     { label: 'Reporte',        plural: 'Reportes',          dot: 'bg-indigo-500',  soft: 'bg-indigo-500/10 border-indigo-500/30',   text: 'text-indigo-700 dark:text-indigo-300',   pdf: '#6366F1' },
  reunion:     { label: 'Reunión',        plural: 'Reuniones',         dot: 'bg-sky-500',     soft: 'bg-sky-500/10 border-sky-500/30',         text: 'text-sky-700 dark:text-sky-300',         pdf: '#0EA5E9' },
  viaje:       { label: 'Viaje',          plural: 'Días de viaje',     dot: 'bg-violet-500',  soft: 'bg-violet-500/10 border-violet-500/30',   text: 'text-violet-700 dark:text-violet-300',   pdf: '#8B5CF6' },
  busqueda:    { label: 'Búsqueda de club', plural: 'Búsquedas de clubes', dot: 'bg-amber-500', soft: 'bg-amber-500/10 border-amber-500/30',   text: 'text-amber-700 dark:text-amber-300',     pdf: '#F59E0B' },
  negociacion: { label: 'Negociación',    plural: 'Negociaciones',     dot: 'bg-rose-500',    soft: 'bg-rose-500/10 border-rose-500/30',       text: 'text-rose-700 dark:text-rose-300',       pdf: '#F43F5E' },
  agrego:      { label: 'A Seguimiento',  plural: 'Sumados a Seguimiento', dot: 'bg-teal-500', soft: 'bg-teal-500/10 border-teal-500/30',     text: 'text-teal-700 dark:text-teal-300',       pdf: '#14B8A6' },
  comentario:  { label: 'Comentario',     plural: 'Comentarios',       dot: 'bg-slate-400',   soft: 'bg-slate-500/10 border-slate-400/30',     text: 'text-slate-600 dark:text-slate-300',     pdf: '#94A3B8' },
}

export interface CalendarItem {
  kind: ItemKind
  /** Qué es, corto: "Partido", "Reporte", "Búsqueda de club"... */
  tag: string
  /** La frase de lo que hizo: "Fue a ver Boca vs River", "Cargó la búsqueda de Rosario Central". */
  title: string
  /** Para la grilla del mes, donde entra poco: "Boca vs River", "Rosario Central". */
  short: string
  /** Una línea más (lugar, a quién vio, el texto del comentario). */
  detail: string | null
  /** "En cancha", "Por TV", "Online", "Contacto"... */
  badge: string | null
  pending: boolean
}

function meetingMode(place: string | null): { mode: string | null; city: string | null } {
  if (!place) return { mode: null, city: null }
  const [mode, city] = place.split('|')
  return { mode: mode === 'online' ? 'Online' : mode === 'presencial' ? 'Presencial' : null, city: city || null }
}

const join = (...xs: (string | null | undefined)[]) => xs.filter(Boolean).join(' · ') || null

export function toItem(e: CalendarEvent): CalendarItem | null {
  const pending = e.status === 'pendiente'
  const base = { tag: KIND_META[e.kind as ItemKind]?.label ?? '', pending: false, badge: null as string | null }
  switch (e.kind) {
    case 'entro':
      return null
    case 'partido': {
      const label = e.title || 'un partido'
      return {
        ...base, kind: 'partido',
        title: `Fue a ver ${label}`, short: label,
        badge: e.status === 'tv' ? 'Por TV' : e.status === 'presencial' ? 'En cancha' : null,
        detail: join(e.place, e.players ? `Vio a ${e.players}` : null) ?? e.detail,
      }
    }
    case 'reporte':
      return {
        ...base, kind: 'reporte',
        title: `Cargó un reporte de ${e.title || 'un jugador'}`, short: e.title || 'Reporte',
        detail: join(e.detail, e.status ? `Nota ${e.status}` : null),
      }
    case 'reunion': {
      const { mode, city } = meetingMode(e.place)
      const title = meetingTitle({ title: e.title, player: e.players })
      return {
        ...base, kind: 'reunion', title, short: title, badge: mode,
        detail: join(city, e.title && e.players ? `Sobre ${e.players}` : null),
        pending,
      }
    }
    case 'viaje':
      return { ...base, kind: 'viaje', title: `De viaje en ${e.title || '—'}`, short: e.title || 'Viaje', detail: e.detail, pending }
    case 'busqueda': {
      const club = fullTeamName(e.title || 'un club')
      return { ...base, kind: 'busqueda', title: `Cargó la búsqueda de ${club}`, short: club, detail: e.detail ? `Busca: ${e.detail}` : null }
    }
    case 'comentario': {
      const who = e.title || 'un jugador'
      const body = e.detail ? `“${e.detail}”` : null
      if (e.status === 'contacto') return { ...base, kind: 'comentario', tag: 'Contacto', title: `Tuvo un contacto por ${who}`, short: who, detail: body }
      if (e.status === 'negociacion') return { ...base, kind: 'comentario', tag: 'Nota', title: `Escribió en la negociación de ${who}`, short: who, detail: body }
      return { ...base, kind: 'comentario', title: `Comentó sobre ${who}`, short: who, detail: body }
    }
    case 'agrego': {
      const who = e.title || 'un jugador'
      return { ...base, kind: 'agrego', title: `Sumó a ${who} a Seguimiento`, short: who, detail: e.detail ? fullTeamName(e.detail) : null }
    }
    case 'negociacion': {
      const who = e.title || 'un jugador'
      return { ...base, kind: 'negociacion', title: `Empezó la negociación de ${who}`, short: who, detail: e.detail ? fullTeamName(e.detail) : null }
    }
  }
}

export interface CalendarDay {
  entered: boolean
  items: CalendarItem[]
}

/** Agrupa por día (YYYY-MM-DD) y ordena cada día según ITEM_KINDS. */
export function groupByDay(events: CalendarEvent[]): Map<string, CalendarDay> {
  const out = new Map<string, CalendarDay>()
  for (const e of events) {
    const day = out.get(e.day) ?? { entered: false, items: [] }
    if (e.kind === 'entro') day.entered = true
    else {
      const it = toItem(e)
      if (it) day.items.push(it)
    }
    out.set(e.day, day)
  }
  for (const d of out.values()) d.items.sort((a, b) => ITEM_KINDS.indexOf(a.kind) - ITEM_KINDS.indexOf(b.kind))
  return out
}

/** Cuántas de cada cosa en un rango (para la leyenda con números). */
export function countKinds(days: Map<string, CalendarDay>, from: string, to: string): { entered: number; total: number; byKind: Record<ItemKind, number> } {
  const byKind = Object.fromEntries(ITEM_KINDS.map(k => [k, 0])) as Record<ItemKind, number>
  let entered = 0
  let total = 0
  for (let d = from; d <= to; d = addDays(d, 1)) {
    total++
    const day = days.get(d)
    if (!day) continue
    if (day.entered) entered++
    for (const it of day.items) byKind[it.kind]++
  }
  return { entered, total, byKind }
}

// ─── Fechas ──────────────────────────────────────────────────────────────────

/** 0 = lunes … 6 = domingo. */
export function weekdayMon(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}

export function startOfWeek(iso: string): string {
  return addDays(iso, -weekdayMon(iso))
}

export function monthStart(iso: string): string {
  return iso.slice(0, 8) + '01'
}

export function addMonths(iso: string, n: number): string {
  const [y, m] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1 + n, 1))
  return dt.toISOString().slice(0, 10)
}

export function monthEnd(iso: string): string {
  return addDays(addMonths(monthStart(iso), 1), -1)
}

/** Las semanas completas (lunes a domingo) que cubren el mes. */
export function monthGrid(iso: string): string[][] {
  const first = startOfWeek(monthStart(iso))
  const last = monthEnd(iso)
  const weeks: string[][] = []
  for (let w = first; w <= last; w = addDays(w, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(w, i)))
  return weeks
}

export function weekDays(iso: string): string[] {
  const mon = startOfWeek(iso)
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i))
}

function asDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** "Noviembre 2026" */
export function monthLabel(iso: string): string {
  const s = asDate(iso).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** "3 – 9 de noviembre" o "27 de octubre – 2 de noviembre" */
export function weekLabel(iso: string): string {
  const [a, b] = [weekDays(iso)[0], weekDays(iso)[6]]
  const da = asDate(a)
  const db = asDate(b)
  const month = (d: Date) => d.toLocaleDateString('es-AR', { month: 'long' })
  if (da.getMonth() === db.getMonth()) return `${da.getDate()} – ${db.getDate()} de ${month(db)}`
  return `${da.getDate()} de ${month(da)} – ${db.getDate()} de ${month(db)}`
}

/** "lun", "mar"… */
export function weekdayShort(iso: string): string {
  return asDate(iso).toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '')
}

/** "Lunes 3 de noviembre" */
export function longDay(iso: string): string {
  const s = asDate(iso).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export const WEEKDAY_HEAD = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
