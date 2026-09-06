// ─── Persistencia ─────────────────────────────────────────────────────────────

export type GpsMetricCategory = 'locomotor' | 'mecanico' | 'otro'

export interface GpsMetric {
  id: number
  key: string
  label: string
  unit: string
  decimals: number
  category: GpsMetricCategory
  sort_order: number
  is_active: boolean
}

export interface GpsMetricAlias {
  id: number
  metric_id: number
  alias: string
  source: string | null
}

export interface GpsEntryRow {
  id: string
  player_key: string
  player_name: string
  match_date: string            // 'YYYY-MM-DD'
  equipo: string | null
  rival: string | null
  competencia: string | null
  resultado: string | null
  minutos: number | null
  metrics: Record<string, number>
  source: 'manual' | 'pdf' | 'html'
  file_name: string | null
  created_by: string | null
  created_by_name: string | null
  created_at: string
  updated_at: string
}

export interface GpsEntryInput {
  playerName: string
  matchDate: string             // 'YYYY-MM-DD'
  equipo?: string | null
  rival?: string | null
  competencia?: string | null
  resultado?: string | null
  minutos?: number | null
  metrics: Record<string, number>
  source: 'manual' | 'pdf' | 'html'
  fileName?: string | null
}

// ─── Parser ───────────────────────────────────────────────────────────────────

export interface PdfTextItem {
  str: string
  x: number        // borde izquierdo, en puntos
  y: number        // línea de base; crece hacia arriba (espacio PDF)
  width: number
  page: number     // 1-based
}

// PdfCell/PdfRow viven en src/lib/pdf/groupRows.ts (compartido con el parser de
// Wyscout); se re-exportan acá para no tocar los imports existentes de gps/.
export type { PdfCell, PdfRow } from '@/lib/pdf/groupRows'

export interface PdfTableRow {
  name: string
  /** Un valor por cabecera; `null` donde la fila no tenía dato. Índice 0 = nombre. */
  values: (number | null)[]
}

export interface PdfTable {
  headers: string[]
  rows: PdfTableRow[]
  /** Texto de las filas previas a la cabecera: de ahí sale el contexto del partido. */
  preambleLines: string[]
}

export type ColumnRole = 'name' | 'minutes' | 'metric' | 'unmapped'

export interface ColumnMapping {
  header: string
  index: number
  /** key de gps_metrics, `MINUTES_KEY`, o null si todavía no se resolvió. */
  metricKey: string | null
  role: ColumnRole
}

export interface DetectedPlayer {
  rawName: string
  /** fullName de los jugadores Doble G compatibles. 1 = resuelto, >1 = ambiguo. */
  candidates: string[]
  values: (number | null)[]
}

export interface ParsedContext {
  rival: string | null
  matchDate: string | null      // 'YYYY-MM-DD'
  teamText: string | null
}

export interface GpsParseResult {
  table: PdfTable
  context: ParsedContext
  columns: ColumnMapping[]
  players: DetectedPlayer[]
}

// ─── Historial (fila = partido de un jugador) ──────────────────────────────────

export interface HtmlTable {
  headers: string[]
  rows: string[][]
}

export type HistoryColumnRole = 'date' | 'rival' | 'competencia' | 'minutes' | 'metric' | 'unmapped'

export interface HistoryColumnMapping {
  header: string
  index: number
  /** key de gps_metrics, o null si el rol no es 'metric'/'unmapped' resuelto. */
  metricKey: string | null
  role: HistoryColumnRole
}

export interface HistoryMatchRow {
  rawCells: string[]
  matchDate: string | null      // 'YYYY-MM-DD', null si el archivo no traía fecha
  rival: string
  competencia: string | null
  minutos: number | null
  /** Alineado 1:1 con `HistoryParseResult.columns` por índice. */
  values: (number | null)[]
}

export interface HistoryParseResult {
  columns: HistoryColumnMapping[]
  matches: HistoryMatchRow[]
}

// ─── Formulario ───────────────────────────────────────────────────────────────

export interface MatchContextValue {
  playerName: string
  matchDate: string       // 'YYYY-MM-DD'
  equipo: string
  rival: string
  competencia: string
  resultado: string
  minutos: string         // texto en el form; se parsea al guardar
}

export const EMPTY_MATCH_CONTEXT: MatchContextValue = {
  playerName: '', matchDate: '', equipo: '', rival: '',
  competencia: '', resultado: '', minutos: '',
}
