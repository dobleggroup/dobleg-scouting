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
const COLOR_AVG_MARK = '#CBD2DB'   // marcador de promedio en barras: gris claro, legible sin competir con el verde
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
 * Padding de eje proporcional al rango de datos (8%), con un piso pequeño
 * cuando el rango es 0 (todos los valores iguales o un solo punto) para que
 * el dominio no quede degenerado.
 */
function axisPad(min: number, max: number): number {
  const span = max - min
  if (span > 0) return span * 0.08
  return Math.max(Math.abs(max) * 0.08, 0.5)
}

/**
 * Calcula el dominio (min/max) de un scatter a partir de los puntos, con
 * pisos opcionales `xMin`/`yMin`. Los puntos con x<xMin o y<yMin se excluyen
 * (declutter/crop).
 *
 * Cuando no se provee un piso, el dominio se ajusta de forma ajustada (tight)
 * a los datos reales: `min = dataMin - pad`, `max = dataMax + pad`, con
 * `pad` proporcional al rango de esa metrica (no se fuerza a arrancar en 0 —
 * cada metrica tiene su propia escala, ej. un % 0-100 vs un por-90 0-5).
 * Cuando se provee un piso (`xMin`/`yMin`), ese valor se usa tal cual como
 * piso del dominio (sin padding adicional hacia abajo).
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

  const padX = axisPad(realMinX, realMaxX)
  const padY = axisPad(realMinY, realMaxY)

  const minX = xMin !== undefined ? xMin : realMinX - padX
  const minY = yMin !== undefined ? yMin : realMinY - padY

  return {
    minX,
    maxX: Math.max(realMaxX + padX, minX),
    minY,
    maxY: Math.max(realMaxY + padY, minY),
    kept,
  }
}

// ---------------------------------------------------------------------------
// radarSvg
// ---------------------------------------------------------------------------

export interface RadarSeries {
  name: string
  color: string
  values: number[]
  dashed?: boolean   // true = polígono con trazo punteado (ej. la referencia "Promedio")
  fill?: boolean     // false = sin relleno, solo contorno (default: rellena al 12%)
}

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

  // Margen horizontal extra en el viewBox: da lugar a las etiquetas de los
  // costados (que son las más largas) sin encoger el radar ni cortarlas.
  const hMargin = size * 0.16
  parts.push(
    `<svg width="100%" viewBox="${round2(-hMargin)} 0 ${round2(size + hMargin * 2)} ${size}" xmlns="http://www.w3.org/2000/svg" role="img">`
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

  // Etiquetas de eje, ubicadas un poco afuera del vertice exterior. Se parten en
  // hasta 2 lineas para que las largas entren enteras.
  const labelR = maxR + padding * 0.5
  const labelFont = 13
  const lineH = labelFont + 2.5
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
    const lines = wrapLabel(axis)
    const startDy = -((lines.length - 1) / 2) * lineH
    const tspans = lines
      .map((ln, li) => `<tspan x="${pos.x}" dy="${round2(li === 0 ? startDy : lineH)}">${escapeSvgText(ln)}</tspan>`)
      .join('')
    parts.push(
      `<text x="${pos.x}" y="${pos.y}" fill="${COLOR_AXIS_TEXT}" font-size="${labelFont}" text-anchor="${anchor}" dominant-baseline="middle">${tspans}</text>`
    )
  })

  // Series, en orden (las ultimas quedan encima). La serie de referencia
  // ("Promedio") va punteada y sin relleno, para que lea como una guia por
  // encima del poligono lleno del protagonista.
  series.forEach(s => {
    const verts = radarVertices(s.values, cx, cy, maxR, count)
    const pointsAttr = verts.map(v => `${v.x},${v.y}`).join(' ')
    const fillOpacity = s.fill === false ? 0 : 0.12
    const dashAttr = s.dashed ? ' stroke-dasharray="5,4"' : ''
    const strokeWidth = s.dashed ? 2 : 2.5
    parts.push(
      `<polygon points="${pointsAttr}" fill="${s.color}" fill-opacity="${fillOpacity}" stroke="${s.color}" stroke-width="${strokeWidth}"${dashAttr}/>`
    )
    // Los vertices (puntos) solo en series llenas; la referencia punteada queda limpia.
    if (!s.dashed) {
      verts.forEach(v => {
        parts.push(`<circle cx="${v.x}" cy="${v.y}" r="3.5" fill="${s.color}"/>`)
      })
    }
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
  avgPct: number | null   // posición (0-100) del promedio del pool; null = sin dato, no se dibuja
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

/**
 * Parte un label largo en hasta 2 líneas cortando en el espacio más cercano a la
 * mitad, para que las etiquetas del radar no se corten al costado. Devuelve 1 o 2
 * líneas (si no hay espacio para cortar, devuelve el label entero en una línea).
 */
function wrapLabel(label: string, maxChars = 15): string[] {
  if (label.length <= maxChars) return [label]
  const mid = Math.floor(label.length / 2)
  let best = -1
  for (let i = 0; i < label.length; i++) {
    if (label[i] === ' ' && (best === -1 || Math.abs(i - mid) < Math.abs(best - mid))) best = i
  }
  if (best === -1) return [label]
  return [label.slice(0, best), label.slice(best + 1)]
}

export function barsSvg(opts: { rows: BarRow[]; width?: number; stacked?: boolean }): string {
  if (opts.stacked) return barsSvgStacked(opts.rows, opts.width ?? 380)
  const { rows } = opts
  const width = opts.width ?? 720
  const rowHeight = 46
  const paddingTop = 8
  const paddingBottom = 8
  const height = rows.length * rowHeight + paddingTop + paddingBottom

  // Layout horizontal: [label][track][value+rank+dot]
  const labelWidth = width * 0.26
  const rightWidth = width * 0.20
  const trackX = labelWidth + 12
  const trackWidth = width - labelWidth - rightWidth - 24
  const trackHeight = 12

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
    const dotColor = DOT_COLOR[row.dot]
    const truncated = truncateLabel(row.label)

    // Label (con <title> propio para el texto completo si fue truncado).
    parts.push(
      `<text x="0" y="${centerY}" fill="${COLOR_STRONG_TEXT}" font-size="14" dominant-baseline="middle">${escapeSvgText(truncated)}<title>${escapeSvgText(row.label)}</title></text>`
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
    // Marcador del promedio real del pool: linea nitida + puntero triangular arriba.
    if (row.avgPct != null) {
      const avgPct = Math.max(0, Math.min(100, row.avgPct))
      const avgX = round2(trackX + (avgPct / 100) * trackWidth)
      const top = round2(trackY - 5)
      const bottom = round2(trackY + trackHeight + 5)
      parts.push(
        `<line x1="${avgX}" y1="${top}" x2="${avgX}" y2="${bottom}" stroke="${COLOR_AVG_MARK}" stroke-width="2" stroke-linecap="round"/>`
      )
      // Puntero (triangulo) apuntando hacia abajo, justo por encima de la linea.
      parts.push(
        `<path d="M${round2(avgX - 3.5)} ${round2(top - 5)} L${round2(avgX + 3.5)} ${round2(top - 5)} L${avgX} ${round2(top - 0.5)} Z" fill="${COLOR_AVG_MARK}"/>`
      )
    }

    // Valor + rank + dot semaforo a la derecha del track.
    const rightX = round2(trackX + trackWidth + 12)
    parts.push(
      `<circle cx="${rightX}" cy="${round2(centerY)}" r="4" fill="${dotColor}"/>`
    )
    parts.push(
      `<text x="${round2(rightX + 10)}" y="${centerY}" fill="${COLOR_STRONG_TEXT}" font-size="14" dominant-baseline="middle">${escapeSvgText(row.value)} <tspan fill="${COLOR_AXIS_TEXT}">${escapeSvgText(row.rank)}</tspan></text>`
    )
  })

  parts.push('</svg>')
  return parts.join('')
}

/**
 * Variante apilada de las barras, pensada para pantallas angostas (mobile):
 * el nombre de la métrica va completo en una línea arriba y la barra full-width
 * debajo, con el valor + puesto a la derecha. Al no comprimir el label al 26%
 * del ancho, los nombres se leen aunque el SVG se achique.
 */
function barsSvgStacked(rows: BarRow[], width: number): string {
  const rowHeight = 48
  const paddingTop = 6
  const paddingBottom = 6
  const height = rows.length * rowHeight + paddingTop + paddingBottom
  const trackHeight = 13
  const valueSlot = 84
  const trackWidth = width - valueSlot

  const parts: string[] = []
  parts.push(`<svg width="100%" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img">`)

  rows.forEach((row, i) => {
    const rowY = paddingTop + i * rowHeight
    const pct = Math.max(0, Math.min(100, row.pct))
    const fillWidth = round2((pct / 100) * trackWidth)
    const dotColor = DOT_COLOR[row.dot]
    const label = row.label.length > 40 ? row.label.slice(0, 39) + '…' : row.label
    const trackY = rowY + 26
    const centerY = round2(trackY + trackHeight / 2)

    // Nombre de la métrica (completo), arriba.
    parts.push(
      `<text x="0" y="${rowY + 13}" fill="${COLOR_STRONG_TEXT}" font-size="15" font-weight="600" dominant-baseline="middle">${escapeSvgText(label)}<title>${escapeSvgText(row.label)}</title></text>`
    )
    // Track + fill.
    parts.push(`<rect x="0" y="${round2(trackY)}" width="${round2(trackWidth)}" height="${trackHeight}" rx="6" fill="${COLOR_TRACK}"/>`)
    if (fillWidth > 0) {
      parts.push(`<rect x="0" y="${round2(trackY)}" width="${fillWidth}" height="${trackHeight}" rx="6" fill="${COLOR_GREEN}"/>`)
    }
    // Marcador del promedio.
    if (row.avgPct != null) {
      const avgPct = Math.max(0, Math.min(100, row.avgPct))
      const avgX = round2((avgPct / 100) * trackWidth)
      const top = round2(trackY - 5)
      const bottom = round2(trackY + trackHeight + 5)
      parts.push(`<line x1="${avgX}" y1="${top}" x2="${avgX}" y2="${bottom}" stroke="${COLOR_AVG_MARK}" stroke-width="2" stroke-linecap="round"/>`)
      parts.push(`<path d="M${round2(avgX - 3.5)} ${round2(top - 5)} L${round2(avgX + 3.5)} ${round2(top - 5)} L${avgX} ${round2(top - 0.5)} Z" fill="${COLOR_AVG_MARK}"/>`)
    }
    // Dot + valor + puesto, a la derecha de la barra.
    const dotX = round2(trackWidth + 12)
    parts.push(`<circle cx="${dotX}" cy="${centerY}" r="4" fill="${dotColor}"/>`)
    parts.push(
      `<text x="${round2(dotX + 9)}" y="${centerY}" fill="${COLOR_STRONG_TEXT}" font-size="13" dominant-baseline="middle">${escapeSvgText(row.value)} <tspan fill="${COLOR_AXIS_TEXT}">${escapeSvgText(row.rank)}</tspan></text>`
    )
  })

  parts.push('</svg>')
  return parts.join('')
}

// ---------------------------------------------------------------------------
// gaugeSvg (velocímetro de rating)
// ---------------------------------------------------------------------------

/** Path de un arco entre dos ángulos (grados, sistema SVG: 0=derecha, 90=abajo). */
function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const s = polarPoint(cx, cy, r, startDeg)
  const e = polarPoint(cx, cy, r, endDeg)
  const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0
  return `M ${s.x} ${s.y} A ${round2(r)} ${round2(r)} 0 ${largeArc} 1 ${e.x} ${e.y}`
}

function gaugeColor(frac: number): string {
  if (frac >= 0.66) return COLOR_GREEN
  if (frac >= 0.4) return COLOR_AMBER
  return COLOR_RED
}

/**
 * Velocímetro semicircular de rating: arco de fondo + arco de valor coloreado por
 * nivel, valor grande al centro y (opcional) una marca del promedio. `value` y
 * `max` en la misma escala (ej. 7.4/10 o 82/100).
 */
export function gaugeSvg(opts: {
  value: number
  max: number
  avg?: number
  size?: number
}): string {
  const width = opts.size ?? 220
  const height = round2(width * 0.6)
  const cx = width / 2
  const cy = round2(height * 0.9)
  const r = round2(width * 0.4)
  const stroke = round2(width * 0.055)

  const frac = Math.max(0, Math.min(1, opts.max > 0 ? opts.value / opts.max : 0))
  const color = gaugeColor(frac)
  const valueAngle = 180 + frac * 180

  const parts: string[] = []
  parts.push(`<svg width="100%" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img">`)

  // Arco de fondo (track) completo.
  parts.push(
    `<path d="${arcPath(cx, cy, r, 180, 360)}" fill="none" stroke="${COLOR_TRACK}" stroke-width="${stroke}" stroke-linecap="round"/>`
  )
  // Arco de valor.
  if (frac > 0) {
    parts.push(
      `<path d="${arcPath(cx, cy, r, 180, valueAngle)}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"/>`
    )
  }
  // Marca de promedio (tick radial corto), si se provee y cae en rango.
  if (opts.avg != null && opts.max > 0 && opts.avg >= 0 && opts.avg <= opts.max) {
    const avgAngle = 180 + (opts.avg / opts.max) * 180
    const inner = polarPoint(cx, cy, r - stroke * 0.9, avgAngle)
    const outer = polarPoint(cx, cy, r + stroke * 0.9, avgAngle)
    parts.push(
      `<line x1="${inner.x}" y1="${inner.y}" x2="${outer.x}" y2="${outer.y}" stroke="${COLOR_STRONG_TEXT}" stroke-width="2" stroke-linecap="round"/>`
    )
  }

  // Valor grande + escala.
  const valueStr = Number.isInteger(opts.value) ? String(opts.value) : opts.value.toFixed(1)
  parts.push(
    `<text x="${cx}" y="${round2(cy - r * 0.28)}" fill="${COLOR_STRONG_TEXT}" font-size="${round2(width * 0.2)}" font-weight="800" text-anchor="middle">${escapeSvgText(valueStr)}</text>`
  )
  parts.push(
    `<text x="${cx}" y="${round2(cy - r * 0.02)}" fill="${COLOR_AXIS_TEXT}" font-size="${round2(width * 0.062)}" text-anchor="middle">de ${escapeSvgText(String(opts.max))}</text>`
  )

  parts.push('</svg>')
  return parts.join('')
}

// ---------------------------------------------------------------------------
// lineChartSvg (evolución temporal: nivel / valor de mercado)
// ---------------------------------------------------------------------------

export interface LinePoint { label: string; value: number }

/**
 * Gráfico de línea simple para series temporales (evolución de nivel o de valor
 * de mercado). Eje X = puntos en orden; eje Y = valor con padding. Marca el
 * último punto. `formatValue` da el texto de los ticks del eje Y.
 */
export function lineChartSvg(opts: {
  points: LinePoint[]
  color?: string
  size?: number
  formatValue?: (v: number) => string
  showValues?: boolean
}): string {
  const points = opts.points
  const width = opts.size ?? 640
  const height = round2(width * 0.36)
  const color = opts.color ?? COLOR_GREEN
  const fmt = opts.formatValue ?? ((v: number) => formatTick(v))

  const marginLeft = 52
  const marginRight = 16
  const marginTop = 16
  const marginBottom = 34
  const plotW = width - marginLeft - marginRight
  const plotH = height - marginTop - marginBottom

  const parts: string[] = []
  parts.push(`<svg width="100%" viewBox="0 0 ${width} ${round2(height)}" xmlns="http://www.w3.org/2000/svg" role="img">`)

  if (points.length === 0) {
    parts.push('</svg>')
    return parts.join('')
  }

  const values = points.map(p => p.value)
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const pad = rawMax - rawMin > 0 ? (rawMax - rawMin) * 0.12 : Math.max(Math.abs(rawMax) * 0.12, 1)
  const minY = rawMin - pad
  const maxY = rawMax + pad
  const spanY = maxY - minY || 1
  const n = points.length

  const toX = (i: number) => round2(marginLeft + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW))
  const toY = (v: number) => round2(marginTop + (1 - (v - minY) / spanY) * plotH)

  // Grid horizontal + ticks Y.
  const yTicks = niceTicks(minY, maxY, 4)
  yTicks.forEach(t => {
    const py = toY(t)
    parts.push(`<line x1="${marginLeft}" y1="${py}" x2="${round2(marginLeft + plotW)}" y2="${py}" stroke="${COLOR_GRID}" stroke-width="1"/>`)
    parts.push(`<text x="${marginLeft - 8}" y="${py}" fill="${COLOR_AXIS_TEXT}" font-size="11" text-anchor="end" dominant-baseline="middle">${escapeSvgText(fmt(t))}</text>`)
  })

  // Labels X (primero, medio, último) para no saturar.
  const xIdx = n <= 3 ? points.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1]
  xIdx.forEach(i => {
    parts.push(`<text x="${toX(i)}" y="${round2(marginTop + plotH + 20)}" fill="${COLOR_AXIS_TEXT}" font-size="11" text-anchor="middle">${escapeSvgText(points[i].label)}</text>`)
  })

  // Área bajo la línea (relleno tenue).
  const linePts = points.map((p, i) => `${toX(i)},${toY(p.value)}`)
  const areaPath = `M ${toX(0)},${round2(marginTop + plotH)} L ${linePts.join(' L ')} L ${toX(n - 1)},${round2(marginTop + plotH)} Z`
  parts.push(`<path d="${areaPath}" fill="${color}" fill-opacity="0.10"/>`)
  // Línea.
  parts.push(`<polyline points="${linePts.join(' ')}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`)

  // Etiquetas de valor (opcional, adaptativo): con pocos puntos se rotula cada uno;
  // con muchos, solo los extremos (primero, último, máximo y mínimo) para no saturar.
  if (opts.showValues) {
    const labelIdx = new Set<number>()
    if (n <= 8) {
      points.forEach((_, i) => labelIdx.add(i))
    } else {
      labelIdx.add(0)
      labelIdx.add(n - 1)
      labelIdx.add(values.indexOf(rawMax))
      labelIdx.add(values.indexOf(rawMin))
    }
    // Punto marcador en cada dato (más grande si está rotulado).
    points.forEach((p, i) => {
      parts.push(`<circle cx="${toX(i)}" cy="${toY(p.value)}" r="${labelIdx.has(i) ? 3.4 : 2.2}" fill="${color}"/>`)
    })
    labelIdx.forEach(i => {
      const px = toX(i)
      const py = toY(points[i].value)
      const above = py - marginTop > 15
      const ly = above ? round2(py - 8) : round2(py + 16)
      const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'
      parts.push(`<text x="${px}" y="${ly}" fill="${COLOR_STRONG_TEXT}" font-size="12" font-weight="700" text-anchor="${anchor}">${escapeSvgText(fmt(points[i].value))}</text>`)
    })
  }

  // Punto final resaltado.
  const last = points[n - 1]
  parts.push(`<circle cx="${toX(n - 1)}" cy="${toY(last.value)}" r="4.5" fill="${color}" stroke="${COLOR_BG}" stroke-width="2"/>`)

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
  xHigherIsBetter?: boolean
  yHigherIsBetter?: boolean
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

  // Lineas de referencia de la media + sombreado del cuadrante "mejores".
  if (kept.length > 0) {
    const meanX = kept.reduce((sum, p) => sum + p.x, 0) / kept.length
    const meanY = kept.reduce((sum, p) => sum + p.y, 0) / kept.length
    const meanPx = toPx({ x: meanX, y: minY }).x
    const meanPy = toPx({ x: minX, y: meanY }).y

    // El cuadrante "mejores" depende de la direccion de cada metrica: si "mas es
    // mejor" en X va a la derecha (si no, a la izquierda); idem Y arriba/abajo.
    const xHib = opts.xHigherIsBetter ?? true
    const yHib = opts.yHigherIsBetter ?? true
    const rectX = xHib ? meanPx : round2(marginLeft)
    const rectW = xHib ? round2(marginLeft + plotW - meanPx) : round2(meanPx - marginLeft)
    const rectY = yHib ? round2(marginTop) : meanPy
    const rectH = yHib ? round2(meanPy - marginTop) : round2(marginTop + plotH - meanPy)
    parts.push(
      `<rect x="${rectX}" y="${rectY}" width="${rectW}" height="${rectH}" fill="${COLOR_GREEN}" fill-opacity="0.07"/>`
    )
    // Etiqueta "Mejores" con flecha diagonal hacia la esquina buena.
    const arrow = xHib ? (yHib ? '↗' : '↘') : (yHib ? '↖' : '↙')
    const labelX = xHib ? round2(marginLeft + plotW - 6) : round2(marginLeft + 6)
    const labelAnchor = xHib ? 'end' : 'start'
    const labelY = yHib ? round2(marginTop + 13) : round2(marginTop + plotH - 7)
    parts.push(
      `<text x="${labelX}" y="${labelY}" fill="${COLOR_GREEN}" font-size="11" font-weight="700" text-anchor="${labelAnchor}">Mejores ${arrow}</text>`
    )

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
