// src/features/coaches/wyscoutReport/wyscoutReportTypes.ts

export type PitchHalf = 'completa' | 'propia' | 'rival'

export interface PitchPoint {
  x: number       // 0-100
  y: number       // 0-100
  label?: string  // número de camiseta u otra etiqueta corta
}

export type WyscoutMetricValue =
  | number
  | { total: number; exitosos: number; pct: number }
  | null

export interface WyscoutReportPlayerSeason {
  number: number | null
  name: string
  positionCode: string | null
  age: number | null
  foot: 'diestro' | 'zurdo' | null
  heightCm: number | null
  matches: number
  minutesTotal: number
  minutesAvg: number | null
  goals: number
  assists: number
  yellowCards: number
  redCards: number
  metrics: Record<string, WyscoutMetricValue>
}

export interface WyscoutReportFormation {
  scheme: string
  usagePct: number
  averagePositions: PitchPoint[]
  teamStats: { label: string; own: number; rival: number }[]
}

export interface WyscoutReportMatchStint {
  formation: string
  fromMinute: number
  toMinute: number
  players: PitchPoint[]
}

export interface WyscoutReportMatchLineupPlayer {
  number: number
  name: string
  positionCode: string
  isStarter: boolean
}

export interface WyscoutReportMatch {
  date: string          // ISO 'YYYY-MM-DD'
  rival: string
  isHome: boolean
  score: string
  competition: string
  lineup: WyscoutReportMatchLineupPlayer[]
  stints: WyscoutReportMatchStint[]
}

export interface WyscoutEventMap {
  category: string
  half: PitchHalf
  points: PitchPoint[]
}

export interface WyscoutZoneGrid {
  category: 'recuperaciones' | 'perdidas' | 'faltas'
  cells: { row: number; col: number; pct: number; reference: number | null }[]
}

export interface WyscoutReportSetPiece {
  type: 'corner' | 'tiro_libre'
  side: 'izquierdo' | 'derecho'
  point: PitchPoint  // label = tomador
}

export interface WyscoutReportData {
  sourceFileName: string
  matchCountWindow: number
  players: WyscoutReportPlayerSeason[]
  formations: WyscoutReportFormation[]
  matches: WyscoutReportMatch[]
  eventMaps: WyscoutEventMap[]
  zoneGrids: WyscoutZoneGrid[]
  setPieces: WyscoutReportSetPiece[]
}
