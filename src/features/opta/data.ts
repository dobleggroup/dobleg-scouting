import { supabase } from '@/lib/supabase'

/**
 * Test Opta: la foto de la Liga Profesional que arma scripts/opta/sync-opta.mjs y
 * guarda en `opta_snapshot` (una fila por bloque). Acá se baja cada bloque una sola
 * vez por sesión y se decodifica de columnas a objetos.
 */

export type RoleCode = 'ARQ' | 'DC' | 'LI' | 'LD' | 'MCD' | 'MC' | 'VI' | 'VD' | 'EI' | 'ED' | 'MCO' | 'DEL'
/** Posiciones de la app (las mismas de Scout Externo / Interno). */
export type AppPos = 'ARQ' | 'LD' | 'CB' | 'LI' | 'VC' | 'VI' | 'EXT' | 'DEL'
/** Grupo de comparación (percentiles y promedios): laterales izquierdos y derechos juntos. */
export type GroupCode = 'GK' | 'CB' | 'FB' | 'VC' | 'VI' | 'EXT' | 'ST'

/** Rol de Opta → posición de la app. El enganche es volante interno; los volantes por fuera, extremos. */
export const ROLE_TO_POS: Record<RoleCode, AppPos> = {
  ARQ: 'ARQ', DC: 'CB', LI: 'LI', LD: 'LD', MCD: 'VC', MC: 'VI', MCO: 'VI', VI: 'EXT', VD: 'EXT', EI: 'EXT', ED: 'EXT', DEL: 'DEL',
}
export const POOL_OF: Record<AppPos, GroupCode> = { ARQ: 'GK', CB: 'CB', LD: 'FB', LI: 'FB', VC: 'VC', VI: 'VI', EXT: 'EXT', DEL: 'ST' }
const POS_FROM_SQUAD: Record<string, AppPos> = { Goalkeeper: 'ARQ', Defender: 'CB', Midfielder: 'VI', Attacker: 'DEL', Forward: 'DEL' }

export interface OptaMeta {
  competition: string
  season: string
  updatedAt: string
  played: number
  total: number
  players: number
  teams: number
  statCols: string[]
  xgCols: string[]
  pvCols: string[]
  teamStatCols: string[]
  evCols: string[]
  logCols: string[]
  grid: [number, number]
  power: { globalRank: number | null; confRank: number | null } | null
}

export interface OptaTeam {
  id: string
  name: string
  short: string
  code: string
  venue: string | null
  kit: string | null
  kit2: string | null
  games: number
  formation: string | null
  stats: Record<string, number>
  xgFor: number
  xgAgainst: number
  power: { rank: number; rating: number } | null
}

export interface StandingRow { rank: number; teamId: string; pts: number; pj: number; w: number; d: number; l: number; gf: number; ga: number; status: string | null }
export interface StandingTable { type: string; group: string | null; rows: StandingRow[] }
export interface StandingStage { name: string; tables: StandingTable[] }

export interface OptaPlayer {
  id: string
  name: string
  fullName: string | null
  matchName: string | null
  teamId: string | null
  teams: string[]
  role: RoleCode | null
  roles: Array<[RoleCode, number]>
  /** Posición de la app donde jugó más minutos. */
  pos: AppPos
  /** Minutos por posición de la app, de mayor a menor. */
  posMinutes: Array<[AppPos, number]>
  group: GroupCode
  squadPos: string | null
  shirt: number | null
  dob: string | null
  age: number | null
  nat: string | null
  nat2: string | null
  height: number | null
  weight: number | null
  foot: string | null
  birthPlace: string | null
  joined: string | null
  contractEnd: string | null
  contractType: string | null
  inSquad: boolean
  /** Totales de la temporada (suma de sus partidos) por clave de Opta: goals, totalPass… */
  stats: Record<string, number>
  /** xG/xA de la temporada (expectedGoals, expectedAssists…). */
  xg: Record<string, number>
  /** Valor de posesión (totalPossessionValue, totalPlusPass…). */
  pv: Record<string, number>
  /** Derivados de los eventos: pases progresivos, al último tercio, al área, posición media. */
  ev: { prog: number; f3: number; box: number; avgX: number | null; avgY: number | null; defX: number | null }
  minutes: number
}

export interface OptaMatch {
  id: string
  date: string
  time: string | null
  week: string | null
  stage: string | null
  status: string | null
  home: string
  away: string
  hs: number | null
  as: number | null
  hxg: number | null
  axg: number | null
  venue: string | null
}

/** [x, y, xG, resultado G/S/M/P/B, minuto, partido, cuerpo H/L/R/O, situación OP/FB/SP/CK/FK/PEN] */
export type OptaShot = [number, number, number, 'G' | 'S' | 'M' | 'P' | 'B', number, string, 'H' | 'L' | 'R' | 'O', string]

export interface MatchLogRow {
  match: string; team: string; min: number; start: boolean; role: RoleCode | null
  goals: number; assists: number; shots: number; passOk: number; passes: number; touches: number
  recoveries: number; pv: number | null; prog: number | null; xg: number; xa: number
}

export interface CareerSpell {
  team: string; teamId: string; national: boolean; from: string | null; to: string | null; transfer: string | null; loan: boolean
  /** [temporada, competición, partidos, minutos, goles, asistencias] */
  seasons: Array<[string, string, number, number, number, number]>
}

export interface OptaLeague {
  meta: OptaMeta
  teams: OptaTeam[]
  teamById: Map<string, OptaTeam>
  standings: StandingStage[]
  players: OptaPlayer[]
  playerById: Map<string, OptaPlayer>
  matches: OptaMatch[]
  matchById: Map<string, OptaMatch>
}

const blockCache = new Map<string, Promise<unknown>>()

export function loadBlock<T>(key: string): Promise<T> {
  if (!blockCache.has(key)) {
    const p = (async () => {
      const { data, error } = await supabase.from('opta_snapshot').select('data').eq('key', key).maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) throw new Error('Todavía no se bajaron los datos de Opta.')
      return data.data as T
    })()
    p.catch(() => blockCache.delete(key))
    blockCache.set(key, p)
  }
  return blockCache.get(key) as Promise<T>
}

const zip = (cols: string[], values: number[]) => {
  const o: Record<string, number> = {}
  for (let i = 0; i < cols.length; i++) if (values[i]) o[cols[i]] = values[i]
  return o
}

let leaguePromise: Promise<OptaLeague> | null = null

/** Todo lo necesario para las listas y fichas (sin remates, mapas de calor ni carrera). */
export function loadLeague(): Promise<OptaLeague> {
  if (!leaguePromise) {
    leaguePromise = (async () => {
      type RawPlayer = Omit<OptaPlayer, 'stats' | 'xg' | 'pv' | 'ev' | 'minutes'> & { s: number[]; x: number[]; pv: number[]; ev: Array<number | null> }
      type RawTeam = Omit<OptaTeam, 'stats'> & { s: number[] }
      const [meta, teamsBlock, rawPlayers, matches] = await Promise.all([
        loadBlock<OptaMeta>('meta'),
        loadBlock<{ teams: RawTeam[]; standings: StandingStage[] }>('teams'),
        loadBlock<RawPlayer[]>('players'),
        loadBlock<OptaMatch[]>('matches'),
      ])
      const teams: OptaTeam[] = teamsBlock.teams.map(({ s, ...t }) => ({ ...t, stats: zip(meta.teamStatCols, s) }))
      // Dos equipos con el mismo nombre corto (Independiente / Independiente Rivadavia):
      // al que tiene el nombre largo distinto se le pone el nombre sin la sigla del club.
      const shortCount = new Map<string, number>()
      for (const t of teams) shortCount.set(t.short, (shortCount.get(t.short) ?? 0) + 1)
      for (const t of teams) {
        if ((shortCount.get(t.short) ?? 0) < 2) continue
        const clean = t.name.replace(/^(CA|CS|CD|Club Atlético|Club|CSD|CAI)\s+/i, '').trim()
        if (clean.toLowerCase() !== t.short.toLowerCase()) t.short = clean
      }
      const players: OptaPlayer[] = rawPlayers.map(({ s, x, pv, ev, ...p }) => {
        const stats = zip(meta.statCols, s)
        const byPos = new Map<AppPos, number>()
        for (const [r, m] of p.roles) byPos.set(ROLE_TO_POS[r], (byPos.get(ROLE_TO_POS[r]) ?? 0) + m)
        const posMinutes = [...byPos].sort((a, b) => b[1] - a[1])
        const pos: AppPos = posMinutes[0]?.[0] ?? POS_FROM_SQUAD[p.squadPos ?? ''] ?? 'VI'
        return {
          ...p,
          pos,
          posMinutes,
          group: POOL_OF[pos],
          stats,
          xg: zip(meta.xgCols, x),
          pv: zip(meta.pvCols, pv),
          ev: { prog: ev[0] ?? 0, f3: ev[1] ?? 0, box: ev[2] ?? 0, avgX: ev[3], avgY: ev[4], defX: ev[5] } as OptaPlayer['ev'],
          minutes: stats.minsPlayed ?? 0,
        }
      })
      return {
        meta, teams, standings: teamsBlock.standings, players, matches,
        teamById: new Map(teams.map(t => [t.id, t])),
        playerById: new Map(players.map(p => [p.id, p])),
        matchById: new Map(matches.map(m => [m.id, m])),
      }
    })()
    leaguePromise.catch(() => { leaguePromise = null })
  }
  return leaguePromise
}

export const loadShots = () => loadBlock<Record<string, OptaShot[]>>('shots')
/** Trazo de pase: [x, y, xFin, yFin, (gol|centro bueno: 1/0)?, partido] */
export type PassSeg = Array<number | string>
export interface PlayerMaps {
  /** Grilla 12×8 de toques y de acciones defensivas. */
  t: number[]
  d: number[]
  /** Pases progresivos [x, y, xFin, yFin, partido]. */
  pp: PassSeg[]
  /** Pases que terminan en remate [x, y, xFin, yFin, fueGol, partido]. */
  kp: PassSeg[]
  /** Centros [x, y, xFin, yFin, llegó, partido]. */
  cr: PassSeg[]
}
export const loadHeatmaps = () => loadBlock<Record<string, PlayerMaps>>('heatmaps')
export const loadCareers = () => loadBlock<Record<string, CareerSpell[]>>('careers')

export async function loadMatchLog(): Promise<Record<string, MatchLogRow[]>> {
  const raw = await loadBlock<Record<string, Array<Array<string | number | null>>>>('matchlog')
  const out: Record<string, MatchLogRow[]> = {}
  for (const [pid, rows] of Object.entries(raw)) {
    out[pid] = rows.map(r => ({
      match: r[0] as string, team: r[1] as string, min: r[2] as number, start: r[3] === 1, role: r[4] as RoleCode | null,
      goals: r[5] as number, assists: r[6] as number, shots: r[7] as number, passOk: r[8] as number, passes: r[9] as number,
      touches: r[10] as number, recoveries: r[11] as number, pv: r[12] as number | null, prog: r[13] as number | null, xg: (r[14] as number) ?? 0, xa: (r[15] as number) ?? 0,
    }))
  }
  return out
}

/** Feed en vivo de un partido, vía el proxy /api/opta (las credenciales quedan en el servidor). */
export async function fetchMatchFeed<T>(feed: 'ma2' | 'ma4' | 'ma12' | 'ma21' | 'ma27' | 'ma30', matchId: string): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`/api/opta?feed=${feed}&fx=${encodeURIComponent(matchId)}`, {
    headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Error ${res.status}`)
  return body as T
}
