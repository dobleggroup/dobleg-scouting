import { describe, it, expect } from 'vitest'
import { computeWyscoutInsights } from './wyscoutReportInsights'
import type { WyscoutReportData } from './wyscoutReportTypes'

function baseReport(overrides: Partial<WyscoutReportData> = {}): WyscoutReportData {
  return {
    sourceFileName: 'test.pdf', matchCountWindow: 10,
    players: [], formations: [], matches: [], eventMaps: [], zoneGrids: [], setPieces: [],
    ...overrides,
  }
}

describe('computeWyscoutInsights', () => {
  it('no genera ninguna conclusion sobre un reporte vacio', () => {
    expect(computeWyscoutInsights(baseReport())).toEqual([])
  })

  it('destaca la formacion con mejor diferencial de goles cuando hay mas de una', () => {
    const report = baseReport({
      formations: [
        { scheme: '4-2-3-1', usagePct: 60, averagePositions: [], teamStats: [{ label: 'GOLES', own: 6, rival: 4 }] },
        { scheme: '4-4-2', usagePct: 26, averagePositions: [], teamStats: [{ label: 'GOLES', own: 4, rival: 1 }] },
      ],
    })
    const insights = computeWyscoutInsights(report)
    expect(insights.some(i => i.includes('4-4-2'))).toBe(true)
  })

  it('destaca el goleador y el asistidor del tramo', () => {
    const report = baseReport({
      players: [
        { number: 11, name: 'P. Souto', positionCode: 'LAMF', age: 26, foot: null, heightCm: 178, matches: 9, minutesTotal: 762, minutesAvg: 85, goals: 4, assists: 0, yellowCards: 1, redCards: 0, metrics: {} },
        { number: 5, name: 'F. Díaz', positionCode: 'RCMF', age: 26, foot: null, heightCm: 181, matches: 8, minutesTotal: 723, minutesAvg: 90, goals: 0, assists: 4, yellowCards: 6, redCards: 0, metrics: {} },
      ],
    })
    const insights = computeWyscoutInsights(report)
    expect(insights.some(i => i.includes('P. Souto'))).toBe(true)
    expect(insights.some(i => i.includes('F. Díaz'))).toBe(true)
  })

  it('cuenta los titulares distintos usados en la ventana de partidos', () => {
    const report = baseReport({
      matches: [
        { date: '2026-08-31', rival: 'Quilmes', isHome: false, score: '0-1', competition: 'Primera Nacional', lineup: [{ number: 1, name: 'A', positionCode: 'GK', isStarter: true }, { number: 2, name: 'B', positionCode: 'RB', isStarter: true }], stints: [] },
        { date: '2026-08-23', rival: 'Midland', isHome: true, score: '2-1', competition: 'Primera Nacional', lineup: [{ number: 1, name: 'A', positionCode: 'GK', isStarter: true }, { number: 3, name: 'C', positionCode: 'LB', isStarter: true }], stints: [] },
      ],
    })
    const insights = computeWyscoutInsights(report)
    expect(insights.some(i => i.includes('3'))).toBe(true) // A, B, C = 3 titulares distintos
  })
})
