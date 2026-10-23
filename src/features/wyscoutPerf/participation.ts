/**
 * Cuánto juega cada jugador, con los partidos de API-Football / Sofascore: si
 * fue titular, si entró de suplente, si no ingresó y cuántos minutos jugó. El
 * rendimiento sale de Wyscout; esto sólo cuenta presencia (Wyscout no dice si
 * fue titular y no registra los partidos que no jugó). Puro: sin React ni Supabase.
 */
import { agencyKey } from '@/services/agencyPlayersService'
import type { Appearance, RosterEntry, TeamFixture } from '@/features/tablero/tableroData'
import type { MatchMinutes } from '@/services/wyscoutPerfService'

const SAME_MATCH_MS = 36 * 60 * 60 * 1000

export interface MonthPlay {
  /** "YYYY-MM" */
  month: string
  /** Partidos de su club en el mes. */
  teamMatches: number
  played: number
  starts: number
  subs: number
  /** Partidos de su club que no jugó (en el banco, no convocado o lesionado). */
  notPlayed: number
  /** De esos, los que estuvo en el banco y no entró (sólo cuando la fuente lo dice). */
  benched: number
  minutes: number
}

export interface Participation {
  /** Partidos de cada jugador con la marca de titular, para contar titularidades. */
  matches: Map<string, MatchMinutes[]>
  /** Mes a mes, desde que hay datos de partidos. */
  months: Map<string, MonthPlay[]>
  /** "YYYY-MM" desde el que hay datos de partidos (antes, sólo Wyscout). */
  since: string
}

/** Fechas de partido sin repetir (un club con dos ids trae el mismo partido dos veces). */
function dedupe(times: number[]): number[] {
  const out: number[] = []
  for (const t of [...times].sort((a, b) => a - b)) if (!out.length || t - out[out.length - 1] >= SAME_MATCH_MS) out.push(t)
  return out
}

const monthOf = (t: number | string) => new Date(t).toISOString().slice(0, 7)

export function buildParticipation(
  apps: Appearance[],
  teamFixtures: TeamFixture[],
  teamAlias: Map<number, number>,
  roster: RosterEntry[],
  sinceISO: string,
  today = new Date(),
): Participation {
  const canon = (id: number) => teamAlias.get(id) ?? id
  const fixturesByTeam = new Map<number, number[]>()
  for (const f of teamFixtures) {
    const id = canon(f.teamId)
    const list = fixturesByTeam.get(id) ?? []
    list.push(new Date(f.date).getTime())
    fixturesByTeam.set(id, list)
  }
  for (const [id, list] of fixturesByTeam) fixturesByTeam.set(id, dedupe(list))

  const appsByKey = new Map<string, Appearance[]>()
  for (const a of apps) {
    const k = agencyKey(a.fullName)
    const list = appsByKey.get(k) ?? []
    list.push(a)
    appsByKey.set(k, list)
  }

  // El primer mes viene cortado (los datos arrancan a mitad de mes): se cuenta desde el siguiente.
  const start = new Date(`${sinceISO.slice(0, 7)}-01T12:00:00Z`)
  start.setUTCMonth(start.getUTCMonth() + 1)
  const since = monthOf(start.getTime())
  const thisMonth = monthOf(today.getTime())
  const allMonths: string[] = []
  for (let d = new Date(`${since}-01T12:00:00Z`); monthOf(d.getTime()) <= thisMonth; d.setUTCMonth(d.getUTCMonth() + 1)) allMonths.push(monthOf(d.getTime()))

  const matches = new Map<string, MatchMinutes[]>()
  const months = new Map<string, MonthPlay[]>()
  for (const p of roster) {
    // Los de Reserva no figuran en estas fuentes (sólo sus partidos viejos de Primera): van con Wyscout.
    if (p.isReserve) continue
    const key = agencyKey(p.fullName)
    const mine = (appsByKey.get(key) ?? []).filter(a => monthOf(a.date) >= since).sort((a, b) => a.date.localeCompare(b.date))
    if (!mine.length) continue
    matches.set(key, mine.filter(a => a.minutes > 0).map(a => ({
      date: a.date.slice(0, 10), minutes: a.minutes, starter: a.isSub == null ? undefined : !a.isSub,
    })))

    // Club de cada mes: el de sus partidos de ese mes; si no figura, el del mes anterior o el del roster.
    let club: number | null = p.apiTeamId != null ? canon(p.apiTeamId) : null
    const firstClub = canon(mine[0].teamId)
    const rows: MonthPlay[] = []
    for (const m of allMonths) {
      const inMonth = mine.filter(a => monthOf(a.date) === m)
      if (inMonth.length) club = canon(inMonth[inMonth.length - 1].teamId)
      else if (m < monthOf(mine[0].date)) club = firstClub
      const team = club != null ? (fixturesByTeam.get(club) ?? []).filter(t => monthOf(t) === m) : []
      const played = inMonth.filter(a => a.minutes > 0)
      const starts = played.filter(a => (a.isSub == null ? a.minutes >= 55 : !a.isSub)).length
      const teamMatches = Math.max(team.length, inMonth.length)
      rows.push({
        month: m,
        teamMatches,
        played: played.length,
        starts,
        subs: played.length - starts,
        notPlayed: Math.max(0, teamMatches - played.length),
        benched: inMonth.filter(a => a.minutes === 0).length,
        minutes: played.reduce((s, a) => s + a.minutes, 0),
      })
    }
    months.set(key, rows)
  }
  return { matches, months, since }
}

/**
 * Partidos de un jugador para contar titularidades: los de API-Football /
 * Sofascore y, en los meses en que ahí no jugó nada pero Wyscout sí tiene
 * partidos (Reserva, una liga que esas fuentes no cubren, o antes de que haya
 * datos), los de Wyscout estimados por minutos.
 */
export function mergedMatches(key: string, p: Participation | null, wyscout: Map<string, MatchMinutes[]>): MatchMinutes[] | undefined {
  const api = p?.matches.get(key)
  const wy = wyscout.get(key)
  if (!api?.length) return wy
  const apiMonths = new Set(api.map(m => m.date.slice(0, 7)))
  return [...(wy ?? []).filter(m => !apiMonths.has(m.date.slice(0, 7))), ...api].sort((a, b) => a.date.localeCompare(b.date))
}
