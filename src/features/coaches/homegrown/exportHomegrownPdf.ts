// src/features/coaches/homegrown/exportHomegrownPdf.ts
// PDF de "Jugadores surgidos del club" dibujado con jsPDF (texto y gráficos vectoriales, no
// una captura de la pantalla): se lee nítido impreso o en el celular y nunca queda cortado
// por el scroll de los gráficos. A4 apaisado, fondo blanco, verde de marca.
import type { jsPDF as JsPdf } from 'jspdf'
import { ageOn, cleanClub, TREND_WINDOW, type HomegrownReport, type ReportMatch, type Trend } from './homegrownReport'

const C = {
  ink: '#1D1D1F', text: '#3A3A3C', muted: '#6E6E73', faint: '#A1A1A6', line: '#E5E5EA',
  tile: '#F5F5F7', green: '#15803D', greenLight: '#4ADE80', greenTint: '#EDF7F0', greenBorder: '#B7DFC4',
  amber: '#B45309', amberTint: '#FDF3E7', noData: '#D2D2D7', trend: '#8E8E93', white: '#FFFFFF',
}
const PAGE_W = 841.89
const PAGE_H = 595.28
const M = 36 // margen
const CONTENT_W = PAGE_W - M * 2
const TOP = 70 // debajo del encabezado de cada página
const BOTTOM = PAGE_H - 36 // arriba del pie

const LOCALE = 'es-AR'
const num = (v: number, digits = 1) => v.toLocaleString(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits })
const int = (v: number) => Math.round(v).toLocaleString(LOCALE)
const longDate = (iso: string, withYear = true) =>
  new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', ...(withYear ? { year: 'numeric' } : {}) })
const shortDate = (iso: string) =>
  new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' })

/** Eje con marcas redondas (0, 10, 20… o 25, 26, 27…) que cubren [min, max] en ≤ 5 tramos. */
export function niceAxis(min: number, max: number): { lo: number; hi: number; step: number } {
  const steps = [0.5, 1, 2, 2.5, 5, 10, 15, 20, 25, 50]
  for (const step of steps) {
    const lo = Math.floor(min / step) * step
    const hi = Math.max(lo + step, Math.ceil(max / step) * step)
    if ((hi - lo) / step <= 5) return { lo, hi, step }
  }
  return { lo: min, hi: max, step: (max - min) / 4 || 1 }
}

/** Mezcla un color con blanco: la intensidad del verde en el mapa de participación. */
function tint(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c: number) => Math.round(255 - (255 - c) * amount).toString(16).padStart(2, '0')
  return `#${mix((n >> 16) & 255)}${mix((n >> 8) & 255)}${mix(n & 255)}`
}

function trendSentence(t: Trend | null, fmt: (v: number) => string, unit: string, threshold: number, goodWhenUp = true) {
  if (!t) return null
  const delta = t.end - t.start
  const flat = Math.abs(delta) < threshold
  const word = flat ? 'Estable' : delta > 0 ? 'En aumento' : 'En baja'
  const good = flat ? null : (delta > 0) === goodWhenUp
  return { text: `${word}: de ${fmt(t.start)} a ${fmt(t.end)} ${unit}`, good }
}

class Doc {
  pdf: JsPdf
  y = TOP
  constructor(pdf: JsPdf, private header: { title: string; logo?: { url: string; w: number; h: number } }) {
    this.pdf = pdf
  }

  font(size: number, style: 'normal' | 'bold' = 'normal', color = C.ink) {
    this.pdf.setFont('helvetica', style)
    this.pdf.setFontSize(size)
    this.pdf.setTextColor(color)
  }

  text(str: string, x: number, y: number, opts: { size?: number; bold?: boolean; color?: string; align?: 'left' | 'center' | 'right'; angle?: number } = {}) {
    this.font(opts.size ?? 9, opts.bold ? 'bold' : 'normal', opts.color ?? C.ink)
    this.pdf.text(str, x, y, { align: opts.align ?? 'left', angle: opts.angle, baseline: 'alphabetic' })
  }

  width(str: string, size: number, bold = false): number {
    this.font(size, bold ? 'bold' : 'normal')
    return this.pdf.getTextWidth(str)
  }

  /** Recorta con "..." para que un texto nunca se salga de su columna. */
  fit(str: string, maxW: number, size: number, bold = false): string {
    if (this.width(str, size, bold) <= maxW) return str
    let s = str
    while (s.length > 1 && this.width(s + '...', size, bold) > maxW) s = s.slice(0, -1)
    return s.trimEnd() + '...'
  }

  wrap(str: string, maxW: number, size: number, bold = false): string[] {
    this.font(size, bold ? 'bold' : 'normal')
    return this.pdf.splitTextToSize(str, maxW) as string[]
  }

  /** Párrafo con salto de línea; devuelve la altura usada. */
  paragraph(str: string, x: number, y: number, maxW: number, opts: { size?: number; bold?: boolean; color?: string; leading?: number } = {}): number {
    const size = opts.size ?? 9
    const lines = this.wrap(str, maxW, size, opts.bold)
    const leading = opts.leading ?? size * 1.35
    lines.forEach((l, i) => this.text(l, x, y + i * leading, { size, bold: opts.bold, color: opts.color }))
    return lines.length * leading
  }

  rect(x: number, y: number, w: number, h: number, fill: string, stroke?: string, r = 0) {
    this.pdf.setFillColor(fill)
    if (stroke) { this.pdf.setDrawColor(stroke); this.pdf.setLineWidth(0.75) }
    const style = stroke ? 'FD' : 'F'
    if (r > 0) this.pdf.roundedRect(x, y, w, h, r, r, style)
    else this.pdf.rect(x, y, w, h, style)
  }

  line(x1: number, y1: number, x2: number, y2: number, color = C.line, width = 0.75, dash?: number[]) {
    this.pdf.setDrawColor(color)
    this.pdf.setLineWidth(width)
    if (dash) this.pdf.setLineDashPattern(dash, 0)
    this.pdf.line(x1, y1, x2, y2)
    if (dash) this.pdf.setLineDashPattern([], 0)
  }

  /** Polilínea que saltea los huecos (null). */
  polyline(points: ({ x: number; y: number } | null)[], color: string, width: number, dash?: number[]) {
    this.pdf.setDrawColor(color)
    this.pdf.setLineWidth(width)
    this.pdf.setLineJoin('round')
    this.pdf.setLineCap('round')
    if (dash) this.pdf.setLineDashPattern(dash, 0)
    // Los huecos se unen (igual que connectNulls en la pantalla).
    const pts = points.filter((p): p is { x: number; y: number } => p !== null)
    for (let i = 1; i < pts.length; i++) this.pdf.line(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y)
    if (dash) this.pdf.setLineDashPattern([], 0)
    this.pdf.setLineCap('butt')
  }

  star(cx: number, cy: number, r: number, color: string) {
    const pts: [number, number][] = []
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5
      const rr = i % 2 === 0 ? r : r * 0.45
      pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)])
    }
    const deltas = pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]])
    this.pdf.setFillColor(color)
    this.pdf.lines(deltas, pts[0][0], pts[0][1], [1, 1], 'F', true)
  }

  newPage() {
    this.pdf.addPage('a4', 'landscape')
    this.drawHeader()
    this.y = TOP
  }

  drawHeader() {
    const { logo, title } = this.header
    this.text('DOBLE G SPORTS GROUP', M, 30, { size: 7, bold: true, color: C.green })
    this.text(title, M, 42, { size: 8, color: C.muted })
    if (logo) this.pdf.addImage(logo.url, 'PNG', PAGE_W - M - logo.w, 20, logo.w, logo.h)
    this.line(M, 52, PAGE_W - M, 52)
  }

  /** Pasa a una hoja nueva si lo que viene no entra en lo que queda. */
  ensure(h: number) {
    if (this.y + h > BOTTOM) this.newPage()
  }

  sectionTitle(title: string, subtitle?: string) {
    this.ensure(subtitle ? 46 : 30)
    this.text(title, M, this.y + 12, { size: 14, bold: true })
    this.y += 20
    if (subtitle) {
      this.y += this.paragraph(subtitle, M, this.y + 8, CONTENT_W, { size: 9, color: C.muted })
    }
    this.y += 8
  }

  chip(label: string, good: boolean | null, x: number, y: number) {
    const w = this.width(label, 8.5, true) + 18
    const [bg, fg] = good === true ? [C.greenTint, C.green] : good === false ? [C.amberTint, C.amber] : [C.tile, C.muted]
    this.rect(x, y, w, 17, bg, undefined, 8.5)
    this.text(label, x + 9, y + 11.6, { size: 8.5, bold: true, color: fg })
    return w
  }
}

/* ------------------------------------------------------------------ Portada / resumen */

function drawSummary(d: Doc, r: HomegrownReport, clubName: string) {
  d.text('INFORME', M, d.y + 4, { size: 8, bold: true, color: C.green })
  d.text('Jugadores surgidos del club', M, d.y + 32, { size: 26, bold: true })
  d.y += 52
  const sub = [r.coachName, clubName].filter(Boolean).join('  ·  ')
  d.text(sub, M, d.y, { size: 12, color: C.muted })
  d.y += 16
  d.y += d.paragraph(
    `Se considera surgido del club al jugador que debutó como profesional en ${clubName || 'el club'}, aunque haya hecho inferiores en otro lado o se haya ido y vuelto.`,
    M, d.y + 4, CONTENT_W, { size: 8.5, color: C.faint },
  )
  d.y += 14

  let summary = `En ${r.matchesWithData} partidos, ${r.coachName} usó ${r.players.length} jugadores surgidos del club.`
  if (r.debutants.length) summary += ` ${r.debutants.length} de ellos debutaron en Primera con él.`
  d.y += d.paragraph(summary, M, d.y + 4, CONTENT_W, { size: 12.5, bold: true, leading: 17 })
  d.y += 12

  // Números principales
  const tiles: { value: string; label: string; detail?: string }[] = [
    { value: num(r.avgPlayersPerMatch), label: 'Chicos del club por partido', detail: 'promedio' },
    { value: `${r.matchesWithAny}/${r.matchesWithData}`, label: 'Partidos en que jugó al menos uno' },
    { value: int(r.totalMinutes), label: 'Minutos que jugaron', detail: `${num(r.minutesShare * 100)}% del total del equipo` },
    { value: String(r.players.length), label: 'Jugadores del club que jugaron' },
    { value: String(r.totalGoals), label: 'Goles de chicos del club' },
  ]
  const gap = 10
  const tw = (CONTENT_W - gap * (tiles.length - 1)) / tiles.length
  const th = 70
  tiles.forEach((t, i) => {
    const x = M + i * (tw + gap)
    d.rect(x, d.y, tw, th, C.tile, undefined, 8)
    d.text(t.value, x + tw / 2, d.y + 30, { size: 20, bold: true, align: 'center' })
    d.text(d.fit(t.label.toUpperCase(), tw - 12, 6.5, true), x + tw / 2, d.y + 46, { size: 6.5, bold: true, color: C.muted, align: 'center' })
    if (t.detail) d.text(d.fit(t.detail, tw - 12, 7.5), x + tw / 2, d.y + 58, { size: 7.5, color: C.faint, align: 'center' })
  })
  d.y += th + 16

  // Debutaron con el DT
  if (r.debutants.length) {
    const cols = 3
    const rowsN = Math.ceil(r.debutants.length / cols)
    const h = 38 + rowsN * 30
    d.ensure(h)
    d.rect(M, d.y, CONTENT_W, h, C.greenTint, C.greenBorder, 8)
    d.star(M + 20, d.y + 18, 6, C.green)
    d.text(`Debutaron en Primera con ${r.coachName}`, M + 32, d.y + 21.5, { size: 11, bold: true })
    const cw = (CONTENT_W - 32) / cols
    r.debutants.forEach((c, i) => {
      const x = M + 16 + (i % cols) * cw
      const y = d.y + 44 + Math.floor(i / cols) * 30
      d.text(d.fit(c.fullName, cw - 12, 10, true), x, y, { size: 10, bold: true })
      if (c.proDebutDate) {
        const line = `Debutó el ${longDate(c.proDebutDate, false)} contra ${cleanClub(c.proDebutOpponent ?? '')}`
        d.text(d.fit(line, cw - 12, 8), x, y + 11, { size: 8, color: C.muted })
      }
    })
    d.y += h + 16
  }

  // Lo que muestran los números
  const trends = [
    { title: 'Chicos del club por partido', t: trendSentence(r.countTrend, v => num(v), 'por partido', 0.3) },
    { title: 'Parte de los minutos del equipo', t: trendSentence(r.minutesTrend, v => `${num(v, 0)}%`, 'de los minutos', 3) },
    { title: 'Edad promedio de los titulares', t: trendSentence(r.ageTrend, v => num(v), 'años', 0.4, false) },
  ].filter(x => x.t)
  if (trends.length) {
    d.ensure(30 + trends.length * 24)
    d.text('Cómo evolucionó a lo largo del ciclo', M, d.y + 10, { size: 11, bold: true })
    d.y += 22
    for (const tr of trends) {
      d.text(tr.title, M, d.y + 12, { size: 9.5, color: C.text })
      d.chip(tr.t!.text, tr.t!.good, M + 190, d.y)
      d.y += 24
    }
    d.text(`La tendencia es la recta que mejor sigue a todos los partidos del ciclo.`, M, d.y + 6, { size: 7.5, color: C.faint })
    d.y += 14
  }
}

/* ------------------------------------------------------------------ Gráficos por partido */

interface Plot { x: number; y: number; w: number; h: number; slot: number }

function plotArea(d: Doc, n: number, h: number, leftAxis: number): Plot {
  const x = M + leftAxis
  const w = CONTENT_W - leftAxis - 4
  return { x, y: d.y, w, h, slot: w / Math.max(1, n) }
}

/** Fecha debajo de cada partido y, si entra, el rival en diagonal. */
function drawMatchAxis(d: Doc, p: Plot, matches: ReportMatch[], withRival: boolean) {
  const step = Math.max(1, Math.ceil(24 / p.slot))
  matches.forEach((m, i) => {
    const cx = p.x + p.slot * (i + 0.5)
    if (i % step === 0 || i === matches.length - 1) d.text(m.label, cx, p.y + p.h + 11, { size: 6.5, color: C.muted, align: 'center' })
    if (withRival && p.slot >= 14) {
      const label = d.fit(m.rival, 62, 6)
      const w = d.width(label, 6)
      const a = Math.PI / 4
      d.text(label, cx - w * Math.cos(a) + 2, p.y + p.h + 18 + w * Math.sin(a), { size: 6, color: C.faint, angle: 45 })
    }
  })
}

function drawCountChart(d: Doc, r: HomegrownReport) {
  d.sectionTitle('Jugadores del club en cada partido', 'Cuántos chicos surgidos del club jugaron en cada partido del ciclo, separando los que fueron titulares de los que entraron desde el banco.')
  const trend = trendSentence(r.countTrend, v => num(v), 'chicos por partido', 0.3)
  if (trend) { d.chip(trend.text, trend.good, M, d.y); d.y += 26 }

  // Leyenda
  let lx = M
  const legend = (color: string, label: string) => {
    d.rect(lx, d.y - 7, 9, 9, color, undefined, 2)
    d.text(label, lx + 13, d.y + 0.5, { size: 8, color: C.muted })
    lx += 13 + d.width(label, 8) + 16
  }
  legend(C.green, 'Titulares')
  legend(C.greenLight, 'Entraron desde el banco')
  if (r.debutants.length) {
    d.star(lx + 4.5, d.y - 2.5, 5, C.green)
    const l = 'Partido en que debutó un chico del club'
    d.text(l, lx + 13, d.y + 0.5, { size: 8, color: C.muted })
    lx += 13 + d.width(l, 8) + 16
  }
  d.line(lx, d.y - 2.5, lx + 16, d.y - 2.5, C.trend, 1.25, [3, 2])
  d.text(`Tendencia (promedio de ${TREND_WINDOW} partidos)`, lx + 21, d.y + 0.5, { size: 8, color: C.muted })
  d.y += 14

  const maxDebuts = Math.max(0, ...r.matches.map(m => m.debutNames.length))
  const headroom = 16 + maxDebuts * 17
  const h = Math.min(250, BOTTOM - d.y - 70)
  const p = plotArea(d, r.matches.length, h, 0)
  const barTop = p.y + headroom
  const barH = p.h - headroom
  const max = Math.max(1, ...r.matches.map(m => m.starters.length + m.subsIn.length))
  const unit = barH / max
  const bw = Math.min(26, p.slot * 0.72)

  // Líneas guía suaves
  for (let v = 0; v <= max; v += max > 8 ? 2 : 1) d.line(p.x, barTop + barH - v * unit, p.x + p.w, barTop + barH - v * unit, v === 0 ? C.line : '#F2F2F4', 0.5)

  r.matches.forEach((m, i) => {
    const cx = p.x + p.slot * (i + 0.5)
    const x = cx - bw / 2
    const base = barTop + barH
    if (!m.hasData) {
      d.rect(x, base - 6, bw, 6, C.noData, undefined, 1.5)
      d.text('s/d', cx, base - 10, { size: 6, color: C.faint, align: 'center' })
      return
    }
    const sH = m.starters.length * unit
    const bH = m.subsIn.length * unit
    if (sH) d.rect(x, base - sH, bw, sH, C.green)
    if (bH) d.rect(x, base - sH - bH, bw, bH, C.greenLight)
    if (sH && bH) d.line(x, base - sH, x + bw, base - sH, C.white, 0.75)
    const total = m.starters.length + m.subsIn.length
    const top = base - sH - bH
    d.text(String(total), cx, top - 4, { size: 8, bold: true, color: C.text, align: 'center' })
    m.debutNames.forEach((_, k) => {
      const cy = top - 18 - k * 17
      d.pdf.setFillColor(C.white); d.pdf.setDrawColor(C.green); d.pdf.setLineWidth(1)
      d.pdf.circle(cx, cy, 7, 'FD')
      d.star(cx, cy + 0.4, 4.4, C.green)
    })
  })
  d.polyline(r.matches.map((m, i) => (m.countTrend === null ? null : { x: p.x + p.slot * (i + 0.5), y: barTop + barH - m.countTrend * unit })), C.trend, 1.25, [4, 3])
  drawMatchAxis(d, p, r.matches, true)
  d.y = p.y + p.h + 70

  // Quién debutó en cada partido marcado
  const debutMatches = r.matches.filter(m => m.debutNames.length)
  if (debutMatches.length) {
    const lines = debutMatches.map(m => `${m.label} vs ${m.rival}: ${m.debutNames.join(', ')}`)
    d.ensure(16)
    d.text(`Debuts: ${lines.join('   ·   ')}`, M, d.y, { size: 8, color: C.muted })
    d.y += 14
  }
}

function drawLineChart(d: Doc, r: HomegrownReport, opts: {
  title: string; subtitle: string; trend: ReturnType<typeof trendSentence>
  value: (m: ReportMatch) => number | null; avg: (m: ReportMatch) => number | null
  domain: { lo: number; hi: number; step: number }; tickFmt: (v: number) => string; area: boolean; height: number
}) {
  d.ensure(opts.height + 110)
  d.sectionTitle(opts.title, opts.subtitle)
  if (opts.trend) { d.chip(opts.trend.text, opts.trend.good, M, d.y); d.y += 26 }
  const p = plotArea(d, r.matches.length, opts.height, 34)
  const { lo, hi, step } = opts.domain
  const yOf = (v: number) => p.y + p.h - ((v - lo) / (hi - lo)) * p.h
  const ticks = Math.round((hi - lo) / step)
  for (let i = 0; i <= ticks; i++) {
    const v = lo + step * i
    d.line(p.x, yOf(v), p.x + p.w, yOf(v), i === 0 ? C.line : '#F2F2F4', 0.5)
    d.text(opts.tickFmt(v), p.x - 6, yOf(v) + 2.5, { size: 7, color: C.faint, align: 'right' })
  }
  const pts = r.matches.map((m, i) => {
    const v = opts.value(m)
    return v === null ? null : { x: p.x + p.slot * (i + 0.5), y: yOf(v) }
  })
  const valid = pts.filter((q): q is { x: number; y: number } => q !== null)
  if (opts.area && valid.length > 1) {
    const base = yOf(lo)
    const poly: [number, number][] = [[valid[0].x, base], ...valid.map(q => [q.x, q.y] as [number, number]), [valid[valid.length - 1].x, base]]
    const deltas = poly.slice(1).map((q, i) => [q[0] - poly[i][0], q[1] - poly[i][1]])
    d.pdf.setFillColor(C.greenTint)
    d.pdf.lines(deltas, poly[0][0], poly[0][1], [1, 1], 'F', true)
  }
  d.polyline(pts, C.green, 1.75)
  if (!opts.area) for (const q of valid) { d.pdf.setFillColor(C.green); d.pdf.circle(q.x, q.y, 1.8, 'F') }
  d.polyline(r.matches.map((m, i) => {
    const v = opts.avg(m)
    return v === null ? null : { x: p.x + p.slot * (i + 0.5), y: yOf(v) }
  }), C.trend, 1.25, [4, 3])
  drawMatchAxis(d, p, r.matches, false)
  d.y = p.y + p.h + 22
  d.line(M, d.y - 3, M + 16, d.y - 3, C.trend, 1.25, [3, 2])
  d.text(`Tendencia (promedio de ${TREND_WINDOW} partidos)`, M + 21, d.y, { size: 7.5, color: C.muted })
  d.y += 18
}

function drawMinutesAndAge(d: Doc, r: HomegrownReport) {
  const pct = r.matches.map(m => m.minutesPct).filter((v): v is number => v !== null)
  drawLineChart(d, r, {
    title: 'Minutos de los chicos del club',
    subtitle: 'Qué parte de los minutos del equipo jugaron los chicos del club en cada partido.',
    trend: trendSentence(r.minutesTrend, v => `${num(v, 0)}%`, 'de los minutos', 3),
    value: m => m.minutesPct, avg: m => m.minutesPctTrend,
    domain: niceAxis(0, Math.max(10, ...pct)), tickFmt: v => `${num(v, 0)}%`, area: true, height: 130,
  })
  const ages = r.matches.map(m => m.starterAge).filter((v): v is number => v !== null)
  if (ages.length) {
    d.y += 6
    drawLineChart(d, r, {
      title: '¿Se rejuveneció el equipo?',
      subtitle: 'Edad promedio de los once titulares en cada partido.',
      trend: trendSentence(r.ageTrend, v => num(v), 'años', 0.4, false),
      value: m => m.starterAge, avg: m => m.starterAgeTrend,
      domain: niceAxis(Math.min(...ages) - 0.3, Math.max(...ages) + 0.3), tickFmt: v => num(v, Number.isInteger(v) ? 0 : 1), area: false, height: 130,
    })
  }
}

/* ------------------------------------------------------------------ Quién jugó cada partido */

function drawParticipation(d: Doc, r: HomegrownReport) {
  if (!r.players.length) return
  d.newPage()
  d.sectionTitle('Quién jugó cada partido', 'Una fila por chico y una columna por partido. Cuanto más verde, más minutos jugó ese día.')
  const nameW = 118
  const totalsW = 84
  const n = r.matches.length
  const cell = Math.max(8, Math.min(20, (CONTENT_W - nameW - totalsW) / n))
  const gap = Math.min(3, cell * 0.15)
  const rowH = Math.min(cell, 20)
  const x0 = M + nameW
  const drawHead = () => {
    const step = Math.max(1, Math.ceil(12 / cell))
    r.matches.forEach((m, i) => {
      if (i % step !== 0 && i !== n - 1) return
      const cx = x0 + i * cell + cell / 2
      d.text(m.label, cx - 2, d.y + 26, { size: 6.5, color: C.muted, angle: 45 })
    })
    const tx = x0 + n * cell + 10
    d.text('PART.', tx + 20, d.y + 26, { size: 6.5, bold: true, color: C.muted, align: 'right' })
    d.text('MIN.', tx + totalsW - 12, d.y + 26, { size: 6.5, bold: true, color: C.muted, align: 'right' })
    d.y += 32
  }
  drawHead()
  for (const p of r.players) {
    if (d.y + rowH > BOTTOM - 40) { d.newPage(); drawHead() }
    d.text(d.fit(p.name, nameW - 8, 8.5), M, d.y + rowH / 2 + 3, { size: 8.5, color: C.text })
    p.perMatch.forEach((e, i) => {
      const x = x0 + i * cell + gap / 2
      const s = cell - gap
      const y = d.y + (rowH - s) / 2
      const m = r.matches[i]
      if (!e) {
        d.pdf.setDrawColor(C.line); d.pdf.setLineWidth(0.6)
        d.pdf.roundedRect(x, y, s, s, 2.5, 2.5, 'S')
        return
      }
      const fill = tint(C.green, 0.22 + 0.78 * Math.min(1, e.minutes / 90))
      d.rect(x, y, s, s, fill, undefined, 2.5)
      const goals = m.goals.filter(g => g.playerId === p.apiPlayerId).length
      if (p.debutFixtureId === m.fixtureId) d.star(x + s / 2, y + s / 2 + 0.3, s * 0.34, C.white)
      else if (goals) {
        d.pdf.setFillColor(C.white); d.pdf.setDrawColor(C.ink); d.pdf.setLineWidth(0.8)
        d.pdf.circle(x + s / 2, y + s / 2, s * 0.17, 'FD')
      }
    })
    const tx = x0 + n * cell + 10
    d.text(String(p.appearances), tx + 20, d.y + rowH / 2 + 3, { size: 8.5, color: C.text, align: 'right' })
    d.text(int(p.minutes), tx + totalsW - 12, d.y + rowH / 2 + 3, { size: 8.5, bold: true, align: 'right' })
    d.y += rowH
  }
  // Leyenda
  d.y += 14
  let lx = M
  const sw = (draw: (x: number, y: number) => void, label: string) => {
    draw(lx, d.y - 7)
    d.text(label, lx + 14, d.y + 0.5, { size: 8, color: C.muted })
    lx += 14 + d.width(label, 8) + 18
  }
  sw((x, y) => d.rect(x, y, 10, 10, tint(C.green, 0.3), undefined, 2), 'pocos minutos')
  sw((x, y) => d.rect(x, y, 10, 10, C.green, undefined, 2), '90 minutos')
  sw((x, y) => { d.pdf.setDrawColor(C.noData); d.pdf.setLineWidth(0.6); d.pdf.roundedRect(x, y, 10, 10, 2, 2, 'S') }, 'no jugó')
  sw((x, y) => { d.rect(x, y, 10, 10, C.green, undefined, 2); d.pdf.setFillColor(C.white); d.pdf.setDrawColor(C.ink); d.pdf.circle(x + 5, y + 5, 1.8, 'FD') }, 'hizo un gol')
  sw((x, y) => { d.rect(x, y, 10, 10, C.green, undefined, 2); d.star(x + 5, y + 5.3, 3.6, C.white) }, 'debut en Primera')
  d.y += 12
}

/* ------------------------------------------------------------------ Tablas */

interface Col { title: string; w: number; align?: 'left' | 'right' | 'center' }

/** Tabla con filas de alto variable, salto de hoja y encabezado repetido. */
function drawTable(d: Doc, cols: Col[], rows: { cells: string[]; bold?: number[] }[], size = 8.5, keepTogether = false) {
  const pad = 6
  const leading = size * 1.3
  const head = () => {
    d.rect(M, d.y, CONTENT_W, 20, C.tile, undefined, 4)
    let x = M
    for (const c of cols) {
      const tx = c.align === 'right' ? x + c.w - pad : c.align === 'center' ? x + c.w / 2 : x + pad
      d.text(c.title.toUpperCase(), tx, d.y + 13, { size: 6.8, bold: true, color: C.muted, align: c.align ?? 'left' })
      x += c.w
    }
    d.y += 20
  }
  const measured = rows.map(row => {
    const wrapped = row.cells.map((s, i) => d.wrap(s || '—', cols[i].w - pad * 2, size, row.bold?.includes(i)))
    return { row, wrapped, h: Math.max(...wrapped.map(l => l.length)) * leading + 9 }
  })
  d.ensure(keepTogether ? 20 + measured.reduce((s, m) => s + m.h, 0) : 60)
  head()
  measured.forEach(({ row, wrapped, h }) => {
    if (d.y + h > BOTTOM) { d.newPage(); head() }
    let x = M
    wrapped.forEach((lines, i) => {
      const c = cols[i]
      const tx = c.align === 'right' ? x + c.w - pad : c.align === 'center' ? x + c.w / 2 : x + pad
      lines.forEach((l, k) => d.text(l, tx, d.y + 12 + k * leading, {
        size, bold: row.bold?.includes(i), color: row.bold?.includes(i) ? C.ink : C.text, align: c.align ?? 'left',
      }))
      x += c.w
    })
    d.y += h
    d.line(M, d.y, M + CONTENT_W, d.y, C.line, 0.5)
  })
  d.y += 14
}

function debutText(c: { proDebutDate: string | null; proDebutOpponent: string | null; proDebutCompetition: string | null; proDebutCoach: string | null } | null): string {
  if (!c?.proDebutDate) return 'Todavía no debutó en Primera'
  return [`${shortDate(c.proDebutDate)} vs ${cleanClub(c.proDebutOpponent ?? '')}`, c.proDebutCoach ? `DT ${c.proDebutCoach}` : null].filter(Boolean).join(' · ')
}

function drawPlayersTable(d: Doc, r: HomegrownReport, today: string) {
  if (!r.players.length) return
  d.newPage()
  d.sectionTitle('Los chicos del club, uno por uno', `Ordenados por minutos jugados con ${r.coachName}.`)
  const cols: Col[] = [
    { title: 'Jugador', w: 150 }, { title: 'Posición', w: 110 }, { title: 'Edad', w: 42, align: 'right' },
    { title: 'Partidos', w: 56, align: 'right' }, { title: 'Titular', w: 50, align: 'right' },
    { title: 'Minutos', w: 58, align: 'right' }, { title: 'Goles', w: 46, align: 'right' },
    { title: 'Debut en Primera', w: CONTENT_W - 512 },
  ]
  drawTable(d, cols, r.players.map(p => ({
    cells: [
      p.name, p.position ?? '', p.birthDate ? String(ageOn(p.birthDate, today)) : '',
      String(p.appearances), String(p.starts), int(p.minutes), String(p.goals), debutText(p.career),
    ],
    bold: [0, 5],
  })))

}

/* ------------------------------------------------------------------ Entrada */

/** Arma el documento (separado de la descarga para poder probarlo). */
export async function buildHomegrownPdf(r: HomegrownReport, opts: { today: string; logoDataUrl?: string }): Promise<JsPdf> {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4', compress: true })
  const clubName = r.club ? cleanClub(r.club) : ''
  pdf.setProperties({
    title: `Jugadores surgidos del club - ${r.coachName}`,
    subject: `Jugadores surgidos del club con ${r.coachName}${clubName ? ` en ${clubName}` : ''}`,
    author: 'Doble G Sports Group',
    creator: 'Doble G Sports Group',
  })

  let logo: { url: string; w: number; h: number } | undefined
  if (opts.logoDataUrl) {
    try {
      const props = pdf.getImageProperties(opts.logoDataUrl)
      if (props.width > 0 && props.height > 0) logo = { url: opts.logoDataUrl, h: 26, w: 26 * (props.width / props.height) }
    } catch { logo = undefined }
  }

  const d = new Doc(pdf, { title: `Jugadores surgidos del club · ${r.coachName}${clubName ? ` · ${clubName}` : ''}`, logo })
  d.drawHeader()
  drawSummary(d, r, clubName)
  d.newPage()
  drawCountChart(d, r)
  d.newPage()
  drawMinutesAndAge(d, r)
  drawParticipation(d, r)
  drawPlayersTable(d, r, opts.today)

  // Pie en todas las hojas
  const total = pdf.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i)
    d.line(M, PAGE_H - 30, PAGE_W - M, PAGE_H - 30)
    d.text(`Doble G Sports Group  ·  Informe generado el ${longDate(opts.today)}`, M, PAGE_H - 18, { size: 7, color: C.faint })
    d.text(`Página ${i} de ${total}`, PAGE_W - M, PAGE_H - 18, { size: 7, color: C.faint, align: 'right' })
  }
  return pdf
}

export async function exportHomegrownPdf(r: HomegrownReport, opts: { fileName: string; today: string; logoDataUrl?: string }): Promise<void> {
  const pdf = await buildHomegrownPdf(r, opts)
  pdf.save(opts.fileName)
}
