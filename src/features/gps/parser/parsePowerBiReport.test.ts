import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { extractPdfItems } from '@/lib/pdf/extractPdfItems'
import { groupRows } from './buildTable'
import { parsePowerBiReport } from './parsePowerBiReport'

function fixture(name: string): ArrayBuffer {
  const path = fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))
  const buf = readFileSync(path)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

describe('parsePowerBiReport', () => {
  it('lee el detalle de Primer/Segundo Tiempo del reporte de Steimbach vs River', async () => {
    const items = await extractPdfItems(fixture('powerbi-steimbach.pdf'))
    const rows = groupRows(items)
    const table = parsePowerBiReport(rows, 'Alexis Steimbach')

    expect(table).not.toBeNull()
    const row = table!.rows[0]
    expect(row.name).toBe('Alexis Steimbach')

    const byHeader = Object.fromEntries(table!.headers.map((h, i) => [h, row.values[i]]))
    expect(byHeader['Distancia total (m) (PT)']).toBe(5334)
    expect(byHeader['Distancia total (m) (ST)']).toBe(5432)
    expect(byHeader['Mts/min (PT)']).toBe(111.5)
    expect(byHeader['Mts/min (ST)']).toBe(107.2)
    expect(byHeader['Velocidad Max. (km/h) (PT)']).toBe(30.6)
    expect(byHeader['Velocidad Max. (km/h) (ST)']).toBe(28.9)
    expect(byHeader['Dist > 21 Km/h (PT)']).toBe(432)
    expect(byHeader['Dist > 21 Km/h (ST)']).toBe(306)
    expect(byHeader['Minutos jugados (PT)']).toBe(48)
    expect(byHeader['Minutos jugados']).toBe(99)
    expect(byHeader['Minutos jugados (ST)']).toBe(51)

    // Los gráficos de barras (Cargas Locomotivas / Mecánicas) quedan fuera.
    expect(table!.headers.some(h => h.includes('Dist 16-21'))).toBe(false)
    expect(table!.headers.some(h => h.includes('Acc > 2m/s'))).toBe(false)

    expect(table!.preambleLines.join(' | ')).toContain('Rival: River Plate')
  })

  it('devuelve null si el PDF no tiene la página de Primer/Segundo Tiempo', async () => {
    const items = await extractPdfItems(fixture('estudiantes-tigre.pdf'))
    const rows = groupRows(items)
    expect(parsePowerBiReport(rows, 'Alexis Steimbach')).toBeNull()
  })
})
