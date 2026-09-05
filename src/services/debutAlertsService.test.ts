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
  builder.order = vi.fn(self)
  builder.limit = vi.fn(() => Promise.resolve(result))
  return builder
}

beforeEach(() => {
  mockFrom.mockReset()
})

describe('fetchDebutAlerts', () => {
  it('arma un DebutAlert por cada fila, con los datos embebidos de jugador/equipo/liga', async () => {
    mockFrom.mockReturnValue(chain({
      data: [{
        player_id: 1,
        age_at_debut: 17,
        minutes: 23,
        debut_date: '2026-08-01',
        player: { name: 'Juan Perez', photo: 'foto.png', primary_position: 'DEL' },
        team: { name: 'Boca Juniors', logo: 'boca.png' },
        league: { name: 'Liga Profesional' },
      }],
      error: null,
    }))

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

  it('usa "Desconocido" y nulls cuando faltan los datos embebidos', async () => {
    mockFrom.mockReturnValue(chain({
      data: [{ player_id: 2, age_at_debut: 19, minutes: 5, debut_date: '2026-07-01', player: null, team: null, league: null }],
      error: null,
    }))

    const result = await fetchDebutAlerts()

    expect(result).toEqual([{
      playerId: 2,
      playerName: 'Desconocido',
      photo: null,
      position: null,
      teamName: null,
      teamLogo: null,
      leagueName: null,
      ageAtDebut: 19,
      minutes: 5,
      debutDate: '2026-07-01',
    }])
  })

  it('devuelve array vacio si no hay debutantes', async () => {
    mockFrom.mockReturnValue(chain({ data: [], error: null }))
    expect(await fetchDebutAlerts()).toEqual([])
  })

  it('propaga el error en vez de esconderlo como lista vacia', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: new Error('boom') }))
    await expect(fetchDebutAlerts()).rejects.toThrow('boom')
  })

  it('pide como maximo 100 filas, ordenadas por fecha de debut descendente', async () => {
    const builder = chain({ data: [], error: null })
    mockFrom.mockReturnValue(builder)

    await fetchDebutAlerts()

    expect(builder.order).toHaveBeenCalledWith('debut_date', { ascending: false })
    expect(builder.limit).toHaveBeenCalledWith(100)
  })
})
