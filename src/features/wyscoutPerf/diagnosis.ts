/**
 * Diagnóstico de cada jugador en castellano simple. Mira tres cosas:
 *  - Rol: si es titular, alterna o entra de suplente (últimos 3 meses).
 *  - Cómo viene: últimos 6 meses contra el año anterior, métrica por métrica.
 *  - Contra sus pares: último año contra los de su posición en la agencia.
 * Nunca se concluye por un solo número: "viene mejorando" quiere decir que
 * mejoró en varias de las métricas de su puesto y bajó en pocas, y siempre se
 * dice en cuántas y en cuáles. Todo puro (sin React ni Supabase).
 */
import { POS_GROUP_LABEL, fmtMetric, isRate, lowerFirst, metricsFor, type MetricDef, type PosGroup, type Totals } from './metrics'
import { monthLabel, monthsAgo, totalsBetween, type MonthRow } from './periods'
import { MIN_MINUTES, playerGroup } from './conclusions'
import { isStart } from './analysis'

const MIN_TRIES = 30
/** Para hablar de "viene mejorando" o "rinde mejor": métricas comparables mínimas. */
const MIN_COMPARED = 4

export type Role = 'titular' | 'alterna' | 'suplente' | 'casiNoJuega' | 'sinPartidos'
export type RoleChange = 'ganoElPuesto' | 'perdioElPuesto' | null
export type Tone = 'good' | 'bad' | 'neutral'
export type Direction = 'up' | 'down' | 'even'

export interface DiagItem {
  metric: MetricDef
  value: number
  /** Promedio de sus pares (comparación) o su valor anterior (tendencia). */
  ref: number
  /** Para ordenar: cuanto más grande, más clara la diferencia. */
  score: number
}

/** Una comparación métrica por métrica: en cuántas está mejor, en cuántas peor. */
export interface Tally {
  state: Direction
  better: DiagItem[]
  worse: DiagItem[]
  /** Métricas que se pudieron comparar. */
  total: number
}

export interface Diagnosis {
  key: string
  group: PosGroup | null
  role: Role
  roleChange: RoleChange
  /** "Titular fijo: 9 de 10 partidos de titular en los últimos 3 meses." */
  roleText: string
  /** Últimos 6 meses contra el año anterior. */
  form: Tally | null
  /** Último año contra los de su posición en la agencia. */
  level: (Tally & { peers: number }) | null
  /** Una oración: "Titular fijo, viene mejorando y rinde mejor que los extremos de la agencia." */
  headline: string
  tone: Tone
  /** Para ordenar de mejor a peor momento. */
  score: number
}

export interface MatchMinutesLike { date: string; minutes: number; starter?: boolean }

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

const enoughTries = (m: MetricDef, ...ts: Totals[]) => !m.tries || ts.every(t => (t.s[m.tries!] ?? 0) >= MIN_TRIES)

/**
 * ¿La diferencia es clara? En % pedimos 5 puntos; en "por partido", 25% y que
 * la diferencia equivalga a 3 jugadas o más en sus minutos (no 1 gol de suerte).
 * Devuelve un puntaje con signo (positivo = a favor del jugador) o null.
 */
function clearGap(m: MetricDef, v: number, ref: number, minutes: number): number | null {
  const diff = m.lowerIsBetter ? ref - v : v - ref
  if (m.unit === '%') return Math.abs(v - ref) >= 5 ? diff / 10 : null
  if (Math.abs(ref) < 0.05) return null
  if ((Math.abs(v - ref) * minutes) / 90 < 3) return null
  const rel = diff / Math.abs(ref)
  return Math.abs(rel) >= 0.25 ? Math.max(-1.5, Math.min(1.5, rel)) : null
}

function tally(items: Array<{ m: MetricDef; v: number; ref: number; gap: number | null }>): Tally {
  const better: DiagItem[] = []
  const worse: DiagItem[] = []
  for (const { m, v, ref, gap } of items) {
    if (gap === null) continue
    const score = Math.abs(gap) + (m.headline ? 0.15 : 0)
    ;(gap > 0 ? better : worse).push({ metric: m, value: v, ref, score })
  }
  better.sort((a, b) => b.score - a.score)
  worse.sort((a, b) => b.score - a.score)
  const b = better.length, w = worse.length
  const state: Direction = items.length < MIN_COMPARED ? 'even'
    : b >= 3 && b >= w + 2 ? 'up'
    : w >= 3 && w >= b + 2 ? 'down'
    : 'even'
  return { state, better, worse, total: items.length }
}

/** Titular / suplente en una ventana, con los minutos de cada partido (o el promedio del mes si no están). */
function startShare(rows: MonthRow[], matches: MatchMinutesLike[] | undefined, from: string, to: string) {
  if (matches?.length) {
    const list = matches.filter(m => m.minutes > 0 && m.date.slice(0, 7) >= from && m.date.slice(0, 7) <= to)
    return { played: list.length, starts: list.filter(isStart).length }
  }
  const t = totalsBetween(rows, from, to)
  // Sin el detalle por partido: 75' de promedio o más ≈ titular siempre.
  return { played: t.matches, starts: t.matches ? Math.round(t.matches * Math.min(1, Math.max(0, (t.minutes / t.matches - 30) / 45))) : 0 }
}

function roleOf(rows: MonthRow[], matches: MatchMinutesLike[] | undefined, today: Date) {
  const playedDates = matches?.filter(m => m.minutes > 0).map(m => m.date.slice(0, 7)).sort()
  const last = playedDates?.length ? playedDates[playedDates.length - 1] : rows[rows.length - 1].month.slice(0, 7)
  if (last < monthsAgo(1, today)) {
    return { role: 'sinPartidos' as Role, change: null as RoleChange, text: `Sin jugar desde ${monthLabel(`${last}-01`)}.` }
  }
  const now = startShare(rows, matches, monthsAgo(2, today), monthsAgo(0, today))
  const before = startShare(rows, matches, monthsAgo(11, today), monthsAgo(3, today))
  const share = now.played ? now.starts / now.played : 0
  const prevShare = before.played >= 5 ? before.starts / before.played : null
  const of = `${now.starts} de ${now.played} partidos de titular en los últimos 3 meses`
  let role: Role
  let text: string
  if (now.played < 3) { role = 'casiNoJuega'; text = `Casi no juega: ${now.played === 1 ? '1 partido' : `${now.played} partidos`} en los últimos 3 meses` }
  else if (share >= 0.75) { role = 'titular'; text = `Titular fijo: ${of}` }
  else if (share >= 0.4) { role = 'alterna'; text = `Alterna entre titular y suplente: ${of}` }
  else { role = 'suplente'; text = `Entra más que nada de suplente: ${of}` }
  let change: RoleChange = null
  if (prevShare !== null && prevShare >= 0.7 && share < 0.45) change = 'perdioElPuesto'
  else if (prevShare !== null && prevShare < 0.45 && share >= 0.7 && now.played >= 4) change = 'ganoElPuesto'
  if (change) text += ` (antes, ${Math.round(prevShare! * 100)}% de titular)`
  return { role, change, text: `${text}.` }
}

const ROLE_SCORE: Record<Role, number> = { titular: 1, alterna: 0.3, suplente: -0.4, casiNoJuega: -1, sinPartidos: -1 }

const ROLE_SHORT: Record<Role, string> = {
  titular: 'Titular fijo', alterna: 'Alterna entre titular y suplente', suplente: 'Suplente', casiNoJuega: 'Casi no juega', sinPartidos: 'Sin partidos recientes',
}

/**
 * Diagnóstico de un jugador. `byPlayer` = todos los jugadores de la agencia
 * (para comparar con los de su posición); `matches` = minutos de cada partido.
 */
export function diagnose(
  rows: MonthRow[],
  byPlayer: Map<string, MonthRow[]>,
  matches?: MatchMinutesLike[],
  today = new Date(),
): Diagnosis | null {
  if (!rows.length) return null
  const key = rows[0].player_key
  const group = playerGroup(rows)
  const many = group ? POS_GROUP_LABEL[group].many : 'jugadores'
  const metrics = metricsFor(group).filter(m => !m.signed && isRate(m))
  const { role, change, text: roleText } = roleOf(rows, matches, today)

  // 1) Contra los de su posición en la agencia, último año.
  const from = monthsAgo(11, today), to = monthsAgo(0, today)
  const mine = totalsBetween(rows, from, to)
  const peers = group
    ? [...byPlayer.entries()]
      .filter(([k, rs]) => k !== key && playerGroup(rs) === group)
      .map(([, rs]) => totalsBetween(rs, from, to))
      .filter(t => t.minutes >= MIN_MINUTES)
    : []
  let level: Diagnosis['level'] = null
  if (mine.minutes >= MIN_MINUTES && peers.length >= 2) {
    const items = metrics.flatMap(m => {
      const v = m.compute(mine)
      if (v === null || !enoughTries(m, mine)) return []
      const others = peers.filter(t => enoughTries(m, t)).map(t => m.compute(t)).filter((x): x is number => x !== null)
      if (others.length < 2) return []
      const ref = median(others)
      return [{ m, v, ref, gap: clearGap(m, v, ref, mine.minutes) }]
    })
    if (items.length >= MIN_COMPARED) level = { ...tally(items), peers: peers.length }
  }

  // 2) Cómo viene: últimos 6 meses contra los 12 anteriores.
  const now = totalsBetween(rows, monthsAgo(5, today), monthsAgo(0, today))
  const before = totalsBetween(rows, monthsAgo(17, today), monthsAgo(6, today))
  let form: Tally | null = null
  if (now.minutes >= MIN_MINUTES && before.minutes >= MIN_MINUTES) {
    const items = metrics.flatMap(m => {
      const a = m.compute(now), b = m.compute(before)
      if (a === null || b === null || !enoughTries(m, now, before)) return []
      return [{ m, v: a, ref: b, gap: clearGap(m, a, b, Math.min(now.minutes, before.minutes)) }]
    })
    if (items.length >= MIN_COMPARED) form = tally(items)
  }

  // 3) Conclusión en una oración.
  const roleShort = change === 'perdioElPuesto' ? 'Perdió la titularidad' : change === 'ganoElPuesto' ? 'Se ganó el puesto' : ROLE_SHORT[role]
  const parts = [roleShort]
  if (form) parts.push(form.state === 'up' ? 'viene mejorando' : form.state === 'down' ? 'viene bajando' : 'sin cambios claros en los últimos 6 meses')
  if (level) parts.push(level.state === 'up' ? `rinde mejor que los ${many} de la agencia` : level.state === 'down' ? `rinde peor que los ${many} de la agencia` : `rinde parecido a los ${many} de la agencia`)
  const headline = `${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}` : parts[0]}.`

  const idx = (t: Tally | null) => (t && t.total ? (t.better.length - t.worse.length) / t.total : 0)
  const score = idx(level) * 0.45 + idx(form) * 0.35 + ROLE_SCORE[role] * 0.2
    + (change === 'perdioElPuesto' ? -0.3 : change === 'ganoElPuesto' ? 0.2 : 0)
  const tone: Tone = isHotRaw(role, change, form, level) ? 'good' : isConcernRaw(role, change, form, level) ? 'bad' : 'neutral'

  return { key, group, role, roleChange: change, roleText, form, level, headline, tone, score }
}

function isHotRaw(role: Role, change: RoleChange, form: Tally | null, level: Tally | null) {
  if (change === 'perdioElPuesto' || !(role === 'titular' || role === 'alterna' || change === 'ganoElPuesto')) return false
  return (form?.state === 'up' && level?.state !== 'down') || (level?.state === 'up' && form?.state !== 'down')
}

function isConcernRaw(role: Role, change: RoleChange, form: Tally | null, level: Tally | null) {
  // Sin partidos cargados puede ser sólo que falta subir el Excel: tiene su propio cuadro arriba.
  if (role === 'sinPartidos') return false
  if (change === 'perdioElPuesto' || role === 'casiNoJuega') return true
  if (change === 'ganoElPuesto' && !(form?.state === 'down' && level?.state === 'down')) return false
  return (form?.state === 'down' && level?.state !== 'up') || (level?.state === 'down' && form?.state !== 'up')
}

/** En su mejor momento: juega y mejoró en la mayoría de sus métricas o rinde mejor que sus pares. */
export const isHot = (d: Diagnosis) => d.tone === 'good'
/** Preocupa: perdió el puesto, casi no juega, o la mayoría de sus métricas bajaron o quedan abajo de sus pares. */
export const isConcern = (d: Diagnosis) => d.tone === 'bad'

/** Diagnóstico de todos (sólo los que jugaron en el último año). */
export function diagnoseAll(
  byPlayer: Map<string, MonthRow[]>,
  matchMinutes: Map<string, MatchMinutesLike[]>,
  today = new Date(),
): Map<string, Diagnosis> {
  const out = new Map<string, Diagnosis>()
  for (const [k, rs] of byPlayer) {
    if (!rs.length || rs[rs.length - 1].month.slice(0, 7) < monthsAgo(11, today)) continue
    const d = diagnose(rs, byPlayer, matchMinutes.get(k), today)
    if (d) out.set(k, d)
  }
  return out
}

// ── Textos ─────────────────────────────────────────────────────────────────

const name = (m: MetricDef) => lowerFirst(m.label)
const trendExample = (i: DiagItem) => `${name(i.metric)} ${fmtMetric(i.metric, i.ref)} → ${fmtMetric(i.metric, i.value)}`
const peerExample = (i: DiagItem) => `${name(i.metric)} ${fmtMetric(i.metric, i.value)} (ellos ${fmtMetric(i.metric, i.ref)})`
const examples = (list: DiagItem[], fmt: (i: DiagItem) => string, n = 3) =>
  list.slice(0, n).map(fmt).join(' · ') + (list.length > n ? ` y ${list.length - n} ${list.length - n === 1 ? 'cosa' : 'cosas'} más` : '')

// Sin "4 de 7 métricas": los textos dicen en qué mejoró o empeoró, con los números al lado.

/** "Está mejor que el año anterior en: gambetas 1,2 → 2,0 · xA 0,10 → 0,22. Está peor en: …" */
export function formText(f: Tally): string {
  const up = f.better.length, down = f.worse.length
  if (!up && !down) return 'Está igual que el año anterior en lo que importa para su puesto.'
  const a = up ? `Está mejor que el año anterior en: ${examples(f.better, trendExample)}.` : 'No está mejor en nada importante.'
  const b = down ? ` Está peor en: ${examples(f.worse, trendExample)}.` : ' No está peor en nada importante.'
  return a + b
}

/** "Mejor que ellos en: goles 0,32 (ellos 0,09) · … Peor en: …" */
export function levelText(l: Tally): string {
  const up = l.better.length, down = l.worse.length
  if (!up && !down) return 'Rinde parecido a ellos en lo que importa para su puesto.'
  const a = up ? `Mejor que ellos en: ${examples(l.better, peerExample)}.` : 'No los supera claramente en nada.'
  const b = down ? ` Peor en: ${examples(l.worse, peerExample)}.` : ' No queda abajo en nada.'
  return a + b
}

/** Etiqueta corta para chips. */
export function formChip(f: Tally): string {
  return f.state === 'up' ? 'Viene mejorando'
    : f.state === 'down' ? 'Viene bajando'
    : 'Igual que antes'
}

export function levelChip(l: Tally, group: PosGroup | null): string {
  const who = group ? POS_GROUP_LABEL[group].many : 'jugadores'
  return l.state === 'up' ? `Rinde más que los otros ${who}`
    : l.state === 'down' ? `Rinde menos que los otros ${who}`
    : `Rinde como los otros ${who}`
}

// ── Por posición (Inicio) ──────────────────────────────────────────────────

export interface BoardItem { key: string; text: string; score: number }
export interface BoardRow { group: PosGroup; players: number; good: BoardItem[]; bad: BoardItem[] }

const BOARD_ORDER: PosGroup[] = ['DEF', 'LAT', 'VC', 'MED', 'EXT', 'DEL']

/**
 * Lo bueno y lo malo de cada posición: el diagnóstico de cada jugador del puesto
 * resumido en una línea con números. `bonus` suma prioridad (por ejemplo, clase A).
 */
export function positionBoard(diags: Iterable<Diagnosis>, bonus: (key: string) => number = () => 0, perSide = 3): BoardRow[] {
  const list = [...diags]
  return BOARD_ORDER.flatMap(group => {
    const mine = list.filter(d => d.group === group)
    if (!mine.length) return []
    const good: BoardItem[] = []
    const bad: BoardItem[] = []
    const many = POS_GROUP_LABEL[group].many
    for (const d of mine) {
      const b = bonus(d.key)
      let up: BoardItem | null = null
      let down: BoardItem | null = null
      if (d.roleChange === 'ganoElPuesto') up = { key: d.key, text: `Se ganó el puesto. ${d.roleText}`, score: 2 }
      else if (d.form?.state === 'up') up = { key: d.key, text: `Viene mejorando. ${formText(d.form)}`, score: 1 + d.form.better.length / d.form.total }
      else if (d.level?.state === 'up') up = { key: d.key, text: `Mejor que los otros ${d.level.peers} ${many} de la agencia. ${levelText(d.level)}`, score: 0.8 + d.level.better.length / d.level.total }

      if (d.roleChange === 'perdioElPuesto') down = { key: d.key, text: `Perdió la titularidad. ${d.roleText}`, score: 2.2 }
      else if (d.role === 'casiNoJuega') down = { key: d.key, text: d.roleText, score: 1.8 }
      else if (d.form?.state === 'down') down = { key: d.key, text: `Viene bajando. ${formText(d.form)}`, score: 1 + d.form.worse.length / d.form.total }
      else if (d.level?.state === 'down') down = { key: d.key, text: `Peor que los otros ${d.level.peers} ${many} de la agencia. ${levelText(d.level)}`, score: 0.8 + d.level.worse.length / d.level.total }

      // Cada jugador en un solo lado: el que pese más (si no, se contradice).
      if (up && (!down || up.score >= down.score)) good.push({ ...up, score: up.score + b })
      else if (down) bad.push({ ...down, score: down.score + b })
    }
    const top = (xs: BoardItem[]) => xs.sort((a, c) => c.score - a.score).slice(0, perSide)
    return [{ group, players: mine.length, good: top(good), bad: top(bad) }]
  })
}
