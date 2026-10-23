import { describe, it, expect } from 'vitest'
import type { MonthRow } from './periods'
import { splitByPlayer } from './analysis'
import { diagnose, formText, positionBoard } from './diagnosis'

const today = new Date(2026, 9, 15)

function row(month: string, sums: Record<string, number>, key = 'a', minutes = 360): MonthRow {
  return { player_key: key, player_name: key, month: `${month}-01`, matches: 4, minutes, positions: ['RW', 'RW', 'RW', 'RW'], competitions: ['Mexico. Liga MX'], sums }
}

const OLD = ['2025-05', '2025-07', '2025-09', '2025-11', '2026-01', '2026-03']
const NEW = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']
const base = { regates: 40, regates_ok: 16, duelos: 60, duelos_ok: 27, duelos_ofensivos: 40, duelos_ofensivos_ok: 14, asistencias_a_tiro: 4, xa: 0.4, tiros: 6, goles: 1, xg: 0.8 }

describe('diagnose', () => {
  it('"viene mejorando" sólo si mejoró en varias métricas, y dice en cuáles', () => {
    const better = { ...base, regates_ok: 26, duelos_ok: 36, asistencias_a_tiro: 9, tiros: 12 }
    const rows = [...OLD.map(m => row(m, base)), ...NEW.map(m => row(m, better))]
    const d = diagnose(rows, splitByPlayer(rows), undefined, today)!
    expect(d.form?.state).toBe('up')
    expect(d.form!.better.length).toBeGreaterThanOrEqual(3)
    expect(formText(d.form!)).toMatch(/^Está mejor que el año anterior en: /)
  })

  it('una sola métrica que baja no alcanza para "viene bajando"', () => {
    const one = { ...base, duelos_ofensivos_ok: 8 }
    const rows = [...OLD.map(m => row(m, base)), ...NEW.map(m => row(m, one))]
    const d = diagnose(rows, splitByPlayer(rows), undefined, today)!
    // Duelos ofensivos ganados mueve dos métricas: por partido y %.
    expect(d.form!.worse.map(i => i.metric.key).sort()).toEqual(['duelos_of_ok_90', 'duelos_of_pct'])
    expect(d.form!.state).toBe('even')
    expect(d.tone).not.toBe('bad')
  })

  it('en la tabla por posición cada jugador aparece de un solo lado', () => {
    const rows = ['a', 'b', 'c', 'd'].flatMap((k, i) => [...OLD, ...NEW].map(m => row(m, { ...base, regates_ok: 10 + i * 6, tiros: 3 + i * 3, asistencias_a_tiro: 2 + i * 3, duelos_ok: 20 + i * 6 }, k)))
    const by = splitByPlayer(rows)
    const diags = [...by.values()].map(rs => diagnose(rs, by, undefined, today)!)
    for (const r of positionBoard(diags)) {
      const good = new Set(r.good.map(x => x.key))
      expect(r.bad.some(x => good.has(x.key))).toBe(false)
    }
  })
})
