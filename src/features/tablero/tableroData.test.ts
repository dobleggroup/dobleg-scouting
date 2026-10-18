import { describe, it, expect } from 'vitest'
import {
  toAppearances, currentTeams, computePulse, activityGrid, computeQuadrant, computeForm, runQuery, quadrantOf, dayKeyAR,
  DAY_MS, type TableroStatRow, type RosterEntry, type QueryContext,
} from './tableroData'

const NOW = new Date('2026-10-13T15:00:00Z').getTime()

const roster: RosterEntry[] = [
  { fullName: 'Franco Watson', shortName: 'F. Watson', apiTeamId: 446 },
  { fullName: 'Federico Paradela', shortName: 'F. Paradela', apiTeamId: 479 },
  { fullName: 'Francesco Paradela', shortName: 'F. Paradela', apiTeamId: 434 },
]

let fixtureSeq = 1
function row(name: string, teamId: number, daysAgo: number, extra: Partial<TableroStatRow> = {}): TableroStatRow {
  return {
    player_id: 1, team_id: teamId, fixture_id: fixtureSeq++,
    minutes: 90, goals: 0, assists: 0, shots_total: 0, shots_on: 0, passes_key: 0,
    tackles: 0, interceptions: 0, duels_won: 0, duels_total: 0, dribbles_success: 0, rating: 7,
    player: { name },
    fixture: {
      date: new Date(NOW - daysAgo * DAY_MS).toISOString(),
      league_id: 128, home_team_id: teamId, away_team_id: 999, score_home: 1, score_away: 0,
    },
    ...extra,
  }
}

const ctx: QueryContext = {
  positionOf: n => (n === 'Franco Watson' ? 'Extremo' : 'Volante Interno'),
  leagueName: id => `Liga ${id}`,
  teamName: id => `Club ${id}`,
}

describe('toAppearances', () => {
  it('el nombre corto compartido se resuelve por el club de la fila', () => {
    const apps = toAppearances([row('F. Paradela', 479, 2), row('F. Paradela', 434, 3)], roster)
    expect(apps.map(a => a.fullName).sort()).toEqual(['Federico Paradela', 'Francesco Paradela'])
  })

  it('un nombre corto en otro club no se asigna (puede ser un homónimo)', () => {
    expect(toAppearances([row('F. Watson', 9999, 2)], roster)).toHaveLength(0)
  })

  it('el nombre completo matchea sin acentos ni mayúsculas', () => {
    expect(toAppearances([row('franco WATSON', 446, 1)], roster)[0].fullName).toBe('Franco Watson')
  })

  it('dos filas del mismo partido (gemelas) cuentan una vez, la más completa', () => {
    const a = row('F. Watson', 446, 1, { minutes: 0, rating: null })
    const b = { ...row('Franco Watson', 446, 1, { minutes: 80 }), fixture_id: a.fixture_id }
    const apps = toAppearances([a, b], roster)
    expect(apps).toHaveLength(1)
    expect(apps[0].minutes).toBe(80)
  })

  it('por identidad: la fila de otro proveedor (otro club, otro nombre) es del jugador linkeado', () => {
    const apps = toAppearances([row('Franco Ezequiel Watson', 20012345, 3)], roster, { owners: new Map([[1, 'Franco Watson']]) })
    expect(apps.map(a => a.fullName)).toEqual(['Franco Watson'])
  })

  it('el mismo partido de API-Football y Sofascore cuenta una vez, gana el que tiene puntaje', () => {
    const api = row('Franco Watson', 446, 3, { rating: null, minutes: 90 })
    const sofa = { ...row('Franco Watson', 20012345, 3, { rating: 7.1, minutes: 88 }) }
    sofa.fixture = { ...sofa.fixture!, date: new Date(new Date(api.fixture!.date).getTime() + 3600_000).toISOString() }
    const apps = toAppearances([api, sofa], roster, { owners: new Map([[1, 'Franco Watson']]) })
    expect(apps).toHaveLength(1)
    expect(apps[0].rating).toBe(7.1)
  })

  it('el club actual es el del último partido', () => {
    const apps = toAppearances([row('Franco Watson', 446, 40), row('Franco Watson', 20012345, 3)], roster, { owners: new Map([[1, 'Franco Watson']]) })
    expect(currentTeams(apps, roster).get('Franco Watson')).toBe(20012345)
    expect(currentTeams(apps, roster).get('Federico Paradela')).toBe(479)
  })

  it('nombre corto en el club gemelo de Sofascore cuenta como su club', () => {
    const apps = toAppearances([row('F. Watson', 20003218, 2)], roster, { teamTwins: new Map([[20003218, 446]]) })
    expect(apps[0]).toMatchObject({ fullName: 'Franco Watson', teamId: 446 })
  })

  it('rating 0 es "sin puntaje", no un 0', () => {
    expect(toAppearances([row('Franco Watson', 446, 1, { rating: 0 })], roster)[0].rating).toBeNull()
  })

  it('el día se toma en hora argentina', () => {
    expect(dayKeyAR('2026-10-03T00:30:00+00:00')).toBe('2026-10-02')
  })
})

describe('computePulse', () => {
  it('compara los últimos 7 días contra los 7 anteriores y no cuenta al que no jugó', () => {
    const apps = toAppearances([
      row('Franco Watson', 446, 1, { goals: 1, assists: 1 }),
      row('F. Paradela', 479, 2, { minutes: 0, rating: null }),
      row('Franco Watson', 446, 9, { minutes: 45, rating: 6 }),
    ], roster)
    const p = computePulse(apps, NOW)
    expect(p.current).toEqual({ players: 1, minutes: 90, goalContributions: 2, avgRating: 7 })
    expect(p.previous.minutes).toBe(45)
    expect(p.weekly).toHaveLength(12)
  })
})

describe('activityGrid', () => {
  it('arma semanas de lunes a domingo y deja vacíos los días que no llegaron', () => {
    const grid = activityGrid(toAppearances([row('Franco Watson', 446, 0)], roster), NOW, 4)
    expect(grid).toHaveLength(4)
    const lastWeek = grid[3]
    expect(lastWeek[0]?.dayKey).toBe('2026-10-12') // lunes
    expect(lastWeek[1]?.players).toBe(1)           // martes 13 = hoy
    expect(lastWeek[2]).toBeNull()                  // miércoles todavía no pasó
  })
})

describe('computeQuadrant', () => {
  it('ubica por % de minutos de su club y rating, con mínimo de partidos puntuados', () => {
    const rows = [0, 1, 2, 3].map(d => row('Franco Watson', 446, d * 7 + 1, { minutes: 30, rating: 7.2 }))
    const apps = toAppearances(rows, roster)
    const { points, withoutData } = computeQuadrant(apps, roster, currentTeams(apps, roster), new Map([[446, 4], [479, 4]]), NOW - 60 * DAY_MS, NOW)
    expect(points).toHaveLength(1)
    expect(points[0].share).toBeCloseTo(120 / 360)
    expect(points[0].quadrant).toBe('pidePista')
    expect(withoutData).toContain('Federico Paradela')
  })

  it('cuadrantes', () => {
    expect(quadrantOf(0.8, 7.0)).toBe('figura')
    expect(quadrantOf(0.2, 7.0)).toBe('pidePista')
    expect(quadrantOf(0.8, 6.3)).toBe('aMejorar')
    expect(quadrantOf(0.2, 6.3)).toBe('sinLugar')
  })
})

describe('computeForm', () => {
  it('la tendencia es el promedio de los últimos 3 contra los anteriores', () => {
    const ratings = [6, 6, 6, 6, 6, 7, 8, 9]
    const rows = ratings.map((r, i) => row('Franco Watson', 446, 40 - i * 4, { rating: r }))
    const [f] = computeForm(toAppearances(rows, roster))
    expect(f.recentAvg).toBeCloseTo(8)
    expect(f.previousAvg).toBeCloseTo(6)
    expect(f.trend).toBeCloseTo(2)
    expect(f.last).toHaveLength(8)
  })

  it('con menos de 5 partidos puntuados no hay tendencia', () => {
    const rows = [1, 5, 9, 13].map(d => row('Franco Watson', 446, d))
    expect(computeForm(toAppearances(rows, roster))).toHaveLength(0)
  })
})

describe('runQuery', () => {
  const apps = toAppearances([
    row('Franco Watson', 446, 5, { goals: 2, minutes: 90 }),
    row('Franco Watson', 446, 12, { goals: 1, minutes: 90 }),
    row('F. Paradela', 479, 6, { goals: 1, minutes: 30 }),
    row('F. Paradela', 479, 200, { goals: 5 }),
  ], roster)

  it('suma por jugador dentro del período', () => {
    const r = runQuery({ metric: 'goals', groupBy: 'player', range: '30d', position: 'Todos', per90: false }, apps, ctx, NOW)
    expect(r.rows.map(x => [x.label, x.value])).toEqual([['Franco Watson', 3], ['Federico Paradela', 1]])
    expect(r.matches).toBe(3)
  })

  it('cada 90 minutos deja afuera a quien jugó menos de 270', () => {
    const r = runQuery({ metric: 'goals', groupBy: 'player', range: '30d', position: 'Todos', per90: true }, apps, ctx, NOW)
    expect(r.rows).toHaveLength(0)
    expect(r.droppedLowMinutes).toBe(2)
  })

  it('filtra por posición', () => {
    const r = runQuery({ metric: 'goals', groupBy: 'position', range: '1y', position: 'Extremo', per90: false }, apps, ctx, NOW)
    expect(r.rows).toEqual([expect.objectContaining({ label: 'Extremo', value: 3 })])
  })

  it('mes a mes queda en orden cronológico', () => {
    const r = runQuery({ metric: 'goals', groupBy: 'month', range: '1y', position: 'Todos', per90: false }, apps, ctx, NOW)
    const keys = r.rows.map(x => x.key)
    expect(keys).toEqual([...keys].sort())
  })
})
