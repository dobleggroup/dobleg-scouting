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
  /** Columnas del Excel de las que depende (alguna): si nunca vinieron, la métrica no se muestra. */
  needs?: string[]
  compute: (t: Totals) => number | null
}

const v = (t: Totals, k: string) => t.s[k] ?? 0
/** Por partido = cada 90 minutos. */
const p90 = (k: string) => (t: Totals) => (t.minutes > 0 ? (v(t, k) / t.minutes) * 90 : null)
/** Porcentaje logrado, con un mínimo de intentos para no exagerar con 2 intentos. */
const pct = (k: string, minTries = 10) => (t: Totals) => {
  const tries = v(t, k)
  return tries >= minTries ? (v(t, `${k}_ok`) / tries) * 100 : null
}
/** Primera de varias columnas posibles que tenga datos (Wyscout cambia nombres según la exportación). */
const firstKey = (t: Totals, keys: string[]) => keys.find(k => k in t.s) ?? null
const p90Any = (keys: string[]) => (t: Totals) => {
  const k = firstKey(t, keys)
  return k && t.minutes > 0 ? (v(t, k) / t.minutes) * 90 : null
}

// Columnas que el Excel "Player stats" actual no trae: las métricas quedan
// listas y aparecen solas cuando el Excel venga con esas columnas.
const PROGRESIVOS = ['pases_progresivos_ok', 'pases_progresivos']
const CARRERAS = ['carreras_en_progresion', 'carreras_progresivas']
const ATAQUE_OK = ['acciones_de_ataque_exitosas', 'acciones_de_ataque_ok', 'acciones_de_ataque_logradas']
const GOLES_SIN_PENAL = ['goles_sin_penaltis', 'goles_sin_penales', 'goles_excepto_penaltis', 'goles_no_penal']

export const METRICS: MetricDef[] = [
  // ── Ataque ──
  { key: 'goles_90', label: 'Goles', phrase: 'goles', hint: 'Goles por partido (con los de penal).',
    unit: 'pp', category: 'ataque', groups: [], compute: p90('goles') },
  { key: 'goles_tot', label: 'Goles (total)', phrase: 'goles', hint: 'Goles convertidos en el período.',
    unit: 'n', category: 'ataque', groups: [], compute: t => v(t, 'goles') },
  { key: 'goles_sin_penal_90', label: 'Goles sin penales', phrase: 'goles sin penales', hint: 'Goles por partido sin contar los de penal.',
    unit: 'pp', category: 'ataque', groups: [], needs: GOLES_SIN_PENAL, compute: p90Any(GOLES_SIN_PENAL) },
  { key: 'goles_menos_xg', label: 'Goles − xG', phrase: 'definición', hint: 'El dato clave del 9. Positivo = hace más goles de los que "debería" por las chances que tuvo. Negativo = falla chances.',
    unit: 'pp', category: 'ataque', groups: [], signed: true,
    compute: t => (t.minutes >= 450 ? ((v(t, 'goles') - v(t, 'xg')) / t.minutes) * 90 : null) },
  { key: 'xg_90', label: 'Goles esperados (xG)', phrase: 'goles esperados (xG)', hint: 'Calidad de las chances que tiene, por partido. Marca si llega a posición de gol.',
    unit: 'pp', category: 'ataque', groups: [], compute: p90('xg') },
  { key: 'xg_tot', label: 'xG (total)', phrase: 'goles esperados', hint: 'Suma de la calidad de todas sus chances en el período.',
    unit: 'n', category: 'ataque', groups: [], compute: t => v(t, 'xg') },
  { key: 'toques_area_90', label: 'Toques en el área rival', phrase: 'toques en el área rival', hint: 'Veces que toca la pelota en el área rival, por partido. Marca llegada.',
    unit: 'pp', category: 'ataque', groups: [], compute: p90('toques_en_el_area_de_penalti') },
  { key: 'tiros_90', label: 'Remates', phrase: 'remates', hint: 'Remates por partido (al arco o afuera).',
    unit: 'pp', category: 'ataque', groups: [], compute: p90('tiros') },

  // ── Creación ──
  { key: 'asist_tot', label: 'Asistencias (total)', phrase: 'asistencias', hint: 'Asistencias en el período.',
    unit: 'n', category: 'creacion', groups: [], compute: t => v(t, 'asistencias') },
  { key: 'xa_90', label: 'Asistencias esperadas (xA)', phrase: 'asistencias esperadas (xA)', hint: 'Calidad de los pases que deja para gol, aunque el compañero no la meta.',
    unit: 'pp', category: 'creacion', groups: [], compute: p90('xa') },
  { key: 'pases_clave_90', label: 'Asistencias a tiro', phrase: 'asistencias a tiro', hint: 'Pases después de los cuales un compañero remata, por partido.',
    unit: 'pp', category: 'creacion', groups: [], compute: p90('asistencias_a_tiro') },
  { key: 'centros_ok_90', label: 'Centros precisos', phrase: 'centros precisos', hint: 'Centros que encuentran a un compañero, por partido.',
    unit: 'pp', category: 'creacion', groups: [], compute: p90('centros_ok') },
  { key: 'profundidad_ok_90', label: 'Pases en profundidad precisos', phrase: 'pases en profundidad precisos', hint: 'Pases filtrados a la espalda de la defensa que llegan, por partido.',
    unit: 'pp', category: 'creacion', groups: [], compute: p90('pases_en_profundidad_ok') },
  { key: 'ataque_ok_90', label: 'Acciones de ataque exitosas', phrase: 'acciones de ataque exitosas', hint: 'Jugadas de ataque que le salen, por partido.',
    unit: 'pp', category: 'creacion', groups: [], needs: ATAQUE_OK, compute: p90Any(ATAQUE_OK) },

  // ── Regate, duelos ofensivos y conducción ──
  { key: 'regates_ok_90', label: 'Gambetas completadas', phrase: 'gambetas completadas', hint: 'Gambetas que le salieron, por partido.',
    unit: 'pp', category: 'regate', groups: [], compute: p90('regates_ok') },
  { key: 'regates_pct', label: '% gambetas que salen', phrase: 'efectividad en la gambeta', hint: 'De cada 100 gambetas que intenta, cuántas le salen.',
    unit: '%', category: 'regate', groups: [], tries: 'regates', compute: pct('regates') },
  { key: 'duelos_of_ok_90', label: 'Duelos ofensivos ganados', phrase: 'duelos ofensivos ganados', hint: 'Mano a mano atacando que gana, por partido.',
    unit: 'pp', category: 'regate', groups: [], compute: p90('duelos_ofensivos_ok') },
  { key: 'duelos_of_pct', label: '% duelos ofensivos ganados', phrase: 'efectividad en duelos ofensivos', hint: 'De cada 100 mano a mano atacando, cuántos gana.',
    unit: '%', category: 'regate', groups: [], tries: 'duelos_ofensivos', compute: pct('duelos_ofensivos', 15) },
  { key: 'carreras_prog_90', label: 'Carreras en progresión', phrase: 'carreras en progresión', hint: 'Veces que avanza llevando la pelota hacia adelante, por partido.',
    unit: 'pp', category: 'regate', groups: [], needs: CARRERAS, compute: p90Any(CARRERAS) },

  // ── Pase ──
  { key: 'pases_pct', label: '% pases buenos', phrase: 'efectividad de pase', hint: 'De cada 100 pases, cuántos llegan.',
    unit: '%', category: 'pase', groups: [], tries: 'pases', compute: pct('pases', 50) },
  { key: 'adelante_90', label: 'Pases hacia adelante', phrase: 'pases hacia adelante', hint: 'Pases que intenta hacia adelante, por partido.',
    unit: 'pp', category: 'pase', groups: [], compute: p90('pases_hacia_adelante') },
  { key: 'adelante_ok_90', label: 'Pases hacia adelante precisos', phrase: 'pases hacia adelante precisos', hint: 'Pases hacia adelante que llegan, por partido.',
    unit: 'pp', category: 'pase', groups: [], compute: p90('pases_hacia_adelante_ok') },
  { key: 'adelante_pct', label: '% pases hacia adelante buenos', phrase: 'efectividad en pases hacia adelante', hint: 'De cada 100 pases hacia adelante, cuántos llegan.',
    unit: '%', category: 'pase', groups: [], tries: 'pases_hacia_adelante', compute: pct('pases_hacia_adelante', 30) },
  { key: 'progresivos_90', label: 'Pases progresivos', phrase: 'pases progresivos', hint: 'Pases que acercan mucho la pelota al arco rival, por partido.',
    unit: 'pp', category: 'pase', groups: [], needs: PROGRESIVOS, compute: p90Any(PROGRESIVOS) },
  { key: 'ultimo_tercio_90', label: 'Pases al último tercio', phrase: 'pases al último tercio', hint: 'Pases precisos que llegan a la zona de ataque, por partido.',
    unit: 'pp', category: 'pase', groups: [], compute: p90('pases_en_el_ultimo_tercio_ok') },
  { key: 'largos_pct', label: '% pases largos buenos', phrase: 'efectividad en pases largos', hint: 'De cada 100 pelotazos, cuántos llegan.',
    unit: '%', category: 'pase', groups: [], tries: 'pases_largos', compute: pct('pases_largos', 15) },

  // ── Defensa ──
  { key: 'duelos_pct', label: '% duelos ganados', phrase: 'duelos ganados', hint: 'De cada 100 mano a mano (en ataque y defensa), cuántos gana.',
    unit: '%', category: 'defensa', groups: [], tries: 'duelos', compute: pct('duelos', 30) },
  { key: 'duelos_def_pct', label: '% duelos defensivos ganados', phrase: 'efectividad defendiendo mano a mano', hint: 'De cada 100 duelos defendiendo, cuántos gana.',
    unit: '%', category: 'defensa', groups: [], tries: 'duelos_defensivos', compute: pct('duelos_defensivos', 15) },
  { key: 'aereos_pct', label: '% duelos aéreos ganados', phrase: 'juego aéreo', hint: 'De cada 100 pelotas divididas por arriba, cuántas gana.',
    unit: '%', category: 'defensa', groups: [], tries: 'duelos_aereos', compute: pct('duelos_aereos', 10) },
  { key: 'entradas_90', label: 'Entradas', phrase: 'entradas', hint: 'Entradas (quites a ras del piso), por partido.',
    unit: 'pp', category: 'defensa', groups: [], compute: p90('entradas_a_ras_de_suelo') },
  { key: 'recuperaciones_90', label: 'Recuperaciones', phrase: 'recuperaciones', hint: 'Pelotas que recupera, por partido.',
    unit: 'pp', category: 'defensa', groups: [], compute: p90('balones_recuperados') },
  { key: 'acciones_def_90', label: 'Acciones defensivas', phrase: 'acciones defensivas', hint: 'Duelos defensivos e intercepciones, por partido: cuánto ayuda a defender.',
    unit: 'pp', category: 'defensa', groups: [],
    compute: t => (t.minutes > 0 ? ((v(t, 'duelos_defensivos') + v(t, 'interceptaciones')) / t.minutes) * 90 : null) },
]

/**
 * Qué mira la agencia en cada posición, en orden: las primeras son las
 * principales (aparecen primero y en Inicio). Definido con el cuerpo técnico
 * (2026-10-23). En todos importan además titularidad, minutos y partidos (eso
 * sale de la participación, no de acá).
 */
const VC_LIST = ['entradas_90', 'duelos_def_pct', 'adelante_pct', 'adelante_ok_90', 'progresivos_90', 'largos_pct', 'recuperaciones_90', 'carreras_prog_90']
const LAT_OFENSIVO = ['duelos_of_ok_90', 'duelos_of_pct', 'regates_ok_90', 'regates_pct', 'carreras_prog_90', 'adelante_ok_90', 'progresivos_90', 'pases_clave_90', 'ataque_ok_90']
const LLEGADA = ['xg_90', 'xa_90', 'toques_area_90']
const uniq = (keys: string[]) => [...new Set(keys)]
export const POSITION_METRICS: Record<PosGroup, string[]> = {
  ARQ: ['pases_pct', 'largos_pct'],
  DEF: ['duelos_def_pct', 'aereos_pct', 'progresivos_90', 'adelante_pct', 'adelante_ok_90', 'ultimo_tercio_90', 'carreras_prog_90', 'largos_pct', 'entradas_90'],
  LAT: uniq(['duelos_def_pct', 'pases_clave_90', 'centros_ok_90', ...LAT_OFENSIVO, ...LLEGADA]),
  VC: VC_LIST,
  MED: uniq([...VC_LIST, ...LAT_OFENSIVO, ...LLEGADA]),
  EXT: ['regates_ok_90', 'pases_clave_90', 'xa_90', 'centros_ok_90', 'duelos_of_ok_90', 'duelos_of_pct', 'regates_pct', 'carreras_prog_90', 'ataque_ok_90', 'goles_90', 'xg_90', 'toques_area_90'],
  DEL: ['goles_menos_xg', 'goles_90', 'goles_sin_penal_90', 'aereos_pct', 'acciones_def_90', 'duelos_of_ok_90', 'duelos_of_pct', 'goles_tot', 'xg_90'],
}
/** Cuántas de cada lista son "principales" (las primeras). */
const HEADLINES = 3

// Cada métrica sabe en qué posiciones importa (y si es principal) a partir de la tabla de arriba.
for (const m of METRICS) {
  m.groups = (Object.keys(POSITION_METRICS) as PosGroup[]).filter(g => POSITION_METRICS[g].includes(m.key))
  m.headline = (Object.keys(POSITION_METRICS) as PosGroup[]).some(g => POSITION_METRICS[g].slice(0, HEADLINES).includes(m.key))
}

// Columnas del Excel presentes en los datos cargados: una métrica que depende
// de una columna que nunca vino (ej. pases progresivos) no se muestra.
let availableStats: Set<string> | null = null
export function setAvailableStats(keys: Iterable<string>) {
  availableStats = new Set(keys)
}
export function hasData(m: MetricDef): boolean {
  return !m.needs || !availableStats || m.needs.some(k => availableStats!.has(k))
}

export const METRIC_BY_KEY: Record<string, MetricDef> = Object.fromEntries(METRICS.map(m => [m.key, m]))

/** Métricas que importan para una posición, en el orden que pidió la agencia. */
export function metricsFor(group: PosGroup | null): MetricDef[] {
  if (!group) return METRICS.filter(m => m.groups.length > 0 && hasData(m))
  return POSITION_METRICS[group].map(k => METRIC_BY_KEY[k]).filter((m): m is MetricDef => !!m && hasData(m))
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
