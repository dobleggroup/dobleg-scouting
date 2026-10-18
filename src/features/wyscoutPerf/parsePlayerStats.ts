/**
 * Lee los Excel "Player stats <Jugador>.xlsx" que exporta Wyscout: una fila por
 * partido y ~60 columnas. Los encabezados "X / Y" seguidos de una columna vacía
 * son pares (intentos / logrados): se guardan como `x` y `x_ok`.
 */

export interface WyscoutMatchRow {
  date: string          // YYYY-MM-DD
  label: string         // "Unión Santa Fe - Tigre 1:0"
  competition: string | null
  position: string | null
  minutes: number
  stats: Record<string, number>
}

export interface ParsedPlayerStats {
  /** Nombre que trae el archivo ("J. Paradela"), sacado del nombre del archivo. */
  fileNamePlayer: string | null
  matches: WyscoutMatchRow[]
  /** Partidos que el archivo traía repetidos (misma fecha y mismo partido) y se dejaron una sola vez. */
  duplicates: Array<{ date: string; label: string }>
  /** Etiqueta legible de cada clave de `stats` ("pases_ok" → "Pases logrados"). */
  labels: Record<string, string>
}

const CONTEXT = {
  match: ['partido', 'match'],
  competition: ['competition', 'competicion'],
  date: ['date', 'fecha'],
  position: ['posicion especifica', 'position'],
  minutes: ['minutos jugados', 'minutes played'],
}

export function normLabel(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/�/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** "Pases en el último tercio / logrados" → "pases_en_el_ultimo_tercio". */
export function statKey(label: string): string {
  return normLabel(label.split('/')[0]).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

/** Nombre en castellano de cada columna de Wyscout (en la base sólo queda la clave). */
const WYSCOUT_LABELS: Record<string, string> = {
  acciones_totales: 'Acciones totales', goles: 'Goles', asistencias: 'Asistencias', tiros: 'Tiros', xg: 'xG',
  pases: 'Pases', pases_largos: 'Pases largos', centros: 'Centros', regates: 'Regates', duelos: 'Duelos',
  duelos_aereos: 'Duelos aéreos', interceptaciones: 'Interceptaciones', balones_perdidos: 'Balones perdidos',
  balones_recuperados: 'Balones recuperados', tarjeta_amarilla: 'Tarjeta amarilla', tarjeta_roja: 'Tarjeta roja',
  duelos_defensivos: 'Duelos defensivos', duelos_por_balon_perdido: 'Duelos por balón perdido',
  entradas_a_ras_de_suelo: 'Entradas a ras de suelo', despejes: 'Despejes', faltas: 'Faltas',
  tarjetas_amarillas: 'Tarjetas amarillas', tarjetas_rojas: 'Tarjetas rojas', asistencias_a_tiro: 'Asistencias a tiro',
  duelos_ofensivos: 'Duelos ofensivos', toques_en_el_area_de_penalti: 'Toques en el área de penalti',
  fuera_de_juego: 'Fuera de juego', carreras_en_profundidad: 'Carreras en profundidad', faltas_recibidas: 'Faltas recibidas',
  pases_en_profundidad: 'Pases en profundidad', xa: 'xA', second_assists: 'Second assists',
  pases_en_el_ultimo_tercio: 'Pases en el último tercio', pases_hacia_el_area_de_penalti: 'Pases hacia el área de penalti',
  pases_recibidos: 'Pases recibidos', pases_hacia_adelante: 'Pases hacia adelante', pases_hacia_atras: 'Pases hacia atrás',
}
/** Orden de las columnas en el Excel (la base devuelve las claves en otro orden). */
export const WYSCOUT_COLUMN_ORDER = Object.keys(WYSCOUT_LABELS)

const PAIR_SUFFIX: Record<string, string> = {
  duelos: 'ganados', duelos_aereos: 'ganados', duelos_defensivos: 'ganados', duelos_por_balon_perdido: 'ganados',
  duelos_ofensivos: 'ganados', centros: 'precisos', pases_hacia_el_area_de_penalti: 'precisos',
  balones_perdidos: 'propia mitad', balones_recuperados: 'mitad adv.', acciones_totales: 'logradas',
  entradas_a_ras_de_suelo: 'logradas',
}

/** "duelos_aereos" → "Duelos aéreos" (o "Duelos aéreos / ganados" si es un par). */
export function wyscoutLabel(key: string, pair = false): string {
  const base = WYSCOUT_LABELS[key] ?? key.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())
  return pair ? `${base} / ${PAIR_SUFFIX[key] ?? 'logrados'}` : base
}

function toNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const n = parseFloat(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function toIsoDate(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // Fecha serial de Excel.
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000)
    return d.toISOString().slice(0, 10)
  }
  const s = String(v ?? '').trim()
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const dmy = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  return null
}

/** "Player stats J. Paradela (5).xlsx" → "J. Paradela". */
export function playerFromFileName(fileName: string): string | null {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/\s*\(\d+\)\s*$/, '').trim()
  const m = base.match(/^player stats\s+(.+)$/i)
  return (m ? m[1] : base).trim() || null
}

/** Parte la matriz cruda (fila 0 = encabezados). Pura, para poder probarla. */
export function parsePlayerStatsMatrix(matrix: unknown[][], fileName = ''): ParsedPlayerStats {
  const headers = (matrix[0] ?? []).map(h => String(h ?? '').trim())
  const find = (names: string[]) => headers.findIndex(h => names.includes(normLabel(h)))
  const idx = {
    match: find(CONTEXT.match),
    competition: find(CONTEXT.competition),
    date: find(CONTEXT.date),
    position: find(CONTEXT.position),
    minutes: find(CONTEXT.minutes),
  }
  if (idx.match < 0 || idx.date < 0 || idx.minutes < 0) {
    throw new Error('El archivo no parece un "Player stats" de Wyscout: faltan las columnas Partido, Date o Minutos jugados.')
  }
  const contextIdx = new Set(Object.values(idx).filter(i => i >= 0))

  // Columnas de estadísticas: [clave, índice] incluyendo los "logrados" de cada par.
  const cols: Array<[string, number]> = []
  const labels: Record<string, string> = {}
  for (let i = 0; i < headers.length; i++) {
    const raw = headers[i]
    if (!raw || contextIdx.has(i)) continue
    const key = statKey(raw)
    if (!key) continue
    const isPair = raw.includes('/') && i + 1 < headers.length && headers[i + 1] === ''
    const [noun, done] = raw.split('/').map(s => s.trim())
    cols.push([key, i])
    labels[key] = noun
    if (isPair) {
      cols.push([`${key}_ok`, i + 1])
      labels[`${key}_ok`] = `${noun} ${done}`.trim()
      i++
    }
  }

  const byMatch = new Map<string, WyscoutMatchRow>()
  const duplicates: Array<{ date: string; label: string }> = []
  for (const row of matrix.slice(1)) {
    const label = String(row[idx.match] ?? '').trim()
    const date = toIsoDate(row[idx.date])
    if (!label || !date) continue
    const stats: Record<string, number> = {}
    for (const [key, i] of cols) stats[key] = toNum(row[i])
    const match: WyscoutMatchRow = {
      date,
      label,
      competition: idx.competition >= 0 ? String(row[idx.competition] ?? '').trim() || null : null,
      position: idx.position >= 0 ? String(row[idx.position] ?? '').trim() || null : null,
      minutes: Math.round(toNum(row[idx.minutes])),
      stats,
    }
    // Wyscout a veces lista el mismo partido dos veces (ej. una como Liga y otra como
    // Copa, con números casi iguales). Se queda la versión con más minutos y, si
    // empatan, la de más acciones; guardar las dos haría fallar la carga entera.
    const key = `${date}|${label}`
    const prev = byMatch.get(key)
    if (prev) {
      duplicates.push({ date, label })
      const score = (m: WyscoutMatchRow) => m.minutes * 1e6 + (m.stats.acciones_totales ?? 0)
      if (score(match) <= score(prev)) continue
    }
    byMatch.set(key, match)
  }
  const matches = [...byMatch.values()].sort((a, b) => a.date.localeCompare(b.date))
  return { fileNamePlayer: playerFromFileName(fileName), matches, duplicates, labels }
}

export async function parsePlayerStatsFile(file: File): Promise<ParsedPlayerStats> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '' })
  return parsePlayerStatsMatrix(matrix, file.name)
}
