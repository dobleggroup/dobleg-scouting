/**
 * Minuta mensual: conclusiones de un mes de la cartera, en castellano simple.
 * Todo puro (sin red): recibe los partidos, Wyscout, GPS, valores y contratos
 * ya cargados y devuelve lo que muestran el mail y la página de Rendimiento
 * individual. Regla de la casa: nunca se concluye por un solo número.
 */
import type { Appearance, TeamFixture } from '@/features/tablero/tableroData'
import { dominantGroup, fmtMetric, isRate, lowerFirst, metricsFor, type MetricDef, type PosGroup, type Totals } from '@/features/wyscoutPerf/metrics'

// ─── Tipos de entrada (los arma el cargador) ─────────────────────────────────

/** `isReserve`: en la lista de la agencia figura como jugador de Reserva (no se le pide jugar en Primera). */
export interface MinutaPlayer { key: string; fullName: string; shortName: string; team: string; apiTeamId: number | null; isReserve?: boolean }
export interface WyMatch { key: string; date: string; label: string; competition: string | null; position: string | null; minutes: number; stats: Record<string, number> }
export interface GpsRow { key: string; date: string; rival: string | null; minutes: number | null; metrics: Record<string, number> }
export interface Negotiation { player: string; team: string; status: string; source: string | null; createdAt: string; updatedAt: string; followup: string | null }
export interface CoachMonth {
  key: string; name: string; status: 'activo' | 'sin_club'; club: string | null; league: string | null; teamId: number | null
  matches: Array<{ date: string; rival: string; home: boolean; gf: number; ga: number }>
  standing: { rank: number; group: string; points: number; played: number; description: string | null; groupSize: number } | null
}

export interface MinutaData {
  month: string // YYYY-MM
  players: MinutaPlayer[]
  apps: Appearance[]
  teamFixtures: TeamFixture[]
  teamAlias: Map<number, number>
  teamNames: Map<number, string>
  wyscout: WyMatch[]
  gps: GpsRow[]
  values: Map<string, Array<{ date: string; eur: number }>>
  contracts: Map<string, string>
  classes: Map<string, 'A' | 'B' | 'C'>
  groups: Map<string, PosGroup>
  negotiations: Negotiation[]
  coaches: CoachMonth[]
}

// ─── Fechas ─────────────────────────────────────────────────────────────────

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export const monthName = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1]
export const monthTitle = (ym: string) => `${monthName(ym)[0].toUpperCase()}${monthName(ym).slice(1)} ${ym.slice(0, 4)}`

export function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** El envío sale el 6 del mes siguiente. */
export const sendDate = (ym: string) => `${shiftMonth(ym, 1)}-06`

export function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${d} de ${MONTHS[m - 1]}${y !== Number(sendDateYear) ? ` de ${y}` : ''}`
}
let sendDateYear = ''

export function fmtEur(v: number): string {
  if (v >= 1_000_000) return `€${(v / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: v >= 10_000_000 ? 0 : 1 })} M`
  if (v >= 1000) return `€${Math.round(v / 1000)} mil`
  return `€${v}`
}

const fmt1 = (v: number) => v.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const SAME_MATCH_MS = 36 * 60 * 60 * 1000

// ─── Salida ─────────────────────────────────────────────────────────────────

export type Tone = 'good' | 'bad' | 'neutral'
export type Quadrant = 'consolidado' | 'pidePista' | 'aMejorar' | 'enRiesgo'
export type Role = 'titular' | 'alterna' | 'suplente' | 'noJugo' | 'noFigura' | 'soloReserva' | 'sinDatos'

export interface MonthNumbers { matches: number; minutes: number; starts: number; goals: number; assists: number }

export interface WyItem { metric: MetricDef; value: number; ref: number; text: string }
export interface WyTally { better: WyItem[]; worse: WyItem[]; total: number; minutes: number }

export interface GpsSummary {
  matches: number
  mpm: number | null; mpmRef: number | null
  hsr90: number | null; hsr90Ref: number | null
  vmax: number | null; vmaxRef: number | null
}

export interface PlayerMonth {
  key: string
  name: string
  shortName: string
  club: string
  cls: 'A' | 'B' | 'C' | null
  group: PosGroup | null
  role: Role
  /** Del mes, con la fuente que más partidos tiene (API/Sofascore o Wyscout). */
  nums: MonthNumbers
  prevNums: MonthNumbers
  /** Partidos de Reserva / Proyección en el mes (Wyscout). */
  reserve: MonthNumbers
  /** Jugador de Reserva según la lista de la agencia. */
  isReserve: boolean
  teamMatches: number
  share: number | null
  baseShare: number | null
  rating: number | null
  ratedMatches: number
  baseRating: number | null
  wy: WyTally | null
  /** El Wyscout del mes es de Reserva (no jugó en Primera). */
  wyReserve: boolean
  /** Sin con qué comparar: sus números del mes en las métricas principales del puesto. */
  wySnapshot: string | null
  gps: GpsSummary | null
  value: { now: number; before: number | null } | null
  contractEnd: string | null
  /** Meses que le quedan de contrato a la fecha del envío. */
  contractMonths: number | null
  sources: { partidos: boolean; wyscout: boolean; gps: boolean }
  quadrant: Quadrant | null
  formScore: number | null
  tone: Tone
  headline: string
  detail: string[]
  /** El mismo veredicto, mes por mes, de los últimos 6 (el más viejo primero). */
  history: MonthMark[]
  /** Patrón de esos meses: "Flojo en 4 de los últimos 5 meses". */
  pattern: { text: string; tone: Tone } | null
}

export interface MonthMark { month: string; tone: Tone | null; role: Role; rating: number | null }

export interface ActionItem { tone: Tone; tag: string; title: string; text: string; key: string; priority: number }

export interface Kpi { label: string; value: number; prev: number; fmt?: (v: number) => string; hint?: string }

export interface MinutaReport {
  month: string
  title: string
  sendDate: string
  summary: string[]
  kpis: Kpi[]
  actions: ActionItem[]
  risers: PlayerMonth[]
  fallers: PlayerMonth[]
  quadrants: Record<Quadrant, PlayerMonth[]>
  portfolio: {
    now: number
    before: number
    movers: Array<{ p: PlayerMonth; delta: number; pct: number }>
    /** Valor total a fin de cada uno de los últimos 12 meses (el último es el de la minuta). */
    history: Array<{ month: string; eur: number }>
    /** Los que más pesan en el total. */
    top: Array<{ p: PlayerMonth; share: number }>
    /** Buen momento y valor quieto hace 3 meses: para salir a ofrecerlos. */
    undervalued: PlayerMonth[]
  }
  contracts: Array<{ p: PlayerMonth; date: string; months: number }>
  negotiations: Negotiation[]
  coaches: CoachMonth[]
  players: PlayerMonth[]
  coverage: { full: number; none: PlayerMonth[]; noWyscout: PlayerMonth[]; gps: number; total: number }
  /** Jugadores con un patrón de varios meses, primero los malos. */
  patterns: PlayerMonth[]
}

// ─── Cálculo ────────────────────────────────────────────────────────────────

const STARTER = 55
export const QUAD_SHARE = 0.5
export const QUAD_RATING = 6.8

function inMonth(dateIso: string, from: string, to: string) {
  const ym = dateIso.slice(0, 7)
  return ym >= from && ym <= to
}

function numbersFromApps(list: Appearance[]): MonthNumbers {
  const played = list.filter(a => a.minutes > 0)
  return {
    matches: played.length,
    minutes: played.reduce((s, a) => s + a.minutes, 0),
    starts: played.filter(a => a.minutes >= STARTER).length,
    goals: played.reduce((s, a) => s + a.goals, 0),
    assists: played.reduce((s, a) => s + a.assists, 0),
  }
}

function numbersFromWy(list: WyMatch[]): MonthNumbers {
  const played = list.filter(m => m.minutes > 0)
  return {
    matches: played.length,
    minutes: played.reduce((s, m) => s + m.minutes, 0),
    starts: played.filter(m => m.minutes >= STARTER).length,
    goals: played.reduce((s, m) => s + (m.stats.goles ?? 0), 0),
    assists: played.reduce((s, m) => s + (m.stats.asistencias ?? 0), 0),
  }
}

/** Reserva, Proyección, juveniles: no cuentan como partidos de Primera. */
const RESERVE = /proyecci|reserv|\bres\.|\bu-?\d{2}\b|sub-?\d{2}|youth|juvenil/i
const isReserve = (m: WyMatch) => RESERVE.test(m.competition ?? '') || RESERVE.test(m.label)

const best = (a: MonthNumbers, b: MonthNumbers) => (b.matches > a.matches || (b.matches === a.matches && b.minutes > a.minutes) ? b : a)

function totalsOf(list: WyMatch[]): Totals {
  const s: Record<string, number> = {}
  let minutes = 0
  for (const m of list) {
    minutes += m.minutes
    for (const [k, v] of Object.entries(m.stats)) s[k] = (s[k] ?? 0) + v
  }
  return { matches: list.length, minutes, s }
}

/**
 * El mes contra sus 6 meses anteriores, métrica por métrica de su puesto.
 * Una diferencia cuenta si es clara: 5 puntos en los %, y en "por partido"
 * un 25% y al menos 3 jugadas de diferencia en sus minutos del mes.
 */
function wyTally(month: WyMatch[], base: WyMatch[], group: PosGroup | null, minCur = 180, minRef = 450): WyTally | null {
  const cur = totalsOf(month), ref = totalsOf(base)
  if (cur.minutes < minCur || ref.minutes < minRef) return null
  const better: WyItem[] = [], worse: WyItem[] = []
  let total = 0
  for (const m of metricsFor(group).filter(x => isRate(x) && !x.signed)) {
    if (m.tries && ((cur.s[m.tries] ?? 0) < 20 || (ref.s[m.tries] ?? 0) < 30)) continue
    const v = m.compute(cur), r = m.compute(ref)
    if (v === null || r === null) continue
    total++
    let gap: number | null = null
    if (m.unit === '%') gap = Math.abs(v - r) >= 5 ? (v - r) / 10 : null
    else if (Math.abs(r) >= 0.05 && (Math.abs(v - r) * cur.minutes) / 90 >= 3 && Math.abs(v - r) / Math.abs(r) >= 0.25) gap = (v - r) / Math.abs(r)
    if (gap === null) continue
    if (m.lowerIsBetter) gap = -gap
    const item = { metric: m, value: v, ref: r, text: `${lowerFirst(m.label)} ${fmtMetric(m, v)} (venía ${fmtMetric(m, r)})`, score: Math.abs(gap) + (m.headline ? 0.2 : 0) }
    ;(gap > 0 ? better : worse).push(item)
  }
  const byScore = (a: any, b: any) => b.score - a.score
  better.sort(byScore); worse.sort(byScore)
  return { better, worse, total, minutes: cur.minutes }
}

const pick = (m: Record<string, number>, keys: string[]) => {
  for (const k of keys) if (Number.isFinite(m[k]) && m[k] > 0) return m[k]
  return null
}

function gpsRow(r: GpsRow) {
  const min = r.minutes ?? null
  const dist = pick(r.metrics, ['distancia_total', 'dist_total'])
  const rawMpm = pick(r.metrics, ['metros_por_min', 'drel_m_min', 'mts_min']) ?? (dist && min ? dist / min : null)
  // Un futbolista corre 80-140 m/min: fuera de eso el archivo trae mal los minutos.
  const mpm = rawMpm != null && rawMpm >= 70 && rawMpm <= 160 ? rawMpm : null
  const hsr = pick(r.metrics, ['hsr', 'hsr_dist', 'hsr_distance', 'abs_hsr', 'dist_20km_h', 'hsr_20_km_h'])
  const vmax = pick(r.metrics, ['vel_max', 'smax_kmh', 'max_vel_km_h'])
  return { mpm, hsr90: hsr && min && min >= 30 ? (hsr / min) * 90 : null, vmax: vmax && vmax < 45 ? vmax : null }
}

function gpsSummary(monthAll: GpsRow[], beforeAll: GpsRow[]): GpsSummary | null {
  // Con pocos minutos los "por minuto" se disparan: sólo partidos de 30' o más.
  const ok = (r: GpsRow) => (r.minutes ?? 0) >= 30
  const month = monthAll.filter(ok), before = beforeAll.filter(ok)
  if (!month.length) return null
  const cur = month.map(gpsRow), ref = before.map(gpsRow)
  const val = (xs: Array<number | null>) => avg(xs.filter((x): x is number => x != null))
  const refOk = (xs: Array<number | null>) => (xs.filter(x => x != null).length >= 2 ? val(xs) : null)
  const max = (xs: Array<number | null>) => { const l = xs.filter((x): x is number => x != null); return l.length ? Math.max(...l) : null }
  return {
    matches: month.length,
    mpm: val(cur.map(c => c.mpm)), mpmRef: refOk(ref.map(c => c.mpm)),
    hsr90: val(cur.map(c => c.hsr90)), hsr90Ref: refOk(ref.map(c => c.hsr90)),
    vmax: max(cur.map(c => c.vmax)), vmaxRef: ref.filter(c => c.vmax != null).length >= 2 ? max(ref.map(c => c.vmax)) : null,
  }
}

function countMatches(fixtures: TeamFixture[], alias: Map<number, number>, teamId: number, from: string, to: string) {
  const times = fixtures
    .filter(f => (alias.get(f.teamId) ?? f.teamId) === teamId && inMonth(dayKey(f.date), from, to))
    .map(f => new Date(f.date).getTime()).sort((a, b) => a - b)
  let n = 0, last = -Infinity
  for (const t of times) { if (t - last >= SAME_MATCH_MS) n++; last = t }
  return n
}

const dayKey = (d: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(d))

function valueAt(list: Array<{ date: string; eur: number }> | undefined, until: string): number | null {
  if (!list) return null
  let v: number | null = null
  for (const r of list) if (r.date <= until) v = r.eur
  return v
}

function monthsBetween(fromIso: string, toIso: string) {
  const a = new Date(fromIso), b = new Date(toIso)
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + (b.getDate() >= a.getDate() ? 0 : -1)
}

const GROUP_ONE: Record<PosGroup, string> = { ARQ: 'arquero', DEF: 'central', LAT: 'lateral', VC: 'volante central', MED: 'volante', EXT: 'extremo', DEL: 'delantero' }

function analyzePlayer(d: MinutaData, p: MinutaPlayer): PlayerMonth {
  const M = d.month
  const prev = shiftMonth(M, -1)
  const base0 = shiftMonth(M, -6)
  const mine = d.apps.filter(a => a.fullName === p.fullName)
  const monthApps = mine.filter(a => a.dayKey.slice(0, 7) === M)
  const prevApps = mine.filter(a => a.dayKey.slice(0, 7) === prev)
  const baseApps = mine.filter(a => inMonth(a.dayKey, base0, prev))
  const wy = d.wyscout.filter(w => w.key === p.key)
  const wyFirst = wy.filter(w => !isReserve(w))
  const wyMonth = wyFirst.filter(w => w.date.slice(0, 7) === M)
  const wyPrev = wyFirst.filter(w => w.date.slice(0, 7) === prev)
  const wyBase = wyFirst.filter(w => inMonth(w.date, base0, prev))
  const reserve = numbersFromWy(wy.filter(w => isReserve(w) && w.date.slice(0, 7) === M))

  const nums = best(numbersFromApps(monthApps), numbersFromWy(wyMonth))
  const prevNums = best(numbersFromApps(prevApps), numbersFromWy(wyPrev))

  // Club del mes = el del último partido del mes (o el de la lista).
  // Club del mes: el de sus partidos del mes; si no jugó, el de la lista de la
  // agencia (un partido viejo puede ser de un club anterior: caso Ciccioli/Aucas).
  const lastApp = [...monthApps].pop()
  const teamId = lastApp ? (d.teamAlias.get(lastApp.teamId) ?? lastApp.teamId) : (p.apiTeamId != null ? (d.teamAlias.get(p.apiTeamId) ?? p.apiTeamId) : null)
  const teamMatches = teamId != null ? countMatches(d.teamFixtures, d.teamAlias, teamId, M, M) : 0
  const baseTeam = teamId != null ? countMatches(d.teamFixtures, d.teamAlias, teamId, base0, prev) : 0
  const ownMin = monthApps.filter(a => (d.teamAlias.get(a.teamId) ?? a.teamId) === teamId).reduce((s, a) => s + a.minutes, 0)
  const baseMin = baseApps.filter(a => (d.teamAlias.get(a.teamId) ?? a.teamId) === teamId).reduce((s, a) => s + a.minutes, 0)
  // API/Sofascore manda (Wyscout cuenta el tiempo agregado y suma de más).
  const shareMin = monthApps.some(a => a.minutes > 0) ? ownMin : Math.min(nums.minutes, nums.matches * 90)
  const share = teamMatches >= 2 ? Math.min(1, shareMin / (teamMatches * 90)) : null
  const baseShare = baseTeam >= 4 ? Math.min(1, baseMin / (baseTeam * 90)) : null

  const ratings = monthApps.filter(a => a.minutes > 0 && a.rating != null).map(a => a.rating!)
  const baseRatings = baseApps.filter(a => a.minutes > 0 && a.rating != null).map(a => a.rating!)
  const rating = ratings.length >= 2 ? avg(ratings) : null
  const baseRating = baseRatings.length >= 3 ? avg(baseRatings) : null

  const group = d.groups.get(p.key) ?? dominantGroup(wy.slice(-30).map(w => w.position))
  let tally = group === 'ARQ' ? null : wyTally(wyMonth, wyBase, group)
  // Si no jugó en Primera, Reserva: contra sus 6 meses anteriores (de cualquier nivel).
  const wyReserveMonth = wy.filter(w => isReserve(w) && w.date.slice(0, 7) === M)
  const wyReserve = !wyMonth.length && wyReserveMonth.length > 0 && group !== 'ARQ'
  if (wyReserve) tally = wyTally(wyReserveMonth, wy.filter(w => inMonth(w.date, base0, prev)), group, 90, 270)
  let wySnapshot: string | null = null
  if (wyReserve && !tally) {
    const t = totalsOf(wyReserveMonth)
    if (t.minutes >= 90) {
      const vals = metricsFor(group).filter(m => m.headline && isRate(m))
        .map(m => ({ m, v: m.compute(t) })).filter(x => x.v !== null).slice(0, 3)
      if (vals.length) wySnapshot = vals.map(x => `${lowerFirst(x.m.label)} ${fmtMetric(x.m, x.v)}`).join(', ')
    }
  }

  const gpsAll = d.gps.filter(g => g.key === p.key)
  const gps = gpsSummary(gpsAll.filter(g => g.date.slice(0, 7) === M), gpsAll.filter(g => g.date.slice(0, 7) < M))

  const endM = `${M}-31`, endPrev = `${prev}-31`
  const vNow = valueAt(d.values.get(p.key), endM)
  const vBefore = valueAt(d.values.get(p.key), endPrev)
  const contractEnd = d.contracts.get(p.key) ?? null
  const send = sendDate(M)
  const contractMonths = contractEnd && contractEnd >= send ? monthsBetween(send, contractEnd) : contractEnd ? -1 : null

  const inSquad = monthApps.length > 0 || wyMonth.length > 0
  let role: Role
  if (nums.matches === 0 && reserve.matches > 0) role = 'soloReserva'
  else if (!inSquad && (teamMatches === 0 || p.isReserve)) role = 'sinDatos'
  else if (!inSquad) role = 'noFigura'
  else if (nums.matches === 0) role = 'noJugo'
  else {
    const st = share ?? nums.starts / Math.max(teamMatches, nums.matches)
    role = st >= 0.7 ? 'titular' : st >= 0.35 ? 'alterna' : 'suplente'
  }

  const quadrant: Quadrant | null = share != null && rating != null
    ? (share >= QUAD_SHARE ? (rating >= QUAD_RATING ? 'consolidado' : 'aMejorar') : (rating >= QUAD_RATING ? 'pidePista' : 'enRiesgo'))
    : share != null && nums.matches === 0 && teamMatches >= 2 && role !== 'noFigura' ? 'enRiesgo' : null

  const ratingDelta = rating != null && baseRating != null ? rating - baseRating : null
  const wyNet = tally && tally.total >= 4 ? tally.better.length - tally.worse.length : null
  const formScore = ratingDelta != null || wyNet != null ? (ratingDelta ?? 0) + 0.12 * (wyNet ?? 0) : null

  const out: PlayerMonth = {
    key: p.key, name: p.fullName, shortName: p.shortName,
    club: (lastApp && teamId != null ? d.teamNames.get(teamId) : null) ?? p.team,
    cls: d.classes.get(p.key) ?? null, group, role, nums, prevNums, reserve, isReserve: !!p.isReserve, teamMatches, share, baseShare,
    rating, ratedMatches: ratings.length, baseRating, wy: tally, wyReserve, wySnapshot, gps,
    value: vNow != null ? { now: vNow, before: vBefore } : null,
    contractEnd, contractMonths,
    sources: { partidos: monthApps.length > 0, wyscout: wyMonth.length > 0 || reserve.matches > 0, gps: gpsAll.some(g => g.date.slice(0, 7) === M) },
    quadrant, formScore, tone: 'neutral', headline: '', detail: [], history: [], pattern: null,
  }
  describe(out)
  return out
}

/** Una oración que resume el mes + los renglones de respaldo. */
function describe(p: PlayerMonth) {
  const n = p.nums
  const roleText: Record<Role, string> = {
    titular: 'Titular', alterna: 'Alternó entre titular y suplente', suplente: 'Jugó poco, más que nada entrando desde el banco',
    noJugo: p.teamMatches ? `Estuvo en el banco y no sumó minutos en los ${p.teamMatches} partidos de su equipo` : 'No sumó minutos',
    noFigura: `No figuró en ninguno de los ${p.teamMatches} partidos de ${p.club} (no fue convocado o la fuente no lo registra)`,
    soloReserva: `${p.isReserve ? 'Jugó en Reserva' : 'Sólo jugó en Reserva'}: ${plural(p.reserve.matches, 'partido', 'partidos')}, ${p.reserve.minutes}'`,
    sinDatos: 'Sin datos del mes',
  }
  const parts: string[] = [roleText[p.role]]
  if (n.goals || n.assists) parts.push([n.goals ? plural(n.goals, 'gol', 'goles') : '', n.assists ? plural(n.assists, 'asistencia', 'asistencias') : ''].filter(Boolean).join(' y '))

  let good = 0, bad = 0
  if (p.rating != null && p.baseRating != null) {
    const dlt = p.rating - p.baseRating
    if (dlt >= 0.3) good++
    // Una nota de 7 o más no es un mes flojo aunque venga de notas más altas.
    if (dlt <= -0.3 && p.rating < 7) bad++
  }
  if (p.wy && p.wy.total >= 4) {
    const b = p.wy.better.length, w = p.wy.worse.length
    if (b >= 3 && b >= w + 2) good++
    if (w >= 3 && w >= b + 2) bad++
  }
  if (p.baseShare != null && p.share != null && p.baseShare >= 0.6 && p.share < 0.35) bad++
  if (p.role === 'noJugo' || p.role === 'noFigura') bad++
  if (p.rating != null && p.rating >= 7.3 && p.role === 'titular') good++

  if (p.reserve.matches && p.role !== 'soloReserva') parts.push(`además ${plural(p.reserve.matches, 'partido', 'partidos')} en Reserva`)
  p.tone = good > bad ? 'good' : bad > good ? 'bad' : 'neutral'
  const mood = p.role === 'sinDatos' ? ''
    : p.role === 'soloReserva' ? (p.tone === 'good' ? 'Buen mes en Reserva' : p.tone === 'bad' ? 'Mes flojo en Reserva' : '')
    : p.tone === 'good' ? 'Buen mes' : p.tone === 'bad' ? 'Mes flojo' : 'Mes parejo'
  p.headline = mood ? `${mood}. ${parts.join(', ')}.` : `${parts.join(', ')}.`

  const det: string[] = []
  if (p.rating != null) {
    det.push(`Nota promedio ${fmt1(p.rating)} en ${plural(p.ratedMatches, 'partido', 'partidos')}${p.baseRating != null ? ` (venía de ${fmt1(p.baseRating)} en los 6 meses anteriores)` : ''}.`)
  }
  if (p.wy && p.wy.total >= 4) {
    const b = p.wy.better, w = p.wy.worse
    const pos = p.group ? ` de ${GROUP_ONE[p.group]}` : ''
    const src = p.wyReserve ? 'Wyscout en Reserva' : 'Wyscout'
    if (b.length || w.length) {
      det.push(`${src}, contra sus 6 meses anteriores:`
        + (b.length ? ` mejoró en ${b.slice(0, 2).map(i => i.text).join('; ')}.` : ' no mejoró en nada importante.')
        + (w.length ? ` Empeoró en ${w.slice(0, 2).map(i => i.text).join('; ')}.` : ' No empeoró en nada importante.'))
    } else det.push(`${src}: rindió como siempre en lo que importa para su puesto${pos}.`)
  }
  if (p.wySnapshot) det.push(`Wyscout en Reserva: ${p.wySnapshot} (todavía sin meses anteriores para comparar).`)
  if (p.gps) {
    const g = p.gps
    const bits: string[] = []
    if (g.mpm != null) bits.push(`${Math.round(g.mpm)} metros por minuto${g.mpmRef ? ` (${pctText(g.mpm, g.mpmRef)} contra su promedio)` : ''}`)
    if (g.hsr90 != null) bits.push(`${Math.round(g.hsr90)} m a alta velocidad cada 90'${g.hsr90Ref ? ` (${pctText(g.hsr90, g.hsr90Ref)})` : ''}`)
    if (g.vmax != null) bits.push(`velocidad máxima ${fmt1(g.vmax)} km/h${g.vmaxRef && g.vmax > g.vmaxRef ? ' (su mejor registro)' : ''}`)
    if (bits.length) det.push(`GPS (${plural(g.matches, 'partido', 'partidos')}): ${bits.join(', ')}.`)
  }
  if (p.value && p.value.before != null && p.value.before !== p.value.now) {
    const up = p.value.now > p.value.before
    det.push(`Valor de mercado: ${up ? 'subió' : 'bajó'} de ${fmtEur(p.value.before)} a ${fmtEur(p.value.now)}.`)
  }
  if (p.contractMonths != null && p.contractMonths >= 0 && p.contractMonths <= 6 && p.contractEnd) {
    det.push(`Contrato: vence el ${fmtDate(p.contractEnd)}.`)
  }
  p.detail = det
}

function pctText(v: number, ref: number) {
  const pct = Math.round(((v - ref) / ref) * 100)
  return pct === 0 ? 'igual' : `${pct > 0 ? '+' : ''}${pct}%`
}

const CLASS_RANK = (c: PlayerMonth['cls']) => (c === 'A' ? 0 : c === 'B' ? 1 : c === 'C' ? 2 : 3)

function buildActions(players: PlayerMonth[], contracts: MinutaReport['contracts']): ActionItem[] {
  const out: ActionItem[] = []
  const w = (p: PlayerMonth) => 3 - CLASS_RANK(p.cls)
  for (const p of players) {
    if (p.value && p.value.before && p.value.now >= p.value.before * 1.25 && p.value.now - p.value.before >= 300_000 && p.tone !== 'bad') {
      out.push({ key: p.key, tone: 'good', tag: 'Oportunidad', priority: 30 + w(p),
        title: `${p.name}: su valor pasó de ${fmtEur(p.value.before)} a ${fmtEur(p.value.now)}`,
        text: `Es el mejor momento para escuchar ofertas de cara al mercado de enero${p.rating ? `: viene con nota ${fmt1(p.rating)}` : ''}${p.nums.goals + p.nums.assists ? ` y ${p.nums.goals + p.nums.assists} participaciones de gol en el mes` : ''}.` })
    }
    if (p.baseShare != null && p.share != null && p.baseShare >= 0.6 && p.share < 0.35 && p.teamMatches >= 3) {
      out.push({ key: p.key, tone: 'bad', tag: 'Perdió el puesto', priority: 25 + w(p),
        title: `${p.name} pasó de jugar el ${Math.round(p.baseShare * 100)}% de los minutos al ${Math.round(p.share * 100)}%`,
        text: `Conviene hablar con el club para entender el motivo antes de que se cierre el mercado.` })
    }
    if (p.quadrant === 'pidePista' && (p.share ?? 1) < 0.45) {
      out.push({ key: p.key, tone: 'good', tag: 'Pide pista', priority: 20 + w(p),
        title: `${p.name} rinde cuando entra (nota ${fmt1(p.rating!)}) pero jugó sólo el ${Math.round((p.share ?? 0) * 100)}% de los minutos`,
        text: `Si no gana lugar, buscarle un club donde sea titular (préstamo en enero).` })
    }
    if ((p.role === 'noJugo' || p.role === 'noFigura') && p.teamMatches >= 3) {
      out.push({ key: p.key, tone: 'bad', tag: 'Sin minutos', priority: 18 + w(p),
        title: p.role === 'noJugo' ? `${p.name} estuvo en el banco y no jugó en los ${p.teamMatches} partidos de ${p.club}` : `${p.name} no figuró en los ${p.teamMatches} partidos de ${p.club}`,
        text: `Evaluar una salida en el próximo mercado: un mes más sin jugar le baja el valor.` })
    }
    if (p.value && p.value.before && p.value.now <= p.value.before * 0.8 && p.value.before - p.value.now >= 100_000) {
      out.push({ key: p.key, tone: 'bad', tag: 'Bajó su valor', priority: 12 + w(p),
        title: `${p.name}: su valor bajó de ${fmtEur(p.value.before)} a ${fmtEur(p.value.now)}`,
        text: p.role === 'titular' ? 'Juega, así que puede recuperarlo; vigilar en los próximos meses.' : 'Coincide con pocos minutos: es una señal de que necesita jugar.' })
    }
  }
  // Tendencias: lo que se repite varios meses pesa más que un mal mes.
  for (const p of players) {
    const pt = p.pattern
    if (!pt || pt.tone !== 'bad' || !/seguidos|de los últimos/.test(pt.text)) continue
    const n = Number(pt.text.match(/(\d+) meses seguidos|Flojo en (\d+)/)?.slice(1).find(Boolean) ?? 0)
    if (n < 3) continue
    out.push({ key: p.key, tone: 'bad', tag: 'Tendencia', priority: 24 + w(p),
      title: `${p.name}: ${pt.text.charAt(0).toLowerCase()}${pt.text.slice(1)}`,
      text: `No es un mal mes aislado. Conviene hablar con él y con el club, y pensar si necesita otro destino en enero.` })
  }

  // Contratos: un solo punto con los que más importan.
  const soon = contracts.filter(c => c.months <= 6)
  if (soon.length) {
    const key = soon.filter(c => c.p.cls === 'A' || c.p.cls === 'B' || (c.p.share ?? 0) >= 0.5)
    const dates = [...new Set(soon.map(c => c.date))]
    out.push({ key: 'contratos', tone: 'neutral', tag: 'Contratos', priority: 22,
      title: `${plural(soon.length, 'contrato vence', 'contratos vencen')} en los próximos 6 meses${dates.length === 1 ? ` (todos el ${fmtDate(dates[0])})` : ''}`,
      text: key.length
        ? `Los que más importan, porque son clase A/B o titulares: ${key.slice(0, 6).map(c => c.p.name).join(', ')}${key.length > 6 ? ` y ${key.length - 6} más` : ''}. Definir renovación o venta antes del mercado de enero.`
        : `Definir renovación o salida antes del mercado de enero.` })
  }
  // Muchos "sin minutos" juntos tapan el resto: se agrupan en uno.
  const idle = out.filter(a => a.tag === 'Sin minutos')
  if (idle.length > 2) {
    const names = idle.map(a => players.find(p => p.key === a.key)!)
    const rest = out.filter(a => a.tag !== 'Sin minutos')
    rest.push({ key: 'sinMinutos', tone: 'bad', tag: 'Sin minutos', priority: Math.max(...idle.map(a => a.priority)),
      title: `${idle.length} jugadores no sumaron ni un minuto en el mes`,
      text: `${names.map(p => `${p.name} (${p.club})`).join(', ')}. Evaluar salidas en el próximo mercado: otro mes sin jugar les baja el valor.` })
    return rest.sort((a, b) => b.priority - a.priority).slice(0, 7)
  }
  return out.sort((a, b) => b.priority - a.priority).slice(0, 7)
}

const HISTORY = 6
const OUT: Role[] = ['noJugo', 'noFigura', 'soloReserva']

/**
 * Los últimos 6 meses con el mismo criterio que el mes actual, y el patrón que
 * dibujan. Un mes sin datos no corta la racha ni cuenta.
 */
function withHistory(d: MinutaData, p: PlayerMonth, src: MinutaPlayer) {
  const marks: MonthMark[] = []
  for (let k = HISTORY - 1; k >= 1; k--) {
    const m = shiftMonth(d.month, -k)
    const past = analyzePlayer({ ...d, month: m }, src)
    marks.push({ month: m, tone: past.role === 'sinDatos' ? null : past.tone, role: past.role, rating: past.rating })
  }
  marks.push({ month: d.month, tone: p.role === 'sinDatos' ? null : p.tone, role: p.role, rating: p.rating })
  p.history = marks

  const known = marks.filter(m => m.tone !== null)
  const streak = (test: (m: MonthMark) => boolean) => {
    let n = 0
    for (let i = known.length - 1; i >= 0 && test(known[i]); i--) n++
    return n
  }
  const last5 = known.slice(-5)
  // A un jugador de Reserva no se le cuenta como malo no jugar en Primera.
  const out = src.isReserve ? 0 : streak(m => OUT.includes(m.role))
  const bad = streak(m => m.tone === 'bad'), good = streak(m => m.tone === 'good')
  const nBad = last5.filter(m => m.tone === 'bad').length, nGood = last5.filter(m => m.tone === 'good').length
  if (out >= 2) p.pattern = { tone: 'bad', text: `${out} meses seguidos sin jugar en Primera` }
  else if (bad >= 2) p.pattern = { tone: 'bad', text: `Viene en baja: ${bad} meses seguidos flojos` }
  else if (good >= 2) p.pattern = { tone: 'good', text: `Viene en alza: ${good} meses seguidos buenos` }
  else if (last5.length >= 4 && nBad >= 3) p.pattern = { tone: 'bad', text: `Flojo en ${nBad} de los últimos ${last5.length} meses` }
  else if (last5.length >= 4 && nGood >= 3) p.pattern = { tone: 'good', text: `Bueno en ${nGood} de los últimos ${last5.length} meses` }
  // Patrón que cambia de signo: venía mal y este mes levantó (o al revés).
  else if (p.tone === 'good' && known.slice(-4, -1).filter(m => m.tone === 'bad').length >= 2) p.pattern = { tone: 'good', text: 'Levantó después de meses flojos' }
  else if (p.tone === 'bad' && known.slice(-4, -1).filter(m => m.tone === 'good').length >= 2) p.pattern = { tone: 'bad', text: 'Cayó después de meses buenos' }
}

export function buildReport(d: MinutaData): MinutaReport {
  sendDateYear = sendDate(d.month).slice(0, 4)
  const players = d.players.map(src => {
    const p = analyzePlayer(d, src)
    withHistory(d, p, src)
    return p
  }).sort((a, b) => CLASS_RANK(a.cls) - CLASS_RANK(b.cls) || b.nums.minutes - a.nums.minutes)

  const sum = (f: (n: MonthNumbers) => number, which: 'nums' | 'prevNums') => players.reduce((s, p) => s + f(p[which]), 0)
  const playedCount = (which: 'nums' | 'prevNums') => players.filter(p => p[which].matches > 0).length
  const kpis: Kpi[] = [
    { label: 'Jugadores que jugaron', value: playedCount('nums'), prev: playedCount('prevNums'), hint: `de ${players.length}` },
    { label: 'Minutos', value: sum(n => n.minutes, 'nums'), prev: sum(n => n.minutes, 'prevNums'), fmt: v => Math.round(v).toLocaleString('es-AR') },
    { label: 'Partidos jugados', value: sum(n => n.matches, 'nums'), prev: sum(n => n.matches, 'prevNums') },
    { label: 'Titularidades', value: sum(n => n.starts, 'nums'), prev: sum(n => n.starts, 'prevNums') },
    { label: 'Goles', value: sum(n => n.goals, 'nums'), prev: sum(n => n.goals, 'prevNums') },
    { label: 'Asistencias', value: sum(n => n.assists, 'nums'), prev: sum(n => n.assists, 'prevNums') },
  ]

  const ranked = players.filter(p => p.formScore != null && p.nums.minutes >= 90)
  const risers = ranked.filter(p => p.formScore! >= 0.25).sort((a, b) => b.formScore! - a.formScore!).slice(0, 5)
  const fallers = ranked.filter(p => p.formScore! <= -0.25).sort((a, b) => a.formScore! - b.formScore!).slice(0, 5)

  const quadrants: Record<Quadrant, PlayerMonth[]> = { consolidado: [], pidePista: [], aMejorar: [], enRiesgo: [] }
  for (const p of players) if (p.quadrant && p.role !== 'soloReserva' && p.role !== 'sinDatos') quadrants[p.quadrant].push(p)
  for (const q of Object.values(quadrants)) q.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))

  const withValue = players.filter(p => p.value)
  const now = withValue.reduce((s, p) => s + p.value!.now, 0)
  const before = withValue.reduce((s, p) => s + (p.value!.before ?? p.value!.now), 0)
  const movers = withValue
    .filter(p => p.value!.before != null && p.value!.before !== p.value!.now)
    .map(p => ({ p, delta: p.value!.now - p.value!.before!, pct: (p.value!.now - p.value!.before!) / p.value!.before! }))
    .sort((a, b) => b.delta - a.delta)
  const endOf = (m: string) => `${m}-31`
  const valueHistory = Array.from({ length: 12 }, (_, i) => shiftMonth(d.month, i - 11)).map(m => ({
    month: m,
    // Mismos jugadores todos los meses: si todavía no tenía valor cargado, cuenta el primero que tuvo.
    eur: withValue.reduce((s, p) => s + (valueAt(d.values.get(p.key), endOf(m)) ?? d.values.get(p.key)?.[0]?.eur ?? 0), 0),
  }))
  const topValue = [...withValue].sort((a, b) => b.value!.now - a.value!.now).slice(0, 5)
    .map(p => ({ p, share: now ? p.value!.now / now : 0 }))
  const undervalued = withValue.filter(p => {
    const good = p.tone === 'good' || p.pattern?.tone === 'good'
    const v3 = valueAt(d.values.get(p.key), endOf(shiftMonth(d.month, -3)))
    return good && p.nums.matches > 0 && v3 != null && p.value!.now <= v3
  }).sort((a, b) => CLASS_RANK(a.cls) - CLASS_RANK(b.cls))

  const contracts = players
    .filter(p => p.contractEnd && p.contractMonths != null && p.contractMonths >= 0 && p.contractMonths <= 6)
    .map(p => ({ p, date: p.contractEnd!, months: p.contractMonths! }))
    .sort((a, b) => a.date.localeCompare(b.date) || CLASS_RANK(a.p.cls) - CLASS_RANK(b.p.cls))

  const M = d.month
  const negotiations = d.negotiations.filter(n => n.updatedAt.slice(0, 7) === M || n.createdAt.slice(0, 7) === M)

  const none = players.filter(p => !p.sources.partidos && !p.sources.wyscout)
  const noWyscout = players.filter(p => p.sources.partidos && !p.sources.wyscout && p.nums.matches > 0)
  const coverage = {
    full: players.filter(p => p.sources.partidos && p.sources.wyscout).length,
    none, noWyscout, gps: players.filter(p => p.sources.gps).length, total: players.length,
  }

  const actions = buildActions(players, contracts)

  // Resumen en 3 renglones.
  const summary: string[] = []
  const top = risers[0]
  const goalsTop = [...players].sort((a, b) => (b.nums.goals + b.nums.assists) - (a.nums.goals + a.nums.assists) || (b.rating ?? 0) - (a.rating ?? 0))[0]
  const k = (i: number) => kpis[i]
  summary.push(`${k(0).value} de ${players.length} jugadores sumaron minutos en ${monthName(M)} (${k(0).value === k(0).prev ? `igual que en ${monthName(shiftMonth(M, -1))}` : `${k(0).value > k(0).prev ? '+' : ''}${k(0).value - k(0).prev} contra ${monthName(shiftMonth(M, -1))}`}), con ${k(4).value} goles y ${k(5).value} asistencias entre todos.`)
  if (top || goalsTop) {
    const lead = goalsTop && goalsTop.nums.goals + goalsTop.nums.assists >= 3 ? goalsTop : top
    const what = lead.headline.replace(/^[^.]+\.\s*/, '').replace(/\.$/, '')
    summary.push(`El mes fue de ${lead.name}: ${what.charAt(0).toLowerCase()}${what.slice(1)}${lead.rating ? `, nota ${fmt1(lead.rating)}` : ''}.`)
  }
  if (before && now !== before) {
    const lead = movers[0]
    summary.push(`La cartera vale ${fmtEur(now)} (${now > before ? '+' : '−'}${fmtEur(Math.abs(now - before))} en el mes)${lead && lead.delta > 0 ? `, empujada por ${lead.p.name}` : ''}.`)
  }
  if (contracts.length) summary.push(`${plural(contracts.length, 'contrato vence', 'contratos vencen')} en los próximos 6 meses: hay que definirlos antes de enero.`)

  return {
    month: M, title: `Reporte Mensual · ${monthTitle(M)}`, sendDate: sendDate(M),
    summary, kpis, actions, risers, fallers, quadrants,
    portfolio: { now, before, movers, history: valueHistory, top: topValue, undervalued }, contracts, negotiations, coaches: d.coaches, players, coverage,
    patterns: players.filter(p => p.pattern).sort((a, b) => Number(a.pattern!.tone === 'good') - Number(b.pattern!.tone === 'good') || CLASS_RANK(a.cls) - CLASS_RANK(b.cls)),
  }
}

