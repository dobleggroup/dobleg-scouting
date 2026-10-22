import { describe, it, expect } from 'vitest'
import { computeAlerts, countMeetings, buildPlayerPhotoUrl, isValidFollowupDate, type AlertableItem } from './marketAlerts'

function item(over: Partial<AlertableItem> & Pick<AlertableItem, 'id' | 'kind'>): AlertableItem {
  return { status: 'ofrecido', assigned_to_id: null, next_followup_date: null, ...over }
}

describe('computeAlerts', () => {
  // Componentes locales (mes 0-indexado), no un string ISO de solo fecha:
  // `new Date('2026-08-18')` se parsea como medianoche UTC, y los getters
  // locales que usa `computeAlerts` la desalinean un día en zonas con offset
  // negativo (ej. Argentina, UTC-3).
  const today = new Date(2026, 7, 18)

  it('marca "hoy" el mismo día y "vencido" una fecha anterior', () => {
    const items = [item({ id: 1, kind: 'negotiation', next_followup_date: '2026-08-18' }), item({ id: 2, kind: 'negotiation', next_followup_date: '2026-08-10' })]
    const alerts = computeAlerts(items, today)
    expect(alerts.map(a => [a.id, a.urgency])).toEqual([[2, 'vencido'], [1, 'hoy']])
  })

  it('marca "manana" un seguimiento del día siguiente', () => {
    const items = [item({ id: 1, kind: 'need', next_followup_date: '2026-08-19' })]
    const alerts = computeAlerts(items, today)
    expect(alerts).toHaveLength(1)
    expect(alerts[0].urgency).toBe('manana')
  })

  it('no avisa con más de un día de anticipación', () => {
    const items = [item({ id: 1, kind: 'need', next_followup_date: '2026-08-20' })]
    expect(computeAlerts(items, today)).toHaveLength(0)
  })

  it('no incluye items sin fecha de seguimiento', () => {
    const items = [item({ id: 1, kind: 'negotiation', next_followup_date: null })]
    expect(computeAlerts(items, today)).toHaveLength(0)
  })

  it('excluye negociaciones y objetivos cerrados aunque tengan fecha vencida', () => {
    const items = [
      item({ id: 1, kind: 'negotiation', status: 'cerrado_exito', next_followup_date: '2026-08-01' }),
      item({ id: 2, kind: 'negotiation', status: 'cerrado_caido', next_followup_date: '2026-08-01' }),
      item({ id: 3, kind: 'need', status: 'cerrado', next_followup_date: '2026-08-01' }),
    ]
    expect(computeAlerts(items, today)).toHaveLength(0)
  })

  it('ordena vencidos antes que los de mañana', () => {
    const items = [
      item({ id: 1, kind: 'need', next_followup_date: '2026-08-19' }),
      item({ id: 2, kind: 'negotiation', next_followup_date: '2026-08-15' }),
    ]
    const alerts = computeAlerts(items, today)
    expect(alerts.map(a => a.id)).toEqual([2, 1])
  })
})

describe('countMeetings', () => {
  it('cuenta solo las notas marcadas como reunion', () => {
    const notes = [{ is_meeting: true }, { is_meeting: false }, { is_meeting: true }]
    expect(countMeetings(notes)).toBe(2)
  })

  it('con una lista vacia, devuelve 0', () => {
    expect(countMeetings([])).toBe(0)
  })
})

describe('buildPlayerPhotoUrl', () => {
  it('construye la URL de API-Football a partir del id', () => {
    expect(buildPlayerPhotoUrl(5917)).toBe('https://media.api-sports.io/football/players/5917.png')
  })

  it('sin id, devuelve null', () => {
    expect(buildPlayerPhotoUrl(null)).toBeNull()
  })
})

describe('isValidFollowupDate', () => {
  it('acepta una fecha real en formato yyyy-mm-dd', () => {
    expect(isValidFollowupDate('2026-08-29')).toBe(true)
  })

  it('rechaza un año corrupto de mas de 4 digitos (bug real: tipeo en el input nativo produjo "92026-02-08")', () => {
    expect(isValidFollowupDate('92026-02-08')).toBe(false)
  })

  it('rechaza un mes invalido', () => {
    expect(isValidFollowupDate('2026-29-08')).toBe(false)
  })

  it('rechaza un dia que no existe para ese mes (ej. 31 de febrero)', () => {
    expect(isValidFollowupDate('2026-02-31')).toBe(false)
  })

  it('rechaza string vacio o mal formado', () => {
    expect(isValidFollowupDate('')).toBe(false)
    expect(isValidFollowupDate('29/08/2026')).toBe(false)
  })
})
