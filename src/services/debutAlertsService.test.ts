import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}))

import { fetchDebutAlerts } from './debutAlertsService'

function chain(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {}
  const self = () => builder
  builder.select = vi.fn(self)
  builder.order = vi.fn(() => Promise.resolve(result))
  builder.in = vi.fn(() => Promise.resolve(result))
  return builder
}

beforeEach(() => {
  mockFrom.mockReset()
})

describe('fetchDebutAlerts', () => {
  it('arma un DebutAlert por cada fila, cruzando jugador/equipo/liga', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'debut_alerts') {
        return chain({
          data: [{ player_id: 1, league_id: 128, age_at_debut: 17, minutes: 23, debut_date: '2026-08-01' }],
          error: null,
        })
      }
      if (table === 'players') {
        return chain({
          data: [{ id: 1, name: 'Juan Perez', photo: 'foto.png', primary_position: 'DEL', current_team_id: 50 }],
          error: null,
        })
      }
      if (table === 'teams') {
        return chain({ data: [{ id: 50, name: 'Boca Juniors', logo: 'boca.png' }], error: null })
      }
      if (table === 'leagues') {
        return chain({ data: [{ id: 128, name: 'Liga Profesional' }], error: null })
      }
      return chain({ data: [], error: null })
    })

    const result = await fetchDebutAlerts()

    expect(result).toEqual([{
      playerId: 1,
      playerName: 'Juan Perez',
      photo: 'foto.png',
      position: 'DEL',
      teamName: 'Boca Juniors',
      teamLogo: 'boca.png',
      leagueName: 'Liga Profesional',
      ageAtDebut: 17,
      minutes: 23,
      debutDate: '2026-08-01',
    }])
  })

  it('devuelve array vacio si no hay debutantes', async () => {
    mockFrom.mockReturnValue(chain({ data: [], error: null }))
    expect(await fetchDebutAlerts()).toEqual([])
  })
})
