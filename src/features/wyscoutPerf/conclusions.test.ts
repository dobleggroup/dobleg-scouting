import { describe, it, expect } from 'vitest'
import { groupPeriods, seasonLabel, type MonthRow } from './periods'
import { playerConclusions, playerTrend } from './conclusions'
import { METRIC_BY_KEY, dominantGroup, fmtMetric, posGroupOf } from './metrics'

function row(month: string, comp: string, sums: Record<string, number>, minutes = 360, key = 'jose paradela', pos = 'RW'): MonthRow {
  return { player_key: key, player_name: key, month: `${month}-01`, matches: 4, minutes, positions: [pos, pos, pos, pos], competitions: [comp], sums }
}

const ARG = 'Argentina. Liga Profesional de Fútbol'
const MEX = 'Mexico. Liga MX'

describe('periods', () => {
  it('temporada según la liga: Argentina anual, México jul-jun', () => {
    expect(seasonLabel('2025-08-01', true)).toBe('25/26')
    expect(seasonLabel('2026-02-01', true)).toBe('25/26')
    expect(seasonLabel('2023-08-01', false)).toBe('2023')
    const p = groupPeriods([
      row('2023-10', ARG, { goles: 1 }),
      row('2024-02', MEX, { goles: 2 }),
      row('2024-08', MEX, { goles: 3 }),
      row('2024-09', 'N/C America. Leagues Cup', { goles: 1 }),
    ], 'season')
    expect(p.map(x => [x.label, x.s.goles])).toEqual([['2023', 1], ['23/24', 2], ['24/25', 4]])
  })
})

describe('metrics', () => {
  it('posiciones de Wyscout', () => {
    expect(posGroupOf('RCMF3')).toBe('MED')
    expect(posGroupOf('LAMF')).toBe('EXT')
    expect(dominantGroup(['AMF, RCMF', 'RW', 'RCMF'])).toBe('MED')
    expect(posGroupOf('AMF')).toBe('MED')
    expect(posGroupOf('LDMF')).toBe('VC')
  })
  it('regates completados por partido y formato', () => {
    const m = METRIC_BY_KEY.regates_ok_90
    expect(m.compute({ matches: 2, minutes: 180, s: { regates_ok: 7 } })).toBeCloseTo(3.5)
    expect(fmtMetric(m, 1.7)).toBe('1,7')
    expect(fmtMetric(METRIC_BY_KEY.duelos_pct, 47.6)).toBe('48%')
  })
  it('porcentaje sin intentos suficientes = sin dato', () => {
    expect(METRIC_BY_KEY.regates_pct.compute({ matches: 1, minutes: 90, s: { regates: 3, regates_ok: 3 } })).toBeNull()
  })
})

describe('playerConclusions', () => {
  const today = new Date(2026, 9, 15)
  // Temporada 24/25: 3,5 regates completados por partido; 25/26: 1,75.
  const rows: MonthRow[] = [
    ...['2024-08', '2024-09', '2024-10', '2024-11'].map(m => row(m, MEX, { regates: 25, regates_ok: 14, balones_perdidos: 40, balones_perdidos_ok: 8 })),
    ...['2025-08', '2025-09', '2025-10', '2025-11'].map(m => row(m, MEX, { regates: 20, regates_ok: 7, balones_perdidos: 40, balones_perdidos_ok: 8 })),
  ]

  it('detecta la caída de regates entre temporadas, en castellano', () => {
    const c = playerConclusions(rows, [], today)
    const reg = c.find(x => x.metricKey === 'regates_ok_90')
    expect(reg?.tone).toBe('negative')
    expect(reg?.text).toContain('Empeoró en gambetas completadas')
    expect(reg?.text).toContain('de 3,5 a 1,8 por partido')
    expect(reg?.text).toContain('casi la mitad')
    expect(reg?.text).toContain('24/25 → 25/26')
    // Sin duelos cargados: no se inventa conclusión.
    expect(c.find(x => x.metricKey === 'duelos_pct')).toBeUndefined()
  })

  it('no concluye con pocos minutos', () => {
    const few = rows.map(r => ({ ...r, minutes: 60 }))
    expect(playerConclusions(few, [], today)).toEqual([])
  })

  it('compara contra los de su posición en la agencia', () => {
    const mk = (key: string, ok: number) => ['2026-03', '2026-05', '2026-07'].map(m => row(m, MEX, { regates: 30, regates_ok: ok }, 360, key))
    const peers = [...mk('a', 20), ...mk('b', 10), ...mk('c', 5)]
    const c = playerConclusions(peers.filter(r => r.player_key === 'a'), peers, today)
    expect(c.some(x => x.kind === 'agencia' && x.text.includes('Es el extremo de la agencia con más gambetas completadas'))).toBe(true)
  })
})

describe('playerTrend', () => {
  it('índice positivo si viene mejorando', () => {
    const today = new Date(2026, 9, 15)
    const old = ['2025-06', '2025-09', '2025-12'].map(m => row(m, MEX, { regates: 20, regates_ok: 6, duelos: 40, duelos_ok: 16, balones_perdidos: 40 }))
    const recent = ['2026-06', '2026-08', '2026-09'].map(m => row(m, MEX, { regates: 20, regates_ok: 12, duelos: 40, duelos_ok: 24, balones_perdidos: 30 }))
    const t = playerTrend([...old, ...recent], today)
    expect(t?.index).toBeGreaterThan(0)
    expect(t?.best).not.toBeNull()
  })
})
