import { describe, it, expect } from 'vitest'
import { dedupItems } from './dedupItems'
import type { PdfTextItem } from '@/lib/pdf/extractPdfItems'

describe('dedupItems', () => {
  it('elimina duplicados de texto casi en la misma posicion (efecto de trazo)', () => {
    const items: PdfTextItem[] = [
      { str: '9.8%', x: 57.5, y: 695.3, width: 27.4, page: 20 },
      { str: '9.8%', x: 56.8, y: 696.1, width: 27.4, page: 20 },
      { str: '14%', x: 140.3, y: 695.3, width: 23.9, page: 20 },
    ]
    const result = dedupItems(items)
    expect(result).toHaveLength(2)
    expect(result.map(r => r.str).sort()).toEqual(['14%', '9.8%'])
  })

  it('no elimina el mismo texto en posiciones realmente distintas', () => {
    const items: PdfTextItem[] = [
      { str: '4', x: 10, y: 10, width: 2, page: 1 },
      { str: '4', x: 200, y: 300, width: 2, page: 1 },
    ]
    expect(dedupItems(items)).toHaveLength(2)
  })
})
