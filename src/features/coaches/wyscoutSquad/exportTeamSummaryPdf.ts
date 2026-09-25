// src/features/coaches/wyscoutSquad/exportTeamSummaryPdf.ts
// PDF del Resumen del equipo dibujado con jsPDF (texto y graficos vectoriales, no una
// captura): A4 apaisado (igual que las hojas de surgidos del club), un bloque por widget elegido, ningun bloque partido entre dos
// hojas (planPages). La tabla completa de jugadores va al final en hojas apaisadas.
import type { jsPDF as JsPdf } from 'jspdf'
import type { StandingRow } from '@/services/footballApiService'
import type { AgencyFixture } from '@/types/footballApi'
import type { SeasonStats } from '@/features/coaches/seasonStats'
import { matchOutcome } from '@/features/coaches/matchResult'
import { planPages } from './pdfLayout'
import { C, M, HEADER_BOTTOM, FOOTER_TOP, GAP, LOCALE, Doc, TITLE_H, ROW_H, HEAD_H, blockTitle, descHeight, drawHead, drawCells, tiles, pairColumns, type Block, type Col, type ColumnBlock } from './pdfDoc'
import { metricValue, rankBy } from './squadMetrics'
import { FULL_TABLE_COLUMNS, RANKING_WIDGETS, formatMetric, type RankingWidgetDef } from './widgetDefs'
import type { WyscoutSquadData } from './wyscoutSquadTypes'
import type { EnrichedMatchRow } from '@/features/coaches/components/CoachMatchMetricsEvolution'
import type { WyscoutReportData } from '@/features/coaches/wyscoutReport/wyscoutReportTypes'
import type { HomegrownReport } from '@/features/coaches/homegrown/homegrownReport'
import { appendHomegrownPages } from '@/features/coaches/homegrown/exportHomegrownPdf'
import { scatterBlock } from './scatterPdf'
import { SCATTER_DEFS } from './scatterPlots'
import { efficiencyBlock, evolutionBlock, formationsBlock, historyBlocks, vsRivalBlock, zonesBlock } from './teamChartsPdf'

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
  /** Partidos con estadisticas del equipo (archivo Team Stats), en orden cronologico. */
  matchRows: EnrichedMatchRow[]
  /** Ultimo informe PDF de Wyscout cargado (formaciones y zonas). */
  wyscoutReport: WyscoutReportData | null
  /** Informe de "surgidos del club" (solo si se eligio). */
  homegrown: HomegrownReport | null
  logoDataUrl?: string
  crestDataUrl?: string
}

/* ------------------------------------------------------------ bloques */

function rankingBlock(def: RankingWidgetDef, input: TeamSummaryPdfInput, d: Doc, w: number): ColumnBlock | null {
  const squad = input.squad!
  if (!def.requires.every(k => squad.columnsFound.includes(k))) return null
  const [primary, ...rest] = def.columns
  const rows = rankBy(squad.players, primary.key, { teamMatches: input.teamMatches, minMinutes: input.minMinutes, perMinuteMetric: primary.perMinute, limit: 8, minAttempts: def.minAttempts })
  const description = def.minAttempts
    ? `${def.description} Entra quien jugó al menos ${input.minMinutes} minutos y tuvo al menos ${def.minAttempts.min} ${def.minAttempts.label}.`
    : def.description
  const byName = new Map(squad.players.map(p => [p.name, p]))
  const top = descHeight(d, description, w) + 4
  return {
    h: top + HEAD_H + Math.max(rows.length, 1) * ROW_H,
    top,
    draw: (d, y, x, w, rowTop = top) => {
      blockTitle(d, y, def.title, description, x, w)
      const barW = 70
      const otherW = 62
      const cols: Col[] = [
        { title: '#', w: 18, align: 'center' },
        { title: 'Jugador', w: w - 18 - barW - 54 - otherW * rest.length },
        { title: '', w: barW },
        { title: primary.label, w: 54, align: 'right' },
        ...rest.map(c => ({ title: c.label, w: otherW, align: 'right' as const })),
      ]
      let yy = y + rowTop
      drawHead(d, cols, yy, x)
      yy += HEAD_H
      if (rows.length === 0) {
        d.text('Ningún jugador llega a los mínimos elegidos.', x + 6, yy + 12, { size: 8.4, color: C.muted })
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
        ], yy, { bold: [1, 3], x0: x, size: 8 })
        const bx = x + cols[0].w + cols[1].w + 2
        d.rect(bx, yy + 6, barW - 6, 6, C.tile, 3)
        if (max > 0) d.rect(bx, yy + 6, Math.max(2, ((barW - 6) * Math.abs(r.value)) / max), 6, r.value < 0 ? C.red : C.greenBar, 3)
        yy += ROW_H
        d.line(x, yy, x + w, yy, C.line, 0.4)
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

function coverHeight() { return 86 }

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
  d.line(M, y + coverHeight() - 8, M + d.CW, y + coverHeight() - 8)
}

/* ------------------------------------------------------------ entrada */

/** Subtitulo que va pegado al primer bloque (nunca queda solo al pie de una hoja). */
function withHeading(title: string, subtitle: string, blocks: Block[]): Block[] {
  if (!blocks.length) return []
  const [first, ...rest] = blocks
  const headH = 40
  return [{
    h: headH + first.h,
    draw: (d, y) => {
      d.text(title, M, y + 14, { size: 14, bold: true })
      d.text(subtitle, M, y + 28, { size: 8.2, color: C.muted })
      first.draw(d, y + headH)
    },
  }, ...rest]
}

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
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4', compress: true })
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
      blocks: [
        want.has('temporada') ? seasonBlock(d, input) : null,
        want.has('eficacia') ? efficiencyBlock(d, input.matchRows, input.seasonStats) : null,
        want.has('vsRival') ? vsRivalBlock(d, input.matchRows) : null,
        want.has('evolucion') ? evolutionBlock(d, input.matchRows) : null,
        ...(want.has('historial') ? historyBlocks(d, input.matchRows) : []),
        want.has('formaciones') ? formationsBlock(d, input.wyscoutReport) : null,
        want.has('zonas') ? zonesBlock(d, input.wyscoutReport) : null,
      ],
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
        ...pairColumns(d, [
          ...RANKING_WIDGETS.filter(w => want.has(w.id)).map(def => (w: number) => rankingBlock(def, input, d, w)),
        ]),
        ...withHeading('Comparaciones por puesto', 'Cada punto es un jugador. En el recuadro verde, arriba a la derecha, quedan los que están por encima del resto de su puesto en las dos cosas.',
          pairColumns(d, SCATTER_DEFS.filter(s => want.has(s.id)).map(def => (w: number) =>
            scatterBlock(def, input.squad!.players, { minMinutes: input.minMinutes, teamMatches: input.teamMatches }, d, w)))),
      ] : [],
    },
  ]

  const sections = groups.map(g => {
    const list = g.blocks.filter((b): b is Block => b !== null)
    if (!list.length) return [] as Block[]
    const head = sectionBlock(g.title)
    // El titulo de seccion y su primer bloque se miden juntos para que nunca queden separados.
    return [{ h: head.h + list[0].h, draw: (d: Doc, y: number) => { head.draw(d, y); list[0].draw(d, y + head.h) } }, ...list.slice(1)]
  })

  // Primera hoja: portada arriba y despues los bloques del equipo.
  d.header()
  const coverH = coverHeight()
  drawCover(d, input, HEADER_BOTTOM - 10)
  let cursor = { y: HEADER_BOTTOM - 10 + coverH, bottom: HEADER_BOTTOM + d.contentH }

  /** Dibuja bloques seguidos: llena la hoja actual y despues reparte el resto en hojas nuevas. */
  function renderBlocks(blocks: Block[]) {
    let i = 0
    while (i < blocks.length && cursor.y + blocks[i].h <= cursor.bottom) {
      blocks[i].draw(d, cursor.y)
      cursor.y += blocks[i].h + GAP
      i++
    }
    const rest = blocks.slice(i)
    for (const page of planPages(rest.map(b => b.h), d.contentH, GAP)) {
      d.newPage()
      let py = HEADER_BOTTOM
      for (const k of page) {
        rest[k].draw(d, py)
        py += rest[k].h + GAP
      }
      cursor = { y: py, bottom: HEADER_BOTTOM + d.contentH }
    }
  }

  renderBlocks(sections[0])
  // "Surgidos del club": sus propias hojas apaisadas, dentro de los datos del equipo.
  if (want.has('surgidos') && input.homegrown) {
    appendHomegrownPages(pdf, input.homegrown, { today: input.today, logoDataUrl: input.logoDataUrl })
    // Lo que sigue arranca en una hoja vertical nueva (si no hay nada mas, no se agrega).
    cursor = { y: 0, bottom: -1 }
  }
  renderBlocks(sections[1])
  renderBlocks(sections[2])

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
