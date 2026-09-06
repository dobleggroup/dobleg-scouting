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

/** Limite horizontal entre la mini-cancha de eventos y la tabla de ranking
 *  que Wyscout dibuja a su derecha, en la misma franja de "y" (dorsal +
 *  nombre + columnas de stats de 1 digito). Verificado contra el fixture
 *  real (pagina 16): los numeros de evento sobre la cancha no pasan de
 *  x=268.4, mientras que la columna de dorsal de la tabla arranca en x=316.9
 *  (encabezado "Defensores" en x=313.6). Sin este corte, esos dorsales -- y
 *  las columnas de stats de 1 digito mas a la derecha, ej. goles/xG -- se
 *  cuelan como si fueran puntos de la cancha (ambos son numeros sueltos de
 *  1-2 digitos con ancho chico). */
const PITCH_REGION_MAX_X = 300

/** Un mapa de eventos = numeros de camiseta sueltos (1-2 digitos, sin nombre debajo
 *  -- eso los distingue de una cancha de posicion media, Tasks 7/9), agrupados bajo
 *  la etiqueta de mitad de cancha mas cercana arriba.
 *
 *  Nota: una sola pagina puede traer varios sub-graficos apilados en vertical
 *  (verificado contra el fixture real: la pagina 16 "FASE DEFENSIVA" trae
 *  "Duelos defensivos ganados en el propio tercio del campo", "...perdidos
 *  ..." y "Duelos aereos", cada uno con su propia etiqueta "PROPIA MITAD").
 *  Esta funcion no conoce los titulos de esos sub-graficos -- esa
 *  responsabilidad es de quien decide que `pageItems` pasarle -- asi que
 *  devuelve un mapa por CADA etiqueta de mitad que encuentra en los items
 *  recibidos, en vez de asumir que hay una sola. */
export function parseEventMaps(pageItems: PdfTextItem[], category: string): WyscoutEventMap[] {
  const items = dedupItems(pageItems)
  const halfLabels = items.filter(i => HALF_LABEL_RE.test(i.str)).sort((a, b) => b.y - a.y)
  if (halfLabels.length === 0) return []

  return halfLabels.map((label, i) => {
    const next = halfLabels[i + 1]
    const regionItems = items.filter(it =>
      it.y < label.y && (!next || it.y >= next.y),
    )
    const numbers = regionItems.filter(it =>
      /^\d{1,2}$/.test(it.str) && it.width < JERSEY_NUMBER_MAX_WIDTH && it.x < PITCH_REGION_MAX_X,
    )
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
