/**
 * Catálogo de métricas de Rendimiento individual. Todas salen de las sumas de
 * las columnas de Wyscout (ver `parsePlayerStats`) y se expresan "por partido"
 * (cada 90 minutos jugados) o en %. Incluye métricas propias que Wyscout no da
 * directo, como regates completados por partido o pérdidas en campo propio.
 */

export type PosGroup = 'ARQ' | 'DEF' | 'LAT' | 'MED' | 'EXT' | 'DEL'

export const POS_GROUP_LABEL: Record<PosGroup, { one: string; many: string }> = {
  ARQ: { one: 'arquero', many: 'arqueros' },
  DEF: { one: 'central', many: 'centrales' },
  LAT: { one: 'lateral', many: 'laterales' },
  MED: { one: 'volante', many: 'volantes' },
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
  unit: '%' | 'pp'
  category: MetricCategory
  lowerIsBetter?: boolean
  /** Posiciones donde la métrica importa. */
  groups: PosGroup[]
  /** Métrica principal: aparece primero y en Inicio. */
  headline?: boolean
  /** Puede ser negativa (goles − xG): sirve para gráficos, no para frases de "subió/bajó". */
  signed?: boolean
  compute: (t: Totals) => number | null
}

const ALL: PosGroup[] = ['DEF', 'LAT', 'MED', 'EXT', 'DEL']
const ATTACK: PosGroup[] = ['MED', 'EXT', 'DEL']
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
  // ── Regate ──
  { key: 'regates_ok_90', label: 'Regates completados', phrase: 'regates completados', hint: 'Regates que le salieron, por partido. Vale más que los intentados.',
    unit: 'pp', category: 'regate', groups: ['LAT', 'MED', 'EXT', 'DEL'], headline: true, compute: p90('regates_ok') },
  { key: 'regates_pct', label: '% regates que salen', phrase: 'efectividad en el regate', hint: 'De cada 100 regates que intenta, cuántos le salen.',
    unit: '%', category: 'regate', groups: ['LAT', 'MED', 'EXT', 'DEL'], compute: pct('regates') },
  { key: 'regates_por_perdida', label: 'Regates por pelota perdida', phrase: 'regates completados por cada pelota perdida', hint: 'Cuánto gana encarando contra lo que regala. Más alto = arriesga bien.',
    unit: 'pp', category: 'regate', groups: ['EXT', 'DEL'],
    compute: t => (v(t, 'balones_perdidos') >= 10 ? v(t, 'regates_ok') / v(t, 'balones_perdidos') : null) },

  // ── Ataque ──
  { key: 'goles_90', label: 'Goles', phrase: 'goles', hint: 'Goles por partido.',
    unit: 'pp', category: 'ataque', groups: ATTACK, headline: true, compute: p90('goles') },
  { key: 'xg_90', label: 'Goles esperados (xG)', phrase: 'goles esperados (xG)', hint: 'Calidad de las chances que tiene. Si es alto y no hace goles, está fallando.',
    unit: 'pp', category: 'ataque', groups: ATTACK, compute: p90('xg') },
  { key: 'goles_menos_xg', label: 'Definición (goles − xG)', phrase: 'definición', hint: 'Positivo = hace más goles de los que "debería". Negativo = falla chances.',
    unit: 'pp', category: 'ataque', groups: ['EXT', 'DEL'], signed: true,
    compute: t => (t.minutes >= 450 ? ((v(t, 'goles') - v(t, 'xg')) / t.minutes) * 90 : null) },
  { key: 'tiros_arco_90', label: 'Tiros al arco', phrase: 'tiros al arco', hint: 'Remates que van al arco, por partido.',
    unit: 'pp', category: 'ataque', groups: ATTACK, compute: p90('tiros_ok') },
  { key: 'toques_area_90', label: 'Toques en el área rival', phrase: 'toques en el área rival', hint: 'Cuántas veces la toca dentro del área rival, por partido.',
    unit: 'pp', category: 'ataque', groups: ['LAT', 'EXT', 'DEL', 'MED'], compute: p90('toques_en_el_area_de_penalti') },
  { key: 'carreras_90', label: 'Desmarques en profundidad', phrase: 'desmarques en profundidad', hint: 'Carreras al espacio por partido.',
    unit: 'pp', category: 'ataque', groups: ['LAT', 'EXT', 'DEL'], compute: p90('carreras_en_profundidad') },

  // ── Creación ──
  { key: 'goles_asist_90', label: 'Goles + asistencias', phrase: 'goles más asistencias', hint: 'Participación directa en goles, por partido.',
    unit: 'pp', category: 'creacion', groups: ATTACK, headline: true,
    compute: t => (t.minutes > 0 ? ((v(t, 'goles') + v(t, 'asistencias')) / t.minutes) * 90 : null) },
  { key: 'asist_90', label: 'Asistencias', phrase: 'asistencias', hint: 'Asistencias por partido.',
    unit: 'pp', category: 'creacion', groups: ['LAT', 'MED', 'EXT', 'DEL'], compute: p90('asistencias') },
  { key: 'xa_90', label: 'Asistencias esperadas (xA)', phrase: 'asistencias esperadas (xA)', hint: 'Calidad de los pases que deja para gol, aunque el compañero no la meta.',
    unit: 'pp', category: 'creacion', groups: ['LAT', 'MED', 'EXT', 'DEL'], compute: p90('xa') },
  { key: 'pases_clave_90', label: 'Pases que terminan en tiro', phrase: 'pases que terminan en tiro', hint: 'Pases después de los cuales un compañero patea.',
    unit: 'pp', category: 'creacion', groups: ['LAT', 'MED', 'EXT', 'DEL'], compute: p90('asistencias_a_tiro') },
  { key: 'ult_tercio_ok_90', label: 'Pases buenos al último tercio', phrase: 'pases completados al último tercio', hint: 'Pases que llegan bien a la zona de ataque, por partido.',
    unit: 'pp', category: 'creacion', groups: ['DEF', 'LAT', 'MED', 'EXT'], headline: true, compute: p90('pases_en_el_ultimo_tercio_ok') },
  { key: 'pases_area_ok_90', label: 'Pases buenos al área', phrase: 'pases completados al área', hint: 'Pases que llegan bien dentro del área rival.',
    unit: 'pp', category: 'creacion', groups: ['LAT', 'MED', 'EXT', 'DEL'], compute: p90('pases_hacia_el_area_de_penalti_ok') },
  { key: 'profundidad_ok_90', label: 'Pases en profundidad buenos', phrase: 'pases en profundidad completados', hint: 'Pases filtrados a la espalda de la defensa que llegan.',
    unit: 'pp', category: 'creacion', groups: ['MED', 'EXT', 'DEL'], compute: p90('pases_en_profundidad_ok') },
  { key: 'centros_ok_90', label: 'Centros buenos', phrase: 'centros precisos', hint: 'Centros que encuentran a un compañero, por partido.',
    unit: 'pp', category: 'creacion', groups: WIDE, compute: p90('centros_ok') },

  // ── Pase ──
  { key: 'pases_pct', label: '% pases buenos', phrase: 'precisión de pase', hint: 'De cada 100 pases, cuántos llegan.',
    unit: '%', category: 'pase', groups: ALL, compute: pct('pases', 50) },
  { key: 'adelante_ok_90', label: 'Pases hacia adelante buenos', phrase: 'pases hacia adelante completados', hint: 'Pases que hacen avanzar al equipo, por partido.',
    unit: 'pp', category: 'pase', groups: ['DEF', 'LAT', 'MED'], compute: p90('pases_hacia_adelante_ok') },
  { key: 'largos_pct', label: '% pases largos buenos', phrase: 'precisión en pases largos', hint: 'De cada 100 pelotazos, cuántos llegan.',
    unit: '%', category: 'pase', groups: ['DEF', 'LAT', 'MED'], compute: pct('pases_largos', 15) },
  { key: 'recibidos_90', label: 'Pases recibidos', phrase: 'pases recibidos', hint: 'Cuánto lo buscan los compañeros. Mide participación.',
    unit: 'pp', category: 'pase', groups: ['MED', 'EXT', 'DEL'], compute: p90('pases_recibidos') },

  // ── Defensa ──
  { key: 'duelos_pct', label: '% duelos ganados', phrase: 'duelos ganados', hint: 'De cada 100 mano a mano (en ataque y defensa), cuántos gana.',
    unit: '%', category: 'defensa', groups: ALL, headline: true, compute: pct('duelos', 30) },
  { key: 'duelos_def_ok_90', label: 'Duelos defensivos ganados', phrase: 'duelos defensivos ganados', hint: 'Mano a mano defendiendo que gana, por partido.',
    unit: 'pp', category: 'defensa', groups: ['DEF', 'LAT', 'MED'], compute: p90('duelos_defensivos_ok') },
  { key: 'duelos_def_pct', label: '% duelos defensivos ganados', phrase: 'efectividad defendiendo mano a mano', hint: 'De cada 100 duelos defendiendo, cuántos gana.',
    unit: '%', category: 'defensa', groups: ['DEF', 'LAT', 'MED'], compute: pct('duelos_defensivos', 15) },
  { key: 'aereos_pct', label: '% duelos aéreos ganados', phrase: 'juego aéreo', hint: 'De cada 100 pelotas divididas por arriba, cuántas gana.',
    unit: '%', category: 'defensa', groups: ['DEF', 'MED', 'DEL'], compute: pct('duelos_aereos', 10) },
  { key: 'recup_90', label: 'Pelotas recuperadas', phrase: 'pelotas recuperadas', hint: 'Recuperaciones por partido.',
    unit: 'pp', category: 'defensa', groups: ALL, compute: p90('balones_recuperados') },
  { key: 'recup_rival_90', label: 'Recuperaciones en campo rival', phrase: 'recuperaciones en campo rival', hint: 'Pelotas que roba arriba, cerca del arco rival. Las más valiosas.',
    unit: 'pp', category: 'defensa', groups: ['LAT', 'MED', 'EXT', 'DEL'], headline: true, compute: p90('balones_recuperados_ok') },
  { key: 'intercep_90', label: 'Intercepciones', phrase: 'intercepciones', hint: 'Pases rivales que corta, por partido.',
    unit: 'pp', category: 'defensa', groups: ['DEF', 'LAT', 'MED'], compute: p90('interceptaciones') },
  { key: 'despejes_90', label: 'Despejes', phrase: 'despejes', hint: 'Pelotas que saca de su área, por partido.',
    unit: 'pp', category: 'defensa', groups: ['DEF'], compute: p90('despejes') },

  // ── Cuidado de la pelota ──
  { key: 'perdidas_90', label: 'Pelotas perdidas', phrase: 'pelotas perdidas', hint: 'Pérdidas por partido. Menos es mejor.',
    unit: 'pp', category: 'cuidado', lowerIsBetter: true, groups: ALL, compute: p90('balones_perdidos') },
  { key: 'perdidas_propia_90', label: 'Pérdidas en campo propio', phrase: 'pérdidas en campo propio', hint: 'Las pérdidas peligrosas, cerca del arco propio. Menos es mejor.',
    unit: 'pp', category: 'cuidado', lowerIsBetter: true, groups: ALL, headline: true, compute: p90('balones_perdidos_ok') },
  { key: 'acciones_pct', label: '% acciones logradas', phrase: 'acciones logradas', hint: 'De todo lo que intenta (pases, regates, duelos…), qué porcentaje le sale.',
    unit: '%', category: 'cuidado', groups: ALL, compute: pct('acciones_totales', 50) },
  { key: 'faltas_90', label: 'Faltas cometidas', phrase: 'faltas cometidas', hint: 'Faltas por partido. Menos es mejor.',
    unit: 'pp', category: 'cuidado', lowerIsBetter: true, groups: ALL, compute: p90('faltas') },
  { key: 'faltas_recibidas_90', label: 'Faltas recibidas', phrase: 'faltas recibidas', hint: 'Cuántas veces lo tienen que bajar. Muestra que es difícil de marcar.',
    unit: 'pp', category: 'cuidado', groups: ['MED', 'EXT', 'DEL'], compute: p90('faltas_recibidas') },
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
  if (['DMF', 'LDMF', 'RDMF', 'CMF', 'LCMF', 'RCMF', 'AMF'].includes(c)) return 'MED'
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

/** "1,7" / "48%" con coma decimal, como se lee en Argentina. */
export function fmtMetric(m: MetricDef, value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  if (m.unit === '%') return `${Math.round(value)}%`
  const abs = Math.abs(value)
  const digits = abs >= 10 ? 0 : abs >= 1 ? 1 : 2
  return value.toLocaleString('es-AR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
