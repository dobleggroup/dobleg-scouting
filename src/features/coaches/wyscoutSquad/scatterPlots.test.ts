import { describe, it, expect } from 'vitest'
import { buildScatter, inGroup, SCATTER_DEFS, median } from './scatterPlots'
import type { SquadPlayer } from './wyscoutSquadTypes'

function player(name: string, positions: string[], stats: SquadPlayer['stats']): SquadPlayer {
  return { name, team: 'Temperley', positions, age: null, birthCountry: null, passports: [], foot: null, heightCm: null, stats }
}

const def = SCATTER_DEFS.find(d => d.id === 'centrales-duelos')!

describe('inGroup', () => {
  it('cuenta cualquier puesto que figure en Wyscout', () => {
    expect(inGroup(player('Ávalos', ['DMF', 'LCB'], {}), 'centrales')).toBe(true)
    expect(inGroup(player('Souto', ['LAMF', 'LW', 'LB'], {}), 'centrales')).toBe(false)
    expect(inGroup(player('Souto', ['LAMF', 'LW', 'LB'], {}), 'extremos')).toBe(true)
  })
})

describe('median', () => {
  it('par e impar', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(median([])).toBeNull()
  })
})

describe('buildScatter', () => {
  const players = [
    player('Arriba', ['LCB'], { minutes: 2000, def_duels_p90: 5, def_duels_won_pct: 80, aerial_p90: 3, aerial_won_pct: 70 }),
    player('Abajo', ['RCB'], { minutes: 2000, def_duels_p90: 5, def_duels_won_pct: 50, aerial_p90: 3, aerial_won_pct: 40 }),
    player('Medio', ['CB'], { minutes: 1500, def_duels_p90: 5, def_duels_won_pct: 65, aerial_p90: 3, aerial_won_pct: 55 }),
    player('Poco', ['LCB'], { minutes: 100, def_duels_p90: 5, def_duels_won_pct: 99, aerial_p90: 3, aerial_won_pct: 99 }),
    player('Delantero', ['CF'], { minutes: 2000, def_duels_p90: 5, def_duels_won_pct: 90, aerial_p90: 3, aerial_won_pct: 90 }),
    player('SinDato', ['LCB'], { minutes: 2000, def_duels_p90: 5, def_duels_won_pct: null, aerial_p90: 3, aerial_won_pct: 60 }),
  ]
  const s = buildScatter(players, def, { minMinutes: 450, teamMatches: 30 })

  it('solo el puesto, con minutos y con los dos datos', () => {
    expect(s.points.map(p => p.name).sort()).toEqual(['Abajo', 'Arriba', 'Medio'])
  })
  it('lineas en la mediana del grupo', () => {
    expect(s.xMid).toBe(65)
    expect(s.yMid).toBe(55)
  })
  it('marca quien esta arriba a la derecha', () => {
    expect(s.points.find(p => p.name === 'Arriba')!.best).toBe(true)
    expect(s.points.find(p => p.name === 'Abajo')!.best).toBe(false)
    expect(s.points.find(p => p.name === 'Medio')!.best).toBe(false)
  })
  it('en porcentajes exige un minimo de intentos', () => {
    const few = [...players, player('DosDuelos', ['LCB'], { minutes: 900, def_duels_p90: 0.2, def_duels_won_pct: 100, aerial_p90: 3, aerial_won_pct: 60 })]
    expect(buildScatter(few, def, { minMinutes: 450, teamMatches: 30 }).points.map(p => p.name)).not.toContain('DosDuelos')
  })
})

describe('SCATTER_DEFS', () => {
  it('ids unicos y grupos conocidos', () => {
    const ids = SCATTER_DEFS.map(d => d.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
