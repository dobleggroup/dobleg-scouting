// src/features/coaches/wyscoutSquad/pdfDoc.ts
// Piezas comunes del PDF del Resumen: colores, hoja con encabezado, textos, tablas y
// bloques que nunca se parten entre dos hojas.
import type { jsPDF as JsPdf } from 'jspdf'

export const C = {
  ink: '#1D1D1F', text: '#3A3A3C', muted: '#6E6E73', faint: '#A1A1A6', line: '#E5E5EA',
  tile: '#F5F5F7', green: '#15803D', greenBar: '#22C55E', greenTint: '#EDF7F0',
  red: '#DC2626', redTint: '#FDECEC', grayChip: '#D2D2D7', white: '#FFFFFF',
}
export const M = 36
export const HEADER_BOTTOM = 70
export const FOOTER_TOP = 40 // desde abajo
export const GAP = 18
export const LOCALE = 'es-AR'

/** La fuente estandar de jsPDF es Latin-1: los signos que no entran se reemplazan. */
export function clean(s: string): string {
  return s.replace(/[−–—]/g, '-').replace(/…/g, '...').replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
}


export class Doc {
  constructor(public pdf: JsPdf, private title: string, private logo?: { url: string; w: number; h: number }) {}

  get W() { return this.pdf.internal.pageSize.getWidth() }
  get H() { return this.pdf.internal.pageSize.getHeight() }
  get CW() { return this.W - M * 2 }
  get contentH() { return this.H - FOOTER_TOP - HEADER_BOTTOM - 8 }

  font(size: number, bold = false, color = C.ink) {
    this.pdf.setFont('helvetica', bold ? 'bold' : 'normal')
    this.pdf.setFontSize(size)
    this.pdf.setTextColor(color)
  }

  text(str: string, x: number, y: number, o: { size?: number; bold?: boolean; color?: string; align?: 'left' | 'center' | 'right' } = {}) {
    this.font(o.size ?? 9, o.bold, o.color ?? C.ink)
    this.pdf.text(clean(str), x, y, { align: o.align ?? 'left', baseline: 'alphabetic' })
  }

  width(str: string, size: number, bold = false) {
    this.font(size, bold)
    return this.pdf.getTextWidth(clean(str))
  }

  fit(str: string, maxW: number, size: number, bold = false) {
    if (this.width(str, size, bold) <= maxW) return str
    let s = str
    while (s.length > 1 && this.width(s + '...', size, bold) > maxW) s = s.slice(0, -1)
    return s.trimEnd() + '...'
  }

  wrap(str: string, maxW: number, size: number) {
    this.font(size)
    return this.pdf.splitTextToSize(clean(str), maxW) as string[]
  }

  rect(x: number, y: number, w: number, h: number, fill: string, r = 0) {
    this.pdf.setFillColor(fill)
    if (r > 0) this.pdf.roundedRect(x, y, w, h, r, r, 'F')
    else this.pdf.rect(x, y, w, h, 'F')
  }

  line(x1: number, y1: number, x2: number, y2: number, color = C.line, width = 0.6) {
    this.pdf.setDrawColor(color)
    this.pdf.setLineWidth(width)
    this.pdf.line(x1, y1, x2, y2)
  }

  newPage(orientation: 'portrait' | 'landscape' = 'landscape') {
    this.pdf.addPage('a4', orientation)
    this.header()
  }

  header() {
    this.text('DOBLE G SPORTS GROUP', M, 30, { size: 7, bold: true, color: C.green })
    this.text(this.title, M, 42, { size: 8, color: C.muted })
    if (this.logo) this.pdf.addImage(this.logo.url, 'PNG', this.W - M - this.logo.w, 20, this.logo.w, this.logo.h)
    this.line(M, 52, this.W - M, 52)
  }
}


export interface Block { h: number; draw: (d: Doc, y: number) => void }

export const TITLE_H = 22

export function blockTitle(d: Doc, y: number, title: string, description?: string, x = M, w = d.CW): number {
  d.text(title, x, y + 13, { size: 12.5, bold: true })
  let h = TITLE_H
  if (description) {
    const lines = d.wrap(description, w, 8.2)
    lines.forEach((l, i) => d.text(l, x, y + h + 6 + i * 11, { size: 8.2, color: C.muted }))
    h += lines.length * 11 + 6
  }
  return h
}

export function descHeight(d: Doc, description?: string, w = d.CW) {
  return TITLE_H + (description ? d.wrap(description, w, 8.2).length * 11 + 6 : 0)
}

/** Bloque que se dibuja en una columna (x, ancho): dos de estos van lado a lado. */
export interface ColumnBlock {
  h: number
  /** Alto del titulo + descripcion: en una fila, las tablas arrancan todas a la misma altura. */
  top?: number
  draw: (d: Doc, y: number, x: number, w: number, top?: number) => void
}

/** Pone los bloques de a dos por fila (el ultimo solo, a media hoja si es impar). */
export function pairColumns(d: Doc, items: ((w: number) => ColumnBlock | null)[], gap = 18): Block[] {
  const w = (d.CW - gap) / 2
  const built = items.map(f => f(w)).filter((b): b is ColumnBlock => b !== null)
  const out: Block[] = []
  for (let i = 0; i < built.length; i += 2) {
    const a = built[i]
    const b = built[i + 1]
    const top = Math.max(a.top ?? 0, b?.top ?? 0)
    const hOf = (c: ColumnBlock) => c.h - (c.top ?? top) + top
    out.push({
      h: Math.max(hOf(a), b ? hOf(b) : 0),
      draw: (d, y) => {
        a.draw(d, y, M, w, top)
        b?.draw(d, y, M + w + gap, w, top)
      },
    })
  }
  return out
}

export interface Col { title: string; w: number; align?: 'left' | 'right' | 'center' }

export const ROW_H = 18
export const HEAD_H = 18

export function drawHead(d: Doc, cols: Col[], y: number, x0 = M) {
  const total = cols.reduce((s, c) => s + c.w, 0)
  d.rect(x0, y, total, HEAD_H, C.tile, 3)
  let x = x0
  for (const c of cols) {
    const tx = c.align === 'right' ? x + c.w - 6 : c.align === 'center' ? x + c.w / 2 : x + 6
    d.text(c.title.toUpperCase(), tx, y + 12, { size: 6.4, bold: true, color: C.muted, align: c.align ?? 'left' })
    x += c.w
  }
}

export function drawCells(d: Doc, cols: Col[], cells: string[], y: number, o: { bold?: number[]; x0?: number; size?: number; colors?: (string | undefined)[] } = {}) {
  let x = o.x0 ?? M
  const size = o.size ?? 8.4
  cells.forEach((s, i) => {
    const c = cols[i]
    const tx = c.align === 'right' ? x + c.w - 6 : c.align === 'center' ? x + c.w / 2 : x + 6
    const bold = o.bold?.includes(i)
    d.text(d.fit(s, c.w - 10, size, bold), tx, y + 12, { size, bold, color: o.colors?.[i] ?? (bold ? C.ink : C.text), align: c.align ?? 'left' })
    x += c.w
  })
}


export function tiles(d: Doc, y: number, items: [string, string][]) {
  const gap = 8
  const w = (d.CW - gap * (items.length - 1)) / items.length
  items.forEach(([value, label], i) => {
    const x = M + i * (w + gap)
    d.rect(x, y, w, 48, C.tile, 6)
    d.text(value, x + w / 2, y + 23, { size: 15, bold: true, align: 'center' })
    d.text(label.toUpperCase(), x + w / 2, y + 38, { size: 6.4, bold: true, color: C.muted, align: 'center' })
  })
}

