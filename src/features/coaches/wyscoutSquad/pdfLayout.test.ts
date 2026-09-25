import { describe, it, expect } from 'vitest'
import { planPages } from './pdfLayout'

describe('planPages', () => {
  it('agrupa bloques sin partirlos', () => {
    expect(planPages([100, 200, 300], 450)).toEqual([[0, 1], [2]])
  })
  it('un bloque mas alto que la pagina va solo', () => {
    expect(planPages([100, 600, 50], 450)).toEqual([[0], [1], [2]])
  })
  it('cuenta el espacio entre bloques', () => {
    expect(planPages([200, 200], 410, 20)).toEqual([[0], [1]])
    expect(planPages([200, 200], 420, 20)).toEqual([[0, 1]])
  })
  it('sin bloques', () => {
    expect(planPages([], 450)).toEqual([])
  })
})
