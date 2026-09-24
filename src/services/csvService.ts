import Papa from 'papaparse'
import { SHEET_URLS, COLUMN_ALIASES } from '@/constants/scoring'
import type {
  RawRow, RawExternalPlayer, RawInternalPlayer,
  MonitoringPlayer, NormalizedPlayer, EvolutionEntry, SubjectiveMetric,
  TransfermarktData, MarketValueHistoryEntry,
} from '@/types'

// ─── HELPERS ─────────────────────────────────────────────────────────────────

// Normaliza nombres de liga:
// - Corrige caracteres corruptos del Sheet (ej: "2◆◆ Argentina" → "2° Argentina")
// - Normaliza variantes de nombre (ej: "Liga México" / "Liga Mexico" → "Liga MX")
function normalizeLiga(liga: string): string {
  if (!liga) return liga
  let out = liga.replace(/(\d)[^\w\s]+(\s)/g, '$1°$2').trim()
  // Normalizar Liga MX y variantes
  if (/liga\s*m[eé]xico/i.test(out) || /liga\s*mx/i.test(out) || /primera\s*divisi[oó]n\s*m[eé]xico/i.test(out)) {
    out = 'Liga MX'
  }
  return out
}

function trimHeaders(row: RawRow): RawRow {
  const trimmed: RawRow = {}
  for (const [key, value] of Object.entries(row)) {
    trimmed[key.trim()] = value
  }
  return trimmed
}

function resolveAliases(rows: RawRow[]): RawRow[] {
  if (rows.length === 0) return rows
  const headers = Object.keys(rows[0])
  const aliasMap: Record<string, string> = {}
  for (const [original, canonical] of Object.entries(COLUMN_ALIASES)) {
    if (headers.includes(original)) {
      aliasMap[original] = canonical
    }
  }
  if (Object.keys(aliasMap).length === 0) return rows
  return rows.map(row => {
    const resolved: RawRow = {}
    for (const [key, value] of Object.entries(row)) {
      resolved[aliasMap[key] ?? key] = value
    }
    return resolved
  })
}

const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutos

function parseCSVText(text: string): RawRow[] {
  const result = Papa.parse<RawRow>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })
  return result.data.map(trimHeaders)
}

async function fetchCSV(url: string): Promise<RawRow[]> {
  // Intentar desde caché primero
  const cacheKey = 'csv_' + url.slice(-60)
  try {
    const cached = sessionStorage.getItem(cacheKey)
    if (cached) {
      const { text, ts } = JSON.parse(cached) as { text: string; ts: number }
      if (Date.now() - ts < CACHE_TTL_MS) {
        return parseCSVText(text)
      }
    }
  } catch { /* ignorar errores de caché */ }

  try {
    const response = await fetch(url)
    if (!response.ok) {
      console.warn(`Failed to load CSV (HTTP ${response.status}): ${url}`)
      return []
    }
    const text = await response.text()
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify({ text, ts: Date.now() }))
    } catch { /* sessionStorage lleno, ignorar */ }
    return parseCSVText(text)
  } catch (error) {
    console.warn(`Failed to load CSV: ${url}`, error)
    return []
  }
}

// ─── PARSERS ─────────────────────────────────────────────────────────────────

function parseSubjectiveRating(row: RawRow): number {
  const ratingCols = ['MALO', 'REGULAR', 'BUENO', 'MUY BUENO', 'EXCELENTE']
  for (let i = 0; i < ratingCols.length; i++) {
    const val = (row[ratingCols[i]] ?? '').trim().toLowerCase()
    if (val === 'x' || val === 'si' || val === '1') return i + 1
  }
  // Fallback: try 'numero' column
  const num = parseInt(row['numero'] ?? '', 10)
  if (!isNaN(num) && num >= 1 && num <= 5) return num
  return 0
}

/**
 * Si dos filas comparten el nombre corto ("F. Paradela" = Federico y Francesco), cada una
 * pasa a usar su "Nombre completo": todo el cruce posterior es por nombre, y con el mismo
 * nombre corto uno le pisaba nombre, club y valor al otro.
 */
export function disambiguateShortNames<T extends Record<string, string | undefined>>(rows: T[]): T[] {
  const key = (r: T) => (r['Jugador'] ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const counts = new Map<string, number>()
  for (const r of rows) counts.set(key(r), (counts.get(key(r)) ?? 0) + 1)
  return rows.map(r => {
    const full = r['Nombre completo']?.trim()
    return (counts.get(key(r)) ?? 0) > 1 && full ? { ...r, Jugador: full } : r
  })
}

// ─── PUBLIC LOADERS ───────────────────────────────────────────────────────────

export interface MasDatosEntry {
  Jugador: string
  'Nombre completo': string
  Imagen: string
  'Fecha fin de contrato': string
  'Valor de mercado': string
  Equipo: string
  Liga: string
  Posición: string
  Transfermkt: string
}

export interface SeguimientoMetricsPlayer {
  Jugador: string
  Equipo: string
  Liga: string
  'Posición': string
  'Posición específica'?: string
  Edad: string
  'Minutos jugados': string
  'Partidos jugados': string
  Transfermkt?: string
  [key: string]: string | undefined
}

// Deduplicates players by Jugador+Equipo key, keeping the last occurrence
function deduplicatePlayers<T extends { Jugador?: string; Equipo?: string }>(players: T[]): T[] {
  const seen = new Map<string, T>()
  for (const p of players) {
    const key = `${(p.Jugador ?? '').trim().toLowerCase()}|${(p.Equipo ?? '').trim().toLowerCase()}`
    seen.set(key, p)
  }
  return Array.from(seen.values())
}

export interface AllRawData {
  external: RawExternalPlayer[]
  internal: RawInternalPlayer[]
  monitoring: MonitoringPlayer[]
  seguimientoMetrics: SeguimientoMetricsPlayer[]
  normalized: NormalizedPlayer[]
  evolution: EvolutionEntry[]
  subjectiveMetrics: SubjectiveMetric[]
  transfermarkt: TransfermarktData[]
  masDatos: MasDatosEntry[]
  marketValueHistory: MarketValueHistoryEntry[]
}

export async function loadAllData(): Promise<AllRawData> {
  const [extRaw, arqueroRaw, intRaw, normRaw, evoRaw, metRaw, tmRaw, masDatosRaw, mvHistRaw] = await Promise.all([
    fetchCSV(SHEET_URLS.externo),
    fetchCSV(SHEET_URLS.arqueros),
    fetchCSV(SHEET_URLS.interno),
    fetchCSV(SHEET_URLS.normalizado),
    fetchCSV(SHEET_URLS.evolucion),
    fetchCSV(SHEET_URLS.metricas),
    fetchCSV(SHEET_URLS.transfermarkt),
    fetchCSV(SHEET_URLS.masDatos),
    fetchCSV(SHEET_URLS.valorMercadoHistorico),
  ])

  // Merge arqueros into external (they use the same RawExternalPlayer shape)
  // Deduplicate by Jugador+Equipo to handle updated sheets with repeated rows
  const externalCombined = [
    ...resolveAliases(extRaw).filter(r => r['Jugador']?.trim()),
    ...resolveAliases(arqueroRaw).filter(r => r['Jugador']?.trim()),
  ]
  const external = deduplicatePlayers(externalCombined) as RawExternalPlayer[]
  const internal = disambiguateShortNames(
    resolveAliases(intRaw).filter(r => r['Jugador']?.trim()),
  ) as RawInternalPlayer[]

  const monitoring: MonitoringPlayer[] = []

  const seguimientoMetrics: SeguimientoMetricsPlayer[] = []

  const normalized: NormalizedPlayer[] = resolveAliases(normRaw)
    .filter(r => r['Jugador']?.trim())
    .map(r => {
      const obj: NormalizedPlayer = {
        Jugador: r['Jugador'] ?? '',
        Liga: normalizeLiga(r['Liga'] ?? ''),
        Equipo: r['Equipo'] ?? '',
        'Posición': r['Posición'] ?? '',
        'Posición específica': r['Posición específica'] ?? '',
      }
      // Parse all numeric stats
      for (const [key, value] of Object.entries(r)) {
        if (!['Jugador', 'Liga', 'Equipo', 'Posición', 'Posición específica',
               'Vencimiento contrato', 'País de nacimiento', 'Pie'].includes(key)) {
          const num = parseFloat(String(value).replace(',', '.'))
          obj[key] = isNaN(num) ? 0 : num
        }
      }
      return obj
    })

  const evolution: EvolutionEntry[] = evoRaw
    .filter(r => r['JugadorNombre']?.trim())
    .map(r => {
      const entry: EvolutionEntry = {
        JugadorNombre: r['JugadorNombre'] ?? '',
        JugadorSK: r['JugadorSK'] ?? '',
        PosicionSK: r['PosicionSK'] ?? '',
        PosicionGeneral: r['PosicionGeneral'] ?? '',
        Date: r['Date'] ?? '',
        Partido: r['Partido'] ?? '',
        Competition: r['Competition'] ?? '',
        Posicion_Principal: r['Posicion_Principal'] ?? '',
        Minutos_jugados: r['Minutos_jugados'] ?? '',
        imagen: r['imagen'] ?? '',
      }
      // Add all other columns, fixing comma decimal separator
      for (const [key, value] of Object.entries(r)) {
        if (!(key in entry)) {
          entry[key] = String(value).replace(',', '.')
        }
      }
      return entry
    })

  // Get the JugadorSK column name (first unnamed column or column before 'Nº Atributo')
  const subjectiveMetrics: SubjectiveMetric[] = metRaw
    .filter(r => {
      // Skip header-like rows or empty rows
      const keys = Object.keys(r)
      return keys.length > 0 && r[keys[0]]?.trim() !== ''
    })
    .map(r => {
      const keys = Object.keys(r)
      // First column is JugadorSK (unnamed or has a number)
      const firstCol = keys[0]
      const jskVal = r[firstCol]?.trim() ?? ''
      // Skip if JugadorSK is not a number
      if (isNaN(parseInt(jskVal, 10))) return null

      return {
        JugadorSK: jskVal,
        'Nº Atributo': r['Nº Atributo'] ?? '',
        Atributo: r['Atributo'] ?? '',
        'Tipo Atributo': r['Tipo Atributo'] ?? '',
        'Posicion Jugador': r['Posicion Jugador'] ?? '',
        numero: String(parseSubjectiveRating(r)),
      }
    })
    .filter((r): r is SubjectiveMetric => r !== null && r['Tipo Atributo'] !== '')

  // Parse Transfermarkt data
  const transfermarkt: TransfermarktData[] = tmRaw
    .filter(r => r['Jugador']?.trim())
    .map(r => ({
      Jugador: r['Jugador'] ?? '',
      Equipo: r['Equipo'] ?? r['equipo_csv'] ?? '',
      Liga: normalizeLiga(r['Liga'] ?? r['liga_csv'] ?? ''),
      nombre_tm: r['nombre_tm'] ?? '',
      equipo_csv: r['equipo_csv'] ?? '',
      liga_csv: r['liga_csv'] ?? '',
      'Valor de mercado': r['Valor de mercado'] ?? '',
      'Fin de contrato': r['Fin de contrato'] ?? '',
      Representante: r['Representante'] ?? '',
      Transfermkt: r['Transfermkt'] ?? '',
      Imagen: r['Imagen'] ?? '',
    }))

  // Parse Más Datos (market values, Liga, images, contracts for interno players)
  const masDatos: MasDatosEntry[] = masDatosRaw
    .filter(r => r['Jugador']?.trim())
    .map(r => ({
      Jugador: r['Jugador'] ?? '',
      'Nombre completo': r['Nombre completo'] ?? '',
      Imagen: r['Imagen'] ?? '',
      'Fecha fin de contrato': r['Fecha fin de contrato'] ?? '',
      'Valor de mercado': r['Valor de mercado'] ?? '',
      Equipo: r['Equipo'] ?? '',
      Liga: normalizeLiga(r['Liga'] ?? ''),
      Posición: r['Posición'] ?? '',
      Transfermkt: r['Transfermkt'] ?? '',
    }))

  // Parse Market Value History
  const marketValueHistory: MarketValueHistoryEntry[] = mvHistRaw
    .filter(r => r['Jugador']?.trim() && r['Fecha']?.trim())
    .map(r => {
      // Parse date from DD/MM/YYYY format
      const dateParts = (r['Fecha'] ?? '').split('/')
      let fecha = new Date()
      if (dateParts.length === 3) {
        fecha = new Date(
          parseInt(dateParts[2], 10),
          parseInt(dateParts[1], 10) - 1,
          parseInt(dateParts[0], 10)
        )
      }
      // Parse value - remove non-numeric characters except decimal
      const valorStr = (r['Valor (€)'] ?? '').replace(/[^\d]/g, '')
      const valor = parseInt(valorStr, 10) || 0

      return {
        Jugador: r['Jugador'] ?? '',
        idTM: r['ID TM'] ?? '',
        fecha,
        valor,
        equipo: r['Equipo'] ?? '',
        edad: parseInt(r['Edad'] ?? '0', 10) || 0,
      }
    })
    .filter(e => !isNaN(e.fecha.getTime()) && e.valor > 0)
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime())

  return { external, internal, monitoring, seguimientoMetrics, normalized, evolution, subjectiveMetrics, transfermarkt, masDatos, marketValueHistory }
}
