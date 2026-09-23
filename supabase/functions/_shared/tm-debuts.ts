// Página "Debuts" de un jugador en Transfermarkt (/x/debuets/spieler/{id}): una fila por
// competición con la fecha del primer partido, agrupadas por sección ("First Tier",
// "Youth league", "Domestic Cup"...). Se usa para confirmar las alertas de debutantes:
// nuestra base solo conoce los partidos que cargamos, Transfermarkt conoce la carrera entera.

export interface TmDebutEntry {
  section: string
  competition: string
  /** YYYY-MM-DD */
  date: string
}

/** Secciones y competiciones que NO son fútbol profesional de clubes. */
const NON_SENIOR_SECTION = /youth|national/i
const NON_SENIOR_COMPETITION = /\bu-?\d{2}\b|\bsub-?\d{2}\b|proyecci|reserv|youth|juvenil|\bjunior/i

export function parseTmDebuts(html: string): TmDebutEntry[] {
  const start = html.indexOf('responsive-table')
  if (start < 0) return []
  const end = html.indexOf('</table>', start)
  const table = html.slice(start, end < 0 ? undefined : end)
  const entries: TmDebutEntry[] = []
  let section = ''
  for (const [, row] of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const header = row.match(/<td[^>]*colspan="7"[^>]*>([\s\S]*?)<\/td>/)
    if (header) {
      section = clean(header[1])
      continue
    }
    const date = row.match(/(\d{2})\/(\d{2})\/(\d{4})/)
    const competition = row.match(/<a[^>]*title="([^"]+)"/)
    if (!date || !competition) continue
    entries.push({ section, competition: decode(competition[1]), date: `${date[3]}-${date[2]}-${date[1]}` })
  }
  return entries
}

export function isSeniorDebut(e: TmDebutEntry): boolean {
  return !NON_SENIOR_SECTION.test(e.section) && !NON_SENIOR_COMPETITION.test(e.competition)
}

export type DebutVerdict =
  | { status: 'confirmed'; tmDebut: string | null }
  | { status: 'adjusted'; tmDebut: string }
  | { status: 'rejected'; tmDebut: string }

/** Tolerancia: si Transfermarkt tiene un debut profesional hasta 30 días antes (típico: un
 *  partido de copa que no cargamos), sigue siendo debutante y se corrige la fecha. Más atrás
 *  que eso, ya había debutado: la alerta es falsa. */
export const ADJUST_TOLERANCE_DAYS = 30

export function judgeDebut(alertDate: string, entries: TmDebutEntry[]): DebutVerdict {
  const senior = entries.filter(isSeniorDebut).map(e => e.date).sort()
  const first = senior[0] ?? null
  if (!first || first >= alertDate) return { status: 'confirmed', tmDebut: first }
  const days = (Date.parse(alertDate) - Date.parse(first)) / 86_400_000
  return days > ADJUST_TOLERANCE_DAYS ? { status: 'rejected', tmDebut: first } : { status: 'adjusted', tmDebut: first }
}

function clean(s: string): string {
  return decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
}
