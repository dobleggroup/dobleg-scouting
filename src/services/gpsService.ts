import { supabase } from '@/lib/supabase'
import { agencyKey } from '@/services/agencyPlayersService'
import { slugify } from '@/features/gps/parser/normalize'
import type {
  GpsMetric, GpsMetricAlias, GpsEntryRow, GpsEntryInput, GpsMetricCategory,
} from '@/features/gps/types'
import type { AgencyPlayer } from '@/constants/agencyPlayers'
import type { GPSEntry } from '@/types'

/** Clave de identidad del jugador: la misma que videos y agencia. */
export const gpsPlayerKey = agencyKey

/**
 * player_key para el nombre que trae la ficha (`player.Jugador`), que puede venir en
 * formato corto ("J. Postigo") cuando el dato sale de una fuente externa, mientras que
 * la Carga de GPS siempre guarda bajo el `fullName` del roster ("Joaquin Postigo"). Si
 * el nombre coincide (exacto, sin acentos) con el fullName o el shortName de algún
 * jugador del roster DG, resuelve al fullName del roster antes de generar la key.
 */
export function resolveGpsPlayerKey(name: string, roster: AgencyPlayer[]): string {
  const norm = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const target = norm(name)
  const match = roster.find(p => norm(p.fullName) === target || norm(p.shortName) === target)
  return gpsPlayerKey(match?.fullName ?? name)
}

// ─── Catálogo ─────────────────────────────────────────────────────────────────

export async function fetchGpsCatalog(): Promise<{ metrics: GpsMetric[]; aliases: GpsMetricAlias[] }> {
  const [m, a] = await Promise.all([
    supabase.from('gps_metrics').select('*').order('sort_order'),
    supabase.from('gps_metric_aliases').select('*'),
  ])
  if (m.error) console.error('fetchGpsCatalog metrics error:', m.error)
  if (a.error) console.error('fetchGpsCatalog aliases error:', a.error)
  return {
    metrics: (m.data ?? []) as GpsMetric[],
    aliases: (a.data ?? []) as GpsMetricAlias[],
  }
}

export interface NewMetricInput {
  label: string
  unit?: string
  decimals?: number
  category?: GpsMetricCategory
}

export async function createGpsMetric(
  input: NewMetricInput,
  user?: { id?: string; name?: string },
): Promise<GpsMetric | null> {
  const base = slugify(input.label)
  if (!base) return null
  const { data, error } = await supabase.from('gps_metrics').insert({
    key: base,
    label: input.label.trim(),
    unit: input.unit?.trim() ?? '',
    decimals: input.decimals ?? 0,
    category: input.category ?? 'otro',
    sort_order: 900,
    created_by: user?.id ?? null,
    created_by_name: user?.name ?? null,
  }).select().single()

  if (error) {
    // 23505 = la key ya existe: devolver la métrica existente en vez de fallar.
    if (error.code === '23505') {
      const { data: existing } = await supabase.from('gps_metrics').select('*').eq('key', base).single()
      return (existing as GpsMetric) ?? null
    }
    console.error('createGpsMetric error:', error)
    return null
  }
  return data as GpsMetric
}

export async function updateGpsMetric(
  id: number,
  patch: { label?: string; unit?: string; decimals?: number; category?: GpsMetricCategory; is_active?: boolean },
): Promise<boolean> {
  const { error } = await supabase.from('gps_metrics').update(patch).eq('id', id)
  if (error) { console.error('updateGpsMetric error:', error); return false }
  return true
}

/**
 * Borra una métrica del catálogo. Sólo se puede si ninguna carga la usa: borrarla
 * con datos cargados dejaría valores huérfanos en el jsonb, invisibles pero ahí.
 */
export async function deleteGpsMetric(id: number, key: string): Promise<{ ok: boolean; usedBy: number }> {
  const usedBy = await countMetricUsage(key)
  if (usedBy > 0) return { ok: false, usedBy }
  const { error } = await supabase.from('gps_metrics').delete().eq('id', id)
  if (error) { console.error('deleteGpsMetric error:', error); return { ok: false, usedBy: 0 } }
  return { ok: true, usedBy: 0 }
}

/** Cuántas cargas tienen un valor para esa métrica. */
export async function countMetricUsage(key: string): Promise<number> {
  const { count, error } = await supabase
    .from('gps_entries')
    .select('id', { count: 'exact', head: true })
    .not(`metrics->>${key}`, 'is', null)
  if (error) { console.error('countMetricUsage error:', error); return 0 }
  return count ?? 0
}

/** Guarda que una cabecera de PDF corresponde a una métrica. Idempotente. */
export async function addMetricAlias(
  metricId: number,
  alias: string,
  source?: string | null,
): Promise<boolean> {
  const value = alias.trim().toLowerCase()
  if (!value) return false
  const { error } = await supabase
    .from('gps_metric_aliases')
    .upsert({ metric_id: metricId, alias: value, source: source ?? null }, { onConflict: 'alias' })
  if (error) { console.error('addMetricAlias error:', error); return false }
  return true
}

// ─── Entradas ─────────────────────────────────────────────────────────────────

export async function fetchGpsEntries(): Promise<GpsEntryRow[]> {
  const { data, error } = await supabase
    .from('gps_entries')
    .select('*')
    .order('match_date', { ascending: false })
  if (error) { console.error('fetchGpsEntries error:', error); return [] }
  return (data ?? []) as GpsEntryRow[]
}

export interface SaveResult {
  saved: number
  /** Nombres que ya tenían una carga en esa fecha y no se pisaron. */
  conflicts: string[]
  /** Resultado de cada fila efectivamente intentada, mismo orden que `entries`. Si el
   * batch corta por un error "duro" a mitad de camino, las filas no llegadas no
   * aparecen acá. */
  results: Array<'saved' | 'conflict'>
  error: string | null
}

/**
 * Inserta las cargas. Con `replace` pisa la fila existente del mismo jugador y fecha;
 * sin `replace`, las que chocan vuelven en `conflicts` para que la UI pregunte.
 */
/**
 * Métricas que se deducen de otras cuando el informe no las trae: HSR (>21 km/h) =
 * 21-24 + >24, y metros por minuto = distancia ÷ minutos. Nunca pisa un valor del informe.
 */
export function withDerivedMetrics(metrics: Record<string, number>, minutos: number | null): Record<string, number> {
  const out = { ...metrics }
  if (out.hsr == null && out.dist_21_24 != null && out.dist_over_24 != null) out.hsr = out.dist_21_24 + out.dist_over_24
  if (out.metros_por_min == null && out.distancia_total != null && minutos && minutos > 0) {
    out.metros_por_min = Math.round((out.distancia_total / minutos) * 10) / 10
  }
  return out
}

export async function saveGpsEntries(
  entries: GpsEntryInput[],
  opts: { replace?: boolean } = {},
): Promise<SaveResult> {
  if (entries.length === 0) return { saved: 0, conflicts: [], results: [], error: null }

  const { data: { user } } = await supabase.auth.getUser()
  const rows = entries.map(e => ({
    ...e,
    metrics: withDerivedMetrics(e.metrics, e.minutos ?? null),
  })).map(e => ({
    player_key: gpsPlayerKey(e.playerName),
    player_name: e.playerName,
    match_date: e.matchDate,
    equipo: e.equipo ?? null,
    rival: e.rival ?? null,
    competencia: e.competencia ?? null,
    resultado: e.resultado ?? null,
    minutos: e.minutos ?? null,
    metrics: e.metrics,
    source: e.source,
    file_name: e.fileName ?? null,
    created_by: user?.id ?? null,
    created_by_name: (user?.user_metadata?.full_name as string) || user?.email || null,
    updated_at: new Date().toISOString(),
  }))

  if (opts.replace) {
    // El índice único es una expresión (lower(rival)), que PostgREST no puede usar
    // como target de upsert: se borra la carga previa y se inserta de nuevo.
    for (const row of rows) {
      const del = supabase.from('gps_entries').delete()
        .eq('player_key', row.player_key)
        .eq('match_date', row.match_date)
      const { error } = await (row.rival ? del.ilike('rival', row.rival) : del.is('rival', null))
      if (error) { console.error('saveGpsEntries delete error:', error); return { saved: 0, conflicts: [], results: [], error: error.message } }
    }
    const { error } = await supabase.from('gps_entries').insert(rows)
    if (error) { console.error('saveGpsEntries error:', error); return { saved: 0, conflicts: [], results: [], error: error.message } }
    return { saved: rows.length, conflicts: [], results: rows.map(() => 'saved' as const), error: null }
  }

  // Sin replace: se insertan de a una para saber cuáles chocaron.
  const conflicts: string[] = []
  const results: Array<'saved' | 'conflict'> = []
  let saved = 0
  for (const row of rows) {
    const { error } = await supabase.from('gps_entries').insert(row)
    if (!error) { saved++; results.push('saved'); continue }
    if (error.code === '23505') { conflicts.push(row.player_name); results.push('conflict'); continue }
    console.error('saveGpsEntries error:', error)
    return { saved, conflicts, results, error: error.message }
  }
  return { saved, conflicts, results, error: null }
}

export async function updateGpsEntry(
  id: string,
  patch: Partial<Omit<GpsEntryRow, 'id' | 'created_at'>>,
): Promise<boolean> {
  const { error } = await supabase
    .from('gps_entries')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) { console.error('updateGpsEntry error:', error); return false }
  return true
}

export async function deleteGpsEntry(id: string): Promise<boolean> {
  const { error } = await supabase.from('gps_entries').delete().eq('id', id)
  if (error) { console.error('deleteGpsEntry error:', error); return false }
  return true
}

// ─── Helpers de lectura ───────────────────────────────────────────────────────

/** Valores ya usados de un campo, para sugerir en los inputs (rival, competencia…). */
export function distinctValues(
  entries: GpsEntryRow[],
  field: 'rival' | 'competencia' | 'equipo',
): string[] {
  const set = new Set<string>()
  for (const e of entries) {
    const v = e[field]?.trim()
    if (v) set.add(v)
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'es'))
}

/**
 * Adaptador a la forma vieja `GPSEntry`. Lo consume `useInformeEnrichment`, que usa
 * seis métricas canónicas. Sin dato → 0, igual que el Sheet original.
 */
export function toLegacyGpsEntry(row: GpsEntryRow, _metrics: GpsMetric[]): GPSEntry {
  const m = (key: string): number => row.metrics?.[key] ?? 0
  return {
    Jugador: row.player_name,
    Fecha: new Date(`${row.match_date}T00:00:00Z`),
    Equipo: row.equipo ?? '',
    Rival: row.rival ?? '',
    Resultado: row.resultado ?? '',
    Competencia: row.competencia ?? '',
    Minutos: row.minutos ?? 0,
    Distancia: m('distancia_total'),
    MetrosPorMin: m('metros_por_min'),
    Dist16_21: m('dist_16_21'),
    Dist21_24: m('dist_21_24'),
    DistOver24: m('dist_over_24'),
    HSR: m('hsr'),
    VelMax: m('vel_max'),
    Sprints: m('sprints'),
    AltaIntensidad: m('alta_intensidad_pct'),
    Acc2: m('acc_over_2'),
    Dec2: m('dec_over_2'),
    Acc3: m('acc_over_3'),
    Dec3: m('dec_over_3'),
    Acc4: m('acc_over_4'),
    Dec4: m('dec_over_4'),
    PlayerLoad: m('player_load'),
    RHIEBouts: m('rhie_bouts'),
  }
}
