import { describe, it, expect } from 'vitest'
import { initialsFor, subtitleLine, fitFontSize, shortName } from './ogImage'

describe('initialsFor', () => {
  it('toma las dos primeras palabras', () => {
    expect(initialsFor('Luca Orellano')).toBe('LO')
  })

  it('ignora espacios de más', () => {
    expect(initialsFor('  José   Paradela  ')).toBe('JP')
  })

  it('sin nombre devuelve un signo, no una cadena vacía', () => {
    expect(initialsFor('')).toBe('?')
  })
})

describe('subtitleLine', () => {
  it('arma la línea completa', () => {
    expect(subtitleLine({ club: 'Monterrey', posicion: 'EXT', edad: '26', liga: 'Liga MX' }))
      .toBe('Monterrey  ·  EXT  ·  26 años  ·  Liga MX')
  })

  it('omite los campos vacíos sin dejar separadores sueltos', () => {
    expect(subtitleLine({ club: 'Boca', posicion: '', edad: '', liga: 'Liga Profesional' }))
      .toBe('Boca  ·  Liga Profesional')
  })

  it('sin datos devuelve cadena vacía', () => {
    expect(subtitleLine({ club: '', posicion: '', edad: '', liga: '' })).toBe('')
  })
})

describe('shortName', () => {
  it('se queda con el apellido (última palabra)', () => {
    expect(shortName('José Paradela')).toBe('Paradela')
  })

  it('nombre compuesto de un jugador: sigue tomando la última palabra', () => {
    expect(shortName('Juan Martín Ginzo')).toBe('Ginzo')
  })

  it('un solo nombre: lo devuelve tal cual', () => {
    expect(shortName('Pelé')).toBe('Pelé')
  })
})

describe('fitFontSize', () => {
  // Ancho simulado: proporcional al tamaño de fuente.
  const measure = (chars: number) => (size: number) => chars * size * 0.5

  it('devuelve el tamaño inicial si ya entra', () => {
    expect(fitFontSize(measure(10), 900, 78, 40)).toBe(78)
  })

  it('achica hasta que entra', () => {
    // 30 caracteres: a 78px mide 1170; el límite es 700 -> baja a 46 (30*46*0.5=690)
    expect(fitFontSize(measure(30), 700, 78, 40)).toBe(46)
  })

  it('no baja del mínimo aunque no entre', () => {
    expect(fitFontSize(measure(200), 300, 78, 40)).toBe(40)
  })
})
