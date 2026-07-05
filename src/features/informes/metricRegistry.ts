import { normalizeForSearch } from '@/lib/search'
import type { MetricDef } from './types'

export function normalizeHeader(h: string): string {
  return normalizeForSearch(h)
    .replace(/[/%()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

type MetricSeed = MetricDef & { aliases: string[] }

// Catálogo canónico. `aliases` = variantes de header (se normalizan al comparar).
export const INFORME_METRICS: MetricSeed[] = [
  { key: 'goals', label: 'Goles', short: 'Goles', unit: '', higherIsBetter: true, aliases: ['Goles', 'Goals'] },
  { key: 'xg', label: 'xG', short: 'xG', unit: '', higherIsBetter: true, aliases: ['xG', 'Goles esperados', 'Expected goals'] },
  { key: 'assists', label: 'Asistencias', short: 'Asist', unit: '', higherIsBetter: true, aliases: ['Asistencias', 'Assists'] },
  { key: 'xa', label: 'xA', short: 'xA', unit: '', higherIsBetter: true, aliases: ['xA', 'Asistencias esperadas', 'Expected assists'] },
  { key: 'dribbles_p90', label: 'Regates /90', short: 'Reg/90', unit: '/90', higherIsBetter: true, aliases: ['Regates/90', 'Regates', 'Dribbles/90'] },
  { key: 'dribbles_pct', label: 'Regates completados, %', short: 'Reg%', unit: '%', higherIsBetter: true, aliases: ['Regates realizados, %', 'Regates completados, %', 'Dribbles, %'] },
  { key: 'shots_p90', label: 'Remates /90', short: 'Rem/90', unit: '/90', higherIsBetter: true, aliases: ['Remates/90', 'Tiros/90', 'Shots/90'] },
  { key: 'shots_on_pct', label: 'Tiros a puerta, %', short: 'TP%', unit: '%', higherIsBetter: true, aliases: ['Tiros a puerta, %', 'Remates a puerta, %', 'Shots on target, %'] },
  { key: 'duels_p90', label: 'Duelos /90', short: 'Duel/90', unit: '/90', higherIsBetter: true, aliases: ['Duelos/90', 'Duels/90'] },
  { key: 'duels_won_pct', label: 'Duelos ganados, %', short: 'Duel%', unit: '%', higherIsBetter: true, aliases: ['Duelos ganados, %', 'Duels won, %'] },
  { key: 'tackles_p90', label: 'Entradas /90', short: 'Ent/90', unit: '/90', higherIsBetter: true, aliases: ['Entradas/90', 'Tackles/90'] },
  { key: 'fouls_drawn_p90', label: 'Faltas recibidas /90', short: 'FR/90', unit: '/90', higherIsBetter: true, aliases: ['Faltas recibidas/90', 'Fouls suffered/90'] },
  { key: 'pass_len', label: 'Longitud media pases, m', short: 'LMP', unit: 'm', higherIsBetter: true, aliases: ['Longitud media pases, m', 'Average pass length, m'] },
]

// Índice alias-normalizado -> MetricDef (sin aliases)
const ALIAS_INDEX = new Map<string, MetricDef>()
for (const m of INFORME_METRICS) {
  const { aliases, ...def } = m
  for (const a of aliases) ALIAS_INDEX.set(normalizeHeader(a), def)
}

export function matchHeaderToMetric(header: string): MetricDef | null {
  return ALIAS_INDEX.get(normalizeHeader(header)) ?? null
}

function rawKey(header: string): string {
  return 'raw_' + normalizeHeader(header).replace(/\s+/g, '_')
}

// Headers que nunca son métricas numéricas (identidad del jugador)
const NON_METRIC = new Set(['jugador', 'player', 'nombre', 'name', 'equipo', 'team', 'club', 'posicion', 'position', 'pie', 'foot', 'nacionalidad', 'pais', 'id'])

export function buildColumnMap(headers: string[]): { columnMap: Record<string, string>; defs: MetricDef[] } {
  const columnMap: Record<string, string> = {}
  const defs: MetricDef[] = []
  for (const h of headers) {
    if (NON_METRIC.has(normalizeHeader(h))) continue
    const matched = matchHeaderToMetric(h)
    if (matched) {
      columnMap[h] = matched.key
      defs.push({ ...matched, sourceHeader: h })
    } else {
      const key = rawKey(h)
      columnMap[h] = key
      defs.push({ key, label: h, short: h.slice(0, 8), unit: '', higherIsBetter: true, sourceHeader: h })
    }
  }
  return { columnMap, defs }
}
