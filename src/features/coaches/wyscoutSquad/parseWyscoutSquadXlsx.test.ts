import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'
import { parseWyscoutSquadRows } from './parseWyscoutSquadXlsx'

function fixtureRows(): unknown[][] {
  const buf = readFileSync(fileURLToPath(new URL('./__fixtures__/temperley-2026-09-25.xlsx', import.meta.url)))
  const wb = XLSX.read(buf, { type: 'buffer' })
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
}

const HEAD = ['Jugador', 'Equipo', 'Posición específica', 'Edad', 'Partidos jugados', 'Minutos jugados', 'Goles', 'Asistencias', 'Duelos/90', 'Duelos ganados, %']

describe('parseWyscoutSquadRows', () => {
  it('lee el archivo real de Temperley', () => {
    const r = parseWyscoutSquadRows(fixtureRows(), 'x.xlsx', 'Temperley')
    if (!r.ok) throw new Error(r.error)
    expect(r.data.team).toBe('Temperley')
    expect(r.data.players).toHaveLength(29)
    const souto = r.data.players[0]
    expect(souto.name).toBe('P. Souto')
    expect(souto.stats.goals).toBe(7)
    expect(souto.stats.matches).toBe(19)
    expect(souto.stats.minutes).toBe(1399)
    expect(souto.stats.duels_won_pct).toBeCloseTo(40.65)
    expect(souto.stats.prog_passes_acc_pct).toBeCloseTo(67.86)
    expect(souto.positions).toEqual(['LAMF', 'LW', 'LB'])
    expect(souto.foot).toBe('izquierdo')
    expect(souto.heightCm).toBe(178)
    const brandan = r.data.players.find(p => p.name === 'F. Brandán')!
    expect(brandan.passports).toEqual(['Argentina', 'Romania'])
    expect(r.data.columnsFound.length).toBeGreaterThanOrEqual(55)
    expect(r.data.sourceFileName).toBe('x.xlsx')
  })

  it('coma decimal y celdas vacias', () => {
    const rows = [HEAD, ['A. Uno', 'Temperley', 'CF', 20, 3, 200, '-', '', '1,5', '']]
    const r = parseWyscoutSquadRows(rows, 'f.xlsx', 'Temperley')
    if (!r.ok) throw new Error(r.error)
    const s = r.data.players[0].stats
    expect(s.duels_p90).toBe(1.5)
    expect(s.goals).toBeNull()
    expect(s.assists).toBeNull()
    expect(s.duels_won_pct).toBeNull()
  })

  it('falta una columna obligatoria', () => {
    const rows = [HEAD.filter(h => h !== 'Goles'), ['A. Uno', 'Temperley', 'CF', 20, 3, 200, 0, 1, 1]]
    const r = parseWyscoutSquadRows(rows, 'f.xlsx', 'Temperley')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('"Goles"')
  })

  it('archivo de otro equipo', () => {
    const rows = [HEAD, ['A. Uno', 'Quilmes', 'CF', 20, 3, 200, 1, 0, 1, 50]]
    const r = parseWyscoutSquadRows(rows, 'f.xlsx', 'Temperley')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toContain('Quilmes')
      expect(r.error).toContain('Temperley')
    }
  })

  it('sin jugadores', () => {
    const r = parseWyscoutSquadRows([HEAD], 'f.xlsx', 'Temperley')
    expect(r.ok).toBe(false)
  })

  it('acepta el equipo sin importar acentos ni mayusculas', () => {
    const rows = [HEAD, ['A. Uno', 'CA Temperley', 'CF', 20, 3, 200, 1, 0, 1, 50]]
    expect(parseWyscoutSquadRows(rows, 'f.xlsx', 'Temperley').ok).toBe(true)
  })
})
