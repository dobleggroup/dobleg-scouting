import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { pdfFileName } from './exportScoutsPdf'

describe('nombre del PDF', () => {
  it('lleva el nombre del scout y la fecha', () => {
    expect(pdfFileName('Fede Pereyra', '2026-11-04')).toBe('Fede Pereyra - Informe 04-11-2026.pdf')
    expect(pdfFileName('Martín Cortés', '2026-11-04')).toBe('Martín Cortés - Informe 04-11-2026.pdf')
  })
  it('el de todos', () => {
    expect(pdfFileName(null, '2026-11-04')).toBe('Informe de scouts - 04-11-2026.pdf')
  })
  it('sin signos que no se aceptan en un archivo', () => {
    expect(pdfFileName('  Juan / "El Chino"  Pérez ', '2026-01-09')).toBe('Juan El Chino Pérez - Informe 09-01-2026.pdf')
  })
})
