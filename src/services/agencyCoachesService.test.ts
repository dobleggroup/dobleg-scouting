import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}))

import { listAgencyCoaches, getAgencyCoachByKey, createAgencyCoach } from './agencyCoachesService'

function chain(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {}
  const self = () => builder
  builder.select = vi.fn(self)
  builder.eq = vi.fn(self)
  builder.order = vi.fn(() => Promise.resolve(result))
  builder.maybeSingle = vi.fn(() => Promise.resolve(result))
  builder.insert = vi.fn(self)
  builder.single = vi.fn(() => Promise.resolve(result))
  return builder
}

beforeEach(() => {
  mockFrom.mockReset()
})

describe('listAgencyCoaches', () => {
  it('mapea las columnas snake_case de Supabase al shape de AgencyCoach', async () => {
    mockFrom.mockReturnValue(chain({
      data: [{
        key: 'domingo', full_name: 'Nicolás Domingo', photo_url: '/coaches/domingo.png',
        status: 'activo', club: 'Temperley', api_team_id: 454, reserve_api_team_id: null,
        league_api_id: 129, league_name: 'Primera Nacional', league_season: 2026,
        coach_api_id: null, relationship: 'propio',
      }],
      error: null,
    }))
    const coaches = await listAgencyCoaches()
    expect(coaches).toEqual([{
      key: 'domingo', fullName: 'Nicolás Domingo', photo: '/coaches/domingo.png',
      status: 'activo', club: 'Temperley', apiTeamId: 454, reserveApiTeamId: null,
      leagueApiId: 129, leagueName: 'Primera Nacional', leagueSeason: 2026,
      coachApiId: null, relationship: 'propio', tenureStart: null,
    }])
  })

  it('mapea tenure_start a tenureStart (null si falta)', async () => {
    mockFrom.mockReturnValue(chain({
      data: [
        { key: 'domingo', full_name: 'Nicolás Domingo', photo_url: null, status: 'activo', club: 'Temperley',
          api_team_id: 454, reserve_api_team_id: null, league_api_id: 129, league_name: 'Primera Nacional',
          league_season: 2026, coach_api_id: 28899, relationship: 'propio', tenure_start: '2026-01-01' },
        { key: 'stillitano', full_name: 'Leandro Stillitano', photo_url: null, status: 'sin_club', club: null,
          api_team_id: null, reserve_api_team_id: null, league_api_id: null, league_name: null,
          league_season: null, coach_api_id: 19200, relationship: 'propio' },
      ],
      error: null,
    }))
    const coaches = await listAgencyCoaches()
    expect(coaches?.[0].tenureStart).toBe('2026-01-01')
    expect(coaches?.[1].tenureStart).toBeNull()
  })

  it('devuelve null si Supabase devuelve error', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: new Error('boom') }))
    expect(await listAgencyCoaches()).toBeNull()
  })
})

describe('getAgencyCoachByKey', () => {
  it('devuelve null si no existe la key', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: null }))
    expect(await getAgencyCoachByKey('inexistente')).toBeNull()
  })
})

describe('createAgencyCoach', () => {
  it('inserta y devuelve el registro creado mapeado', async () => {
    mockFrom.mockReturnValue(chain({
      data: {
        key: 'nuevo-dt', full_name: 'Nuevo DT', photo_url: null, status: 'sin_club',
        club: null, api_team_id: null, reserve_api_team_id: null, league_api_id: null,
        league_name: null, league_season: null, coach_api_id: null, relationship: 'intermediado',
      },
      error: null,
    }))
    const created = await createAgencyCoach({
      key: 'nuevo-dt', fullName: 'Nuevo DT', photo: null, club: null, relationship: 'intermediado',
    })
    expect(created.key).toBe('nuevo-dt')
    expect(created.relationship).toBe('intermediado')
  })
})
