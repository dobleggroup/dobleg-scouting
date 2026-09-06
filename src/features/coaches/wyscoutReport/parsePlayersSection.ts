import { groupRows, nearestColumn } from '@/lib/pdf/groupRows'
import type { PdfCell, PdfRow } from '@/lib/pdf/groupRows'
import type { PdfTextItem } from '@/lib/pdf/extractPdfItems'
import type { WyscoutMetricValue, WyscoutReportPlayerSeason } from './wyscoutReportTypes'

const GROUP_HEADER_NAMES = new Set(['ARQUEROS', 'DEFENSORES', 'CENTROCAMPISTAS', 'DELANTEROS'])

function toNumberOrNull(text: string | undefined): number | null {
  if (!text || text === '-') return null
  const n = Number(text.replace("'", '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Fila de encabezado de columnas de la tabla JUGADORES (verificado contra el
 *  fixture real): "Posición Edad Pie Altura,cm Partidos [Minutos] totales
 *  [Promedio] minutos Goles [Assists ADVS_ASSISTS_BR] [Tarjetas...] Entra/Sale".
 *  Las columnas de 2 líneas ("Minutos totales", "Promedio minutos", "Tarjetas
 *  amarillas/Tarjetas rojas") traen su primera línea en y≈766.7 y la segunda
 *  (la que da el x real de cada columna de datos) en y=760.0 -- se usa solo
 *  esa fila y=760.0 para calcular los centros de columna. */
const HEADER_Y = 760
const HEADER_Y_TOLERANCE = 1

/** Frontera entre la columna de nombre (x=51.9, ancho variable) y la de código
 *  de posición (x=150.5 en adelante) verificada contra el fixture real: incluso
 *  el nombre más largo de la tabla ("V. Aguiñagalde", ancho 54.9) termina en
 *  x≈106.8, muy por debajo de 150. */
const NAME_MAX_X = 150

export function parsePlayersSection(pageItems: PdfTextItem[]): WyscoutReportPlayerSeason[] {
  const headerItems = pageItems.filter(it => Math.abs(it.y - HEADER_Y) <= HEADER_Y_TOLERANCE)
  const centers = headerItems.map(it => it.x + it.width / 2).sort((a, b) => a - b)

  const dataItems = pageItems.filter(it => it.y < HEADER_Y - HEADER_Y_TOLERANCE)
  const rows = groupRows(dataItems)

  const players: WyscoutReportPlayerSeason[] = []
  for (const row of rows) {
    if (row.cells.length === 0) continue
    // Fila de nombre de grupo posicional ("ARQUEROS", "DEFENSORES", etc): una
    // sola celda, sin datos de jugador -- se salta.
    if (row.cells.length === 1 && GROUP_HEADER_NAMES.has(row.cells[0].text)) continue

    const numberCell = row.cells.find(c => /^\d{1,2}$/.test(c.text))
    const nameCell = row.cells.find(
      c => c.x > (numberCell?.x ?? 0) && c.x < NAME_MAX_X && !/^\d+$/.test(c.text),
    )
    // Fila que no tiene la forma "número + nombre" esperada (p.ej. el número de
    // página al pie de la hoja) -- no es una fila de jugador, se descarta.
    if (!numberCell || !nameCell) continue

    const rest = row.cells.filter(c => c !== numberCell && c !== nameCell && c.x >= NAME_MAX_X - 5)
    const byColumn: (string | undefined)[] = new Array(centers.length).fill(undefined)
    for (const cell of rest) {
      const col = nearestColumn(centers, cell.center)
      byColumn[col] = cell.text
    }

    // Orden de columnas verificado contra el fixture: Posición, Edad, Pie
    // (sin texto, siempre vacío), Altura, Partidos, Minutos totales, Promedio
    // minutos, Goles, Assists, Tarjetas, Entra/Sale.
    const [posicion, edad, , altura, partidos, minTotal, minProm, goles] = byColumn

    players.push({
      number: toNumberOrNull(numberCell.text),
      name: nameCell.text,
      positionCode: posicion ?? null,
      age: toNumberOrNull(edad),
      foot: null, // se completa en Task 6 desde "Construcción del juego"
      heightCm: toNumberOrNull(altura),
      matches: toNumberOrNull(partidos) ?? 0,
      minutesTotal: toNumberOrNull(minTotal) ?? 0,
      minutesAvg: toNumberOrNull(minProm),
      goals: toNumberOrNull(goles) ?? 0,
      assists: 0, // Task 6 lo completa desde la columna "Assists" fusionada
      yellowCards: 0, // idem, desde "Tarjetas amarillas/Tarjetas rojas" ("N/M")
      redCards: 0,
      metrics: {},
    })
  }
  return players
}

// ---------------------------------------------------------------------------
// Task 6: extendPlayersWithStats / extendPlayersWithFoot
// ---------------------------------------------------------------------------

/** Gap maximo en x, en puntos, entre dos celdas contiguas para considerarlas
 *  parte del mismo valor (p.ej. "375 / 303" + "81%" -> "375 / 303 81%").
 *  Calibrado contra el fixture real: los pares valor+porcentaje quedan
 *  separados por ~2.2-2.4pt, mientras que columnas distintas quedan
 *  separadas por 10pt o mas (el caso mas ajustado observado, en la pagina 4,
 *  es "Pases clave"=9 seguido de "Segunda/tercera asistencia"="2 / 1" con un
 *  gap de exactamente 10pt) -- 6 deja margen holgado a ambos lados. */
const ADJACENT_CELL_GAP = 6

/** Las paginas ESTADISTICAS traen encabezados de 2 (a veces 3) lineas: una
 *  fila "ancla" que contiene la celda "Jugador" (misma x que la columna de
 *  nombres de parsePlayersSection) y, encima suyo, 1-2 lineas mas con el
 *  resto del rotulo de cada columna, alineadas por x con la fila ancla.
 *  Verificado contra el fixture real: la distancia entre la fila ancla y su
 *  linea superior es siempre ~6.3pt (o ~12.6pt para el unico rotulo de 3
 *  lineas, "Toques en el area de penalti") -- un titulo de seccion suelto
 *  como "Duelos" u "Organizacion" cae a ~15.4pt, así que 14 excluye ese caso
 *  sin necesidad de otra heuristica. */
const HEADER_TOPLINE_MAX_GAP = 14
const HEADER_ALIGN_TOLERANCE = 1

/** Palabras de la fila ancla que son puros calificadores de la palabra de la
 *  linea de arriba (p.ej. "Pases /" + "precisos" son un solo concepto: la
 *  metrica "pases", con su total/exitosos/pct ya capturados en el valor
 *  compuesto). Cuando la celda ancla es una de estas, la clave de la columna
 *  usa solo la linea superior. El resto de los casos (p.ej. "Pases" +
 *  "clave", o "Asistencias" + "a tiro") no son calificadores genericos y se
 *  combinan completas para no colisionar con la clave simplificada. */
const GENERIC_STAT_QUALIFIERS = new Set(['precisos', 'ganados', 'logrados'])

interface MergedStatCell {
  text: string
  x: number
  width: number
}

function mergeAdjacentCells(cells: PdfCell[]): MergedStatCell[] {
  const sorted = [...cells].sort((a, b) => a.x - b.x)
  const merged: MergedStatCell[] = []
  for (const cell of sorted) {
    const last = merged[merged.length - 1]
    if (last && cell.x - (last.x + last.width) <= ADJACENT_CELL_GAP) {
      last.text = `${last.text} ${cell.text}`.trim()
      last.width = cell.x + cell.width - last.x
    } else {
      merged.push({ text: cell.text, x: cell.x, width: cell.width })
    }
  }
  return merged
}

function parseCompoundMetric(text: string): WyscoutMetricValue {
  const m = text.match(/^(\d+)\s*\/\s*(\d+)\s*(?:(\d+)%)?$/)
  if (!m) {
    const n = Number(text.replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  const [, total, exitosos, pct] = m
  return { total: Number(total), exitosos: Number(exitosos), pct: pct ? Number(pct) : 0 }
}

function parseLeadingInt(text: string): number {
  const m = text.match(/^(\d+)/)
  return m ? Number(m[1]) : 0
}

function parseIntPair(text: string): [number, number] {
  const m = text.match(/^(\d+)\s*\/\s*(\d+)/)
  return m ? [Number(m[1]), Number(m[2])] : [0, 0]
}

/** camelCase sin acentos ni signos, p.ej. "Pases / precisos" -> "pases",
 *  "Duelos aereos / ganados" -> "duelosAereos". */
const DIACRITIC_MARKS = new RegExp('[̀-ͯ]', 'g')

function normalizeKey(label: string): string {
  const cleaned = label
    .normalize('NFD')
    .replace(DIACRITIC_MARKS, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
  if (!cleaned) return ''
  const words = cleaned.split(/\s+/)
  return words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join('')
}

interface StatsColumn {
  center: number
  key: string
  /** Rotulo combinado (antes de normalizar) -- se usa para detectar las
   *  columnas de "Asistencias / xA" y "Tarjetas amarillas / rojas", cuyo
   *  valor no va al diccionario `metrics` sino a los campos propios del
   *  jugador. */
  rawLabel: string
  isJugador: boolean
}

/** Arma las columnas de una tabla de ESTADISTICAS a partir de su fila ancla
 *  (la que contiene la celda "Jugador"), fusionando el rotulo con la(s)
 *  linea(s) de encabezado que tiene encima, alineadas por x. */
function buildStatsColumns(rows: PdfRow[], anchorRowIndex: number): StatsColumn[] {
  const anchorRow = rows[anchorRowIndex]
  const topLineRows = rows.filter(
    r => r.page === anchorRow.page && r.y > anchorRow.y && r.y <= anchorRow.y + HEADER_TOPLINE_MAX_GAP,
  )

  return anchorRow.cells.map(anchorCell => {
    const topTexts: string[] = []
    for (const r of topLineRows) {
      const match = r.cells.find(c => Math.abs(c.x - anchorCell.x) <= HEADER_ALIGN_TOLERANCE)
      if (match) topTexts.push(match.text)
    }

    const anchorText = anchorCell.text
    const isQualifier = GENERIC_STAT_QUALIFIERS.has(anchorText.trim().toLowerCase())
    const rawLabel =
      topTexts.length === 0 ? anchorText : isQualifier ? topTexts.join(' ') : [...topTexts, anchorText].join(' ')

    return {
      center: anchorCell.center,
      key: normalizeKey(rawLabel),
      rawLabel,
      isJugador: /^jugador$/i.test(anchorText),
    }
  })
}

/** Extrae metrics/assists/tarjetas de las paginas "ESTADISTICAS" (3-4 en el
 *  fixture real). Cada pagina puede traer mas de una tabla (p.ej. la pagina 3
 *  trae dos: datos generales y duelos) -- se procesa cada una por separado,
 *  ancladas en su propia fila "Jugador", para no mezclar columnas de tablas
 *  distintas. */
export function extendPlayersWithStats(
  players: WyscoutReportPlayerSeason[],
  statsPageItems: PdfTextItem[],
): WyscoutReportPlayerSeason[] {
  const rows = groupRows(statsPageItems)
  const anchorIndexes: number[] = []
  rows.forEach((r, i) => {
    if (r.cells.some(c => /^jugador$/i.test(c.text))) anchorIndexes.push(i)
  })
  if (anchorIndexes.length === 0) return players

  const byName = new Map(players.map(p => [p.name, { ...p, metrics: { ...p.metrics } }]))

  for (let a = 0; a < anchorIndexes.length; a++) {
    const anchorIdx = anchorIndexes[a]
    const anchorRow = rows[anchorIdx]
    const columns = buildStatsColumns(rows, anchorIdx)
    const centers = columns.map(c => c.center)

    const nextAnchorIdx = anchorIndexes[a + 1] ?? rows.length
    // Las filas entre esta ancla y la siguiente pueden incluir texto ajeno a
    // la tabla (encabezados de la pagina siguiente, numero de pagina al pie)
    // si la proxima tabla esta en otra pagina -- se descarta por "y" (esas
    // filas quedan por encima de la ancla) y, mas abajo, por no tener una
    // celda con el nombre de un jugador conocido.
    const dataRows = rows.slice(anchorIdx + 1, nextAnchorIdx).filter(r => r.y < anchorRow.y)

    for (const row of dataRows) {
      const nameCell = row.cells.find(c => byName.has(c.text))
      if (!nameCell) continue
      const player = byName.get(nameCell.text)!

      const valueCells = row.cells.filter(c => c.x > nameCell.x)
      const merged = mergeAdjacentCells(valueCells)

      for (const cell of merged) {
        const col = nearestColumn(centers, cell.x + cell.width / 2)
        const column = columns[col]
        if (!column || column.isJugador) continue

        if (/^asistencias\s*\/\s*xa/i.test(column.rawLabel)) {
          player.assists = parseLeadingInt(cell.text)
          continue
        }
        if (/^tarjetas\s*amarillas/i.test(column.rawLabel)) {
          const [yellow, red] = parseIntPair(cell.text)
          player.yellowCards = yellow
          player.redCards = red
          continue
        }
        if (!column.key) continue
        player.metrics[column.key] = parseCompoundMetric(cell.text)
      }
    }
  }

  return [...byName.values()]
}

/** Gap maximo en y, en puntos, entre el titulo de una tarjeta de jugador
 *  ("O. Pacheco") y su rotulo de pie ("DIESTRO"/"ZURDO") en la pagina
 *  CONSTRUCCION DEL JUEGO. Verificado contra el fixture real: siempre ~9.8pt. */
const FOOT_LABEL_MAX_GAP = 15
const FOOT_LABEL_X_TOLERANCE = 1

/** Pagina "CONSTRUCCION DEL JUEGO": varias tarjetas de jugador por pagina,
 *  cada una con su nombre como titulo y "DIESTRO"/"ZURDO" debajo, en la misma
 *  columna (mismo x). Cada tarjeta trae ademas una mini-tabla con los
 *  companeros de equipo que mas reciben sus pases -- esos nombres tambien
 *  matchean contra la lista de jugadores, por lo que no alcanza con "el
 *  ultimo nombre visto": hay que aparear cada DIESTRO/ZURDO con el nombre
 *  mas cercano por encima en la MISMA columna (x), no con el ultimo nombre
 *  en orden de lectura. */
export function extendPlayersWithFoot(
  players: WyscoutReportPlayerSeason[],
  buildUpPageItems: PdfTextItem[],
): WyscoutReportPlayerSeason[] {
  const rows = groupRows(buildUpPageItems)

  const nameCells: { name: string; x: number; y: number }[] = []
  const footCells: { foot: 'diestro' | 'zurdo'; x: number; y: number }[] = []

  for (const row of rows) {
    for (const cell of row.cells) {
      if (players.some(p => p.name === cell.text)) {
        nameCells.push({ name: cell.text, x: cell.x, y: row.y })
      } else if (/^diestro$/i.test(cell.text)) {
        footCells.push({ foot: 'diestro', x: cell.x, y: row.y })
      } else if (/^zurdo$/i.test(cell.text)) {
        footCells.push({ foot: 'zurdo', x: cell.x, y: row.y })
      }
    }
  }

  const footByName = new Map<string, 'diestro' | 'zurdo'>()
  for (const foot of footCells) {
    let best: { name: string; y: number } | null = null
    for (const nameCell of nameCells) {
      if (Math.abs(nameCell.x - foot.x) > FOOT_LABEL_X_TOLERANCE) continue
      if (nameCell.y <= foot.y || nameCell.y - foot.y > FOOT_LABEL_MAX_GAP) continue
      if (!best || nameCell.y < best.y) best = nameCell
    }
    if (best) footByName.set(best.name, foot.foot)
  }

  return players.map(p => (footByName.has(p.name) ? { ...p, foot: footByName.get(p.name)! } : p))
}
