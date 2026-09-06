import type { PdfTextItem } from '@/lib/pdf/extractPdfItems'

const DEDUP_TOLERANCE = 2

/** Wyscout dibuja algunos textos en negrita 2 veces con ~1pt de offset (efecto de
 *  trazo). Sin esto, cualquier conteo o posicionamiento por texto los duplica. */
export function dedupItems(items: PdfTextItem[]): PdfTextItem[] {
  const kept: PdfTextItem[] = []
  for (const item of items) {
    const isDup = kept.some(k =>
      k.page === item.page &&
      k.str === item.str &&
      Math.abs(k.x - item.x) <= DEDUP_TOLERANCE &&
      Math.abs(k.y - item.y) <= DEDUP_TOLERANCE,
    )
    if (!isDup) kept.push(item)
  }
  return kept
}
