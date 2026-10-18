import { supabase } from '@/lib/supabase'
import { AGENCY_PLAYERS } from '@/constants/agencyPlayers'
import { agencyKey } from '@/services/agencyPlayersService'
import { wyscoutLabel, WYSCOUT_COLUMN_ORDER } from '@/features/wyscoutPerf/parsePlayerStats'
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

const cache = new Map<string, Promise<WyscoutEvolutionData>>()

/** Jugador de la agencia que corresponde a un nombre ("J. Paradela" o "José Paradela"). */
function agencyKeyFor(name: string): string | null {
  const keys = new Set(nameKeys(name))
  const hit = AGENCY_PLAYERS.find(p => [...nameKeys(p.fullName), ...nameKeys(p.shortName)].some(k => keys.has(k)))
  return hit ? agencyKey(hit.fullName) : null
}

/**
 * Datos partido a partido de Wyscout de UN jugador, cargados desde los Excel
 * "Player stats" (página Carga de Wyscout). Antes salían de una planilla de
 * Google Sheets que ya no se usa; la forma de los datos es la misma.
 */
export function loadWyscoutEvolution(playerName: string): Promise<WyscoutEvolutionData> {
  const key = agencyKeyFor(playerName) ?? ''
  const hit = cache.get(key)
  if (hit) return hit
  const promise = (async (): Promise<WyscoutEvolutionData> => {
    const empty: WyscoutEvolutionData = { metrics: [], hasPlayer: () => false, getSeries: () => [] }
    if (!key) return empty
    const { data, error } = await supabase
      .from('wyscout_player_matches')
      .select('match_date, match_label, competition, stats')
      .eq('player_key', key)
      .order('match_date')
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as Array<{ match_date: string; match_label: string; competition: string | null; stats: Record<string, number> }>
    if (!rows.length) return empty

    // Una métrica por columna de Wyscout; si existe "<x>_ok" es un par (intentos / logrados) → %.
    const rank = (k: string) => { const i = WYSCOUT_COLUMN_ORDER.indexOf(k); return i < 0 ? 999 : i }
    const allKeys = [...new Set(rows.flatMap(r => Object.keys(r.stats ?? {})))].sort((a, b) => rank(a) - rank(b))
    const metrics: WyscoutMetric[] = allKeys
      .filter(k => !k.endsWith('_ok'))
      .map((k, i) => {
        const pair = allKeys.includes(`${k}_ok`)
        return {
          key: k,
          label: wyscoutLabel(k, pair),
          type: pair ? 'ratio' as const : 'simple' as const,
          unit: pair ? '%' as const : '' as const,
          attemptsIdx: i,
          achievedIdx: pair ? i : null,
        }
      })
    const keys = new Set(nameKeys(playerName))
    const matches = (name: string) => nameKeys(name).some(k => keys.has(k)) || agencyKeyFor(name) === key

    return {
      metrics,
      hasPlayer: matches,
      getSeries: (name: string, metricKey: string) => {
        if (!matches(name)) return []
        const m = metrics.find(x => x.key === metricKey)
        if (!m) return []
        return rows.map(r => {
          const attempts = r.stats?.[metricKey]
          let value: number | null = attempts ?? null
          if (m.type === 'ratio') {
            const ok = r.stats?.[`${metricKey}_ok`]
            value = attempts && attempts > 0 && ok !== undefined ? (ok / attempts) * 100 : null
          }
          return { date: r.match_date, matchLabel: r.match_label, competition: r.competition ?? '', value }
        })
      },
    }
  })()
  cache.set(key, promise)
  promise.catch(() => cache.delete(key))
  return promise
}
