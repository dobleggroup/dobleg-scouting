import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()
vi.mock('@/lib/supabase', () => ({ supabase: { from: (...a: unknown[]) => mockFrom(...a) } }))
import { listSquadCareers } from './squadCareersService'

function chain(result: { data: unknown; error: unknown }) {
  const b: Record<string, unknown> = {}
  b.select = vi.fn(() => b)
  b.eq = vi.fn(() => Promise.resolve(result))
  return b
}
const ROW = {
  tm_player_id: 1129363, api_player_id: 555, api_player_alias_ids: [444], full_name: 'Lisandro Morrone',
  short_name: 'L. Morrone', squad: 'reserva', position: 'Portero', birth_date: '2005-12-23', nationality: 'Argentina',
  height_cm: null, foot: null, photo_url: null, market_value_eur: 25000, contract_until: null,
  youth_clubs: ['Don Torcuato Youth'],
  pro_debut_date: '2026-04-25', pro_debut_club: 'CA Temperley', pro_debut_competition: 'Primera Nacional',
  pro_debut_opponent: 'CA Patronato', pro_debut_coach: 'Nicolás Domingo',
  transfer_history: [{ date: '2025-01-01', from_name: 'Don Torcuato Youth', to_name: 'CA Temperley II', type: 'TRANSFER', from_id: '97767', to_id: '77897' }],
  homegrown_auto: false, homegrown_reason: 'x', homegrown_override: true,
}
beforeEach(() => mockFrom.mockReset())

describe('listSquadCareers', () => {
  it('mapea filas y el override gana sobre el auto', async () => {
    mockFrom.mockReturnValue(chain({ data: [ROW], error: null }))
    const [c] = (await listSquadCareers(454))!
    expect(mockFrom).toHaveBeenCalledWith('club_squad_careers')
    expect(c).toMatchObject({
      fullName: 'Lisandro Morrone', apiPlayerId: 555, apiPlayerAliasIds: [444], homegrown: true,
      youthClubs: ['Don Torcuato Youth'], proDebutCoach: 'Nicolás Domingo',
    })
    expect(c.transferHistory[0]).toEqual({ date: '2025-01-01', fromName: 'Don Torcuato Youth', toName: 'CA Temperley II', type: 'TRANSFER' })
  })
  it('override null usa el auto; alias null queda como lista vacía', async () => {
    mockFrom.mockReturnValue(chain({ data: [{ ...ROW, homegrown_override: null, api_player_alias_ids: null }], error: null }))
    const [c] = (await listSquadCareers(454))!
    expect(c.homegrown).toBe(false)
    expect(c.apiPlayerAliasIds).toEqual([])
  })
  it('error de Supabase devuelve null', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: { message: 'boom' } }))
    expect(await listSquadCareers(454)).toBeNull()
  })
})
