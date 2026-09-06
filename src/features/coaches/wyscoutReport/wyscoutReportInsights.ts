import type { WyscoutReportData } from './wyscoutReportTypes'

export function computeWyscoutInsights(report: WyscoutReportData): string[] {
  const insights: string[] = []

  if (report.formations.length > 1) {
    const withDiff = report.formations
      .map(f => {
        const goles = f.teamStats.find(s => s.label.startsWith('GOLES'))
        return goles ? { scheme: f.scheme, diff: goles.own - goles.rival } : null
      })
      .filter((f): f is { scheme: string; diff: number } => f !== null)
    if (withDiff.length > 1) {
      const best = [...withDiff].sort((a, b) => b.diff - a.diff)[0]
      insights.push(`La formación con mejor diferencial de goles es ${best.scheme} (+${best.diff}).`)
    }
  }

  if (report.players.length > 0) {
    const topScorer = [...report.players].sort((a, b) => b.goals - a.goals)[0]
    if (topScorer.goals > 0) insights.push(`${topScorer.name} es el goleador del tramo con ${topScorer.goals} goles.`)

    const topAssister = [...report.players].sort((a, b) => b.assists - a.assists)[0]
    if (topAssister.assists > 0) insights.push(`${topAssister.name} lidera las asistencias con ${topAssister.assists}.`)
  }

  if (report.matches.length > 0) {
    const startersUsed = new Set(report.matches.flatMap(m => m.lineup.filter(p => p.isStarter).map(p => p.name)))
    insights.push(`Se usaron ${startersUsed.size} titulares distintos en los últimos ${report.matches.length} partidos.`)
  }

  return insights
}
