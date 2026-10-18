// Dibujos vectoriales del PDF de Test Opta: cancha con posiciones medias, mapa de
// remates, evolución partido a partido y dispersión de equipos.
import { C, type Doc } from '@/features/coaches/wyscoutSquad/pdfDoc'
import type { OptaShot } from '@/features/opta/data'

export const BLUE = '#2563EB'
export const BLUE_TINT = '#EAF1FD'
const PITCH_BG = '#F2F7F3'
const PITCH_LINE = '#C5D3C9'

export function circle(d: Doc, x: number, y: number, r: number, fill: string, stroke?: string, lw = 1) {
  d.pdf.setFillColor(fill)
  if (stroke) { d.pdf.setDrawColor(stroke); d.pdf.setLineWidth(lw) }
  d.pdf.circle(x, y, r, stroke ? 'FD' : 'F')
}

export function dashed(d: Doc, x1: number, y1: number, x2: number, y2: number, color: string, width = 0.8, dash: [number, number] = [3, 2]) {
  d.pdf.setLineDashPattern(dash, 0)
  d.line(x1, y1, x2, y2, color, width)
  d.pdf.setLineDashPattern([], 0)
}

/** Ficha de resultado: G verde, E gris, P roja. */
export function chip(d: Doc, x: number, y: number, r: 'G' | 'E' | 'P', size = 12) {
  const [bg, fg] = r === 'G' ? [C.greenBar, C.ink] : r === 'P' ? [C.red, C.white] : [C.grayChip, C.ink]
  d.rect(x, y, size, size, bg, 2.5)
  d.text(r, x + size / 2, y + size * 0.72, { size: size * 0.58, bold: true, color: fg, align: 'center' })
}

/** Barra horizontal sobre fondo gris (frac 0-1). */
export function bar(d: Doc, x: number, y: number, w: number, h: number, frac: number, color: string) {
  d.rect(x, y, w, h, C.tile, h / 2)
  const f = Math.max(0, Math.min(1, frac))
  if (f > 0) d.rect(x, y, Math.max(h, w * f), h, color, h / 2)
}

/** Cancha horizontal (ataca hacia la derecha). Devuelve el alto y cómo pasar coordenadas de Opta a puntos. */
export function pitch(d: Doc, x: number, y: number, w: number) {
  const h = (w * 68) / 105
  const sx = w / 105
  const px = (ox: number) => x + (ox / 100) * w
  const py = (oy: number) => y + ((100 - oy) / 100) * h
  d.rect(x, y, w, h, PITCH_BG, 4)
  const L = (x1: number, y1: number, x2: number, y2: number) => d.line(x1, y1, x2, y2, PITCH_LINE, 0.7)
  const box = (bx: number, by: number, bw: number, bh: number) => { L(bx, by, bx + bw, by); L(bx + bw, by, bx + bw, by + bh); L(bx, by + bh, bx + bw, by + bh); L(bx, by, bx, by + bh) }
  box(x, y, w, h)
  L(x + w / 2, y, x + w / 2, y + h)
  d.pdf.setDrawColor(PITCH_LINE); d.pdf.setLineWidth(0.7); d.pdf.circle(x + w / 2, y + h / 2, 9.15 * sx, 'S')
  const pbW = 16.5 * sx, pbH = 40.32 * sx, sbW = 5.5 * sx, sbH = 18.32 * sx
  box(x, y + (h - pbH) / 2, pbW, pbH); box(x + w - pbW, y + (h - pbH) / 2, pbW, pbH)
  box(x, y + (h - sbH) / 2, sbW, sbH); box(x + w - sbW, y + (h - sbH) / 2, sbW, sbH)
  return { h, px, py, sx }
}

const surname = (name: string) => {
  const parts = name.trim().split(/\s+/)
  return parts.length > 1 ? parts.slice(1).join(' ') : name
}

/** Separa puntos encimados (posiciones medias parecidas) para que se lean todos. */
function spread(points: Array<{ id: string; cx: number; cy: number }>, min: number) {
  const out = points.map(p => ({ ...p }))
  for (let it = 0; it < 40; it++) {
    let moved = false
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
      const a = out[i], b = out[j]
      const dx = b.cx - a.cx, dy = b.cy - a.cy
      const dist = Math.hypot(dx, dy) || 0.01
      if (dist >= min) continue
      const push = (min - dist) / 2, ux = dx / dist, uy = dy / dist
      a.cx -= ux * push; a.cy -= uy * push; b.cx += ux * push; b.cy += uy * push
      moved = true
    }
    if (!moved) break
  }
  return out
}

/** Los más usados en su posición media, con la línea defensiva y la altura del bloque. */
export function teamShape(d: Doc, x: number, y: number, w: number, players: Array<{ id: string; x: number; y: number; name: string; shirt: number | null }>, lineX: number | null, blockX: number | null, color: string) {
  const p = pitch(d, x, y, w)
  if (blockX !== null) {
    dashed(d, p.px(blockX), y + 2, p.px(blockX), y + p.h - 2, C.faint, 0.6, [2, 2])
    d.text(`Defiende a ${Math.round(blockX * 1.05)} m`, p.px(blockX) + 3, y + 21, { size: 6.5, color: C.muted })
  }
  if (lineX !== null) {
    dashed(d, p.px(lineX), y + 2, p.px(lineX), y + p.h - 2, color, 1.1)
    d.text(`Línea defensiva · ${Math.round(lineX * 1.05)} m`, p.px(lineX) + 3, y + 11, { size: 7, bold: true, color })
  }
  const r = Math.max(6, w * 0.019)
  const placed = spread(players.map(pl => ({ id: pl.id, cx: p.px(pl.x), cy: p.py(pl.y) })), r * 2.9)
    .map(pt => ({ ...pt, cx: Math.max(x + r + 2, Math.min(x + w - r - 2, pt.cx)), cy: Math.max(y + r + 2, Math.min(y + p.h - r - 12, pt.cy)) }))
  for (const pt of placed) {
    const pl = players.find(q => q.id === pt.id)!
    circle(d, pt.cx, pt.cy, r, color, C.white, 1.2)
    d.text(pl.shirt != null ? String(pl.shirt) : '', pt.cx, pt.cy + r * 0.38, { size: r * 1.05, bold: true, color: C.white, align: 'center' })
  }
  // Nombres: abajo, arriba, a la derecha o a la izquierda, el primero que no pise otro círculo ni otro nombre.
  type Box = [number, number, number, number]
  const taken: Box[] = placed.map(o => [o.cx - r - 1, o.cy - r - 1, o.cx + r + 1, o.cy + r + 1])
  const hits = (b: Box, skip: number) => taken.some((o, i) => i !== skip && b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])
  placed.forEach((pt, idx) => {
    const pl = players.find(q => q.id === pt.id)!
    const name = d.fit(surname(pl.name), r * 7, 7, true)
    const tw = d.width(name, 7, true)
    const cands: Array<{ b: Box; tx: number; ty: number; align: 'center' | 'left' | 'right' }> = [
      { b: [pt.cx - tw / 2, pt.cy + r + 2, pt.cx + tw / 2, pt.cy + r + 10], tx: pt.cx, ty: pt.cy + r + 8, align: 'center' },
      { b: [pt.cx - tw / 2, pt.cy - r - 10, pt.cx + tw / 2, pt.cy - r - 2], tx: pt.cx, ty: pt.cy - r - 3.5, align: 'center' },
      { b: [pt.cx + r + 2, pt.cy - 4, pt.cx + r + 3 + tw, pt.cy + 4], tx: pt.cx + r + 2.5, ty: pt.cy + 2.5, align: 'left' },
      { b: [pt.cx - r - 3 - tw, pt.cy - 4, pt.cx - r - 2, pt.cy + 4], tx: pt.cx - r - 2.5, ty: pt.cy + 2.5, align: 'right' },
    ]
    const pick = cands.find(cn => !hits(cn.b, idx) && cn.b[0] >= x && cn.b[2] <= x + w && cn.b[1] >= y && cn.b[3] <= y + p.h) ?? cands[0]
    taken.push(pick.b)
    d.text(name, pick.tx, pick.ty, { size: 7, bold: true, color: C.ink, align: pick.align })
  })
  return p.h
}

/** Media cancha vertical con el arco rival arriba y los remates (tamaño = xG). */
export function shotMap(d: Doc, x: number, y: number, w: number, shots: OptaShot[]) {
  const h = (w * 52.5) / 68
  const sx = w / 68
  d.rect(x, y, w, h, PITCH_BG, 4)
  const L = (x1: number, y1: number, x2: number, y2: number) => d.line(x1, y1, x2, y2, PITCH_LINE, 0.7)
  const box = (bx: number, by: number, bw: number, bh: number) => { L(bx, by, bx + bw, by); L(bx + bw, by, bx + bw, by + bh); L(bx, by + bh, bx + bw, by + bh); L(bx, by, bx, by + bh) }
  box(x, y, w, h)
  box(x + (34 - 20.16) * sx, y, 40.32 * sx, 16.5 * sx)
  box(x + (34 - 9.16) * sx, y, 18.32 * sx, 5.5 * sx)
  d.line(x + (34 - 3.66) * sx, y, x + (34 + 3.66) * sx, y, C.muted, 2)
  const order = [...shots].sort((a, b) => (a[3] === 'G' ? 1 : 0) - (b[3] === 'G' ? 1 : 0))
  for (const s of order) {
    if (s[0] < 50) continue
    const cx = x + ((100 - s[1]) * 0.68) * sx, cy = y + ((100 - s[0]) * 1.05) * sx
    const r = 1.4 + Math.sqrt(Math.max(0, s[2])) * 6.5
    if (s[3] === 'G') circle(d, cx, cy, r, C.greenBar, C.white, 0.6)
    else if (s[3] === 'S' || s[3] === 'P') circle(d, cx, cy, r, BLUE_TINT, BLUE, 0.7)
    else circle(d, cx, cy, r, '#F0F0F2', '#A1A1A6', 0.5)
  }
  return h
}

export function shotLegend(d: Doc, x: number, y: number) {
  circle(d, x + 4, y - 3, 3.5, C.greenBar)
  d.text('Gol', x + 11, y, { size: 7, color: C.muted })
  circle(d, x + 40, y - 3, 3.5, BLUE_TINT, BLUE, 0.7)
  d.text('Al arco / palo', x + 47, y, { size: 7, color: C.muted })
  circle(d, x + 110, y - 3, 3.5, '#F0F0F2', '#A1A1A6', 0.5)
  d.text('Afuera / bloqueado · tamaño = xG', x + 117, y, { size: 7, color: C.muted })
}

export interface TrendPoint { label: string; value: number; result: 'G' | 'E' | 'P'; withCoach: boolean; rolling: number | null }

/** Barras partido a partido (color por resultado), promedio móvil, promedio de la liga y tramo del DT. */
export function trend(d: Doc, x: number, y: number, w: number, h: number, pts: TrendPoint[], leagueAvg: number | null, fmt: (v: number) => string, coachShort: string) {
  const padL = 30, padB = 14
  const iw = w - padL, ih = h - padB
  const max = Math.max(leagueAvg ?? 0, ...pts.map(p => p.value)) * 1.12 || 1
  const Y = (v: number) => y + ih - (v / max) * ih
  const step = iw / Math.max(1, pts.length)
  const bw = Math.max(2, Math.min(12, step * 0.62))
  const X = (i: number) => x + padL + step * i + step / 2
  for (const v of [0, max / 2, max * 0.95]) {
    d.line(x + padL, Y(v), x + w, Y(v), '#EFEFF2', 0.5)
    d.text(fmt(v), x + padL - 4, Y(v) + 2.5, { size: 6, color: C.faint, align: 'right' })
  }
  const ci = pts.findIndex(p => p.withCoach)
  if (ci > 0) {
    const bx = X(ci) - step / 2
    d.rect(bx, y - 2, x + w - bx, ih + 2, C.greenTint)
    dashed(d, bx, y - 2, bx, y + ih, C.green, 0.8)
    d.text(`Con ${coachShort}`, bx + 3, y + 7, { size: 6.5, bold: true, color: C.green })
  }
  pts.forEach((p, i) => {
    const color = p.result === 'G' ? C.greenBar : p.result === 'P' ? '#F87171' : '#C7C7CC'
    const top = Y(p.value)
    if (y + ih - top > 0.3) d.rect(X(i) - bw / 2, top, bw, y + ih - top, color, Math.min(2, bw / 2))
  })
  if (leagueAvg !== null) dashed(d, x + padL, Y(leagueAvg), x + w, Y(leagueAvg), C.muted, 0.7)
  const line = pts.map((p, i) => (p.rolling === null ? null : [X(i), Y(p.rolling)] as [number, number])).filter((v): v is [number, number] => v !== null)
  for (let i = 1; i < line.length; i++) d.line(line[i - 1][0], line[i - 1][1], line[i][0], line[i][1], C.ink, 1.2)
  const every = Math.ceil(pts.length / 8)
  pts.forEach((p, i) => { if (i % every === 0 || i === pts.length - 1) d.text(p.label, X(i), y + h - 3, { size: 5.8, color: C.faint, align: 'center' }) })
}

export function trendLegend(d: Doc, x: number, y: number) {
  const item = (dx: number, color: string, label: string) => { d.rect(x + dx, y - 6, 7, 7, color, 1.5); d.text(label, x + dx + 10, y, { size: 7, color: C.muted }) }
  item(0, C.greenBar, 'Ganó'); item(42, '#C7C7CC', 'Empató'); item(90, '#F87171', 'Perdió')
  d.line(x + 136, y - 2.5, x + 150, y - 2.5, C.ink, 1.2); d.text('Promedio de los últimos 5', x + 154, y, { size: 7, color: C.muted })
  dashed(d, x + 262, y - 2.5, x + 276, y - 2.5, C.muted, 0.7); d.text('Promedio de la liga', x + 280, y, { size: 7, color: C.muted })
}

export interface ScatterPt { id: string; name: string; x: number; y: number; tone?: 'main' | 'rival' }

/** Dispersión de equipos: promedio en punteado, "mejor" arriba a la derecha (los ejes "menos es mejor" se dan vuelta). */
export function scatter(d: Doc, x: number, y: number, w: number, h: number, pts: ScatterPt[], ax: { label: string; lower?: boolean; fmt: (v: number) => string }, ay: { label: string; lower?: boolean; fmt: (v: number) => string }) {
  const padL = 34, padB = 22, padT = 6, padR = 8
  const range = (vs: number[]) => { const lo = Math.min(...vs), hi = Math.max(...vs); const pad = (hi - lo) * 0.08 || 1; return [lo - pad, hi + pad] as const }
  const [x0, x1] = range(pts.map(p => p.x)), [y0, y1] = range(pts.map(p => p.y))
  const fx = (v: number) => (ax.lower ? (x1 - v) / (x1 - x0) : (v - x0) / (x1 - x0))
  const fy = (v: number) => (ay.lower ? (y1 - v) / (y1 - y0) : (v - y0) / (y1 - y0))
  const X = (v: number) => x + padL + fx(v) * (w - padL - padR)
  const Y = (v: number) => y + padT + (1 - fy(v)) * (h - padT - padB)
  const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length, my = pts.reduce((s, p) => s + p.y, 0) / pts.length
  d.rect(X(mx), y + padT, x + w - padR - X(mx), Y(my) - y - padT, C.greenTint)
  d.line(x + padL, y + h - padB, x + w - padR, y + h - padB, C.line, 0.6)
  d.line(x + padL, y + padT, x + padL, y + h - padB, C.line, 0.6)
  dashed(d, X(mx), y + padT, X(mx), y + h - padB, C.faint, 0.6)
  dashed(d, x + padL, Y(my), x + w - padR, Y(my), C.faint, 0.6)
  for (const f of [0, 0.5, 1]) {
    const vx = x0 + (x1 - x0) * f, vy = y0 + (y1 - y0) * f
    d.text(ax.fmt(vx), X(vx), y + h - padB + 9, { size: 6, color: C.faint, align: 'center' })
    d.text(ay.fmt(vy), x + padL - 4, Y(vy) + 2, { size: 6, color: C.faint, align: 'right' })
  }
  d.text(`${ax.label} >`, x + w - padR, y + h - 3, { size: 7, bold: true, color: C.muted, align: 'right' })
  // Título del eje vertical, girado: arranca abajo y termina arriba a la izquierda.
  const yl = `${ay.label} >`
  const yw = d.width(yl, 7, true)
  d.pdf.setFont('helvetica', 'bold'); d.pdf.setFontSize(7); d.pdf.setTextColor(C.muted)
  d.pdf.text(yl, x + 8, y + padT + yw, { angle: 90 })
  const order = [...pts].sort((a, b) => Number(Boolean(a.tone)) - Number(Boolean(b.tone)))
  for (const p of order) {
    const color = p.tone === 'main' ? C.greenBar : p.tone === 'rival' ? BLUE : '#C7C7CC'
    circle(d, X(p.x), Y(p.y), p.tone ? 4 : 2.8, color, C.white, 0.6)
  }
  // Nombres sin pisarse: primero River y el rival, después el resto si hay lugar.
  // Los puntos también ocupan lugar: ningún nombre se escribe arriba de otro punto.
  const boxes: Array<[number, number, number, number]> = pts.map(p => [X(p.x) - 3, Y(p.y) - 3, X(p.x) + 3, Y(p.y) + 3])
  const hit = (b: [number, number, number, number]) => boxes.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])
  for (const p of [...pts].sort((a, b) => Number(Boolean(b.tone)) - Number(Boolean(a.tone)))) {
    const size = p.tone ? 7 : 6
    const tw = d.width(p.name, size, Boolean(p.tone))
    const cx = X(p.x), cy = Y(p.y)
    const right: [number, number, number, number] = [cx + 5, cy - 4, cx + 5 + tw, cy + 3]
    const left: [number, number, number, number] = [cx - 5 - tw, cy - 4, cx - 5, cy + 3]
    const fits = (b: [number, number, number, number]) => b[0] >= x + padL && b[2] <= x + w - padR
    const pick = fits(right) && !hit(right) ? right : fits(left) && !hit(left) ? left : p.tone ? (fits(right) ? right : left) : null
    if (!pick) continue
    boxes.push(pick)
    d.text(p.name, pick[0], cy + 2.2, { size, bold: Boolean(p.tone), color: p.tone === 'main' ? C.green : p.tone === 'rival' ? BLUE : C.muted })
  }
}
