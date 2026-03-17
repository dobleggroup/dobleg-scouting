import Papa from 'papaparse'
import { SHEET_URLS, COLUMN_ALIASES } from '@/constants/scoring'
import type {
  RawRow, RawExternalPlayer, RawInternalPlayer,
  MonitoringPlayer, NormalizedPlayer, EvolutionEntry, SubjectiveMetric,
  TransfermarktData, MarketValueHistoryEntry, GPSEntry,
} from '@/types'

// ─── HELPERS ─────────────────────────────────────────────────────────────────

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

async function fetchCSV(url: string): Promise<RawRow[]> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      console.warn(`Failed to load CSV (HTTP ${response.status}): ${url}`)
      return []
    }
    const text = await response.text()
    const result = Papa.parse<RawRow>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    })
    return result.data.map(trimHeaders)
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
  gpsData: GPSEntry[]
}

export async function loadAllData(): Promise<AllRawData> {
  const [extRaw, intRaw, monRaw, segMetRaw, normRaw, evoRaw, metRaw, tmRaw, masDatosRaw, mvHistRaw, gpsRaw] = await Promise.all([
    fetchCSV(SHEET_URLS.externo),
    fetchCSV(SHEET_URLS.interno),
    fetchCSV(SHEET_URLS.seguimiento),
    fetchCSV(SHEET_URLS.seguimientoMetricas),
    fetchCSV(SHEET_URLS.normalizado),
    fetchCSV(SHEET_URLS.evolucion),
    fetchCSV(SHEET_URLS.metricas),
    fetchCSV(SHEET_URLS.transfermarkt),
    fetchCSV(SHEET_URLS.masDatos),
    fetchCSV(SHEET_URLS.valorMercadoHistorico),
    fetchCSV(SHEET_URLS.gps),
  ])

  const external = resolveAliases(extRaw).filter(r => r['Jugador']?.trim()) as RawExternalPlayer[]
  const internal = resolveAliases(intRaw).filter(r => r['Jugador']?.trim()) as RawInternalPlayer[]

  const monitoring: MonitoringPlayer[] = monRaw
    .filter(r => r['Jugador']?.trim() || r['Nombre jugador']?.trim())
    .map(r => ({
      Jugador: r['Jugador'] ?? '',
      'Nombre jugador': r['Nombre jugador'] ?? '',
      Club: r['Club'] ?? '',
      Liga: r['Liga'] ?? '',
      Nacionalidad: r['Nacionalidad'] ?? '',
      'Fecha de nacimiento': r['Fecha de nacimiento'] ?? '',
      Edad: r['Edad'] ?? '',
      'Posición': r['Posición'] ?? '',
      Rol: r['Rol'] ?? '',
      Repre: r['Repre (Transfermkt)'] ?? r['Repre'] ?? '',
      Datos: r['Datos'] ?? '',
      'Ficha técnica': r['Ficha técnica'] ?? '',
      Transfermkt: r['Transfermkt'] ?? r['Ficha técnica'] ?? '',
      WyscoutVideo: r['WyscoutVideo'] ?? r['Video Wyscout'] ?? '',
    }))

  // Parse seguimiento metrics (Wyscout data for monitoring players)
  const seguimientoMetrics: SeguimientoMetricsPlayer[] = resolveAliases(segMetRaw)
    .filter(r => r['Jugador']?.trim())
    .map(r => {
      const player: SeguimientoMetricsPlayer = {
        Jugador: r['Jugador'] ?? '',
        Equipo: r['Equipo'] ?? '',
        Liga: r['Liga'] ?? '',
        'Posición': r['Posición'] ?? r['Posición específica'] ?? '',
        'Posición específica': r['Posición específica'] ?? '',
        Edad: r['Edad'] ?? '',
        'Minutos jugados': r['Minutos jugados'] ?? '',
        'Partidos jugados': r['Partidos jugados'] ?? '',
        Transfermkt: r['Transfermkt'] ?? '',
      }
      // Copy all other columns (metrics)
      for (const [key, value] of Object.entries(r)) {
        if (!(key in player)) {
          player[key] = value
        }
      }
      return player
    })

  const normalized: NormalizedPlayer[] = resolveAliases(normRaw)
    .filter(r => r['Jugador']?.trim())
    .map(r => {
      const obj: NormalizedPlayer = {
        Jugador: r['Jugador'] ?? '',
        Liga: r['Liga'] ?? '',
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
      Liga: r['Liga'] ?? r['liga_csv'] ?? '',
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
      Liga: r['Liga'] ?? '',
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

  // Parse GPS data
  const parseNum = (val: string): number => {
    if (!val) return 0
    // Handle both comma and dot decimal separators
    const cleaned = val.replace(/\./g, '').replace(',', '.')
    return parseFloat(cleaned) || 0
  }

  const gpsData: GPSEntry[] = gpsRaw
    .filter(r => r['Jugador']?.trim() && r['Fecha']?.trim())
    .map(r => {
      // Parse date from YYYY-MM-DD or DD/MM/YYYY format
      let fecha = new Date()
      const fechaStr = r['Fecha'] ?? ''
      if (fechaStr.includes('-')) {
        fecha = new Date(fechaStr)
      } else if (fechaStr.includes('/')) {
        const parts = fechaStr.split('/')
        if (parts.length === 3) {
          fecha = new Date(
            parseInt(parts[2], 10),
            parseInt(parts[1], 10) - 1,
            parseInt(parts[0], 10)
          )
        }
      }

      return {
        Jugador: r['Jugador'] ?? '',
        Fecha: fecha,
        Equipo: r['Equipo'] ?? '',
        Rival: r['Rival'] ?? '',
        Resultado: r['Resultado'] ?? '',
        Competencia: r['Competencia'] ?? '',
        Minutos: parseNum(r['Minutos']),
        Distancia: parseNum(r['Distancia (m)']),
        MetrosPorMin: parseNum(r['Mts/min']),
        Dist16_21: parseNum(r['Dist 16-21 km/h']),
        Dist21_24: parseNum(r['Dist 21-24 km/h']),
        DistOver24: parseNum(r['Dist >24 km/h']),
        HSR: parseNum(r['HSR >21 km/h']),
        VelMax: parseNum(r['Vel Max (km/h)']),
        Sprints: parseNum(r['Sprints']),
        AltaIntensidad: parseNum(r['% Alta Intensidad']),
        Acc2: parseNum(r['Acc >2 m/s']),
        Dec2: parseNum(r['Dec >2 m/s']),
        Acc3: parseNum(r['Acc >3 m/s²']),
        Dec3: parseNum(r['Dec >3 m/s²']),
        Acc4: parseNum(r['Acc >4 m/s']),
        Dec4: parseNum(r['Dec >4 m/s']),
        PlayerLoad: parseNum(r['Player Load']),
        RHIEBouts: parseNum(r['RHIE Bouts']),
      }
    })
    .filter(e => !isNaN(e.Fecha.getTime()))
    .sort((a, b) => a.Fecha.getTime() - b.Fecha.getTime())

  return { external, internal, monitoring, seguimientoMetrics, normalized, evolution, subjectiveMetrics, transfermarkt, masDatos, marketValueHistory, gpsData }
}
