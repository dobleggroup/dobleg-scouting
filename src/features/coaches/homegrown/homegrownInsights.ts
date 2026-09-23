// src/features/coaches/homegrown/homegrownInsights.ts
// Cálculos puros para la sección "Jugadores surgidos del club": tendencia, promedio móvil,
// edad de los titulares y goles de los chicos del club. Sin I/O: los datos vienen de
// homegrownUsageService.
import type { MatchInput, HomegrownIndex } from './homegrownMatchUsage'

/** Recta de mínimos cuadrados sobre la serie (los null se saltean, el eje x es el índice del
 *  partido). Devuelve el valor ajustado en el primer y último partido y la pendiente por
 *  partido. null si hay menos de 3 valores. */
export function linearTrend(values: (number | null)[]): { start: number; end: number; slope: number } | null {
  const pts = values.flatMap((y, x) => (y === null || Number.isNaN(y) ? [] : [[x, y] as const]))
  if (pts.length < 3) return null
  const n = pts.length
  const sx = pts.reduce((s, [x]) => s + x, 0)
  const sy = pts.reduce((s, [, y]) => s + y, 0)
  const sxx = pts.reduce((s, [x]) => s + x * x, 0)
  const sxy = pts.reduce((s, [x, y]) => s + x * y, 0)
  const denom = n * sxx - sx * sx
  const slope = denom === 0 ? 0 : (n * sxy - sx * sy) / denom
  const intercept = (sy - slope * sx) / n
  return { start: intercept, end: intercept + slope * (values.length - 1), slope }
}

/** Promedio de los últimos `window` valores con dato (al principio, de los que haya). */
export function movingAverage(values: (number | null)[], window: number): (number | null)[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1).filter((v): v is number => v !== null)
    return slice.length ? slice.reduce((s, v) => s + v, 0) / slice.length : null
  })
}

function ageAt(birthIso: string, dateIso: string): number {
  return (Date.parse(dateIso) - Date.parse(birthIso)) / (365.25 * 24 * 3600 * 1000)
}

/** Edad promedio de los titulares en cada partido. Se informa solo si hay fecha de
 *  nacimiento para al menos 8 de los 11 (si no, el promedio no representa al equipo). */
export function starterAgeByMatch(
  matches: MatchInput[],
  teamId: number,
  birthByApiId: Map<number, string>,
): { fixtureId: number; avgAge: number | null; known: number }[] {
  return matches.map(({ fixture, lineup }) => {
    if (!lineup || lineup.team.id !== teamId) return { fixtureId: fixture.fixtureId, avgAge: null, known: 0 }
    const ages = lineup.startXI
      .map(p => birthByApiId.get(p.player.id))
      .filter((b): b is string => !!b)
      .map(b => ageAt(b, fixture.date))
    return {
      fixtureId: fixture.fixtureId,
      avgAge: ages.length >= 8 ? ages.reduce((s, a) => s + a, 0) / ages.length : null,
      known: ages.length,
    }
  })
}

/** Goles de los chicos del club por partido (sin goles en contra ni del rival), con el id
 *  canónico del jugador (los alias de API-Football se unifican vía `homegrown`). */
export function homegrownGoalsByMatch(
  matches: MatchInput[],
  teamId: number,
  homegrown: HomegrownIndex,
): Map<number, { playerId: number; name: string; minute: number }[]> {
  const out = new Map<number, { playerId: number; name: string; minute: number }[]>()
  for (const { fixture, events } of matches) {
    const goals = events
      .filter(e => e.type === 'Goal' && e.detail !== 'Own Goal' && e.team.id === teamId && e.player.id != null && homegrown.has(e.player.id))
      .sort((a, b) => a.time.elapsed - b.time.elapsed)
      .map(e => {
        const p = homegrown.get(e.player.id as number)!
        return { playerId: p.id, name: p.name, minute: e.time.elapsed }
      })
    if (goals.length) out.set(fixture.fixtureId, goals)
  }
  return out
}
