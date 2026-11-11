import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { extractPdfItems } from '@/lib/pdf/extractPdfItems'
import { groupRows } from './buildTable'
import { readSeriesReport } from './parseSeriesReport'
import { parseGpsPdf } from './parsePdf'
import { buildAliasLookup } from './mapColumns'
import { competitionName } from '../fixtureLookup'
import { withDerivedMetrics } from '@/services/gpsService'
import { BASE_AGENCY_PLAYERS } from '@/constants/agencyPlayers'
import type { GpsMetric, GpsMetricAlias } from '../types'

function fixture(name: string): ArrayBuffer {
  const buf = readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

const metric = (id: number, key: string): GpsMetric =>
  ({ id, key, label: key, unit: '', decimals: 0, category: 'locomotor', sort_order: id, is_active: true })
const metrics = [metric(1, 'distancia_total'), metric(2, 'acc_over_2'), metric(3, 'dec_over_2'), metric(4, 'dist_21_24'), metric(5, 'dist_over_24'), metric(6, 'vel_max'), metric(7, 'sprints')]
const aliases: GpsMetricAlias[] = [
  ['distancia (m)', 1], ['acc (count)', 2], ['des (count)', 3], ['19,8 - 25,2 km/h (m)', 4], ['>25,2 km/h (m)', 5], ['vel max (km/h)', 6], ['sprint count', 7],
].map(([alias, metric_id], id) => ({ id, metric_id: metric_id as number, alias: alias as string, source: null }))

describe('informe individual de temporada (Universidad Católica)', () => {
  it('lee cada gráfico partido por partido', async () => {
    const report = readSeriesReport(groupRows(await extractPdfItems(fixture('uc-individual-diaz.pdf'), {})))!
    expect(report.matches).toHaveLength(25)
    expect(report.matches[0]).toMatchObject({ label: 'HUA 2 vs 4 uc', rivalCode: 'HUA', resultado: '4-2', home: false })
    expect(report.matches[24]).toMatchObject({ rivalCode: 'U', resultado: '1-0', home: true })
    const s = Object.fromEntries(report.series.map(x => [x.name, x.values]))
    expect(s['DISTANCIA (m)'].slice(0, 3)).toEqual([1937, 9396, 10452])
    expect(s['ACC (count)'][10]).toBe(51)
    expect(s['DES (count)'][10]).toBe(79)
    expect(s['Dist. >25,2km/h'][24]).toBe(120)
    expect(s['VEL MAX (KM/H)'][10]).toBe(33.6)
    expect(s['Sprint count'].slice(3, 6)).toEqual([7, 5, 10])
  })

  it('carga el último partido con rival y resultado, sin elegir jugador antes', async () => {
    const result = await parseGpsPdf(fixture('uc-individual-diaz.pdf'), { roster: BASE_AGENCY_PLAYERS, lookup: buildAliasLookup(metrics, aliases) })
    expect(result.players).toHaveLength(1)
    expect(result.players[0].candidates).toEqual(['Juan Ignacio Díaz'])
    const byKey = Object.fromEntries(result.columns.filter(c => c.metricKey).map(c => [c.metricKey, result.players[0].values[c.index]]))
    expect(byKey).toEqual({ distancia_total: 10174, acc_over_2: 77, dec_over_2: 68, dist_21_24: 349, dist_over_24: 120, vel_max: 32.8, sprints: 7 })
    expect(result.context.rival).toBe('Universidad de Chile')
    expect(result.context.resultado).toBe('1-0')
  })
})

describe('datos del partido', () => {
  it('nombra la competencia como en la carga de GPS', () => {
    expect(competitionName({ name: 'Primera Division', country: 'Chile' })).toBe('Primera División Chile')
    expect(competitionName({ name: 'Copa Libertadores', country: 'World' })).toBe('Copa Libertadores')
  })

  it('deduce HSR y metros por minuto sin pisar lo que trae el informe', () => {
    expect(withDerivedMetrics({ distancia_total: 9000, dist_21_24: 300, dist_over_24: 100 }, 90))
      .toEqual({ distancia_total: 9000, dist_21_24: 300, dist_over_24: 100, hsr: 400, metros_por_min: 100 })
    expect(withDerivedMetrics({ hsr: 999, dist_21_24: 1, dist_over_24: 1 }, null)).toEqual({ hsr: 999, dist_21_24: 1, dist_over_24: 1 })
  })
})
