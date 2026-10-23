import { normalizeName } from '@/utils/scoring'

// ─── Tablero: cálculos puros sobre los partidos de los jugadores Doble G ─────
// Todo lo que muestra la página sale de acá, separado de la red para poder
// testearlo con filas fijas. Cada panel recibe la misma lista de apariciones
// (una fila por jugador y partido) y la recorta a su manera.

export const DAY_MS = 24 * 60 * 60 * 1000
const AR_TZ = 'America/Argentina/Buenos_Aires'

export interface RosterEntry {
  fullName: string
  shortName?: string
  apiTeamId: number | null
  /** Nombre del club en la lista de la agencia (para explicar por qué falta un dato). */
  team?: string
  isReserve?: boolean
}

/** Fila cruda de `player_match_stats` con los datos del partido que pide el tablero. */
export interface TableroStatRow {
  player_id: number
  team_id: number
  fixture_id: number
  minutes: number | null
  goals: number | null
  assists: number | null
  shots_total: number | null
  shots_on: number | null
  passes_key: number | null
  tackles: number | null
  interceptions: number | null
  duels_won: number | null
  duels_total: number | null
  dribbles_success: number | null
  rating: number | null
  is_substitute?: boolean | null
  player?: { name: string } | null
  fixture?: {
    date: string
    league_id: number | null
    home_team_id: number | null
    away_team_id: number | null
    score_home: number | null
    score_away: number | null
  } | null
}

/** Un partido jugado por un club, visto desde ese club. */
export interface TeamFixture {
  teamId: number
  date: string
  goalsFor: number
  goalsAgainst: number
}

/** Un jugador de la agencia en un partido (haya jugado o no — 0 minutos = en el banco). */
export interface Appearance {
  fullName: string
  teamId: number
  fixtureId: number
  date: string
  dayKey: string
  leagueId: number | null
  rivalId: number | null
  isHome: boolean
  goalsFor: number | null
  goalsAgainst: number | null
  minutes: number
  goals: number
  assists: number
  shotsTotal: number
  shotsOn: number
  passesKey: number
  tackles: number
  interceptions: number
  duelsWon: number
  duelsTotal: number
  dribblesSuccess: number
  rating: number | null
  /** Empezó en el banco (null = la fuente no lo dice). */
  isSub?: boolean | null
}

/** Fecha 'YYYY-MM-DD' en hora argentina (un partido de las 22 h no se pasa al día siguiente). */
export function dayKeyAR(date: Date | string): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: AR_TZ }).format(new Date(date))
}

/** Dos filas del mismo jugador a menos de 36 h son el mismo partido contado por dos proveedores. */
const SAME_MATCH_MS = 36 * 60 * 60 * 1000

function richer(a: Appearance, b: Appearance): Appearance {
  if (a.rating != null && b.rating == null) return a
  if (b.rating != null && a.rating == null) return b
  return b.minutes > a.minutes ? b : a
}

/**
 * Asigna cada fila a un jugador del roster. Primero por identidad (`owners`:
 * id de fila → jugador, sale de los links oficiales de la agencia); si no hay,
 * por nombre: el completo manda y el corto ("F. Paradela", "J. López") sólo
 * cuenta si la fila es de su club — un nombre corto suelto puede ser de otra persona.
 *
 * El mismo partido puede venir de API-Football y de Sofascore con ids
 * distintos: un jugador no juega dos veces en 36 h, así que esas filas se
 * funden en una (gana la que tiene puntaje o más minutos).
 */
export interface OwnershipOptions {
  /** Id de fila de `players` → jugador del roster (identidad oficial). */
  owners?: Map<number, string>
  /** Club de Sofascore → su gemelo de API-Football (mismo nombre sin acentos). */
  teamTwins?: Map<number, number>
  /** Se llena con club gemelo → club unificado (el id más chico, el de API-Football). */
  teamAliasOut?: Map<number, number>
}

export function toAppearances(rows: TableroStatRow[], roster: RosterEntry[], opts: OwnershipOptions = {}): Appearance[] {
  return ownedRows(rows, roster, opts).map(o => o.app)
}

/**
 * Lo mismo que `toAppearances`, pero devuelve también la fila original de cada
 * partido (el Inicio la necesita entera para sus sumas de pases, duelos, etc.).
 */
export function ownedRows<T extends TableroStatRow>(
  rows: T[],
  roster: RosterEntry[],
  opts: OwnershipOptions = {},
): { row: T; app: Appearance }[] {
  const owners = opts.owners ?? new Map<number, string>()
  const teamTwins = opts.teamTwins ?? new Map<number, number>()
  const teamAliasOut = opts.teamAliasOut ?? new Map<number, number>()
  const byName = new Map<string, RosterEntry[]>()
  const add = (key: string, p: RosterEntry) => {
    const list = byName.get(key) ?? []
    if (!list.includes(p)) list.push(p)
    byName.set(key, list)
  }
  for (const p of roster) {
    add(normalizeName(p.fullName), p)
    if (p.shortName) add(normalizeName(p.shortName), p)
  }
  const inRoster = new Set(roster.map(p => p.fullName))

  const all: { row: T; app: Appearance }[] = []
  for (const row of rows) {
    const fx = row.fixture
    if (!fx?.date) continue
    let ownerName = owners.get(row.player_id)
    if (!ownerName || !inRoster.has(ownerName)) {
      const rawName = row.player?.name
      if (!rawName) continue
      const candidates = byName.get(normalizeName(rawName)) ?? []
      const exact = candidates.find(p => normalizeName(p.fullName) === normalizeName(rawName))
      const rowTeam = teamTwins.get(row.team_id) ?? row.team_id
      ownerName = (exact ?? candidates.find(p => p.apiTeamId === rowTeam))?.fullName
    }
    if (!ownerName) continue

    const isHome = fx.home_team_id === row.team_id
    all.push({ row, app: {
      fullName: ownerName,
      teamId: row.team_id,
      fixtureId: row.fixture_id,
      date: fx.date,
      dayKey: dayKeyAR(fx.date),
      leagueId: fx.league_id ?? null,
      rivalId: (isHome ? fx.away_team_id : fx.home_team_id) ?? null,
      isHome,
      goalsFor: isHome ? fx.score_home : fx.score_away,
      goalsAgainst: isHome ? fx.score_away : fx.score_home,
      minutes: row.minutes ?? 0,
      goals: row.goals ?? 0,
      assists: row.assists ?? 0,
      shotsTotal: row.shots_total ?? 0,
      shotsOn: row.shots_on ?? 0,
      passesKey: row.passes_key ?? 0,
      tackles: row.tackles ?? 0,
      interceptions: row.interceptions ?? 0,
      duelsWon: row.duels_won ?? 0,
      duelsTotal: row.duels_total ?? 0,
      dribblesSuccess: row.dribbles_success ?? 0,
      rating: row.rating != null && row.rating > 0 ? row.rating : null,
      isSub: row.is_substitute ?? null,
    } })
  }

  all.sort((a, b) => a.app.fullName.localeCompare(b.app.fullName) || a.app.date.localeCompare(b.app.date))
  const out: { row: T; app: Appearance }[] = []
  // Si dos filas son el mismo partido, sus clubes (y sus rivales) son el mismo
  // club con dos ids: se unifican para que "su club" no quede partido en dos.
  const parent = new Map<number, number>()
  const find = (id: number): number => {
    let root = id
    while (parent.has(root) && parent.get(root) !== root) root = parent.get(root)!
    return root
  }
  const union = (a: number | null, b: number | null) => {
    if (a == null || b == null) return
    const ra = find(a), rb = find(b)
    if (ra === rb) return
    const keep = Math.min(ra, rb)
    parent.set(ra, keep)
    parent.set(rb, keep)
  }
  for (const [twin, api] of teamTwins) union(twin, api)
  for (const item of all) {
    const prev = out[out.length - 1]
    const app = item.app
    if (prev && prev.app.fullName === app.fullName
      && new Date(app.date).getTime() - new Date(prev.app.date).getTime() < SAME_MATCH_MS) {
      union(prev.app.teamId, app.teamId)
      union(prev.app.rivalId, app.rivalId)
      if (richer(prev.app, app) === app) out[out.length - 1] = item
    } else {
      out.push(item)
    }
  }
  for (const id of parent.keys()) {
    const root = find(id)
    if (root !== id) teamAliasOut.set(id, root)
  }
  const canon = (id: number) => teamAliasOut.get(id) ?? id
  return out
    .map(({ row, app: a }) => ({ row, app: { ...a, teamId: canon(a.teamId), rivalId: a.rivalId == null ? null : canon(a.rivalId) } }))
    .sort((a, b) => a.app.date.localeCompare(b.app.date))
}

/**
 * Partidos de cada club (ya unificado) desde `from`. Un club con dos ids trae
 * el mismo partido dos veces: dentro de 36 h cuenta uno.
 */
export function countTeamMatches(
  teamFixtures: TeamFixture[],
  teamAlias: Map<number, number>,
  from: number,
): Map<number, number> {
  const byTeam = new Map<number, number[]>()
  for (const f of teamFixtures) {
    const t = new Date(f.date).getTime()
    if (t < from) continue
    const id = teamAlias.get(f.teamId) ?? f.teamId
    const list = byTeam.get(id) ?? []
    list.push(t)
    byTeam.set(id, list)
  }
  const out = new Map<number, number>()
  for (const [id, times] of byTeam) {
    times.sort((a, b) => a - b)
    let count = 0
    let last = -Infinity
    for (const t of times) {
      if (t - last >= SAME_MATCH_MS) count++
      last = t
    }
    out.set(id, count)
  }
  return out
}

/**
 * Club actual de cada jugador = el del último partido en el que figura (aunque
 * haya quedado en el banco). Cubre los clubes que Sofascore guarda con otro id
 * que API-Football; si no tiene partidos, queda el del roster.
 */
export function currentTeams(apps: Appearance[], roster: RosterEntry[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const p of roster) if (p.apiTeamId != null) out.set(p.fullName, p.apiTeamId)
  for (const a of apps) out.set(a.fullName, a.teamId) // apps vienen en orden cronológico
  return out
}

export const played = (a: Appearance) => a.minutes > 0

function within(a: Appearance, from: number, to: number): boolean {
  const t = new Date(a.date).getTime()
  return t >= from && t < to
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null
}

// ─── Pulso: últimos 7 días contra los 7 anteriores ──────────────────────────

export interface PulseFigures {
  players: number
  minutes: number
  goalContributions: number
  avgRating: number | null
}

export interface PulseKpi {
  current: PulseFigures
  previous: PulseFigures
  /** Una entrada por semana, de la más vieja a la actual (la última = últimos 7 días). */
  weekly: PulseFigures[]
}

function figures(apps: Appearance[]): PulseFigures {
  const p = apps.filter(played)
  return {
    players: new Set(p.map(a => a.fullName)).size,
    minutes: p.reduce((s, a) => s + a.minutes, 0),
    goalContributions: p.reduce((s, a) => s + a.goals + a.assists, 0),
    avgRating: average(p.map(a => a.rating).filter((r): r is number => r != null)),
  }
}

export function computePulse(apps: Appearance[], now: number, weeks = 12): PulseKpi {
  const weekly: PulseFigures[] = []
  for (let w = weeks - 1; w >= 0; w--) {
    const to = now - w * 7 * DAY_MS
    weekly.push(figures(apps.filter(a => within(a, to - 7 * DAY_MS, to))))
  }
  return { current: weekly[weekly.length - 1], previous: weekly[weekly.length - 2] ?? figures([]), weekly }
}

// ─── Calendario de actividad ─────────────────────────────────────────────────

export interface ActivityDay {
  dayKey: string
  /** Jugadores Doble G que sumaron minutos ese día. */
  players: number
  apps: Appearance[]
}

/**
 * Grilla de semanas (lunes a domingo) que termina en la semana de `now`.
 * Cada columna es una semana; los días futuros de la semana actual vienen `null`.
 */
export function activityGrid(apps: Appearance[], now: number, weeks = 26): (ActivityDay | null)[][] {
  const byDay = new Map<string, Appearance[]>()
  for (const a of apps) {
    if (!played(a)) continue
    const list = byDay.get(a.dayKey) ?? []
    list.push(a)
    byDay.set(a.dayKey, list)
  }
  const todayKey = dayKeyAR(new Date(now))
  // Mediodía UTC del día argentino de hoy: sumar/restar días nunca cruza de fecha.
  const today = new Date(`${todayKey}T12:00:00Z`)
  const weekday = (today.getUTCDay() + 6) % 7 // lunes = 0
  const start = today.getTime() - (weekday + (weeks - 1) * 7) * DAY_MS

  const grid: (ActivityDay | null)[][] = []
  for (let w = 0; w < weeks; w++) {
    const col: (ActivityDay | null)[] = []
    for (let d = 0; d < 7; d++) {
      const key = new Date(start + (w * 7 + d) * DAY_MS).toISOString().slice(0, 10)
      if (key > todayKey) { col.push(null); continue }
      const list = (byDay.get(key) ?? []).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      col.push({ dayKey: key, players: new Set(list.map(a => a.fullName)).size, apps: list })
    }
    grid.push(col)
  }
  return grid
}

// ─── Cuadrante: cuánto juega contra cómo rinde ───────────────────────────────

export type QuadrantId = 'figura' | 'pidePista' | 'aMejorar' | 'sinLugar'

export interface QuadrantPoint {
  fullName: string
  teamId: number
  /** 0..1 — minutos jugados sobre los minutos que jugó su equipo. */
  share: number
  minutes: number
  teamMatches: number
  avgRating: number
  ratedMatches: number
  quadrant: QuadrantId
}

export const QUADRANT_SHARE = 0.5
export const QUADRANT_RATING = 6.8
export const QUADRANT_MIN_RATED = 3

export function quadrantOf(share: number, rating: number): QuadrantId {
  const plays = share >= QUADRANT_SHARE
  const good = rating >= QUADRANT_RATING
  if (plays && good) return 'figura'
  if (!plays && good) return 'pidePista'
  if (plays) return 'aMejorar'
  return 'sinLugar'
}

/**
 * Sólo cuenta lo jugado con su club actual (ver `currentTeams`): el denominador
 * son los partidos de ese club en el período, así un pase a mitad de año no lo
 * hace parecer suplente. Sin 3 partidos con puntaje no se ubica a nadie.
 */
export function computeQuadrant(
  apps: Appearance[],
  roster: RosterEntry[],
  current: Map<string, number>,
  teamMatches: Map<number, number>,
  from: number,
  to: number,
): { points: QuadrantPoint[]; withoutData: string[] } {
  const points: QuadrantPoint[] = []
  const withoutData: string[] = []
  for (const p of roster) {
    const teamId = current.get(p.fullName)
    if (teamId == null) continue
    const matches = teamMatches.get(teamId) ?? 0
    const mine = apps.filter(a => a.fullName === p.fullName && a.teamId === teamId && within(a, from, to))
    const rated = mine.filter(a => played(a) && a.rating != null).map(a => a.rating!)
    if (matches === 0 || rated.length < QUADRANT_MIN_RATED) {
      withoutData.push(p.fullName)
      continue
    }
    const minutes = mine.reduce((s, a) => s + a.minutes, 0)
    const share = Math.min(1, minutes / (matches * 90))
    const avgRating = average(rated)!
    points.push({
      fullName: p.fullName, teamId, share, minutes, teamMatches: matches,
      avgRating, ratedMatches: rated.length, quadrant: quadrantOf(share, avgRating),
    })
  }
  return { points, withoutData }
}

// ─── Forma reciente ──────────────────────────────────────────────────────────

export interface FormStrip {
  fullName: string
  /** Últimos partidos jugados, del más viejo al más nuevo. */
  last: Appearance[]
  recentAvg: number
  previousAvg: number
  /** recentAvg - previousAvg: positivo = viene en alza. */
  trend: number
}

export const FORM_LENGTH = 8
const FORM_RECENT = 3

/** Promedio de los últimos 3 partidos con puntaje contra los 5 anteriores. */
export function computeForm(apps: Appearance[]): FormStrip[] {
  const byPlayer = new Map<string, Appearance[]>()
  for (const a of apps) {
    if (!played(a) || a.rating == null) continue
    const list = byPlayer.get(a.fullName) ?? []
    list.push(a)
    byPlayer.set(a.fullName, list)
  }
  const out: FormStrip[] = []
  for (const [fullName, list] of byPlayer) {
    const last = [...list].sort((a, b) => a.date.localeCompare(b.date)).slice(-FORM_LENGTH)
    if (last.length < FORM_RECENT + 2) continue
    const recent = last.slice(-FORM_RECENT).map(a => a.rating!)
    const previous = last.slice(0, -FORM_RECENT).map(a => a.rating!)
    const recentAvg = average(recent)!
    const previousAvg = average(previous)!
    out.push({ fullName, last, recentAvg, previousAvg, trend: recentAvg - previousAvg })
  }
  return out.sort((a, b) => b.trend - a.trend)
}

// ─── Armá tu gráfico ─────────────────────────────────────────────────────────

export type MetricId =
  | 'minutes' | 'matches' | 'goals' | 'assists' | 'contributions' | 'rating'
  | 'shotsOn' | 'passesKey' | 'recoveries' | 'duelsWon' | 'dribbles'

export interface MetricDef {
  id: MetricId
  label: string
  /** Cómo se lee en la oración y en la explicación ("los goles"). */
  phrase: string
  kind: 'sum' | 'avg'
  value: (a: Appearance) => number | null
  decimals: number
}

export const METRICS: MetricDef[] = [
  { id: 'contributions', label: 'Goles + asistencias', phrase: 'los goles y asistencias', kind: 'sum', value: a => a.goals + a.assists, decimals: 0 },
  { id: 'goals', label: 'Goles', phrase: 'los goles', kind: 'sum', value: a => a.goals, decimals: 0 },
  { id: 'assists', label: 'Asistencias', phrase: 'las asistencias', kind: 'sum', value: a => a.assists, decimals: 0 },
  { id: 'rating', label: 'Rating promedio', phrase: 'el rating de cada partido', kind: 'avg', value: a => a.rating, decimals: 2 },
  { id: 'minutes', label: 'Minutos', phrase: 'los minutos jugados', kind: 'sum', value: a => a.minutes, decimals: 0 },
  { id: 'matches', label: 'Partidos jugados', phrase: 'los partidos jugados', kind: 'sum', value: a => (a.minutes > 0 ? 1 : 0), decimals: 0 },
  { id: 'shotsOn', label: 'Remates al arco', phrase: 'los remates al arco', kind: 'sum', value: a => a.shotsOn, decimals: 0 },
  { id: 'passesKey', label: 'Pases clave', phrase: 'los pases clave', kind: 'sum', value: a => a.passesKey, decimals: 0 },
  { id: 'recoveries', label: 'Quites + intercepciones', phrase: 'los quites e intercepciones', kind: 'sum', value: a => a.tackles + a.interceptions, decimals: 0 },
  { id: 'duelsWon', label: 'Duelos ganados', phrase: 'los duelos ganados', kind: 'sum', value: a => a.duelsWon, decimals: 0 },
  { id: 'dribbles', label: 'Gambetas logradas', phrase: 'las gambetas logradas', kind: 'sum', value: a => a.dribblesSuccess, decimals: 0 },
]

export type GroupBy = 'player' | 'league' | 'team' | 'position' | 'month'
export type RangeId = '30d' | '90d' | '6m' | '1y'

export const RANGES: { id: RangeId; label: string; days: number }[] = [
  { id: '30d', label: 'el último mes', days: 30 },
  { id: '90d', label: 'los últimos 3 meses', days: 91 },
  { id: '6m', label: 'los últimos 6 meses', days: 182 },
  { id: '1y', label: 'el último año', days: 365 },
]

export const GROUPS: { id: GroupBy; label: string }[] = [
  { id: 'player', label: 'por jugador' },
  { id: 'league', label: 'por liga' },
  { id: 'team', label: 'por club' },
  { id: 'position', label: 'por posición' },
  { id: 'month', label: 'mes a mes' },
]

export interface QuerySpec {
  metric: MetricId
  groupBy: GroupBy
  range: RangeId
  /** 'Todos' o un grupo de posición ('Delantero', 'Extremo', …). */
  position: string
  per90: boolean
}

export interface QueryRow {
  key: string
  label: string
  value: number
  matches: number
  minutes: number
}

export interface QueryResult {
  rows: QueryRow[]
  matches: number
  players: number
  from: number
  to: number
  /** Jugadores que quedaron afuera del "cada 90 minutos" por jugar menos de 270'. */
  droppedLowMinutes: number
}

export const PER90_MIN_MINUTES = 270
/** Para que un promedio de rating por jugador no lo defina un solo partido. */
export const RATING_MIN_MATCHES = 3

export interface QueryContext {
  positionOf: (fullName: string) => string
  leagueName: (id: number | null) => string
  teamName: (id: number) => string
}

const MONTH_FMT = new Intl.DateTimeFormat('es-AR', { month: 'short', year: '2-digit', timeZone: AR_TZ })

export function metricDef(id: MetricId): MetricDef {
  return METRICS.find(m => m.id === id) ?? METRICS[0]
}

export function canPer90(spec: Pick<QuerySpec, 'metric'>): boolean {
  const m = metricDef(spec.metric)
  return m.kind === 'sum' && m.id !== 'minutes' && m.id !== 'matches'
}

export function runQuery(spec: QuerySpec, apps: Appearance[], ctx: QueryContext, now: number): QueryResult {
  const metric = metricDef(spec.metric)
  const days = RANGES.find(r => r.id === spec.range)?.days ?? 182
  const from = now - days * DAY_MS
  const scoped = apps.filter(a =>
    played(a) && within(a, from, now + DAY_MS)
    && (spec.position === 'Todos' || ctx.positionOf(a.fullName) === spec.position),
  )

  const keyOf = (a: Appearance): { key: string; label: string } => {
    switch (spec.groupBy) {
      case 'league': return { key: String(a.leagueId ?? 0), label: ctx.leagueName(a.leagueId) }
      case 'team': return { key: String(a.teamId), label: ctx.teamName(a.teamId) }
      case 'position': {
        const pos = ctx.positionOf(a.fullName) || 'Sin posición'
        return { key: pos, label: pos }
      }
      case 'month': {
        const key = dayKeyAR(a.date).slice(0, 7)
        return { key, label: MONTH_FMT.format(new Date(`${key}-15T12:00:00Z`)).replace('.', '') }
      }
      default: return { key: a.fullName, label: a.fullName }
    }
  }

  const acc = new Map<string, { label: string; sum: number; n: number; matches: number; minutes: number }>()
  for (const a of scoped) {
    const { key, label } = keyOf(a)
    const entry = acc.get(key) ?? { label, sum: 0, n: 0, matches: 0, minutes: 0 }
    entry.matches += 1
    entry.minutes += a.minutes
    const v = metric.value(a)
    if (v != null) { entry.sum += v; entry.n += 1 }
    acc.set(key, entry)
  }

  const per90 = spec.per90 && canPer90(spec)
  let droppedLowMinutes = 0
  const rows: QueryRow[] = []
  for (const [key, e] of acc) {
    if (metric.kind === 'avg') {
      if (e.n === 0) continue
      if (spec.groupBy === 'player' && e.n < RATING_MIN_MATCHES) continue
      rows.push({ key, label: e.label, value: e.sum / e.n, matches: e.matches, minutes: e.minutes })
    } else if (per90) {
      if (e.minutes < PER90_MIN_MINUTES) { droppedLowMinutes += 1; continue }
      rows.push({ key, label: e.label, value: (e.sum / e.minutes) * 90, matches: e.matches, minutes: e.minutes })
    } else {
      rows.push({ key, label: e.label, value: e.sum, matches: e.matches, minutes: e.minutes })
    }
  }

  if (spec.groupBy === 'month') rows.sort((a, b) => a.key.localeCompare(b.key))
  else rows.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'es'))

  return {
    rows,
    matches: scoped.length,
    players: new Set(scoped.map(a => a.fullName)).size,
    from,
    to: now,
    droppedLowMinutes,
  }
}
