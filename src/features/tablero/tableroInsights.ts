import { DAY_MS, dayKeyAR, played, type Appearance, type RosterEntry, type TeamFixture } from './tableroData'

// ─── ¿De quién no tenemos datos? ─────────────────────────────────────────────

/**
 * - reserve: juega en reserva/juveniles (no hay estadísticas públicas de esas categorías).
 * - noLeague: no cargamos la liga de su club (o su club no está en la base).
 * - noClub: no tiene club cargado en la lista de la agencia.
 * - notPlaying: tenemos los partidos de su club y no sumó minutos en los últimos 2 meses.
 */
export type CoverageReason = 'reserve' | 'noLeague' | 'noClub' | 'notPlaying'

export interface CoverageGap {
  fullName: string
  reason: CoverageReason
  /** Club del roster (texto) o el de su último partido. */
  clubName: string
  /** Id del club contra el que se cuentan los partidos que se perdió. */
  clubTeamId: number | null
  /** Último partido con minutos que tenemos (cualquier club). */
  lastPlayed: Appearance | null
  /** Partidos de su club desde su último partido (o en el año, si no jugó nunca). */
  missed: number
  /** Veces que fue al banco sin entrar en ese mismo lapso. */
  bench: number
}

export const STALE_DAYS = 60
const SAME_MATCH_MS_COVERAGE = 36 * 60 * 60 * 1000

/**
 * Por qué un jugador no aparece (o aparece viejo) en los gráficos. Mira, en
 * orden: si juega en reserva, si cargamos la liga de su club, y si su club
 * jugó sin él (cuántos partidos y desde cuándo). `teamAlias` une los ids de
 * un mismo club entre proveedores.
 */
export function coverageGaps(
  roster: RosterEntry[],
  apps: Appearance[],
  teamFixtures: TeamFixture[],
  teamAlias: Map<number, number>,
  now: number,
  teamName: (id: number) => string = id => String(id),
): { gaps: CoverageGap[]; withData: number } {
  const canon = (id: number) => teamAlias.get(id) ?? id
  const fixturesByTeam = new Map<number, number[]>()
  for (const f of teamFixtures) {
    const id = canon(f.teamId)
    const list = fixturesByTeam.get(id) ?? []
    list.push(new Date(f.date).getTime())
    fixturesByTeam.set(id, list)
  }
  // Mismo partido de dos proveedores (< 36 h) = uno.
  for (const [id, times] of fixturesByTeam) {
    times.sort((a, b) => a - b)
    fixturesByTeam.set(id, times.filter((t, i) => i === 0 || t - times[i - 1] >= SAME_MATCH_MS_COVERAGE))
  }
  const byPlayer = new Map<string, Appearance[]>()
  for (const a of apps) {
    const list = byPlayer.get(a.fullName) ?? []
    list.push(a)
    byPlayer.set(a.fullName, list)
  }

  const gaps: CoverageGap[] = []
  let withData = 0
  for (const p of roster) {
    const mine = byPlayer.get(p.fullName) ?? []
    const playedApps = mine.filter(played)
    const lastPlayed = playedApps[playedApps.length - 1] ?? null
    if (lastPlayed && now - new Date(lastPlayed.date).getTime() <= STALE_DAYS * DAY_MS) {
      withData++
      continue
    }

    const lastAny = mine[mine.length - 1] ?? null
    const clubTeamId = p.apiTeamId != null ? canon(p.apiTeamId) : lastAny?.teamId ?? null
    const clubName = p.team || (clubTeamId != null ? teamName(clubTeamId) : '')
    const since = lastPlayed ? new Date(lastPlayed.date).getTime() + DAY_MS : now - 365 * DAY_MS
    const clubMatches = clubTeamId != null ? fixturesByTeam.get(clubTeamId) ?? [] : []
    const missed = clubMatches.filter(t => t >= since && t <= now).length
    const bench = mine.filter(a => !played(a) && new Date(a.date).getTime() >= since).length
    const base = { fullName: p.fullName, clubName, clubTeamId, lastPlayed, missed, bench }

    if (p.isReserve) gaps.push({ ...base, reason: 'reserve' })
    else if (clubTeamId == null && !clubName) gaps.push({ ...base, reason: 'noClub' })
    else if (clubMatches.length === 0) gaps.push({ ...base, reason: 'noLeague' })
    else gaps.push({ ...base, reason: 'notPlaying' })
  }
  const order: CoverageReason[] = ['notPlaying', 'noLeague', 'noClub', 'reserve']
  gaps.sort((a, b) => order.indexOf(a.reason) - order.indexOf(b.reason) || a.fullName.localeCompare(b.fullName, 'es'))
  return { gaps, withData }
}

export const COVERAGE_GROUP_TEXT: Record<CoverageReason, string> = {
  notPlaying: 'Tenemos los partidos de su club, pero no viene sumando minutos',
  noLeague: 'No tenemos cargada la liga de su club',
  noClub: 'Sin club cargado en la lista de la agencia',
  reserve: 'Juegan en reserva: de esa categoría no hay estadísticas públicas',
}

/** La explicación de un caso, en una oración simple. */
export function coverageSentence(
  g: CoverageGap,
  fmtDate: (iso: string) => string,
  teamName: (id: number) => string,
): string {
  const last = g.lastPlayed
  const lastText = last ? `Su último partido que tenemos es del ${fmtDate(last.date)}, con ${teamName(last.teamId)}.` : ''
  const benchText = g.bench > 0 ? ` Fue al banco ${g.bench === 1 ? 'una vez' : `${g.bench} veces`} sin entrar.` : ''
  switch (g.reason) {
    case 'reserve':
      return `Está en la reserva de ${g.clubName || 'su club'}.${benchText}`.trim()
    case 'noClub':
      return `No tiene club cargado. ${lastText}`.trim()
    case 'noLeague':
      return `No cargamos la liga de ${g.clubName || 'su club'}. ${lastText}`.trim()
    case 'notPlaying': {
      const club = g.clubName || 'Su club'
      const plays = `${g.missed} ${g.missed === 1 ? 'partido' : 'partidos'}`
      const head = last
        ? `${club} jugó ${plays} desde el ${fmtDate(last.date)} y él no sumó minutos.`
        : `${club} jugó ${plays} en el último año y él no sumó minutos.`
      return `${head}${benchText} Puede estar lesionado, no ser convocado o haber cambiado de club.`
    }
  }
}

// ─── ¿Cuánto pesa en su equipo? ──────────────────────────────────────────────

export interface TeamImpact {
  fullName: string
  teamId: number
  withPpg: number
  withoutPpg: number
  withMatches: number
  withoutMatches: number
  withWins: number
  withoutWins: number
  /** withPpg - withoutPpg */
  diff: number
}

/** "Con él" = jugó al menos 45 minutos. "Sin él" = no jugó. Los ratos cortos no entran en ninguno. */
export const IMPACT_MIN_MINUTES = 45
export const IMPACT_MIN_MATCHES = 4
const SAME_MATCH_MS = 36 * 60 * 60 * 1000

const points = (gf: number, ga: number) => (gf > ga ? 3 : gf === ga ? 1 : 0)

/**
 * Puntos por partido del club con el jugador en cancha contra sin él. Sólo
 * cuentan los partidos del club desde que el jugador figura en él (si llegó
 * a mitad de año, lo anterior no es "sin él"). Los partidos repetidos entre
 * proveedores (mismo club, menos de 36 h) cuentan una vez.
 */
export function teamImpact(
  apps: Appearance[],
  current: Map<string, number>,
  teamFixtures: TeamFixture[],
  teamAlias: Map<number, number>,
  from: number,
): TeamImpact[] {
  const canon = (id: number) => teamAlias.get(id) ?? id
  const byTeam = new Map<number, TeamFixture[]>()
  for (const f of teamFixtures) {
    const id = canon(f.teamId)
    const list = byTeam.get(id) ?? []
    list.push({ ...f, teamId: id })
    byTeam.set(id, list)
  }
  for (const [id, list] of byTeam) {
    list.sort((a, b) => a.date.localeCompare(b.date))
    const unique: TeamFixture[] = []
    for (const f of list) {
      const prev = unique[unique.length - 1]
      if (prev && new Date(f.date).getTime() - new Date(prev.date).getTime() < SAME_MATCH_MS) continue
      unique.push(f)
    }
    byTeam.set(id, unique)
  }

  const out: TeamImpact[] = []
  for (const [fullName, teamId] of current) {
    const mine = apps.filter(a => a.fullName === fullName && a.teamId === teamId)
    if (mine.length === 0) continue
    const since = Math.max(from, new Date(mine[0].date).getTime() - DAY_MS)
    const fixtures = (byTeam.get(teamId) ?? []).filter(f => new Date(f.date).getTime() >= since)
    let wP = 0, wN = 0, wW = 0, oP = 0, oN = 0, oW = 0
    for (const f of fixtures) {
      const t = new Date(f.date).getTime()
      const app = mine.find(a => Math.abs(new Date(a.date).getTime() - t) < SAME_MATCH_MS)
      const minutes = app?.minutes ?? 0
      const pts = points(f.goalsFor, f.goalsAgainst)
      if (minutes >= IMPACT_MIN_MINUTES) { wP += pts; wN++; if (pts === 3) wW++ }
      else if (minutes === 0) { oP += pts; oN++; if (pts === 3) oW++ }
    }
    if (wN < IMPACT_MIN_MATCHES || oN < IMPACT_MIN_MATCHES) continue
    out.push({
      fullName, teamId,
      withPpg: wP / wN, withoutPpg: oP / oN,
      withMatches: wN, withoutMatches: oN, withWins: wW, withoutWins: oW,
      diff: wP / wN - oP / oN,
    })
  }
  return out.sort((a, b) => b.diff - a.diff)
}

// ─── Carrera de la temporada ─────────────────────────────────────────────────

export type RaceMetric = 'contributions' | 'goals' | 'minutes'

export const RACE_METRICS: { id: RaceMetric; label: string; value: (a: Appearance) => number }[] = [
  { id: 'contributions', label: 'Goles + asistencias', value: a => a.goals + a.assists },
  { id: 'goals', label: 'Goles', value: a => a.goals },
  { id: 'minutes', label: 'Minutos', value: a => a.minutes },
]

export interface RaceFrame {
  /** Último día que cubre el cuadro ('YYYY-MM-DD'). */
  dayKey: string
  /** Acumulado de cada jugador hasta ese día. */
  totals: Map<string, number>
}

/** Un cuadro por semana: lo acumulado por cada jugador desde `from` hasta el fin de esa semana. */
export function raceFrames(apps: Appearance[], metric: RaceMetric, from: number, now: number): RaceFrame[] {
  const value = RACE_METRICS.find(m => m.id === metric)!.value
  const sorted = apps.filter(a => played(a) && new Date(a.date).getTime() >= from).sort((a, b) => a.date.localeCompare(b.date))
  const frames: RaceFrame[] = []
  const totals = new Map<string, number>()
  let i = 0
  for (let end = from + 7 * DAY_MS; ; end += 7 * DAY_MS) {
    const cut = Math.min(end, now)
    while (i < sorted.length && new Date(sorted[i].date).getTime() < cut) {
      const a = sorted[i++]
      totals.set(a.fullName, (totals.get(a.fullName) ?? 0) + value(a))
    }
    frames.push({ dayKey: dayKeyAR(new Date(cut - 1)), totals: new Map(totals) })
    if (end >= now) break
  }
  // Arranca en la primera semana con datos: sin semanas vacías al principio.
  const first = frames.findIndex(f => [...f.totals.values()].some(v => v > 0))
  return first > 0 ? frames.slice(first) : frames
}

// ─── Rendimiento vs. valor de mercado ────────────────────────────────────────

export interface ValuePoint {
  fullName: string
  value: number
  rating: number
  matches: number
  /** Rating real menos el esperado para su valor (positivo = rinde más de lo que vale). */
  residual: number
}

/** Recta rating ~ log10(valor) por mínimos cuadrados. */
export function valueVsRating(
  data: { fullName: string; value: number; rating: number; matches: number }[],
): { points: ValuePoint[]; slope: number; intercept: number } {
  const usable = data.filter(d => d.value > 0)
  const xs = usable.map(d => Math.log10(d.value))
  const n = usable.length
  const mx = xs.reduce((s, x) => s + x, 0) / (n || 1)
  const my = usable.reduce((s, d) => s + d.rating, 0) / (n || 1)
  let num = 0, den = 0
  usable.forEach((d, i) => { num += (xs[i] - mx) * (d.rating - my); den += (xs[i] - mx) ** 2 })
  const slope = den ? num / den : 0
  const intercept = my - slope * mx
  return {
    slope, intercept,
    points: usable.map((d, i) => ({ ...d, residual: d.rating - (intercept + slope * xs[i]) })),
  }
}
