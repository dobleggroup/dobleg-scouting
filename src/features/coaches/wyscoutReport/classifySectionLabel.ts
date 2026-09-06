import { normalizeForSearch } from '@/lib/search'
import type { PdfTextItem } from '@/lib/pdf/extractPdfItems'

export type SectionLabel =
  | 'jugadores' | 'estadisticas' | 'formaciones' | 'partidos'
  | 'fase_defensiva' | 'construccion_del_juego' | 'ataque' | 'transiciones'
  | 'finalizacion' | 'peligro_constante'
  | 'jugadas_a_balon_parado' | 'glosario' | 'desconocida'

const KNOWN_LABELS: { match: string; label: SectionLabel }[] = [
  { match: 'jugadores', label: 'jugadores' },
  { match: 'estadisticas', label: 'estadisticas' },
  { match: 'formaciones', label: 'formaciones' },
  { match: 'partidos', label: 'partidos' },
  { match: 'fase defensiva', label: 'fase_defensiva' },
  { match: 'construccion del juego', label: 'construccion_del_juego' },
  { match: 'ataque', label: 'ataque' },
  { match: 'transiciones', label: 'transiciones' },
  // Páginas 19 y 21 del fixture real, no contempladas por el plan/spec original
  // (ver ruling del controller en Task 15): "FINALIZACIÓN" trae los datos de
  // tiros/goles (categoría "tiros" de los mapas de eventos) y "PELIGRO
  // CONSTANTE" trae regates/pases en profundidad/fuera de juego, en el mismo
  // estilo de grillas de zona + tabla de ranking que "TRANSICIONES".
  { match: 'finalizacion', label: 'finalizacion' },
  { match: 'peligro constante', label: 'peligro_constante' },
  { match: 'jugadas a balon parado', label: 'jugadas_a_balon_parado' },
  { match: 'glosario', label: 'glosario' },
]

export function classifySectionLabel(headerText: string): SectionLabel {
  // Wyscout renderiza los títulos de encabezado con letter-spacing real: cada
  // letra llega como un carácter separado por un espacio dentro del mismo string
  // de PDF (p.ej. "J U G A D O R E S", "C O N S T R U C C I Ó N D E L J U E G O").
  // Se compara sin espacios para que tanto ese formato como el texto normal
  // (usado en el test unitario) matcheen contra la misma lista de labels.
  const norm = normalizeForSearch(headerText).replace(/\s+/g, '')
  return KNOWN_LABELS.find(k => norm === k.match.replace(/\s+/g, ''))?.label ?? 'desconocida'
}

/** Encabezado de sección: texto solo en mayúsculas ubicado en el borde superior de
 *  la página (por encima de y=760 en este layout). La página real de este fixture
 *  mide 841.89pt de alto (A4, no Letter/802pt como se asumía inicialmente) y los
 *  títulos de sección aparecen en y≈807-819, muy por encima del umbral — el título
 *  de página siempre va ahí, separado del contenido por una línea horizontal). */
const HEADER_Y_MIN = 760

/** El título de sección real (el que clasifica la página) cae siempre exactamente
 *  en y=807.3 en este layout -- verificado en las 12 páginas conocidas del fixture
 *  real (jugadores, estadísticas, formaciones, partidos, fase_defensiva,
 *  construccion_del_juego, ataque, finalizacion, transiciones, peligro_constante,
 *  jugadas_a_balon_parado, glosario). El boilerplate "INFORME DEL EQUIPO" (y=819.1)
 *  y el nombre del equipo (y=810.9) quedan por encima; los encabezados de columna
 *  de contenido que a veces también superan HEADER_Y_MIN quedan por debajo (<790).
 *  Se usa para identificar el título incluso cuando NO matchea ningún label
 *  conocido (ver `findPageHeaders`), en vez de asumir que el primer item de la
 *  página es el título. */
const TITLE_Y = 807.3
const TITLE_Y_TOLERANCE = 1

export function findPageHeaders(
  items: PdfTextItem[],
): { page: number; label: SectionLabel; raw: string }[] {
  const byPage = new Map<number, PdfTextItem[]>()
  for (const it of items) {
    if (it.y < HEADER_Y_MIN) continue
    if (!byPage.has(it.page)) byPage.set(it.page, [])
    byPage.get(it.page)!.push(it)
  }

  const result: { page: number; label: SectionLabel; raw: string }[] = []
  for (const [page, pageItems] of byPage) {
    // El encabezado también repite "INFORME DEL EQUIPO" y el nombre del equipo
    // ahí arriba -- ninguno de esos matchea KNOWN_LABELS, así que en la práctica
    // queda un único candidato: el título de sección real de esa página.
    const candidates = pageItems.map(it => ({ raw: it.str, label: classifySectionLabel(it.str) }))
    const known = candidates.find(c => c.label !== 'desconocida')
    if (known) {
      result.push({ page, label: known.label, raw: known.raw })
      continue
    }

    // Ninguno de los items del encabezado matcheó una sección conocida. El plan
    // exige que una página no clasificable vaya a `warnings`, nunca se pierda en
    // silencio -- así que igual se reporta la página, con label "desconocida",
    // en vez de omitirla del resultado (bug real: antes de este fix, esta rama
    // simplemente hacía `continue` y la página desaparecía sin dejar rastro).
    // Como `raw` se prefiere el título real de la página (ver `TITLE_Y`) en vez
    // del boilerplate "INFORME DEL EQUIPO"/nombre de equipo, para que el mensaje
    // de warning que arma el orquestador sea legible; si por algún motivo no hay
    // ningún item en esa banda de "y", se usa el primero que haya como último
    // recurso (nunca se descarta la página).
    const titleItem = pageItems.find(it => Math.abs(it.y - TITLE_Y) <= TITLE_Y_TOLERANCE)
    const fallback = titleItem ?? pageItems[0]
    result.push({ page, label: 'desconocida', raw: fallback.str })
  }
  return result.sort((a, b) => a.page - b.page)
}
