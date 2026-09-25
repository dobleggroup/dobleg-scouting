import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'
import { parseWyscoutSquadRows } from './parseWyscoutSquadXlsx'
import { buildTeamSummaryPdf, teamSummaryFileName, type TeamSummaryPdfInput } from './exportTeamSummaryPdf'
import { ALL_WIDGETS } from './widgetDefs'
import type { AgencyFixture } from '@/types/footballApi'
import type { StandingRow } from '@/services/footballApiService'
import type { EnrichedMatchRow } from '@/features/coaches/components/CoachMatchMetricsEvolution'
import type { WyscoutReportData } from '@/features/coaches/wyscoutReport/wyscoutReportTypes'

// PDF_REAL=<json con { matchRows, report }> usa datos reales (revision visual a mano).
const real = process.env.PDF_REAL ? JSON.parse(readFileSync(process.env.PDF_REAL, 'utf-8')) as { matchRows: EnrichedMatchRow[]; report: WyscoutReportData } : null

function matchRows(): EnrichedMatchRow[] {
  if (real) return real.matchRows
  return Array.from({ length: 6 }, (_, i) => ({
    fixtureId: 100 + i, date: `2026-0${3 + i}-10T18:00:00Z`, opponent: `Rival ${i + 1}`, opponentLogo: '', isHome: i % 2 === 0,
    scoreLabel: '1 - 0', result: (['G', 'E', 'P'] as const)[i % 3],
    stats: {
      id: i, coach_key: 'domingo', fixture_id: 100 + i, possession_pct: 45 + i, xg_for: 1 + i / 10, xg_against: 1.2 - i / 10,
      raw_metrics: { 'tiros_/_a_la_porteria_2': 3 + i, 'tiros_en_contra_/_a_la_porteria_2': 2, 'duelos_/_ganados_3': 48 + i, 'duelos_aereos_/_ganados_3': 50 },
      source_file: null, created_at: '', updated_at: '',
    },
  }))
}

function report(): WyscoutReportData | null {
  if (real) return real.report
  return {
    matches: [], players: [], eventMaps: [], setPieces: [], sourceFileName: 'x.pdf', matchCountWindow: 10,
    formations: [{ scheme: '4-2-3-1', usagePct: 60, teamStats: [], averagePositions: [{ x: 50, y: 100, label: 'Mastrolía' }, { x: 20, y: 60, label: 'Souto' }] }],
    zoneGrids: [{ category: 'recuperaciones', cells: Array.from({ length: 9 }, (_, i) => ({ row: Math.floor(i / 3), col: i % 3, pct: 5 + i * 2, reference: null })) }],
  } as unknown as WyscoutReportData
}

function squad() {
  const buf = readFileSync(fileURLToPath(new URL('./__fixtures__/temperley-2026-09-25.xlsx', import.meta.url)))
  const wb = XLSX.read(buf, { type: 'buffer' })
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
  const r = parseWyscoutSquadRows(rows, 'x.xlsx', 'Temperley')
  if (!r.ok) throw new Error(r.error)
  return r.data
}

function fixture(id: number, date: string, rival: string, home: boolean, gh: number | null, ga: number | null): AgencyFixture {
  const me = { id: 454, name: 'Temperley', logo: '' }
  const other = { id: id + 1000, name: rival, logo: '' }
  return {
    fixtureId: id, date, timestamp: Date.parse(date) / 1000, venue: 'Estadio Alfredo Beranger', city: '', status: '',
    statusShort: gh === null ? 'NS' : 'FT', elapsed: null, leagueName: 'Primera Nacional', leagueLogo: '', leagueCountry: '', leagueFlag: null,
    round: 'Fecha 30', homeTeam: home ? me : other, awayTeam: home ? other : me, goalsHome: gh, goalsAway: ga, isHome: home, players: [],
  }
}

function standings(): StandingRow[] {
  return Array.from({ length: 18 }, (_, i) => ({
    rank: i + 1, teamId: i === 4 ? 454 : 900 + i, teamName: i === 4 ? 'Temperley' : `Equipo con nombre largo ${i + 1}`, teamLogo: '',
    points: 60 - i * 2, goalsDiff: 20 - i * 2, form: 'WDLWW', played: 31, win: 15 - i, draw: 8, lose: 8 + i,
    goalsFor: 40 - i, goalsAgainst: 20 + i, group: 'Group 1',
  }))
}

function input(widgetIds: string[]): TeamSummaryPdfInput {
  return {
    coachName: 'Nicolás Domingo', club: 'Temperley', season: 2026, leagueName: 'Primera Nacional', today: '2026-09-25',
    dataDate: '2026-09-25T13:00:00Z', minMinutes: 450, teamId: 454, standings: standings(),
    next: fixture(1, '2026-09-27T18:00:00Z', 'Atlético de Rafaela', true, null, null),
    last: [
      fixture(2, '2026-09-19T18:00:00Z', 'Almagro', true, 3, 1),
      fixture(3, '2026-09-13T18:00:00Z', 'Patronato', false, 0, 0),
      fixture(4, '2026-09-06T18:00:00Z', 'Colegiales', true, 3, 1),
      fixture(5, '2026-08-30T18:00:00Z', 'Quilmes', false, 0, 1),
      fixture(6, '2026-08-23T18:00:00Z', 'Midland', true, 1, 2),
    ],
    upcoming: [fixture(1, '2026-09-27T18:00:00Z', 'Atlético de Rafaela', true, null, null)],
    seasonStats: { played: 31, won: 12, drawn: 11, lost: 8, points: 47, possiblePoints: 93, goalsFor: 38, goalsAgainst: 30, avgPossession: 51.2, avgXgFor: 1.21, avgXgAgainst: 1.02 },
    squad: squad(), teamMatches: 30, widgetIds, matchRows: matchRows(), wyscoutReport: report(), homegrown: null,
  }
}

describe('buildTeamSummaryPdf', () => {
  it('arma el PDF completo sin errores', async () => {
    const pdf = await buildTeamSummaryPdf(input(ALL_WIDGETS.map(w => w.id)))
    const pages = pdf.getNumberOfPages()
    expect(pages).toBeGreaterThan(2)
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, Buffer.from(pdf.output('arraybuffer')))
  })

  it('sin partidos cargados ni informe no dibuja los graficos del equipo', async () => {
    const pdf = await buildTeamSummaryPdf({ ...input(['vsRival', 'evolucion', 'historial', 'formaciones', 'zonas']), matchRows: [], wyscoutReport: null })
    expect(pdf.getNumberOfPages()).toBe(1)
  })

  it('con pocos widgets entra en una hoja', async () => {
    const pdf = await buildTeamSummaryPdf(input(['goleadores', 'asistidores']))
    expect(pdf.getNumberOfPages()).toBe(1)
  })

  it('sin archivo de Wyscout no rompe', async () => {
    const pdf = await buildTeamSummaryPdf({ ...input(ALL_WIDGETS.map(w => w.id)), squad: null })
    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(1)
  })

  it('nombre de archivo sin acentos', () => {
    expect(teamSummaryFileName('Temperley', 2026, '2026-09-25')).toBe('resumen_temperley-2026_2026-09-25.pdf')
  })
})
