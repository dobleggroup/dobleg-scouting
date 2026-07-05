import Papa from 'papaparse'
import type { ParsedFile, Row } from './types'

function coerce(v: unknown): string | number {
  if (v == null || v === '') return ''
  if (typeof v === 'number') return v
  const s = String(v).trim()
  // número con coma o punto decimal
  const normalized = s.replace(/\./g, '').includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
  const n = Number(normalized)
  return normalized !== '' && !Number.isNaN(n) ? n : s
}

export function parseCsv(text: string): ParsedFile {
  const res = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true })
  const grid = res.data as unknown as string[][]
  if (!grid.length) return { headers: [], rows: [] }
  const headers = grid[0].map(h => String(h).trim())
  const rows: Row[] = grid.slice(1).map(cells => {
    const row: Row = {}
    headers.forEach((h, i) => { row[h] = coerce(cells[i]) })
    return row
  })
  return { headers, rows }
}

export function parseXml(text: string): ParsedFile {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('XML inválido')
  // Heurística: el nodo raíz tiene hijos "fila" repetidos; cada fila tiene hijos = columnas.
  const root = doc.documentElement
  const rowEls = Array.from(root.children)
  const headerSet: string[] = []
  const rows: Row[] = rowEls.map(rowEl => {
    const row: Row = {}
    Array.from(rowEl.children).forEach(col => {
      const key = col.tagName
      if (!headerSet.includes(key)) headerSet.push(key)
      row[key] = coerce(col.textContent)
    })
    return row
  })
  return { headers: headerSet, rows }
}

export async function parseXlsxBuffer(buf: ArrayBuffer): Promise<ParsedFile> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const grid = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, blankrows: false })
  if (!grid.length) return { headers: [], rows: [] }
  const headers = (grid[0] as unknown[]).map(h => String(h).trim())
  const rows: Row[] = (grid.slice(1) as unknown[][]).map(cells => {
    const row: Row = {}
    headers.forEach((h, i) => { row[h] = coerce(cells[i]) })
    return row
  })
  return { headers, rows }
}

export async function parseInformeFile(file: File): Promise<ParsedFile> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv')) return parseCsv(await file.text())
  if (name.endsWith('.xml')) return parseXml(await file.text())
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return parseXlsxBuffer(await file.arrayBuffer())
  throw new Error(`Formato no soportado: ${file.name}`)
}
