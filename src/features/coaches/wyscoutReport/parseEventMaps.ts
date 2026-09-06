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

/** Umbral de hueco horizontal ("x") para separar el racimo denso de puntos de
 *  la mini-cancha de los restos sueltos de la tabla de ranking (columna de
 *  dorsal + columnas de stats) que cae en la misma banda de "y".
 *
 *  Un intento anterior distinguia por fila (numero que comparte "y" con un
 *  item de texto = celda de tabla), pero eso descartaba puntos genuinos: el
 *  nombre del jugador de la tabla corre a lo largo de TODA la altura del
 *  grafico en una columna fija (x≈326 en la pagina 16), asi que por pura
 *  coincidencia de "y" terminaba emparejado con puntos de cancha que estan a
 *  100-200pt de distancia en "x" y no tienen ninguna relacion con esa fila
 *  (verificado: "6" en x=124.5 excluido por compartir "y" con "P. Souto" en
 *  x=326.4, a 202pt de distancia). Ademas, ni siquiera un corte por distancia
 *  en "x" alcanza: el hueco mas chico entre un punto genuino y un item de
 *  texto ajeno coincidente en "y" (63.1pt) es MENOR que huecos reales dentro
 *  de una misma fila de tabla (dorsal a nombre ~9.5pt, pero nombre a su
 *  propia columna de stats mas lejana ~90-97pt) -- ambas distribuciones se
 *  superponen, no hay un corte de distancia unico que las separe.
 *
 *  Lo que si separa limpio, verificado contra las 3 mini-canchas de la
 *  pagina 16: el racimo de puntos de cancha es denso (hueco interno maximo
 *  10.1/17.7/18.9pt en cada una) y el primer resto de tabla aparece recien
 *  47-51pt despues del ultimo punto de cancha -- un hueco 2.5x mas grande que
 *  cualquier hueco interno real. Por eso se corta por DENSIDAD relativa (el
 *  racimo con mas puntos gana) en vez de por una coordenada de pagina fija:
 *  esto sigue funcionando aunque la mini-cancha este del lado derecho de la
 *  pagina (graficos espejados "MITAD ADVERSARIA" de la pagina 22), porque el
 *  racimo denso simplemente aparece en otro rango de "x".
 */
const CLUSTER_GAP_THRESHOLD = 30

/** Divide los candidatos (ya ordenados por "x") en racimos cortando donde el
 *  hueco horizontal supera `CLUSTER_GAP_THRESHOLD`, y devuelve el racimo con
 *  mas puntos -- el resto (restos sueltos de tabla, con muchos menos puntos)
 *  se descarta. Si no hay ningun hueco grande, todo es un solo racimo y se
 *  devuelve entero. */
function keepDensestCluster(candidates: PdfTextItem[]): PdfTextItem[] {
  if (candidates.length === 0) return candidates
  const sorted = [...candidates].sort((a, b) => a.x - b.x)
  const clusters: PdfTextItem[][] = [[sorted[0]]]
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].x - sorted[i - 1].x > CLUSTER_GAP_THRESHOLD) clusters.push([])
    clusters[clusters.length - 1].push(sorted[i])
  }
  return clusters.reduce((best, c) => (c.length > best.length ? c : best), clusters[0])
}

/** De un conjunto de items ya acotado a una region, se queda con los numeros
 *  sueltos que son puntos de evento genuinos: 1-2 digitos, ancho chico, y
 *  parte del racimo denso (ver `keepDensestCluster`) en vez de un resto
 *  suelto de la tabla de ranking. */
function extractEventNumbers(regionItems: PdfTextItem[]): PdfTextItem[] {
  const candidates = regionItems.filter(it =>
    /^\d{1,2}$/.test(it.str) && it.width < JERSEY_NUMBER_MAX_WIDTH,
  )
  return keepDensestCluster(candidates)
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
