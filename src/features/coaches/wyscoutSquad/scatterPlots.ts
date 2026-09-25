// src/features/coaches/wyscoutSquad/scatterPlots.ts
// Graficos de dispersion por puesto: cada jugador es un punto (dos metricas), las lineas
// son la mediana del grupo y el cuadrante de arriba a la derecha es el de los que rinden
// por encima en las dos cosas. Lo usan la pagina y el PDF.
import { attempts, metricValue, type AnyMetric } from './squadMetrics'
import type { MetricFormat } from './widgetDefs'
import type { SquadPlayer } from './wyscoutSquadTypes'

export type PositionGroup = 'centrales' | 'laterales' | 'volantes' | 'extremos' | 'delanteros'

/** Codigos de puesto de Wyscout por grupo. Un jugador entra en todos los grupos de los
 *  puestos que figuran en su ficha (Avalos: volante y central). */
export const POSITION_GROUPS: Record<PositionGroup, { label: string; codes: string[] }> = {
  centrales: { label: 'Centrales', codes: ['CB', 'LCB', 'RCB'] },
  laterales: { label: 'Laterales', codes: ['LB', 'RB', 'LWB', 'RWB'] },
  volantes: { label: 'Volantes', codes: ['DMF', 'LDMF', 'RDMF', 'CMF', 'LCMF', 'RCMF', 'AMF'] },
  extremos: { label: 'Extremos', codes: ['LW', 'RW', 'LAMF', 'RAMF', 'LWF', 'RWF'] },
  delanteros: { label: 'Delanteros', codes: ['CF', 'SS'] },
}

export interface ScatterAxis {
  key: AnyMetric
  label: string
  format: MetricFormat
  /** Para porcentajes: minimo de acciones en la temporada para entrar. */
  minAttempts?: { per90: AnyMetric; min: number }
}

export interface ScatterDef {
  id: string
  group: PositionGroup
  title: string
  /** Que muestra, en una frase. */
  question: string
  x: ScatterAxis
  y: ScatterAxis
}

const pct = (key: AnyMetric, label: string, per90: AnyMetric, min: number): ScatterAxis => ({ key, label, format: 'pct', minAttempts: { per90, min } })
const p90 = (key: AnyMetric, label: string): ScatterAxis => ({ key, label, format: 'dec2' })

export const SCATTER_DEFS: ScatterDef[] = [
  {
    id: 'centrales-duelos', group: 'centrales', title: 'Centrales: en el piso y en el aire',
    question: 'Qué porcentaje de duelos defensivos y de duelos aéreos gana cada central.',
    x: pct('def_duels_won_pct', 'Duelos defensivos ganados %', 'def_duels_p90', 15),
    y: pct('aerial_won_pct', 'Duelos aéreos ganados %', 'aerial_p90', 10),
  },
  {
    id: 'centrales-salida', group: 'centrales', title: 'Centrales: defender y salir jugando',
    question: 'Duelos ganados en general contra pases progresivos acertados cada 90 minutos.',
    x: pct('duels_won_pct', 'Duelos ganados %', 'duels_p90', 20),
    y: p90('prog_passes_acc_p90', 'Pases progresivos acertados/90'),
  },
  {
    id: 'laterales', group: 'laterales', title: 'Laterales: ida y vuelta',
    question: 'Centros precisos cada 90 minutos contra porcentaje de duelos defensivos ganados.',
    x: p90('crosses_acc_p90', 'Centros precisos/90'),
    y: pct('def_duels_won_pct', 'Duelos defensivos ganados %', 'def_duels_p90', 15),
  },
  {
    id: 'volantes-recupera', group: 'volantes', title: 'Volantes: recuperar y hacer avanzar',
    question: 'Intercepciones contra pases progresivos acertados, cada 90 minutos.',
    x: p90('interceptions_p90', 'Intercepciones/90'),
    y: p90('prog_passes_acc_p90', 'Pases progresivos acertados/90'),
  },
  {
    id: 'volantes-crea', group: 'volantes', title: 'Volantes: crear y conducir',
    question: 'Jugadas clave contra carreras en progresión, cada 90 minutos.',
    x: p90('key_passes_p90', 'Jugadas clave/90'),
    y: p90('prog_runs_p90', 'Carreras en progresión/90'),
  },
  {
    id: 'extremos-desequilibrio', group: 'extremos', title: 'Extremos: desequilibrio y último pase',
    question: 'Gambetas completadas contra jugadas clave, cada 90 minutos.',
    x: p90('dribbles_won_p90', 'Gambetas completadas/90'),
    y: p90('key_passes_p90', 'Jugadas clave/90'),
  },
  {
    id: 'extremos-uno-contra-uno', group: 'extremos', title: 'Extremos: uno contra uno y conducción',
    question: 'Duelos en ataque ganados contra carreras en progresión, cada 90 minutos.',
    x: p90('off_duels_won_p90', 'Duelos en ataque ganados/90'),
    y: p90('prog_runs_p90', 'Carreras en progresión/90'),
  },
  {
    id: 'delanteros-gol', group: 'delanteros', title: 'Delanteros: llegar y convertir',
    question: 'Goles esperados (xG) contra goles hechos, cada 90 minutos.',
    x: p90('xg_p90', 'xG/90'),
    y: p90('goals_p90', 'Goles/90'),
  },
  {
    id: 'delanteros-area', group: 'delanteros', title: 'Delanteros: pelea y área',
    question: 'Duelos en ataque ganados contra toques en el área rival, cada 90 minutos.',
    x: p90('off_duels_won_p90', 'Duelos en ataque ganados/90'),
    y: p90('box_touches_p90', 'Toques en el área/90'),
  },
]

export function inGroup(p: SquadPlayer, group: PositionGroup): boolean {
  const codes = POSITION_GROUPS[group].codes
  return p.positions.some(pos => codes.includes(pos))
}

export function median(values: number[]): number | null {
  if (!values.length) return null
  const v = [...values].sort((a, b) => a - b)
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
}

export interface ScatterPoint {
  name: string
  x: number
  y: number
  /** Arriba a la derecha: por encima de la mediana en las dos. */
  best: boolean
}

export interface ScatterData {
  points: ScatterPoint[]
  xMid: number | null
  yMid: number | null
}

function axisValue(p: SquadPlayer, axis: ScatterAxis, teamMatches: number): number | null {
  if (axis.minAttempts && (attempts(p, axis.minAttempts.per90, teamMatches) ?? 0) < axis.minAttempts.min) return null
  return metricValue(p, axis.key, teamMatches)
}

export function buildScatter(players: SquadPlayer[], def: ScatterDef, opts: { minMinutes: number; teamMatches: number }): ScatterData {
  const raw = players
    .filter(p => inGroup(p, def.group) && (p.stats.minutes ?? 0) >= opts.minMinutes)
    .map(p => ({ name: p.name, x: axisValue(p, def.x, opts.teamMatches), y: axisValue(p, def.y, opts.teamMatches) }))
    .filter((p): p is { name: string; x: number; y: number } => p.x !== null && p.y !== null && Number.isFinite(p.x) && Number.isFinite(p.y))
  const xMid = median(raw.map(p => p.x))
  const yMid = median(raw.map(p => p.y))
  return {
    points: raw.map(p => ({ ...p, best: xMid !== null && yMid !== null && p.x > xMid && p.y > yMid })),
    xMid,
    yMid,
  }
}

/** Rango del eje con un margen, para que ningun punto quede pegado al borde. */
export function axisRange(values: number[], isPct: boolean): { lo: number; hi: number } {
  if (!values.length) return { lo: 0, hi: 1 }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const pad = Math.max((max - min) * 0.12, isPct ? 4 : 0.05)
  const lo = isPct ? Math.max(0, min - pad) : Math.max(0, min - pad)
  const hi = isPct ? Math.min(100, max + pad) : max + pad
  return { lo, hi: hi > lo ? hi : lo + 1 }
}

/** Apellido para la etiqueta del punto ("F. Brandán" -> "Brandán"). */
export function pointLabel(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length > 1 ? parts[parts.length - 1] : name
}

export interface LabelBox { x: number; y: number; anchor: 'start' | 'end' }

/** Ubica el nombre de cada punto (a la derecha, a la izquierda, arriba o abajo) evitando que
 *  se pise con otro nombre o se salga del grafico. Coordenadas en pixeles del dibujo. */
export function placeLabels(
  pts: { px: number; py: number; text: string }[],
  bounds: { left: number; right: number; top: number; bottom: number },
  charW: number,
  lineH: number,
  /** Zonas ocupadas que los nombres tienen que esquivar (p. ej. el texto del recuadro). */
  obstacles: { x0: number; x1: number; y0: number; y1: number }[] = [],
): LabelBox[] {
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = [...obstacles]
  const overlaps = (b: { x0: number; x1: number; y0: number; y1: number }) =>
    placed.some(o => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0)
  return pts.map(p => {
    const w = p.text.length * charW
    const tries: LabelBox[] = [
      { x: p.px + 7, y: p.py + lineH / 3, anchor: 'start' },
      { x: p.px - 7, y: p.py + lineH / 3, anchor: 'end' },
      { x: p.px + 6, y: p.py - lineH * 0.8, anchor: 'start' },
      { x: p.px + 6, y: p.py + lineH * 1.3, anchor: 'start' },
      { x: p.px - 6, y: p.py - lineH * 0.8, anchor: 'end' },
      { x: p.px - 6, y: p.py + lineH * 1.3, anchor: 'end' },
    ]
    const box = (t: LabelBox) => {
      const x0 = t.anchor === 'start' ? t.x : t.x - w
      return { x0, x1: x0 + w, y0: t.y - lineH * 0.8, y1: t.y + lineH * 0.2 }
    }
    const inside = (b: ReturnType<typeof box>) => b.x0 >= bounds.left && b.x1 <= bounds.right && b.y0 >= bounds.top && b.y1 <= bounds.bottom
    const pick = tries.find(t => inside(box(t)) && !overlaps(box(t))) ?? tries.find(t => inside(box(t))) ?? tries[0]
    placed.push(box(pick))
    return pick
  })
}
