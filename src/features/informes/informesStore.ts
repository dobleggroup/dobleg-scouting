import LZString from 'lz-string'
import type { Informe } from './types'

const KEY = 'scout_informes_v1'

// Los informes guardan el dataset completo del Wyscout (rows/headers), que pesa
// mucho. Comprimimos el JSON antes de escribirlo en localStorage (5MB de límite)
// para multiplicar la capacidad ~5-10x. Retrocompatibilidad: los datos viejos se
// guardaban como JSON crudo (empieza con "{"); los detectamos y parseamos directo.
function readAll(): Record<string, Informe> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const json = raw[0] === '{' ? raw : (LZString.decompressFromUTF16(raw) || raw)
    return JSON.parse(json)
  } catch {
    return {}
  }
}
function writeAll(all: Record<string, Informe>): void {
  try {
    localStorage.setItem(KEY, LZString.compressToUTF16(JSON.stringify(all)))
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
      throw new Error('No se pudo guardar: hay demasiados informes guardados. Borrá alguno viejo desde “Mis informes”.')
    }
    throw e
  }
}

export function saveInforme(informe: Informe): void {
  const all = readAll()
  all[informe.id] = informe
  writeAll(all)
}

export function listInformes() {
  return Object.values(readAll())
    .map(i => ({
      id: i.id,
      protagonistIndex: i.protagonistIndex,
      contextoComparacion: i.contextoComparacion,
      updatedAt: i.updatedAt,
      nombre: i.content?.nombre ?? '',
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function loadInforme(id: string): Informe | null {
  return readAll()[id] ?? null
}

export function deleteInforme(id: string): void {
  const all = readAll()
  delete all[id]
  writeAll(all)
}

let counter = 0
export function newInformeId(): string {
  counter += 1
  return `inf_${performance.now().toString(36)}_${counter}`
}
