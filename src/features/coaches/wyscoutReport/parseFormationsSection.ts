import { groupRows } from '@/lib/pdf/groupRows'
import type { PdfCell } from '@/lib/pdf/groupRows'
import type { PdfTextItem } from '@/lib/pdf/extractPdfItems'
import { dedupItems } from './dedupItems'
import type { WyscoutReportFormation, PitchPoint } from './wyscoutReportTypes'

const STAT_LABELS = [
  'GOLES', 'XG', 'POSESIÓN DEL BALÓN, %', 'PRECISIÓN PASES, &',
  'INTENSIDAD DE JUEGO', 'DISTRIBUCIÓN LANZAMIENTOS, %', 'PPDA RC_PPDA_ABBR',
]

const SCHEME_RE = /^\d(-\d){2,4}$/    // "4-2-3-1", "4-4-2", "4-3-3"
const PCT_RE = /^(\d{1,3})%$/

/** Filtra el ruido de encabezado ("INFORME DEL EQUIPO" / "F O R M A C I O N E S"
 *  en y=807-819) y pie de pagina (numero de pagina en y=16.4) fuera del area
 *  real de contenido, verificado contra el fixture real: el contenido va de
 *  y=759.5 (rotulo "4-4-2") a y=171.1 (fila PPDA de la formacion principal). */
const CONTENT_Y_MIN = 50
const CONTENT_Y_MAX = 790

/** Frontera en x entre la formacion principal y las dos alternativas.
 *
 *  Verificado contra el fixture real (pagina 5 = FORMACIONES): la pagina NO
 *  apila las 3 formaciones de arriba a abajo. La formacion principal ocupa
 *  los 2/3 izquierdos de la pagina de punta a punta -- su cancha de
 *  posiciones promedio arriba (x maximo observado 259.2) y, bien mas abajo,
 *  fuera del rango vertical de esa cancha, su rotulo de esquema/porcentaje y
 *  tabla comparativa (x maximo observado 270.9) -- mientras que las dos
 *  formaciones alternativas estan apiladas en la franja derecha (x minimo
 *  observado 319.7), cada una con su propia mini-cancha y tabla comparativa,
 *  ocupando EL MISMO rango vertical que la cancha de la principal. Por eso
 *  no alcanza con cortar solo por "y" (la propuesta original de este
 *  parser): hay que cortar primero por "x" (izquierda = principal completa,
 *  derecha = las dos alternativas juntas) y, recien dentro de la franja
 *  derecha, cortar por "y" anclando en sus 2 rotulos de esquema. 300 cae
 *  comodo en el medio del hueco de ~49pt entre ambos extremos. */
const LEFT_RIGHT_SPLIT_X = 300

/**
 * Separa los items de la pagina en un bloque por formacion. Ver el comentario
 * de `LEFT_RIGHT_SPLIT_X` para el layout real verificado contra el fixture.
 */
function toBlocks(items: PdfTextItem[]): PdfTextItem[][] {
  const content = items.filter(i => i.y >= CONTENT_Y_MIN && i.y <= CONTENT_Y_MAX)
  const left = content.filter(i => i.x < LEFT_RIGHT_SPLIT_X)
  const right = content.filter(i => i.x >= LEFT_RIGHT_SPLIT_X)

  // Dentro de la franja derecha, cada formacion alternativa tiene su rotulo
  // de esquema como item MAS ARRIBA de su propio bloque (nada de su contenido
  // -- ni cancha ni tabla -- queda por encima de el), y el rotulo de la
  // siguiente formacion como frontera inferior exacta (nada de un bloque cae
  // en la misma fila que el rotulo del siguiente). Por eso alcanza con cortar
  // por la "y" de los rotulos mismos, sin necesidad de un margen adicional.
  const schemeItems = right.filter(i => SCHEME_RE.test(i.str)).sort((a, b) => b.y - a.y)
  const rightBlocks = schemeItems.map((scheme, i) => {
    const next = schemeItems[i + 1]
    return right.filter(it => it.y <= scheme.y && (!next || it.y > next.y))
  })

  return [left, ...rightBlocks]
}

/** Maximo gap en y, en puntos, entre el numero de camiseta y el apellido que
 *  lo identifica debajo. Verificado contra el fixture real: ~14.7-14.8pt en
 *  la cancha grande (formacion principal) y ~7.8-7.9pt en las canchas chicas
 *  (formaciones alternativas, a menor escala) -- 30 cubre ambos casos con
 *  margen y esta muy por debajo del salto a la siguiente seccion de la
 *  pagina (>100pt en todos los casos observados), por lo que no hay riesgo
 *  de aparear con texto de otra seccion del bloque. */
const NUMBER_TO_NAME_MAX_GAP = 30

/** Tolerancia en x, en puntos, para considerar que un nombre esta "debajo" de
 *  un numero de camiseta: el numero esta centrado sobre el nombre, pero el x
 *  de un texto en PDF es su inicio, no su centro, asi que para nombres largos
 *  ("Aguiñagalde") el numero cae bien a la derecha del inicio del nombre. En
 *  vez de una distancia absoluta fija, se verifica que el x del numero caiga
 *  dentro del span [x, x+width] del propio nombre (con este margen). */
const NAME_SPAN_PAD = 2

interface StatRowCells {
  labelCell: PdfCell
  ownCell?: PdfCell
  rivalCell?: PdfCell
}

/**
 * Identifica, por fila, el rotulo de la tabla comparativa y sus valores
 * propio/rival como el vecino numerico MAS CERCANO al rotulo a cada lado
 * (nearest-left / nearest-right), no cualquier celda numerica de la fila.
 *
 * Esto importa porque `groupRows` (tolerancia de fila = 3pt) a veces fusiona
 * la fila de un rotulo con la fila de un numero de camiseta cuyo "y" cae por
 * casualidad a menos de esa tolerancia -- verificado contra el fixture real:
 * en las formaciones alternativas (canchas mas chicas, filas de jugadores
 * cada ~7-8pt, mucho mas apretadas que en la principal) esto pasa 3 veces
 * (filas POSESION, DISTRIBUCION y PPDA del bloque 4-4-2, cada una fusionada
 * con una fila de 2 jugadores). Tomar "la primera celda numerica a la
 * izquierda del rotulo" (como hacia la version anterior de este parser) elige
 * ahi el numero de camiseta mas lejano en vez del valor propio real -- se
 * confirmo que asi el 4-4-2 quedaba con "POSESIÓN DEL BALÓN, %" own=11 (el
 * dorsal de Souto) en vez de 54.69 (el valor real). Tomar el vecino MAS
 * CERCANO a cada lado resuelve ambos problemas a la vez: la fila
 * comparativa queda bien parseada, y `parseAveragePositions` (que reusa este
 * mismo resultado para excluir del pool de "numeros de camiseta" solo los
 * items exactos que son valores de esta tabla) no descarta jugadores reales.
 */
function findStatRows(block: PdfTextItem[]): StatRowCells[] {
  const rows = groupRows(block)
  const result: StatRowCells[] = []
  for (const row of rows) {
    const labelCell = row.cells.find(c => STAT_LABELS.some(l => c.text.startsWith(l.split(',')[0].split(' ')[0])))
    if (!labelCell) continue
    const numeric = row.cells.filter(c => c !== labelCell && /^-?[\d.]+$/.test(c.text))
    // row.cells viene ordenado por x ascendente (ver groupRows): el ultimo
    // elemento con x<label.x es el mas cercano al rotulo desde la izquierda,
    // el primero con x>label.x es el mas cercano desde la derecha.
    const leftNums = numeric.filter(c => c.x < labelCell.x)
    const rightNums = numeric.filter(c => c.x > labelCell.x)
    result.push({ labelCell, ownCell: leftNums[leftNums.length - 1], rivalCell: rightNums[0] })
  }
  return result
}

/** Valores propio/rival de la tabla comparativa (ver `findStatRows`), como el
 *  set exacto de items a excluir antes de buscar numeros de camiseta en
 *  `parseAveragePositions`: el valor de GOLES (p.ej. "6"/"4") es 1-2 digitos
 *  y matchea el mismo patron que un numero de camiseta -- verificado contra
 *  el fixture real, sin esta exclusion la formacion principal cuenta 13
 *  "numeros" en vez de 11 (los 2 valores de la fila GOLES se cuelan). Ademas,
 *  un valor decimal como "5.32" no matchea el patron de camiseta pero SI
 *  puede matchear como "nombre" candidato de un numero cercano (no requiere
 *  ser texto alfabetico) -- por lo que tambien hay que excluirlo del pool de
 *  nombres. Se excluyen los ITEMS puntuales (por x+texto exacto), no toda la
 *  fila por rango de "y", precisamente para no arrastrar jugadores reales
 *  cuando `groupRows` fusiona filas (ver comentario de `findStatRows`). */
function statValueItems(block: PdfTextItem[]): Set<PdfTextItem> {
  const values = new Set<PdfTextItem>()
  for (const { ownCell, rivalCell } of findStatRows(block)) {
    for (const cell of [ownCell, rivalCell]) {
      if (!cell) continue
      const original = block.find(it => it.x === cell.x && it.str === cell.text)
      if (original) values.add(original)
    }
  }
  return values
}

function parseAveragePositions(block: PdfTextItem[]): PitchPoint[] {
  // Numero de camiseta (1-2 digitos) inmediatamente arriba del apellido --
  // mismo patron que las estampas de partido (Task 10). Cancha de este
  // bloque: se toma el bounding box de los propios puntos para normalizar a
  // 0-100. Se excluyen los valores de la tabla comparativa (ver
  // `statValueItems`) antes de buscar numeros de camiseta.
  const excluded = statValueItems(block)
  const pitchItems = block.filter(i => !excluded.has(i))
  const numbers = pitchItems.filter(i => /^\d{1,2}$/.test(i.str))
  if (numbers.length === 0) return []
  const xs = numbers.map(n => n.x)
  const ys = numbers.map(n => n.y)
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)]
  const [minY, maxY] = [Math.min(...ys), Math.max(...ys)]
  const spanX = maxX - minX || 1
  const spanY = maxY - minY || 1

  return numbers.map(n => {
    const nameItem = pitchItems
      .filter(i =>
        i !== n &&
        !/^\d{1,2}$/.test(i.str) &&
        i.y < n.y &&
        n.y - i.y <= NUMBER_TO_NAME_MAX_GAP &&
        n.x >= i.x - NAME_SPAN_PAD &&
        n.x <= i.x + i.width + NAME_SPAN_PAD,
      )
      .sort((a, b) => (n.y - a.y) - (n.y - b.y))[0]
    return {
      x: ((n.x - minX) / spanX) * 100,
      y: 100 - ((n.y - minY) / spanY) * 100, // y de PDF crece hacia arriba; pitch 0-100 crece hacia abajo
      label: nameItem?.str,
    }
  })
}

function parseTeamStats(block: PdfTextItem[]): { label: string; own: number; rival: number }[] {
  return findStatRows(block)
    .filter((r): r is Required<StatRowCells> => r.ownCell !== undefined && r.rivalCell !== undefined)
    .map(r => ({ label: r.labelCell.text, own: Number(r.ownCell.text), rival: Number(r.rivalCell.text) }))
}

export function parseFormationsSection(pageItems: PdfTextItem[]): WyscoutReportFormation[] {
  const items = dedupItems(pageItems)
  const blocks = toBlocks(items).filter(block => block.some(i => SCHEME_RE.test(i.str)))

  return blocks.map(block => {
    const scheme = block.find(i => SCHEME_RE.test(i.str))!.str
    const pctItem = block.find(i => PCT_RE.test(i.str))
    const usagePct = pctItem ? Number(pctItem.str.replace('%', '')) : 0
    return {
      scheme,
      usagePct,
      averagePositions: parseAveragePositions(block),
      teamStats: parseTeamStats(block),
    }
  })
}
