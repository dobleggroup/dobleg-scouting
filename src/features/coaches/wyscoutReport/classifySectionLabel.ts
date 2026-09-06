import { normalizeForSearch } from '@/lib/search'
import type { PdfTextItem } from '@/lib/pdf/extractPdfItems'

export type SectionLabel =
  | 'jugadores' | 'estadisticas' | 'formaciones' | 'partidos'
  | 'fase_defensiva' | 'construccion_del_juego' | 'ataque' | 'transiciones'
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
    const candidates = pageItems
      .map(it => ({ raw: it.str, label: classifySectionLabel(it.str) }))
      .filter(c => c.label !== 'desconocida')
    if (candidates.length === 0) continue
    result.push({ page, label: candidates[0].label, raw: candidates[0].raw })
  }
  return result.sort((a, b) => a.page - b.page)
}
