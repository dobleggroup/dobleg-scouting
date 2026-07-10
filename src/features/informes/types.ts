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
  percentile: number | null           // 0..100 — percentil del protagonista
  avgPercentile: number | null        // 0..100 — percentil donde cae el promedio del pool
  color: 'green' | 'amber' | 'red' | 'neutral'
  rank: number | null                 // 1 = mejor del pool
  total: number                       // tamaño del grupo (pool + protagonista)
}

// Asignaciones de métricas a gráficos
export interface ScatterAssignment { xKey: string; yKey: string; caption: string; xMin?: number; yMin?: number }
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
  ratingPromedio?: string        // referencia opcional para el gauge de rating (marca de promedio)
  hideRatingGauge?: boolean       // ocultar el velocímetro de rating (ej. si el rating es bajo)
  hideRating?: boolean            // no mostrar el rating (Score GG) en ningún lado del informe
  hideFisicoTab?: boolean         // sacar la pestaña Físico del informe
  hideFisicoCharts?: boolean      // en Físico, mostrar sólo los datos (sin gráficos)
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
  ligaCrestDataUrl?: string            // escudo de la liga (data URL), subido en el paso 1
  protagonistIndex: number            // índice de la fila protagonista en rows
  comparePlayerIndices?: number[]     // índices de jugadores a comparar en el radar (máx 2)
  compareMetrics?: string[]           // metric keys elegidas para la 2da línea "Mejor que X%" vs otra liga
  compareLeague?: string              // nombre de la liga de comparación de la 2da línea (ej. "Liga MX")
  evolutionCharts?: string[]          // metric keys Wyscout (máx 8); solo jugadores internos
  dbPlayerId?: number                 // id del jugador en la DB (Supabase) si se linkeó en el paso 1
  dbPlayerName?: string               // nombre del jugador en la DB (para match por nombre: GPS/valor histórico)
  dbPosition?: string                 // posición primaria en la DB (param de historial de partidos)
  dbPercentile?: number               // percentil del Score GG dentro de su posición (comparación de rating)
  dbLeagueName?: string               // liga en la DB (texto de comparación de rating)
  idioma?: import('./i18n').Lang      // idioma del informe (default 'es')
  content: InformeContent
  charts: ChartAssignments
  headers: string[]
  rows: Row[]
  columnMap: Record<string, string>   // header -> metric key
}
