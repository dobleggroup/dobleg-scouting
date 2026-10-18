/**
 * Análisis colectivo con Opta (Entrenadores → Test Opta): estadísticas de equipo
 * partido por partido (bloque 'teammatch' de opta_snapshot, lo arma
 * scripts/opta/sync-opta-teammatches.mjs) cruzadas con el fixture de la liga.
 * Solo funciones puras.
 */
import type { OptaMatch } from '@/features/opta/data'

export interface TeamMatchBlock {
  updatedAt: string
  cols: string[]
  /** [partido, equipo, formación, ...valores en el orden de cols] */
  rows: Array<Array<string | number | null>>
  /** partido → equipo → [jugador, lugar en la formación, minutos, titular 1/0, x media, y media] */
  lineups: Record<string, Record<string, Array<[string, number, number, number, number | null, number | null]>>>
}

export type Stats = Record<string, number>

export interface TeamGame {
  match: OptaMatch
  teamId: string
  oppId: string
  home: boolean
  gf: number
  ga: number
  result: 'G' | 'E' | 'P'
  formation: string | null
  us: Stats
  them: Stats
}

/** Índice partido → equipo → { formación, estadísticas }. */
export function indexTeamMatches(block: TeamMatchBlock) {
  const out = new Map<string, Map<string, { formation: string | null; stats: Stats }>>()
  for (const r of block.rows) {
    const [matchId, teamId, formation, ...vals] = r as [string, string, string | null, ...number[]]
    const stats: Stats = {}
    block.cols.forEach((c, i) => { stats[c] = vals[i] ?? 0 })
    if (!out.has(matchId)) out.set(matchId, new Map())
    out.get(matchId)!.set(teamId, { formation, stats })
  }
  return out
}
export type TeamMatchIndex = ReturnType<typeof indexTeamMatches>

/** Partidos jugados de un equipo (más viejo primero), con sus números y los del rival. */
export function teamGames(matches: OptaMatch[], idx: TeamMatchIndex, teamId: string): TeamGame[] {
  return matches
    .filter(m => m.status === 'Played' && (m.home === teamId || m.away === teamId) && idx.has(m.id))
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap(m => {
      const home = m.home === teamId
      const oppId = home ? m.away : m.home
      const us = idx.get(m.id)!.get(teamId), them = idx.get(m.id)!.get(oppId)
      if (!us || !them) return []
      const gf = (home ? m.hs : m.as) ?? 0, ga = (home ? m.as : m.hs) ?? 0
      return [{ match: m, teamId, oppId, home, gf, ga, result: gf > ga ? 'G' : gf === ga ? 'E' : 'P', formation: us.formation, us: us.stats, them: them.stats } as TeamGame]
    })
}

export type Area = 'estilo' | 'ataque' | 'juego' | 'defensa'
export const AREA_LABEL: Record<Area, string> = { estilo: 'Estilo', ataque: 'Ataque', juego: 'Juego con pelota', defensa: 'Defensa y presión' }
export const AREAS: Area[] = ['estilo', 'ataque', 'juego', 'defensa']

export interface TeamMetric {
  key: string
  label: string
  help: string
  area: Area
  /** Valor del partido (o numerador si hay `den`). */
  num: (g: TeamGame) => number
  /** Si está, el valor de un conjunto de partidos es suma(num) / suma(den) × 100 (un porcentaje). */
  den?: (g: TeamGame) => number
  lower?: boolean
  /** Dato de estilo: ni más ni menos es mejor (juego directo, centros). */
  neutral?: boolean
  unit?: '%' | 'm'
  dec: number
}

const u = (k: string) => (g: TeamGame) => g.us[k] ?? 0
const t = (k: string) => (g: TeamGame) => g.them[k] ?? 0

/** Coordenada x de Opta (0-100 del arco propio al rival) a metros. */
const toM = (k: string) => (g: TeamGame) => (g.us[k] ?? 0) * 1.05

export const TEAM_METRICS: TeamMetric[] = [
  { key: 'block', label: 'Altura del bloque', help: 'A cuántos metros de su arco hace, en promedio, sus acciones defensivas (quites, intercepciones, recuperaciones). Más alto = defiende más arriba.', area: 'estilo', num: toM('blockX'), dec: 0, unit: 'm', neutral: true },
  { key: 'line', label: 'Altura de la línea defensiva', help: 'A cuántos metros de su arco defienden, en promedio, sus defensores. Más alto = línea adelantada.', area: 'estilo', num: toM('lineX'), dec: 0, unit: 'm', neutral: true },
  { key: 'highDef', label: 'Defensa en campo rival', help: 'Qué parte de sus acciones defensivas hace en campo rival: cuánto va a presionar arriba.', area: 'estilo', num: u('highDef'), dec: 0, unit: '%', neutral: true },
  { key: 'tilt', label: 'Dominio territorial', help: 'De todos los toques en el último tercio del partido, qué parte son suyos. Más de 50% = juega más cerca del arco rival que el rival del suyo.', area: 'estilo', num: u('tilt'), dec: 0, unit: '%' },
  { key: 'fastbreak', label: 'Remates de contraataque', help: 'Remates después de una contra, por partido.', area: 'estilo', num: u('shotFastbreak'), dec: 1, neutral: true },
  { key: 'setPieceShare', label: 'Peso de la pelota parada', help: 'Qué parte de sus remates vienen de pelota parada (córner, tiro libre, lateral).', area: 'estilo', num: u('attSetpiece'), den: u('totalScoringAtt'), dec: 0, unit: '%', neutral: true },
  { key: 'goals', label: 'Goles a favor', help: 'Goles por partido.', area: 'ataque', num: g => g.gf, dec: 2 },
  { key: 'xg', label: 'Goles esperados (xG)', help: 'Cuántos goles "merecía" hacer por la calidad de sus remates.', area: 'ataque', num: u('xg'), dec: 2 },
  { key: 'shots', label: 'Remates', help: 'Remates por partido.', area: 'ataque', num: u('totalScoringAtt'), dec: 1 },
  { key: 'shotsOn', label: 'Remates al arco', help: 'Remates que iban al arco, por partido.', area: 'ataque', num: u('ontargetScoringAtt'), dec: 1 },
  { key: 'shotsBox', label: 'Remates dentro del área', help: 'Remates desde adentro del área, por partido.', area: 'ataque', num: u('attemptsIbox'), dec: 1 },
  { key: 'bigChances', label: 'Ocasiones claras', help: 'Situaciones muy claras de gol creadas por partido.', area: 'ataque', num: u('bigChanceCreated'), dec: 1 },
  { key: 'boxEntries', label: 'Llegadas al área', help: 'Veces que entra al área rival con pelota (pase o conducción), por partido.', area: 'ataque', num: u('penAreaEntries'), dec: 1 },
  { key: 'boxTouches', label: 'Toques en el área rival', help: 'Toques dentro del área rival por partido.', area: 'ataque', num: u('touchesInOppBox'), dec: 1 },
  { key: 'xgPerShot', label: 'Calidad de cada remate', help: 'xG promedio por remate: más alto = remata desde mejores posiciones.', area: 'ataque', num: u('xg'), den: u('totalScoringAtt'), dec: 2 },
  { key: 'setPieceShots', label: 'Remates de pelota parada', help: 'Remates después de córner, tiro libre o lateral, por partido.', area: 'ataque', num: u('attSetpiece'), dec: 1 },
  { key: 'corners', label: 'Córners a favor', help: 'Córners ganados por partido.', area: 'ataque', num: u('wonCorners'), dec: 1 },

  { key: 'poss', label: 'Posesión', help: 'Porcentaje de tenencia promedio.', area: 'juego', num: u('possessionPercentage'), dec: 1, unit: '%' },
  { key: 'passes', label: 'Pases', help: 'Pases por partido.', area: 'juego', num: u('totalPass'), dec: 0 },
  { key: 'passPct', label: 'Pases acertados', help: 'Porcentaje de pases que llegan a un compañero.', area: 'juego', num: u('accuratePass'), den: u('totalPass'), dec: 1, unit: '%' },
  { key: 'f3Passes', label: 'Pases buenos al último tercio', help: 'Pases que llegan a un compañero en el último tercio, por partido.', area: 'juego', num: u('successfulFinalThirdPasses'), dec: 1 },
  { key: 'longPct', label: 'Juego directo', help: 'Qué parte de sus pases son pelotas largas. Más alto = más directo.', area: 'juego', num: u('totalLongBalls'), den: u('totalPass'), dec: 1, unit: '%', neutral: true },
  { key: 'crosses', label: 'Centros', help: 'Centros (sin contar córners) por partido.', area: 'juego', num: u('totalCrossNocorner'), dec: 1, neutral: true },
  { key: 'carries', label: 'Conducciones progresivas', help: 'Conducciones que avanzan mucho hacia el arco rival, por partido.', area: 'juego', num: u('progressiveCarries'), dec: 1 },
  { key: 'dribbles', label: 'Gambetas ganadas', help: 'Uno contra uno ganados por partido.', area: 'juego', num: u('wonContest'), dec: 1 },

  { key: 'ga', label: 'Goles en contra', help: 'Goles recibidos por partido.', area: 'defensa', num: g => g.ga, lower: true, dec: 2 },
  { key: 'xga', label: 'xG en contra', help: 'Goles esperados del rival por partido: cuánto peligro le generan.', area: 'defensa', num: t('xg'), lower: true, dec: 2 },
  { key: 'shotsAgainst', label: 'Remates en contra', help: 'Remates del rival por partido.', area: 'defensa', num: t('totalScoringAtt'), lower: true, dec: 1 },
  { key: 'boxAgainst', label: 'Llegadas al área en contra', help: 'Veces que el rival entra a su área, por partido.', area: 'defensa', num: t('penAreaEntries'), lower: true, dec: 1 },
  { key: 'ppda', label: 'Presión (PPDA)', help: 'Pases que deja dar al rival antes de intentar recuperar. Menos = presiona más.', area: 'defensa', num: u('ppda'), lower: true, dec: 1 },
  { key: 'highRec', label: 'Recuperaciones en campo rival', help: 'Pelotas ganadas en el último tercio, por partido.', area: 'defensa', num: u('possWonAtt3rd'), dec: 1 },
  { key: 'recoveries', label: 'Recuperaciones', help: 'Pelotas recuperadas por partido. Depende mucho de cuánto tiene la pelota el rival.', area: 'defensa', num: u('ballRecovery'), dec: 1, neutral: true },
  { key: 'duelPct', label: 'Duelos ganados', help: 'Porcentaje de duelos (piso y aire) ganados.', area: 'defensa', num: u('duelWon'), den: g => (g.us.duelWon ?? 0) + (g.us.duelLost ?? 0), dec: 1, unit: '%' },
  { key: 'aerialPct', label: 'Duelos aéreos ganados', help: 'Porcentaje de pelotas aéreas ganadas.', area: 'defensa', num: u('aerialWon'), den: g => (g.us.aerialWon ?? 0) + (g.us.aerialLost ?? 0), dec: 1, unit: '%' },
  { key: 'fouls', label: 'Faltas cometidas', help: 'Faltas por partido.', area: 'defensa', num: u('fkFoulLost'), lower: true, dec: 1 },
]
export const TEAM_METRIC = new Map(TEAM_METRICS.map(m => [m.key, m]))

/** Valor de una métrica en un conjunto de partidos: promedio por partido, o porcentaje sobre las sumas. */
export function metricValue(m: TeamMetric, games: TeamGame[]): number | null {
  if (!games.length) return null
  const n = games.reduce((s, g) => s + m.num(g), 0)
  if (m.den) {
    const d = games.reduce((s, g) => s + m.den!(g), 0)
    // La calidad de remate se muestra como xG por remate (0,12), no ×100.
    if (!d) return null
    return m.key === 'xgPerShot' ? n / d : (n / d) * 100
  }
  return n / games.length
}

export function fmtMetric(m: TeamMetric, v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '—'
  if (m.key === 'xgPerShot') return v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const s = v.toLocaleString('es-AR', { minimumFractionDigits: m.dec, maximumFractionDigits: m.dec })
  return m.unit === '%' ? `${s}%` : m.unit === 'm' ? `${s} m` : s
}

export interface Ranked { teamId: string; value: number | null; rank: number; pct: number }

/** Ranking de una métrica entre equipos (1 = el mejor, ya contempla "menos es mejor"). pct 0-100 = qué parte de la liga supera. */
export function rankTeams(m: TeamMetric, gamesByTeam: Map<string, TeamGame[]>): Map<string, Ranked> {
  const vals = [...gamesByTeam].map(([teamId, gs]) => ({ teamId, value: metricValue(m, gs) }))
  const valid = vals.filter(v => v.value !== null) as Array<{ teamId: string; value: number }>
  const better = (a: number, b: number) => (m.lower ? a < b : a > b)
  const out = new Map<string, Ranked>()
  for (const v of vals) {
    if (v.value === null) { out.set(v.teamId, { ...v, rank: valid.length, pct: 0 }); continue }
    const above = valid.filter(o => better(o.value, v.value!)).length
    const below = valid.filter(o => better(v.value!, o.value)).length
    out.set(v.teamId, { ...v, rank: above + 1, pct: Math.round((below / Math.max(1, valid.length - 1)) * 100) })
  }
  return out
}

export const leagueAverage = (m: TeamMetric, gamesByTeam: Map<string, TeamGame[]>) => {
  const vals = [...gamesByTeam.values()].map(gs => metricValue(m, gs)).filter((v): v is number => v !== null)
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null
}

export interface Record3 { played: number; won: number; drawn: number; lost: number; points: number; gf: number; ga: number }
export function recordOf(games: TeamGame[]): Record3 {
  const won = games.filter(g => g.result === 'G').length, drawn = games.filter(g => g.result === 'E').length
  return {
    played: games.length, won, drawn, lost: games.length - won - drawn, points: won * 3 + drawn,
    gf: games.reduce((s, g) => s + g.gf, 0), ga: games.reduce((s, g) => s + g.ga, 0),
  }
}

/** Formaciones usadas de mayor a menor: "4231" → "4-2-3-1". */
export function formations(games: TeamGame[]): Array<{ formation: string; count: number }> {
  const c = new Map<string, number>()
  for (const g of games) if (g.formation) c.set(g.formation, (c.get(g.formation) ?? 0) + 1)
  return [...c].map(([formation, count]) => ({ formation, count })).sort((a, b) => b.count - a.count)
}
export const prettyFormation = (f: string) => f.split('').join('-')

export interface Usage { playerId: string; starts: number; apps: number; minutes: number }

/** Titularidades y minutos de cada jugador de un equipo en esos partidos. */
export function playerUsage(games: TeamGame[], lineups: TeamMatchBlock['lineups']): Usage[] {
  const out = new Map<string, Usage>()
  for (const g of games) {
    for (const [pid, , min, start] of lineups[g.match.id]?.[g.teamId] ?? []) {
      const cur = out.get(pid) ?? { playerId: pid, starts: 0, apps: 0, minutes: 0 }
      cur.apps++; cur.starts += start; cur.minutes += min
      out.set(pid, cur)
    }
  }
  return [...out.values()].sort((a, b) => b.minutes - a.minutes)
}

/** Promedio móvil de los últimos `n` valores (null hasta que haya al menos 2). */
export function rolling(values: number[], n = 5): Array<number | null> {
  return values.map((_, i) => {
    const w = values.slice(Math.max(0, i - n + 1), i + 1)
    return w.length >= 2 ? w.reduce((s, v) => s + v, 0) / w.length : null
  })
}

/** Quién ganó y quién perdió minutos entre dos tramos (parte de los minutos del equipo que jugó cada uno). */
export function minutesShift(before: TeamGame[], after: TeamGame[], lineups: TeamMatchBlock['lineups'], n = 6, min = 0.1) {
  const share = (games: TeamGame[]) => new Map(playerUsage(games, lineups).map(u => [u.playerId, u.minutes / Math.max(1, games.length * 90)]))
  const b = share(before), a = share(after)
  const rows = [...new Set([...b.keys(), ...a.keys()])].map(id => ({ id, b: b.get(id) ?? 0, a: a.get(id) ?? 0 })).map(x => ({ ...x, delta: x.a - x.b }))
  return {
    gained: rows.filter(x => x.delta > min).sort((x, y) => y.delta - x.delta).slice(0, n),
    lost: rows.filter(x => x.delta < -min).sort((x, y) => x.delta - y.delta).slice(0, n),
  }
}
