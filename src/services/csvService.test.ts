import { describe, it, expect } from 'vitest'
import { disambiguateShortNames } from './csvService'

describe('disambiguateShortNames', () => {
  it('dos filas con el mismo nombre corto usan su nombre completo (F. Paradela = Federico y Francesco)', () => {
    const rows = [
      { Jugador: 'F. Paradela', 'Nombre completo': 'Federico Paradela' },
      { Jugador: 'F. Paradela', 'Nombre completo': 'Francesco Paradela' },
      { Jugador: 'J. Paradela', 'Nombre completo': 'Juan Paradela' },
    ]

    expect(disambiguateShortNames(rows).map(r => r.Jugador)).toEqual([
      'Federico Paradela',
      'Francesco Paradela',
      'J. Paradela',
    ])
  })

  it('sin nombre completo cargado, deja el nombre corto como está', () => {
    const rows = [{ Jugador: 'F. Paradela' }, { Jugador: 'F. Paradela', 'Nombre completo': '' }]

    expect(disambiguateShortNames(rows).map(r => r.Jugador)).toEqual(['F. Paradela', 'F. Paradela'])
  })
})
