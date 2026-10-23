import { supabase } from '@/lib/supabase'
import { readPersistentCache, writePersistentCache } from '@/utils/persistentCache'
import type { ParsedPlayerStats } from '@/features/wyscoutPerf/parsePlayerStats'
import type { MonthRow } from '@/features/wyscoutPerf/periods'

export interface WyscoutUploadRow {
  id: number
  player_key: string
  player_name: string
  file_name: string | null
  matches_new: number
  matches_updated: number
  date_from: string | null
  date_to: string | null
  uploaded_by_name: string | null
  uploaded_at: string
}

export interface WyscoutMatchDbRow {
  match_date: string
  match_label: string
  competition: string | null
  position: string | null
  minutes: number
  stats: Record<string, number>
}

const matchId = (date: string, label: string) => `${date}|${label}`

/** Qué partidos del archivo ya estaban cargados (para mostrar nuevos / actualizados antes de guardar). */
export async function previewUpload(playerKey: string, parsed: ParsedPlayerStats) {
  const dates = parsed.matches.map(m => m.date)
  if (!dates.length) return { fresh: 0, updated: 0 }
  const { data, error } = await supabase
    .from('wyscout_player_matches')
    .select('match_date, match_label')
    .eq('player_key', playerKey)
    .gte('match_date', dates[0])
    .lte('match_date', dates[dates.length - 1])
  if (error) throw new Error(error.message)
  const have = new Set((data ?? []).map(r => matchId(r.match_date, r.match_label)))
  const updated = parsed.matches.filter(m => have.has(matchId(m.date, m.label))).length
  return { fresh: parsed.matches.length - updated, updated }
}

/** Guarda un archivo: registra la carga y crea/actualiza cada partido (nunca duplica). */
export async function saveUpload(playerKey: string, playerName: string, fileName: string, parsed: ParsedPlayerStats) {
  const { fresh, updated } = await previewUpload(playerKey, parsed)
  const { data: { user } } = await supabase.auth.getUser()
  const { data: upload, error: upErr } = await supabase
    .from('wyscout_uploads')
    .insert({
      player_key: playerKey,
      player_name: playerName,
      file_name: fileName,
      matches_new: fresh,
      matches_updated: updated,
      date_from: parsed.matches[0]?.date ?? null,
      date_to: parsed.matches[parsed.matches.length - 1]?.date ?? null,
      uploaded_by: user?.id ?? null,
      uploaded_by_name: (user?.user_metadata?.full_name as string) || user?.email || null,
    })
    .select('id')
    .single()
  if (upErr) throw new Error(upErr.message)

  // Un mismo partido dos veces en un envío hace fallar todo el upsert: se deja uno.
  const unique = [...new Map(parsed.matches.map(m => [matchId(m.date, m.label), m])).values()]
  const rows = unique.map(m => ({
    player_key: playerKey,
    player_name: playerName,
    match_date: m.date,
    match_label: m.label,
    competition: m.competition,
    position: m.position,
    minutes: m.minutes,
    stats: m.stats,
    upload_id: upload.id,
    updated_at: new Date().toISOString(),
  }))
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase
      .from('wyscout_player_matches')
      .upsert(rows.slice(i, i + 200), { onConflict: 'club_id,player_key,match_date,match_label' })
    if (error) {
      // Sin partidos guardados la carga no sirve: se borra para que no figure en el historial.
      if (i === 0) await supabase.from('wyscout_uploads').delete().eq('id', upload.id)
      throw new Error(error.message)
    }
  }
  return { uploadId: upload.id as number, fresh, updated }
}

export async function fetchUploads(limit = 200): Promise<WyscoutUploadRow[]> {
  const { data, error } = await supabase
    .from('wyscout_uploads')
    .select('id, player_key, player_name, file_name, matches_new, matches_updated, date_from, date_to, uploaded_by_name, uploaded_at')
    .order('uploaded_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []) as WyscoutUploadRow[]
}

/** Borra una carga y los partidos que quedaron asociados a ella. */
export async function deleteUpload(id: number) {
  const { error: mErr } = await supabase.from('wyscout_player_matches').delete().eq('upload_id', id)
  if (mErr) throw new Error(mErr.message)
  const { error } = await supabase.from('wyscout_uploads').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

let monthlyCache: { at: number; rows: Promise<MonthRow[]> } | null = null

/** Sumas por jugador y mes de toda la agencia (cache 60 s). */
export function fetchMonthly(force = false): Promise<MonthRow[]> {
  if (!force && monthlyCache && Date.now() - monthlyCache.at < 60_000) return monthlyCache.rows
  const rows = (async () => {
    // Supabase devuelve como máximo 1000 filas por pedido: con muchos jugadores
    // (una fila por jugador y mes) se cortaban los últimos en orden alfabético.
    // Se pide en tandas hasta traer todo.
    const PAGE = 1000
    const all: MonthRow[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase.rpc('wyscout_monthly', { p_player_key: null }).range(from, from + PAGE - 1)
      if (error) throw new Error(error.message)
      all.push(...((data ?? []) as MonthRow[]))
      if (!data || data.length < PAGE) break
    }
    const out = all.map(r => ({
      ...r,
      sums: Object.fromEntries(Object.entries(r.sums ?? {}).map(([k, v]) => [k, Number(v)])),
    }))
    void writePersistentCache(MONTHLY_KEY, out)
    return out
  })()
  monthlyCache = { at: Date.now(), rows }
  rows.catch(() => { monthlyCache = null })
  return rows
}

const MONTHLY_KEY = 'wyscout_monthly_v1'
const MINUTES_KEY = 'wyscout_match_minutes_v1'
/** Lo guardado en el navegador se muestra al instante mientras llega lo nuevo. */
const STORED_MAX_AGE = 60 * 24 * 60 * 60 * 1000

/** Última copia guardada en el navegador (null si no hay). */
export function storedMonthly(): Promise<MonthRow[] | null> {
  return readPersistentCache<MonthRow[]>(MONTHLY_KEY, STORED_MAX_AGE)
}

export async function storedMatchMinutes(): Promise<Map<string, MatchMinutes[]> | null> {
  const entries = await readPersistentCache<Array<[string, MatchMinutes[]]>>(MINUTES_KEY, STORED_MAX_AGE)
  return entries ? new Map(entries) : null
}

export function invalidateWyscoutCache() {
  monthlyCache = null
  minutesCache = null
}

/** Partidos de un jugador (para la ficha: evolución partido a partido). */
export async function fetchPlayerMatches(playerKey: string): Promise<WyscoutMatchDbRow[]> {
  const { data, error } = await supabase
    .from('wyscout_player_matches')
    .select('match_date, match_label, competition, position, minutes, stats')
    .eq('player_key', playerKey)
    .order('match_date')
  if (error) throw new Error(error.message)
  return (data ?? []) as WyscoutMatchDbRow[]
}

/** Jugadores con alguna carga desde el 1° del mes actual. */
export function uploadedThisMonth(uploads: WyscoutUploadRow[], today = new Date()): Set<string> {
  const first = new Date(today.getFullYear(), today.getMonth(), 1).toISOString()
  return new Set(uploads.filter(u => u.uploaded_at >= first).map(u => u.player_key))
}

/** Del 1 al 10 de cada mes se avisa si faltan cargas. */
export function isUploadWindow(today = new Date()) {
  return today.getDate() <= 10
}

/** `starter`: si fue titular (lo dice API-Football / Sofascore); sin el dato se estima por los minutos. */
export interface MatchMinutes { date: string; minutes: number; starter?: boolean }

let minutesCache: { at: number; rows: Promise<Map<string, MatchMinutes[]>> } | null = null

/** Minutos de cada partido de cada jugador (para contar titularidades). Cache 60 s. */
export function fetchMatchMinutes(): Promise<Map<string, MatchMinutes[]>> {
  if (minutesCache && Date.now() - minutesCache.at < 60_000) return minutesCache.rows
  const rows = (async () => {
    const out = new Map<string, MatchMinutes[]>()
    const PAGE = 1000
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('wyscout_player_matches')
        .select('player_key, match_date, minutes')
        .order('id')
        .range(from, from + PAGE - 1)
      if (error) throw new Error(error.message)
      for (const r of data ?? []) {
        if (!out.has(r.player_key)) out.set(r.player_key, [])
        out.get(r.player_key)!.push({ date: r.match_date, minutes: r.minutes })
      }
      if (!data || data.length < PAGE) break
    }
    void writePersistentCache(MINUTES_KEY, [...out])
    return out
  })()
  minutesCache = { at: Date.now(), rows }
  rows.catch(() => { minutesCache = null })
  return rows
}
