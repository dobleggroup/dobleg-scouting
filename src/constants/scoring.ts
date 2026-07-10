import { Capacitor } from '@capacitor/core'

// ─── GOOGLE SHEETS CSV URLS ───────────────────────────────────────────────────

// Google Sheets base URLs
const GOOGLE_BASE = 'https://docs.google.com'

// Origen de producción (Netlify) donde vive el proxy serverless de CSV con CORS.
const PROD_ORIGIN = 'https://dobleg-scouting.netlify.app'

// Helper to build URLs:
// - App nativa (Capacitor): las rutas relativas /.netlify/... no existen dentro de
//   la app, así que apuntamos al proxy YA deployado (manda Access-Control-Allow-Origin *).
// - Dev (web): proxy de Vite.
// - Producción (web): proxy serverless relativo del mismo dominio.
function buildSheetUrl(path: string): string {
  const fullUrl = `${GOOGLE_BASE}${path}`
  if (Capacitor.isNativePlatform()) {
    return `${PROD_ORIGIN}/.netlify/functions/sheets?url=${encodeURIComponent(fullUrl)}`
  }
  if (import.meta.env.DEV) {
    return `/sheets-proxy${path}`
  }
  return `/.netlify/functions/sheets?url=${encodeURIComponent(fullUrl)}`
}

export const SHEET_URLS = {
  externo: buildSheetUrl('/spreadsheets/d/e/2PACX-1vSneBjGlw2I3SyXV-uw1V8Cs_O4lbiQw39melKEZJNhunpshakPrn7AZQBN2L8N9Yw_HA-EeVOt3qvf/pub?gid=2002620668&single=true&output=csv'),
  arqueros: buildSheetUrl('/spreadsheets/d/1gXhmqIc_joFkiQ1brie4-xHX43W8fqn2f6tqV04rx9s/export?format=csv&gid=66746335'),
  interno: buildSheetUrl('/spreadsheets/d/e/2PACX-1vSneBjGlw2I3SyXV-uw1V8Cs_O4lbiQw39melKEZJNhunpshakPrn7AZQBN2L8N9Yw_HA-EeVOt3qvf/pub?gid=1060061197&single=true&output=csv'),
  normalizado: buildSheetUrl('/spreadsheets/d/e/2PACX-1vSneBjGlw2I3SyXV-uw1V8Cs_O4lbiQw39melKEZJNhunpshakPrn7AZQBN2L8N9Yw_HA-EeVOt3qvf/pub?gid=1398676062&single=true&output=csv'),
  transfermarkt: buildSheetUrl('/spreadsheets/d/e/2PACX-1vSneBjGlw2I3SyXV-uw1V8Cs_O4lbiQw39melKEZJNhunpshakPrn7AZQBN2L8N9Yw_HA-EeVOt3qvf/pub?gid=1508649688&single=true&output=csv'),
  masDatos: buildSheetUrl('/spreadsheets/d/e/2PACX-1vSneBjGlw2I3SyXV-uw1V8Cs_O4lbiQw39melKEZJNhunpshakPrn7AZQBN2L8N9Yw_HA-EeVOt3qvf/pub?gid=150864968&single=true&output=csv'),
  evolucion: buildSheetUrl('/spreadsheets/d/e/2PACX-1vS7cuAywNQtcMc1R7Nzai9vUHHv8ZK09fTcm5GbwWD2_u0pRUeBRsVu_6SjLbdnMIL5SAJy-Liwn1yd/pub?gid=1395066371&single=true&output=csv'),
  metricas: buildSheetUrl('/spreadsheets/d/e/2PACX-1vS7cuAywNQtcMc1R7Nzai9vUHHv8ZK09fTcm5GbwWD2_u0pRUeBRsVu_6SjLbdnMIL5SAJy-Liwn1yd/pub?gid=2041650226&single=true&output=csv'),
  valorMercadoHistorico: buildSheetUrl('/spreadsheets/d/e/2PACX-1vSneBjGlw2I3SyXV-uw1V8Cs_O4lbiQw39melKEZJNhunpshakPrn7AZQBN2L8N9Yw_HA-EeVOt3qvf/pub?gid=1121324076&single=true&output=csv'),
  gps: buildSheetUrl('/spreadsheets/d/e/2PACX-1vSneBjGlw2I3SyXV-uw1V8Cs_O4lbiQw39melKEZJNhunpshakPrn7AZQBN2L8N9Yw_HA-EeVOt3qvf/pub?gid=1233910424&single=true&output=csv'),
  wyscoutEvolucion: buildSheetUrl('/spreadsheets/d/1gXhmqIc_joFkiQ1brie4-xHX43W8fqn2f6tqV04rx9s/export?format=csv&gid=284673441'),
} as const

// ─── COLUMN ALIASES ───────────────────────────────────────────────────────────
// Maps from source CSV column name → canonical column name
// Applied at parse time so scoring and radar always use canonical names

export const COLUMN_ALIASES: Record<string, string> = {
  // Externo uses "Dribling completados/90", Interno uses "Gambetas completadas/90"
  'Dribling completados/90': 'Gambetas completadas/90',
  // Interno uses different column names for market value and contract
  'Valor de mercado': 'Valor de mercado (Transfermarkt)',
  'Fecha fin de contrato': 'Vencimiento contrato',
}

// ─── POSITION NORMALIZATION ───────────────────────────────────────────────────
// Maps raw CSV Posición string → scoring position key (for scoring purposes - grouped)

export const POSITION_MAP: Record<string, string> = {
  // Spanish names
  'Arquero': 'Arquero',
  'Portero': 'Arquero',
  'GK': 'Arquero',
  'Defensor central': 'Defensor Central',
  'Defensor Central': 'Defensor Central',
  'Lateral derecho': 'Lateral',
  'Lateral izquierdo': 'Lateral',
  'Lateral': 'Lateral',
  'Volante central': 'Volante central',
  'Mediocentro': 'Volante central',
  'Mediocentro defensivo': 'Volante central',
  'Pivote': 'Volante central',
  'Volante interno': 'Volante interno',
  'Mediapunta': 'Volante interno',
  'Interior': 'Volante interno',
  'Enganche': 'Volante interno',
  'Extremo derecho': 'Extremo',
  'Extremo izquierdo': 'Extremo',
  'Extremo': 'Extremo',
  'Carrilero': 'Lateral',
  'Delantero centro': 'Delantero',
  'Delantero': 'Delantero',
  'Segundo delantero': 'Delantero',
  'Ariete': 'Delantero',
  // Wyscout position codes
  'RCB': 'Defensor Central',
  'LCB': 'Defensor Central',
  'RCB3': 'Defensor Central',
  'LCB3': 'Defensor Central',
  'CB': 'Defensor Central',
  'RB': 'Lateral',
  'LB': 'Lateral',
  'RWB': 'Lateral',
  'LWB': 'Lateral',
  'RCMF': 'Volante central',
  'LCMF': 'Volante central',
  'RCMF3': 'Volante central',
  'LCMF3': 'Volante central',
  'DMF': 'Volante central',
  'RDMF': 'Volante central',
  'LDMF': 'Volante central',
  'AMF': 'Volante interno',
  'RAMF': 'Volante interno',
  'LAMF': 'Volante interno',
  'RW': 'Extremo',
  'LW': 'Extremo',
  'RWF': 'Extremo',
  'LWF': 'Extremo',
  'CF': 'Delantero',
  'SS': 'Delantero',
}

// ─── FILTER POSITION MAP ─────────────────────────────────────────────────────
// Maps raw CSV Posición string → filter-friendly position (keeps left/right separate)

export const FILTER_POSITION_MAP: Record<string, string> = {
  'Arquero': 'Arquero',
  'Portero': 'Arquero',
  'GK': 'Arquero',
  'Defensor central': 'Defensor Central',
  'Defensor Central': 'Defensor Central',
  'Lateral derecho': 'Lateral Derecho',
  'Lateral izquierdo': 'Lateral Izquierdo',
  'Lateral': 'Lateral',
  'Carrilero': 'Lateral',
  'Volante central': 'Volante Central',
  'Mediocentro': 'Volante Central',
  'Mediocentro defensivo': 'Volante Central',
  'Pivote': 'Volante Central',
  'Volante interno': 'Volante Interno',
  'Mediapunta': 'Volante Interno',
  'Interior': 'Volante Interno',
  'Extremo derecho': 'Extremo Derecho',
  'Extremo izquierdo': 'Extremo Izquierdo',
  'Extremo': 'Extremo',
  'Delantero centro': 'Delantero',
  'Delantero': 'Delantero',
  'Segundo delantero': 'Delantero',
  'Ariete': 'Delantero',
}

// ─── DISPLAY POSITION MAP ────────────────────────────────────────────────────
// Maps Wyscout codes and raw positions → user-friendly Spanish display names
// Used for displaying in player profiles

export const DISPLAY_POSITION_MAP: Record<string, string> = {
  // Spanish names
  'Arquero': 'Arquero',
  'Portero': 'Arquero',
  'GK': 'Arquero',
  'Defensor central': 'Defensor central',
  'Defensor Central': 'Defensor central',
  'Lateral derecho': 'Lateral derecho',
  'Lateral izquierdo': 'Lateral izquierdo',
  'Lateral': 'Lateral',
  'Carrilero': 'Carrilero',
  'Volante central': 'Volante central',
  'Mediocentro': 'Volante central',
  'Mediocentro defensivo': 'Volante interno',
  'Pivote': 'Volante central',
  'Volante interno': 'Volante interno',
  'Mediapunta': 'Delantero',
  'Interior': 'Volante interno',
  'Enganche': 'Volante interno',
  'Extremo derecho': 'Extremo',
  'Extremo izquierdo': 'Extremo',
  'Extremo': 'Extremo',
  'Delantero centro': 'Delantero',
  'Delantero': 'Delantero',
  'Segundo delantero': 'Delantero',
  'Ariete': 'Delantero',
  // Wyscout position codes
  'RCB': 'Defensor central',
  'LCB': 'Defensor central',
  'RCB3': 'Defensor central',
  'LCB3': 'Defensor central',
  'CB': 'Defensor central',
  'RB': 'Lateral derecho',
  'LB': 'Lateral izquierdo',
  'RWB': 'Lateral derecho',
  'LWB': 'Lateral izquierdo',
  'RCMF': 'Volante central',
  'LCMF': 'Volante central',
  'RCMF3': 'Volante central',
  'LCMF3': 'Volante central',
  'DMF': 'Volante central',
  'RDMF': 'Volante central',
  'LDMF': 'Volante central',
  'AMF': 'Delantero',
  'RAMF': 'Delantero',
  'LAMF': 'Delantero',
  'RW': 'Extremo',
  'LW': 'Extremo',
  'RWF': 'Extremo',
  'LWF': 'Extremo',
  'CF': 'Delantero',
  'SS': 'Delantero',
}

// ─── SCORING WEIGHTS ──────────────────────────────────────────────────────────
// All weights per position sum to 100

export interface MetricWeight {
  column: string
  weight: number
}

export const SCORING_CONFIG: Record<string, MetricWeight[]> = {
  'Arquero': [
    { column: 'Goles evitados/90',              weight: 38 },
    { column: 'Paradas, %',                      weight: 20 },
    { column: 'Porterías imbatidas en los 90',   weight: 16 },
    { column: 'Salidas/90',                      weight: 10 },
    { column: 'Duelos aéreos en los 90',         weight: 9  },
    { column: 'Altura',                          weight: 7  },
  ],
  'Defensor Central': [
    { column: 'Duelos ganados, %',                    weight: 14 },
    { column: 'Duelos defensivos ganados, %',         weight: 15 },
    { column: 'Duelos aéreos ganados, %',             weight: 15 },
    { column: 'Interceptaciones/90',                  weight: 3  },
    { column: 'Precisión pases largos, %',            weight: 7  },
    { column: 'Carreras en progresión/90',            weight: 11 },
    { column: 'Pases hacia adelante/90',              weight: 4  },
    { column: 'Precisión pases hacia adelante, %',    weight: 6  },
    { column: 'Pases progresivos exitosos/90',        weight: 13 },
    { column: 'Pases precisos/90',                    weight: 4  },
    { column: 'Entradas/90',                          weight: 4  },
  ],
  'Lateral': [
    { column: 'Acciones de ataque exitosas/90',       weight: 7  },
    { column: 'Duelos ganados, %',                    weight: 8  },
    { column: 'Duelos defensivos ganados, %',         weight: 7  },
    { column: 'Duelos aéreos ganados, %',             weight: 4  },
    { column: 'Pases progresivos exitosos/90',        weight: 4  },
    { column: 'Remates/90',                           weight: 4  },
    { column: 'Carreras en progresión/90',            weight: 5  },
    { column: 'xA/90',                                weight: 8  },
    { column: 'Centros precisos/90',                  weight: 5  },
    { column: 'Gambetas completadas/90',              weight: 8  },
    { column: 'Duelos atacantes ganados/90',          weight: 9  },
    { column: 'Toques en el área de penalti/90',      weight: 5  },
    { column: 'Faltas recibidas/90',                  weight: 2  },
    { column: 'Jugadas claves/90',                    weight: 8  },
    { column: 'Ataque en profundidad/90',             weight: 5  },
    { column: 'Duelos atacantes ganados, %',          weight: 4  },
    { column: 'Gambetas completadas, %',              weight: 3  },
    { column: 'xG',                                   weight: 4  },
  ],
  'Volante central': [
    { column: 'Duelos ganados, %',                    weight: 12 },
    { column: 'Duelos defensivos ganados, %',         weight: 12 },
    { column: 'Duelos aéreos ganados, %',             weight: 6  },
    { column: 'Pases progresivos exitosos/90',        weight: 18 },
    { column: 'Pases hacia adelante/90',              weight: 13 },
    { column: 'Precisión pases hacia adelante, %',    weight: 13 },
    { column: 'Interceptaciones/90',                  weight: 5  },
    { column: 'Acciones defensivas realizadas/90',    weight: 6  },
    { column: 'Precisión pases largos, %',            weight: 7  },
    { column: 'Entradas/90',                          weight: 8  },
  ],
  'Volante interno': [
    { column: 'Duelos ganados, %',                    weight: 6  },
    { column: 'Duelos defensivos ganados, %',         weight: 4  },
    { column: 'Pases progresivos exitosos/90',        weight: 6  },
    { column: 'Pases hacia adelante/90',              weight: 3  },
    { column: 'Precisión pases hacia adelante, %',    weight: 5  },
    { column: 'Interceptaciones/90',                  weight: 1  },
    { column: 'Acciones defensivas realizadas/90',    weight: 6  },
    { column: 'Precisión pases largos, %',            weight: 3  },
    { column: 'Entradas/90',                          weight: 4  },
    { column: 'Carreras en progresión/90',            weight: 4  },
    { column: 'xA/90',                                weight: 7  },
    { column: 'Gambetas completadas/90',              weight: 6  },
    { column: 'Duelos atacantes ganados/90',          weight: 6  },
    { column: 'Toques en el área de penalti/90',      weight: 5  },
    { column: 'Faltas recibidas/90',                  weight: 2  },
    { column: 'Jugadas claves/90',                    weight: 7  },
    { column: 'Ataque en profundidad/90',             weight: 4  },
    { column: 'Acciones de ataque exitosas/90',       weight: 6  },
    { column: 'xG',                                   weight: 7  },
    { column: 'Gambetas completadas, %',              weight: 4  },
    { column: 'Duelos atacantes ganados, %',          weight: 4  },
  ],
  'Extremo': [
    { column: 'Duelos ganados, %',                    weight: 8  },
    { column: 'Pases progresivos exitosos/90',        weight: 3  },
    { column: 'Carreras en progresión/90',            weight: 7  },
    { column: 'xA/90',                                weight: 11 },
    { column: 'Gambetas completadas/90',              weight: 11 },
    { column: 'Duelos atacantes ganados/90',          weight: 11 },
    { column: 'Toques en el área de penalti/90',      weight: 3  },
    { column: 'Faltas recibidas/90',                  weight: 3  },
    { column: 'Jugadas claves/90',                    weight: 9  },
    { column: 'Ataque en profundidad/90',             weight: 2  },
    { column: 'Acciones de ataque exitosas/90',       weight: 6  },
    { column: 'xG',                                   weight: 5  },
    { column: 'Goles',                                weight: 11 },
    { column: 'Duelos atacantes ganados, %',          weight: 5  },
    { column: 'Gambetas completadas, %',              weight: 5  },
  ],
  'Delantero': [
    { column: 'Duelos ganados, %',                    weight: 7  },
    { column: 'xA/90',                                weight: 5  },
    { column: 'Gambetas completadas/90',              weight: 7  },
    { column: 'Duelos atacantes ganados/90',          weight: 7  },
    { column: 'Acciones de ataque exitosas/90',       weight: 7  },
    { column: 'Goles',                                weight: 37 },
    { column: 'Duelos aéreos ganados, %',             weight: 17 },
    { column: 'Duelos atacantes ganados, %',          weight: 7  },
    { column: 'Gambetas completadas, %',              weight: 6  },
  ],
}

// ─── API-FOOTBALL RADAR METRICS ──────────────────────────────────────────────
// Radar chart metrics mapped to API-Football stat fields (used when Supabase data is available)

export const API_RADAR_METRICS: Record<string, Array<{ key: string; label: string }>> = {
  ARQ: [
    { key: 'saves', label: 'Atajadas' },
    { key: 'goals_conceded', label: 'Goles Rec. (inv)' },
    { key: 'rating', label: 'Rating' },
    { key: 'passes_accuracy', label: 'Prec. Pases' },
    { key: 'duels_won_pct', label: 'Duelos %' },
  ],
  CB: [
    { key: 'duels_won_pct', label: 'Duelos %' },
    { key: 'tackles', label: 'Entradas' },
    { key: 'interceptions', label: 'Intercepciones' },
    { key: 'blocks', label: 'Bloqueos' },
    { key: 'passes_accuracy', label: 'Prec. Pases' },
    { key: 'rating', label: 'Rating' },
    { key: 'passes_total', label: 'Pases' },
  ],
  LD: [
    { key: 'duels_won_pct', label: 'Duelos %' },
    { key: 'passes_key', label: 'Pases Clave' },
    { key: 'dribbles_success', label: 'Regates' },
    { key: 'assists', label: 'Asistencias' },
    { key: 'tackles', label: 'Entradas' },
    { key: 'passes_accuracy', label: 'Prec. Pases' },
    { key: 'interceptions', label: 'Intercepciones' },
    { key: 'rating', label: 'Rating' },
  ],
  LI: [
    { key: 'duels_won_pct', label: 'Duelos %' },
    { key: 'passes_key', label: 'Pases Clave' },
    { key: 'dribbles_success', label: 'Regates' },
    { key: 'assists', label: 'Asistencias' },
    { key: 'tackles', label: 'Entradas' },
    { key: 'passes_accuracy', label: 'Prec. Pases' },
    { key: 'interceptions', label: 'Intercepciones' },
    { key: 'rating', label: 'Rating' },
  ],
  VC: [
    { key: 'tackles', label: 'Entradas' },
    { key: 'duels_won_pct', label: 'Duelos %' },
    { key: 'interceptions', label: 'Intercepciones' },
    { key: 'passes_accuracy', label: 'Prec. Pases' },
    { key: 'passes_total', label: 'Pases' },
    { key: 'blocks', label: 'Bloqueos' },
    { key: 'rating', label: 'Rating' },
    { key: 'passes_key', label: 'Pases Clave' },
  ],
  VI: [
    { key: 'duels_won_pct', label: 'Duelos %' },
    { key: 'passes_key', label: 'Pases Clave' },
    { key: 'dribbles_success', label: 'Regates' },
    { key: 'assists', label: 'Asistencias' },
    { key: 'goals', label: 'Goles' },
    { key: 'passes_accuracy', label: 'Prec. Pases' },
    { key: 'shots_on', label: 'Tiros al Arco' },
    { key: 'rating', label: 'Rating' },
  ],
  EXT: [
    { key: 'dribbles_success', label: 'Regates' },
    { key: 'goals', label: 'Goles' },
    { key: 'assists', label: 'Asistencias' },
    { key: 'passes_key', label: 'Pases Clave' },
    { key: 'shots_on', label: 'Tiros al Arco' },
    { key: 'duels_won_pct', label: 'Duelos %' },
    { key: 'rating', label: 'Rating' },
  ],
  DEL: [
    { key: 'goals', label: 'Goles' },
    { key: 'shots_on', label: 'Tiros al Arco' },
    { key: 'assists', label: 'Asistencias' },
    { key: 'passes_key', label: 'Pases Clave' },
    { key: 'duels_won_pct', label: 'Duelos %' },
    { key: 'dribbles_success', label: 'Regates' },
    { key: 'rating', label: 'Rating' },
  ],
}

// ─── RADAR CHART METRICS (WYSCOUT/CSV) ──────────────────────────────────────
// 8 representative metrics per position for radar visualization (legacy CSV data)

export const RADAR_METRICS: Record<string, string[]> = {
  'Arquero': [
    'Goles evitados/90',
    'Paradas, %',
    'Porterías imbatidas en los 90',
    'Salidas/90',
    'Duelos aéreos en los 90',
    'Goles recibidos/90',
    'xG en contra/90',
  ],
  'Defensor Central': [
    'Duelos ganados, %',
    'Duelos defensivos ganados, %',
    'Duelos aéreos ganados, %',
    'Pases progresivos exitosos/90',
    'Carreras en progresión/90',
    'Precisión pases largos, %',
    'Precisión pases hacia adelante, %',
    'Pases hacia adelante/90',
    'Pases al tercer tercio/90',
    'Interceptaciones/90',
    'Pases precisos/90',
  ],
  'Lateral': [
    'Acciones de ataque exitosas/90',
    'xA/90',
    'Centros precisos/90',
    'Gambetas completadas/90',
    'Duelos atacantes ganados/90',
    'Duelos defensivos ganados, %',
    'Pases progresivos exitosos/90',
    'Jugadas claves/90',
  ],
  'Volante central': [
    'Duelos ganados, %',
    'Duelos defensivos ganados, %',
    'Pases progresivos exitosos/90',
    'Pases hacia adelante/90',
    'Precisión pases hacia adelante, %',
    'Interceptaciones/90',
    'Entradas/90',
    'Precisión pases largos, %',
  ],
  'Volante interno': [
    'Duelos ganados, %',
    'Pases progresivos exitosos/90',
    'xA/90',
    'Gambetas completadas/90',
    'Duelos atacantes ganados/90',
    'Jugadas claves/90',
    'Acciones de ataque exitosas/90',
    'Interceptaciones/90',
  ],
  'Extremo': [
    'Gambetas completadas/90',
    'xA/90',
    'Duelos atacantes ganados/90',
    'Jugadas claves/90',
    'Carreras en progresión/90',
    'Toques en el área de penalti/90',
    'Acciones de ataque exitosas/90',
    'Duelos ganados, %',
  ],
  'Delantero': [
    'Goles',
    'xA/90',
    'Gambetas completadas/90',
    'Duelos atacantes ganados/90',
    'Acciones de ataque exitosas/90',
    'Duelos ganados, %',
    'Duelos aéreos ganados, %',
    'Toques en el área de penalti/90',
  ],
}

// ─── METRIC LABEL ABBREVIATIONS ──────────────────────────────────────────────

// Etiquetas con unidad explícita:
//   "/90"        = cantidad cada 90 minutos (comparable entre jugadores con distintos minutos)
//   "%"          = tasa de éxito / porcentaje
//   "(temporada)"= total acumulado en la temporada (no normalizado por minutos)
export const METRIC_ABBREVIATIONS: Record<string, string> = {
  'Duelos ganados, %':                    'Duelos ganados %',
  'Duelos defensivos ganados, %':         'Duelos def. %',
  'Duelos aéreos ganados, %':             'Duelos aéreos %',
  'Interceptaciones/90':                  'Interceptaciones /90',
  'Precisión pases largos, %':            'Pases largos %',
  'Carreras en progresión/90':            'Progresiones /90',
  'Pases hacia adelante/90':              'Pases adelante /90',
  'Precisión pases hacia adelante, %':    'Prec. pases ad. %',
  'Pases progresivos exitosos/90':        'Pases progresivos /90',
  'Pases al tercer tercio/90':            'P. últ. tercio /90',
  'Pases precisos/90':                    'Pases precisos /90',
  'Acciones de ataque exitosas/90':       'Acc. ataque /90',
  'Remates/90':                           'Remates /90',
  'xA/90':                                'xA /90',
  'Centros precisos/90':                  'Centros /90',
  'Gambetas completadas/90':              'Gambetas /90',
  'Duelos atacantes ganados/90':          'Duelos ofensivos /90',
  'Toques en el área de penalti/90':      'Toques en área /90',
  'Faltas recibidas/90':                  'Faltas recibidas /90',
  'Jugadas claves/90':                    'Jugadas claves /90',
  'Ataque en profundidad/90':             'En profundidad /90',
  'Acciones defensivas realizadas/90':    'Acc. defensivas /90',
  'Entradas/90':                          'Entradas /90',
  'xG':                                   'xG (temporada)',
  'xG/90':                                'xG /90',
  'Goles':                                'Goles (temporada)',
  'Goles/90':                             'Goles /90',
  'Asistencias/90':                       'Asistencias /90',
  'Gambetas completadas, %':              'Gambetas %',
  'Duelos atacantes ganados, %':          'Duelos ofensivos %',
  // Arquero
  'Goles evitados/90':                    'Goles evitados /90',
  'Paradas, %':                           'Paradas %',
  'Porterías imbatidas en los 90':        'Port. imbatidas /90',
  'Salidas/90':                           'Salidas /90',
  'Duelos aéreos en los 90':             'Duelos aéreos /90',
  'Goles recibidos/90':                   'Goles recibidos /90',
  'xG en contra/90':                      'xG en contra /90',
  'Remates en contra/90':                 'Remates en contra /90',
}

// ─── KEY DISPLAY METRICS BY POSITION (General Tab) ───────────────────────────

export const DISPLAY_METRICS: Record<string, string[]> = {
  'Arquero': [
    'Partidos jugados', 'Minutos jugados',
    'Goles evitados/90', 'Paradas, %', 'Porterías imbatidas en los 90',
    'Salidas/90', 'Duelos aéreos en los 90', 'Goles recibidos/90',
    'xG en contra/90', 'Remates en contra/90',
  ],
  'Defensor Central': [
    'Partidos jugados', 'Minutos jugados',
    'Duelos ganados, %', 'Duelos defensivos ganados, %', 'Duelos aéreos ganados, %',
    'Interceptaciones/90', 'Pases progresivos exitosos/90', 'Carreras en progresión/90',
    'Precisión pases largos, %', 'Precisión pases hacia adelante, %',
  ],
  'Lateral': [
    'Partidos jugados', 'Minutos jugados',
    'Acciones de ataque exitosas/90', 'xA/90', 'Centros precisos/90',
    'Gambetas completadas/90', 'Duelos atacantes ganados/90', 'Jugadas claves/90',
    'Duelos defensivos ganados, %', 'Pases progresivos exitosos/90',
  ],
  'Volante central': [
    'Partidos jugados', 'Minutos jugados',
    'Pases progresivos exitosos/90', 'Pases hacia adelante/90',
    'Precisión pases hacia adelante, %', 'Duelos ganados, %',
    'Duelos defensivos ganados, %', 'Interceptaciones/90',
    'Entradas/90', 'Precisión pases largos, %',
  ],
  'Volante interno': [
    'Partidos jugados', 'Minutos jugados',
    'Pases progresivos exitosos/90', 'xA/90', 'Gambetas completadas/90',
    'Jugadas claves/90', 'Acciones de ataque exitosas/90',
    'Duelos atacantes ganados/90', 'Entradas/90', 'Interceptaciones/90',
  ],
  'Extremo': [
    'Partidos jugados', 'Minutos jugados', 'Goles', 'Asistencias',
    'Gambetas completadas/90', 'xA/90', 'Duelos atacantes ganados/90',
    'Jugadas claves/90', 'Carreras en progresión/90', 'xG',
  ],
  'Delantero': [
    'Partidos jugados', 'Minutos jugados', 'Goles', 'Asistencias',
    'xG', 'xA/90', 'Duelos aéreos ganados, %',
    'Gambetas completadas/90', 'Duelos atacantes ganados/90',
    'Acciones de ataque exitosas/90',
  ],
  '_default': [
    'Partidos jugados', 'Minutos jugados', 'Goles', 'Asistencias',
    'xG', 'xA', 'Duelos ganados, %', 'Pases progresivos exitosos/90',
    'Carreras en progresión/90', 'Interceptaciones/90',
  ],
}

// ─── METRIC CATEGORIES FOR CHARTS ────────────────────────────────────────────

export const METRIC_CATEGORIES: Record<string, string[]> = {
  'Identificacion': [
    'Jugador', 'Equipo', 'Liga', 'Nacionalidad', 'Posición', 'Posición específica',
    'Fecha de nacimiento', 'Fin de contrato', 'Pie bueno', 'Imagen',
  ],
  'Goles y creacion': [
    'Goles', 'Asistencias', 'xG', 'xA', 'xG/90', 'xA/90',
    'Goles de penalti', 'Penaltis ejecutados', 'Goles con la cabeza',
  ],
  'Remates': [
    'Remates/90', 'Remates a portería/90', 'Remates a portería, %',
    'Precisión de remate, %', 'Toques en el área de penalti/90',
  ],
  'Pases': [
    'Pases/90', 'Pases precisos/90', 'Pases, %',
    'Pases hacia adelante/90', 'Precisión pases hacia adelante, %',
    'Pases largos/90', 'Precisión pases largos, %',
    'Pases progresivos exitosos/90', 'Jugadas claves/90', 'Asistencias de tiro/90',
    'Segundas asistencias/90', 'Pases al tercio final, %', 'Pases al tercio final/90',
  ],
  'Centros': [
    'Centros/90', 'Centros precisos/90', 'Precisión centros, %',
  ],
  'Regates y ataque': [
    'Gambetas completadas/90', 'Gambetas completadas, %',
    'Duelos atacantes ganados/90', 'Duelos atacantes ganados, %',
    'Acciones de ataque exitosas/90', 'Carreras en progresión/90',
    'Ataque en profundidad/90', 'Faltas recibidas/90',
  ],
  'Defensa': [
    'Duelos ganados, %', 'Duelos defensivos ganados, %', 'Duelos aéreos ganados, %',
    'Interceptaciones/90', 'Entradas/90', 'Rechaces/90',
    'Acciones defensivas realizadas/90', 'Bloqueos/90',
  ],
  'Porteria': [
    'Paradas/90', 'Paradas, %', 'Goles en contra', 'Goles en contra/90',
    'xG en contra', 'xG en contra/90', 'Salidas/90',
    'Goles recibidos', 'Goles recibidos/90', 'Goles evitados', 'Goles evitados/90',
    'Porterías imbatidas en los 90', 'Remates en contra', 'Remates en contra/90',
    'Duelos aéreos en los 90',
  ],
  'General': [
    'ggScore', 'Partidos jugados', 'Minutos jugados', 'minutesPlayed', 'ageNum',
    'marketValueRaw', 'monthsRemaining',
  ],
}

// All available metrics for chart selection (flattened and deduplicated)
export const ALL_METRICS: string[] = Array.from(new Set(
  Object.values(METRIC_CATEGORIES).flat()
))

// ─── LEAGUE ORDERING ──────────────────────────────────────────────────────────
// Leagues available in the platform, ordered by priority
export const ORDERED_LEAGUES = [
  'Liga Argentina',
  '2° Argentina',
  'Liga Uruguay',
  'Liga Chile',
  'Liga Paraguay',
  'Liga Colombia',
  '2° Colombia',
] as const

// Helper to sort leagues by priority (unknown leagues go to the end)
export function sortLeaguesByPriority(leagues: string[]): string[] {
  return leagues.sort((a, b) => {
    const indexA = ORDERED_LEAGUES.indexOf(a as typeof ORDERED_LEAGUES[number])
    const indexB = ORDERED_LEAGUES.indexOf(b as typeof ORDERED_LEAGUES[number])
    // If both are in the list, sort by index
    if (indexA !== -1 && indexB !== -1) return indexA - indexB
    // If only one is in the list, that one comes first
    if (indexA !== -1) return -1
    if (indexB !== -1) return 1
    // Both unknown, sort alphabetically
    return a.localeCompare(b)
  })
}
