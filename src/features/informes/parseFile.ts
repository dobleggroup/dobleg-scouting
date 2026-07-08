import Papa from 'papaparse'
import type { ParsedFile, Row } from './types'

function coerce(v: unknown): string | number {
  if (v == null || v === '') return ''
  if (typeof v === 'number') return v
  const s = String(v).trim()
  if (s === '') return ''
  // Leading-zero identifiers (jersey numbers, codes) stay strings: '007' -> '007'
  if (/^0\d+/.test(s)) return s
  // Unambiguous English number: 1234, -12, 10.5, 10.500
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s)
  // Comma-decimal only: '3,5' -> 3.5
  if (/^-?\d+,\d+$/.test(s)) return Number(s.replace(',', '.'))
  // Anything else (thousands-separated, ambiguous, or text) stays a string —
  // we never guess a magnitude. Non-numeric metric cells become null downstream.
  return s
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
