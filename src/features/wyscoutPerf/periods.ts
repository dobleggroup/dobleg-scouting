/**
 * Agrupa los meses de un jugador en temporadas, años o meses. La temporada
 * depende de la liga que jugaba ese mes: Argentina, Uruguay, MLS y el resto de
 * América van de enero a diciembre ("2025"); México y Europa de julio a junio
 * ("25/26"). Las copas internacionales toman la temporada de su liga.
 */
import { addTotals, EMPTY_TOTALS, type Totals } from './metrics'

export interface MonthRow {
  player_key: string
  player_name: string
  month: string // YYYY-MM-01
  matches: number
  minutes: number
  positions: string[] | null
  competitions: string[] | null
  sums: Record<string, number>
}

export type Grouping = 'season' | 'year' | 'month'

export interface PeriodTotals extends Totals {
  key: string    // orden cronológico
  label: string  // lo que se muestra
  from: string   // primer mes YYYY-MM
  to: string
  /** Liga principal del período ("Liga MX"), sin copas internacionales. */
  league: string | null
}

/** "Mexico. Liga MX" → "Liga MX"; las copas internacionales no cuentan como liga. */
export function leagueName(competition: string): string | null {
  if (!competition || INTERNATIONAL.test(competition)) return null
  const parts = competition.split('.')
  return (parts.length > 1 ? parts.slice(1).join('.') : parts[0]).trim() || null
}

const INTERNATIONAL = /^(world|south america|n\/c america|north america|europe|africa|asia|oceania|international)\b/i
const SPLIT_COUNTRIES = new Set([
  'mexico', 'england', 'spain', 'italy', 'germany', 'france', 'portugal', 'netherlands', 'belgium',
  'scotland', 'greece', 'turkey', 'russia', 'ukraine', 'austria', 'switzerland', 'denmark', 'poland',
  'czech republic', 'croatia', 'serbia', 'romania', 'cyprus', 'israel', 'saudi arabia', 'united arab emirates',
  'qatar', 'egypt', 'morocco', 'honduras', 'costa rica', 'guatemala', 'el salvador', 'australia', 'india',
])

function countryOf(competition: string): string | null {
  if (!competition || INTERNATIONAL.test(competition)) return null
  return competition.split('.')[0].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim() || null
}

/** Para cada mes, si su liga va de julio a junio. Meses sólo con copas heredan del mes más cercano. */
function splitCalendarByMonth(rows: MonthRow[]): boolean[] {
  const known = rows.map(r => {
    const countries = (r.competitions ?? []).map(countryOf).filter((c): c is string => !!c)
    return countries.length ? SPLIT_COUNTRIES.has(countries[0]) : null
  })
  return known.map((k, i) => {
    if (k !== null) return k
    for (let d = 1; d < rows.length; d++) {
      const prev = known[i - d]
      if (prev !== undefined && prev !== null) return prev
      const next = known[i + d]
      if (next !== undefined && next !== null) return next
    }
    return false
  })
}

export function seasonLabel(month: string, split: boolean): string {
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  if (!split) return String(y)
  const start = m >= 7 ? y : y - 1
  return `${String(start).slice(2)}/${String(start + 1).slice(2)}`
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export function monthLabel(month: string): string {
  return `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(2, 4)}`
}

/** Meses de UN jugador → períodos en orden cronológico. */
export function groupPeriods(rows: MonthRow[], grouping: Grouping): PeriodTotals[] {
  const sorted = [...rows].sort((a, b) => a.month.localeCompare(b.month))
  const split = splitCalendarByMonth(sorted)
  const out = new Map<string, PeriodTotals>()
  const leagueMinutes = new Map<string, Map<string, number>>()
  sorted.forEach((r, i) => {
    const ym = r.month.slice(0, 7)
    const label = grouping === 'month' ? monthLabel(r.month)
      : grouping === 'year' ? r.month.slice(0, 4)
      : seasonLabel(r.month, split[i])
    const key = grouping === 'month' ? ym : `${label}`
    const prev = out.get(key)
    const t = addTotals(prev ?? EMPTY_TOTALS, { matches: r.matches, minutes: r.minutes, s: r.sums })
    const lg = new Map(leagueMinutes.get(key) ?? [])
    for (const c of r.competitions ?? []) {
      const name = leagueName(c)
      if (name) lg.set(name, (lg.get(name) ?? 0) + r.minutes / Math.max(1, (r.competitions ?? []).length))
    }
    leagueMinutes.set(key, lg)
    const league = [...lg.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    out.set(key, { ...t, key, label, from: prev?.from ?? ym, to: ym, league })
  })
  return [...out.values()].sort((a, b) => a.from.localeCompare(b.from))
}

/** Suma los meses en [from, to] (YYYY-MM, inclusive). */
export function totalsBetween(rows: MonthRow[], from: string, to: string): Totals {
  return rows
    .filter(r => r.month.slice(0, 7) >= from && r.month.slice(0, 7) <= to)
    .reduce((acc, r) => addTotals(acc, { matches: r.matches, minutes: r.minutes, s: r.sums }), EMPTY_TOTALS)
}

/** "YYYY-MM" de hace n meses (n=0 → este mes). */
export function monthsAgo(n: number, today = new Date()): string {
  const d = new Date(today.getFullYear(), today.getMonth() - n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
