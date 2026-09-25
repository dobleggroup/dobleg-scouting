import { describe, it, expect } from 'vitest'
import { leagueLabel, sortLeaguesForPicker } from './leagueLabels'
import type { LeagueInfo } from '@/types/scoring'

const league = (id: number, name: string, country: string, tier = 4): LeagueInfo =>
  ({ id, name, country, tier, season: 2026, has_player_stats: true })

describe('leagueLabel', () => {
  it('país en castellano primero y la segunda división marcada (caso real: la "segunda de Colombia" no se encontraba)', () => {
    expect(leagueLabel(league(240, 'Primera B', 'Colombia'))).toBe('Colombia · Primera B (2ª división)')
    expect(leagueLabel(league(131, 'Primera Nacional', 'Argentina'))).toBe('Argentina · Primera Nacional (2ª división)')
  })

  it('traduce países y corrige acentos del nombre', () => {
    expect(leagueLabel(league(39, 'Premier League', 'England'))).toBe('Inglaterra · Premier League')
    expect(leagueLabel(league(265, 'Primera Division', 'Chile'))).toBe('Chile · Primera División')
    expect(leagueLabel(league(301, 'Pro League', 'United-Arab-Emirates'))).toBe('Emiratos Árabes Unidos · Pro League')
  })

  it('un país desconocido se muestra tal cual', () => {
    expect(leagueLabel(league(999, 'Superliga', 'Narnia'))).toBe('Narnia · Superliga')
  })
})

describe('sortLeaguesForPicker', () => {
  it('Argentina primero, después por país y dentro del país la primera antes que la segunda', () => {
    const sorted = sortLeaguesForPicker([
      league(240, 'Primera B', 'Colombia', 6),
      league(39, 'Premier League', 'England', 1),
      league(131, 'Primera Nacional', 'Argentina', 6),
      league(239, 'Liga BetPlay', 'Colombia', 4),
      league(128, 'Liga Profesional', 'Argentina', 4),
    ])
    expect(sorted.map(l => l.id)).toEqual([128, 131, 239, 240, 39])
  })
})
