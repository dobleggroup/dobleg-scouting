// Fila cruda del archivo: header -> valor
export type Row = Record<string, string | number>

export interface ParsedFile {
  headers: string[]
  rows: Row[]
}

// Definición de una métrica (base o derivada)
export interface MetricDef {
  key: string
  label: string
  short: string
  unit: '%' | '/90' | 'm' | ''
  higherIsBetter: boolean
  diverging?: boolean   // true = puede ser +/- (ej. Goles - xG); colorea por signo
  derived?: boolean     // true = calculada por regla, no viene del archivo
  sourceHeader?: string // header original del archivo (solo métricas base)
}

// Stat calculada del protagonista vs pool
export interface MetricStat {
  def: MetricDef
  value: number | null
  avg: number | null
  percentile: number | null           // 0..100
  color: 'green' | 'amber' | 'red' | 'neutral'
  rank: number | null                 // 1 = mejor del pool
  total: number                       // tamaño del grupo (pool + protagonista)
}

// Asignaciones de métricas a gráficos
export interface ScatterAssignment { xKey: string; yKey: string; caption: string }
export interface ChartAssignments {
  radar: string[]                     // metric keys
  bar: string[]
  numbers: string[]
  scatters: ScatterAssignment[]
}

// Contenido editorial
export interface MatchRow { rival: string; resultado: string; rating: string; minutos: string }
export interface Comparable { jugador: string; club: string; rating: string; delta: string }
export interface InformeContent {
  nombre: string; club: string; posicion: string; rol: string
  edad: string; nacionalidad: string; liga: string; contrato: string; valorMercado: string
  hideMainStats: boolean
  rating: string; pj: string; minutos: string; goles: string; asistencias: string
  lecturaAutor: string; lecturaTexto: string
  videoUrl: string; transfermarktUrl: string; representante: string
  ultimos5: MatchRow[]
  hideComparables: boolean
  comparables: Comparable[]
  comparaciones: string
}

// Modelo persistible
export interface Informe {
  id: string
  createdAt: string
  updatedAt: string
  contextoComparacion: string
  fotoDataUrl: string | null
  protagonistIndex: number            // índice de la fila protagonista en rows
  content: InformeContent
  charts: ChartAssignments
  headers: string[]
  rows: Row[]
  columnMap: Record<string, string>   // header -> metric key
}
