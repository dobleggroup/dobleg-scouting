import { parseNumber, stripAccents } from './normalize'
import type { PdfCell, PdfRow, PdfTable } from '../types'

/**
 * Informe individual "de temporada" (Universidad Católica, Departamento de
 * Fisiología): tarjetas con el promedio y el ÚLTIMO PARTIDO, y debajo un gráfico
 * de barras por métrica con un valor por partido ("UC 1 vs U 0", "HUA 2 vs 4 uc"...).
 *
 * El parser genérico confundía la etiqueta del partido con un jugador. Acá se lee:
 * - el último partido (la tarjeta), que es lo que se carga desde la pestaña Partido;
 * - la serie completa de cada gráfico, partido por partido, ubicando cada número
 *   bajo la etiqueta de su partido por la posición horizontal.
 */

/** "UC 1 vs U 0" · "HUA 2 vs 4 uc" · "UC 2 VS EVE 2" */
const MATCH_LABEL = /^(\S+(?:\s\S+)?)\s+(\d+)\s+vs\.?\s+(?:(\d+)\s+(\S+(?:\s\S+)?)|(\S+(?:\s\S+)?)\s+(\d+))$/i

export interface SeriesMatch {
  label: string
  /** Sigla del rival tal cual viene ("U", "CRU", "ÑUB"). */
  rivalCode: string
  /** Goles propios - goles del rival, desde el lado del equipo del informe. */
  resultado: string
  /** true si el equipo del informe figura primero (local). */
  home: boolean
}

export interface SeriesReport {
  playerName: string | null
  teamCode: string
  matches: SeriesMatch[]
  /** Nombre de serie (como figura en la leyenda) → un valor por partido. */
  series: { name: string; values: (number | null)[] }[]
  /** Tarjeta "ÚLTIMO PARTIDO": cabeceras y valores, en orden. */
  lastMatch: { label: string; headers: string[]; values: (number | null)[] } | null
  /** Texto de la portada (competencia, estadio, resultado). */
  coverLines: string[]
}

const norm = (s: string) => stripAccents(s).toLowerCase().replace(/\s+/g, ' ').trim()

interface ParsedLabel { a: string; ga: number; b: string; gb: number }

function parseLabel(text: string): ParsedLabel | null {
  const m = MATCH_LABEL.exec(text.trim())
  if (!m) return null
  return m[3] !== undefined
    ? { a: m[1], ga: Number(m[2]), b: m[4], gb: Number(m[3]) }
    : { a: m[1], ga: Number(m[2]), b: m[5], gb: Number(m[6]) }
}

const isAxisRow = (row: PdfRow) => row.cells.filter(c => parseLabel(c.text)).length >= 3

/** Número de barra: sin "%", sin "…" (ejes cortados) y que se pueda leer. */
function barNumber(cell: PdfCell): number | null {
  if (/[%…]/.test(cell.text)) return null
  return parseNumber(cell.text.replace(/\s/g, ''))
}

const hasDecimals = (text: string) => /\d[.,]\d{1,2}$/.test(text.trim()) && !/^\d{1,3}\.\d{3}$/.test(text.trim())

/** Leyenda de un gráfico: textos no numéricos; las series "%..." son la línea de % sobre el promedio. */
function legendSeries(row: PdfRow): string[] {
  return row.cells
    .map(c => c.text.trim())
    .filter(t => t && parseNumber(t) === null && !t.startsWith('%') && !/[…]/.test(t))
}

/**
 * Detecta y lee el informe. `null` si el PDF no tiene esta forma (al menos un
 * gráfico con etiquetas de partido debajo).
 */
export function readSeriesReport(rows: PdfRow[]): SeriesReport | null {
  // Bloques de eje: filas consecutivas de etiquetas (vienen escalonadas en dos filas).
  const axisBlocks: number[][] = []
  rows.forEach((row, i) => {
    if (!isAxisRow(row)) return
    const last = axisBlocks[axisBlocks.length - 1]
    if (last && last[last.length - 1] === i - 1 && rows[i - 1].page === row.page) last.push(i)
    else axisBlocks.push([i])
  })
  if (axisBlocks.length === 0) return null

  // Partidos, de izquierda a derecha, con el centro de cada etiqueta.
  const labelCells = axisBlocks[0].flatMap(i => rows[i].cells.filter(c => parseLabel(c.text)))
    .sort((a, b) => a.center - b.center)
  if (labelCells.length < 3) return null
  const centers = labelCells.map(c => c.center)
  const gaps = centers.slice(1).map((c, i) => c - centers[i]).sort((a, b) => a - b)
  const spacing = gaps[Math.floor(gaps.length / 2)]

  // El equipo del informe es la sigla que aparece en (casi) todas las etiquetas.
  const parsed = labelCells.map(c => parseLabel(c.text)!)
  const count = new Map<string, number>()
  for (const p of parsed) for (const s of new Set([norm(p.a), norm(p.b)])) count.set(s, (count.get(s) ?? 0) + 1)
  const teamCode = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0]
  const matches: SeriesMatch[] = labelCells.map((c, i) => {
    const p = parsed[i]
    const home = norm(p.a) === teamCode
    return {
      label: c.text.trim(),
      rivalCode: home ? p.b : p.a,
      resultado: home ? `${p.ga}-${p.gb}` : `${p.gb}-${p.ga}`,
      home,
    }
  })

  const lastIdx = rows.findIndex(r => r.cells.some(c => /^ultimo partido$/.test(norm(c.text))))

  // Cada gráfico: desde su leyenda hasta su bloque de eje. El primero arranca después
  // de las tarjetas (promedio y último partido), que no son parte de ningún gráfico.
  const series: SeriesReport['series'] = []
  let regionStart = lastIdx >= 0 && lastIdx + 3 <= axisBlocks[0][0] ? lastIdx + 3 : 0
  for (const block of axisBlocks) {
    const region = rows.slice(regionStart, block[0]).filter(r => r.page === rows[block[0]].page)
    regionStart = block[block.length - 1] + 1
    const legendIdx = region.findIndex(r =>
      legendSeries(r).length > 0
      && r.cells.every(c => barNumber(c) === null && !/^\s*:/.test(c.text) && !/jugador/i.test(c.text)))
    if (legendIdx < 0) continue
    const names = legendSeries(region[legendIdx])
    if (names.length === 0 || names.length > 2) continue

    // Candidatos por partido: número a menos de media separación del centro de la etiqueta.
    const perMatch: PdfCell[][] = centers.map(() => [])
    for (const row of region.slice(legendIdx + 1)) {
      for (const cell of row.cells) {
        if (barNumber(cell) === null) continue
        let best = -1
        let bestDist = Infinity
        centers.forEach((center, i) => {
          const d = Math.abs(center - cell.center)
          if (d < bestDist) { bestDist = d; best = i }
        })
        if (best >= 0 && bestDist <= spacing * 0.5) perMatch[best].push(cell)
      }
    }

    if (names.length === 1) {
      series.push({ name: names[0], values: perMatch.map(cells => (cells.length === 1 ? barNumber(cells[0]) : null)) })
      continue
    }

    // Dos series: si una es con decimales (velocidad) y la otra entera (cantidad), se
    // separan por formato; si no, por lado: barra izquierda = primera de la leyenda.
    const all = perMatch.flat()
    const decimalShare = all.filter(c => hasDecimals(c.text)).length / Math.max(1, all.length)
    const byFormat = decimalShare > 0.25 && decimalShare < 0.75
    const decimalFirst = byFormat && /vel|max|km\/h/i.test(names[0])
    const first: (number | null)[] = []
    const second: (number | null)[] = []
    perMatch.forEach((cells, i) => {
      let a: PdfCell | undefined
      let b: PdfCell | undefined
      if (byFormat) {
        const dec = cells.find(c => hasDecimals(c.text))
        const int = cells.find(c => !hasDecimals(c.text))
        ;[a, b] = decimalFirst ? [dec, int] : [int, dec]
      } else {
        a = cells.filter(c => c.center < centers[i]).sort((x, y) => y.center - x.center)[0]
        b = cells.filter(c => c.center >= centers[i]).sort((x, y) => x.center - y.center)[0]
      }
      first.push(a ? barNumber(a) : null)
      second.push(b ? barNumber(b) : null)
    })
    series.push({ name: names[0], values: first }, { name: names[1], values: second })
  }
  if (series.length === 0) return null

  // Tarjeta "ÚLTIMO PARTIDO": fila de títulos y, debajo, la etiqueta del partido con sus valores.
  let lastMatch: SeriesReport['lastMatch'] = null
  if (lastIdx >= 0 && rows[lastIdx + 2]) {
    const headerRow = rows[lastIdx + 1]
    const valueRow = rows[lastIdx + 2]
    const label = valueRow.cells.find(c => parseLabel(c.text))
    if (label) {
      const headers = headerRow.cells.map(c => c.text.trim())
      const values = headerRow.cells.map(h => {
        const v = valueRow.cells
          .filter(c => c !== label)
          .sort((x, y) => Math.abs(x.center - h.center) - Math.abs(y.center - h.center))[0]
        return v ? parseNumber(v.text) : null
      })
      lastMatch = { label: label.text.trim(), headers, values }
    }
  }

  const playerLine = rows.flatMap(r => r.cells.map(c => c.text)).find(t => /^\s*:\s*\S/.test(t))
  const playerName = playerLine
    ? playerLine.replace(/^\s*:\s*/, '').trim().toLowerCase().replace(/(^|\s)\S/g, s => s.toUpperCase())
    : null
  const firstChart = Math.min(axisBlocks[0][0], lastIdx >= 0 ? lastIdx : Infinity)
  const coverLines = rows.slice(0, firstChart).filter(r => r.page === rows[0].page).map(r => r.cells.map(c => c.text).join(' ').trim()).filter(Boolean)

  return { playerName, teamCode, matches, series, lastMatch, coverLines }
}

/** Clave para saber si una serie del gráfico es la misma métrica que una tarjeta. */
function metricSignature(name: string): string {
  return norm(name)
    .replace(/\bdist\.?\b|hasta|km\/h|\(m\)|\(count\)/g, '')
    .replace(/[^a-z0-9,>]/g, '')
}

/** Siglas de rivales vistas en estos informes → nombre completo para el campo Rival. */
const RIVAL_CODES: Record<string, string> = {
  u: 'Universidad de Chile', udc: 'Universidad de Concepción', dco: 'Deportes Concepción', dc: 'Deportes Concepción',
  hua: 'Huachipato', lsr: 'Deportes La Serena', ls: 'Deportes La Serena', cbs: 'Cobresal', coq: 'Coquimbo Unido',
  ohi: "O'Higgins", eve: 'Everton', aud: 'Audax Italiano', ulc: 'Unión La Calera', nub: 'Ñublense',
  cop: 'Deportes Copiapó', sl: 'San Luis', cc: 'Colo-Colo', col: 'Colo-Colo', pal: 'Palestino', lim: 'Deportes Limache',
  boc: 'Boca Juniors', bj: 'Boca Juniors', cru: 'Cruzeiro', bsc: 'Barcelona SC', est: 'Estudiantes de La Plata',
}

export function rivalName(code: string): string {
  return RIVAL_CODES[norm(code).replace(/ñ/g, 'n')] ?? code
}

/**
 * Tabla de una fila para la carga de un partido: la tarjeta del último partido más
 * las series del gráfico que la tarjeta no trae (velocidad máxima, sprints), tomadas
 * del último partido de la serie. El rival y el resultado van como líneas de contexto.
 */
export function buildSeriesReportTable(rows: PdfRow[], presetPlayerName?: string): PdfTable | null {
  const report = readSeriesReport(rows)
  if (!report?.lastMatch) return null
  const { lastMatch } = report
  const last = report.matches.length - 1
  const lastFromSeries = report.matches[last]?.label === lastMatch.label

  const headers = [...lastMatch.headers]
  const values = [...lastMatch.values]
  const covered = new Set(headers.map(metricSignature))
  if (lastFromSeries) {
    for (const s of report.series) {
      if (covered.has(metricSignature(s.name))) continue
      headers.push(s.name)
      values.push(s.values[last])
    }
  }

  const match = report.matches.find(m => m.label === lastMatch.label) ?? report.matches[last]
  const name = presetPlayerName || report.playerName
  if (!name) return null
  return {
    headers: ['', ...headers],
    rows: [{ name, values: [null, ...values] }],
    preambleLines: [
      ...report.coverLines,
      `vs ${rivalName(match.rivalCode)}`,
      `Resultado: ${match.resultado}`,
    ],
  }
}
