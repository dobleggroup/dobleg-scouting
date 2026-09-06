import type { PdfTextItem } from '@/lib/pdf/extractPdfItems'
import { dedupItems } from './dedupItems'
import type { WyscoutEventMap, PitchHalf } from './wyscoutReportTypes'

const HALF_LABEL_RE = /^(PROPIA MITAD|MITAD ADVERSARIA)$/

function halfFromLabel(text: string | undefined): PitchHalf {
  if (text === 'PROPIA MITAD') return 'propia'
  if (text === 'MITAD ADVERSARIA') return 'rival'
  return 'completa'
}

/** Ancho maximo de un numero de camiseta suelto sobre la cancha. Verificado
 *  contra el fixture real (pagina 16): los numeros de evento miden entre
 *  2.53 y 5.06pt de ancho. */
const JERSEY_NUMBER_MAX_WIDTH = 7

/** Tolerancia en "y" para considerar que un item cae en la MISMA fila que
 *  otro (misma logica que `SAME_ROW_Y_TOLERANCE` en `parseMatchesSection.ts`).
 *  Verificado contra el fixture real: en la tabla de ranking que Wyscout
 *  dibuja junto a cada mini-cancha, el nombre del jugador y sus columnas de
 *  stats numericas de esa misma fila difieren en menos de 0.5pt de "y" entre
 *  si (ej. pagina 16: dorsal/stats en y=733.9, nombre "O. Pacheco" en
 *  y=733.5). */
const ROW_Y_TOLERANCE = 3

const HAS_LETTER_RE = /[a-zA-Záéíóúñ]/

/** Una fila de tabla de ranking siempre trae, ademas de numeros, un item con
 *  letras en la misma fila (el nombre del jugador) -- un punto de evento
 *  sobre la cancha jamas tiene una etiqueta de texto acompañandolo (a
 *  diferencia de una cancha de posicion media, Tasks 7/9): son numeros
 *  sueltos sin nombre. Por eso, en vez de recortar por una coordenada "x"
 *  absoluta de pagina (que se rompe apenas la tabla/cancha se reflejan al
 *  lado derecho de la pagina, como pasa en los graficos "MITAD ADVERSARIA"
 *  espejados de la pagina 22), se descarta cualquier numero que comparta fila
 *  con un item de texto -- sea cual sea su "x". */
function isTableRowCell(candidate: PdfTextItem, regionItems: PdfTextItem[]): boolean {
  return regionItems.some(it =>
    it !== candidate &&
    HAS_LETTER_RE.test(it.str) &&
    Math.abs(it.y - candidate.y) < ROW_Y_TOLERANCE,
  )
}

/** De un conjunto de items ya acotado a una region, se queda con los numeros
 *  sueltos que son puntos de evento genuinos (ver `isTableRowCell`). */
function extractEventNumbers(regionItems: PdfTextItem[]): PdfTextItem[] {
  return regionItems.filter(it =>
    /^\d{1,2}$/.test(it.str) &&
    it.width < JERSEY_NUMBER_MAX_WIDTH &&
    !isTableRowCell(it, regionItems),
  )
}

/** Un mapa de eventos = numeros de camiseta sueltos (1-2 digitos, sin nombre debajo
 *  -- eso los distingue de una cancha de posicion media, Tasks 7/9), agrupados bajo
 *  la etiqueta de mitad de cancha mas cercana.
 *
 *  Nota 1: una sola pagina puede traer varios sub-graficos apilados en vertical
 *  (verificado contra el fixture real: la pagina 16 "FASE DEFENSIVA" trae
 *  "Duelos defensivos ganados en el propio tercio del campo", "...perdidos
 *  ..." y "Duelos aereos", cada uno con su propia etiqueta "PROPIA MITAD").
 *  Esta funcion no conoce los titulos de esos sub-graficos -- esa
 *  responsabilidad es de quien decide que `pageItems` pasarle -- asi que
 *  devuelve un mapa por CADA etiqueta de mitad que encuentra en los items
 *  recibidos, en vez de asumir que hay una sola.
 *
 *  Nota 2: la etiqueta de mitad NO esta siempre en el mismo lugar respecto de
 *  su propia mini-cancha. Verificado contra el fixture real: en la pagina 16
 *  ("Duelos...") la etiqueta "PROPIA MITAD" es un encabezado -- los puntos de
 *  evento quedan POR DEBAJO de ella (menor "y"); en la pagina 22
 *  ("Córneres"/"Tiros libres") la etiqueta "MITAD ADVERSARIA" es un pie de
 *  grafico -- los puntos quedan POR ENCIMA de ella (mayor "y"). Por eso se
 *  intenta primero la banda de abajo (hasta la siguiente etiqueta) y, solo si
 *  ahi no aparece ningun punto real, se prueba la banda de arriba (hasta la
 *  etiqueta anterior) -- nunca las dos a la vez, para no duplicar ni
 *  mezclar el contenido de dos mini-canchas vecinas. */
export function parseEventMaps(pageItems: PdfTextItem[], category: string): WyscoutEventMap[] {
  const items = dedupItems(pageItems)
  const halfLabels = items.filter(i => HALF_LABEL_RE.test(i.str)).sort((a, b) => b.y - a.y)
  if (halfLabels.length === 0) return []

  return halfLabels.map((label, i) => {
    const next = halfLabels[i + 1]
    const prev = halfLabels[i - 1]

    const belowItems = items.filter(it => it.y < label.y && (!next || it.y >= next.y))
    const belowNumbers = extractEventNumbers(belowItems)

    const numbers = belowNumbers.length > 0
      ? belowNumbers
      : extractEventNumbers(items.filter(it => it.y > label.y && (!prev || it.y <= prev.y)))

    const xs = numbers.map(n => n.x)
    const ys = numbers.map(n => n.y)
    const [minX, maxX] = [Math.min(...xs, 0), Math.max(...xs, 1)]
    const [minY, maxY] = [Math.min(...ys, 0), Math.max(...ys, 1)]
    const spanX = maxX - minX || 1
    const spanY = maxY - minY || 1

    return {
      category,
      half: halfFromLabel(label.str),
      points: numbers.map(n => ({
        x: ((n.x - minX) / spanX) * 100,
        y: 100 - ((n.y - minY) / spanY) * 100,
        label: n.str,
      })),
    }
  })
}
