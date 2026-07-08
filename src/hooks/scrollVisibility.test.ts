import { describe, it, expect } from 'vitest'
import { nextNavVisibility } from './scrollVisibility'

describe('nextNavVisibility', () => {
  it('cerca del tope siempre visible', () => {
    expect(nextNavVisibility({ lastY: 0, currentY: 4, visible: false })).toBe(true)
  })
  it('bajando (más que el umbral) oculta', () => {
    expect(nextNavVisibility({ lastY: 100, currentY: 140, visible: true })).toBe(false)
  })
  it('subiendo (más que el umbral) muestra', () => {
    expect(nextNavVisibility({ lastY: 300, currentY: 250, visible: false })).toBe(true)
  })
  it('movimiento menor al umbral no cambia el estado', () => {
    expect(nextNavVisibility({ lastY: 200, currentY: 203, visible: false })).toBe(false)
    expect(nextNavVisibility({ lastY: 200, currentY: 203, visible: true })).toBe(true)
  })
})
