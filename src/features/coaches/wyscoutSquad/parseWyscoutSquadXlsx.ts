// src/features/coaches/wyscoutSquad/parseWyscoutSquadXlsx.ts
// Lee el export de jugadores de Wyscout ("Search results"): una hoja, una fila por
// jugador, encabezados en castellano. Las columnas se buscan por nombre (no por
// posicion), asi un export con otro orden o con menos columnas sigue andando.
import { normalizeForSearch } from '@/lib/search'
import type { ParseResult, SquadMetricKey, SquadPlayer } from './wyscoutSquadTypes'

const METRIC_HEADERS: Record<string, SquadMetricKey> = {
  'Partidos jugados': 'matches',
  'Minutos jugados': 'minutes',
  'Goles': 'goals',
  'xG': 'xg',
  'Asistencias': 'assists',
  'xA': 'xa',
  'Duelos/90': 'duels_p90',
  'Duelos ganados, %': 'duels_won_pct',
  'Acciones defensivas realizadas/90': 'def_actions_p90',
  'Duelos defensivos/90': 'def_duels_p90',
  'Duelos defensivos ganados, %': 'def_duels_won_pct',
  'Duelos aéreos en los 90': 'aerial_p90',
  'Duelos aéreos ganados, %': 'aerial_won_pct',
  'Entradas/90': 'tackles_p90',
  'Interceptaciones/90': 'interceptions_p90',
  'Faltas/90': 'fouls_p90',
  'Acciones de ataque exitosas/90': 'att_actions_p90',
  'Goles/90': 'goals_p90',
  'Goles, excepto los penaltis/90': 'npgoals_p90',
  'xG/90': 'xg_p90',
  'Goles de cabeza': 'head_goals',
  'Goles de cabeza/90': 'head_goals_p90',
  'Remates': 'shots',
  'Remates/90': 'shots_p90',
  'Tiros a la portería, %': 'shots_on_pct',
  'Goles hechos, %': 'goal_conv_pct',
  'Asistencias/90': 'assists_p90',
  'Centros/90': 'crosses_p90',
  'Precisión centros, %': 'crosses_acc_pct',
  'Regates/90': 'dribbles_p90',
  'Regates realizados, %': 'dribbles_won_pct',
  'Duelos atacantes/90': 'off_duels_p90',
  'Duelos atacantes ganados, %': 'off_duels_won_pct',
  'Toques en el área de penalti/90': 'box_touches_p90',
  'Carreras en progresión/90': 'prog_runs_p90',
  'Aceleraciones/90': 'accelerations_p90',
  'Pases recibidos /90': 'received_p90',
  'Pases largos recibidos/90': 'long_received_p90',
  'Faltas recibidas/90': 'fouls_suffered_p90',
  'Pases/90': 'passes_p90',
  'Precisión pases, %': 'passes_acc_pct',
  'Pases hacia adelante/90': 'fwd_passes_p90',
  'Precisión pases hacia adelante, %': 'fwd_passes_acc_pct',
  'Pases largos/90': 'long_passes_p90',
  'Precisión pases largos, %': 'long_passes_acc_pct',
  'Longitud media pases, m': 'pass_length_m',
  'xA/90': 'xa_p90',
  'Jugadas claves/90': 'key_passes_p90',
  'Pases en el último tercio/90': 'final_third_passes_p90',
  'Precisión pases en el último tercio, %': 'final_third_acc_pct',
  'Pases en profundidad/90': 'through_passes_p90',
  'Precisión pases en profundidad, %': 'through_acc_pct',
  'Ataque en profundidad/90': 'deep_runs_p90',
  'Centros desde el último tercio/90': 'final_third_crosses_p90',
  'Pases progresivos/90': 'prog_passes_p90',
  'Precisión pases progresivos, %': 'prog_passes_acc_pct',
}

const INFO_HEADERS = {
  name: 'Jugador',
  team: 'Equipo',
  positions: 'Posición específica',
  age: 'Edad',
  birthCountry: 'País de nacimiento',
  passports: 'Pasaporte',
  foot: 'Pie',
  height: 'Altura',
} as const

const REQUIRED = ['Jugador', 'Equipo', 'Minutos jugados', 'Partidos jugados', 'Goles', 'Asistencias']

/** "Pases recibidos /90" y "Pases recibidos/90" cuentan como el mismo encabezado. */
function headerKey(h: string): string {
  return normalizeForSearch(String(h)).replace(/\s*\/\s*/g, '/').replace(/%/g, ' pct').replace(/\s+/g, ' ').trim()
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (s === '' || s === '-') return null
  const n = parseFloat(s.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function toText(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' || s === '-' ? null : s
}

function splitList(v: unknown): string[] {
  const s = toText(v)
  return s ? s.split(',').map(x => x.trim()).filter(Boolean) : []
}

/** "CA Temperley" es Temperley; "Quilmes" no. */
function sameTeam(a: string, b: string): boolean {
  const na = normalizeForSearch(a)
  const nb = normalizeForSearch(b)
  return na === nb || na.split(' ').includes(nb) || nb.split(' ').includes(na)
}

export function parseWyscoutSquadRows(rows: unknown[][], fileName: string, expectedTeam: string): ParseResult {
  const header = (rows[0] ?? []).map(h => headerKey(String(h ?? '')))
  const col = (label: string) => header.indexOf(headerKey(label))

  for (const req of REQUIRED) {
    if (col(req) === -1) {
      return { ok: false, error: `Al archivo le falta la columna "${req}". Exportalo de nuevo desde Wyscout con todas las columnas.` }
    }
  }

  const metricCols = Object.entries(METRIC_HEADERS)
    .map(([label, key]) => ({ key, idx: col(label) }))
    .filter(m => m.idx !== -1)
  const info = Object.fromEntries(Object.entries(INFO_HEADERS).map(([k, label]) => [k, col(label)])) as Record<keyof typeof INFO_HEADERS, number>
  const cell = (row: unknown[], idx: number) => (idx === -1 ? undefined : row[idx])

  const players: SquadPlayer[] = rows.slice(1)
    .filter(r => toText(cell(r, info.name)))
    .map(r => ({
      name: toText(cell(r, info.name))!,
      team: toText(cell(r, info.team)) ?? '',
      positions: splitList(cell(r, info.positions)),
      age: toNumber(cell(r, info.age)),
      birthCountry: toText(cell(r, info.birthCountry)),
      passports: splitList(cell(r, info.passports)),
      foot: toText(cell(r, info.foot)),
      heightCm: toNumber(cell(r, info.height)),
      stats: Object.fromEntries(metricCols.map(m => [m.key, toNumber(r[m.idx])])),
    }))

  if (players.length === 0) return { ok: false, error: 'El archivo no tiene jugadores.' }

  const counts = new Map<string, number>()
  for (const p of players) counts.set(p.team, (counts.get(p.team) ?? 0) + 1)
  const team = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
  if (!sameTeam(team, expectedTeam)) {
    return { ok: false, error: `Este archivo es de ${team}, no de ${expectedTeam}.` }
  }

  return {
    ok: true,
    data: { team: expectedTeam, players, columnsFound: metricCols.map(m => m.key), sourceFileName: fileName },
  }
}

export async function parseWyscoutSquadFile(file: File, expectedTeam: string): Promise<ParseResult> {
  try {
    const XLSX = await import('xlsx')
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    if (!sheet) return { ok: false, error: 'El archivo está vacío.' }
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
    return parseWyscoutSquadRows(rows, file.name, expectedTeam)
  } catch {
    return { ok: false, error: 'No se pudo leer el archivo. Tiene que ser el Excel (.xlsx) que exporta Wyscout.' }
  }
}
