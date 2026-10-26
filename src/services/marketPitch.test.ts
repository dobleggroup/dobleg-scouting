import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { mergePitchSelection, pitchSpotsTaken } from './marketService'

describe('canchita de búsquedas', () => {
  it('un solo extremo se guarda con su lado', () => {
    expect(mergePitchSelection(['Extremo derecho'])).toEqual(['Extremo derecho'])
  })

  it('los dos extremos se guardan como "Extremo", y los dos interiores como "Interior"', () => {
    expect(mergePitchSelection(['Delantero', 'Extremo izquierdo', 'Extremo derecho', 'Interior derecho', 'Interior izquierdo']))
      .toEqual(['Interior', 'Extremo', 'Delantero'])
  })

  it('ordena de arquero a delantero', () => {
    expect(mergePitchSelection(['Delantero', 'Enganche', 'Arquero', 'Volante central']))
      .toEqual(['Arquero', 'Volante central', 'Enganche', 'Delantero'])
  })

  it('"Extremo" ya guardado ocupa los dos lugares de la canchita', () => {
    expect(pitchSpotsTaken(['Extremo', 'Delantero'])).toEqual(['Extremo izquierdo', 'Extremo derecho', 'Delantero'])
  })
})
