import { groupRows, nearestColumn } from '@/lib/pdf/groupRows'
import type { PdfTextItem } from '@/lib/pdf/extractPdfItems'
import type { WyscoutReportPlayerSeason } from './wyscoutReportTypes'

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
