import { normalizeForSearch } from '@/lib/search'
import type { MetricDef, Row } from './types'

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
  { key: 'passes_acc_pct', label: 'Precisión pases, %', short: 'Pases%', unit: '%', higherIsBetter: true, aliases: ['Precisión pases, %', 'Pass accuracy, %', 'Passes accuracy, %'] },
  { key: 'passes_p90', label: 'Pases /90', short: 'Pases/90', unit: '/90', higherIsBetter: true, aliases: ['Pases/90', 'Passes/90'] },
  { key: 'prog_passes_p90', label: 'Pases progresivos /90', short: 'PProg/90', unit: '/90', higherIsBetter: true, aliases: ['Pases progresivos/90', 'Progressive passes/90'] },
  { key: 'prog_passes_acc_pct', label: 'Precisión pases progresivos, %', short: 'PProg%', unit: '%', higherIsBetter: true, aliases: ['Precisión pases progresivos, %', 'Accurate progressive passes, %'] },
  { key: 'crosses_p90', label: 'Centros /90', short: 'Cent/90', unit: '/90', higherIsBetter: true, aliases: ['Centros/90', 'Crosses/90'] },
  { key: 'crosses_acc_pct', label: 'Precisión centros, %', short: 'Cent%', unit: '%', higherIsBetter: true, aliases: ['Precisión centros, %', 'Accurate crosses, %'] },
  { key: 'interceptions_p90', label: 'Intercepciones /90', short: 'Int/90', unit: '/90', higherIsBetter: true, aliases: ['Intercepciones/90', 'Interceptions/90'] },
  { key: 'losses_p90', label: 'Pérdidas /90', short: 'Perd/90', unit: '/90', higherIsBetter: false, aliases: ['Pérdidas/90', 'Losses/90'] },
  { key: 'goals_conceded_p90', label: 'Goles recibidos /90', short: 'GRec/90', unit: '/90', higherIsBetter: false, aliases: ['Goles recibidos/90', 'Goals conceded/90'] },
  { key: 'def_duels_p90', label: 'Duelos defensivos /90', short: 'DDef/90', unit: '/90', higherIsBetter: true, aliases: ['Duelos defensivos/90', 'Defensive duels/90'] },
  { key: 'def_duels_won_pct', label: 'Duelos defensivos ganados, %', short: 'DDef%', unit: '%', higherIsBetter: true, aliases: ['Duelos defensivos ganados, %', 'Defensive duels won, %'] },
  { key: 'aerial_duels_p90', label: 'Duelos aéreos /90', short: 'DAer/90', unit: '/90', higherIsBetter: true, aliases: ['Duelos aéreos/90', 'Aerial duels/90'] },
  { key: 'aerial_duels_won_pct', label: 'Duelos aéreos ganados, %', short: 'DAer%', unit: '%', higherIsBetter: true, aliases: ['Duelos aéreos ganados, %', 'Aerial duels won, %'] },
  { key: 'touches_box_p90', label: 'Toques en el área /90', short: 'TocA/90', unit: '/90', higherIsBetter: true, aliases: ['Toques en el área/90', 'Touches in box/90'] },
  { key: 'accelerations_p90', label: 'Aceleraciones /90', short: 'Acel/90', unit: '/90', higherIsBetter: true, aliases: ['Aceleraciones/90', 'Accelerations/90'] },
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

// "Lower is better" tokens simples: si el header normalizado los contiene, la métrica es negativa
// (pérdidas, tarjetas, faltas cometidas, etc). `recibid` es ambiguo (faltas recibidas = bueno,
// goles recibidos = malo) así que solo cuenta como negativo si además aparece "gol"/"conced".
const OTHER_LOWER_IS_BETTER_RE = /perdid|cometid|conced|amarilla|roja|tarjeta|fuera de juego|offside|autogol|error/

function isLowerIsBetterHeader(normalizedHeader: string): boolean {
  if (OTHER_LOWER_IS_BETTER_RE.test(normalizedHeader)) return true
  if (/recibid/.test(normalizedHeader) && /(gol|conced)/.test(normalizedHeader)) return true
  return false
}

// Recorta un label largo en un límite ~14 chars respetando el borde de palabra
// (nunca corta a mitad de palabra). Si entra completo, lo devuelve tal cual.
export function compactShort(header: string, maxLen = 14): string {
  const h = header.trim()
  if (h.length <= maxLen) return h
  const window = h.slice(0, maxLen + 1)
  const lastSpace = window.lastIndexOf(' ')
  if (lastSpace > 0) return h.slice(0, lastSpace)
  // Sin espacio cerca del límite: buscar el próximo boundary en vez de partir la palabra
  const nextSpace = h.indexOf(' ', maxLen)
  return nextSpace > 0 ? h.slice(0, nextSpace) : h
}

// Infiere unidad, sentido (higher/lower is better) y short label para una columna
// numérica no reconocida por el catálogo de alias. Pura, testeable en aislado.
export function inferRawMetric(header: string): Pick<MetricDef, 'unit' | 'higherIsBetter' | 'short'> {
  const norm = normalizeHeader(header)
  const words = norm.split(' ').filter(Boolean)

  let unit: MetricDef['unit'] = ''
  if (header.includes('%')) unit = '%'
  else if (words.includes('90')) unit = '/90'
  else if (words.length > 0 && words[words.length - 1] === 'm') unit = 'm'

  const higherIsBetter = !isLowerIsBetterHeader(norm)

  return { unit, higherIsBetter, short: compactShort(header) }
}

// Headers que nunca son métricas numéricas (identidad del jugador)
const NON_METRIC = new Set(['jugador', 'player', 'nombre', 'name', 'equipo', 'team', 'club', 'posicion', 'position', 'pie', 'foot', 'nacionalidad', 'pais', 'id'])

export function buildColumnMap(
  headers: string[],
  rows: Row[] = [],
): { columnMap: Record<string, string>; defs: MetricDef[] } {
  const columnMap: Record<string, string> = {}
  const defs: MetricDef[] = []
  const usedKeys = new Set<string>()

  // Una columna cuenta como métrica si la mayoría de sus celdas no vacías son números.
  // Sin filas (llamada solo-headers) no podemos descartar: se asume numérica.
  const isNumericColumn = (header: string): boolean => {
    if (!rows.length) return true
    let numeric = 0
    let nonEmpty = 0
    for (const r of rows) {
      const v = r[header]
      if (v === '' || v == null) continue
      nonEmpty++
      if (typeof v === 'number' && !Number.isNaN(v)) numeric++
    }
    return nonEmpty > 0 && numeric >= nonEmpty / 2
  }

  for (const h of headers) {
    if (NON_METRIC.has(normalizeHeader(h))) continue
    const matched = matchHeaderToMetric(h)
    if (matched) {
      columnMap[h] = matched.key
      if (!usedKeys.has(matched.key)) {
        usedKeys.add(matched.key)
        defs.push({ ...matched, sourceHeader: h })
      }
      continue
    }
    if (!isNumericColumn(h)) continue // columna de texto -> no es métrica
    let key = rawKey(h)
    let n = 2
    while (usedKeys.has(key)) key = `${rawKey(h)}_${n++}`
    usedKeys.add(key)
    columnMap[h] = key
    const { unit, higherIsBetter, short } = inferRawMetric(h)
    defs.push({ key, label: h, short, unit, higherIsBetter, sourceHeader: h })
  }
  return { columnMap, defs }
}
