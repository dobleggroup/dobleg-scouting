import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseGpsPdf } from './parsePdf'
import { buildAliasLookup } from './mapColumns'
import { BASE_AGENCY_PLAYERS } from '@/constants/agencyPlayers'
import type { GpsMetric, GpsMetricAlias } from '../types'

function fixture(name: string): ArrayBuffer {
  const path = fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))
  const buf = readFileSync(path)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

const metrics: GpsMetric[] = [
  { id: 1, key: 'distancia_total', label: 'Distancia Total', unit: 'm', decimals: 0, category: 'locomotor', sort_order: 10, is_active: true },
  { id: 2, key: 'vel_max', label: 'Vel Máx', unit: 'km/h', decimals: 1, category: 'locomotor', sort_order: 70, is_active: true },
]
const aliases: GpsMetricAlias[] = [
  { id: 1, metric_id: 1, alias: 'distancia', source: null },
  { id: 2, metric_id: 2, alias: 'v max', source: null },
]

describe('parseGpsPdf', () => {
  it('devuelve sólo los jugadores Doble G con sus valores y el contexto', async () => {
    const result = await parseGpsPdf(fixture('estudiantes-tigre.pdf'), {
      roster: BASE_AGENCY_PLAYERS,
      lookup: buildAliasLookup(metrics, aliases),
      today: new Date('2026-07-29T12:00:00Z'),
    })

    const matched = result.players.filter(p => p.candidates.length > 0)
    expect(matched.map(p => p.rawName).sort()).toEqual(['Gonzalez G', 'Lo Celso'])

    const gonzalez = result.players.find(p => p.rawName === 'Gonzalez G')!
    expect(gonzalez.candidates).toEqual(['Gonzalo González'])
    expect(gonzalez.values[2]).toBe(10222)

    expect(result.context.rival).toBe('Tigre')
    expect(result.context.matchDate).toBe('2026-07-25')
  })

  it('conserva las filas sin match para que se puedan asignar a mano en la revisión', async () => {
    const result = await parseGpsPdf(fixture('estudiantes-tigre.pdf'), {
      roster: BASE_AGENCY_PLAYERS,
      lookup: buildAliasLookup(metrics, aliases),
    })

    const unmatched = result.players.filter(p => p.candidates.length === 0)
    expect(unmatched.length).toBeGreaterThan(0)
    expect(unmatched.every(p => p.values.length > 0)).toBe(true)
  })

  it('marca qué columnas quedaron sin mapear', async () => {
    const result = await parseGpsPdf(fixture('estudiantes-tigre.pdf'), {
      roster: BASE_AGENCY_PLAYERS,
      lookup: buildAliasLookup(metrics, aliases),
    })

    const byHeader = Object.fromEntries(result.columns.map(c => [c.header, c]))
    expect(byHeader['Distancia'].metricKey).toBe('distancia_total')
    expect(byHeader['V Max'].metricKey).toBe('vel_max')
    expect(byHeader['T'].role).toBe('minutes')
    expect(byHeader['Dist Acele'].role).toBe('unmapped')
  })

  it('tira un error claro cuando el PDF no tiene tabla reconocible', async () => {
    await expect(
      parseGpsPdf(new ArrayBuffer(8), { roster: BASE_AGENCY_PLAYERS, lookup: {} }),
    ).rejects.toThrow()
  })

  it('sin jugador elegido, tira un error claro para un reporte OpenField individual (tarjetas, no tabla)', async () => {
    await expect(
      parseGpsPdf(fixture('postigo-individual.pdf'), { roster: BASE_AGENCY_PLAYERS, lookup: {} }),
    ).rejects.toThrow('No encontré una tabla de jugadores en el PDF')
  })

  it('con el jugador elegido, lee el reporte OpenField individual por tarjetas', async () => {
    const result = await parseGpsPdf(fixture('postigo-individual.pdf'), {
      roster: BASE_AGENCY_PLAYERS,
      lookup: buildAliasLookup(metrics, aliases),
      presetPlayerName: 'Joaquin Postigo',
    })

    expect(result.players).toHaveLength(1)
    expect(result.players[0].rawName).toBe('Joaquin Postigo')
    expect(result.players[0].candidates).toEqual(['Joaquin Postigo'])

    const idx = result.columns.findIndex(c => c.header === 'DISTANCIA TOTAL')
    expect(result.players[0].values[idx]).toBe(10829.9)
  })

  it('lee un Reporte de Sesión de Catapult (tabla multi-jugador sin columna de nombre en la cabecera)', async () => {
    const result = await parseGpsPdf(fixture('reporte-sesion-instituto.pdf'), {
      roster: BASE_AGENCY_PLAYERS,
      lookup: buildAliasLookup(metrics, aliases),
    })

    const matched = result.players.filter(p => p.candidates.length > 0)
    expect(matched.map(p => p.rawName)).toEqual(['FRANCO WATSON'])
    expect(matched[0].candidates).toEqual(['Franco Watson'])
    // El nombre del rival y la fecha vienen en la misma celda ("FECHA 3 VS INSTITUTO
    // CBA (L)" + "02/08/2026" pegados): igual que con el resto de los reportes donde
    // el contexto viene "enredado", no se inventa un rival prolijo, el usuario lo
    // corrige a mano en la revisión. La fecha sí se puede ubicar sin ambigüedad.
    expect(result.context.matchDate).toBe('2026-08-02')
  })

  it('con el jugador elegido, lee un reporte Power BI/Catapult de un partido', async () => {
    const result = await parseGpsPdf(fixture('powerbi-steimbach.pdf'), {
      roster: BASE_AGENCY_PLAYERS,
      lookup: buildAliasLookup(metrics, aliases),
      presetPlayerName: 'Alexis Steimbach',
    })

    expect(result.players).toHaveLength(1)
    expect(result.players[0].rawName).toBe('Alexis Steimbach')
    expect(result.context.rival).toBe('River Plate')

    const idx = result.columns.findIndex(c => c.header === 'Distancia total (m) (PT)')
    expect(result.players[0].values[idx]).toBe(5334)
  })
  it('avisa que el informe viene cortado cuando OpenField dejó filas afuera ("23 row(s) missing")', async () => {
    for (const presetPlayerName of [undefined, 'Federico Paradela']) {
      await expect(
        parseGpsPdf(fixture('openfield-cortado-atlanta.pdf'), { roster: BASE_AGENCY_PLAYERS, lookup: {}, presetPlayerName }),
      ).rejects.toThrow('faltan 23 filas')
    }
  })
})
