import { groupRows } from '@/lib/pdf/groupRows'
import type { PdfTextItem } from '@/lib/pdf/extractPdfItems'
import { dedupItems } from './dedupItems'
import { normalizeCluster } from './pitchNormalization'
import type {
  WyscoutReportMatch,
  WyscoutReportMatchLineupPlayer,
  WyscoutReportMatchStint,
  PitchPoint,
} from './wyscoutReportTypes'

const DATE_RE = /^(\d{2})\.(\d{2})\.(\d{4})$/
const SCORE_RE = /^\d+\s*[–-]\s*\d+$/
const POSITION_CODE_RE = /^[A-Z]{2,4}$/
const SHIRT_NUMBER_RE = /^\d{1,2}$/
const HAS_LETTER_RE = /[a-zA-Záéíóúñ]/

function isoDate(text: string): string {
  const m = text.match(DATE_RE)!
  return `${m[3]}-${m[2]}-${m[1]}`
}

export interface MatchHeader {
  date: string
  rival: string
  isHome: boolean
  score: string
  competition: string
}

/** Encabezado del partido (resultado/fecha/competencia/nombres de equipo):
 *  vive en una franja angosta de "y" bien arriba de las 2 columnas de
 *  alineacion. Verificado contra el fixture real (pagina 6, Quilmes 0-1
 *  Temperley): resultado "0 – 1" en y=745.9; fecha "31.08.2026" y
 *  competencia "Primera Nacional" en la misma fila y=726.3 (fecha a la
 *  izquierda); los 2 nombres de equipo mas abajo en y=721.9 (en ESTE partido
 *  el local -- Quilmes -- quedo a la izquierda y el visitante -- Temperley
 *  -- a la derecha, pero eso no esta garantizado en general: por eso el
 *  propio equipo se identifica por roster, no por posicion). Por encima de
 *  esta franja (y>=807.3) esta el rotulo de marca de la pagina ("INFORME DEL
 *  EQUIPO" / nombre del club del informe / "P A R T I D O S"), que se repite
 *  en TODAS las paginas del PDF y no es parte del encabezado de este
 *  partido -- de ahi el limite superior en 800. */
const HEADER_Y_MIN = 700
const HEADER_Y_MAX = 800

/** Tolerancia en "y" para emparejar la celda de competencia con la de fecha:
 *  ambas viven en la misma fila (y=726.3 en el fixture real), mientras que
 *  los nombres de equipo (y=721.9) quedan a mas de 3pt de distancia. */
const SAME_ROW_Y_TOLERANCE = 3

/** Franja de "y" de las 2 columnas de alineacion (titulares + suplentes que
 *  entraron). Por encima (y>=700) esta el encabezado del partido; por debajo
 *  (y<420) empieza el proximo bloque de la pagina -- los rotulos de esquema
 *  y minutos de cada tramo del partido (Task 9), p.ej. "4-2-3-1" en
 *  y=412.9. Verificado contra el fixture real: el ultimo jugador de la
 *  alineacion (titular o suplente) cae en y=440.7, con un salto de ~27.8pt
 *  hasta ese primer rotulo de tramo -- 420 cae comodo en el medio. */
const LINEUP_Y_MIN = 420
const LINEUP_Y_MAX = 700

/** Frontera en "x" entre la columna izquierda y la derecha de la alineacion.
 *  Verificado contra el fixture real: la columna izquierda (codigo de
 *  posicion x=14.4, dorsal x=47.6/46.4, nombre x=57.1) no pasa de x≈95 ni
 *  con el nombre mas largo ("R. Martínez"); la columna derecha (codigo de
 *  posicion x=403.9, dorsal x=437.2/435.9, nombre x=446.7) no baja de
 *  x=403.9. Entre ambas columnas, en la franja x≈185-381, la pagina dibuja
 *  marcadores de cambios (minuto de entrada/salida, dorsal del que entra)
 *  que no son parte de ninguna columna: quedan fuera de los 2 rangos de
 *  abajo y, aunque cayeran adentro, tampoco matchean codigo/dorsal/nombre
 *  (traen apostrofe o no tienen ninguna letra). */
const LEFT_COLUMN_MAX_X = 200
const RIGHT_COLUMN_MIN_X = 400

/** Cantidad de jugadores en el XI titular: la pagina lista, por columna,
 *  primero los 11 titulares y despues -- con el mismo formato de fila -- los
 *  suplentes que entraron, sin ningun salto de "y" que distinga el corte
 *  (verificado contra el fixture real: el espaciado entre filas es
 *  uniforme, ~17.2-17.3pt, de punta a punta de la columna). Por eso el corte
 *  es por CANTIDAD de filas validas (las primeras 11, en orden de "y"
 *  descendente que ya entrega `groupRows`), no por algun quiebre visual. */
const STARTING_XI_SIZE = 11

/** Arma los jugadores de una columna de alineacion (titulares + suplentes
 *  usados) a partir de sus items ya filtrados por columna (ver
 *  `LEFT_COLUMN_MAX_X`/`RIGHT_COLUMN_MIN_X`). Cada fila real trae exactamente
 *  codigo de posicion + dorsal + nombre; una fila que no trae los 3 no es
 *  una fila de jugador y se descarta. */
function buildColumn(colItems: PdfTextItem[]): WyscoutReportMatchLineupPlayer[] {
  const rows = groupRows(colItems)
  const players: WyscoutReportMatchLineupPlayer[] = []
  for (const row of rows) {
    const posCell = row.cells.find(c => POSITION_CODE_RE.test(c.text))
    const numberCell = row.cells.find(c => SHIRT_NUMBER_RE.test(c.text))
    const nameCell = row.cells.find(c => c !== posCell && c !== numberCell && HAS_LETTER_RE.test(c.text))
    if (!posCell || !numberCell || !nameCell) continue
    players.push({ number: Number(numberCell.text), name: nameCell.text, positionCode: posCell.text, isStarter: true })
  }
  return players
}

/**
 * Arma el encabezado de un partido y su XI titular a partir de los items de
 * UNA pagina "PARTIDOS". La pagina trae 2 columnas de alineacion lado a lado
 * (un equipo en cada lado) -- cual de las 2 es el propio equipo se decide
 * por cuantos nombres de esa columna matchean contra el roster ya conocido
 * (Task 5/6), NO por si quedo a la izquierda/derecha ni por local/visitante:
 * el propio equipo puede jugar de local o visitante segun el partido.
 */
export function parseMatchHeaderAndLineup(
  pageItems: PdfTextItem[],
  knownRosterNames: Set<string>,
): { header: MatchHeader; lineup: WyscoutReportMatchLineupPlayer[] } {
  const items = dedupItems(pageItems)

  const headerItems = items.filter(it => it.y > HEADER_Y_MIN && it.y < HEADER_Y_MAX)
  const dateItem = headerItems.find(it => DATE_RE.test(it.str))!
  const scoreItem = headerItems.find(it => SCORE_RE.test(it.str))!
  const competitionItem = headerItems.find(
    it => it !== dateItem && it !== scoreItem && Math.abs(it.y - dateItem.y) < SAME_ROW_Y_TOLERANCE,
  )!
  const [homeTeamItem, awayTeamItem] = headerItems
    .filter(it => it !== dateItem && it !== scoreItem && it !== competitionItem)
    .sort((a, b) => a.x - b.x)

  const lineupItems = items.filter(it => it.y > LINEUP_Y_MIN && it.y < LINEUP_Y_MAX)
  const leftPlayers = buildColumn(lineupItems.filter(it => it.x < LEFT_COLUMN_MAX_X))
  const rightPlayers = buildColumn(lineupItems.filter(it => it.x >= RIGHT_COLUMN_MIN_X))

  const leftMatches = leftPlayers.filter(p => knownRosterNames.has(p.name)).length
  const rightMatches = rightPlayers.filter(p => knownRosterNames.has(p.name)).length
  const ownIsLeft = leftMatches >= rightMatches

  const homeName = homeTeamItem.str
  const awayName = awayTeamItem.str

  return {
    header: {
      date: isoDate(dateItem.str),
      rival: ownIsLeft ? awayName : homeName,
      isHome: ownIsLeft,
      score: scoreItem.str,
      competition: competitionItem.str,
    },
    lineup: (ownIsLeft ? leftPlayers : rightPlayers).slice(0, STARTING_XI_SIZE),
  }
}

/** Encabezado de un tramo: esquema de formacion ("4-2-3-1", "4-3-3", etc). */
const STINT_HEADER_RE = /^(\d(-\d){2,4})$/

/** Rango de minutos de un tramo, p.ej. "1' — 63'" o, con descuento, "87' — 90+6'". */
const MINUTE_RANGE_RE = /^(\d+)\+?(\d+)?'?\s*—\s*(\d+)\+?(\d+)?'?$/

/** El descuento ("+N") suma como minutos enteros al minuto base: "90+6'" ->
 *  96, no 90.6 -- verificado contra el fixture real (el ultimo tramo del
 *  partido, "87' — 90+6'", termina en el minuto 96 de juego real, no en un
 *  valor fraccionario que no representa nada en el contexto de un partido). */
function parseMinuteToken(main: string, extra: string | undefined): number {
  return Number(main) + (extra ? Number(extra) : 0)
}

/** Ancho horizontal de cada carril de tramo -- verificado contra el fixture
 *  real (pagina 6): los 4 tramos arrancan en x=27.7, 166.3, 304.9, 443.5
 *  (delta exacto de 138.6pt entre cada uno). */
const STINT_SLOT_WIDTH = 138.6

/** Distancia horizontal entre el rotulo de esquema de un tramo (p.ej. "4-2-3-1")
 *  y el arranque real de su carril de puntos de cancha -- verificado contra
 *  el fixture real: el carril arranca un poco a la izquierda del texto del
 *  esquema (headerItem.x=27.7 pero el jugador mas a la izquierda de ese
 *  tramo, "3" Angelini, esta en x=41.1; 15 de margen deja lugar de sobra sin
 *  invadir el carril anterior). */
const STINT_SLOT_LEFT_MARGIN = 15

/** Franja vertical debajo del renglon de encabezado del tramo (esquema +
 *  rango de minutos) donde vive la mini-cancha de ese tramo -- verificado
 *  contra el fixture real: el renglon de encabezado esta en y=412.9, el
 *  jugador mas alto de cualquier tramo (el arquero, numero "1") esta en
 *  y=260.1, muy por debajo del margen de 20. */
const STINT_HEADER_TO_PITCH_GAP = 20

/** Igual patron que `parseAveragePositions` en `parseFormationsSection.ts`
 *  ("numero de camiseta 1-2 digitos, inmediatamente arriba del apellido"),
 *  pero acotado al carril horizontal de CADA tramo (`STINT_SLOT_WIDTH`) en
 *  vez de a toda la pagina, porque los 4 tramos comparten el mismo rango de
 *  "y" (sus 4 mini-canchas quedan una al lado de la otra, no apiladas). */
function parseStintPlayers(pitchItems: PdfTextItem[]): PitchPoint[] {
  const numbers = pitchItems.filter(it => /^\d{1,2}$/.test(it.str))

  return normalizeCluster(numbers, n =>
    pitchItems
      .filter(it => it !== n && Math.abs(it.x - n.x) < 15 && it.y < n.y && n.y - it.y < 12)
      .sort((a, b) => (n.y - a.y) - (n.y - b.y))[0]?.str,
  )
}

/**
 * Arma los tramos de formacion de UN partido (esquema + rango de minutos +
 * jugadores en cancha) a partir de los items de una pagina "PARTIDOS". Cada
 * tramo se identifica por su propio rotulo de esquema en la misma fila que su
 * rango de minutos; los puntos de cancha de ESE tramo se ubican por carril
 * horizontal (`STINT_SLOT_WIDTH`), ya que los 4 tramos de un partido comparten
 * el mismo rango vertical (sus mini-canchas van una al lado de la otra). Las
 * coordenadas de `players` se normalizan a 0-100 tomando el bounding box de
 * los propios puntos de CADA tramo (no el de toda la pagina), igual patron
 * que `parseAveragePositions` en `parseFormationsSection.ts`.
 */
export function parseMatchStints(pageItems: PdfTextItem[]): WyscoutReportMatchStint[] {
  const items = dedupItems(pageItems)

  const headers = items
    .filter(it => STINT_HEADER_RE.test(it.str))
    .sort((a, b) => a.x - b.x)

  return headers.map(headerItem => {
    const rangeItem = items.find(it =>
      Math.abs(it.y - headerItem.y) < 2 && it.x > headerItem.x && MINUTE_RANGE_RE.test(it.str),
    )!
    const m = rangeItem.str.match(MINUTE_RANGE_RE)!
    const fromMinute = parseMinuteToken(m[1], m[2])
    const toMinute = parseMinuteToken(m[3], m[4])

    const slotStart = headerItem.x - STINT_SLOT_LEFT_MARGIN
    const slotEnd = slotStart + STINT_SLOT_WIDTH
    const pitchItems = items.filter(it =>
      it.y < headerItem.y - STINT_HEADER_TO_PITCH_GAP &&
      it.x >= slotStart && it.x < slotEnd,
    )

    return { formation: headerItem.str, fromMinute, toMinute, players: parseStintPlayers(pitchItems) }
  })
}

/**
 * Arma la lista completa de partidos (una entrada por cada pagina "PARTIDOS")
 * combinando encabezado+alineacion (Task 8) y tramos de formacion (Task 9) de
 * cada pagina.
 */
export function parseMatchesSection(
  pagesItems: PdfTextItem[][],
  knownRosterNames: Set<string>,
): WyscoutReportMatch[] {
  return pagesItems.map(pageItems => {
    const { header, lineup } = parseMatchHeaderAndLineup(pageItems, knownRosterNames)
    const stints = parseMatchStints(pageItems)
    return { ...header, lineup, stints }
  })
}

/** Suma los minutos de los tramos en los que aparece el jugador (por apellido,
 *  igual que el `label` de `PitchPoint` en `parseMatchStints`). */
export function minutesPlayedInMatch(
  stints: Pick<WyscoutReportMatchStint, 'fromMinute' | 'toMinute' | 'players'>[],
  playerSurname: string,
): number {
  return stints
    .filter(s => s.players.some(p => p.label === playerSurname))
    .reduce((sum, s) => sum + (s.toMinute - s.fromMinute), 0)
}
