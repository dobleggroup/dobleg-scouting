// src/features/coaches/wyscoutReport/homegrownUsage.ts
import { minutesPlayedInMatch } from './parseMatchesSection'
import type { WyscoutReportMatch } from './wyscoutReportTypes'

/** Cuenta partidos jugados y minutos por partido para una lista de nombres dados
 *  (jugadores surgidos de inferiores). Los stints reales rotulan a cada jugador
 *  por su apellido (ver parseMatchesSection); el lineup guarda el nombre completo.
 *  Se prueban ambos formatos de etiqueta para no depender de cual use el PDF. */
export function computeHomegrownUsageByMatch(
  matches: WyscoutReportMatch[],
  homegrownNames: string[],
): { date: string; playerCount: number; totalMinutes: number }[] {
  return matches.map(match => {
    const namesInMatch = homegrownNames.filter(name => {
      const surname = name.split(' ').pop()!
      return (
        match.lineup.some(p => p.name === name) ||
        match.stints.some(s => s.players.some(pt => pt.label === name || pt.label === surname))
      )
    })
    const totalMinutes = namesInMatch.reduce((sum, name) => {
      const surname = name.split(' ').pop()!
      const minutesBySurname = minutesPlayedInMatch(match.stints, surname)
      const minutesByFullName = surname === name ? 0 : minutesPlayedInMatch(match.stints, name)
      return sum + minutesBySurname + minutesByFullName
    }, 0)
    return { date: match.date, playerCount: namesInMatch.length, totalMinutes }
  })
}
