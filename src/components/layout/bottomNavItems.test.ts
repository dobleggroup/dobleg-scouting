import { describe, it, expect } from 'vitest'
import { BOTTOM_NAV_ITEMS, activeNavKey } from './bottomNavItems'

describe('activeNavKey', () => {
  it('inicio sólo matchea la raíz exacta', () => {
    expect(activeNavKey('/', BOTTOM_NAV_ITEMS)).toBe('inicio')
    expect(activeNavKey('/interno', BOTTOM_NAV_ITEMS)).not.toBe('inicio')
  })
  it('jugadores matchea /interno y sus subrutas', () => {
    expect(activeNavKey('/interno', BOTTOM_NAV_ITEMS)).toBe('jugadores')
    expect(activeNavKey('/interno/detalle', BOTTOM_NAV_ITEMS)).toBe('jugadores')
  })
  it('mapea el resto de destinos', () => {
    expect(activeNavKey('/calendario', BOTTOM_NAV_ITEMS)).toBe('calendario')
    expect(activeNavKey('/seguimiento-gg', BOTTOM_NAV_ITEMS)).toBe('seguimiento')
    expect(activeNavKey('/evaluar', BOTTOM_NAV_ITEMS)).toBe('reporte')
  })
  it('ruta desconocida devuelve null', () => {
    expect(activeNavKey('/comparacion', BOTTOM_NAV_ITEMS)).toBeNull()
  })
})
