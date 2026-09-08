import { describe, it, expect } from 'vitest'
import { mergeAgencyIntoInternal, applyLiveAgencyData } from './DataContext'
import type { AgencyPlayer } from '@/constants/agencyPlayers'
import type { EnrichedPlayer } from '@/types'
import type { AgencyLiveDataRow } from '@/services/playerStatsService'

function player(over: Partial<EnrichedPlayer> & Pick<EnrichedPlayer, 'Jugador'>): EnrichedPlayer {
  return {
    Liga: '', Equipo: '', 'Posición': '', Edad: '', 'País de nacimiento': '', Pie: '', Altura: '',
    'Valor de mercado (Transfermarkt)': '', 'Vencimiento contrato': '', 'Partidos jugados': '',
    'Minutos jugados': '', Goles: '', xG: '', Asistencias: '', xA: '', 'Posición específica': '',
    id: '', Transfermkt: '', Representante: '', Imagen: '', rating: null, ratingPercentile: null,
    source: 'interno', contractStatus: 'ok', monthsRemaining: null,
    marketValueRaw: 0, minutesPlayed: 0, ageNum: 0,
    ...over,
  }
}

const agency = (over: Partial<AgencyPlayer> & Pick<AgencyPlayer, 'shortName' | 'fullName'>): AgencyPlayer => ({
  image: null, contractEnd: null, marketValue: null, team: '', apiTeamId: null, isReserve: false,
  ...over,
})

const liveRow = (over: Partial<AgencyLiveDataRow> & Pick<AgencyLiveDataRow, 'name'>): AgencyLiveDataRow => ({
  market_value_eur: null, transfermarkt_url: null, birth_date: null, nationality: null,
  ...over,
})

describe('mergeAgencyIntoInternal', () => {
  it('pisa el Equipo del CSV legacy con el team curado en agencyPlayers, para un jugador que ya tenía fila propia', () => {
    // Como el CSV "J. Postigo, ..., Quilmes" — desactualizado desde que ficha por Acassuso.
    const baseInternal = [player({ Jugador: 'J. Postigo', Equipo: 'Quilmes' })]
    const roster = [agency({ shortName: 'J. Postigo', fullName: 'Joaquin Postigo', team: 'Acassuso' })]

    const merged = mergeAgencyIntoInternal(baseInternal, [], roster)

    expect(merged).toHaveLength(1)
    expect(merged[0].Equipo).toBe('Acassuso')
  })

  it('sigue agregando jugadores de la agencia que no están en internal', () => {
    const roster = [agency({ shortName: 'N. Jugador', fullName: 'Nuevo Jugador', team: 'Independiente' })]

    const merged = mergeAgencyIntoInternal([], [], roster)

    expect(merged).toHaveLength(1)
    expect(merged[0].Jugador).toBe('Nuevo Jugador')
    expect(merged[0].Equipo).toBe('Independiente')
  })

  it('no toca el Equipo de jugadores que no son de la agencia (sin roster cargado todavía)', () => {
    const baseInternal = [player({ Jugador: 'Ajeno Cualquiera', Equipo: 'Boca' })]

    const merged = mergeAgencyIntoInternal(baseInternal, [], [])

    expect(merged[0].Equipo).toBe('Boca')
  })

  it('saca del listado a quien ya no está en el roster (Álvaro López deja la agencia)', () => {
    const baseInternal = [
      player({ Jugador: 'Álvaro López', Equipo: 'Albion' }),
      player({ Jugador: 'J. Postigo', Equipo: 'Quilmes' }),
    ]
    const roster = [agency({ shortName: 'J. Postigo', fullName: 'Joaquin Postigo', team: 'Acassuso' })]

    const merged = mergeAgencyIntoInternal(baseInternal, [], roster)

    expect(merged.map(p => p.Jugador)).toEqual(['Joaquin Postigo'])
  })

  it('pisa el nombre corto del CSV legacy con el nombre completo de agencyPlayers (rompía la navegación a la ficha)', () => {
    // Caso real: Julián Palacios tenía fila propia en el CSV interno guardada como
    // "J. Palacios" (nombre corto) — cualquier lookup por nombre completo (ej. desde
    // el widget de rendimiento del Home, que usa AGENCY_PLAYERS.fullName) fallaba.
    const baseInternal = [player({ Jugador: 'J. Palacios', Equipo: 'Unión Santa Fe' })]
    const roster = [agency({ shortName: 'J. Palacios', fullName: 'Julián Palacios', team: 'Unión Santa Fe' })]

    const merged = mergeAgencyIntoInternal(baseInternal, [], roster)

    expect(merged[0].Jugador).toBe('Julián Palacios')
  })

  it('completa Edad y Posición de un alta nueva sin fila propia, a partir de birthDate/position', () => {
    const roster = [agency({
      shortName: 'F. Loyola', fullName: 'Favian Loyola', team: 'Audax Italiano',
      birthDate: '2005-05-18', position: 'Volante interno',
    })]

    const merged = mergeAgencyIntoInternal([], [], roster)

    expect(merged[0]['Posición']).toBe('Volante interno')
    expect(merged[0]['Posición específica']).toBe('Volante interno')
    expect(Number(merged[0].Edad)).toBeGreaterThanOrEqual(20)
    expect(merged[0].ageNum).toBe(Number(merged[0].Edad))
  })

  it('pisa la Posición del CSV legacy con la curada en agencyPlayers, para un jugador que ya tenía fila propia', () => {
    // Como el CSV "J. López, ..., Defensor central" — el usuario dice que juega de volante central.
    const baseInternal = [player({ Jugador: 'J. López', 'Posición': 'Defensor central', 'Posición específica': 'Defensor central' })]
    const roster = [agency({ shortName: 'J. López', fullName: 'Julián López', position: 'Volante central' })]

    const merged = mergeAgencyIntoInternal(baseInternal, [], roster)

    expect(merged[0]['Posición']).toBe('Volante central')
    expect(merged[0]['Posición específica']).toBe('Volante central')
  })
})

describe('applyLiveAgencyData', () => {
  it('pisa el valor de mercado stale del Sheet con el vivo de Supabase (caso real: Prestianni €12.00m en el Sheet, €20M en Transfermarkt/Supabase)', () => {
    const players = [player({ Jugador: 'G. Prestianni', marketValueRaw: 12_000_000, marketValueFormatted: '€12.00m' })]
    const live: AgencyLiveDataRow[] = [liveRow({ name: 'Gianluca Prestianni', market_value_eur: 20_000_000, transfermarkt_url: null })]

    const result = applyLiveAgencyData(players, live)

    expect(result[0].marketValueRaw).toBe(20_000_000)
    expect(result[0].marketValueFormatted).toBe('€20.0M')
  })

  it('completa el link de Transfermarkt cuando el Sheet nunca lo tuvo (caso real: Rodrigo Schlegel sin fila legacy)', () => {
    const players = [player({ Jugador: 'R. Schlegel', Transfermkt: '' })]
    const live: AgencyLiveDataRow[] = [liveRow({
      name: 'Rodrigo Schlegel', market_value_eur: null,
      transfermarkt_url: 'https://www.transfermarkt.com/rodrigo-schlegel/profil/spieler/504258',
    })]

    const result = applyLiveAgencyData(players, live)

    expect(result[0].Transfermkt).toBe('https://www.transfermarkt.com/rodrigo-schlegel/profil/spieler/504258')
  })

  it('matchea por formato corto vs nombre completo, igual que applyAgencyOverrides', () => {
    const players = [player({ Jugador: 'A. Steimbach', marketValueRaw: 500_000 })]
    const live: AgencyLiveDataRow[] = [liveRow({ name: 'Alexis Steimbach', market_value_eur: 1_000_000, transfermarkt_url: null })]

    const result = applyLiveAgencyData(players, live)

    expect(result[0].marketValueRaw).toBe(1_000_000)
  })

  it('no toca jugadores sin dato vivo correspondiente', () => {
    const players = [player({ Jugador: 'Ajeno Cualquiera', marketValueRaw: 500_000, marketValueFormatted: '€500K' })]
    const live: AgencyLiveDataRow[] = [liveRow({ name: 'Gianluca Prestianni', market_value_eur: 20_000_000, transfermarkt_url: null })]

    const result = applyLiveAgencyData(players, live)

    expect(result[0].marketValueRaw).toBe(500_000)
    expect(result[0].marketValueFormatted).toBe('€500K')
  })

  it('no crea una nueva referencia de objeto cuando no hay nada nuevo que pisar', () => {
    const p = player({ Jugador: 'G. Prestianni', marketValueRaw: 20_000_000, Transfermkt: 'https://x' })
    const live: AgencyLiveDataRow[] = [liveRow({ name: 'Gianluca Prestianni', market_value_eur: 20_000_000, transfermarkt_url: 'https://x' })]

    const result = applyLiveAgencyData([p], live)

    expect(result[0]).toBe(p)
  })

  it('devuelve la misma lista sin recorrer nada si no hay filas vivas (fetch falló)', () => {
    const players = [player({ Jugador: 'G. Prestianni', marketValueRaw: 12_000_000 })]

    const result = applyLiveAgencyData(players, [])

    expect(result).toBe(players)
  })
})
