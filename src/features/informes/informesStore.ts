import type { Informe } from './types'

const KEY = 'scout_informes_v1'

function readAll(): Record<string, Informe> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} }
}
function writeAll(all: Record<string, Informe>): void {
  localStorage.setItem(KEY, JSON.stringify(all))
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
