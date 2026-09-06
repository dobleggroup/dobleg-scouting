// src/features/coaches/wyscoutReport/parseWyscoutReportPdf.errorContainment.test.ts
//
// Finding I4 (revisión final del branch): el orquestador llama a 8
// sub-parsers llenos de non-null assertions sobre estructura de página
// "conocida-buena" (ver Tasks 5-13) sin ningún try/catch -- una página real
// con un formato inesperado en el futuro tira una excepción que, sin
// contención, rompe la promesa entera y pierde TODO el informe (incluidas
// las secciones que sí se pudieron parsear bien). Este test inyecta una
// página "PARTIDOS" sintética a la que le falta la fecha/resultado que
// `parseMatchHeaderAndLineup` asume presente (`dateItem!`/`scoreItem!`),
// forzando exactamente ese tipo de excepción, y verifica que el orquestador
// la contenga: `partidos` queda vacío con un warning, pero la página
// "JUGADORES" (bien formada, en otra página del mismo documento) se sigue
// procesando con normalidad -- en vez de que la excepción tire abajo todo
// `parseWyscoutReportPdf`.
//
// En un archivo separado de `parseWyscoutReportPdf.test.ts` (igual que
// `parseWyscoutReportPdf.warnings.test.ts`) porque `vi.mock` aplica a todo el
// archivo y rompería el test end-to-end contra el PDF real.
import { describe, it, expect, vi } from 'vitest'
import type { PdfTextItem } from '@/lib/pdf/extractPdfItems'
import { parseWyscoutReportPdf } from './parseWyscoutReportPdf'

const fakeItems: PdfTextItem[] = [
  // Página 1: "JUGADORES" bien formada -- un único jugador válido (numero +
  // nombre), para poder confirmar que esta sección sigue intacta pase lo que
  // pase con la página 2.
  { str: 'INFORME DEL EQUIPO', x: 123.8, y: 819.1, width: 75.2, page: 1 },
  { str: 'Un Equipo Cualquiera', x: 513.8, y: 810.9, width: 70.4, page: 1 },
  { str: 'JUGADORES', x: 123.8, y: 807.3, width: 76.2, page: 1 },
  { str: '9', x: 20, y: 700, width: 5, page: 1 },
  { str: 'J. De Prueba', x: 60, y: 700, width: 40, page: 1 },

  // Página 2: "PARTIDOS" clasifica bien (título reconocido), pero la página
  // no trae NINGÚN item en la franja de encabezado del partido (fecha,
  // resultado, competencia, nombres de equipo) que `parseMatchHeaderAndLineup`
  // asume presente con `dateItem!`/`scoreItem!` -- forzando el throw real que
  // este finding contiene.
  { str: 'INFORME DEL EQUIPO', x: 123.8, y: 819.1, width: 75.2, page: 2 },
  { str: 'Un Equipo Cualquiera', x: 513.8, y: 810.9, width: 70.4, page: 2 },
  { str: 'PARTIDOS', x: 123.8, y: 807.3, width: 76.2, page: 2 },
]

vi.mock('@/lib/pdf/extractPdfItems', () => ({
  extractPdfItems: vi.fn(async () => fakeItems),
}))

describe('parseWyscoutReportPdf contiene el error de una sección malformada', () => {
  it('no tira excepcion: la sección PARTIDOS malformada queda vacía con warning, JUGADORES sigue intacta', async () => {
    const { report, warnings } = await parseWyscoutReportPdf(new ArrayBuffer(0), {
      fileName: 'fake.pdf',
      matchCountWindow: 10,
    })

    expect(report.matches).toEqual([])
    expect(warnings.some(w => /partidos/i.test(w))).toBe(true)

    expect(report.players).toHaveLength(1)
    expect(report.players[0].name).toBe('J. De Prueba')
  })
})
