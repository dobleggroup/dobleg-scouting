import type { PdfTextItem } from '@/lib/pdf/extractPdfItems'
import { dedupItems } from './dedupItems'
import type { WyscoutZoneGrid } from './wyscoutReportTypes'

const SECTION_TITLES: { match: RegExp; category: WyscoutZoneGrid['category'] }[] = [
  { match: /^Recuperaciones de balón$/i, category: 'recuperaciones' },
  { match: /^Pérdidas de balón$/i, category: 'perdidas' },
  { match: /^Faltas cometidas$/i, category: 'faltas' },
]

// NOTA (Task 15): se investigó si la página PELIGRO CONSTANTE (página 21 del
// fixture real) trae grillas 3x3 con el mismo formato que TRANSICIONES bajo
// los títulos reales "Regate", "Pases en profundidad" y "Fuera de juego".
// Verificado que NO es así: son tablas de porcentajes por JUGADOR (con nombre,
// minutos, etc. a la derecha, igual que las tablas de ranking de FINALIZACIÓN)
// intercaladas con una franja de valores de fuente ancha que por pura
// coincidencia de layout (no de significado) matchea el mismo filtro
// isGridPct usado para distinguir celda-real de marginal en TRANSICIONES.
// Al correr parseZoneGrids sobre la página 21 con estos 3 títulos agregados
// se obtiene: "Regate" con 10 celdas (col 0-3, con un row=1/col=1 espurio) en
// vez de 9, y "Fuera de juego" con una sola celda -- no una grilla 3x3 real.
// Forzar esos títulos acá produciría datos incorrectos, así que
// deliberadamente NO se agregan (a diferencia de "finalizacion", que sí se
// añadió a `classifySectionLabel.ts` para que la página deje de clasificar
// como "desconocida" -- el warning se elimina aunque esta sección puntual no
// se parsee en detalle; ver informe de Task 15 para más contexto).

const PCT_RE = /^(\d+(?:\.\d+)?)%$/
const REF_RE = /^\d+(?:\.\d+)?$/

/** Ancho minimo por caracter (sin contar el "%") que distingue un porcentaje
 *  grande de grilla de un porcentaje marginal (totales de fila/columna).
 *  Verificado contra las 3 secciones reales de la pagina 20: la fuente de la
 *  grilla es ~2x mas ancha por caracter que la de los marginales. El caso
 *  limite mas angosto de grilla es "5%" (1 caracter, 16.63pt -> 16.63pt/char)
 *  y el mas ancho de marginal es "37%"/"56%" (2 caracteres, 11.08pt ->
 *  5.54pt/char). Un corte de ancho ABSOLUTO (p.ej. width > 20) falla con "5%"
 *  (16.63 < 20) y lo descarta por error -- por eso se normaliza por cantidad
 *  de caracteres en vez de comparar el ancho crudo. */
const GRID_PCT_MIN_WIDTH_PER_CHAR = 7

function isGridPct(item: PdfTextItem): boolean {
  if (!PCT_RE.test(item.str)) return false
  const numChars = item.str.length - 1 // descarta el "%"
  return item.width / numChars > GRID_PCT_MIN_WIDTH_PER_CHAR
}

/** Agrupa valores por cercania (gap > threshold arranca un grupo nuevo), sin
 *  depender de coordenadas absolutas -- generaliza entre los 3 graficos de la
 *  pagina, cada uno con su propio rango de x/y. */
function clusterInto3(values: number[], gapThreshold: number): number[] {
  const sorted = [...new Set(values)].sort((a, b) => a - b)
  const groups: number[][] = []
  for (const v of sorted) {
    const last = groups[groups.length - 1]
    if (last && v - last[last.length - 1] <= gapThreshold) last.push(v)
    else groups.push([v])
  }
  return groups.map(g => g.reduce((a, b) => a + b, 0) / g.length) // centro de cada grupo
}

function nearestGroupIndex(groupCenters: number[], value: number): number {
  let best = 0
  let bestDist = Infinity
  groupCenters.forEach((c, i) => {
    const d = Math.abs(c - value)
    if (d < bestDist) { bestDist = d; best = i }
  })
  return best
}

/** Parsea las 3 grillas 3x3 de porcentajes por zona ("Recuperaciones de
 *  balón", "Pérdidas de balón", "Faltas cometidas") de la pagina TRANSICIONES
 *  del informe Wyscout.
 *
 *  Cada seccion trae, ademas de la grilla 3x3 de celdas reales:
 *  - una fila marginal arriba de la grilla (totales por columna, ej.
 *    "38.8% 48.9% 12.3%"), y
 *  - una columna marginal a la izquierda (totales por fila, ej.
 *    "27.6%"/"35.4%"/"37%"),
 *  ambos en fuente mas angosta que las celdas reales (ver
 *  `isGridPct`/`GRID_PCT_MIN_WIDTH_PER_CHAR`) y por lo tanto excluidos antes
 *  de clusterizar.
 *
 *  Cada celda real tambien tiene, debajo suyo (~17pt menos de "y"), un numero
 *  de referencia mas chico sin "%" (ej. "8.8" debajo de "9.8%") que se
 *  adjunta a la celda como `reference`.
 */
export function parseZoneGrids(pageItems: PdfTextItem[]): WyscoutZoneGrid[] {
  const items = dedupItems(pageItems)
  const sectionHeaders = items
    .filter(it => SECTION_TITLES.some(s => s.match.test(it.str)))
    .map(it => ({ ...it, category: SECTION_TITLES.find(s => s.match.test(it.str))!.category }))
    .sort((a, b) => b.y - a.y)

  return sectionHeaders.map((header, i) => {
    const next = sectionHeaders[i + 1]
    const sectionItems = items.filter(it => it.y < header.y && (!next || it.y >= next.y))

    // Los porcentajes grandes de la grilla se distinguen de los totales
    // marginales por ancho de fuente (ver `isGridPct`), no por posicion --
    // ambos comparten el mismo rango de x/y a grandes rasgos (el marginal
    // esta apenas arriba/izquierda de la grilla, no en una region separada).
    const gridPct = sectionItems.filter(isGridPct)
    const xCenters = clusterInto3(gridPct.map(c => c.x), 30)
    const yCenters = clusterInto3(gridPct.map(c => c.y), 20)

    const cells = gridPct.map(c => {
      const row = 2 - nearestGroupIndex(yCenters, c.y) // y crece hacia arriba: el grupo de y mas alto es la fila 0 (la de mas arriba en el dibujo)
      const col = nearestGroupIndex(xCenters, c.x)
      const reference = sectionItems.find(r =>
        REF_RE.test(r.str) && r.width < 15 &&
        Math.abs(r.x - c.x) < 15 && c.y - r.y > 5 && c.y - r.y < 25,
      )
      return { row, col, pct: Number(c.str.replace('%', '')), reference: reference ? Number(reference.str) : null }
    })

    return { category: header.category, cells }
  })
}
