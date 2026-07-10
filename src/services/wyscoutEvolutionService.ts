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

    const byPlayer = new Map<string, string[][]>()
    for (const r of body) {
      const key = normalizeName(idxJug >= 0 ? (r[idxJug] ?? '') : '')
      if (!key) continue
      if (!byPlayer.has(key)) byPlayer.set(key, [])
      byPlayer.get(key)!.push(r)
    }

    return {
      metrics,
      hasPlayer: (name: string) => byPlayer.has(normalizeName(name)),
      getSeries: (name: string, metricKey: string) => {
        const rows = byPlayer.get(normalizeName(name)) ?? []
        return buildMetricSeries(rows, headers, metricKey)
      },
    }
  })()
  return cache
}
