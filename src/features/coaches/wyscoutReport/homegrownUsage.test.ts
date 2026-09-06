import { describe, it, expect } from 'vitest'
import { computeHomegrownUsageByMatch } from './homegrownUsage'
import type { WyscoutReportMatch } from './wyscoutReportTypes'

describe('computeHomegrownUsageByMatch', () => {
  it('cuenta jugadores y minutos de la lista dada, por fecha de partido', () => {
    const matches: WyscoutReportMatch[] = [
      {
        date: '2026-08-31', rival: 'Quilmes', isHome: false, score: '0-1', competition: 'Primera Nacional',
        lineup: [{ number: 14, name: 'Nicolás Ávalos', positionCode: 'DMF', isStarter: false }],
        stints: [
          { formation: '4-3-3', fromMinute: 87, toMinute: 96, players: [{ x: 0, y: 0, label: 'Nicolás Ávalos' }] },
        ],
      },
    ]
    const result = computeHomegrownUsageByMatch(matches, ['Nicolás Ávalos'])
    expect(result).toEqual([{ date: '2026-08-31', playerCount: 1, totalMinutes: 9 }])
  })

  it('devuelve 0 en partidos sin ningun jugador de la lista', () => {
    const matches: WyscoutReportMatch[] = [
      { date: '2026-08-23', rival: 'Midland', isHome: true, score: '2-1', competition: 'Primera Nacional', lineup: [], stints: [] },
    ]
    expect(computeHomegrownUsageByMatch(matches, ['Nicolás Ávalos'])).toEqual([{ date: '2026-08-23', playerCount: 0, totalMinutes: 0 }])
  })
})
