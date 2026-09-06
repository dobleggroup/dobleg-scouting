// src/features/coaches/wyscoutReport/parseWyscoutReportPdf.ts
import { extractPdfItems } from '@/lib/pdf/extractPdfItems'
import { findPageHeaders } from './classifySectionLabel'
import { parsePlayersSection, extendPlayersWithStats, extendPlayersWithFoot } from './parsePlayersSection'
import { parseFormationsSection } from './parseFormationsSection'
import { parseMatchesSection } from './parseMatchesSection'
import { parseEventMaps } from './parseEventMaps'
import { parseSetPieces } from './parseSetPieces'
import { parseZoneGrids } from './parseZoneGrids'
import type { WyscoutReportData } from './wyscoutReportTypes'

// Secciones cuyas páginas traen mini-canchas con "PROPIA MITAD"/"MITAD
// ADVERSARIA" (ver parseEventMaps, Task 11). "finalizacion" (página 19 del
// fixture real, "FINALIZACIÓN") se agrega acá per el ruling de Task 15: trae
// los tiros/goles del equipo, que caen bajo la categoría "tiros" de los mapas
// de eventos -- aunque, a diferencia de fase_defensiva/ataque, esa página NO
// trae las etiquetas "PROPIA MITAD"/"MITAD ADVERSARIA" (verificado contra el
// fixture real: su gráfico de tiros es una única cancha completa, no dividida
// por mitad), así que `parseEventMaps` no encuentra ningún `halfLabels` ahí y
// devuelve `[]` para esa página -- se deja routeada de todos modos (no rompe
// nada, documenta la intención) en vez de omitirla silenciosamente.
const EVENT_MAP_CATEGORIES_BY_SECTION: Record<string, string> = {
  fase_defensiva: 'duelos_defensivos',
  ataque: 'ataque',
  finalizacion: 'tiros',
}

// Secciones cuyas páginas traen grillas 3x3 de porcentaje por zona (ver
// parseZoneGrids, Task 13). "peligro_constante" (página 21, "PELIGRO
// CONSTANTE") se investigó para esta misma lista (ver ruling de Task 15) pero
// se descartó deliberadamente: sus 3 gráficos ("Regate"/"Pases en
// profundidad"/"Fuera de juego") son tablas de porcentaje POR JUGADOR, no
// grillas de zona de cancha -- correrlas por `parseZoneGrids` produce datos
// contaminados (celdas espurias, conteos que no cierran en 3x3). Se deja la
// lista con un solo elemento a propósito para que la intención quede
// explícita en el código, no solo en el comentario.
const ZONE_GRID_SECTIONS = ['transiciones']

export async function parseWyscoutReportPdf(
  data: ArrayBuffer,
  opts: { fileName: string; matchCountWindow: number; workerSrc?: string },
): Promise<{ report: WyscoutReportData; warnings: string[] }> {
  const items = await extractPdfItems(data, { workerSrc: opts.workerSrc })
  const headers = findPageHeaders(items)
  const warnings: string[] = []

  const pagesFor = (label: string) => headers.filter(h => h.label === label).map(h => h.page)
  const itemsForPages = (pages: number[]) => items.filter(it => pages.includes(it.page))

  for (const h of headers) {
    if (h.label === 'desconocida') warnings.push(`Página ${h.page}: sección no reconocida ("${h.raw}"), se ignoró.`)
  }

  let players = parsePlayersSection(itemsForPages(pagesFor('jugadores')))
  const statsPages = pagesFor('estadisticas')
  if (statsPages.length > 0) players = extendPlayersWithStats(players, itemsForPages(statsPages))
  const buildUpPages = pagesFor('construccion_del_juego')
  if (buildUpPages.length > 0) players = extendPlayersWithFoot(players, itemsForPages(buildUpPages))

  const formations = parseFormationsSection(itemsForPages(pagesFor('formaciones')))

  const rosterNames = new Set(players.map(p => p.name))
  const matchPages = pagesFor('partidos')
  const matches = parseMatchesSection(
    matchPages.map(p => items.filter(it => it.page === p)),
    rosterNames,
  )

  const eventMaps = Object.entries(EVENT_MAP_CATEGORIES_BY_SECTION).flatMap(([section, category]) =>
    pagesFor(section).flatMap(page => parseEventMaps(items.filter(it => it.page === page), category)),
  )

  const setPieces = pagesFor('jugadas_a_balon_parado').flatMap(page =>
    parseSetPieces(items.filter(it => it.page === page)),
  )

  const zoneGrids = ZONE_GRID_SECTIONS.flatMap(section =>
    pagesFor(section).flatMap(page => parseZoneGrids(items.filter(it => it.page === page))),
  )

  const report: WyscoutReportData = {
    sourceFileName: opts.fileName,
    matchCountWindow: opts.matchCountWindow,
    players,
    formations,
    matches,
    eventMaps,
    zoneGrids,
    setPieces,
  }

  if (players.length === 0) warnings.push('No se encontraron jugadores en el informe.')
  if (matches.length === 0) warnings.push('No se encontraron partidos en el informe.')

  return { report, warnings }
}
