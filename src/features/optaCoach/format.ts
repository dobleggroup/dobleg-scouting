import type { OptaMatch } from '@/features/opta/data'

const TZ = 'America/Argentina/Buenos_Aires'
const at = (m: OptaMatch) => new Date(`${m.date}T${m.time ?? '12:00:00'}Z`)

/** "domingo 18 de octubre, 20:15 h" (hora argentina; Opta la da en UTC). */
export function kickoff(m: OptaMatch): string {
  const d = at(m)
  const day = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }).replace(',', '')
  return m.time ? `${day}, ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ })} h` : day
}
/** "14 de octubre" */
export const dayMonth = (m: OptaMatch) => at(m).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', timeZone: TZ })
export const dec1 = (v: number) => v.toFixed(1).replace('.', ',')

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
/** "29 de enero de 1982" */
export function longDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${d} de ${MONTHS[m - 1]} de ${y}`
}
