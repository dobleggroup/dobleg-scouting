// src/features/coaches/wyscoutSquad/teamChartsPdf.ts
// Graficos del equipo para el PDF del Resumen, dibujados (vectoriales) con los mismos
// datos que los graficos de la pagina: eficacia del DT, nosotros vs. rival, evolucion de
// metricas, partido por partido, formaciones y zonas del informe de Wyscout.
import type { SeasonStats } from '@/features/coaches/seasonStats'
import { buildCumulativePoints, computeHomeAwaySplit } from '@/features/coaches/dtEfficiency'
import { metricValue as rowMetric, type EnrichedMatchRow } from '@/features/coaches/components/CoachMatchMetricsEvolution'
import { formatWyscoutMetricLabel } from '@/features/coaches/wyscoutTeamStats/metricLabels'
import type { PitchPoint, WyscoutReportData, WyscoutZoneGrid } from '@/features/coaches/wyscoutReport/wyscoutReportTypes'
import { C, M, LOCALE, TITLE_H, HEAD_H, blockTitle, descHeight, drawHead, drawCells, tiles, type Block, type Col, type Doc } from './pdfDoc'

const OWN = '#22C55E'
const RIVAL = '#DC2626'
const RESULT_DOT: Record<string, string> = { G: '#22C55E', E: '#8E8E93', P: '#DC2626' }
const GRASS_A = '#1F7A45'
const GRASS_B = '#1B6F3F'
const PITCH_LINE = '#FFFFFF'

const dm = (iso: string) => {
  const d = new Date(iso)
  return `${d.getDate()}/${d.getMonth() + 1}`
}

/** Eje con marcas redondas que cubre [0, max] en 4 tramos. */
function niceMax(max: number): { hi: number; step: number } {
  if (max <= 0) return { hi: 1, step: 0.25 }
  const raw = max / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? raw
  return { hi: step * 4, step }
}

function fmtTick(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toLocaleString(LOCALE, { maximumFractionDigits: 2 })
}

interface Series { values: (number | null)[]; color: string; label?: string }

/** Grafico de lineas con eje Y, fechas abajo y (opcional) puntos por resultado y promedio. */
function lineChart(d: Doc, x: number, y: number, w: number, h: number, opts: {
  title: string
  series: Series[]
  labels: string[]
  dotColors?: (string | null)[]
  avg?: number | null
  fixedMax?: number
  digits?: number
}) {
  d.rect(x, y, w, h, C.tile, 6)
  d.text(opts.title, x + 10, y + 15, { size: 8.6, bold: true })
  if (opts.avg != null) {
    d.text(`Prom.: ${opts.avg.toLocaleString(LOCALE, { minimumFractionDigits: opts.digits ?? 1, maximumFractionDigits: opts.digits ?? 1 })}`, x + w - 10, y + 15, { size: 7.2, color: C.muted, align: 'right' })
  }
  const legend = opts.series.filter(s => s.label)
  let lx = x + 10
  for (const s of legend) {
    d.rect(lx, y + 22, 8, 3, s.color, 1.5)
    d.text(s.label!, lx + 11, y + 26, { size: 6.6, color: C.muted })
    lx += d.width(s.label!, 6.6) + 24
  }
  const px = x + 30
  const py = y + (legend.length ? 34 : 26)
  const pw = w - 40
  const ph = h - (py - y) - 20
  const all = opts.series.flatMap(s => s.values).filter((v): v is number => v !== null)
  const { hi, step } = opts.fixedMax ? { hi: opts.fixedMax, step: opts.fixedMax / 4 } : niceMax(Math.max(...all, 0))
  for (let t = 0; t <= hi + 1e-9; t += step) {
    const ty = py + ph - (t / hi) * ph
    d.line(px, ty, px + pw, ty, '#E5E5EA', 0.4)
    d.text(fmtTick(t), px - 4, ty + 2.2, { size: 5.8, color: C.faint, align: 'right' })
  }
  const n = opts.labels.length
  const xAt = (i: number) => px + (n <= 1 ? pw / 2 : (i / (n - 1)) * pw)
  const yAt = (v: number) => py + ph - (Math.min(v, hi) / hi) * ph
  const every = Math.max(1, Math.ceil(n / 12))
  opts.labels.forEach((l, i) => {
    if (i % every === 0 || i === n - 1) d.text(l, xAt(i), py + ph + 10, { size: 5.6, color: C.faint, align: 'center' })
  })
  if (opts.avg != null) {
    d.pdf.setLineDashPattern([2, 2], 0)
    d.line(px, yAt(opts.avg), px + pw, yAt(opts.avg), C.faint, 0.6)
    d.pdf.setLineDashPattern([], 0)
  }
  for (const s of opts.series) {
    d.pdf.setDrawColor(s.color)
    d.pdf.setLineWidth(1.2)
    let prev: { x: number; y: number } | null = null
    s.values.forEach((v, i) => {
      if (v === null) return
      const p = { x: xAt(i), y: yAt(v) }
      if (prev) d.pdf.line(prev.x, prev.y, p.x, p.y)
      prev = p
    })
  }
  if (opts.dotColors) {
    opts.series[0].values.forEach((v, i) => {
      if (v === null) return
      d.pdf.setFillColor(opts.dotColors![i] ?? C.faint)
      d.pdf.circle(xAt(i), yAt(v), 1.8, 'F')
    })
  }
}

/* ------------------------------------------------------------ eficacia del DT */

function splitBars(d: Doc, x: number, y: number, w: number, label: string, home: number | null, away: number | null, isPct: boolean) {
  const max = Math.max(home ?? 0, away ?? 0, isPct ? 100 : 0.01)
  const fmt = (v: number | null) => (v === null ? '—' : isPct ? `${Math.round(v)}%` : v.toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
  d.text(label, x, y, { size: 7.2, color: C.muted })
  ;[['Local', home, OWN], ['Visitante', away, '#8E8E93']].forEach(([name, v, color], i) => {
    const ry = y + 8 + i * 16
    d.text(name as string, x, ry + 7, { size: 7.4, color: C.text })
    const bx = x + 52
    const bw = w - 52 - 36
    d.rect(bx, ry + 1, bw, 7, '#E5E5EA', 3.5)
    if (v !== null) d.rect(bx, ry + 1, Math.max(3, (bw * (v as number)) / max), 7, color as string, 3.5)
    d.text(fmt(v as number | null), x + w, ry + 7.5, { size: 7.4, bold: true, align: 'right' })
  })
}

export function efficiencyBlock(d: Doc, rows: EnrichedMatchRow[], stats: SeasonStats | null): Block | null {
  if (!stats || stats.played === 0) return null
  const pts = stats.possiblePoints > 0 ? (stats.points / stats.possiblePoints) * 100 : null
  const win = stats.played > 0 ? (stats.won / stats.played) * 100 : null
  const ppg = stats.played > 0 ? stats.points / stats.played : null
  const { home, away } = computeHomeAwaySplit(rows)
  const cum = buildCumulativePoints(rows)
  const chartH = 122
  return {
    h: TITLE_H + 6 + 48 + 12 + chartH,
    draw: (d, y) => {
      blockTitle(d, y, 'Eficacia del DT')
      tiles(d, y + TITLE_H + 6, [
        [pts === null ? '—' : `${Math.round(pts)}%`, `Eficacia en puntos (${stats.points} de ${stats.possiblePoints})`],
        [win === null ? '—' : `${Math.round(win)}%`, `Victorias (${stats.won} de ${stats.played})`],
        [ppg === null ? '—' : ppg.toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 'Puntos por partido'],
      ])
      const cy = y + TITLE_H + 6 + 48 + 12
      const half = (d.CW - 10) / 2
      d.rect(M, cy, half, chartH, C.tile, 6)
      d.text('Local vs. visitante', M + 10, cy + 15, { size: 8.6, bold: true })
      splitBars(d, M + 10, cy + 30, half - 20, 'Puntos por partido', home.ppg, away.ppg, false)
      splitBars(d, M + 10, cy + 76, half - 20, '% de victorias', home.winPct, away.winPct, true)
      lineChart(d, M + half + 10, cy, half, chartH, {
        title: 'Puntos acumulados',
        series: [{ values: cum.map(c => c.points), color: OWN }],
        labels: cum.map(c => dm(c.date)),
      })
    },
  }
}

/* ------------------------------------------------------------ nosotros vs. rival */

const VS_RIVAL: { title: string; own: (r: EnrichedMatchRow) => number | null; rival: (r: EnrichedMatchRow) => number | null; pct?: boolean }[] = [
  { title: 'xG por partido', own: r => rowMetric(r, 'xg_for'), rival: r => rowMetric(r, 'xg_against') },
  { title: 'Posesión (%)', own: r => rowMetric(r, 'possession_pct'), rival: r => { const v = rowMetric(r, 'possession_pct'); return v === null ? null : 100 - v }, pct: true },
  { title: 'Tiros a la portería', own: r => rowMetric(r, 'tiros_/_a_la_porteria_2'), rival: r => rowMetric(r, 'tiros_en_contra_/_a_la_porteria_2') },
  { title: 'Duelos ganados (%)', own: r => rowMetric(r, 'duelos_/_ganados_3'), rival: r => { const v = rowMetric(r, 'duelos_/_ganados_3'); return v === null ? null : 100 - v }, pct: true },
  { title: 'Duelos aéreos ganados (%)', own: r => rowMetric(r, 'duelos_aereos_/_ganados_3'), rival: r => { const v = rowMetric(r, 'duelos_aereos_/_ganados_3'); return v === null ? null : 100 - v }, pct: true },
]

const DESC_VS = 'Partido por partido, lo nuestro (verde) contra lo del rival (rojo). La posesión y los duelos del rival son el complemento del nuestro (100 menos el propio).'

export function vsRivalBlock(d: Doc, rows: EnrichedMatchRow[]): Block | null {
  if (rows.length < 2) return null
  const chartH = 140
  const top = descHeight(d, DESC_VS) + 4
  const perRow = 3
  const nRows = Math.ceil(VS_RIVAL.length / perRow)
  return {
    h: top + nRows * (chartH + 10),
    draw: (d, y) => {
      blockTitle(d, y, 'Nosotros vs. rival', DESC_VS)
      const w = (d.CW - 10 * (perRow - 1)) / perRow
      VS_RIVAL.forEach((c, i) => {
        lineChart(d, M + (i % perRow) * (w + 10), y + top + Math.floor(i / perRow) * (chartH + 10), w, chartH, {
          title: c.title,
          series: [
            { values: rows.map(c.own), color: OWN, label: 'Nosotros' },
            { values: rows.map(c.rival), color: RIVAL, label: 'Rival' },
          ],
          labels: rows.map(r => dm(r.date)),
          fixedMax: c.pct ? 100 : undefined,
        })
      })
    },
  }
}

/* ------------------------------------------------------------ evolucion de metricas */

export const EVOLUTION_METRICS = ['possession_pct', 'xg_for', 'xg_against', 'tiros_/_a_la_porteria_2']

function evolutionTitle(key: string): string {
  if (key === 'possession_pct') return 'Posesión (%)'
  if (key === 'xg_for') return 'xG a favor'
  if (key === 'xg_against') return 'xG en contra'
  return formatWyscoutMetricLabel(key)
}

const DESC_EVO = 'Cada punto es un partido: verde si se ganó, gris si se empató, rojo si se perdió. La línea punteada es el promedio.'

export function evolutionBlock(d: Doc, rows: EnrichedMatchRow[], metrics: string[] = EVOLUTION_METRICS): Block | null {
  if (rows.length < 2) return null
  const chartH = 140
  const top = descHeight(d, DESC_EVO) + 4
  const nRows = Math.ceil(metrics.length / 2)
  return {
    h: top + nRows * (chartH + 10),
    draw: (d, y) => {
      blockTitle(d, y, 'Evolución de métricas', DESC_EVO)
      const w = (d.CW - 10) / 2
      metrics.forEach((key, i) => {
        const values = rows.map(r => rowMetric(r, key))
        const nums = values.filter((v): v is number => v !== null)
        lineChart(d, M + (i % 2) * (w + 10), y + top + Math.floor(i / 2) * (chartH + 10), w, chartH, {
          title: evolutionTitle(key),
          series: [{ values, color: '#22C55E' }],
          labels: rows.map(r => dm(r.date)),
          dotColors: rows.map(r => (r.result ? RESULT_DOT[r.result] : null)),
          avg: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null,
          fixedMax: key === 'possession_pct' ? 100 : undefined,
        })
      })
    },
  }
}

/* ------------------------------------------------------------ partido por partido */

/** La tabla de partidos se parte en tramos que entran en una hoja (del mas reciente al
 *  mas viejo); cada tramo repite el encabezado. */
export function historyBlocks(d: Doc, rows: EnrichedMatchRow[]): Block[] {
  if (!rows.length) return []
  const list = [...rows].reverse()
  const rowH = 15
  const desc = 'Del más reciente al más viejo.'
  const top = descHeight(d, desc) + 4
  // Lugar para el titulo de seccion (26) que puede ir pegado al primer tramo.
  const perChunk = Math.max(5, Math.floor((d.contentH - 26 - top - HEAD_H) / rowH))
  const chunks: EnrichedMatchRow[][] = []
  for (let i = 0; i < list.length; i += perChunk) chunks.push(list.slice(i, i + perChunk))
  const num = (v: number | null, dig = 0, suf = '') => (v === null ? '—' : `${v.toLocaleString(LOCALE, { minimumFractionDigits: dig, maximumFractionDigits: dig })}${suf}`)
  return chunks.map((chunk, ci) => ({
    h: top + HEAD_H + chunk.length * rowH,
    draw: (d: Doc, y: number) => {
      blockTitle(d, y, ci === 0 ? 'Partido por partido' : 'Partido por partido (continuación)', desc)
      const n = 70
      const cols: Col[] = [
        { title: 'Fecha', w: 50 }, { title: 'Rival', w: d.CW - 50 - 60 - n * 5 }, { title: 'Res.', w: 60, align: 'center' },
        { title: 'Posesión', w: n, align: 'right' }, { title: 'xG', w: n, align: 'right' }, { title: 'xG rival', w: n, align: 'right' },
        { title: 'Tiros a puerta', w: n, align: 'right' }, { title: 'Duelos %', w: n, align: 'right' },
      ]
      let yy = y + top
      drawHead(d, cols, yy)
      yy += HEAD_H
      for (const r of chunk) {
        drawCells(d, cols, [
          dm(r.date), `${r.isHome ? 'vs' : 'en'} ${r.opponent}`, r.scoreLabel ?? '—',
          num(rowMetric(r, 'possession_pct'), 0, '%'), num(rowMetric(r, 'xg_for'), 2), num(rowMetric(r, 'xg_against'), 2),
          num(rowMetric(r, 'tiros_/_a_la_porteria_2')), num(rowMetric(r, 'duelos_/_ganados_3'), 0, '%'),
        ], yy - 2, {
          bold: [1, 2], size: 7.8,
          colors: [undefined, undefined, r.result ? RESULT_DOT[r.result] : undefined],
        })
        yy += rowH
        d.line(M, yy, M + d.CW, yy, C.line, 0.4)
      }
    },
  }))
}

/* ------------------------------------------------------------ canchas (informe de Wyscout) */


function surname(name?: string): string {
  if (!name) return ''
  const parts = name.trim().split(/\s+/)
  return parts[parts.length - 1]
}

/** Cancha vertical (arco propio abajo) con la posicion media de cada jugador. */
function formationPitch(d: Doc, x: number, y: number, w: number, players: PitchPoint[]) {
  const h = (w * 105) / 68
  const k = w / 68
  for (let i = 0; i < 10; i++) d.rect(x, y + i * 10.5 * k, w, 10.5 * k, i % 2 ? GRASS_B : GRASS_A)
  d.pdf.setDrawColor(PITCH_LINE)
  d.pdf.setLineWidth(0.5)
  d.pdf.rect(x + 1.5 * k, y + 1.5 * k, 65 * k, 102 * k, 'S')
  d.pdf.line(x + 1.5 * k, y + 52.5 * k, x + 66.5 * k, y + 52.5 * k)
  d.pdf.circle(x + 34 * k, y + 52.5 * k, 9.15 * k, 'S')
  d.pdf.rect(x + 13.84 * k, y + 1.5 * k, 40.32 * k, 16.5 * k, 'S')
  d.pdf.rect(x + 13.84 * k, y + 87 * k, 40.32 * k, 16.5 * k, 'S')
  for (const p of players) {
    const px = x + (8 + (p.x / 100) * 52) * k
    const py = y + (17 + (p.y / 100) * 73) * k
    d.pdf.setFillColor('#FFFFFF')
    d.pdf.circle(px, py, 4.2, 'F')
    d.pdf.setFillColor('#15803D')
    d.pdf.circle(px, py, 1.8, 'F')
    const label = surname(p.label)
    if (label) {
      const lw = d.width(label, 5.8, true) + 6
      d.rect(px - lw / 2, py + 5.5, lw, 8, '#111111', 3)
      d.text(label, px, py + 11.3, { size: 5.8, bold: true, color: '#FFFFFF', align: 'center' })
    }
  }
  return h
}

export function formationsBlock(d: Doc, report: WyscoutReportData | null): Block | null {
  const list = report?.formations ?? []
  if (!list.length) return null
  const cols = Math.min(3, list.length)
  const w = (d.CW - (cols - 1) * 12) / cols
  const pitchW = Math.min(w - 16, 170)
  const pitchH = (pitchW * 105) / 68
  const desc = 'Posición media de cada jugador según el informe de Wyscout.'
  const top = descHeight(d, desc) + 4
  const nRows = Math.ceil(list.length / cols)
  const cardH = 30 + pitchH + 12
  return {
    h: top + nRows * (cardH + 12),
    draw: (d, y) => {
      blockTitle(d, y, 'Formaciones usadas', desc)
      list.forEach((f, i) => {
        const cx = M + (i % cols) * (w + 12)
        const cy = y + top + Math.floor(i / cols) * (cardH + 12)
        d.rect(cx, cy, w, cardH, C.tile, 6)
        d.text(f.scheme, cx + 10, cy + 20, { size: 15, bold: true })
        d.text(`${f.usagePct}% del tiempo`, cx + w - 10, cy + 19, { size: 7.8, bold: true, color: C.green, align: 'right' })
        formationPitch(d, cx + (w - pitchW) / 2, cy + 30, pitchW, f.averagePositions)
      })
    },
  }
}

const ZONE_LABEL: Record<string, string> = { recuperaciones: 'Recuperaciones', perdidas: 'Pérdidas de balón', faltas: 'Faltas cometidas' }

/** Lineas de una cancha horizontal (105 x 68, ataque a la derecha) escaladas a (x, y, k). */
function horizontalMarkings(d: Doc, x: number, y: number, k: number) {
  const X = (v: number) => x + v * k
  const Y = (v: number) => y + v * k
  d.pdf.setDrawColor(PITCH_LINE)
  d.pdf.setLineWidth(0.7)
  d.pdf.rect(X(1.5), Y(1.5), 102 * k, 65 * k, 'S')
  d.pdf.line(X(52.5), Y(1.5), X(52.5), Y(66.5))
  d.pdf.circle(X(52.5), Y(34), 9.15 * k, 'S')
  d.pdf.rect(X(1.5), Y(13.84), 16.5 * k, 40.32 * k, 'S')
  d.pdf.rect(X(1.5), Y(24.84), 5.5 * k, 18.32 * k, 'S')
  d.pdf.rect(X(87), Y(13.84), 16.5 * k, 40.32 * k, 'S')
  d.pdf.rect(X(98), Y(24.84), 5.5 * k, 18.32 * k, 'S')
  // arcos
  d.pdf.setLineWidth(1.2)
  d.pdf.line(X(0.6), Y(30.34), X(0.6), Y(37.66))
  d.pdf.line(X(104.4), Y(30.34), X(104.4), Y(37.66))
  d.pdf.setFillColor(PITCH_LINE)
  d.pdf.circle(X(52.5), Y(34), 0.6 * k, 'F')
  d.pdf.circle(X(12.5), Y(34), 0.5 * k, 'F')
  d.pdf.circle(X(92.5), Y(34), 0.5 * k, 'F')
}

/** Cancha horizontal (ataque a la derecha) partida en 3 x 3: el blanco de cada zona es mas
 *  fuerte cuantas mas acciones hubo ahi; las lineas de la cancha quedan encima para que se
 *  vea en que parte del campo pasa cada cosa. */
function zonePitch(d: Doc, x: number, y: number, w: number, grid: WyscoutZoneGrid) {
  const k = w / 105
  const h = 68 * k
  for (let i = 0; i < 7; i++) d.rect(x + i * 15 * k, y, 15 * k, h, i % 2 ? GRASS_B : GRASS_A)
  const inner = { x: x + 1.5 * k, y: y + 1.5 * k, w: 102 * k, h: 65 * k }
  const max = Math.max(...grid.cells.map(c => c.pct), 1)
  const cw = inner.w / 3
  const rh = inner.h / 3
  const cellAt = (row: number, col: number) => grid.cells.find(c => c.row === row && c.col === col)
  for (let i = 0; i < 9; i++) {
    const row = Math.floor(i / 3)
    const col = i % 3
    const cell = cellAt(row, col)
    if (!cell) continue
    d.pdf.setGState(d.pdf.GState({ opacity: 0.05 + 0.5 * (cell.pct / max) }))
    d.rect(inner.x + col * cw + 1.5, inner.y + row * rh + 1.5, cw - 3, rh - 3, '#FFFFFF', 3)
    d.pdf.setGState(d.pdf.GState({ opacity: 1 }))
  }
  horizontalMarkings(d, x, y, k)
  // Division de las 9 zonas (punteada, para no confundirla con las lineas de cancha).
  d.pdf.setLineDashPattern([2, 2], 0)
  d.pdf.setDrawColor('#D8F0DF')
  d.pdf.setLineWidth(0.4)
  for (let c = 1; c < 3; c++) d.pdf.line(inner.x + c * cw, inner.y, inner.x + c * cw, inner.y + inner.h)
  for (let r = 1; r < 3; r++) d.pdf.line(inner.x, inner.y + r * rh, inner.x + inner.w, inner.y + r * rh)
  d.pdf.setLineDashPattern([], 0)
  for (let i = 0; i < 9; i++) {
    const row = Math.floor(i / 3)
    const col = i % 3
    const cell = cellAt(row, col)
    const label = cell ? `${Math.round(cell.pct)}%` : '–'
    const cx = inner.x + col * cw + cw / 2
    const cy = inner.y + row * rh + rh / 2
    const pw = d.width(label, 8.6, true) + 10
    d.rect(cx - pw / 2, cy - 7, pw, 13, '#0B3D20', 6.5)
    d.text(label, cx, cy + 2.6, { size: 8.6, bold: true, color: '#FFFFFF', align: 'center' })
  }
  return h
}

export function zonesBlock(d: Doc, report: WyscoutReportData | null): Block | null {
  const grids = report?.zoneGrids ?? []
  if (!grids.length) return null
  const desc = 'Porcentaje de cada acción por zona de la cancha. Cuanto más clara la zona, más acciones hubo ahí. El equipo ataca hacia la derecha.'
  const top = descHeight(d, desc) + 4
  const w = (d.CW - (grids.length - 1) * 10) / grids.length
  const pitchH = (68 * (w - 16)) / 105
  const cardH = 26 + pitchH + 24
  return {
    h: top + cardH,
    draw: (d, y) => {
      blockTitle(d, y, 'Dónde pasan las cosas', desc)
      grids.forEach((g, i) => {
        const cx = M + i * (w + 10)
        const cy = y + top
        d.rect(cx, cy, w, cardH, C.tile, 6)
        d.text(ZONE_LABEL[g.category] ?? g.category, cx + 8, cy + 16, { size: 8.6, bold: true })
        zonePitch(d, cx + 8, cy + 24, w - 16, g)
        d.text('< Arco propio', cx + 8, cy + cardH - 9, { size: 7, bold: true, color: C.muted })
        d.text('Ataque >', cx + w - 8, cy + cardH - 9, { size: 7, bold: true, color: C.muted, align: 'right' })
      })
    },
  }
}

