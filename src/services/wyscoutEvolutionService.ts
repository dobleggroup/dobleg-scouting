import Papa from 'papaparse'
import { SHEET_URLS } from '@/constants/scoring'
import { normalizeName } from '@/utils/scoring'

export interface WyscoutMetric {
  key: string
  label: string
  type: 'simple' | 'ratio'
  unit: '%' | ''
  attemptsIdx: number          // índice de columna (intentos, o valor si simple)
  achievedIdx: number | null   // índice de columna logrados (solo ratio)
}

export interface WyscoutPoint {
  date: string
  matchLabel: string
  competition: string
  value: number | null
}

const CTX_COLS = new Set(['Jugador', 'Partido', 'Competition', 'Date', 'Minutos jugados'])

// Claves de match para un nombre. Tolera "Nombre Apellido", "Apellido" e
// "Inicial. Apellido" (la planilla interno usa la forma corta "J. Paradela",
// la Wyscout el nombre completo "José Paradela"). Devuelve el nombre normalizado
// completo y la clave inicial+apellido ("j paradela").
export function nameKeys(name: string): string[] {
  const norm = normalizeName(name).replace(/\./g, ' ').replace(/\s+/g, ' ').trim()
  if (!norm) return []
  const parts = norm.split(' ')
  const keys = [norm]
  if (parts.length >= 2 && parts[0].length > 0) {
    keys.push(`${parts[0][0]} ${parts[parts.length - 1]}`)
  }
  return keys
}

// key derivado del "noun" (parte antes del "/") para que "Pases / logrados" => "pases".
function slug(label: string): string {
  const noun = label.split('/')[0]
  return normalizeName(noun).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

// A partir de la fila de headers cruda (array), detecta métricas.
// Un label "X / Y" cuya columna siguiente tiene header vacío => métrica de par (ratio).
export function parseMetricSchema(headers: string[]): WyscoutMetric[] {
  const metrics: WyscoutMetric[] = []
  for (let i = 0; i < headers.length; i++) {
    const raw = (headers[i] ?? '').trim()
    if (!raw || CTX_COLS.has(raw)) continue
    const nextEmpty = i + 1 < headers.length && (headers[i + 1] ?? '').trim() === ''
    const isPair = /\s\/\s|\/(precisos|lograd|ganad)/i.test(raw) && nextEmpty
    metrics.push({
      key: slug(raw),
      label: raw,
      type: isPair ? 'ratio' : 'simple',
      unit: isPair ? '%' : '',
      attemptsIdx: i,
      achievedIdx: isPair ? i + 1 : null,
    })
    if (isPair) i++ // saltar la columna consumida
  }
  return metrics
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
  return isNaN(n) ? null : n
}

// rows = matriz cruda (array de arrays) DESPUÉS de la fila de headers.
export function buildMetricSeries(rows: string[][], headers: string[], metricKey: string): WyscoutPoint[] {
  const metric = parseMetricSchema(headers).find(m => m.key === metricKey)
  if (!metric) return []
  const idxPar = headers.indexOf('Partido')
  const idxComp = headers.indexOf('Competition')
  const idxDate = headers.indexOf('Date')
  return rows
    .map(r => {
      const attempts = num(r[metric.attemptsIdx])
      let value: number | null
      if (metric.type === 'ratio' && metric.achievedIdx !== null) {
        const achieved = num(r[metric.achievedIdx])
        value = attempts && attempts > 0 && achieved !== null ? (achieved / attempts) * 100 : null
      } else {
        value = attempts
      }
      return {
        date: idxDate >= 0 ? (r[idxDate] ?? '') : '',
        matchLabel: idxPar >= 0 ? (r[idxPar] ?? '') : '',
        competition: idxComp >= 0 ? (r[idxComp] ?? '') : '',
        value,
      }
    })
    .filter(p => p.date)
    .sort((a, b) => a.date.localeCompare(b.date))
}

// Dirección de la métrica: true = MENOS es mejor (balones perdidos, faltas,
// tarjetas, fuera de juego). El resto (goles, xG, %, duelos ganados, etc.) = más es mejor.
// "Faltas recibidas" es la excepción: recibir faltas es bueno (te hacen falta).
export function metricIsLowerBetter(label: string): boolean {
  const l = label.toLowerCase()
  if (l.includes('recib')) return false
  return /perdid|falta|tarjeta|amarilla|roja|fuera de juego/.test(l)
}

// Agrega una serie por partido en una serie por mes (promedio). El `date` queda
// como el 1º del mes; `matchLabel` indica cuántos partidos entraron en el promedio.
export function aggregateByMonth(series: WyscoutPoint[]): WyscoutPoint[] {
  const groups = new Map<string, { sum: number; count: number }>()
  for (const p of series) {
    if (p.value === null) continue
    const key = (p.date ?? '').slice(0, 7) // YYYY-MM
    if (key.length < 7) continue
    const g = groups.get(key) ?? { sum: 0, count: 0 }
    g.sum += p.value
    g.count++
    groups.set(key, g)
  }
  return Array.from(groups.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, g]) => ({
      date: `${key}-01`,
      matchLabel: `${g.count} ${g.count === 1 ? 'partido' : 'partidos'}`,
      competition: '',
      value: g.sum / g.count,
    }))
}

export interface WyscoutEvolutionData {
  metrics: WyscoutMetric[]
  getSeries(playerName: string, metricKey: string): WyscoutPoint[]
  hasPlayer(playerName: string): boolean
}

let cache: Promise<WyscoutEvolutionData> | null = null

export function loadWyscoutEvolution(): Promise<WyscoutEvolutionData> {
  if (cache) return cache
  cache = (async () => {
    const res = await fetch(SHEET_URLS.wyscoutEvolucion)
    const text = await res.text()
    const parsed = Papa.parse<string[]>(text, { header: false, skipEmptyLines: true })
    const matrix = parsed.data as string[][]
    const headers = (matrix[0] ?? []).map(h => (h ?? '').trim())
    const body = matrix.slice(1)
    const metrics = parseMetricSchema(headers)
    const idxJug = headers.indexOf('Jugador')

    // Agrupar filas por nombre crudo de la planilla.
    const byRawName = new Map<string, string[][]>()
    for (const r of body) {
      const raw = idxJug >= 0 ? (r[idxJug] ?? '') : ''
      if (!raw.trim()) continue
      if (!byRawName.has(raw)) byRawName.set(raw, [])
      byRawName.get(raw)!.push(r)
    }

    // Índice tolerante: cada jugador queda accesible por su nombre completo
    // normalizado y por su clave inicial+apellido.
    const byKey = new Map<string, string[][]>()
    for (const [raw, rows] of byRawName) {
      for (const k of nameKeys(raw)) {
        if (!byKey.has(k)) byKey.set(k, rows)
      }
    }

    const lookup = (name: string): string[][] => {
      for (const k of nameKeys(name)) {
        const rows = byKey.get(k)
        if (rows) return rows
      }
      return []
    }

    return {
      metrics,
      hasPlayer: (name: string) => lookup(name).length > 0,
      getSeries: (name: string, metricKey: string) => buildMetricSeries(lookup(name), headers, metricKey),
    }
  })()
  return cache
}
