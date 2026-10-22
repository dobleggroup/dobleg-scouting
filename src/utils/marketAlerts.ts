export interface AlertableItem {
  id: number
  kind: 'negotiation' | 'need'
  status: string
  assigned_to_id: number | null
  next_followup_date: string | null
}

export interface MarketAlert extends AlertableItem {
  urgency: 'vencido' | 'hoy' | 'manana'
}

const CLOSED_STATUSES = new Set(['cerrado', 'cerrado_exito', 'cerrado_caido'])

function daysBetween(from: Date, to: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round((to.getTime() - from.getTime()) / msPerDay)
}

/**
 * Avisa el día anterior ("mañana"), el mismo día ("hoy") y después, mientras
 * siga sin resolverse ("vencido") — pedido de la agencia: con 3 días de
 * anticipación la campanita se llenaba de cosas que todavía no tocaban. Se
 * excluyen los items cerrados aunque tengan fecha vencida — cerrar una
 * negociación/objetivo apaga su alerta.
 */
export function computeAlerts(items: AlertableItem[], today: Date): MarketAlert[] {
  // Se leen los componentes de fecha LOCALES de `today` (no UTC), igual que
  // `next_followup_date` se parsea con componentes locales (`new Date(y, m-1,
  // d)`) más abajo. `today` debe ser un `Date` real (p.ej. `new Date()` en
  // producción) — usar getters UTC acá rompería la clasificación de alertas
  // durante ~3hs cada noche en Argentina (UTC-3), donde el calendario UTC ya
  // está "un día adelante" del calendario local. Si se necesita construir un
  // `today` de prueba a partir de una fecha fija, usar componentes locales
  // (`new Date(2026, 7, 18)`) y no un string ISO de solo fecha (`new
  // Date('2026-08-18')`), que siempre se parsea como medianoche UTC.
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  const alerts: MarketAlert[] = []
  for (const item of items) {
    if (CLOSED_STATUSES.has(item.status)) continue
    if (!item.next_followup_date) continue
    const [y, m, d] = item.next_followup_date.split('-').map(Number)
    const dueDate = new Date(y, m - 1, d)
    const diff = daysBetween(todayMidnight, dueDate)
    if (diff > 1) continue
    alerts.push({ ...item, urgency: diff < 0 ? 'vencido' : diff === 0 ? 'hoy' : 'manana' })
  }

  const rank = { vencido: 0, hoy: 1, manana: 2 }
  return alerts.sort((a, b) => {
    if (a.urgency !== b.urgency) return rank[a.urgency] - rank[b.urgency]
    return (a.next_followup_date ?? '').localeCompare(b.next_followup_date ?? '')
  })
}

export function countMeetings(notes: { is_meeting: boolean }[]): number {
  return notes.filter(n => n.is_meeting).length
}

export function buildPlayerPhotoUrl(playerApiId: number | null): string | null {
  if (!playerApiId) return null
  return `https://media.api-sports.io/football/players/${playerApiId}.png`
}

export function computeAge(birthDate: string | null): number | null {
  if (!birthDate) return null
  return Math.floor((Date.now() - new Date(birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
}

/**
 * Valida que un string de fecha de un `<input type="date">` sea una fecha
 * real razonable antes de guardarla. El input nativo normalmente sólo emite
 * `yyyy-mm-dd` completo o `''`, pero un typing parcial/fuera de formato
 * (tipeo rápido, autofill, automatización) puede colar un año de más de 4
 * dígitos que Postgres acepta sin problema (DATE no tiene límite superior
 * real) y que después rompe silenciosamente el cálculo de alertas y
 * cualquier `toLocaleDateString`. Sin este chequeo, un fat-finger queda
 * guardado sin ningún error visible.
 */
export function isValidFollowupDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [, yearStr, monthStr, dayStr] = match
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)
  if (year < 2000 || year > 2100) return false
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}
