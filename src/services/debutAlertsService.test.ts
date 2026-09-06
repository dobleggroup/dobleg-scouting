import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()
const mockRpc = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args), rpc: (...args: unknown[]) => mockRpc(...args) },
}))

const mockAddScoutPlayer = vi.fn()
const mockRemoveScoutPlayerFromList = vi.fn()
vi.mock('@/services/scoutPlayersService', () => ({
  addScoutPlayer: (...args: unknown[]) => mockAddScoutPlayer(...args),
  removeScoutPlayerFromList: (...args: unknown[]) => mockRemoveScoutPlayerFromList(...args),
}))

import {
  fetchDebutAlerts,
  fetchSeguimientoStatus,
  addDebutAlertToSeguimiento,
  removeDebutAlertFromSeguimiento,
  type DebutAlert,
} from './debutAlertsService'

function chain(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {}
  const self = () => builder
  builder.select = vi.fn(self)
  builder.gte = vi.fn(self)
  builder.order = vi.fn(self)
  builder.limit = vi.fn(() => Promise.resolve(result))
  builder.in = vi.fn(self)
  builder.eq = vi.fn(() => Promise.resolve(result))
  builder.not = vi.fn(() => Promise.resolve(result))
  return builder
}

beforeEach(() => {
  mockFrom.mockReset()
  mockRpc.mockReset()
  mockRpc.mockResolvedValue({ data: [], error: null })
  mockAddScoutPlayer.mockReset()
  mockRemoveScoutPlayerFromList.mockReset()
})

describe('fetchDebutAlerts', () => {
  it('arma un DebutAlert por cada fila, con los datos embebidos de jugador/equipo/liga', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'debut_alerts') {
        return chain({
          data: [{
            player_id: 1,
            display_league_id: 128,
            age_at_debut: 17,
            minutes: 23,
            debut_date: '2026-08-01',
            player: {
              name: 'Juan Perez', photo: 'foto.png', primary_position: 'DEL',
              nationality: 'Argentina', market_value_eur: 500000, contract_end_date: '2028-06-30', agent: 'Doble G Sports Group',
            },
            team: { name: 'Boca Juniors', logo: 'boca.png' },
            league: { name: 'Liga Profesional' },
          }],
          error: null,
        })
      }
      // player_season_scores
      return chain({ data: [{ player_id: 1, avg_rating: 6.8 }], error: null })
    })
    mockRpc.mockResolvedValue({ data: [{ player_id: 1, minutes_since: 180, matches_since: 3 }], error: null })

    const result = await fetchDebutAlerts()

    expect(result).toEqual([{
      playerId: 1,
      displayLeagueId: 128,
      competitionName: 'Liga Profesional',
      playerName: 'Juan Perez',
      photo: 'foto.png',
      position: 'DEL',
      nationality: 'Argentina',
      marketValueEur: 500000,
      contractEndDate: '2028-06-30',
      agent: 'Doble G Sports Group',
      teamName: 'Boca Juniors',
      teamLogo: 'boca.png',
      ageAtDebut: 17,
      minutes: 23,
      debutDate: '2026-08-01',
      minutesSince: 180,
      matchesSince: 3,
      rating: 6.8,
    }])
  })

  it('usa "Desconocido", nulls y actividad/rating en cero cuando faltan los datos', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'debut_alerts') {
        return chain({
          data: [{ player_id: 2, display_league_id: 128, age_at_debut: 19, minutes: 5, debut_date: '2026-07-01', player: null, team: null, league: null }],
          error: null,
        })
      }
      return chain({ data: [], error: null })
    })
    mockRpc.mockResolvedValue({ data: [], error: null })

    const result = await fetchDebutAlerts()

    expect(result).toEqual([{
      playerId: 2,
      displayLeagueId: 128,
      competitionName: null,
      playerName: 'Desconocido',
      photo: null,
      position: null,
      nationality: null,
      marketValueEur: null,
      contractEndDate: null,
      agent: null,
      teamName: null,
      teamLogo: null,
      ageAtDebut: 19,
      minutes: 5,
      debutDate: '2026-07-01',
      minutesSince: 0,
      matchesSince: 0,
      rating: null,
    }])
  })

  it('devuelve array vacio si no hay debutantes', async () => {
    mockFrom.mockReturnValue(chain({ data: [], error: null }))
    expect(await fetchDebutAlerts()).toEqual([])
    // Sin ids, ni el RPC de actividad ni la consulta de ratings deberian dispararse
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('propaga el error en vez de esconderlo como lista vacia', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: new Error('boom') }))
    await expect(fetchDebutAlerts()).rejects.toThrow('boom')
  })

  it('filtra por los ultimos 40 dias, ordenados por fecha de debut descendente', async () => {
    const builder = chain({ data: [], error: null })
    mockFrom.mockReturnValue(builder)

    await fetchDebutAlerts()

    expect(builder.gte).toHaveBeenCalledWith('debut_date', expect.any(String))
    expect(builder.order).toHaveBeenCalledWith('debut_date', { ascending: false })
    expect(builder.limit).toHaveBeenCalledWith(300)
  })
})

describe('fetchSeguimientoStatus', () => {
  it('devuelve un mapa playerId -> scout_players.id para los que estan en seguimiento', async () => {
    mockFrom.mockReturnValue(chain({
      data: [{ id: 'sp-1', supabase_player_id: 1 }, { id: 'sp-2', supabase_player_id: 2 }],
      error: null,
    }))

    const result = await fetchSeguimientoStatus([1, 2, 3])

    expect(result.get(1)).toBe('sp-1')
    expect(result.get(2)).toBe('sp-2')
    expect(result.has(3)).toBe(false)
  })

  it('devuelve un mapa vacio sin consultar la base si no hay ids', async () => {
    const result = await fetchSeguimientoStatus([])
    expect(result.size).toBe(0)
    expect(mockFrom).not.toHaveBeenCalled()
  })
})

describe('addDebutAlertToSeguimiento', () => {
  it('llama a addScoutPlayer con los datos del debutante y la lista scouts_gg', async () => {
    mockAddScoutPlayer.mockResolvedValue({ id: 'sp-nuevo' })
    const alert: DebutAlert = {
      playerId: 10, displayLeagueId: 128, competitionName: 'Liga Profesional', playerName: 'Nuevo Pibe', photo: null, position: 'DEL',
      nationality: 'Argentina', marketValueEur: null, contractEndDate: null, agent: null,
      teamName: 'River', teamLogo: null, ageAtDebut: 18, minutes: 15, debutDate: '2026-08-01',
      minutesSince: 0, matchesSince: 0, rating: null,
    }

    const id = await addDebutAlertToSeguimiento(alert, 'user-1', 'Marcos')

    expect(mockAddScoutPlayer).toHaveBeenCalledWith(
      { full_name: 'Nuevo Pibe', supabase_player_id: 10, club: 'River', posicion: 'DEL', nacionalidad: 'Argentina', agente: undefined },
      'scouts_gg',
      'user-1',
      'Marcos'
    )
    expect(id).toBe('sp-nuevo')
  })
})

describe('removeDebutAlertFromSeguimiento', () => {
  it('llama a removeScoutPlayerFromList con la lista scouts_gg', async () => {
    mockRemoveScoutPlayerFromList.mockResolvedValue(true)
    const result = await removeDebutAlertFromSeguimiento('sp-1')
    expect(mockRemoveScoutPlayerFromList).toHaveBeenCalledWith('sp-1', 'scouts_gg')
    expect(result).toBe(true)
  })
})
