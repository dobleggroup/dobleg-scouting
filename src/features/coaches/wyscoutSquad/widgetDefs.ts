// src/features/coaches/wyscoutSquad/widgetDefs.ts
// Definicion de los widgets de jugadores del Resumen. La usan la pagina y el PDF,
// asi lo que se ve y lo que se exporta es exactamente lo mismo.
import type { AnyMetric } from './squadMetrics'
import type { SquadMetricKey } from './wyscoutSquadTypes'

export type MetricFormat = 'int' | 'dec1' | 'dec2' | 'pct' | 'signed'

export interface MetricColumn {
  key: AnyMetric
  label: string
  format: MetricFormat
  /** true = se calcula por minuto o es un porcentaje: respeta el minimo de minutos. */
  perMinute: boolean
}

export interface RankingWidgetDef {
  id: string
  title: string
  description: string
  columns: MetricColumn[]
  /** Columnas del archivo que necesita la metrica principal (si faltan, no se muestra). */
  requires: SquadMetricKey[]
}

export type WidgetSection = 'equipo' | 'partidos' | 'jugadores'

export interface WidgetInfo {
  id: string
  section: WidgetSection
  title: string
}

export const RANKING_WIDGETS: RankingWidgetDef[] = [
  {
    id: 'goleadores', title: 'Goleadores',
    description: 'Goles, goles cada 90 minutos y goles contra lo esperado (xG): si es positivo, define mejor de lo que generan sus remates.',
    columns: [
      { key: 'goals', label: 'Goles', format: 'int', perMinute: false },
      { key: 'goals_p90', label: 'Goles/90', format: 'dec2', perMinute: true },
      { key: 'goals_minus_xg', label: 'Goles − xG', format: 'signed', perMinute: false },
    ],
    requires: ['goals'],
  },
  {
    id: 'asistidores', title: 'Asistidores',
    description: 'Asistencias, asistencias esperadas (xA) y jugadas clave cada 90 minutos.',
    columns: [
      { key: 'assists', label: 'Asist.', format: 'int', perMinute: false },
      { key: 'xa', label: 'xA', format: 'dec2', perMinute: false },
      { key: 'key_passes_p90', label: 'Jug. clave/90', format: 'dec2', perMinute: true },
    ],
    requires: ['assists'],
  },
  {
    id: 'participacion', title: 'Participación en gol',
    description: 'Goles más asistencias cada 90 minutos.',
    columns: [
      { key: 'goal_involvement_p90', label: 'G+A/90', format: 'dec2', perMinute: true },
      { key: 'goals', label: 'Goles', format: 'int', perMinute: false },
      { key: 'assists', label: 'Asist.', format: 'int', perMinute: false },
    ],
    requires: ['goals_p90'],
  },
  {
    id: 'duelos', title: 'Duelos ganados',
    description: 'Duelos ganados cada 90 minutos: en total, en ataque, en defensa y de cabeza.',
    columns: [
      { key: 'duels_won_p90', label: 'Total/90', format: 'dec1', perMinute: true },
      { key: 'off_duels_won_p90', label: 'Ataque/90', format: 'dec1', perMinute: true },
      { key: 'def_duels_won_p90', label: 'Defensa/90', format: 'dec1', perMinute: true },
      { key: 'aerial_won_p90', label: 'Aéreos/90', format: 'dec1', perMinute: true },
    ],
    requires: ['duels_p90', 'duels_won_pct'],
  },
  {
    id: 'recuperacion', title: 'Recuperación',
    description: 'Acciones defensivas e intercepciones cada 90 minutos.',
    columns: [
      { key: 'def_actions_p90', label: 'Acc. def./90', format: 'dec1', perMinute: true },
      { key: 'interceptions_p90', label: 'Intercep./90', format: 'dec1', perMinute: true },
      { key: 'tackles_p90', label: 'Entradas/90', format: 'dec2', perMinute: true },
    ],
    requires: ['def_actions_p90'],
  },
  {
    id: 'creacion', title: 'Creación',
    description: 'Pases progresivos y pases al último tercio cada 90 minutos, y precisión de pase.',
    columns: [
      { key: 'prog_passes_p90', label: 'Progresivos/90', format: 'dec1', perMinute: true },
      { key: 'final_third_passes_p90', label: 'Último tercio/90', format: 'dec1', perMinute: true },
      { key: 'passes_acc_pct', label: 'Precisión', format: 'pct', perMinute: true },
    ],
    requires: ['prog_passes_p90'],
  },
  {
    id: 'regates', title: 'Regates',
    description: 'Regates exitosos cada 90 minutos, intentados y porcentaje de éxito.',
    columns: [
      { key: 'dribbles_won_p90', label: 'Exitosos/90', format: 'dec2', perMinute: true },
      { key: 'dribbles_p90', label: 'Intentados/90', format: 'dec2', perMinute: true },
      { key: 'dribbles_won_pct', label: '% éxito', format: 'pct', perMinute: true },
    ],
    requires: ['dribbles_p90', 'dribbles_won_pct'],
  },
  {
    id: 'centros', title: 'Centros',
    description: 'Centros precisos cada 90 minutos, centros tirados y precisión.',
    columns: [
      { key: 'crosses_acc_p90', label: 'Precisos/90', format: 'dec2', perMinute: true },
      { key: 'crosses_p90', label: 'Tirados/90', format: 'dec2', perMinute: true },
      { key: 'crosses_acc_pct', label: 'Precisión', format: 'pct', perMinute: true },
    ],
    requires: ['crosses_p90', 'crosses_acc_pct'],
  },
  {
    id: 'uso', title: 'Uso del plantel',
    description: 'Minutos jugados y qué parte de los minutos posibles de la temporada jugó cada uno.',
    columns: [
      { key: 'minutes', label: 'Minutos', format: 'int', perMinute: false },
      { key: 'minutes_share_pct', label: '% posibles', format: 'pct', perMinute: false },
      { key: 'matches', label: 'Partidos', format: 'int', perMinute: false },
    ],
    requires: ['minutes'],
  },
]

export const ALL_WIDGETS: WidgetInfo[] = [
  { id: 'temporada', section: 'equipo', title: 'Números de la temporada' },
  { id: 'proximo', section: 'partidos', title: 'Próximo partido' },
  { id: 'tabla', section: 'partidos', title: 'Tabla de posiciones' },
  { id: 'ultimos', section: 'partidos', title: 'Últimos partidos' },
  { id: 'proximos', section: 'partidos', title: 'Próximos partidos' },
  ...RANKING_WIDGETS.map(w => ({ id: w.id, section: 'jugadores' as const, title: w.title })),
  { id: 'perfil', section: 'jugadores', title: 'Perfil del plantel' },
  { id: 'tablaCompleta', section: 'jugadores', title: 'Todos los jugadores' },
]

export const SECTION_TITLES: Record<WidgetSection, string> = {
  equipo: 'Datos del equipo',
  partidos: 'Tabla y partidos',
  jugadores: 'Los jugadores',
}

export function formatMetric(value: number | null, format: MetricFormat): string {
  if (value === null || !Number.isFinite(value)) return '—'
  switch (format) {
    case 'int': return Math.round(value).toLocaleString('es-AR')
    case 'dec1': return value.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    case 'dec2': return value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    case 'pct': return `${Math.round(value)}%`
    case 'signed': {
      const s = value.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      return value > 0 ? `+${s}` : s
    }
  }
}

/** Columnas de la tabla completa, en el orden en que se muestran. */
export const FULL_TABLE_COLUMNS: MetricColumn[] = [
  { key: 'matches', label: 'PJ', format: 'int', perMinute: false },
  { key: 'minutes', label: 'Min', format: 'int', perMinute: false },
  { key: 'goals', label: 'Goles', format: 'int', perMinute: false },
  { key: 'xg', label: 'xG', format: 'dec1', perMinute: false },
  { key: 'assists', label: 'Asist.', format: 'int', perMinute: false },
  { key: 'xa', label: 'xA', format: 'dec1', perMinute: false },
  { key: 'goal_involvement_p90', label: 'G+A/90', format: 'dec2', perMinute: true },
  { key: 'shots_p90', label: 'Remates/90', format: 'dec2', perMinute: true },
  { key: 'duels_won_p90', label: 'Duelos gan./90', format: 'dec1', perMinute: true },
  { key: 'duels_won_pct', label: 'Duelos %', format: 'pct', perMinute: true },
  { key: 'off_duels_won_p90', label: 'Duelos at. gan./90', format: 'dec1', perMinute: true },
  { key: 'def_duels_won_p90', label: 'Duelos def. gan./90', format: 'dec1', perMinute: true },
  { key: 'aerial_won_p90', label: 'Aéreos gan./90', format: 'dec1', perMinute: true },
  { key: 'interceptions_p90', label: 'Intercep./90', format: 'dec1', perMinute: true },
  { key: 'dribbles_won_p90', label: 'Regates exit./90', format: 'dec2', perMinute: true },
  { key: 'crosses_acc_p90', label: 'Centros prec./90', format: 'dec2', perMinute: true },
  { key: 'prog_passes_p90', label: 'Pases prog./90', format: 'dec1', perMinute: true },
  { key: 'passes_acc_pct', label: 'Pases %', format: 'pct', perMinute: true },
  { key: 'key_passes_p90', label: 'Jug. clave/90', format: 'dec2', perMinute: true },
]
