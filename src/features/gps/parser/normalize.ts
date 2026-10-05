/** Saca los diacríticos (NFD) sin tocar el resto. */
export function stripAccents(s: string): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Etiqueta comparable: minúsculas, sin acentos, espacios colapsados. */
export function normalizeLabel(s: string): string {
  return stripAccents(s).toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Key estable para una métrica nueva. */
export function slugify(s: string): string {
  return stripAccents(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/**
 * Parsea un número de una celda de PDF. Acepta coma decimal ("30,8") y separador
 * de miles ("1.234,5"). Devuelve null si la celda no es un número puro, que es lo
 * que permite distinguir la columna de nombres de las de valores.
 */
export function parseNumber(raw: string | number | null | undefined): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  const s = String(raw ?? '').trim()
  if (!/^-?\d[\d.,]*$/.test(s)) return null

  let t = s
  const lastComma = t.lastIndexOf(',')
  const lastDot = t.lastIndexOf('.')

  if (lastComma > -1 && lastDot > -1) {
    // El separador más a la derecha es el decimal.
    if (lastComma > lastDot) t = t.replace(/\./g, '').replace(',', '.')
    else t = t.replace(/,/g, '')
  } else if (lastComma > -1) {
    // "30,8" es decimal; "1,234" (3 dígitos después) es separador de miles.
    const decimals = t.length - lastComma - 1
    t = decimals === 3 ? t.replace(/,/g, '') : t.replace(',', '.')
  } else if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(t)) {
    // "12.314" / "1.234.567": punto de miles (reportes en castellano). Ninguna
    // métrica de GPS trae tres decimales; "0.512" sigue siendo decimal.
    t = t.replace(/\./g, '')
  }

  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/**
 * Parsea una duración "H:MM:SS" (el "Tiempo de Juego" de los reportes OpenField de
 * Catapult) a minutos. Devuelve null si no matchea el formato.
 */
export function parseDuration(raw: string | null | undefined): number | null {
  const m = String(raw ?? '').trim().match(/^(\d{1,2}):(\d{2}):(\d{2})$/)
  if (!m) return null
  const [, h, mm, ss] = m
  return Number(h) * 60 + Number(mm) + Number(ss) / 60
}
