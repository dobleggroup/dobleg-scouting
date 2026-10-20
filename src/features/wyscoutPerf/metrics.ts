/**
 * Catálogo de métricas de Rendimiento individual. Todas salen de las sumas de
 * las columnas de Wyscout (ver `parsePlayerStats`) y se expresan "por partido"
 * (cada 90 minutos jugados) o en %. Incluye métricas propias que Wyscout no da
 * directo, como regates completados por partido o pérdidas en campo propio.
 */

/** VC = volante central (el 5), MED = volante interno / enganche. */
export type PosGroup = 'ARQ' | 'DEF' | 'LAT' | 'VC' | 'MED' | 'EXT' | 'DEL'

export const POS_GROUP_LABEL: Record<PosGroup, { one: string; many: string }> = {
  ARQ: { one: 'arquero', many: 'arqueros' },
  DEF: { one: 'central', many: 'centrales' },
  LAT: { one: 'lateral', many: 'laterales' },
  VC: { one: 'volante central', many: 'volantes centrales' },
  MED: { one: 'volante interno', many: 'volantes internos' },
  EXT: { one: 'extremo', many: 'extremos' },
  DEL: { one: 'delantero', many: 'delanteros' },
}

/** Sumas de un período (un mes, una temporada…) de un jugador. */
export interface Totals {
  matches: number
  minutes: number
  s: Record<string, number>
}

export type MetricCategory = 'ataque' | 'creacion' | 'regate' | 'pase' | 'defensa' | 'cuidado'

export const CATEGORY_LABEL: Record<MetricCategory, string> = {
  ataque: 'Ataque',
  creacion: 'Creación',
  regate: 'Regate',
  pase: 'Pase',
  defensa: 'Defensa',
  cuidado: 'Cuidado de la pelota',
}

export interface MetricDef {
  key: string
  /** Nombre corto para gráficos y listas. */
  label: string
  /** Cómo se lee en una frase: "regates completados". */
  phrase: string
  /** Explicación de una línea para los jefes. */
  hint: string
  /** % = porcentaje, pp = por partido (cada 90'), n = total del período. */
  unit: '%' | 'pp' | 'n'
  category: MetricCategory
  lowerIsBetter?: boolean
  /** Posiciones donde la métrica importa. */
  groups: PosGroup[]
  /** Métrica principal: aparece primero y en Inicio. */
  headline?: boolean
  /** Puede ser negativa (goles − xG): sirve para gráficos, no para frases de "subió/bajó". */
  signed?: boolean
  /** En los %, la columna de intentos (para no sacar conclusiones con pocos). */
  tries?: string
  compute: (t: Totals) => number | null
}

const ALL: PosGroup[] = ['DEF', 'LAT', 'VC', 'MED', 'EXT', 'DEL']
// Goles, xG y remates no importan en centrales ni volantes centrales.
const ATTACK: PosGroup[] = ['MED', 'EXT', 'DEL']
// Los pases no importan en extremos ni delanteros (sólo asistencias a tiro y xA).
const BUILD: PosGroup[] = ['DEF', 'LAT', 'VC', 'MED']
const WIDE: PosGroup[] = ['LAT', 'EXT']

const v = (t: Totals, k: string) => t.s[k] ?? 0
/** Por partido = cada 90 minutos. */
const p90 = (k: string) => (t: Totals) => (t.minutes > 0 ? (v(t, k) / t.minutes) * 90 : null)
/** Porcentaje logrado, con un mínimo de intentos para no exagerar con 2 intentos. */
const pct = (k: string, minTries = 10) => (t: Totals) => {
  const tries = v(t, k)
  return tries >= minTries ? (v(t, `${k}_ok`) / tries) * 100 : null
}

export const METRICS: MetricDef[] = [
  // ── Ataque ──
  { key: 'goles_90', label: 'Goles', phrase: 'goles', hint: 'Goles por partido. El Excel de Wyscout no separa los de penal, así que están incluidos.',
    unit: 'pp', category: 'ataque', groups: ATTACK, headline: true, compute: p90('goles') },
  { key: 'goles_tot', label: 'Goles (total)', phrase: 'goles', hint: 'Goles convertidos en el período.',
    unit: 'n', category: 'ataque', groups: ATTACK, compute: t => v(t, 'goles') },
  { key: 'xg_90', label: 'Goles esperados (xG)', phrase: 'goles esperados (xG)', hint: 'Calidad de las chances que tiene, por partido. Si es alto y no hace goles, está fallando.',
    unit: 'pp', category: 'ataque', groups: ATTACK, compute: p90('xg') },
  { key: 'xg_tot', label: 'xG (total)', phrase: 'goles esperados', hint: 'Suma de la calidad de todas sus chances en el período.',
    unit: 'n', category: 'ataque', groups: ATTACK, compute: t => v(t, 'xg') },
  { key: 'goles_menos_xg', label: 'Goles − xG', phrase: 'definición', hint: 'Positivo = hace más goles de los que "debería" por las chances que tuvo. Negativo = falla chances.',
    unit: 'pp', category: 'ataque', groups: ['DEL'], signed: true,
    compute: t => (t.minutes >= 450 ? ((v(t, 'goles') - v(t, 'xg')) / t.minutes) * 90 : null) },
  { key: 'tiros_90', label: 'Remates', phrase: 'remates', hint: 'Remates por partido (al arco o afuera).',
    unit: 'pp', category: 'ataque', groups: ATTACK, compute: p90('tiros') },

  // ── Creación ──
  { key: 'asist_tot', label: 'Asistencias (total)', phrase: 'asistencias', hint: 'Asistencias en el período.',
    unit: 'n', category: 'creacion', groups: ['LAT', 'VC', 'MED', 'EXT', 'DEL'], compute: t => v(t, 'asistencias') },
  { key: 'xa_90', label: 'Asistencias esperadas (xA)', phrase: 'asistencias esperadas (xA)', hint: 'Calidad de los pases que deja para gol, aunque el compañero no la meta.',
    unit: 'pp', category: 'creacion', groups: ['LAT', 'MED', 'EXT', 'DEL'], headline: true, compute: p90('xa') },
  { key: 'pases_clave_90', label: 'Asistencias a tiro', phrase: 'asistencias a tiro', hint: 'Pases después de los cuales un compañero remata, por partido.',
    unit: 'pp', category: 'creacion', groups: ['LAT', 'MED', 'EXT', 'DEL'], headline: true, compute: p90('asistencias_a_tiro') },
  { key: 'profundidad_ok_90', label: 'Pases en profundidad precisos', phrase: 'pases en profundidad precisos', hint: 'Pases filtrados a la espalda de la defensa que llegan, por partido.',
    unit: 'pp', category: 'creacion', groups: ['VC', 'MED'], compute: p90('pases_en_profundidad_ok') },
  { key: 'centros_ok_90', label: 'Centros precisos', phrase: 'centros precisos', hint: 'Centros que encuentran a un compañero, por partido.',
    unit: 'pp', category: 'creacion', groups: WIDE, compute: p90('centros_ok') },

  // ── Regate y duelos ofensivos ──
  { key: 'regates_ok_90', label: 'Gambetas completadas', phrase: 'gambetas completadas', hint: 'Gambetas que le salieron, por partido.',
    unit: 'pp', category: 'regate', groups: ['LAT', 'MED', 'EXT', 'DEL'], headline: true, compute: p90('regates_ok') },
  { key: 'regates_pct', label: '% regates que salen', phrase: 'efectividad en el regate', hint: 'De cada 100 regates que intenta, cuántos le salen.',
    unit: '%', category: 'regate', groups: ['LAT', 'MED', 'EXT', 'DEL'], tries: 'regates', compute: pct('regates') },
  { key: 'duelos_of_ok_90', label: 'Duelos ofensivos ganados', phrase: 'duelos ofensivos ganados', hint: 'Mano a mano atacando que gana, por partido.',
    unit: 'pp', category: 'regate', groups: ['LAT', 'MED', 'EXT', 'DEL'], compute: p90('duelos_ofensivos_ok') },
  { key: 'duelos_of_pct', label: '% duelos ofensivos ganados', phrase: 'efectividad en duelos ofensivos', hint: 'De cada 100 mano a mano atacando, cuántos gana.',
    unit: '%', category: 'regate', groups: ['LAT', 'MED', 'EXT', 'DEL'], tries: 'duelos_ofensivos', compute: pct('duelos_ofensivos', 15) },

  // ── Pase ──
  { key: 'pases_pct', label: '% pases buenos', phrase: 'efectividad de pase', hint: 'De cada 100 pases, cuántos llegan.',
    unit: '%', category: 'pase', groups: BUILD, tries: 'pases', compute: pct('pases', 50) },
  { key: 'adelante_90', label: 'Pases hacia adelante', phrase: 'pases hacia adelante', hint: 'Pases que intenta hacia adelante, por partido.',
    unit: 'pp', category: 'pase', groups: BUILD, compute: p90('pases_hacia_adelante') },
  { key: 'adelante_ok_90', label: 'Pases hacia adelante precisos', phrase: 'pases hacia adelante precisos', hint: 'Pases hacia adelante que llegan, por partido.',
    unit: 'pp', category: 'pase', groups: BUILD, headline: true, compute: p90('pases_hacia_adelante_ok') },
  { key: 'adelante_pct', label: '% pases hacia adelante buenos', phrase: 'efectividad en pases hacia adelante', hint: 'De cada 100 pases hacia adelante, cuántos llegan.',
    unit: '%', category: 'pase', groups: BUILD, tries: 'pases_hacia_adelante', compute: pct('pases_hacia_adelante', 30) },
  { key: 'largos_pct', label: '% pases largos buenos', phrase: 'efectividad en pases largos', hint: 'De cada 100 pelotazos, cuántos llegan.',
    unit: '%', category: 'pase', groups: BUILD, tries: 'pases_largos', compute: pct('pases_largos', 15) },

  // ── Defensa ──
  { key: 'duelos_pct', label: '% duelos ganados', phrase: 'duelos ganados', hint: 'De cada 100 mano a mano (en ataque y defensa), cuántos gana.',
    unit: '%', category: 'defensa', groups: ALL, headline: true, tries: 'duelos', compute: pct('duelos', 30) },
  { key: 'duelos_def_pct', label: '% duelos defensivos ganados', phrase: 'efectividad defendiendo mano a mano', hint: 'De cada 100 duelos defendiendo, cuántos gana.',
    unit: '%', category: 'defensa', groups: ['DEF', 'LAT', 'VC', 'MED'], headline: true, tries: 'duelos_defensivos', compute: pct('duelos_defensivos', 15) },
  { key: 'aereos_pct', label: '% duelos aéreos ganados', phrase: 'juego aéreo', hint: 'De cada 100 pelotas divididas por arriba, cuántas gana.',
    unit: '%', category: 'defensa', groups: ['DEF', 'DEL'], tries: 'duelos_aereos', compute: pct('duelos_aereos', 10) },
  { key: 'entradas_90', label: 'Entradas', phrase: 'entradas', hint: 'Entradas (quites a ras del piso), por partido.',
    unit: 'pp', category: 'defensa', groups: ['DEF', 'LAT', 'VC', 'MED'], compute: p90('entradas_a_ras_de_suelo') },
]

export const METRIC_BY_KEY: Record<string, MetricDef> = Object.fromEntries(METRICS.map(m => [m.key, m]))

/** Métricas que importan para una posición, primero las principales. */
export function metricsFor(group: PosGroup | null): MetricDef[] {
  const list = group ? METRICS.filter(m => m.groups.includes(group)) : METRICS
  return [...list].sort((a, b) => Number(!!b.headline) - Number(!!a.headline))
}

/** Código de posición de Wyscout ("RCMF3", "LAMF") → grupo. */
export function posGroupOf(code: string): PosGroup | null {
  const c = code.trim().toUpperCase().replace(/\d+$/, '')
  if (!c) return null
  if (c === 'GK') return 'ARQ'
  if (['CB', 'LCB', 'RCB'].includes(c)) return 'DEF'
  if (['LB', 'RB', 'LWB', 'RWB'].includes(c)) return 'LAT'
  // El enganche (AMF) cuenta como volante, como en la ficha; extremo = el que juega por afuera.
  if (['DMF', 'LDMF', 'RDMF'].includes(c)) return 'VC'
  if (['CMF', 'LCMF', 'RCMF', 'AMF'].includes(c)) return 'MED'
  if (['LAMF', 'RAMF', 'LW', 'RW', 'LWF', 'RWF'].includes(c)) return 'EXT'
  if (['CF', 'SS', 'ST'].includes(c)) return 'DEL'
  return null
}

/**
 * Grupo de posición de un jugador: el de más partidos jugados (la primera
 * posición que lista Wyscout en cada partido es la principal).
 */
export function dominantGroup(positions: Array<string | null | undefined>): PosGroup | null {
  const count = new Map<PosGroup, number>()
  for (const p of positions) {
    const first = (p ?? '').split(',')[0]
    const g = posGroupOf(first)
    if (g) count.set(g, (count.get(g) ?? 0) + 1)
  }
  let best: PosGroup | null = null
  let n = 0
  for (const [g, c] of count) if (c > n) { best = g; n = c }
  return best
}

export function addTotals(a: Totals, b: Totals): Totals {
  const s = { ...a.s }
  for (const [k, val] of Object.entries(b.s)) s[k] = (s[k] ?? 0) + val
  return { matches: a.matches + b.matches, minutes: a.minutes + b.minutes, s }
}

export const EMPTY_TOTALS: Totals = { matches: 0, minutes: 0, s: {} }

/** " por partido" para las métricas por 90', nada para % y totales. */
/** "Goles esperados (xG)" → "goles esperados (xG)": no rompe las siglas. */
export function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1)
}

export function unitSuffix(m: MetricDef): string {
  return m.unit === 'pp' ? ' por partido' : ''
}

/** Las que sirven para comparar períodos o jugadores con distintos minutos (no los totales). */
export const isRate = (m: MetricDef) => m.unit !== 'n'

/** "1,7" / "48%" con coma decimal, como se lee en Argentina. */
export function fmtMetric(m: MetricDef, value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  if (m.unit === '%') return `${Math.round(value)}%`
  if (m.unit === 'n') return value.toLocaleString('es-AR', { maximumFractionDigits: Number.isInteger(value) ? 0 : 1 })
  const abs = Math.abs(value)
  const digits = abs >= 10 ? 0 : abs >= 1 ? 1 : 2
  return value.toLocaleString('es-AR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
