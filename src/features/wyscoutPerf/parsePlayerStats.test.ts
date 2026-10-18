import { describe, it, expect } from 'vitest'
import { parsePlayerStatsMatrix, playerFromFileName, statKey } from './parsePlayerStats'

const HEADERS = ['Partido', 'Competition', 'Date', 'Posición específica', 'Minutos jugados',
  'Goles', 'Pases / logrados', '', 'Regates / logrados', '', 'Duelos aéreos / ganados', '',
  'Pases hacia el área de penalti/precisos', '', 'xG']

describe('parsePlayerStatsMatrix', () => {
  it('lee pares intentos/logrados y columnas simples', () => {
    const res = parsePlayerStatsMatrix([
      HEADERS,
      ['Unión Santa Fe - Tigre 1:0', 'Argentina. Liga Profesional de Fútbol', '2023-11-25', 'RCMF, RW', 98, 0, 47, 39, 5, 4, 1, 0, 2, 1, 0.13],
    ], 'Player stats J. Paradela (5).xlsx')
    expect(res.fileNamePlayer).toBe('J. Paradela')
    expect(res.matches).toHaveLength(1)
    const m = res.matches[0]
    expect(m).toMatchObject({ date: '2023-11-25', minutes: 98, position: 'RCMF, RW' })
    expect(m.stats).toMatchObject({ goles: 0, pases: 47, pases_ok: 39, regates: 5, regates_ok: 4, duelos_aereos: 1, duelos_aereos_ok: 0, xg: 0.13 })
    expect(m.stats.pases_hacia_el_area_de_penalti_ok).toBe(1)
    expect(res.labels.regates_ok).toBe('Regates logrados')
  })

  it('ordena por fecha, saltea filas vacías y acepta fechas Date', () => {
    const res = parsePlayerStatsMatrix([
      HEADERS,
      ['B - C 1:1', 'X', new Date(2024, 4, 6), 'AMF', 90, 1, 10, 8, 0, 0, 0, 0, 0, 0, 0],
      ['', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['A - B 0:0', 'X', '2024-01-28', 'AMF', 45, 0, 5, 4, 0, 0, 0, 0, 0, 0, 0],
    ])
    expect(res.matches.map(m => m.date)).toEqual(['2024-01-28', '2024-05-06'])
  })

  it('un partido repetido (Liga y Copa, como Tigre - Vélez de J. López) queda una sola vez', () => {
    const res = parsePlayerStatsMatrix([
      HEADERS,
      ['Tigre - Vélez Sarsfield 3:0', 'Argentina. Liga Profesional de Fútbol', '2025-01-23', 'LCMF', 75, 0, 24, 16, 0, 0, 0, 0, 0, 0, 0.13],
      ['Tigre - Vélez Sarsfield 3:0', 'Argentina. Copa de la Liga Profesional', '2025-01-23', 'LDMF', 74, 0, 24, 15, 0, 0, 0, 0, 0, 0, 0],
      ['A - B 0:0', 'X', '2025-01-30', 'AMF', 90, 0, 5, 4, 0, 0, 0, 0, 0, 0, 0],
    ])
    expect(res.matches).toHaveLength(2)
    expect(res.matches[0]).toMatchObject({ minutes: 75, position: 'LCMF' })
    expect(res.duplicates).toEqual([{ date: '2025-01-23', label: 'Tigre - Vélez Sarsfield 3:0' }])
  })

  it('rechaza archivos que no son de Wyscout', () => {
    expect(() => parsePlayerStatsMatrix([['Nombre', 'Club']])).toThrow(/Wyscout/)
  })
})

describe('helpers', () => {
  it('statKey toma la parte antes de la barra, sin acentos', () => {
    expect(statKey('Pases en el último tercio / logrados')).toBe('pases_en_el_ultimo_tercio')
    expect(statKey('Duelos aéreos / ganados')).toBe('duelos_aereos')
  })
  it('playerFromFileName', () => {
    expect(playerFromFileName('Player stats G. Prestianni.xlsx')).toBe('G. Prestianni')
    expect(playerFromFileName('otro.xlsx')).toBe('otro')
  })
})
