// src/features/coaches/wyscoutReport/parseWyscoutReportPdf.warnings.test.ts
//
// Verifica que una página no reconocida se reporte en `warnings`, nunca se
// pierda en silencio (contrato del plan). El fixture real ya no tiene ninguna
// página sin clasificar (ver Task 15: FINALIZACIÓN/PELIGRO CONSTANTE), así
// que acá se mockea `extractPdfItems` para inyectar un caso sintético -- en un
// archivo separado de `parseWyscoutReportPdf.test.ts` porque `vi.mock` aplica
// a todo el archivo y rompería el test end-to-end contra el PDF real.
import { describe, it, expect, vi } from 'vitest'
import type { PdfTextItem } from '@/lib/pdf/extractPdfItems'
import { parseWyscoutReportPdf } from './parseWyscoutReportPdf'

const fakeHeaderItems: PdfTextItem[] = [
  { str: 'INFORME DEL EQUIPO', x: 123.8, y: 819.1, width: 75.2, page: 1 },
  { str: 'Un Equipo Cualquiera', x: 513.8, y: 810.9, width: 70.4, page: 1 },
  { str: 'JUGADORES', x: 123.8, y: 807.3, width: 76.2, page: 1 },
  { str: 'INFORME DEL EQUIPO', x: 123.8, y: 819.1, width: 75.2, page: 2 },
  { str: 'Un Equipo Cualquiera', x: 513.8, y: 810.9, width: 70.4, page: 2 },
  { str: 'SECCIÓN INVENTADA', x: 123.8, y: 807.3, width: 90, page: 2 },
]

vi.mock('@/lib/pdf/extractPdfItems', () => ({
  extractPdfItems: vi.fn(async () => fakeHeaderItems),
}))

describe('parseWyscoutReportPdf con una página sintética no reconocida', () => {
  it('reporta la página no reconocida en warnings en vez de descartarla en silencio', async () => {
    const { warnings } = await parseWyscoutReportPdf(new ArrayBuffer(0), {
      fileName: 'fake.pdf',
      matchCountWindow: 10,
    })

    expect(warnings.some(w => /p[aá]gina 2/i.test(w) && /no reconocida/i.test(w))).toBe(true)
  })
})
