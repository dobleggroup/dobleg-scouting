import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { addMonths, countKinds, groupByDay, monthEnd, monthGrid, startOfWeek, toItem, weekDays, weekLabel, type CalendarEvent } from './calendar'

const ev = (o: Partial<CalendarEvent>): CalendarEvent => ({
  user_id: 'u', day: '2026-11-03', kind: 'entro', title: null, detail: null, status: null, place: null, players: null, at: null, ...o,
})

describe('fechas del calendario', () => {
  it('la semana arranca el lunes', () => {
    expect(startOfWeek('2026-11-04')).toBe('2026-11-02') // miércoles → lunes
    expect(startOfWeek('2026-11-08')).toBe('2026-11-02') // domingo → lunes anterior
    expect(startOfWeek('2026-11-02')).toBe('2026-11-02')
    expect(weekDays('2026-11-04')).toHaveLength(7)
  })
  it('el mes en semanas completas', () => {
    const g = monthGrid('2026-11-15')
    expect(g[0][0]).toBe('2026-10-26')
    expect(g[g.length - 1][6]).toBe('2026-12-06')
    expect(g.flat()).toContain('2026-11-30')
    expect(monthGrid('2026-02-10').length).toBe(5)
  })
  it('mes a mes', () => {
    expect(addMonths('2026-11-15', 1)).toBe('2026-12-01')
    expect(addMonths('2026-01-31', -1)).toBe('2025-12-01')
    expect(monthEnd('2026-02-10')).toBe('2026-02-28')
  })
  it('semana que cruza de mes', () => {
    expect(weekLabel('2026-10-28')).toBe('26 de octubre – 1 de noviembre')
    expect(weekLabel('2026-11-04')).toBe('2 – 8 de noviembre')
  })
})

describe('qué hizo cada día', () => {
  it('agrupa por día, marca si entró y ordena (partidos primero)', () => {
    const m = groupByDay([
      ev({ kind: 'comentario', title: 'J. Pérez', detail: 'Buen partido', status: 'contacto' }),
      ev({ kind: 'entro' }),
      ev({ kind: 'partido', title: 'Boca vs River', status: 'presencial', place: 'La Bombonera', players: 'J. Pérez' }),
      ev({ day: '2026-11-04', kind: 'reunion', title: 'el padre', status: 'pendiente', place: 'presencial|Córdoba', players: 'J. Pérez' }),
    ])
    const d3 = m.get('2026-11-03')!
    expect(d3.entered).toBe(true)
    expect(d3.items.map(i => i.kind)).toEqual(['partido', 'comentario'])
    expect(d3.items[0]).toMatchObject({ tag: 'Partido', title: 'Fue a ver Boca vs River', badge: 'En cancha', detail: 'La Bombonera · Vio a J. Pérez' })
    expect(d3.items[1]).toMatchObject({ tag: 'Contacto', title: 'Tuvo un contacto por J. Pérez', detail: '“Buen partido”' })
    const d4 = m.get('2026-11-04')!
    expect(d4.entered).toBe(false)
    expect(d4.items[0]).toMatchObject({ title: 'Con el padre', badge: 'Presencial', detail: 'Córdoba · Sobre J. Pérez', pending: true })
  })
  it('reunión salida de un comentario se titula con el jugador', () => {
    expect(toItem(ev({ kind: 'reunion', players: 'R. Morínigo', place: 'online|', status: 'aceptada' }))).toMatchObject({ title: 'Reunión sobre R. Morínigo', badge: 'Online', detail: null, pending: false })
  })
  it('cuenta lo de un rango', () => {
    const m = groupByDay([ev({ kind: 'entro' }), ev({ kind: 'reporte', title: 'X' }), ev({ day: '2026-11-10', kind: 'reporte', title: 'Y' })])
    const c = countKinds(m, '2026-11-02', '2026-11-08')
    expect(c.entered).toBe(1)
    expect(c.total).toBe(7)
    expect(c.byKind.reporte).toBe(1)
  })
})
