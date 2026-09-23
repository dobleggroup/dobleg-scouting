import { describe, it, expect } from 'vitest'
import { resolveTenureStart, debutedWithCoach, buildHomegrownIndex } from './homegrownUsageService'
import type { AgencyCoach } from '@/constants/agencyCoaches'
import type { SquadCareer } from './squadCareersService'

const coach = { key: 'domingo', fullName: 'Nicolás Domingo', tenureStart: '2026-01-01' } as AgencyCoach
const career = (over: Partial<SquadCareer>) =>
  ({ fullName: 'X', apiPlayerId: null, apiPlayerAliasIds: [], proDebutDate: null, proDebutCoach: null, homegrown: true, ...over }) as SquadCareer

describe('resolveTenureStart', () => {
  it('la fecha manual gana sobre la de la API', () => {
    expect(resolveTenureStart(coach, '2026-07-01')).toBe('2026-01-01')
  })
  it('sin fecha manual usa la API', () => {
    expect(resolveTenureStart({ ...coach, tenureStart: null }, '2026-07-01')).toBe('2026-07-01')
  })
  it('sin ninguna devuelve null', () => {
    expect(resolveTenureStart({ ...coach, tenureStart: null }, null)).toBeNull()
  })
})

describe('debutedWithCoach', () => {
  it('matchea el DT del debut sin importar acentos y respeta la fecha', () => {
    const list = [
      career({ fullName: 'Lisandro Morrone', proDebutDate: '2026-04-25', proDebutCoach: 'Nicolas Domingo' }),
      career({ fullName: 'Lucas Richarte', proDebutDate: '2024-04-21', proDebutCoach: 'Mariano Campodónico' }),
      career({ fullName: 'Viejo', proDebutDate: '2019-01-01', proDebutCoach: 'Nicolás Domingo' }),
      career({ fullName: 'No surgido', proDebutDate: '2026-05-01', proDebutCoach: 'Nicolás Domingo', homegrown: false }),
    ]
    expect(debutedWithCoach(list, 'Nicolás Domingo', '2026-01-01').map(c => c.fullName)).toEqual(['Lisandro Morrone'])
  })
})

describe('buildHomegrownIndex', () => {
  it('mapea id canónico y alias al jugador; ignora no surgidos y sin id', () => {
    const index = buildHomegrownIndex([
      career({ fullName: 'Nicolás Ávalos', apiPlayerId: 647644, apiPlayerAliasIds: [356282] }),
      career({ fullName: 'Hauche', apiPlayerId: 6730, homegrown: false }),
      career({ fullName: 'Stocco', apiPlayerId: null }),
    ])
    expect(index.get(647644)).toEqual({ id: 647644, name: 'Nicolás Ávalos' })
    expect(index.get(356282)).toEqual({ id: 647644, name: 'Nicolás Ávalos' })
    expect(index.has(6730)).toBe(false)
    expect(index.size).toBe(2)
  })
})
