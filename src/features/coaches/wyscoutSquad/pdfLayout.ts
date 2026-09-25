// src/features/coaches/wyscoutSquad/pdfLayout.ts
/** Reparte bloques (alturas) en paginas sin partir ninguno. Un bloque mas alto que la
 *  pagina va solo en la suya. `gap` es el espacio entre bloques de la misma pagina. */
export function planPages(blockHeights: number[], pageContentHeight: number, gap = 0): number[][] {
  const pages: number[][] = []
  let current: number[] = []
  let used = 0
  blockHeights.forEach((h, i) => {
    const needed = current.length ? used + gap + h : h
    if (current.length && needed > pageContentHeight) {
      pages.push(current)
      current = [i]
      used = h
    } else {
      current.push(i)
      used = needed
    }
  })
  if (current.length) pages.push(current)
  return pages
}
