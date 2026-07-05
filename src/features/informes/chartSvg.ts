// Libreria de graficos SVG puros para Informes v2.
// Sin dependencias externas. Las mismas funciones renderizan on-screen, en el PDF
// (via rasterizado del string SVG) y en el HTML autocontenido para compartir.
//
// Convencion: la geometria (calculo de coordenadas) vive en helpers chicos y
// testeados; el armado del string SVG es una capa fina encima.

// ---------------------------------------------------------------------------
// Tokens de diseno (Doble G - dark premium, acento verde)
// ---------------------------------------------------------------------------

const COLOR_GRID = 'rgba(255,255,255,0.10)'
const COLOR_AXIS_TEXT = '#8A9099'
const COLOR_STRONG_TEXT = '#E8ECF1'
const COLOR_GREEN = '#22C55E'
const COLOR_AMBER = '#FBBF24'
const COLOR_RED = '#F87171'
const COLOR_NEUTRAL = '#8A9099'
const COLOR_TRACK = 'rgba(255,255,255,0.06)'
const COLOR_POOL_POINT = 'rgba(148,163,184,0.5)'
const COLOR_BG = '#0F1114'

// ---------------------------------------------------------------------------
// Utilidades genericas
// ---------------------------------------------------------------------------

/** Escapa texto que se inserta en un SVG (labels de usuario, nombres de eje, etc). */
export function escapeSvgText(input: string): string {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Redondea a <=2 decimales para mantener el output prolijo. */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ---------------------------------------------------------------------------
// Geometria: radar
// ---------------------------------------------------------------------------

export interface Point { x: number; y: number }

/**
 * Punto sobre un circulo de radio `radius` centrado en (cx, cy), al angulo
 * `angleDeg` medido en grados donde 0deg = derecha, 90deg = abajo (sistema
 * de coordenadas SVG estandar, y crece hacia abajo).
 */
export function polarPoint(cx: number, cy: number, radius: number, angleDeg: number): Point {
  const rad = (angleDeg * Math.PI) / 180
  return {
    x: round2(cx + radius * Math.cos(rad)),
    y: round2(cy + radius * Math.sin(rad)),
  }
}

/**
 * Calcula los vertices de un poligono de radar para `values` (0..100),
 * repartidos en `count` ejes que arrancan arriba (-90deg) y avanzan en
 * sentido horario. Un valor de 100 cae en el radio maximo (maxR); un valor
 * de 0 cae en el centro.
 */
export function radarVertices(
  values: number[],
  cx: number,
  cy: number,
  maxR: number,
  count: number
): Point[] {
  const step = 360 / count
  return values.map((raw, i) => {
    const value = Math.max(0, Math.min(100, raw))
    const radius = (value / 100) * maxR
    const angle = -90 + i * step
    return polarPoint(cx, cy, radius, angle)
  })
}

// ---------------------------------------------------------------------------
// Geometria: scatter
// ---------------------------------------------------------------------------

export interface ScatterPointBase { x: number; y: number; me: boolean }

export interface ScatterDomainResult<T extends ScatterPointBase> {
  minX: number
  maxX: number
  minY: number
  maxY: number
  kept: T[]
}

/**
 * Calcula el dominio (min/max) de un scatter a partir de los puntos, con
 * pisos opcionales `xMin`/`yMin`. Los puntos con x<xMin o y<yMin se excluyen
 * (declutter/crop) y el piso del dominio queda fijado en xMin/yMin cuando se
 * proveen (en vez del minimo real de los puntos restantes).
 */
export function scatterDomain<T extends ScatterPointBase>(
  points: T[],
  xMin?: number,
  yMin?: number
): ScatterDomainResult<T> {
  const kept = points.filter(p => {
    if (xMin !== undefined && p.x < xMin) return false
    if (yMin !== undefined && p.y < yMin) return false
    return true
  })

  const xs = kept.map(p => p.x)
  const ys = kept.map(p => p.y)

  const realMinX = xs.length ? Math.min(...xs) : 0
  const realMaxX = xs.length ? Math.max(...xs) : 1
  const realMinY = ys.length ? Math.min(...ys) : 0
  const realMaxY = ys.length ? Math.max(...ys) : 1

  return {
    minX: xMin !== undefined ? xMin : realMinX,
    maxX: Math.max(realMaxX, xMin !== undefined ? xMin : realMaxX),
    minY: yMin !== undefined ? yMin : realMinY,
    maxY: Math.max(realMaxY, yMin !== undefined ? yMin : realMaxY),
    kept,
  }
}

// ---------------------------------------------------------------------------
// radarSvg
// ---------------------------------------------------------------------------

export interface RadarSeries { name: string; color: string; values: number[] }

export function radarSvg(opts: {
  axes: string[]
  series: RadarSeries[]
  size?: number
}): string {
  const { axes, series } = opts
  const size = opts.size ?? 480
  const count = axes.length
  const cx = size / 2
  const cy = size / 2
  // Padding generoso para que entren las etiquetas de eje.
  const padding = size * 0.22
  const maxR = size / 2 - padding

  const rings = [25, 50, 75, 100]
  const parts: string[] = []

  parts.push(
    `<svg width="100%" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" role="img">`
  )

  // Anillos concentricos (poligonos de fondo).
  for (const ring of rings) {
    const verts = radarVertices(new Array(count).fill(ring), cx, cy, maxR, count)
    const pointsAttr = verts.map(v => `${v.x},${v.y}`).join(' ')
    parts.push(
      `<polygon points="${pointsAttr}" fill="none" stroke="${COLOR_GRID}" stroke-width="1"/>`
    )
  }

  // Radios (spokes) hacia cada vertice del eje.
  const outerVerts = radarVertices(new Array(count).fill(100), cx, cy, maxR, count)
  outerVerts.forEach(v => {
    parts.push(
      `<line x1="${cx}" y1="${cy}" x2="${v.x}" y2="${v.y}" stroke="${COLOR_GRID}" stroke-width="1"/>`
    )
  })

  // Etiquetas de eje, ubicadas un poco afuera del vertice exterior.
  const labelR = maxR + padding * 0.55
  const step = 360 / count
  axes.forEach((axis, i) => {
    const angle = -90 + i * step
    const pos = polarPoint(cx, cy, labelR, angle)
    // Normalizar angulo a 0..360 para decidir alineacion del texto.
    let norm = angle % 360
    if (norm < 0) norm += 360
    let anchor: 'start' | 'middle' | 'end' = 'middle'
    if (norm > 100 && norm < 260) anchor = 'end'
    else if (norm < 80 || norm > 280) anchor = 'start'
    parts.push(
      `<text x="${pos.x}" y="${pos.y}" fill="${COLOR_AXIS_TEXT}" font-size="12" text-anchor="${anchor}" dominant-baseline="middle">${escapeSvgText(axis)}</text>`
    )
  })

  // Series, en orden (las ultimas quedan encima).
  series.forEach(s => {
    const verts = radarVertices(s.values, cx, cy, maxR, count)
    const pointsAttr = verts.map(v => `${v.x},${v.y}`).join(' ')
    parts.push(
      `<polygon points="${pointsAttr}" fill="${s.color}" fill-opacity="0.12" stroke="${s.color}" stroke-width="2.5"/>`
    )
    verts.forEach(v => {
      parts.push(`<circle cx="${v.x}" cy="${v.y}" r="3.5" fill="${s.color}"/>`)
    })
  })

  parts.push('</svg>')
  return parts.join('')
}

// ---------------------------------------------------------------------------
// barsSvg
// ---------------------------------------------------------------------------

export interface BarRow {
  label: string
  pct: number
  value: string
  rank: string
  dot: 'green' | 'amber' | 'red' | 'neutral'
}

const DOT_COLOR: Record<BarRow['dot'], string> = {
  green: COLOR_GREEN,
  amber: COLOR_AMBER,
  red: COLOR_RED,
  neutral: COLOR_NEUTRAL,
}

function truncateLabel(label: string, maxChars = 22): string {
  if (label.length <= maxChars) return label
  return `${label.slice(0, maxChars - 1)}…`
}

export function barsSvg(opts: { rows: BarRow[]; width?: number }): string {
  const { rows } = opts
  const width = opts.width ?? 720
  const rowHeight = 42
  const paddingTop = 8
  const paddingBottom = 8
  const height = rows.length * rowHeight + paddingTop + paddingBottom

  // Layout horizontal: [label][track][value+rank+dot]
  const labelWidth = width * 0.26
  const rightWidth = width * 0.20
  const trackX = labelWidth + 12
  const trackWidth = width - labelWidth - rightWidth - 24
  const trackHeight = 10

  const parts: string[] = []
  parts.push(
    `<svg width="100%" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img">`
  )

  rows.forEach((row, i) => {
    const rowY = paddingTop + i * rowHeight
    const centerY = rowY + rowHeight / 2
    const trackY = centerY - trackHeight / 2
    const pct = Math.max(0, Math.min(100, row.pct))
    const fillWidth = round2((pct / 100) * trackWidth)
    const midX = round2(trackX + trackWidth / 2)
    const dotColor = DOT_COLOR[row.dot]
    const truncated = truncateLabel(row.label)

    // Label (con <title> propio para el texto completo si fue truncado).
    parts.push(
      `<text x="0" y="${centerY}" fill="${COLOR_STRONG_TEXT}" font-size="13" dominant-baseline="middle">${escapeSvgText(truncated)}<title>${escapeSvgText(row.label)}</title></text>`
    )

    // Track de fondo.
    parts.push(
      `<rect x="${round2(trackX)}" y="${round2(trackY)}" width="${round2(trackWidth)}" height="${trackHeight}" rx="5" fill="${COLOR_TRACK}"/>`
    )
    // Fill verde proporcional al pct.
    if (fillWidth > 0) {
      parts.push(
        `<rect x="${round2(trackX)}" y="${round2(trackY)}" width="${fillWidth}" height="${trackHeight}" rx="5" fill="${COLOR_GREEN}"/>`
      )
    }
    // Marcador punteado al 50% (promedio del grupo).
    parts.push(
      `<line x1="${midX}" y1="${round2(trackY - 3)}" x2="${midX}" y2="${round2(trackY + trackHeight + 3)}" stroke="${COLOR_AXIS_TEXT}" stroke-width="1" stroke-dasharray="2,2"/>`
    )

    // Valor + rank + dot semaforo a la derecha del track.
    const rightX = round2(trackX + trackWidth + 12)
    parts.push(
      `<circle cx="${rightX}" cy="${round2(centerY)}" r="4" fill="${dotColor}"/>`
    )
    parts.push(
      `<text x="${round2(rightX + 10)}" y="${centerY}" fill="${COLOR_STRONG_TEXT}" font-size="13" dominant-baseline="middle">${escapeSvgText(row.value)} <tspan fill="${COLOR_AXIS_TEXT}">${escapeSvgText(row.rank)}</tspan></text>`
    )
  })

  parts.push('</svg>')
  return parts.join('')
}

// ---------------------------------------------------------------------------
// scatterSvg
// ---------------------------------------------------------------------------

export interface ScatterPoint { x: number; y: number; me: boolean }

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min]
  const step = (max - min) / (count - 1)
  const ticks: number[] = []
  for (let i = 0; i < count; i++) ticks.push(round2(min + step * i))
  return ticks
}

function formatTick(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

export function scatterSvg(opts: {
  points: ScatterPoint[]
  xLabel: string
  yLabel: string
  xMin?: number
  yMin?: number
  size?: number
}): string {
  const { xLabel, yLabel } = opts
  const width = opts.size ?? 520
  const height = width * 0.78

  const domain = scatterDomain(opts.points, opts.xMin, opts.yMin)
  const { minX, maxX, minY, maxY, kept } = domain

  // Margenes para ejes y labels.
  const marginLeft = 56
  const marginRight = 24
  const marginTop = 20
  const marginBottom = 48

  const plotW = width - marginLeft - marginRight
  const plotH = height - marginTop - marginBottom

  const spanX = maxX - minX || 1
  const spanY = maxY - minY || 1

  const toPx = (p: { x: number; y: number }) => ({
    x: round2(marginLeft + ((p.x - minX) / spanX) * plotW),
    // y invertido: valores mayores arriba.
    y: round2(marginTop + (1 - (p.y - minY) / spanY) * plotH),
  })

  const parts: string[] = []
  parts.push(
    `<svg width="100%" viewBox="0 0 ${round2(width)} ${round2(height)}" xmlns="http://www.w3.org/2000/svg" role="img">`
  )

  // Grid + ticks.
  const xTicks = niceTicks(minX, maxX)
  const yTicks = niceTicks(minY, maxY)

  xTicks.forEach(t => {
    const px = toPx({ x: t, y: minY }).x
    parts.push(
      `<line x1="${px}" y1="${round2(marginTop)}" x2="${px}" y2="${round2(marginTop + plotH)}" stroke="${COLOR_GRID}" stroke-width="1"/>`
    )
    parts.push(
      `<text x="${px}" y="${round2(marginTop + plotH + 18)}" fill="${COLOR_AXIS_TEXT}" font-size="11" text-anchor="middle">${formatTick(t)}</text>`
    )
  })
  yTicks.forEach(t => {
    const py = toPx({ x: minX, y: t }).y
    parts.push(
      `<line x1="${round2(marginLeft)}" y1="${py}" x2="${round2(marginLeft + plotW)}" y2="${py}" stroke="${COLOR_GRID}" stroke-width="1"/>`
    )
    parts.push(
      `<text x="${round2(marginLeft - 8)}" y="${py}" fill="${COLOR_AXIS_TEXT}" font-size="11" text-anchor="end" dominant-baseline="middle">${formatTick(t)}</text>`
    )
  })

  // Eje labels.
  parts.push(
    `<text x="${round2(marginLeft + plotW / 2)}" y="${round2(height - 6)}" fill="${COLOR_AXIS_TEXT}" font-size="12" text-anchor="middle">${escapeSvgText(xLabel)}</text>`
  )
  parts.push(
    `<text x="14" y="${round2(marginTop + plotH / 2)}" fill="${COLOR_AXIS_TEXT}" font-size="12" text-anchor="middle" transform="rotate(-90 14 ${round2(marginTop + plotH / 2)})">${escapeSvgText(yLabel)}</text>`
  )

  // Lineas de referencia de la media (de los puntos conservados).
  if (kept.length > 0) {
    const meanX = kept.reduce((sum, p) => sum + p.x, 0) / kept.length
    const meanY = kept.reduce((sum, p) => sum + p.y, 0) / kept.length
    const meanPx = toPx({ x: meanX, y: minY }).x
    const meanPy = toPx({ x: minX, y: meanY }).y
    parts.push(
      `<line x1="${meanPx}" y1="${round2(marginTop)}" x2="${meanPx}" y2="${round2(marginTop + plotH)}" stroke="rgba(148,163,184,0.6)" stroke-width="1" stroke-dasharray="4,3"/>`
    )
    parts.push(
      `<line x1="${round2(marginLeft)}" y1="${meanPy}" x2="${round2(marginLeft + plotW)}" y2="${meanPy}" stroke="rgba(148,163,184,0.6)" stroke-width="1" stroke-dasharray="4,3"/>`
    )
  }

  // Puntos: pool primero, protagonista(s) despues para que queden encima.
  const pool = kept.filter(p => !p.me)
  const mine = kept.filter(p => p.me)

  pool.forEach(p => {
    const px = toPx(p)
    parts.push(`<circle cx="${px.x}" cy="${px.y}" r="4.5" fill="${COLOR_POOL_POINT}"/>`)
  })

  mine.forEach(p => {
    const px = toPx(p)
    // Halo tenue detras del punto protagonista.
    parts.push(
      `<circle cx="${px.x}" cy="${px.y}" r="14" fill="${COLOR_GREEN}" fill-opacity="0.15"/>`
    )
    parts.push(
      `<circle cx="${px.x}" cy="${px.y}" r="8" fill="${COLOR_GREEN}" stroke="${COLOR_BG}" stroke-width="2"/>`
    )
  })

  parts.push('</svg>')
  return parts.join('')
}
