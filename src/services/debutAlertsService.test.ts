import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
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
  builder.order = vi.fn(self)
  builder.limit = vi.fn(() => Promise.resolve(result))
  builder.in = vi.fn(self)
  builder.eq = vi.fn(() => Promise.resolve(result))
  return builder
}

beforeEach(() => {
  mockFrom.mockReset()
  mockAddScoutPlayer.mockReset()
  mockRemoveScoutPlayerFromList.mockReset()
})

describe('fetchDebutAlerts', () => {
  it('arma un DebutAlert por cada fila, con los datos embebidos de jugador/equipo/liga', async () => {
    mockFrom.mockReturnValue(chain({
      data: [{
        player_id: 1,
        league_id: 128,
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
      leagueId: 128,
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
      data: [{ player_id: 2, league_id: 128, age_at_debut: 19, minutes: 5, debut_date: '2026-07-01', player: null, team: null, league: null }],
      error: null,
    }))

    const result = await fetchDebutAlerts()

    expect(result).toEqual([{
      playerId: 2,
      leagueId: 128,
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
      playerId: 10, leagueId: 128, playerName: 'Nuevo Pibe', photo: null, position: 'DEL',
      teamName: 'River', teamLogo: null, leagueName: 'Liga Profesional', ageAtDebut: 18, minutes: 15, debutDate: '2026-08-01',
    }

    const id = await addDebutAlertToSeguimiento(alert, 'user-1', 'Marcos')

    expect(mockAddScoutPlayer).toHaveBeenCalledWith(
      { full_name: 'Nuevo Pibe', supabase_player_id: 10, club: 'River', posicion: 'DEL' },
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
