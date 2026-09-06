import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { extractPdfItems } from '@/lib/pdf/extractPdfItems'
import { parseMatchHeaderAndLineup, parseMatchStints, minutesPlayedInMatch, parseMatchesSection } from './parseMatchesSection'
import { parsePlayersSection } from './parsePlayersSection'

function fixture(name: string): ArrayBuffer {
  const path = fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))
  const buf = readFileSync(path)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

const KNOWN_ROSTER_NAMES = new Set([
  'E. Mastrolía', 'L. Monti', 'O. Pacheco', 'V. Aguiñagalde', 'L. Angelini',
  'L. Richarte', 'G. Tomasetti', 'F. Benítez', 'L. Nieto', 'P. Souto',
  'M. Echeverría', 'F. Brandán', 'A. Melo', 'F. Krüger', 'Nicolás Ávalos',
])

describe('parseMatchHeaderAndLineup contra el fixture real (pagina 6)', () => {
  it('arma el encabezado del partido y detecta cual columna es el propio equipo', async () => {
    const items = await extractPdfItems(fixture('temperley-informe-equipo.pdf'))
    const { header, lineup } = parseMatchHeaderAndLineup(items.filter(i => i.page === 6), KNOWN_ROSTER_NAMES)

    expect(header.rival).toBe('Quilmes')
    expect(header.isHome).toBe(false)
    expect(header.score).toBe('0 – 1')
    expect(header.date).toBe('2026-08-31')
    expect(header.competition).toBe('Primera Nacional')

    expect(lineup).toHaveLength(11)
    const mastrolia = lineup.find(p => p.name === 'E. Mastrolía')!
    expect(mastrolia.number).toBe(1)
    expect(mastrolia.positionCode).toBe('GK')
    expect(mastrolia.isStarter).toBe(true)
    expect(lineup.some(p => p.name === 'E. Glellel')).toBe(false) // es del rival, no entra
  })
})

describe('parseMatchStints contra el fixture real (pagina 6)', () => {
  it('arma los 4 tramos de formacion con sus rangos de minuto y jugadores en cancha', async () => {
    const items = await extractPdfItems(fixture('temperley-informe-equipo.pdf'))
    const stints = parseMatchStints(items.filter(i => i.page === 6))

    expect(stints).toHaveLength(4)
    expect(stints[0]).toMatchObject({ formation: '4-2-3-1', fromMinute: 1, toMinute: 63 })
    expect(stints[1]).toMatchObject({ formation: '4-2-3-1', fromMinute: 63, toMinute: 74 })
    expect(stints[2]).toMatchObject({ formation: '4-2-3-1', fromMinute: 74, toMinute: 87 })
    // "87' — 90+6'": el descuento (+6) suma como minutos enteros -> 90 + 6 = 96,
    // no 90.6 (el placeholder del brief, que era un bug a corregir, no a preservar).
    expect(stints[3]).toMatchObject({ formation: '4-3-3', fromMinute: 87, toMinute: 96 })

    expect(stints[0].players.some(p => p.label === 'Echeverría')).toBe(true)
    expect(stints[3].players.some(p => p.label === 'Krüger')).toBe(true)
    expect(stints[3].players.some(p => p.label === 'Echeverría')).toBe(false) // salio en el tramo anterior

    // Los puntos de cancha deben venir normalizados a 0-100 (no coordenadas
    // crudas del PDF), igual que `parseAveragePositions` en parseFormationsSection.ts.
    for (const stint of stints) {
      for (const p of stint.players) {
        expect(p.x).toBeGreaterThanOrEqual(0)
        expect(p.x).toBeLessThanOrEqual(100)
        expect(p.y).toBeGreaterThanOrEqual(0)
        expect(p.y).toBeLessThanOrEqual(100)
      }
    }
  })

  it('minutesPlayedInMatch suma los tramos donde aparece el jugador', () => {
    const stints = [
      { formation: '4-2-3-1', fromMinute: 1, toMinute: 63, players: [{ x: 0, y: 0, label: 'Echeverría' }] },
      { formation: '4-2-3-1', fromMinute: 63, toMinute: 74, players: [{ x: 0, y: 0, label: 'Krüger' }] },
    ]
    expect(minutesPlayedInMatch(stints, 'Echeverría')).toBe(62)
    expect(minutesPlayedInMatch(stints, 'Krüger')).toBe(11)
    expect(minutesPlayedInMatch(stints, 'Nadie')).toBe(0)
  })
})

describe('parseMatchesSection contra las 10 paginas de partidos del fixture', () => {
  it('arma los 10 partidos con fecha, rival y minutos jugados verificables', async () => {
    const items = await extractPdfItems(fixture('temperley-informe-equipo.pdf'))
    const roster = new Set(parsePlayersSection(items.filter(i => i.page === 2)).map(p => p.name))
    const pages = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(p => items.filter(i => i.page === p))
    const matches = parseMatchesSection(pages, roster)

    expect(matches).toHaveLength(10)
    expect(matches[0]).toMatchObject({ date: '2026-08-31', rival: 'Quilmes', isHome: false })
    expect(matches[9]).toMatchObject({ date: '2026-06-20', rival: 'San Martín Tucumán', isHome: true })

    // Echeverria en el partido vs Quilmes: 46'(sube) hasta 74' = 28 minutos.
    const vsQuilmes = matches[0]
    expect(minutesPlayedInMatch(vsQuilmes.stints, 'Echeverría')).toBeGreaterThan(0)
  })
})
