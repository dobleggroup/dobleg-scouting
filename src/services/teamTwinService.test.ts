import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/hooks/usePlayerStats', () => ({ usePlayersList: () => ({ players: [] }) }))

import { buildSquadRatingIndex, lookupSquadRating } from './teamTwinService'

const rated = (id: number, name: string, rating: number | null) => ({ id, name, primary_score: rating })

describe('buildSquadRatingIndex / lookupSquadRating', () => {
  const index = buildSquadRatingIndex([
    rated(1, 'Ezequiel Mastrolia', 7.3),
    rated(2, 'Oswaldo Pacheco', null),                    // fila de Sofascore con 1 partido
    rated(3, 'Oswaldo Enrique Pacheco Oliveros', 7.0),    // la buena, nombre completo
    rated(4, 'Matías Calzón', 6.6),
  ])

  it('matchea "M. Calzon" con "Matías Calzón"', () => {
    expect(lookupSquadRating(index, 'M. Calzon')).toMatchObject({ playerId: 4, rating: 6.6 })
  })

  it('matchea por cualquiera de los apellidos y prefiere al que tiene rating', () => {
    expect(lookupSquadRating(index, 'O. Pacheco')).toMatchObject({ playerId: 3, rating: 7.0 })
  })

  it('sin coincidencia devuelve undefined', () => {
    expect(lookupSquadRating(index, 'J. Pourtau')).toBeUndefined()
  })
})
