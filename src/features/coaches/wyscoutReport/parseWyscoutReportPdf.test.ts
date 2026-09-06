// src/features/coaches/wyscoutReport/parseWyscoutReportPdf.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseWyscoutReportPdf } from './parseWyscoutReportPdf'

function fixture(name: string): ArrayBuffer {
  const path = fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))
  const buf = readFileSync(path)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

describe('parseWyscoutReportPdf de punta a punta contra el fixture real', () => {
  it('arma el WyscoutReportData completo sin tirar ninguna excepcion', async () => {
    const { report, warnings } = await parseWyscoutReportPdf(fixture('temperley-informe-equipo.pdf'), {
      fileName: 'temperley-informe-equipo.pdf',
      matchCountWindow: 10,
    })

    expect(report.players.length).toBeGreaterThan(15)
    expect(report.formations.length).toBeGreaterThanOrEqual(2)
    expect(report.matches).toHaveLength(10)
    expect(report.eventMaps.length).toBeGreaterThan(0)
    expect(report.zoneGrids).toHaveLength(3)
    expect(report.setPieces.length).toBeGreaterThan(0)

    // Páginas 19 (FINALIZACIÓN) y 21 (PELIGRO CONSTANTE) ahora se reconocen
    // (ver Task 15 / classifySectionLabel) y por lo tanto no deberían generar
    // ningún warning de "sección no reconocida" -- a diferencia de GLOSARIO,
    // que sigue sin tener parser dedicado y por diseño no genera warning
    // tampoco (no está en la lista de "desconocida").
    expect(warnings.some(w => /p[aá]gina 19/i.test(w))).toBe(false)
    expect(warnings.some(w => /p[aá]gina 21/i.test(w))).toBe(false)
    expect(warnings.some(w => /no reconocida/i.test(w))).toBe(false)

    // Finding I3 (revisión final): antes de este fix, todos los sub-gráficos
    // de una misma sección de página compartían un único `category` (p.ej.
    // los 3 sub-gráficos de la página 16 quedaban todos bajo
    // 'duelos_defensivos'), aunque cada uno esté normalizado a su PROPIA
    // cancha 0-100 de forma independiente -- la UI los mezclaba en un solo
    // selector, superponiendo espacios de coordenadas no relacionados. Ahora
    // cada sub-gráfico real tiene su propio category (derivado del título
    // real del sub-gráfico cuando se puede, ver `deriveEventMapCategories`),
    // así que la cantidad de categorías distintas debe ser mayor que la
    // cantidad de secciones que aportan mapas (3: fase_defensiva/ataque
    // tienen 3 sub-gráficos reales cada una, ver páginas 16/18).
    const distinctCategories = new Set(report.eventMaps.map(m => m.category))
    expect(distinctCategories.size).toBeGreaterThan(2)
    expect(distinctCategories.has('duelos_defensivos')).toBe(false)
    expect(distinctCategories.has('ataque')).toBe(false)
  })
})
