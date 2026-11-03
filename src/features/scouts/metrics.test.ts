import { describe, expect, it, vi, afterEach } from 'vitest'
import { periodRange, rank } from './metrics'
import { addDays, lastActiveLabel, type ScoutSummary } from '@/services/scoutsPanelService'

const scout = (name: string, reports: number): ScoutSummary => ({
  user_id: name, name, photo_url: null, last_active: null, active_days: [], recent_days: [],
  tracking_now: 0, added: 0, reports, matches: 0, matches_tv: 0, meetings: 0, trips: 0,
  negotiations: 0, comments: 0, contacts: 0, comments_by_player: [], searches: 0, search_list: [], match_list: [], trip_list: [],
  report_list: [], activities: [],
})

afterEach(() => vi.useRealTimers())

describe('rank', () => {
  it('ordena de mayor a menor y los empates comparten puesto', () => {
    const r = rank([scout('B', 3), scout('A', 5), scout('C', 3), scout('D', 0)], 'reports')
    expect(r.map(x => [x.scout.name, x.pos])).toEqual([['A', 1], ['B', 2], ['C', 2], ['D', 4]])
  })
})

describe('periodRange', () => {
  it('calcula los períodos con la fecha de Argentina', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-03T02:00:00Z')) // 2 de noviembre a la noche en Argentina
    expect(periodRange('30d')).toEqual({ from: '2026-10-04', to: '2026-11-02' })
    expect(periodRange('month')).toEqual({ from: '2026-11-01', to: '2026-11-02' })
    expect(periodRange('year')).toEqual({ from: '2026-01-01', to: '2026-11-02' })
    expect(periodRange('all')).toEqual({ from: null, to: '2026-11-02' })
  })
})

describe('fechas', () => {
  it('addDays cruza meses', () => {
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31')
  })
  it('lastActiveLabel', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-03T15:00:00Z'))
    expect(lastActiveLabel(null)).toBe('Nunca entró')
    expect(lastActiveLabel('2026-11-03T12:00:00Z')).toBe('Hoy')
    expect(lastActiveLabel('2026-11-02T12:00:00Z')).toBe('Ayer')
    expect(lastActiveLabel('2026-10-29T12:00:00Z')).toBe('Hace 5 días')
  })
})

