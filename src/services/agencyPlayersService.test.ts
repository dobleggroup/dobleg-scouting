import { describe, it, expect } from 'vitest'
import { agencyKey, mergeAgencyPlayers, matchAgency, type AgencyOverlayRow } from './agencyPlayersService'
import type { AgencyPlayer } from '@/constants/agencyPlayers'

const BASE: AgencyPlayer[] = [
  { shortName: 'G. Prestianni', fullName: 'Gianluca Prestianni', image: null, contractEnd: null, marketValue: '€12.00m', team: 'Benfica', apiTeamId: 211, isReserve: false },
  { shortName: 'J. Paradela', fullName: 'José Paradela', image: null, contractEnd: null, marketValue: '€9.00m', team: 'Cruz Azul', apiTeamId: 2295, isReserve: false },
]

function row(over: Partial<AgencyOverlayRow> & Pick<AgencyOverlayRow, 'kind' | 'player_key' | 'full_name'>): AgencyOverlayRow {
  return {
    short_name: null, api_player_id: null, supabase_player_id: null, image: null,
    contract_end: null, market_value: null, team: null, api_team_id: null, is_reserve: false,
    ...over,
  }
}

describe('agencyKey', () => {
  it('normaliza acentos, puntos y mayúsculas', () => {
    expect(agencyKey('José Paradela')).toBe('jose paradela')
    expect(agencyKey('G. Prestianni')).toBe('g prestianni')
  })
})

describe('mergeAgencyPlayers', () => {
  it('devuelve la base cuando no hay overlay', () => {
    expect(mergeAgencyPlayers(BASE, [])).toHaveLength(2)
  })

  it('agrega un jugador nuevo (kind=add)', () => {
    const overlay = [row({
      kind: 'add', player_key: agencyKey('Santiago Cartagena'), full_name: 'Santiago Cartagena',
      short_name: 'S. Cartagena', api_player_id: 21015257, team: 'Deportivo Maldonado', api_team_id: 2370,
    })]
    const merged = mergeAgencyPlayers(BASE, overlay)
    expect(merged).toHaveLength(3)
    expect(merged.find(p => p.fullName === 'Santiago Cartagena')?.apiTeamId).toBe(2370)
  })

  it('quita un jugador de la base (kind=remove)', () => {
    const overlay = [row({ kind: 'remove', player_key: agencyKey('José Paradela'), full_name: 'José Paradela' })]
    const merged = mergeAgencyPlayers(BASE, overlay)
    expect(merged).toHaveLength(1)
    expect(merged.find(p => p.fullName === 'José Paradela')).toBeUndefined()
  })

  it('no duplica si el agregado ya está en la base', () => {
    const overlay = [row({
      kind: 'add', player_key: agencyKey('Gianluca Prestianni'), full_name: 'Gianluca Prestianni',
      short_name: 'G. Prestianni', market_value: '€15.00m', team: 'Benfica', api_team_id: 211,
    })]
    const merged = mergeAgencyPlayers(BASE, overlay)
    expect(merged).toHaveLength(2)
  })
})

describe('matchAgency', () => {
  const list: AgencyPlayer[] = [
    { shortName: 'G. Prestianni', fullName: 'Gianluca Prestianni', image: null, contractEnd: null, marketValue: null, team: 'Benfica', apiTeamId: 211, isReserve: false },
  ]
  it('matchea por nombre completo normalizado', () => {
    expect(matchAgency(list, { name: 'Gianluca Prestianni' })).toBe(true)
  })
  it('matchea por nombre abreviado', () => {
    expect(matchAgency(list, { name: 'G. Prestianni' })).toBe(true)
  })
  it('no matchea a un jugador ajeno', () => {
    expect(matchAgency(list, { name: 'Lionel Messi' })).toBe(false)
  })
})
