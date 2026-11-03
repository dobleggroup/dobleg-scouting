import { addDays, todayAR, type ScoutSummary } from '@/services/scoutsPanelService'

export type MetricKey =
  | 'days' | 'tracking_now' | 'added' | 'reports' | 'matches' | 'matches_tv' | 'meetings'
  | 'trips' | 'searches' | 'negotiations' | 'comments' | 'contacts'

export interface Metric {
  key: MetricKey
  label: string
  short: string
  value: (s: ScoutSummary) => number
}

export const METRICS: Metric[] = [
  { key: 'days', label: 'Días que entró', short: 'Días', value: s => s.active_days.length },
  { key: 'tracking_now', label: 'En seguimiento', short: 'Seguim.', value: s => s.tracking_now },
  { key: 'added', label: 'Jugadores que agregó', short: 'Agregó', value: s => s.added },
  { key: 'reports', label: 'Reportes', short: 'Reportes', value: s => s.reports },
  { key: 'matches', label: 'Partidos en cancha', short: 'Cancha', value: s => s.matches },
  { key: 'matches_tv', label: 'Partidos por TV', short: 'TV', value: s => s.matches_tv },
  { key: 'meetings', label: 'Reuniones', short: 'Reuniones', value: s => s.meetings },
  { key: 'trips', label: 'Viajes', short: 'Viajes', value: s => s.trips },
  { key: 'searches', label: 'Búsquedas de clubes', short: 'Búsq.', value: s => s.searches },
  { key: 'negotiations', label: 'Negociaciones a cargo', short: 'Negoc.', value: s => s.negotiations },
  { key: 'contacts', label: 'Contactos', short: 'Contactos', value: s => s.contacts },
  { key: 'comments', label: 'Comentarios de jugadores', short: 'Coment.', value: s => s.comments },
]

export const METRIC_BY_KEY = Object.fromEntries(METRICS.map(m => [m.key, m])) as Record<MetricKey, Metric>

/** Los números grandes de cada tarjeta. */
export const CARD_METRICS: MetricKey[] = ['days', 'tracking_now', 'added', 'reports', 'matches', 'meetings', 'trips', 'searches', 'comments']

export type PeriodKey = '30d' | 'month' | 'year' | 'all'

export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: '30d', label: 'Últimos 30 días' },
  { key: 'month', label: 'Este mes' },
  { key: 'year', label: 'Este año' },
  { key: 'all', label: 'Todo' },
]

export function periodRange(p: PeriodKey): { from: string | null; to: string } {
  const today = todayAR()
  if (p === '30d') return { from: addDays(today, -29), to: today }
  if (p === 'month') return { from: today.slice(0, 8) + '01', to: today }
  if (p === 'year') return { from: today.slice(0, 5) + '01-01', to: today }
  return { from: null, to: today }
}

export function periodLabel(p: PeriodKey): string {
  if (p === 'month') {
    const label = new Date().toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' })
    return label.charAt(0).toUpperCase() + label.slice(1)
  }
  if (p === 'year') return `Año ${todayAR().slice(0, 4)}`
  return PERIODS.find(x => x.key === p)!.label
}

/** Orden de mayor a menor para una métrica; empates comparten puesto. */
export function rank(scouts: ScoutSummary[], key: MetricKey): { scout: ScoutSummary; value: number; pos: number }[] {
  const m = METRIC_BY_KEY[key]
  const sorted = [...scouts].map(s => ({ scout: s, value: m.value(s) })).sort((a, b) => b.value - a.value || a.scout.name.localeCompare(b.scout.name))
  let pos = 0
  let prev: number | null = null
  return sorted.map((x, i) => {
    if (x.value !== prev) { pos = i + 1; prev = x.value }
    return { ...x, pos }
  })
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

