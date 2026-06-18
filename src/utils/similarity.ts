import type { PlayerSeasonScore, PlayerWithScore, Position } from '@/types/scoring'
import { METRICS_BY_POSITION, getMetricValue, type ApiMetricKey } from '@/constants/apiMetrics'

export function computeSimilarity(
  base: PlayerSeasonScore,
  others: { player: PlayerWithScore; score: PlayerSeasonScore }[],
  position: Position,
): { player: PlayerWithScore; distance: number }[] {
  const keys: ApiMetricKey[] = METRICS_BY_POSITION[position]
  const all = [base, ...others.map(o => o.score)]
  const ranges = keys.map(k => {
    const vals = all.map(s => getMetricValue(s, k)).filter((v): v is number => v !== null)
    const min = vals.length ? Math.min(...vals) : 0
    const max = vals.length ? Math.max(...vals) : 0
    return { k, min, span: (max - min) || 1 }
  })
  const vec = (s: PlayerSeasonScore) =>
    ranges.map(r => ((getMetricValue(s, r.k) ?? r.min) - r.min) / r.span)
  const b = vec(base)
  return others
    .map(o => {
      const v = vec(o.score)
      const distance = Math.sqrt(v.reduce((acc, x, i) => acc + (x - b[i]) ** 2, 0))
      return { player: o.player, distance }
    })
    .sort((a, z) => a.distance - z.distance)
}
