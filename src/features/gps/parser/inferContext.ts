import { stripAccents } from './normalize'
import type { ParsedContext } from '../types'

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
}

// Tarjetas de reportes en inglés (ej. PlayerTek) traen la fecha así: "Saturday 22
// August 2026". Con año explícito, a diferencia de "25 de Julio" no hace falta
// adivinar el año.
const MONTHS_EN: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
}

const pad = (n: number): string => String(n).padStart(2, '0')

function inferRival(lines: string[]): string | null {
  for (const line of lines) {
    const vs = line.match(/\bvs\.?\s+(.+?)\s*(?:\((?:L|V|H|A)\))?\s*$/i)
    if (vs && vs[1].trim().length <= 40) return vs[1].trim()

    const labeled = line.match(/^rival:\s*(.+)$/i)
    if (labeled && labeled[1].trim().length <= 40) return labeled[1].trim()
  }
  return null
}

function inferDate(lines: string[], today: Date): string | null {
  for (const line of lines) {
    const iso = line.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
    if (iso) return iso[0]

    const dmy = line.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/)
    if (dmy) return `${dmy[3]}-${pad(Number(dmy[2]))}-${pad(Number(dmy[1]))}`

    // "25 de Julio": el PDF no trae año, se usa el más reciente que no sea futuro.
    const es = line.match(/\b(\d{1,2})\s+de\s+([a-zá-úñ]+)/i)
    if (es) {
      const month = MONTHS[stripAccents(es[2]).toLowerCase()]
      if (!month) continue
      const day = Number(es[1])
      let year = today.getUTCFullYear()
      if (Date.UTC(year, month - 1, day) > today.getTime()) year -= 1
      return `${year}-${pad(month)}-${pad(day)}`
    }

    // "Saturday 22 August 2026" (tarjetas tipo PlayerTek): ya trae el año.
    const en = line.match(/\b(\d{1,2})\s+([a-z]+)\s+(\d{4})\b/i)
    if (en) {
      const month = MONTHS_EN[en[2].toLowerCase()]
      if (!month) continue
      return `${en[3]}-${pad(month)}-${pad(Number(en[1]))}`
    }
  }
  return null
}

/**
 * Best effort sobre el texto previo a la tabla. Nunca bloquea: lo que no se puede
 * inferir queda en null y lo completa el usuario en la revisión.
 */
export function inferContext(lines: string[], today: Date = new Date()): ParsedContext {
  return {
    rival: inferRival(lines),
    matchDate: inferDate(lines, today),
    teamText: lines[0]?.trim() || null,
  }
}
