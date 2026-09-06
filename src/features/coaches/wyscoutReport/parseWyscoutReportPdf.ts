// src/features/coaches/wyscoutReport/parseWyscoutReportPdf.ts
import { extractPdfItems } from '@/lib/pdf/extractPdfItems'
import type { PdfTextItem } from '@/lib/pdf/extractPdfItems'
import { dedupItems } from './dedupItems'
import { findPageHeaders } from './classifySectionLabel'
import { parsePlayersSection, extendPlayersWithStats, extendPlayersWithFoot } from './parsePlayersSection'
import { parseFormationsSection } from './parseFormationsSection'
import { parseMatchesSection } from './parseMatchesSection'
import { parseEventMaps } from './parseEventMaps'
import { parseSetPieces } from './parseSetPieces'
import { parseZoneGrids } from './parseZoneGrids'
import type { WyscoutReportData, WyscoutEventMap } from './wyscoutReportTypes'

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

// "x" en el que arranca el titulo de cada sub-grafico dentro de una seccion
// de mapas de eventos ("Duelos defensivos ganados en el propio tercio del
// campo", "Centros", "Regates exitosos en el ultimo tercio", etc). Verificado
// contra el fixture real (paginas 16, 18, 19, 22): siempre x=14.4, uno por
// sub-grafico, en el mismo orden de arriba hacia abajo que las etiquetas de
// mitad de cancha que ya usa `parseEventMaps` para generar sus mapas -- por
// eso alcanza con emparejar por INDICE una vez que ambas listas (titulos y
// mapas) estan ordenadas por "y" descendente (`parseEventMaps` ya devuelve
// sus mapas en ese orden porque procesa `halfLabels` ordenados asi).
const SUBSECTION_TITLE_X = 14.4
const SUBSECTION_TITLE_X_TOLERANCE = 2
const HALF_LABEL_RE = /^(PROPIA MITAD|MITAD ADVERSARIA)$/

/**
 * Finding I3 (revision final del branch): `EVENT_MAP_CATEGORIES_BY_SECTION`
 * asigna un category por SECCION de pagina, pero cada pagina puede traer
 * varios sub-graficos apilados (ver Nota 1 de `parseEventMaps`), cada uno
 * normalizado a su PROPIA cancha 0-100 de forma independiente -- agruparlos
 * bajo un solo category hace que la UI (`CoachWyscoutReportPanel`) superponga
 * 2-3 espacios de coordenadas no relacionados sobre una sola cancha.
 *
 * Deriva un category legible y distinto por cada mapa que devuelve
 * `parseEventMaps` para una pagina, usando el titulo real del sub-grafico
 * (ver `SUBSECTION_TITLE_X`) en vez de un sufijo numerico generico, siempre
 * que se pueda emparejar 1 a 1 con la cantidad de mapas encontrados; si no
 * (layout no reconocido), cae a un sufijo indexado sobre el category de la
 * seccion para al menos garantizar que no se mezclen entre si.
 */
function deriveEventMapCategories(
  pageItems: PdfTextItem[],
  maps: WyscoutEventMap[],
  fallbackCategory: string,
): string[] {
  if (maps.length <= 1) return maps.map(() => fallbackCategory)

  const titles = dedupItems(pageItems)
    .filter(i => Math.abs(i.x - SUBSECTION_TITLE_X) < SUBSECTION_TITLE_X_TOLERANCE && !HALF_LABEL_RE.test(i.str))
    .sort((a, b) => b.y - a.y)

  if (titles.length === maps.length) return titles.map(t => t.str)
  return maps.map((_, i) => `${fallbackCategory} ${i + 1}`)
}

/**
 * Finding I4 (revision final del branch): los 8 sub-parsers de abajo estan
 * llenos de non-null assertions sobre estructura de pagina "conocida-buena"
 * (`dateItem!`, `scoreItem!`, etc, ver Tasks 5-13) -- una pagina real futura
 * con un formato inesperado tira una excepcion que, sin este wrapper, se
 * propaga hasta romper la promesa entera y perder TODO el informe (incluidas
 * las secciones que si se pudieron parsear bien), violando la restriccion
 * global del plan: "una pagina/seccion que el parser no puede clasificar va
 * a `warnings: string[]`, nunca tira excepcion ni descarta silenciosamente
 * el resto del informe". `fallback` deja la seccion afectada vacia (o, en el
 * caso de un "extend", sin el enriquecimiento que fallo) en vez de tirar.
 */
function safeSection<T>(name: string, fn: () => T, fallback: T, warnings: string[]): T {
  try {
    return fn()
  } catch (e) {
    warnings.push(`No se pudo procesar la sección "${name}": ${e instanceof Error ? e.message : String(e)}`)
    return fallback
  }
}

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

  let players = safeSection('jugadores', () => parsePlayersSection(itemsForPages(pagesFor('jugadores'))), [], warnings)
  const statsPages = pagesFor('estadisticas')
  if (statsPages.length > 0) {
    players = safeSection(
      'estadísticas (enriquecimiento de jugadores)',
      () => extendPlayersWithStats(players, itemsForPages(statsPages)),
      players,
      warnings,
    )
  }
  const buildUpPages = pagesFor('construccion_del_juego')
  if (buildUpPages.length > 0) {
    players = safeSection(
      'construcción del juego (pie de jugadores)',
      () => extendPlayersWithFoot(players, itemsForPages(buildUpPages)),
      players,
      warnings,
    )
  }

  const formations = safeSection(
    'formaciones',
    () => parseFormationsSection(itemsForPages(pagesFor('formaciones'))),
    [],
    warnings,
  )

  const rosterNames = new Set(players.map(p => p.name))
  const matchPages = pagesFor('partidos')
  const matches = safeSection(
    'partidos',
    () => parseMatchesSection(matchPages.map(p => items.filter(it => it.page === p)), rosterNames),
    [],
    warnings,
  )

  const eventMaps = Object.entries(EVENT_MAP_CATEGORIES_BY_SECTION).flatMap(([section, category]) =>
    pagesFor(section).flatMap(page =>
      safeSection(
        `mapas de eventos (página ${page})`,
        () => {
          const pageItems = items.filter(it => it.page === page)
          const maps = parseEventMaps(pageItems, category)
          const categories = deriveEventMapCategories(pageItems, maps, category)
          return maps.map((m, i) => ({ ...m, category: categories[i] }))
        },
        [],
        warnings,
      ),
    ),
  )

  const setPieces = pagesFor('jugadas_a_balon_parado').flatMap(page =>
    safeSection(`jugadas a balón parado (página ${page})`, () => parseSetPieces(items.filter(it => it.page === page)), [], warnings),
  )

  const zoneGrids = ZONE_GRID_SECTIONS.flatMap(section =>
    pagesFor(section).flatMap(page =>
      safeSection(`grillas de zona (página ${page})`, () => parseZoneGrids(items.filter(it => it.page === page)), [], warnings),
    ),
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
