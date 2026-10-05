import { describe, it, expect } from 'vitest'
import { normalizeLabel, slugify, parseNumber, parseDuration } from './normalize'

describe('normalizeLabel', () => {
  it('baja a minúsculas, saca acentos y colapsa espacios', () => {
    expect(normalizeLabel('  Vel   Máx ')).toBe('vel max')
    expect(normalizeLabel('Dist Rel x Min')).toBe('dist rel x min')
    expect(normalizeLabel('% Alta Intensidad')).toBe('% alta intensidad')
  })
})

describe('slugify', () => {
  it('arma una key estable', () => {
    expect(slugify('Dist Acele')).toBe('dist_acele')
    expect(slugify('Dist AI (16)')).toBe('dist_ai_16')
    expect(slugify('Vel Máx (km/h)')).toBe('vel_max_km_h')
  })
})

describe('parseNumber', () => {
  it('acepta enteros y coma decimal', () => {
    expect(parseNumber('10222')).toBe(10222)
    expect(parseNumber('30,8')).toBe(30.8)
    expect(parseNumber('117.5')).toBe(117.5)
  })

  it('resuelve separadores de miles', () => {
    expect(parseNumber('1.234,5')).toBe(1234.5)
    expect(parseNumber('1,234')).toBe(1234)
    expect(parseNumber('12.314')).toBe(12314)
    expect(parseNumber('1.234.567')).toBe(1234567)
  })

  it('un punto con otra cantidad de decimales sigue siendo decimal', () => {
    expect(parseNumber('0.512')).toBe(0.512)
    expect(parseNumber('32.1')).toBe(32.1)
    expect(parseNumber('10.25')).toBe(10.25)
  })

  it('devuelve null para lo que no es un número', () => {
    expect(parseNumber('')).toBeNull()
    expect(parseNumber('Ojeda')).toBeNull()
    expect(parseNumber('DZ4')).toBeNull()
    expect(parseNumber('% EQUIPO')).toBeNull()
    expect(parseNumber('1 Tiempo')).toBeNull()
  })
})

describe('parseDuration', () => {
  it('convierte "H:MM:SS" a minutos', () => {
    expect(parseDuration('01:39:37')).toBeCloseTo(99.6167, 3)
    expect(parseDuration('00:45:00')).toBe(45)
  })

  it('devuelve null para lo que no es una duración', () => {
    expect(parseDuration('10222')).toBeNull()
    expect(parseDuration('')).toBeNull()
    expect(parseDuration(null)).toBeNull()
  })
})
