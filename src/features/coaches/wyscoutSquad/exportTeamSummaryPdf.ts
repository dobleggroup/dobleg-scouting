// src/features/coaches/wyscoutSquad/exportTeamSummaryPdf.ts
// PDF del Resumen del equipo dibujado con jsPDF (texto y graficos vectoriales, no una
// captura): A4 vertical, un bloque por widget elegido, ningun bloque partido entre dos
// hojas (planPages). La tabla completa de jugadores va al final en hojas apaisadas.
import type { jsPDF as JsPdf } from 'jspdf'
import type { StandingRow } from '@/services/footballApiService'
import type { AgencyFixture } from '@/types/footballApi'
import type { SeasonStats } from '@/features/coaches/seasonStats'
import { matchOutcome } from '@/features/coaches/matchResult'
import { planPages } from './pdfLayout'
import { metricValue, rankBy, squadProfile } from './squadMetrics'
import { FULL_TABLE_COLUMNS, RANKING_WIDGETS, formatMetric, type RankingWidgetDef } from './widgetDefs'
import type { WyscoutSquadData } from './wyscoutSquadTypes'

const C = {
  ink: '#1D1D1F', text: '#3A3A3C', muted: '#6E6E73', faint: '#A1A1A6', line: '#E5E5EA',
  tile: '#F5F5F7', green: '#15803D', greenBar: '#22C55E', greenTint: '#EDF7F0',
  red: '#DC2626', redTint: '#FDECEC', grayChip: '#D2D2D7', white: '#FFFFFF',
}
const M = 36
const HEADER_BOTTOM = 70
const FOOTER_TOP = 40 // desde abajo
const GAP = 18
const LOCALE = 'es-AR'

/** La fuente estandar de jsPDF es Latin-1: los signos que no entran se reemplazan. */
function clean(s: string): string {
  return s.replace(/[−–—]/g, '-').replace(/…/g, '...').replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
}

const longDate = (iso: string) =>
  new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' })
const dmy = (iso: string) =>
  new Date(iso).toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit' })

export interface TeamSummaryPdfInput {
  coachName: string
  club: string
  season: number
  leagueName: string | null
  today: string
  dataDate: string | null
  minMinutes: number
  teamId: number
  standings: StandingRow[] | null
  next: AgencyFixture | null
  last: AgencyFixture[]
  upcoming: AgencyFixture[]
  seasonStats: SeasonStats | null
  squad: WyscoutSquadData | null
  teamMatches: number
  widgetIds: string[]
  logoDataUrl?: string
  crestDataUrl?: string
}

class Doc {
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

  newPage(orientation: 'portrait' | 'landscape' = 'portrait') {
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

/* ------------------------------------------------------------ bloques */

interface Block { h: number; draw: (d: Doc, y: number) => void }

const TITLE_H = 22

function blockTitle(d: Doc, y: number, title: string, description?: string): number {
  d.text(title, M, y + 13, { size: 12.5, bold: true })
  let h = TITLE_H
  if (description) {
    const lines = d.wrap(description, d.CW, 8.2)
    lines.forEach((l, i) => d.text(l, M, y + h + 6 + i * 11, { size: 8.2, color: C.muted }))
    h += lines.length * 11 + 6
  }
  return h
}

function descHeight(d: Doc, description?: string) {
  return TITLE_H + (description ? d.wrap(description, d.CW, 8.2).length * 11 + 6 : 0)
}

interface Col { title: string; w: number; align?: 'left' | 'right' | 'center' }

const ROW_H = 18
const HEAD_H = 18

function drawHead(d: Doc, cols: Col[], y: number, x0 = M) {
  const total = cols.reduce((s, c) => s + c.w, 0)
  d.rect(x0, y, total, HEAD_H, C.tile, 3)
  let x = x0
  for (const c of cols) {
    const tx = c.align === 'right' ? x + c.w - 6 : c.align === 'center' ? x + c.w / 2 : x + 6
    d.text(c.title.toUpperCase(), tx, y + 12, { size: 6.4, bold: true, color: C.muted, align: c.align ?? 'left' })
    x += c.w
  }
}

function drawCells(d: Doc, cols: Col[], cells: string[], y: number, o: { bold?: number[]; x0?: number; size?: number; colors?: (string | undefined)[] } = {}) {
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

function rankingBlock(d: Doc, def: RankingWidgetDef, input: TeamSummaryPdfInput): Block | null {
  const squad = input.squad!
  if (!def.requires.every(k => squad.columnsFound.includes(k))) return null
  const [primary, ...rest] = def.columns
  const rows = rankBy(squad.players, primary.key, { teamMatches: input.teamMatches, minMinutes: input.minMinutes, perMinuteMetric: primary.perMinute, limit: 10 })
  const byName = new Map(squad.players.map(p => [p.name, p]))
  const top = descHeight(d, def.description) + 4
  const h = top + HEAD_H + Math.max(rows.length, 1) * ROW_H
  return {
    h,
    draw: (d, y) => {
      blockTitle(d, y, def.title, def.description)
      const barW = 110
      const otherW = 74
      const cols: Col[] = [
        { title: '#', w: 22, align: 'center' },
        { title: 'Jugador', w: d.CW - 22 - barW - 60 - otherW * rest.length },
        { title: '', w: barW },
        { title: primary.label, w: 60, align: 'right' },
        ...rest.map(c => ({ title: c.label, w: otherW, align: 'right' as const })),
      ]
      let yy = y + top
      drawHead(d, cols, yy)
      yy += HEAD_H
      if (rows.length === 0) {
        d.text('Ningún jugador llega al mínimo de minutos elegido.', M + 6, yy + 12, { size: 8.4, color: C.muted })
        return
      }
      const max = Math.max(...rows.map(r => Math.abs(r.value)), 0)
      rows.forEach((r, i) => {
        const p = byName.get(r.name)!
        const underMin = (p.stats.minutes ?? 0) < input.minMinutes
        drawCells(d, cols, [
          String(i + 1), r.name, '',
          formatMetric(r.value, primary.format),
          ...rest.map(c => (c.perMinute && underMin ? '—' : formatMetric(metricValue(p, c.key, input.teamMatches), c.format))),
        ], yy, { bold: [1, 3] })
        const bx = M + cols[0].w + cols[1].w + 4
        d.rect(bx, yy + 6, barW - 8, 6, C.tile, 3)
        if (max > 0) d.rect(bx, yy + 6, Math.max(2, ((barW - 8) * Math.abs(r.value)) / max), 6, r.value < 0 ? C.red : C.greenBar, 3)
        yy += ROW_H
        d.line(M, yy, M + d.CW, yy, C.line, 0.4)
      })
    },
  }
}

function standingsBlock(d: Doc, input: TeamSummaryPdfInput): Block | null {
  const rows = input.standings
  if (!rows?.length) return null
  const desc = `Zona de ${input.club}.`
  const top = descHeight(d, desc) + 4
  return {
    h: top + HEAD_H + rows.length * 16,
    draw: (d, y) => {
      blockTitle(d, y, 'Tabla de posiciones', desc)
      const n = 36
      const cols: Col[] = [
        { title: 'Pos', w: 32, align: 'center' }, { title: 'Equipo', w: d.CW - 32 - n * 8 },
        { title: 'PJ', w: n, align: 'right' }, { title: 'G', w: n, align: 'right' }, { title: 'E', w: n, align: 'right' },
        { title: 'P', w: n, align: 'right' }, { title: 'GF', w: n, align: 'right' }, { title: 'GC', w: n, align: 'right' },
        { title: 'DG', w: n, align: 'right' }, { title: 'Pts', w: n, align: 'right' },
      ]
      let yy = y + top
      drawHead(d, cols, yy)
      yy += HEAD_H
      for (const r of rows) {
        const mine = r.teamId === input.teamId
        if (mine) d.rect(M, yy + 1, d.CW, 14, C.greenTint, 3)
        drawCells(d, cols, [
          String(r.rank), r.teamName, String(r.played), String(r.win), String(r.draw), String(r.lose),
          String(r.goalsFor), String(r.goalsAgainst), r.goalsDiff > 0 ? `+${r.goalsDiff}` : String(r.goalsDiff), String(r.points),
        ], yy - 2, { bold: mine ? [0, 1, 9] : [9], size: 8 })
        yy += 16
      }
    },
  }
}

function resultChip(d: Doc, x: number, y: number, label: string, result: string | null) {
  const [bg, fg] = result === 'G' ? [C.greenBar, C.ink] : result === 'P' ? [C.red, C.white] : [C.grayChip, C.ink]
  const w = d.width(label, 8, true) + 12
  d.rect(x - w, y + 3, w, 13, bg, 3)
  d.text(label, x - w / 2, y + 12.5, { size: 8, bold: true, color: fg, align: 'center' })
}

function fixturesBlock(d: Doc, title: string, description: string, fixtures: AgencyFixture[], played: boolean): Block {
  const top = descHeight(d, description) + 4
  return {
    h: top + HEAD_H + Math.max(fixtures.length, 1) * ROW_H,
    draw: (d, y) => {
      blockTitle(d, y, title, description)
      const cols: Col[] = [
        { title: 'Fecha', w: 52 }, { title: 'Rival', w: d.CW - 52 - 70 - 170 - 70 },
        { title: 'Condición', w: 70 }, { title: 'Competencia', w: 170 },
        { title: played ? 'Resultado' : '', w: 70, align: 'right' },
      ]
      let yy = y + top
      drawHead(d, cols, yy)
      yy += HEAD_H
      if (!fixtures.length) {
        d.text(played ? 'Todavía no hay partidos jugados.' : 'No hay partidos programados.', M + 6, yy + 12, { size: 8.4, color: C.muted })
        return
      }
      for (const f of fixtures) {
        const r = f.isHome ? f.awayTeam : f.homeTeam
        drawCells(d, cols, [dmy(f.date), r.name, f.isHome ? 'Local' : 'Visitante', f.leagueName, ''], yy, { bold: [1] })
        if (played) {
          const { result, scoreLabel } = matchOutcome(f)
          resultChip(d, M + d.CW - 6, yy, scoreLabel, result)
        }
        yy += ROW_H
        d.line(M, yy, M + d.CW, yy, C.line, 0.4)
      }
    },
  }
}

function tiles(d: Doc, y: number, items: [string, string][]) {
  const gap = 8
  const w = (d.CW - gap * (items.length - 1)) / items.length
  items.forEach(([value, label], i) => {
    const x = M + i * (w + gap)
    d.rect(x, y, w, 48, C.tile, 6)
    d.text(value, x + w / 2, y + 23, { size: 15, bold: true, align: 'center' })
    d.text(label.toUpperCase(), x + w / 2, y + 38, { size: 6.4, bold: true, color: C.muted, align: 'center' })
  })
}

function seasonBlock(d: Doc, input: TeamSummaryPdfInput): Block | null {
  const s = input.seasonStats
  if (!s || s.played === 0) return null
  const dec = (v: number | null, suffix = '') => (v === null ? '—' : `${v.toLocaleString(LOCALE, { maximumFractionDigits: 1 })}${suffix}`)
  const xg = (v: number | null) => (v === null ? '—' : v.toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
  return {
    h: TITLE_H + 6 + 48 + 8 + 48,
    draw: (d, y) => {
      blockTitle(d, y, `La temporada con ${input.coachName}`)
      tiles(d, y + TITLE_H + 6, [
        [String(s.played), 'Partidos'], [`${s.won}-${s.drawn}-${s.lost}`, 'Ganados-Empat.-Perd.'],
        [`${s.points}/${s.possiblePoints}`, 'Puntos'], [`${s.goalsFor}-${s.goalsAgainst}`, 'Goles a favor-en contra'],
      ])
      tiles(d, y + TITLE_H + 6 + 56, [
        [dec(s.avgPossession, '%'), 'Posesión promedio'], [xg(s.avgXgFor), 'xG a favor (prom.)'], [xg(s.avgXgAgainst), 'xG en contra (prom.)'],
      ])
    },
  }
}

function nextBlock(d: Doc, input: TeamSummaryPdfInput): Block | null {
  const f = input.next
  if (!f) return null
  return {
    h: TITLE_H + 50,
    draw: (d, y) => {
      blockTitle(d, y, 'Próximo partido')
      d.rect(M, y + TITLE_H + 4, d.CW, 42, C.greenTint, 6)
      d.text(`${f.homeTeam.name}  vs  ${f.awayTeam.name}`, M + 12, y + TITLE_H + 21, { size: 11, bold: true })
      const when = new Date(f.date).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
      d.text([when, f.venue, f.leagueName].filter(Boolean).join('  ·  '), M + 12, y + TITLE_H + 36, { size: 8.4, color: C.muted })
    },
  }
}

function profileBlock(d: Doc, input: TeamSummaryPdfInput): Block | null {
  const players = input.squad!.players
  const prof = squadProfile(players)
  const fmt = (v: number | null, unit: string) => (v === null ? '—' : `${v.toLocaleString(LOCALE, { maximumFractionDigits: 1 })}${unit}`)
  const footLine = Object.entries(prof.foot).sort((a, b) => b[1] - a[1])
    .map(([f, n]) => `${n} ${({ derecho: 'derechos', izquierdo: 'zurdos', ambos: 'ambidiestros' } as Record<string, string>)[f] ?? f}`).join('  ·  ')
  const dual = prof.dualPassport.map(p => `${p.name} (${p.passports.join(', ')})`).join('  ·  ')
  const dualLines = dual ? d.wrap(`Con doble pasaporte: ${dual}`, d.CW, 8.4) : []
  return {
    h: TITLE_H + 6 + 48 + 20 + dualLines.length * 12,
    draw: (d, y) => {
      blockTitle(d, y, 'Perfil del plantel')
      tiles(d, y + TITLE_H + 6, [
        [String(players.length), 'Jugadores'], [fmt(prof.avgAge, ' años'), 'Edad promedio'],
        [fmt(prof.avgHeight, ' cm'), 'Altura promedio'], [String(prof.dualPassport.length), 'Doble pasaporte'],
      ])
      let yy = y + TITLE_H + 6 + 48 + 16
      if (footLine) { d.text(`Pie hábil: ${footLine}`, M, yy, { size: 8.4, color: C.text }); yy += 12 }
      dualLines.forEach((l, i) => d.text(l, M, yy + i * 12, { size: 8.4, color: C.text }))
    },
  }
}

/* ------------------------------------------------------------ tabla completa (apaisada) */

const ROW_FULL = 13

function drawFullTable(d: Doc, input: TeamSummaryPdfInput) {
  const squad = input.squad!
  d.newPage('landscape')
  let y = HEADER_BOTTOM
  y += blockTitle(d, y, 'Todos los jugadores', `Ordenados por minutos. Los valores cada 90 minutos de quienes jugaron menos de ${input.minMinutes} minutos aparecen en gris.`) + 4
  const nameW = 120
  const colW = (d.CW - nameW) / FULL_TABLE_COLUMNS.length
  const cols: Col[] = [{ title: 'Jugador', w: nameW }, ...FULL_TABLE_COLUMNS.map(c => ({ title: c.label, w: colW, align: 'right' as const }))]
  const head = () => {
    d.rect(M, y, d.CW, 30, C.tile, 3)
    let x = M
    cols.forEach((c, i) => {
      const lines = d.wrap(c.title.toUpperCase(), c.w - 6, 5.6)
      lines.slice(0, 3).forEach((l, k) => d.text(l, i === 0 ? x + 6 : x + c.w - 3, y + 9 + k * 7, { size: 5.6, bold: true, color: C.muted, align: i === 0 ? 'left' : 'right' }))
      x += c.w
    })
    y += 30
  }
  head()
  const players = [...squad.players].sort((a, b) => (b.stats.minutes ?? 0) - (a.stats.minutes ?? 0))
  for (const p of players) {
    if (y + ROW_FULL > d.H - FOOTER_TOP - 6) { d.newPage('landscape'); y = HEADER_BOTTOM; head() }
    const underMin = (p.stats.minutes ?? 0) < input.minMinutes
    let x = M
    d.text(d.fit(p.name, nameW - 10, 7.4, true), x + 6, y + 9.5, { size: 7.4, bold: true })
    x += nameW
    FULL_TABLE_COLUMNS.forEach(c => {
      const v = formatMetric(metricValue(p, c.key, input.teamMatches), c.format)
      d.text(v, x + colW - 3, y + 9.5, { size: 7.2, color: c.perMinute && underMin ? C.faint : C.text, align: 'right' })
      x += colW
    })
    y += ROW_FULL
    d.line(M, y, M + d.CW, y, C.line, 0.4)
  }
}

/* ------------------------------------------------------------ portada */

function coverHeight() { return 118 }

function drawCover(d: Doc, input: TeamSummaryPdfInput, y: number) {
  const crest = input.crestDataUrl
  let x = M
  if (crest) {
    try {
      d.pdf.addImage(crest, 'PNG', M, y + 4, 56, 56)
      x = M + 70
    } catch { /* sin escudo */ }
  }
  d.text(`${input.club} ${input.season}`, x, y + 30, { size: 26, bold: true })
  d.text([`DT ${input.coachName}`, input.leagueName].filter(Boolean).join('  ·  '), x, y + 50, { size: 11, color: C.muted })
  const chips = [
    `Informe del ${longDate(input.today)}`,
    input.dataDate ? `Datos de Wyscout del ${longDate(input.dataDate)}` : 'Sin datos de Wyscout cargados',
    `Mínimo de minutos para rankings: ${input.minMinutes}`,
  ]
  let cx = M
  for (const c of chips) {
    const w = d.width(c, 7.8, true) + 16
    d.rect(cx, y + 76, w, 18, C.tile, 9)
    d.text(c, cx + 8, y + 88, { size: 7.8, bold: true, color: C.text })
    cx += w + 6
  }
  d.line(M, y + coverHeight() - 8, M + d.CW, y + coverHeight() - 8)
}

/* ------------------------------------------------------------ entrada */

function sectionBlock(title: string): Block {
  return {
    h: 26,
    draw: (d, y) => {
      d.text(title.toUpperCase(), M, y + 16, { size: 8, bold: true, color: C.green })
      d.line(M + d.width(title.toUpperCase(), 8, true) + 8, y + 13, M + d.CW, y + 13, C.line, 0.6)
    },
  }
}

export async function buildTeamSummaryPdf(input: TeamSummaryPdfInput): Promise<JsPdf> {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true })
  pdf.setProperties({
    title: `${input.club} ${input.season} - ${input.coachName}`,
    author: 'Doble G Sports Group',
    creator: 'Doble G Sports Group',
  })
  let logo: { url: string; w: number; h: number } | undefined
  if (input.logoDataUrl) {
    try {
      const p = pdf.getImageProperties(input.logoDataUrl)
      if (p.width > 0 && p.height > 0) logo = { url: input.logoDataUrl, h: 24, w: 24 * (p.width / p.height) }
    } catch { logo = undefined }
  }
  const d = new Doc(pdf, `${input.club} ${input.season} · DT ${input.coachName}`, logo)
  const want = new Set(input.widgetIds)

  // Bloques en el orden de la pagina; los titulos de seccion van pegados al primer bloque.
  const groups: { title: string; blocks: (Block | null)[] }[] = [
    {
      title: 'Datos del equipo',
      blocks: [want.has('temporada') ? seasonBlock(d, input) : null],
    },
    {
      title: 'Tabla y partidos',
      blocks: [
        want.has('proximo') ? nextBlock(d, input) : null,
        want.has('tabla') ? standingsBlock(d, input) : null,
        want.has('ultimos') ? fixturesBlock(d, 'Últimos partidos', 'Los 5 más recientes, en todas las competencias.', input.last, true) : null,
        want.has('proximos') ? fixturesBlock(d, 'Próximos partidos', 'Los 5 que vienen.', input.upcoming, false) : null,
      ],
    },
    {
      title: 'Los jugadores (datos de Wyscout)',
      blocks: input.squad ? [
        ...RANKING_WIDGETS.filter(w => want.has(w.id)).map(w => rankingBlock(d, w, input)),
        want.has('perfil') ? profileBlock(d, input) : null,
      ] : [],
    },
  ]

  const blocks: Block[] = []
  for (const g of groups) {
    const list = g.blocks.filter((b): b is Block => b !== null)
    if (!list.length) continue
    const head = sectionBlock(g.title)
    // El titulo de seccion y su primer bloque se miden juntos para que nunca queden separados.
    blocks.push({ h: head.h + list[0].h, draw: (d, y) => { head.draw(d, y); list[0].draw(d, y + head.h) } }, ...list.slice(1))
  }

  // Primera hoja: portada arriba y despues los bloques.
  d.header()
  const coverH = coverHeight()
  drawCover(d, input, HEADER_BOTTOM - 10)
  const firstPageRoom = d.contentH - coverH
  let startIdx = 0
  let y = HEADER_BOTTOM - 10 + coverH
  while (startIdx < blocks.length && (y - (HEADER_BOTTOM - 10 + coverH)) + blocks[startIdx].h <= firstPageRoom) {
    blocks[startIdx].draw(d, y)
    y += blocks[startIdx].h + GAP
    startIdx++
  }
  const rest = blocks.slice(startIdx)
  for (const page of planPages(rest.map(b => b.h), d.contentH, GAP)) {
    d.newPage()
    let py = HEADER_BOTTOM
    for (const i of page) {
      rest[i].draw(d, py)
      py += rest[i].h + GAP
    }
  }

  if (input.squad && want.has('tablaCompleta')) drawFullTable(d, input)

  const total = pdf.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i)
    const H = pdf.internal.pageSize.getHeight()
    const W = pdf.internal.pageSize.getWidth()
    d.line(M, H - 30, W - M, H - 30)
    d.text('Doble G Sports Group  ·  Fuentes: API-Football, Wyscout', M, H - 18, { size: 7, color: C.faint })
    d.text(`Página ${i} de ${total}`, W - M, H - 18, { size: 7, color: C.faint, align: 'right' })
  }
  return pdf
}

export async function loadImageDataUrl(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) return undefined
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.onerror = reject
      r.readAsDataURL(blob)
    })
  } catch {
    return undefined
  }
}

export function teamSummaryFileName(club: string, season: number, today: string): string {
  const slug = club.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `resumen_${slug}-${season}_${today}.pdf`
}

export async function exportTeamSummaryPdf(input: TeamSummaryPdfInput): Promise<void> {
  const pdf = await buildTeamSummaryPdf(input)
  pdf.save(teamSummaryFileName(input.club, input.season, input.today))
}
