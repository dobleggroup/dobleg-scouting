import { describe, it, expect } from 'vitest'
import { aggregatePerformance } from './agencyPerformanceService'
import type { SquadStatRow } from './playerStatsService'

const roster = [
  { fullName: 'José Paradela', apiTeamId: 1 },
  { fullName: 'Luca Orellano', apiTeamId: 2 },
  { fullName: 'Sin Equipo Api', apiTeamId: null },
]

function row(over: Partial<SquadStatRow>): SquadStatRow {
  return {
    player_id: 1, team_id: 1, minutes: 90, goals: 0, assists: 0,
    shots_total: 0, shots_on: 0, passes_total: 0, passes_key: 0, passes_accuracy: null,
    tackles: 0, interceptions: 0,
    duels_won: 0, duels_total: 0, dribbles_success: 0, dribbles_attempted: 0,
    rating: null, detected_position: null, fixture_id: 1,
    ...over,
  } as SquadStatRow
}

describe('aggregatePerformance', () => {
  it('suma minutos, partidos y goles por jugador de la agencia', () => {
    const rows: SquadStatRow[] = [
      row({ player: { name: 'José Paradela' }, minutes: 90, goals: 1 }),
      row({ player: { name: 'José Paradela' }, minutes: 70, goals: 0 }),
    ]
    const result = aggregatePerformance('month', rows, roster)
    expect(result.byPlayer).toEqual([
      {
        fullName: 'José Paradela', minutes: 160, matches: 2, starts: 2, goals: 1, assists: 0,
        shotsTotal: 0, shotsOn: 0, passesTotal: 0, passesKey: 0, passesAccuracySum: 0, matchesWithPassAcc: 0,
        passesCompletedSum: 0, matchesWithPassesCompleted: 0,
        tackles: 0, interceptions: 0,
        duelsWon: 0, duelsTotal: 0, dribbleSuccess: 0, dribbleAttempted: 0,
        ratingSum: 0, matchesWithRating: 0,
      },
    ])
    expect(result.totalMinutes).toBe(160)
    expect(result.totalMatches).toBe(2)
    expect(result.totalGoals).toBe(1)
  })

  it('ignora filas de jugadores que no son de la agencia', () => {
    const rows: SquadStatRow[] = [row({ player: { name: 'Un Rival Cualquiera' }, minutes: 90 })]
    const result = aggregatePerformance('month', rows, roster)
    expect(result.byPlayer).toEqual([])
  })

  it('matchea nombres sin importar acentos/mayúsculas', () => {
    const rows: SquadStatRow[] = [row({ player: { name: 'JOSE PARADELA' }, minutes: 45 })]
    const result = aggregatePerformance('month', rows, roster)
    expect(result.byPlayer[0]?.fullName).toBe('José Paradela')
  })

  it('cuenta titularidad sólo con 60+ minutos en ese partido', () => {
    const rows: SquadStatRow[] = [
      row({ player: { name: 'José Paradela' }, minutes: 15 }),
      row({ player: { name: 'José Paradela' }, minutes: 75 }),
    ]
    const result = aggregatePerformance('month', rows, roster)
    expect(result.byPlayer[0]?.starts).toBe(1)
    expect(result.byPlayer[0]?.matches).toBe(2)
  })

  it('suma asistencias por jugador y en el total', () => {
    const rows: SquadStatRow[] = [
      row({ player: { name: 'José Paradela' }, minutes: 90, assists: 2 }),
      row({ player: { name: 'José Paradela' }, minutes: 70, assists: 1 }),
    ]
    const result = aggregatePerformance('month', rows, roster)
    expect(result.byPlayer[0]?.assists).toBe(3)
    expect(result.totalAssists).toBe(3)
  })

  it('lista sin minutos a los jugadores con equipo pero sin filas en el período', () => {
    const rows: SquadStatRow[] = [row({ player: { name: 'José Paradela' }, minutes: 90 })]
    const result = aggregatePerformance('month', rows, roster)
    expect(result.noMinutes).toEqual(['Luca Orellano'])
  })

  it('matchea por shortName cuando la API trae el nombre abreviado (ej. "A. Steimbach")', () => {
    const rosterConShort = [
      { fullName: 'Alexis Steimbach', shortName: 'A. Steimbach', apiTeamId: 3 },
    ]
    const rows: SquadStatRow[] = [row({ player: { name: 'A. Steimbach' }, minutes: 13 })]
    const result = aggregatePerformance('month', rows, rosterConShort)
    expect(result.byPlayer[0]?.fullName).toBe('Alexis Steimbach')
    expect(result.byPlayer[0]?.minutes).toBe(13)
  })

  it('promedia el rating de partido y los pases completados (attempts * accuracy)', () => {
    const rows: SquadStatRow[] = [
      row({ player: { name: 'José Paradela' }, minutes: 90, rating: 7.2, passes_total: 40, passes_accuracy: 80 }),
      row({ player: { name: 'José Paradela' }, minutes: 90, rating: 6.8, passes_total: 30, passes_accuracy: 70 }),
    ]
    const result = aggregatePerformance('month', rows, roster)
    const p = result.byPlayer[0]!
    expect(p.ratingSum / p.matchesWithRating).toBeCloseTo(7.0)
    expect(p.passesCompletedSum).toBeCloseTo(40 * 0.8 + 30 * 0.7)
    expect(p.matchesWithPassesCompleted).toBe(2)
  })
})
