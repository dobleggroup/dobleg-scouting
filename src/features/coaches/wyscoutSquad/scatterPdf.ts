// src/features/coaches/wyscoutSquad/scatterPdf.ts
// Grafico de dispersion para el PDF: mismo dibujo que la pagina (cuadrante verde arriba a la
// derecha, medianas punteadas, nombre de cada jugador sin pisarse).
import { axisRange, buildScatter, placeLabels, pointLabel, POSITION_GROUPS, type ScatterDef } from './scatterPlots'
import { formatMetric } from './widgetDefs'
import { C, descHeight, blockTitle, type ColumnBlock, type Doc } from './pdfDoc'
import type { SquadPlayer } from './wyscoutSquadTypes'

const GREEN = '#15803D'
const GREEN_DOT = '#22C55E'
const GREEN_TINT = '#EAF6EE'
const GRAY_DOT = '#A1A1A6'

function star(d: Doc, cx: number, cy: number, r: number, color: string) {
  const pts: [number, number][] = []
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 === 0 ? r : r * 0.45
    pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)])
  }
  const deltas = pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]])
  d.pdf.setFillColor(color)
  d.pdf.lines(deltas, pts[0][0], pts[0][1], [1, 1], 'F', true)
}

export function scatterBlock(def: ScatterDef, players: SquadPlayer[], opts: { minMinutes: number; teamMatches: number }, d: Doc, w: number): ColumnBlock | null {
  const data = buildScatter(players, def, opts)
  if (data.points.length < 2) return null
  const desc = `${def.question} ${POSITION_GROUPS[def.group].label} con al menos ${opts.minMinutes} minutos. Líneas punteadas: mediana del grupo.`
  const top = descHeight(d, desc, w) + 4
  const chartH = 158
  return {
    h: top + chartH + 16,
    top,
    draw: (d, y, x, w, rowTop = top) => {
      blockTitle(d, y, def.title, desc, x, w)
      const cy = y + rowTop
      d.rect(x, cy, w, chartH, C.tile, 6)
      const pad = { left: 40, right: 10, top: 20, bottom: 30 }
      const px0 = x + pad.left
      const py0 = cy + pad.top
      const pw = w - pad.left - pad.right
      const ph = chartH - pad.top - pad.bottom
      const xr = axisRange(data.points.map(p => p.x), def.x.format === 'pct')
      const yr = axisRange(data.points.map(p => p.y), def.y.format === 'pct')
      const sx = (v: number) => px0 + ((v - xr.lo) / (xr.hi - xr.lo)) * pw
      const sy = (v: number) => py0 + ph - ((v - yr.lo) / (yr.hi - yr.lo)) * ph
      const fx = (v: number) => formatMetric(v, def.x.format === 'pct' ? 'pct' : 'dec2')
      const fy = (v: number) => formatMetric(v, def.y.format === 'pct' ? 'pct' : 'dec2')

      d.rect(px0, py0, pw, ph, '#FFFFFF')
      if (data.xMid !== null && data.yMid !== null) {
        d.rect(sx(data.xMid), py0, px0 + pw - sx(data.xMid), sy(data.yMid) - py0, GREEN_TINT)
        // El texto del recuadro va en la franja de arriba, fuera de la zona de los puntos.
        d.text(def.bestLabel, px0 + pw, py0 - 6, { size: 6.8, bold: true, color: GREEN, align: 'right' })
        star(d, px0 + pw - 5 - d.width(def.bestLabel, 6.8, true), py0 - 8.2, 3.2, GREEN)
      }
      for (let i = 0; i <= 4; i++) {
        const tx = xr.lo + ((xr.hi - xr.lo) * i) / 4
        const ty = yr.lo + ((yr.hi - yr.lo) * i) / 4
        d.line(sx(tx), py0, sx(tx), py0 + ph, '#ECECEF', 0.4)
        d.line(px0, sy(ty), px0 + pw, sy(ty), '#ECECEF', 0.4)
        d.text(fx(tx), sx(tx), py0 + ph + 9, { size: 5.8, color: C.faint, align: 'center' })
        d.text(fy(ty), px0 - 4, sy(ty) + 2, { size: 5.8, color: C.faint, align: 'right' })
      }
      d.pdf.setLineDashPattern([3, 2], 0)
      if (data.xMid !== null) d.line(sx(data.xMid), py0, sx(data.xMid), py0 + ph, '#8E8E93', 0.7)
      if (data.yMid !== null) d.line(px0, sy(data.yMid), px0 + pw, sy(data.yMid), '#8E8E93', 0.7)
      d.pdf.setLineDashPattern([], 0)
      d.text(`${def.x.label} >`, px0 + pw / 2, cy + chartH - 7, { size: 7, bold: true, color: C.text, align: 'center' })
      // Texto girado 90°: se escribe hacia arriba desde (x, y); se centra a mano con su ancho.
      const yLabel = `${def.y.label} >`
      const yLabelW = d.width(yLabel, 7, true)
      d.font(7, true, C.text)
      d.pdf.text(yLabel, x + 12, py0 + ph / 2 + yLabelW / 2, { angle: 90 })

      const ordered = [...data.points].sort((a, b) => Number(b.best) - Number(a.best))
      const labels = placeLabels(
        ordered.map(p => ({ px: sx(p.x), py: sy(p.y), text: pointLabel(p.name) })),
        { left: px0 + 2, right: px0 + pw - 2, top: py0 + 2, bottom: py0 + ph - 2 },
        3.7, 8,
      )
      ;[...ordered].reverse().forEach(p => {
        d.pdf.setFillColor('#FFFFFF')
        d.pdf.circle(sx(p.x), sy(p.y), p.best ? 4.2 : 3.6, 'F')
        d.pdf.setFillColor(p.best ? GREEN_DOT : GRAY_DOT)
        d.pdf.circle(sx(p.x), sy(p.y), p.best ? 3.2 : 2.6, 'F')
      })
      ordered.forEach((p, i) => {
        d.text(pointLabel(p.name), labels[i].x, labels[i].y, {
          size: 6.8, bold: p.best, color: p.best ? C.ink : C.muted, align: labels[i].anchor === 'start' ? 'left' : 'right',
        })
      })
      const best = data.points.filter(p => p.best).map(p => pointLabel(p.name))
      d.text(best.length ? `Arriba a la derecha: ${best.join(', ')}` : 'Nadie supera la mediana en las dos cosas a la vez.',
        x, cy + chartH + 11, { size: 7.4, bold: best.length > 0, color: best.length ? GREEN : C.muted })
    },
  }
}
