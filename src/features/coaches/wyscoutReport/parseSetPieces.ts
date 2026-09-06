import type { PdfTextItem } from '@/lib/pdf/extractPdfItems'
import { parseEventMaps } from './parseEventMaps'
import type { WyscoutReportSetPiece } from './wyscoutReportTypes'

/** Verificado contra el fixture real (pagina 22): la columna izquierda va de
 *  x=14.4 a ~190 y la derecha de x=311.4 a ~535 -- 300 cae limpio en la mitad
 *  del hueco entre ambas. */
const PAGE_MIDPOINT_X = 300

const CORNER_TITLE_RE = /^CÓRNERES (IZQUIERDOS|DERECHOS)$/
const FREE_KICK_TITLE_RE = /^TIROS LIBRES (IZQUIERDOS|DERECHOS)$/
const TABLE_HEADER_RE = /^Tiradores$/

/** y del item que matchea `re` mas cercano por debajo de `belowY` (el mayor
 *  "y" entre los candidatos que son menores a `belowY`), o -Infinity si no
 *  hay ninguno. Se usa para encontrar donde arranca la tabla de "Tiradores"
 *  que sigue a cada mini-cancha, sin depender del orden en que pdf.js entrega
 *  los items (que no es necesariamente de arriba hacia abajo). */
function closestBelow(items: PdfTextItem[], belowY: number, re: RegExp): number {
  const ys = items.filter(i => re.test(i.str) && i.y < belowY).map(i => i.y)
  return ys.length > 0 ? Math.max(...ys) : -Infinity
}

function pointsFromHalf(items: PdfTextItem[], category: string) {
  return parseEventMaps(items, category).flatMap(m => m.points)
}

/**
 * Extrae los puntos de córner y tiro libre de la pagina "JUGADAS A BALÓN
 * PARADO" (verificado contra el fixture real, pagina 22).
 *
 * Estructura real de la pagina (de arriba hacia abajo -- en este espacio de
 * coordenadas "y" decrece a medida que se baja en la pagina):
 *
 *   "CÓRNERES IZQUIERDOS" / "CÓRNERES DERECHOS"   (titulos,  y=735.6)
 *     -> puntos de scatter de la mini-cancha       (y entre 613 y 703)
 *     -> "MITAD ADVERSARIA"                        (etiqueta, y=580.2, una por lado)
 *     -> tabla "Tiradores" (córneres)               (y<=555.0)
 *
 *   "TIROS LIBRES IZQUIERDOS" / "TIROS LIBRES DERECHOS"  (titulos, y=415.9)
 *     -> puntos de scatter de la mini-cancha       (y entre 270 y 376)
 *     -> "MITAD ADVERSARIA"                        (etiqueta, y=260.5, una por lado)
 *     -> tabla "Tiradores" (tiros libres)           (y<=235.3)
 *
 * Cada uno de los 4 sub-graficos (corner-izquierda, corner-derecha,
 * tiro_libre-izquierda, tiro_libre-derecha) se recorta en dos ejes antes de
 * llamar a `parseEventMaps`:
 *
 * - en "y", entre el titulo de la seccion y el arranque de SU PROPIA tabla de
 *   "Tiradores" (no hasta el titulo siguiente ni hasta el final de la
 *   pagina). Esto es critico: `parseEventMaps` resuelve la direccion de cada
 *   etiqueta "MITAD ADVERSARIA" buscando primero por debajo y son fallback
 *   por encima -- si el rango pasado incluyera la tabla de abajo (que trae
 *   numeros sueltos de 1-2 digitos en las columnas de stats) o la seccion
 *   siguiente completa, esos numeros podrian colarse como puntos de evento
 *   falsos, o (si el rango llegara a incluir la etiqueta "MITAD ADVERSARIA"
 *   de la seccion siguiente) directamente confundir los limites de dos
 *   mini-canchas distintas.
 *
 * - en "x", con `PAGE_MIDPOINT_X` para separar izquierda de derecha -- esto
 *   ademas garantiza que cada region acotada en "y" solo tenga UNA etiqueta
 *   "MITAD ADVERSARIA" (hay dos por seccion, una en cada mitad de pagina en
 *   x=117.2 y x=414.2), que es la precondicion para que `parseEventMaps` no
 *   tenga ambiguedad de a que mini-cancha pertenece cada punto.
 */
export function parseSetPieces(pageItems: PdfTextItem[]): WyscoutReportSetPiece[] {
  const cornerTitleY = pageItems.find(i => CORNER_TITLE_RE.test(i.str))?.y ?? Infinity
  const freeKickTitleY = pageItems.find(i => FREE_KICK_TITLE_RE.test(i.str))?.y ?? -Infinity

  const cornerTableY = closestBelow(pageItems, cornerTitleY, TABLE_HEADER_RE)
  const freeKickTableY = closestBelow(pageItems, freeKickTitleY, TABLE_HEADER_RE)

  const cornerItems = pageItems.filter(i => i.y < cornerTitleY && i.y > cornerTableY)
  const freeKickItems = pageItems.filter(i => i.y < freeKickTitleY && i.y > freeKickTableY)

  const build = (items: PdfTextItem[], type: 'corner' | 'tiro_libre'): WyscoutReportSetPiece[] => {
    const left = pointsFromHalf(items.filter(i => i.x < PAGE_MIDPOINT_X), `${type}_izquierdo`)
    const right = pointsFromHalf(items.filter(i => i.x >= PAGE_MIDPOINT_X), `${type}_derecho`)
    return [
      ...left.map(point => ({ type, side: 'izquierdo' as const, point })),
      ...right.map(point => ({ type, side: 'derecho' as const, point })),
    ]
  }

  return [...build(cornerItems, 'corner'), ...build(freeKickItems, 'tiro_libre')]
}
