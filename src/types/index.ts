// ─── RAW CSV ROW TYPES ────────────────────────────────────────────────────────

export type RawRow = Record<string, string>

export interface RawPlayer {
  Jugador: string
  Equipo: string
  'Posición': string
  Edad: string
  'Valor de mercado (Transfermarkt)': string
  'Vencimiento contrato': string
  'Partidos jugados': string
  'Minutos jugados': string
  Goles: string
  xG: string
  Asistencias: string
  xA: string
  [key: string]: string
}

export interface RawExternalPlayer extends RawPlayer {
  Liga: string
  'País de nacimiento': string
  Pie: string
  Altura: string
}

export interface RawInternalPlayer extends RawPlayer {
  'Posición específica': string
  id: string
  Transfermkt: string
  'País de nacimiento': string
  Pie: string
  Altura: string
  Liga: string
}

// Management status for agency tracking
export type ManagementStatus = 'en_seguimiento' | 'contactado' | 'en_negociacion' | 'descartado'

export interface MonitoringPlayer {
  Jugador: string
  'Nombre jugador': string
  Club: string
  Liga: string
  Nacionalidad: string
  'Fecha de nacimiento': string
  Edad: string
  'Posición': string
  Rol: string
  Repre: string
  Datos: string
  'Ficha técnica': string
  // Links
  Transfermkt?: string
  WyscoutVideo?: string
  // Enriched from metrics data
  ggScore?: number | null
  hasEnoughData?: boolean  // true if player has sufficient metrics for scoring
  metricsPlayer?: EnrichedPlayer | null  // Player data from seguimientoMetricas sheet
  // Enriched from external data (legacy, for fallback)
  externalPlayer?: EnrichedPlayer | null
  // Computed fields
  opportunityScore?: number | null  // ggScore / marketValue ratio
  marketValueRaw?: number
  marketValueFormatted?: string
  monthsRemaining?: number | null
  contractStatus?: 'ok' | 'warning' | 'critical'
  // Comparison with internal players
  avgInternalScore?: number | null  // Average ggScore of internal players in same position
  scoreDiff?: number | null  // Difference from internal average
}

export interface TransfermarktData {
  Jugador: string
  Equipo: string
  Liga: string
  // New format columns
  'Nombre TM'?: string
  'Valor Mercado €'?: string
  'Fin Contrato'?: string
  'Agente'?: string
  'URL Imagen'?: string
  // Legacy format columns (kept for backwards compatibility)
  nombre_tm?: string
  equipo_csv?: string
  liga_csv?: string
  'Valor de mercado'?: string
  'Fin de contrato'?: string
  Representante?: string
  Transfermkt?: string
  Imagen?: string
}

export interface NormalizedPlayer {
  Jugador: string
  Liga: string
  Equipo: string
  'Posición': string
  'Posición específica'?: string
  [key: string]: string | number | undefined
}

export interface EvolutionEntry {
  JugadorNombre: string
  JugadorSK: string
  PosicionSK: string
  PosicionGeneral: string
  Date: string
  Partido: string
  Competition: string
  Posicion_Principal: string
  Minutos_jugados: string
  imagen: string
  [key: string]: string
}

export interface SubjectiveMetric {
  JugadorSK: string
  'Nº Atributo': string
  Atributo: string
  'Tipo Atributo': string
  'Posicion Jugador': string
  numero: string
}

export interface MarketValueHistoryEntry {
  Jugador: string
  idTM: string
  fecha: Date
  valor: number
  equipo: string
  edad: number
}

// ─── GPS / PHYSICAL DATA ─────────────────────────────────────────────────────

export interface GPSEntry {
  Jugador: string
  Fecha: Date
  Equipo: string
  Rival: string
  Resultado: string
  Competencia: string
  Minutos: number
  Distancia: number           // meters
  MetrosPorMin: number        // m/min
  Dist16_21: number           // distance at 16-21 km/h
  Dist21_24: number           // distance at 21-24 km/h
  DistOver24: number          // distance above 24 km/h
  HSR: number                 // High Speed Running >21 km/h
  VelMax: number              // max velocity km/h
  Sprints: number
  AltaIntensidad: number      // % high intensity
  Acc2: number                // accelerations >2 m/s²
  Dec2: number                // decelerations >2 m/s²
  Acc3: number                // accelerations >3 m/s²
  Dec3: number                // decelerations >3 m/s²
  Acc4: number                // accelerations >4 m/s²
  Dec4: number                // decelerations >4 m/s²
  PlayerLoad: number
  RHIEBouts: number           // Repeated High Intensity Efforts
}

// ─── ENRICHED PLAYER ─────────────────────────────────────────────────────────

export interface EnrichedPlayer {
  // Identity
  Jugador: string
  Liga: string
  Equipo: string
  'Posición': string
  Edad: string
  'País de nacimiento': string
  Pie: string
  Altura: string
  'Valor de mercado (Transfermarkt)': string
  'Vencimiento contrato': string
  'Partidos jugados': string
  'Minutos jugados': string
  Goles: string
  xG: string
  Asistencias: string
  xA: string
  // Internal-only fields (empty string for external)
  'Posición específica': string
  id: string
  Transfermkt: string
  // Transfermarkt enriched fields
  Representante: string
  Imagen: string
  // Enrichment
  ggScore: number | null
  ggScorePercentile: number | null  // percentile within position group (0-100)
  source: 'externo' | 'interno'
  contractStatus: 'ok' | 'warning' | 'critical'
  monthsRemaining: number | null
  marketValueFormatted: string
  marketValueRaw: number
  minutesPlayed: number
  ageNum: number
  // All raw stats accessible by key
  [key: string]: string | number | null
}

// ─── FILTER STATE ─────────────────────────────────────────────────────────────

export interface FilterState {
  search: string
  positions: string[]
  leagues: string[]
  teamSearch: string
  minMinutes: number
  maxMinutes: number
  minMarketValue: number
  maxMarketValue: number
  minAge: number
  maxAge: number
  contractFrom: string
  contractTo: string
  maxContractMonths: number  // 0 = all, otherwise filter by max months remaining
  representante: string  // Filter by agent/representative
  pie: string  // 'izquierdo' | 'derecho' | 'ambos' | '' (all)
  minHeight: number  // cm
  maxHeight: number  // cm
  selectedMetrics: string[]  // Metrics to show as columns
}

// ─── SORT STATE ──────────────────────────────────────────────────────────────

export interface SortState {
  column: string
  direction: 'asc' | 'desc'
}

// ─── APP DATA CONTEXT ─────────────────────────────────────────────────────────

export interface AppData {
  external: EnrichedPlayer[]
  internal: EnrichedPlayer[]
  monitoring: MonitoringPlayer[]
  normalized: NormalizedPlayer[]
  evolution: EvolutionEntry[]
  subjectiveMetrics: SubjectiveMetric[]
  marketValueHistory: MarketValueHistoryEntry[]
  gpsData: GPSEntry[]
  positionAverages: Record<string, number>
  loading: boolean
  error: string | null
  lastUpdated: Date | null
}

// ─── RADAR / CHART TYPES ─────────────────────────────────────────────────────

export interface RadarDataPoint {
  subject: string
  fullMetric: string
  player: number
  average: number
  fullMark: number
}

export interface ComparisonPlayer {
  player: EnrichedPlayer
  color: string
  label: string
}

// ─── MONITORING SCORING HISTORY ──────────────────────────────────────────────

export interface ScoreHistoryEntry {
  date: string  // ISO date string
  ggScore: number
  opportunityScore?: number
}

export interface MonitoringPlayerStatus {
  playerId: string  // Unique identifier (Jugador name)
  status: ManagementStatus
  scoreHistory: ScoreHistoryEntry[]
  notes?: string
  lastUpdated: string  // ISO date string
}

// ─── SCOUT TRACKING SYSTEM ───────────────────────────────────────────────────

export type ScoutPlayerPriority = 'alta' | 'normal' | 'baja'
export type ScoutPlayerFoot = 'derecho' | 'izquierdo' | 'ambos'

export type ScoutsGGStatus =
  | 'en_seguimiento_gg'
  | 'pre_seleccionado'
  | 'contactado'
  | 'reunion_pactada'
  | 'en_negociacion'
  | 'oferta_enviada'
  | 'contratado'
  | 'descartado'
  | 'no_disponible'

export type DatosTrackingStatus =
  | 'en_seguimiento'
  | 'contactado'
  | 'en_negociacion'
  | 'descartado'

export interface ScoutPlayerFile {
  name: string
  url: string
  size: number
  uploaded_at: string
  uploaded_by_name: string
}

export interface ScoutPlayer {
  id: string
  full_name: string
  // Link to Wyscout DB player (when found via report or search)
  player_db_id: string | null        // The "Jugador" field value from the DB (e.g. "L. Messi")
  player_db_source: 'interno' | 'externo' | null  // Which DB this player is in
  club: string | null
  liga: string | null
  edad: number | null
  fecha_nacimiento: string | null
  posicion: string | null
  rol: string | null
  nacionalidad: string | null
  altura: number | null
  pie: ScoutPlayerFoot | null
  transfermarkt_url: string | null
  agente: string | null
  comentario: string | null
  prioridad: ScoutPlayerPriority
  fuente_deteccion: string | null
  video_url: string | null
  files: ScoutPlayerFile[]
  in_datos_list: boolean
  in_scouts_gg_list: boolean
  added_by_datos: string | null
  added_by_datos_name: string | null
  added_by_scouts: string | null
  added_by_scouts_name: string | null
  created_at: string
  updated_at: string
  // Computed (not stored in DB, fetched separately)
  scoutScore?: number | null        // Avg of scout evaluation scores
  scoutEvalCount?: number           // Number of evaluations
}

export interface ScoutPlayerStatusRecord {
  id: string
  player_id: string
  list_type: 'datos' | 'scouts_gg'
  status: string
  changed_by: string
  changed_by_name: string
  changed_at: string
  notes: string | null
}
