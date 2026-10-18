import { DAY_MS, played, type Appearance, type TeamFixture } from './tableroData'

// ─── Titulares de la semana ──────────────────────────────────────────────────
// Frases cortas, armadas solas a partir de los partidos, con lo que más le
// importa a la agencia de los últimos 7 días.

export type HeadlineKind = 'goals' | 'best' | 'streak' | 'return' | 'benched'

export interface Headline {
  kind: HeadlineKind
  fullName: string
  /** Partido del que habla (si habla de uno). */
  app?: Appearance
  /** Número que acompaña la frase: goles, partidos de racha, días afuera, etc. */
  value: number
}

const WEEK = 7 * DAY_MS
const SAME_MATCH_MS = 36 * 60 * 60 * 1000
export const RETURN_DAYS = 30
export const STREAK_MIN = 3
/** Rating desde el que una actuación "es noticia". */
export const BEST_RATING = 7.5

const t = (a: Appearance) => new Date(a.date).getTime()

export function weeklyHeadlines(
  apps: Appearance[],
  teamFixtures: TeamFixture[],
  teamAlias: Map<number, number>,
  current: Map<string, number>,
  now: number,
  max = 6,
): Headline[] {
  const from = now - WEEK
  const byPlayer = new Map<string, Appearance[]>()
  for (const a of apps) {
    const list = byPlayer.get(a.fullName) ?? []
    list.push(a)
    byPlayer.set(a.fullName, list)
  }
  for (const list of byPlayer.values()) list.sort((a, b) => t(a) - t(b))

  const out: Headline[] = []
  const usedForGoals = new Set<string>()

  // Goles y asistencias de la semana (una frase por partido con aporte).
  for (const [fullName, list] of byPlayer) {
    for (const a of list) {
      if (t(a) < from || !played(a) || a.goals + a.assists === 0) continue
      out.push({ kind: 'goals', fullName, app: a, value: a.goals + a.assists })
      usedForGoals.add(fullName)
    }
  }

  // La mejor actuación de la semana (si no salió ya por un gol).
  const weekRated = apps.filter(a => t(a) >= from && played(a) && a.rating != null)
  const best = weekRated.sort((a, b) => b.rating! - a.rating!)[0]
  if (best && best.rating! >= BEST_RATING && !usedForGoals.has(best.fullName)) {
    out.push({ kind: 'best', fullName: best.fullName, app: best, value: best.rating! })
  }

  for (const [fullName, list] of byPlayer) {
    const playedList = list.filter(played)
    const last = playedList[playedList.length - 1]
    if (!last) continue

    // Racha: partidos seguidos con gol o asistencia, cerrando esta semana.
    if (t(last) >= from) {
      let streak = 0
      for (let i = playedList.length - 1; i >= 0 && playedList[i].goals + playedList[i].assists > 0; i--) streak++
      if (streak >= STREAK_MIN) out.push({ kind: 'streak', fullName, app: last, value: streak })
    }

    // Vuelta: jugó esta semana después de 30 días o más sin minutos.
    const thisWeek = playedList.filter(a => t(a) >= from)
    if (thisWeek.length > 0) {
      const firstThisWeek = thisWeek[0]
      const before = playedList.filter(a => t(a) < t(firstThisWeek))
      const prev = before[before.length - 1]
      if (prev) {
        const days = Math.round((t(firstThisWeek) - t(prev)) / DAY_MS)
        if (days >= RETURN_DAYS) out.push({ kind: 'return', fullName, app: firstThisWeek, value: days })
      }
    }
  }

  // Titular que esta semana no jugó: venía de 60'+ en sus 3 partidos anteriores
  // y su club jugó esta semana sin que él sumara minutos.
  const canon = (id: number) => teamAlias.get(id) ?? id
  for (const [fullName, teamId] of current) {
    const list = byPlayer.get(fullName) ?? []
    const before = list.filter(a => t(a) < from && a.teamId === teamId && played(a)).slice(-3)
    if (before.length < 3 || before.some(a => a.minutes < 60)) continue
    const clubWeek = teamFixtures.filter(f => canon(f.teamId) === teamId && new Date(f.date).getTime() >= from && new Date(f.date).getTime() <= now)
    if (clubWeek.length === 0) continue
    const missed = clubWeek.some(f => {
      const ft = new Date(f.date).getTime()
      const app = list.find(a => Math.abs(t(a) - ft) < SAME_MATCH_MS)
      return !app || app.minutes === 0
    })
    if (missed) out.push({ kind: 'benched', fullName, value: 3 })
  }

  const weight: Record<HeadlineKind, number> = { goals: 0, streak: 1, best: 2, return: 3, benched: 4 }
  return out
    .sort((a, b) => weight[a.kind] - weight[b.kind] || b.value - a.value || (b.app ? t(b.app) : 0) - (a.app ? t(a.app) : 0))
    .slice(0, max)
}
