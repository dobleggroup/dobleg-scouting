// PDF de Entrenadores → Test Opta (Ponzio / River), dibujado con jsPDF: texto y gráficos
// vectoriales, A4 apaisado, un bloque por sección elegida y ningún bloque partido entre
// dos hojas (planPages). Mismas piezas y estilo que el PDF del Resumen de Domingo.
import type { jsPDF as JsPdf } from 'jspdf'
import {
  C, M, HEADER_BOTTOM, GAP, Doc, HEAD_H, blockTitle, descHeight, drawCells, drawHead, pairColumns,
  type Block, type Col, type ColumnBlock,
} from '@/features/coaches/wyscoutSquad/pdfDoc'
import { planPages } from '@/features/coaches/wyscoutSquad/pdfLayout'
import type { MatchLogRow, OptaShot } from '@/features/opta/data'
import { POS_LABEL, POS_SHORT, buildPercentiles, profileScore } from '@/features/opta/metrics'
import { fmtDate } from '@/features/opta/components/ui'
import { ageOn, coachRecords, currentClub, isCup, isHomegrown, seasonYear, type PlayerSeason } from '@/features/optaClub/clubData'
import {
  AREAS, AREA_LABEL, TEAM_METRIC, TEAM_METRICS, fmtMetric, formations, leagueAverage, metricValue, minutesShift,
  playerUsage, prettyFormation, rankTeams, recordOf, rolling, type TeamGame,
} from '../teamData'
import { RIVAL_FACT_WORDS, RIVER_FACT_WORDS, averageShape, heights, lanes, readStyle, strengthsWeaknesses, teamFacts, type Fact, type StyleReading } from '../style'
import { COACH_NAME, COACH_SHORT, TEAM_ID, type CoachData } from '../useCoachData'
import { dayMonth, dec1, kickoff, longDate } from '../format'
import { BLUE, BLUE_TINT, bar, chip, circle, dashed, scatter, shotLegend, shotMap, teamShape, trend, trendLegend } from './draw'

export interface CoachPdfInput {
  d: CoachData
  /** Rival a analizar (por defecto, el próximo). */
  oppId: string
  sections: string[]
  shots: Record<string, OptaShot[]> | null
  matchLog: Record<string, MatchLogRow[]> | null
  today: string
  logoDataUrl?: string
  photoDataUrl?: string
}

type Ctx = CoachPdfInput & { doc: Doc }

const TINT: Record<'green' | 'blue', { color: string; tint: string }> = {
  green: { color: C.green, tint: C.greenTint },
  blue: { color: BLUE, tint: BLUE_TINT },
}

/* ------------------------------------------------------------ piezas comunes */

function heading(title: string, desc: string | undefined, d: Doc, w = d.CW) {
  return { top: descHeight(d, desc, w) + 6, draw: (y: number, x = M) => blockTitle(d, y, title, desc, x, w) }
}

function factsBlock(d: Doc, title: string, desc: string, facts: Fact[], tone: 'green' | 'blue'): Block | null {
  if (!facts.length) return null
  const rows = Math.ceil(facts.length / 2)
  const h = 44 + rows * 34
  return {
    h,
    draw: (d, y) => {
      const t = TINT[tone]
      d.rect(M, y, d.CW, h, t.tint, 8)
      d.text(title, M + 14, y + 20, { size: 12.5, bold: true })
      d.text(desc, M + 14, y + 33, { size: 7.8, color: C.muted })
      const colW = (d.CW - 28 - 24) / 2
      facts.forEach((f, i) => {
        const x = M + 14 + (i % 2) * (colW + 24)
        const yy = y + 48 + Math.floor(i / 2) * 34
        circle(d, x + 8, yy + 4, 8, t.color)
        d.text(String(i + 1), x + 8, yy + 7, { size: 8, bold: true, color: C.white, align: 'center' })
        d.text(d.fit(f.headline, colW - 24, 9.5, true), x + 22, yy + 7, { size: 9.5, bold: true })
        d.text(d.fit(`${f.detail} · ${f.rank}º de ${f.total}`, colW - 24, 8), x + 22, yy + 19, { size: 8, color: C.text })
      })
    },
  }
}

/** Cada eje de estilo de un polo al otro, en 3 columnas. */
function styleGrid(d: Doc, x: number, y: number, w: number, readings: StyleReading[], tone: 'green' | 'blue', cols = 3) {
  const gap = 22
  const cw = (w - gap * (cols - 1)) / cols
  readings.forEach((r, i) => {
    const cx = x + (i % cols) * (cw + gap)
    const cy = y + Math.floor(i / cols) * 54
    const marked = r.strength >= 20
    d.text(r.axis.title.toUpperCase(), cx, cy + 8, { size: 6.2, bold: true, color: C.faint })
    d.text(d.fit(r.text, cw * 0.62, 6.4), cx + cw, cy + 8, { size: 6.4, color: C.muted, align: 'right' })
    d.text(d.fit(r.verdict, cw, 9.5, true), cx, cy + 21, { size: 9.5, bold: true, color: marked ? TINT[tone].color : C.text })
    d.rect(cx, cy + 27, cw, 4, '#ECECEF', 2)
    d.line(cx + cw / 2, cy + 25, cx + cw / 2, cy + 33, '#C7C7CC', 0.6)
    const px = cx + Math.max(4, Math.min(cw - 4, (r.pos / 100) * cw))
    circle(d, px, cy + 29, marked ? 4.5 : 3.6, TINT[tone].color, C.white, 1)
    d.text(d.fit(r.axis.low, cw / 2 - 4, 6.3, r.pos <= 30), cx, cy + 43, { size: 6.3, bold: r.pos <= 30, color: r.pos <= 30 ? C.text : C.faint })
    d.text(d.fit(r.axis.high, cw / 2 - 4, 6.3, r.pos >= 70), cx + cw, cy + 43, { size: 6.3, bold: r.pos >= 70, color: r.pos >= 70 ? C.text : C.faint, align: 'right' })
  })
  return Math.ceil(readings.length / cols) * 54
}

function lanesRow(d: Doc, x: number, y: number, w: number, l: { left: number; centre: number; right: number }, tone: 'green' | 'blue') {
  const gap = 8
  const tw = (w - gap * 2) / 3
  const max = Math.max(l.left, l.centre, l.right)
  ;([['Izquierda', l.left], ['Medio', l.centre], ['Derecha', l.right]] as const).forEach(([label, v], i) => {
    const tx = x + i * (tw + gap)
    d.rect(tx, y, tw, 40, v === max ? TINT[tone].tint : C.tile, 6)
    d.text(`${v}%`, tx + tw / 2, y + 20, { size: 14, bold: true, color: v === max ? TINT[tone].color : C.ink, align: 'center' })
    d.text(label.toUpperCase(), tx + tw / 2, y + 32, { size: 6.2, bold: true, color: C.muted, align: 'center' })
  })
  return 40
}

function styleBlock(d: Doc, title: string, desc: string, readings: StyleReading[], tone: 'green' | 'blue', lanesData?: { left: number; centre: number; right: number }): Block {
  const head = heading(title, desc, d)
  const gridH = Math.ceil(readings.length / 3) * 54
  const lanesH = lanesData ? 62 : 0
  return {
    h: head.top + gridH + lanesH,
    draw: (d, y) => {
      head.draw(y)
      styleGrid(d, M, y + head.top, d.CW, readings, tone)
      if (lanesData) {
        const ly = y + head.top + gridH + 8
        d.text('POR DÓNDE ATACA', M, ly + 6, { size: 6.4, bold: true, color: C.faint })
        d.text('Reparto de sus toques en el último tercio de la cancha.', M + 80, ly + 6, { size: 7, color: C.muted })
        lanesRow(d, M, ly + 12, Math.min(d.CW, 420), lanesData, tone)
      }
    },
  }
}

const shortOf = (c: Ctx, id: string) => c.d.league.teamById.get(id)?.short ?? '—'

/* ------------------------------------------------------------ panorama */

function situationBlock(c: Ctx): Block {
  const { d } = c
  const zone = d.zoneOf(TEAM_ID)
  const row = zone?.rows.find(r => r.teamId === TEAM_ID)
  const annual = d.annual?.rows.find(r => r.teamId === TEAM_ID)
  const sentence = row
    ? `River está ${row.rank}º en su zona del Clausura con ${row.pts} puntos en ${row.pj} partidos (${row.w} ganados, ${row.d} empatados, ${row.l} perdidos)${annual ? `, y ${annual.rank}º en la tabla anual con ${annual.pts} puntos` : ''}.`
    : ''
  const lines = c.doc.wrap(sentence, c.doc.CW, 10)
  const top = lines.length * 14 + 10
  const cardH = 206
  return {
    h: top + cardH,
    draw: (doc, y) => {
      lines.forEach((l, i) => doc.text(l, M, y + 11 + i * 14, { size: 10, color: C.text }))
      const w = (doc.CW - 18) / 2
      const last = d.games[d.games.length - 1]
      if (last) lastMatchCard(c, last, M, y + top, w, cardH)
      nextMatchCard(c, M + w + 18, y + top, w, cardH)
    },
  }
}

function lastMatchCard(c: Ctx, g: TeamGame, x: number, y: number, w: number, h: number) {
  const doc = c.doc
  doc.rect(x, y, w, h, C.tile, 8)
  doc.text('Último partido', x + 14, y + 20, { size: 11.5, bold: true })
  doc.text(`${g.match.stage ?? ''}${g.match.week ? `, fecha ${g.match.week}` : ''} · ${dayMonth(g.match)} · ${g.home ? 'de local' : 'de visitante'}`, x + 14, y + 32, { size: 7.5, color: C.muted })
  const [home, away] = g.home ? ['River', shortOf(c, g.oppId)] : [shortOf(c, g.oppId), 'River']
  const [hs, as] = g.home ? [g.gf, g.ga] : [g.ga, g.gf]
  const mid = x + w / 2
  doc.text(home, mid - 34, y + 60, { size: 11, bold: true, align: 'right' })
  doc.text(`${hs} - ${as}`, mid, y + 61, { size: 20, bold: true, align: 'center' })
  doc.text(away, mid + 34, y + 60, { size: 11, bold: true })
  chip(doc, x + w - 26, y + 12, g.result, 13)
  const rows: Array<[string, (s: 'us' | 'them') => number, number, string]> = [
    ['Goles esperados (xG)', s => g[s].xg ?? 0, 2, ''],
    ['Posesión', s => g[s].possessionPercentage ?? 0, 0, '%'],
    ['Remates', s => g[s].totalScoringAtt ?? 0, 0, ''],
    ['Remates al arco', s => g[s].ontargetScoringAtt ?? 0, 0, ''],
    ['Ocasiones claras', s => g[s].bigChanceCreated ?? 0, 0, ''],
    ['Llegadas al área', s => g[s].penAreaEntries ?? 0, 0, ''],
    ['Recuperaciones en campo rival', s => g[s].possWonAtt3rd ?? 0, 0, ''],
  ]
  const fmt = (v: number, dec: number, u: string) => `${v.toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec })}${u}`
  rows.forEach(([label, v, dec, unit], i) => {
    const yy = y + 80 + i * 17
    const a = v('us'), b = v('them'), tot = a + b || 1
    doc.text(fmt(a, dec, unit), x + 14, yy, { size: 8, bold: a >= b })
    doc.text(label, mid, yy, { size: 7.2, color: C.muted, align: 'center' })
    doc.text(fmt(b, dec, unit), x + w - 14, yy, { size: 8, bold: b > a, align: 'right' })
    const bw = w - 28
    doc.rect(x + 14, yy + 3.5, (bw - 2) * (a / tot), 3.5, C.greenBar, 1.5)
    doc.rect(x + 14 + (bw - 2) * (a / tot) + 2, yy + 3.5, (bw - 2) * (b / tot), 3.5, C.grayChip, 1.5)
  })
  doc.text(`Izquierda: River · derecha: ${shortOf(c, g.oppId)}`, x + 14, y + h - 9, { size: 6.5, color: C.faint })
}

function nextMatchCard(c: Ctx, x: number, y: number, w: number, h: number) {
  const { doc, d } = c
  doc.rect(x, y, w, h, C.tile, 8)
  doc.rect(x, y, w, 4, C.greenBar, 2)
  const m = d.next
  doc.text('PRÓXIMO PARTIDO', x + 14, y + 22, { size: 7.5, bold: true, color: C.green })
  if (!m) { doc.text('No hay partidos programados.', x + 14, y + 44, { size: 9, color: C.muted }); return }
  const home = m.home === TEAM_ID
  const oppId = home ? m.away : m.home
  const opp = d.league.teamById.get(oppId)
  doc.text(`${m.stage ?? ''}${m.week ? `, fecha ${m.week}` : ''}`, x + w - 14, y + 22, { size: 7.5, color: C.muted, align: 'right' })
  doc.text(doc.fit(`${home ? 'vs' : 'Visita a'} ${opp?.name ?? ''}`, w - 28, 16, true), x + 14, y + 50, { size: 16, bold: true })
  const when = kickoff(m)
  doc.text(when.charAt(0).toUpperCase() + when.slice(1), x + 14, y + 66, { size: 9, color: C.text })
  if (m.venue) doc.text(doc.fit(m.venue, w - 28, 8.5), x + 14, y + 79, { size: 8.5, color: C.muted })
  const zr = d.zoneOf(oppId)?.rows.find(r => r.teamId === oppId)
  const tw = (w - 28 - 10) / 2
  doc.rect(x + 14, y + 96, tw, 48, C.white, 6)
  doc.text('EN SU ZONA', x + 24, y + 112, { size: 6.4, bold: true, color: C.muted })
  doc.text(zr ? `${zr.rank}º · ${zr.pts} pts` : '—', x + 24, y + 132, { size: 14, bold: true })
  doc.rect(x + 24 + tw, y + 96, tw, 48, C.white, 6)
  doc.text('ÚLTIMOS 5', x + 34 + tw, y + 112, { size: 6.4, bold: true, color: C.muted })
  d.gamesOf(oppId, 'temporada').slice(-5).forEach((g, i) => chip(doc, x + 34 + tw + i * 17, y + 121, g.result, 13))
  const sameAs = c.oppId === oppId
  doc.text(sameAs ? 'El análisis completo del rival está en este informe.' : '', x + 14, y + h - 12, { size: 7.5, color: C.muted })
}

function formBlock(c: Ctx): Block {
  const games = c.d.games.slice(-10)
  const head = heading('Cómo viene', 'Los últimos 10 partidos: resultado y goles esperados (xG) de cada lado. Verde: River · gris: el rival.', c.doc)
  return {
    h: head.top + 122,
    draw: (doc, y) => {
      head.draw(y)
      const y0 = y + head.top
      const colW = doc.CW / games.length
      const max = Math.max(1, ...games.flatMap(g => [g.us.xg ?? 0, g.them.xg ?? 0]))
      games.forEach((g, i) => {
        const cx = M + colW * i + colW / 2
        const base = y0 + 62
        const hA = ((g.us.xg ?? 0) / max) * 58, hB = ((g.them.xg ?? 0) / max) * 58
        doc.rect(cx - 9, base - Math.max(1, hA), 8, Math.max(1, hA), C.greenBar, 2)
        doc.rect(cx + 1, base - Math.max(1, hB), 8, Math.max(1, hB), C.grayChip, 2)
        doc.text(`${dec1(g.us.xg ?? 0)}-${dec1(g.them.xg ?? 0)}`, cx, base + 10, { size: 6, color: C.faint, align: 'center' })
        chip(doc, cx - 6, base + 15, g.result, 12)
        doc.text(`${g.gf}-${g.ga}`, cx, base + 39, { size: 9, bold: true, align: 'center' })
        doc.text(doc.fit(`${g.home ? '' : 'en '}${shortOf(c, g.oppId)}`, colW - 4, 7), cx, base + 50, { size: 7, color: C.muted, align: 'center' })
      })
    },
  }
}

function zoneTableCol(c: Ctx): (w: number) => ColumnBlock | null {
  return w => {
    const zone = c.d.zoneOf(TEAM_ID)
    if (!zone) return null
    const desc = `Clausura ${c.d.league.meta.season}. En verde River, en azul el rival analizado.`
    const top = descHeight(c.doc, desc, w) + 4
    const RH = 15
    return {
      h: top + HEAD_H + zone.rows.length * RH,
      top,
      draw: (doc, y, x, w, rowTop = top) => {
        blockTitle(doc, y, 'Tabla de la zona', desc, x, w)
        const n = 30
        const cols: Col[] = [{ title: '#', w: 22, align: 'center' }, { title: 'Equipo', w: w - 22 - n * 6 }, ...['PJ', 'G', 'E', 'P', 'Goles', 'Pts'].map(t => ({ title: t, w: n, align: 'center' as const }))]
        let yy = y + rowTop
        drawHead(doc, cols, yy, x)
        yy += HEAD_H
        for (const r of zone.rows) {
          const mine = r.teamId === TEAM_ID, opp = r.teamId === c.oppId
          if (mine || opp) doc.rect(x, yy + 1, w, RH - 2, mine ? C.greenTint : BLUE_TINT, 3)
          drawCells(doc, cols, [String(r.rank), shortOf(c, r.teamId), String(r.pj), String(r.w), String(r.d), String(r.l), `${r.gf}:${r.ga}`, String(r.pts)], yy - 3, { x0: x, size: 7.8, bold: mine ? [1, 7] : [7] })
          yy += RH
        }
      },
    }
  }
}

function strengthsCol(c: Ctx, teamId: string, title: string, name: string): (w: number) => ColumnBlock {
  return w => {
    const pool = c.d.allTeams('torneo')
    const { strong, weak } = strengthsWeaknesses(teamId, pool, 5)
    const desc = `En el Clausura, por partido: donde está entre los 6 mejores y los 6 peores de los ${pool.size} equipos.`
    const top = descHeight(c.doc, desc, w) + 4
    const rows = Math.max(strong.length, weak.length, 1)
    return {
      h: top + 16 + rows * 26,
      top,
      draw: (doc, y, x, w, rowTop = top) => {
        blockTitle(doc, y, title, desc, x, w)
        const half = (w - 16) / 2
        ;([['LO MEJOR', strong, C.green, C.greenTint], ['LO PEOR', weak, C.red, C.redTint]] as const).forEach(([label, list, color, tint], k) => {
          const lx = x + k * (half + 16)
          doc.text(label, lx, y + rowTop + 8, { size: 6.6, bold: true, color })
          if (!list.length) doc.text('Nada que se destaque.', lx, y + rowTop + 26, { size: 8, color: C.muted })
          list.forEach((s, i) => {
            const yy = y + rowTop + 16 + i * 26
            doc.rect(lx, yy, 20, 20, tint, 4)
            doc.text(`${s.r.rank}º`, lx + 10, yy + 13.5, { size: 8, bold: true, color, align: 'center' })
            doc.text(doc.fit(s.m.label, half - 28, 8.5, true), lx + 26, yy + 8.5, { size: 8.5, bold: true })
            doc.text(doc.fit(`${name} ${fmtMetric(s.m, s.r.value)} · liga ${fmtMetric(s.m, leagueAverage(s.m, pool))}`, half - 28, 7.2), lx + 26, yy + 18, { size: 7.2, color: C.muted })
          })
        })
      },
    }
  }
}

function allDataBlock(c: Ctx): Block {
  const pool = c.d.allTeams('torneo')
  const games = pool.get(TEAM_ID) ?? []
  const head = heading('Todos los datos de River', `En el Clausura, por partido. Puesto entre los ${pool.size} equipos (en los datos de estilo, "más alto" no es mejor ni peor) y promedio de la liga.`, c.doc)
  const leftAreas = AREAS.slice(0, 2), rightAreas = AREAS.slice(2)
  const count = (areas: typeof AREAS) => areas.reduce((s, a) => s + TEAM_METRICS.filter(m => m.area === a).length + 1, 0)
  const RH = 13.5
  const rows = Math.max(count(leftAreas), count(rightAreas))
  return {
    h: head.top + HEAD_H + rows * RH,
    draw: (doc, y) => {
      head.draw(y)
      const w = (doc.CW - 18) / 2
      ;[leftAreas, rightAreas].forEach((areas, k) => {
        const x = M + k * (w + 18)
        const cols: Col[] = [{ title: 'Dato', w: w - 64 * 3 }, { title: 'River', w: 64, align: 'right' }, { title: 'Puesto', w: 64, align: 'right' }, { title: 'Liga', w: 64, align: 'right' }]
        let yy = y + head.top
        drawHead(doc, cols, yy, x)
        yy += HEAD_H
        for (const area of areas) {
          doc.text(AREA_LABEL[area].toUpperCase(), x + 6, yy + 10, { size: 6.4, bold: true, color: C.green })
          yy += RH
          for (const m of TEAM_METRICS.filter(mm => mm.area === area)) {
            const r = rankTeams(m, pool).get(TEAM_ID)!
            const good = !m.neutral && r.rank <= 6, bad = !m.neutral && r.rank >= pool.size - 5
            drawCells(doc, cols, [m.label, fmtMetric(m, metricValue(m, games)), `${r.rank}º${m.neutral ? ' más alto' : ''}`, fmtMetric(m, leagueAverage(m, pool))], yy - 3.5, {
              x0: x, size: 7.6, bold: [1], colors: [undefined, undefined, good ? C.green : bad ? C.red : undefined, C.muted],
            })
            yy += RH
          }
        }
      })
    },
  }
}

/* ------------------------------------------------------------ rival */

function rivalShape(c: Ctx): Block {
  const { d } = c
  const opp = shortOf(c, c.oppId)
  const recent = d.gamesOf(c.oppId, 'temporada').slice(-5)
  const shape = averageShape(recent, d.block.lineups)
  const h = heights(recent)
  const forms = formations(d.gamesOf(c.oppId, 'torneo'))
  const head = heading(`Cómo se para ${opp}`, `Los 11 más usados en sus últimos ${recent.length} partidos, en su posición media (ataca hacia la derecha), con su línea defensiva y la altura donde defiende.`, c.doc)
  const pw = 500
  const ph = (pw * 68) / 105
  return {
    h: head.top + ph,
    draw: (doc, y) => {
      head.draw(y)
      const y0 = y + head.top
      teamShape(doc, M, y0, pw, shape.map(s => ({ ...s, name: d.league.playerById.get(s.id)?.name ?? '—', shirt: d.league.playerById.get(s.id)?.shirt ?? null })), h.lineX, h.blockX, BLUE)
      const rx = M + pw + 24, rw = doc.CW - pw - 24
      doc.text('DIBUJO MÁS USADO', rx, y0 + 8, { size: 6.4, bold: true, color: C.faint })
      forms.slice(0, 3).forEach((f, i) => doc.text(`${prettyFormation(f.formation)}  (${f.count} ${f.count === 1 ? 'partido' : 'partidos'})`, rx, y0 + 24 + i * 14, { size: i ? 9 : 12, bold: i === 0 }))
      doc.text('POR DÓNDE ATACA', rx, y0 + 82, { size: 6.4, bold: true, color: C.faint })
      lanesRow(doc, rx, y0 + 90, rw, lanes(d.gamesOf(c.oppId, 'torneo')), 'blue')
      doc.text('ALTURAS', rx, y0 + 152, { size: 6.4, bold: true, color: C.faint })
      if (h.lineX !== null) doc.text(`Línea defensiva a ${Math.round(h.lineX * 1.05)} m de su arco`, rx, y0 + 168, { size: 8.5 })
      if (h.blockX !== null) doc.text(`Defiende en promedio a ${Math.round(h.blockX * 1.05)} m`, rx, y0 + 182, { size: 8.5 })
      doc.text('Los números son las camisetas.', rx, y0 + 200, { size: 7, color: C.muted })
    },
  }
}

function teamShots(c: Ctx, teamId: string, games: TeamGame[]) {
  const out = { for: [] as OptaShot[], against: [] as OptaShot[] }
  if (!c.shots || !c.matchLog) return out
  const teamIn = new Map<string, string>()
  for (const [pid, rows] of Object.entries(c.matchLog)) for (const r of rows) teamIn.set(`${pid}|${r.match}`, r.team)
  const ids = new Set(games.map(g => g.match.id))
  for (const [pid, list] of Object.entries(c.shots)) for (const s of list) {
    if (!ids.has(s[5])) continue
    ;(teamIn.get(`${pid}|${s[5]}`) === teamId ? out.for : out.against).push(s)
  }
  return out
}

function rivalShotsCol(c: Ctx): (w: number) => ColumnBlock | null {
  return w => {
    if (!c.shots || !c.matchLog) return null
    const opp = shortOf(c, c.oppId)
    const games = c.d.gamesOf(c.oppId, 'torneo')
    const s = teamShots(c, c.oppId, games)
    const desc = `En el Clausura. Izquierda: desde dónde remata ${opp} (${s.for.length} remates). Derecha: desde dónde le rematan (${s.against.length}).`
    const top = descHeight(c.doc, desc, w) + 4
    const pw = (w - 14) / 2
    const ph = (pw * 52.5) / 68
    return {
      h: top + ph + 18,
      top,
      draw: (doc, y, x, w, rowTop = top) => {
        blockTitle(doc, y, 'Remates', desc, x, w)
        shotMap(doc, x, y + rowTop, pw, s.for)
        shotMap(doc, x + pw + 14, y + rowTop, pw, s.against)
        shotLegend(doc, x, y + rowTop + ph + 14)
      },
    }
  }
}

function rivalPlayersCol(c: Ctx): (w: number) => ColumnBlock {
  return w => {
    const idx = buildPercentiles(c.d.league.players)
    const list = c.d.league.players.filter(p => p.teamId === c.oppId && p.minutes > 0)
      .sort((a, b) => (b.stats.goals ?? 0) + (b.stats.goalAssist ?? 0) + (b.xg.expectedGoals ?? 0) - ((a.stats.goals ?? 0) + (a.stats.goalAssist ?? 0) + (a.xg.expectedGoals ?? 0)))
      .slice(0, 6)
    const desc = 'Los que más goles, asistencias y xG suman en la temporada. Nota Opta: 0 a 100 contra los de su puesto.'
    const top = descHeight(c.doc, desc, w) + 4
    return {
      h: top + HEAD_H + list.length * 17,
      top,
      draw: (doc, y, x, w, rowTop = top) => {
        blockTitle(doc, y, 'Sus jugadores clave', desc, x, w)
        const cols: Col[] = [{ title: 'Jugador', w: w - 92 - 34 * 4 }, { title: 'Puesto', w: 92 }, { title: 'Goles', w: 34, align: 'right' }, { title: 'Asist.', w: 34, align: 'right' }, { title: 'xG', w: 34, align: 'right' }, { title: 'Nota', w: 34, align: 'right' }]
        let yy = y + rowTop
        drawHead(doc, cols, yy, x)
        yy += HEAD_H
        for (const p of list) {
          drawCells(doc, cols, [p.name, POS_LABEL[p.pos], String(p.stats.goals ?? 0), String(p.stats.goalAssist ?? 0), dec1(p.xg.expectedGoals ?? 0), String(profileScore(p, idx) ?? '—')], yy - 2, { x0: x, size: 7.8, bold: [0, 5] })
          yy += 17
        }
      },
    }
  }
}

function h2hCol(c: Ctx): (w: number) => ColumnBlock | null {
  return w => {
    const games = c.d.games.filter(g => g.oppId === c.oppId)
    if (!games.length) return null
    const opp = shortOf(c, c.oppId)
    const desc = `Partidos de la temporada entre River y ${opp}.`
    const top = descHeight(c.doc, desc, w) + 4
    return {
      h: top + games.length * 20,
      top,
      draw: (doc, y, x, w, rowTop = top) => {
        blockTitle(doc, y, 'Este año entre ellos', desc, x, w)
        games.forEach((g, i) => {
          const yy = y + rowTop + i * 20
          doc.text(fmtDate(g.match.date), x, yy + 10, { size: 8, color: C.muted })
          chip(doc, x + 50, yy + 1, g.result, 12)
          const txt = g.home ? `River ${g.gf} - ${g.ga} ${opp}` : `${opp} ${g.ga} - ${g.gf} River`
          doc.text(txt, x + 70, yy + 10, { size: 9, bold: true })
          doc.text(`xG ${dec1(g.us.xg ?? 0)} a ${dec1(g.them.xg ?? 0)}`, x + w, yy + 10, { size: 8, color: C.muted, align: 'right' })
        })
      },
    }
  }
}

const FACE_TO_FACE = ['goals', 'xg', 'shots', 'bigChances', 'boxEntries', 'poss', 'passPct', 'longPct', 'crosses', 'ga', 'xga', 'shotsAgainst', 'ppda', 'highRec', 'aerialPct', 'setPieceShots']

function faceToFaceBlock(c: Ctx): Block {
  const pool = c.d.allTeams('torneo')
  const opp = shortOf(c, c.oppId)
  const head = heading(`River y ${opp}, dato por dato`, `Por partido en el Clausura. Al lado de cada valor, su puesto entre los ${pool.size} equipos. En negrita, el que está mejor.`, c.doc)
  const RH = 24
  const half = Math.ceil(FACE_TO_FACE.length / 2)
  return {
    h: head.top + 12 + half * RH,
    draw: (doc, y) => {
      head.draw(y)
      const w = (doc.CW - 30) / 2
      doc.text('River', M + 4, y + head.top + 6, { size: 7.5, bold: true, color: C.green })
      doc.text(opp, M + w, y + head.top + 6, { size: 7.5, bold: true, color: BLUE, align: 'right' })
      doc.text('River', M + w + 34, y + head.top + 6, { size: 7.5, bold: true, color: C.green })
      doc.text(opp, M + doc.CW, y + head.top + 6, { size: 7.5, bold: true, color: BLUE, align: 'right' })
      FACE_TO_FACE.forEach((k, i) => {
        const m = TEAM_METRIC.get(k)!
        const ranks = rankTeams(m, pool)
        const us = ranks.get(TEAM_ID)!, them = ranks.get(c.oppId)!
        const a = us.value ?? 0, b = them.value ?? 0
        const x = M + (i >= half ? w + 30 : 0)
        const yy = y + head.top + 12 + (i % half) * RH
        const usBetter = us.rank < them.rank
        doc.text(`${m.label}${m.lower ? ' (menos es mejor)' : ''}`, x + w / 2, yy + 7, { size: 7, color: C.muted, align: 'center' })
        const bw = (w - 120) / 2, max = Math.max(a, b) || 1
        doc.text(`${fmtMetric(m, a)}  ${us.rank}º`, x + 56, yy + 18, { size: 7.8, bold: usBetter, align: 'right' })
        doc.rect(x + 60 + bw - (bw * a) / max, yy + 13, (bw * a) / max, 5, C.greenBar, 2)
        doc.rect(x + 62 + bw, yy + 13, (bw * b) / max, 5, BLUE, 2)
        doc.text(`${them.rank}º  ${fmtMetric(m, b)}`, x + w - 56, yy + 18, { size: 7.8, bold: !usBetter })
      })
    },
  }
}

/* ------------------------------------------------------------ con Ponzio */

function cycleRecordBlock(c: Ctx): Block {
  const { d } = c
  const before = d.gamesOf(TEAM_ID, 'torneo').filter(g => g.match.date < d.coachFrom)
  const after = d.games.filter(g => g.match.date >= d.coachFrom)
  const rb = recordOf(before), ra = recordOf(after)
  const per = (n: number, p: number) => (p ? (n / p).toFixed(2).replace('.', ',') : '—')
  const head = heading(`Con ${COACH_SHORT}: los números`, `Sus ${ra.played} partidos contra los ${rb.played} del Clausura antes de que llegara.`, c.doc)
  const items: Array<[string, string, string]> = [
    [`${ra.won}-${ra.drawn}-${ra.lost}`, 'Ganados-empatados-perdidos', `antes: ${rb.won}-${rb.drawn}-${rb.lost}`],
    [per(ra.points, ra.played), 'Puntos por partido', `antes: ${per(rb.points, rb.played)}`],
    [per(ra.gf, ra.played), 'Goles a favor por partido', `antes: ${per(rb.gf, rb.played)}`],
    [per(ra.ga, ra.played), 'Goles en contra por partido', `antes: ${per(rb.ga, rb.played)}`],
  ]
  return {
    h: head.top + 60,
    draw: (doc, y) => {
      head.draw(y)
      const gap = 10, tw = (doc.CW - gap * 3) / 4
      items.forEach(([v, label, before], i) => {
        const x = M + i * (tw + gap), yy = y + head.top
        doc.rect(x, yy, tw, 58, i < 2 ? C.greenTint : C.tile, 6)
        doc.text(v, x + tw / 2, yy + 24, { size: 17, bold: true, color: i < 2 ? C.green : C.ink, align: 'center' })
        doc.text(label.toUpperCase(), x + tw / 2, yy + 38, { size: 6.3, bold: true, color: C.muted, align: 'center' })
        doc.text(before, x + tw / 2, yy + 50, { size: 7.5, color: C.text, align: 'center' })
      })
    },
  }
}

function cycleChangesBlock(c: Ctx): Block {
  const { d } = c
  const pool = d.allTeams('torneo')
  const before = d.gamesOf(TEAM_ID, 'torneo').filter(g => g.match.date < d.coachFrom)
  const after = d.games.filter(g => g.match.date >= d.coachFrom)
  const head = heading(`Qué cambió con ${COACH_SHORT}`, 'Cada línea va del peor equipo de la liga (izquierda) al mejor (derecha); en los datos de estilo, de menos a más. Gris: antes · verde: con Ponzio · rayita: promedio de la liga. A la derecha: antes y con Ponzio.', c.doc)
  const left = AREAS.slice(0, 2), right = AREAS.slice(2)
  const count = (areas: typeof AREAS) => areas.reduce((s, a) => s + TEAM_METRICS.filter(m => m.area === a).length + 1, 0)
  const RH = 14.5
  return {
    h: head.top + Math.max(count(left), count(right)) * RH,
    draw: (doc, y) => {
      head.draw(y)
      const w = (doc.CW - 24) / 2
      ;[left, right].forEach((areas, k) => {
        const x = M + k * (w + 24)
        let yy = y + head.top
        for (const area of areas) {
          doc.text(AREA_LABEL[area].toUpperCase(), x, yy + 9, { size: 6.4, bold: true, color: C.faint })
          yy += RH
          for (const m of TEAM_METRICS.filter(mm => mm.area === area)) {
            const vals = [...pool.values()].map(gs => metricValue(m, gs)).filter((v): v is number => v !== null)
            const lo = Math.min(...vals), hi = Math.max(...vals)
            const avg = vals.reduce((s, v) => s + v, 0) / vals.length
            const b = metricValue(m, before), a = metricValue(m, after)
            const pos = (v: number) => { const t = hi > lo ? (v - lo) / (hi - lo) : 0.5; return Math.max(0, Math.min(1, m.lower ? 1 - t : t)) }
            const lw = 128, tx = x + lw, tw = w - lw - 84
            doc.text(doc.fit(m.label, lw - 6, 7.4), x, yy + 8, { size: 7.4, color: C.text })
            doc.rect(tx, yy + 4, tw, 3, '#ECECEF', 1.5)
            doc.line(tx + tw * pos(avg), yy + 1.5, tx + tw * pos(avg), yy + 9.5, C.faint, 0.6)
            const better = a !== null && b !== null ? (m.lower ? a < b : a > b) : null
            const changed = a !== null && b !== null && b !== 0 && Math.abs((a - b) / b) >= 0.05
            const tone = m.neutral || !changed ? C.text : better ? C.green : C.red
            if (a !== null && b !== null) {
              const x1 = tx + tw * pos(b), x2 = tx + tw * pos(a)
              doc.rect(Math.min(x1, x2), yy + 4, Math.abs(x2 - x1), 3, m.neutral || !changed ? '#D1D1D6' : better ? '#BBF7D0' : '#FECACA')
              circle(doc, x1, yy + 5.5, 3, '#A1A1A6', C.white, 0.6)
              circle(doc, x2, yy + 5.5, 3.3, C.greenBar, C.white, 0.6)
            }
            doc.text(fmtMetric(m, b), x + w - 42, yy + 8, { size: 7.2, color: C.muted, align: 'right' })
            doc.text(fmtMetric(m, a), x + w, yy + 8, { size: 7.4, bold: true, color: tone, align: 'right' })
            yy += RH
          }
        }
      })
    },
  }
}

function cycleShapeCol(c: Ctx): (w: number) => ColumnBlock {
  return w => {
    const { d } = c
    const after = d.games.filter(g => g.match.date >= d.coachFrom)
    const before = d.gamesOf(TEAM_ID, 'torneo').filter(g => g.match.date < d.coachFrom)
    const shape = averageShape(after, d.block.lineups)
    const h = heights(after)
    const fa = formations(after), fb = formations(before)
    const desc = `Los 11 con más partidos de titular con ${COACH_SHORT}, en su posición media. Dibujo: ${fa.map(f => `${prettyFormation(f.formation)} (${f.count})`).join(', ') || '—'} · antes: ${fb.slice(0, 2).map(f => `${prettyFormation(f.formation)} (${f.count})`).join(', ') || '—'}.`
    const top = descHeight(c.doc, desc, w) + 4
    const ph = (w * 68) / 105
    return {
      h: top + ph,
      top,
      draw: (doc, y, x, w, rowTop = top) => {
        blockTitle(doc, y, 'El equipo que más usa', desc, x, w)
        teamShape(doc, x, y + rowTop, w, shape.map(s => ({ ...s, name: d.league.playerById.get(s.id)?.name ?? '—', shirt: d.league.playerById.get(s.id)?.shirt ?? null })), h.lineX, h.blockX, C.green)
      },
    }
  }
}

function cyclePlacesCol(c: Ctx): (w: number) => ColumnBlock {
  return w => {
    const { d } = c
    const after = d.games.filter(g => g.match.date >= d.coachFrom)
    const before = d.gamesOf(TEAM_ID, 'torneo').filter(g => g.match.date < d.coachFrom)
    const { gained, lost } = minutesShift(before, after, d.block.lineups)
    const desc = 'Parte de los minutos del equipo que jugó cada uno: antes y con Ponzio.'
    const top = descHeight(c.doc, desc, w) + 4
    const rows = gained.length + lost.length
    return {
      h: top + 32 + rows * 19,
      top,
      draw: (doc, y, x, w, rowTop = top) => {
        blockTitle(doc, y, 'Quién ganó y quién perdió lugar', desc, x, w)
        let yy = y + rowTop
        ;([['GANARON LUGAR', gained, C.green, C.greenBar], ['PERDIERON LUGAR', lost, C.red, '#F87171']] as const).forEach(([label, list, color, barColor]) => {
          doc.text(label, x, yy + 8, { size: 6.6, bold: true, color })
          yy += 14
          for (const r of list) {
            doc.text(doc.fit(d.league.playerById.get(r.id)?.name ?? '—', 150, 8.2), x, yy + 8, { size: 8.2 })
            const bx = x + 156, bw = w - 156 - 74
            doc.rect(bx, yy + 3.5, bw, 4, C.tile, 2)
            doc.rect(bx + bw * Math.min(r.a, r.b), yy + 3.5, Math.max(2, bw * Math.abs(r.delta)), 4, barColor, 2)
            doc.text(`${Math.round(r.b * 100)}% a ${Math.round(r.a * 100)}%`, x + w, yy + 8, { size: 7.6, bold: true, color, align: 'right' })
            yy += 19
          }
          yy += 2
        })
      },
    }
  }
}

/* ------------------------------------------------------------ partido a partido */

function evolutionBlock(c: Ctx): Block {
  const { d } = c
  const keys = ['xg', 'xga', 'poss', 'ppda']
  const head = heading('Partido a partido', `Toda la temporada ${d.league.meta.season}. Las barras son cada partido (color según el resultado); la zona verde, los partidos con ${COACH_SHORT}.`, c.doc)
  const ch = 118
  return {
    h: head.top + 2 * (ch + 30) + 12,
    draw: (doc, y) => {
      head.draw(y)
      const w = (doc.CW - 24) / 2
      keys.forEach((k, i) => {
        const m = TEAM_METRIC.get(k)!
        const x = M + (i % 2) * (w + 24)
        const yy = y + head.top + Math.floor(i / 2) * (ch + 30)
        doc.text(`${m.label}${m.lower ? ' (menos es mejor)' : ''}`, x, yy + 9, { size: 9, bold: true })
        const vals = d.games.map(g => metricValue(m, [g]) ?? 0)
        const roll = rolling(vals, 5)
        trend(doc, x, yy + 18, w, ch, d.games.map((g, j) => ({
          label: fmtDate(g.match.date).slice(0, 5), value: vals[j], result: g.result, withCoach: g.match.date >= d.coachFrom, rolling: roll[j],
        })), leagueAverage(m, d.allTeams('temporada')), v => fmtMetric(m, v), COACH_SHORT)
      })
      trendLegend(doc, M, y + head.top + 2 * (ch + 30) + 8)
    },
  }
}

function matchesBlocks(c: Ctx): Block[] {
  const games = [...c.d.games].reverse()
  const per = 22
  const out: Block[] = []
  const cols = (w: number): Col[] => {
    const fixed = 52 + 46 + 66 + 60 + 52 + 64 + 62 + 70 + 44 + 60
    return [
      { title: 'Fecha', w: 52 }, { title: 'Rival', w: w - fixed }, { title: '', w: 46 }, { title: 'Resultado', w: 66, align: 'center' },
      { title: 'xG', w: 60, align: 'center' }, { title: 'Posesión', w: 52, align: 'center' }, { title: 'Remates', w: 64, align: 'center' },
      { title: 'Ocasiones', w: 62, align: 'center' }, { title: 'Llegadas área', w: 70, align: 'center' }, { title: 'PPDA', w: 44, align: 'center' }, { title: 'Dibujo', w: 60, align: 'center' },
    ]
  }
  for (let i = 0; i < games.length; i += per) {
    const chunk = games.slice(i, i + per)
    const head = heading(i === 0 ? 'Todos los partidos' : 'Todos los partidos (sigue)', i === 0 ? 'Del más reciente al más viejo. En las columnas dobles: River - rival. PPDA: pases que dejó dar antes de presionar (menos = presiona más).' : undefined, c.doc)
    out.push({
      h: head.top + HEAD_H + chunk.length * 15,
      draw: (doc, y) => {
        head.draw(y)
        const cc = cols(doc.CW)
        let yy = y + head.top
        drawHead(doc, cc, yy)
        yy += HEAD_H
        for (const g of chunk) {
          if (g.match.date >= c.d.coachFrom) doc.rect(M, yy + 1, doc.CW, 13, C.greenTint, 2)
          drawCells(doc, cc, [
            fmtDate(g.match.date), shortOf(c, g.oppId), g.home ? 'Local' : 'Visit.', '',
            `${dec1(g.us.xg ?? 0)} - ${dec1(g.them.xg ?? 0)}`, `${Math.round(g.us.possessionPercentage ?? 0)}%`,
            `${g.us.totalScoringAtt ?? 0} - ${g.them.totalScoringAtt ?? 0}`, `${g.us.bigChanceCreated ?? 0} - ${g.them.bigChanceCreated ?? 0}`,
            `${g.us.penAreaEntries ?? 0} - ${g.them.penAreaEntries ?? 0}`, fmtMetric(TEAM_METRIC.get('ppda')!, g.us.ppda ?? null), g.formation ? prettyFormation(g.formation) : '—',
          ], yy - 3, { size: 7.6, bold: [1] })
          const rx = M + cc.slice(0, 3).reduce((s, cl) => s + cl.w, 0)
          chip(doc, rx + 10, yy + 1.5, g.result, 10)
          doc.text(`${g.gf}-${g.ga}`, rx + 26, yy + 9.5, { size: 7.8, bold: true })
          yy += 15
        }
      },
    })
  }
  return out
}

/* ------------------------------------------------------------ River vs la liga */

function leagueRankBlock(c: Ctx): Block {
  const pool = c.d.allTeams('torneo')
  const games = pool.get(TEAM_ID) ?? []
  const head = heading('River contra los 30 equipos', 'En el Clausura, por partido: el valor de River y su puesto. La barra muestra qué parte de la liga supera (en los datos de estilo, solo dónde está).', c.doc)
  const RH = 23
  const maxRows = Math.max(...AREAS.map(a => TEAM_METRICS.filter(m => m.area === a).length))
  return {
    h: head.top + 16 + maxRows * RH,
    draw: (doc, y) => {
      head.draw(y)
      const gap = 16, w = (doc.CW - gap * 3) / 4
      AREAS.forEach((area, k) => {
        const x = M + k * (w + gap)
        doc.text(AREA_LABEL[area].toUpperCase(), x, y + head.top + 8, { size: 6.6, bold: true, color: C.green })
        TEAM_METRICS.filter(m => m.area === area).forEach((m, i) => {
          const r = rankTeams(m, pool).get(TEAM_ID)!
          const yy = y + head.top + 16 + i * RH
          doc.text(doc.fit(m.label, w - 70, 7.4), x, yy + 8, { size: 7.4, color: C.text })
          doc.text(`${fmtMetric(m, metricValue(m, games))}  ${r.rank}º`, x + w, yy + 8, { size: 7.4, bold: true, align: 'right' })
          const color = m.neutral ? '#A1A1A6' : r.pct >= 80 ? '#34D399' : r.pct >= 55 ? C.greenBar : r.pct >= 35 ? '#F59E0B' : r.pct >= 20 ? '#F97316' : C.red
          bar(doc, x, yy + 12, w, 4, m.neutral ? 1 - (r.rank - 1) / Math.max(1, pool.size - 1) : r.pct / 100, color)
        })
      })
    },
  }
}

const SCATTERS: Array<{ x: string; y: string; title: string; text: string }> = [
  { x: 'xg', y: 'xga', title: 'Peligro que genera y que recibe', text: 'xG a favor y en contra por partido. Arriba a la derecha: generan mucho y conceden poco.' },
  { x: 'poss', y: 'ppda', title: 'Posesión y presión', text: 'Cuánto tiene la pelota y qué tan rápido presiona (arriba = presiona más).' },
  { x: 'boxEntries', y: 'boxAgainst', title: 'Llegadas al área a favor y en contra', text: 'Cuántas veces entra al área rival y cuántas le entran (arriba = le llegan menos).' },
  { x: 'block', y: 'tilt', title: 'Altura del bloque y dominio territorial', text: 'Dónde defiende (derecha = más arriba) y cuánto mete al rival atrás.' },
]

function scatterCols(c: Ctx): Array<(w: number) => ColumnBlock> {
  const pool = c.d.allTeams('torneo')
  return SCATTERS.map(s => (w: number) => {
    const mx = TEAM_METRIC.get(s.x)!, my = TEAM_METRIC.get(s.y)!
    const top = descHeight(c.doc, s.text, w) + 4
    const h = 232
    return {
      h: top + h,
      top,
      draw: (doc, y, x, w, rowTop = top) => {
        blockTitle(doc, y, s.title, s.text, x, w)
        const pts = [...pool].map(([id, gs]) => ({ id, name: shortOf(c, id), x: metricValue(mx, gs) ?? 0, y: metricValue(my, gs) ?? 0, tone: id === TEAM_ID ? 'main' as const : id === c.oppId ? 'rival' as const : undefined }))
        scatter(doc, x, y + rowTop, w, h, pts, { label: mx.label, lower: mx.lower, fmt: v => fmtMetric(mx, v) }, { label: my.label, lower: my.lower, fmt: v => fmtMetric(my, v) })
      },
    }
  })
}

/* ------------------------------------------------------------ plantel */

function homegrownIds(c: Ctx) {
  return new Set([...c.d.club.squad.filter(p => isHomegrown(p, TEAM_ID)).map(p => p.id), ...c.d.club.alumni.map(p => p.id)])
}

function minutesBlock(c: Ctx): Block {
  const { d } = c
  const after = d.games.filter(g => g.match.date >= d.coachFrom)
  const usage = playerUsage(after, d.block.lineups)
  const hg = homegrownIds(c)
  const possible = after.length * 90
  const per = Math.ceil(usage.length / 2)
  const head = heading(`Minutos con ${COACH_SHORT}`, `La barra llena son los ${possible} minutos que jugó River con él. En verde, los surgidos del club (debutaron en Primera en River).`, c.doc)
  const RH = 19
  return {
    h: head.top + per * RH,
    draw: (doc, y) => {
      head.draw(y)
      const w = (doc.CW - 30) / 2
      usage.forEach((u, i) => {
        const x = M + (i >= per ? w + 30 : 0)
        const yy = y + head.top + (i % per) * RH
        const p = d.league.playerById.get(u.playerId)
        doc.text(p ? POS_SHORT[p.pos] : '', x, yy + 8, { size: 6.6, bold: true, color: C.faint })
        doc.text(doc.fit(p?.name ?? '—', 128, 8.2, hg.has(u.playerId)), x + 26, yy + 8, { size: 8.2, bold: hg.has(u.playerId), color: hg.has(u.playerId) ? C.green : C.ink })
        bar(doc, x + 160, yy + 3.5, w - 160 - 96, 5, u.minutes / Math.max(1, possible), hg.has(u.playerId) ? C.greenBar : '#A1A1A6')
        doc.text(`${u.minutes}'  ·  ${u.starts} de titular`, x + w, yy + 8, { size: 7.4, color: C.text, align: 'right' })
      })
    },
  }
}

function homegrownBlock(c: Ctx): Block {
  const { d } = c
  const hg = homegrownIds(c)
  const per = d.games.map(g => {
    const lu = d.block.lineups[g.match.id]?.[TEAM_ID] ?? []
    return { g, s: lu.filter(p => p[3] === 1 && hg.has(p[0])).length, u: lu.filter(p => p[3] === 0 && hg.has(p[0])).length }
  })
  const maxPer = Math.max(1, ...per.map(x => x.s + x.u))
  const away = d.club.alumni.map(p => ({ p, now: currentClub(p) })).filter(x => x.now)
    .sort((a, b) => Number(d.league.playerById.has(b.p.id)) - Number(d.league.playerById.has(a.p.id)) || a.now!.team.localeCompare(b.now!.team))
  const awayText = away.map(x => `${x.p.name} (${x.now!.team}${x.now!.loan ? ', a préstamo' : ''})`).join('  ·  ')
  const lines = c.doc.wrap(awayText, c.doc.CW, 7.6).slice(0, 9)
  const usage = playerUsage(d.games, d.block.lineups)
  const total = usage.reduce((s, u) => s + u.minutes, 0)
  const hgMin = usage.filter(u => hg.has(u.playerId)).reduce((s, u) => s + u.minutes, 0)
  const head = heading('Surgidos del club', `Chicos que debutaron en Primera en River: ${d.club.squad.filter(p => hg.has(p.id)).length} en el plantel, ${total ? Math.round((hgMin / total) * 100) : 0}% de los minutos de 2026. Barras: cuántos jugaron cada partido (verde titulares, gris entraron).`, c.doc)
  return {
    h: head.top + 96 + 22 + lines.length * 11,
    draw: (doc, y) => {
      head.draw(y)
      const y0 = y + head.top
      const step = doc.CW / per.length
      const coachIdx = per.findIndex(x => x.g.match.date >= d.coachFrom)
      if (coachIdx > 0) {
        doc.rect(M + coachIdx * step, y0, doc.CW - coachIdx * step, 76, C.greenTint)
        doc.text(`Con ${COACH_SHORT}`, M + coachIdx * step + 3, y0 + 8, { size: 6.5, bold: true, color: C.green })
      }
      per.forEach((x, i) => {
        const bx = M + i * step + step * 0.18, bw = step * 0.64, base = y0 + 76
        const hs = (x.s / maxPer) * 62, hu = (x.u / maxPer) * 62
        if (hs) doc.rect(bx, base - hs, bw, hs, C.greenBar, 1)
        if (hu) doc.rect(bx, base - hs - hu - 1, bw, hu, C.grayChip, 1)
      })
      doc.text(fmtDate(d.games[0]?.match.date), M, y0 + 88, { size: 6.5, color: C.faint })
      doc.text(fmtDate(d.games[d.games.length - 1]?.match.date), M + doc.CW, y0 + 88, { size: 6.5, color: C.faint, align: 'right' })
      doc.text(`SURGIDOS DE RIVER EN OTROS CLUBES (${away.length})`, M, y0 + 110, { size: 6.6, bold: true, color: C.green })
      lines.forEach((l, i) => doc.text(l, M, y0 + 124 + i * 11, { size: 7.6, color: C.text }))
    },
  }
}

/* ------------------------------------------------------------ el DT */

function coachBlock(c: Ctx): Block | null {
  const coach = c.d.club.coach
  if (!coach) return null
  const spells = coach.career.filter(s => s.role === 'player' && !s.national).map(s => {
    const rows = s.seasons as PlayerSeason[]
    return { ...s, apps: rows.reduce((a, r) => a + r[2], 0), goals: rows.reduce((a, r) => a + r[4], 0), intl: rows.filter(r => /libertadores|sudamericana|recopa/i.test(r[1])).reduce((a, r) => a + r[2], 0) }
  }).sort((a, b) => (a.from ?? '').localeCompare(b.from ?? ''))
  const apps = spells.reduce((a, s) => a + s.apps, 0), goals = spells.reduce((a, s) => a + s.goals, 0), intl = spells.reduce((a, s) => a + s.intl, 0)
  const records = coachRecords(coach, null)
  const bio = `Nació el ${longDate(coach.dob)}${coach.birthPlace ? ` en ${coach.birthPlace}` : ''} (${ageOn(coach.dob) ?? '—'} años). Como jugador pasó por ${new Set(spells.map(s => s.team)).size} clubes: ${apps} partidos oficiales y ${goals} goles según Opta. Dirige a River desde el ${longDate(coach.joined)}.`
  const y0s = spells.map(s => Number((s.from ?? '2000').slice(0, 4))), y1s = spells.map(s => Number((s.to ?? s.from ?? '2020').slice(0, 4)) + 1)
  const yMin = Math.min(...y0s), yMax = Math.max(...y1s)
  const head = heading(`${COACH_NAME}: su carrera`, undefined, c.doc)
  const bioLines = c.doc.wrap(bio, c.doc.CW, 9.5)
  const perYear = new Map<number, number>()
  for (const s of spells) for (const r of s.seasons as PlayerSeason[]) perYear.set(seasonYear(r[0]), (perYear.get(seasonYear(r[0])) ?? 0) + (isCup(r[1]) ? 0 : r[2]))
  return {
    h: head.top + bioLines.length * 13 + 12 + 58 + 18 + 16 + records.length * 16 + 26 + spells.length * 16 + 14,
    draw: (doc, y) => {
      head.draw(y)
      let yy = y + head.top
      bioLines.forEach((l, i) => doc.text(l, M, yy + 10 + i * 13, { size: 9.5, color: C.text }))
      yy += bioLines.length * 13 + 12
      const tiles: Array<[string, string]> = [[String(apps), 'Partidos como jugador'], [String(goals), 'Goles'], [String(intl), 'Partidos de copas internacionales'], [`${yMin}-${yMax - 1}`, 'Años de carrera']]
      const gap = 10, tw = (doc.CW - gap * 3) / 4
      tiles.forEach(([v, l], i) => {
        doc.rect(M + i * (tw + gap), yy, tw, 50, C.tile, 6)
        doc.text(v, M + i * (tw + gap) + tw / 2, yy + 24, { size: 16, bold: true, align: 'center' })
        doc.text(l.toUpperCase(), M + i * (tw + gap) + tw / 2, yy + 39, { size: 6.3, bold: true, color: C.muted, align: 'center' })
      })
      yy += 58 + 18
      doc.text('COMO ENTRENADOR', M, yy, { size: 6.6, bold: true, color: C.green })
      yy += 6
      const cols: Col[] = [{ title: 'Club', w: 140 }, { title: 'Torneo', w: doc.CW - 140 - 80 * 5 }, ...['Partidos', 'Ganados', 'Empatados', 'Perdidos', 'Efectividad'].map(t => ({ title: t, w: 80, align: 'right' as const }))]
      drawHead(doc, cols, yy)
      yy += HEAD_H
      for (const r of records) {
        drawCells(doc, cols, [r.team, `${r.competition} ${r.season}`, String(r.played), String(r.won), String(r.drawn), String(r.lost), `${r.efficiency}%`], yy - 3, { size: 8, bold: [0, 6], colors: [undefined, undefined, undefined, undefined, undefined, undefined, C.green] })
        yy += 16
      }
      yy += 12
      doc.text('COMO JUGADOR (CADA BARRA ES SU PASO POR UN CLUB)', M, yy, { size: 6.6, bold: true, color: C.green })
      yy += 8
      const lx = M + 110, lw = doc.CW - 110 - 90
      const pos = (iso: string | null, fb: number) => ((iso ? Number(iso.slice(0, 4)) + (Number(iso.slice(5, 7)) - 1) / 12 : fb) - yMin) / (yMax - yMin)
      for (const s of spells) {
        doc.text(doc.fit(s.team, 104, 8.2, true), M, yy + 9, { size: 8.2, bold: true })
        doc.rect(lx, yy + 3, lw, 8, C.tile, 3)
        const a = pos(s.from, yMin), b = pos(s.to, yMax)
        doc.rect(lx + lw * a, yy + 3, Math.max(3, lw * (b - a)), 8, C.greenBar, 3)
        doc.text(s.apps ? `${s.apps} PJ · ${s.goals} G` : 'sin datos', M + doc.CW, yy + 9, { size: 7.6, color: C.muted, align: 'right' })
        yy += 16
      }
      doc.text(String(yMin), lx, yy + 6, { size: 6.5, color: C.faint })
      doc.text(String(yMax), lx + lw, yy + 6, { size: 6.5, color: C.faint, align: 'right' })
      dashed(doc, lx, yy, lx + lw, yy, C.line, 0.4, [1, 2])
    },
  }
}

/* ------------------------------------------------------------ armado */

function sectionHead(title: string): Block {
  return {
    h: 28,
    draw: (d, y) => {
      d.text(title.toUpperCase(), M, y + 16, { size: 8.5, bold: true, color: C.green })
      d.line(M + d.width(title.toUpperCase(), 8.5, true) + 8, y + 13, M + d.CW, y + 13, C.line, 0.6)
    },
  }
}

const COVER_H = 92

function drawCover(c: Ctx, y: number) {
  const { doc, d } = c
  let x = M
  if (c.photoDataUrl) {
    try {
      circle(doc, M + 32, y + 36, 33, C.greenTint)
      doc.pdf.addImage(c.photoDataUrl, 'PNG', M + 4, y + 8, 56, 56)
      x = M + 78
    } catch { /* sin foto */ }
  }
  doc.text(COACH_NAME, x, y + 30, { size: 24, bold: true })
  doc.text(`${d.team.name} · ${d.league.meta.competition} ${d.league.meta.season}`, x, y + 48, { size: 11, color: C.text })
  const nextTxt = d.next ? `Próximo partido: ${d.next.home === TEAM_ID ? 'vs' : 'visita a'} ${shortOf(c, d.next.home === TEAM_ID ? d.next.away : d.next.home)}, ${kickoff(d.next)}` : ''
  doc.text([`Datos de Opta (Stats Perform) al ${longDate(d.league.meta.updatedAt)}`, nextTxt].filter(Boolean).join('   ·   '), x, y + 64, { size: 8.5, color: C.muted })
  doc.rect(M + doc.CW - 72, y + 14, 72, 18, C.ink, 9)
  doc.text('TEST OPTA', M + doc.CW - 36, y + 26, { size: 8, bold: true, color: C.white, align: 'center' })
  doc.line(M, y + COVER_H - 10, M + doc.CW, y + COVER_H - 10)
}

export async function buildCoachOptaPdf(input: CoachPdfInput): Promise<JsPdf> {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4', compress: true })
  pdf.setProperties({ title: `${input.d.team.name} - ${COACH_NAME} - Test Opta`, author: 'Doble G Sports Group', creator: 'Doble G Sports Group' })
  let logo: { url: string; w: number; h: number } | undefined
  if (input.logoDataUrl) {
    try {
      const p = pdf.getImageProperties(input.logoDataUrl)
      if (p.width > 0 && p.height > 0) logo = { url: input.logoDataUrl, h: 24, w: 24 * (p.width / p.height) }
    } catch { logo = undefined }
  }
  const doc = new Doc(pdf, `${input.d.team.name} · DT ${COACH_NAME} · Test Opta`, logo)
  const c: Ctx = { ...input, doc }
  const want = new Set(input.sections)
  const opp = shortOf(c, input.oppId)
  const pool = input.d.allTeams('torneo')

  const groups: { title: string; blocks: (Block | null)[] }[] = [
    {
      title: 'Panorama',
      blocks: [
        want.has('situacion') ? situationBlock(c) : null,
        want.has('claves') ? factsBlock(doc, 'Lo que define a River', `Lo más marcado de su juego en el Clausura, comparado con los ${pool.size} equipos de la liga.`, teamFacts(TEAM_ID, pool, RIVER_FACT_WORDS), 'green') : null,
        want.has('estilo') ? styleBlock(doc, 'Cómo juega River', 'Cada línea va de un estilo al opuesto; el punto es River y la rayita del medio, el promedio de la liga.', readStyle(TEAM_ID, pool), 'green', lanes(input.d.gamesOf(TEAM_ID, 'torneo'))) : null,
        want.has('forma') ? formBlock(c) : null,
        ...(want.has('tabla') ? pairColumns(doc, [zoneTableCol(c), strengthsCol(c, TEAM_ID, 'River en números', 'River')]) : []),
        want.has('datos') ? allDataBlock(c) : null,
      ],
    },
    {
      title: `${input.d.next && [input.d.next.home, input.d.next.away].includes(input.oppId) ? 'Próximo rival' : 'Rival analizado'}: ${opp}`,
      blocks: [
        want.has('rivalClaves') ? factsBlock(doc, `Lo que hay que saber de ${opp}`, `Lo más marcado de su juego en el Clausura, comparado con los ${pool.size} equipos de la liga.`, teamFacts(input.oppId, pool, RIVAL_FACT_WORDS), 'blue') : null,
        want.has('rivalEstilo') ? styleBlock(doc, `Cómo juega ${opp}`, `Cada línea va de un estilo al opuesto; el punto es ${opp} y la rayita del medio, el promedio de la liga.`, readStyle(input.oppId, pool), 'blue') : null,
        want.has('rivalCancha') ? rivalShape(c) : null,
        ...(want.has('rivalRemates') ? pairColumns(doc, [rivalShotsCol(c), strengthsCol(c, input.oppId, `Fortalezas y debilidades de ${opp}`, opp)]) : []),
        ...(want.has('rivalJugadores') ? pairColumns(doc, [rivalPlayersCol(c), h2hCol(c)]) : []),
        want.has('rivalCaraACara') ? faceToFaceBlock(c) : null,
      ],
    },
    {
      title: `Con ${COACH_SHORT}`,
      blocks: [
        want.has('cicloResumen') ? cycleRecordBlock(c) : null,
        want.has('cicloCambios') ? cycleChangesBlock(c) : null,
        ...(want.has('cicloEquipo') ? pairColumns(doc, [cycleShapeCol(c), cyclePlacesCol(c)]) : []),
      ],
    },
    {
      title: 'Partido a partido',
      blocks: [
        want.has('evolucion') ? evolutionBlock(c) : null,
        ...(want.has('partidos') ? matchesBlocks(c) : []),
      ],
    },
    {
      title: 'River vs la liga',
      blocks: [
        want.has('ligaRanking') ? leagueRankBlock(c) : null,
        ...(want.has('ligaDispersion') ? pairColumns(doc, scatterCols(c)) : []),
      ],
    },
    {
      title: 'Plantel y surgidos del club',
      blocks: [
        want.has('plantelMinutos') ? minutesBlock(c) : null,
        want.has('plantelSurgidos') ? homegrownBlock(c) : null,
      ],
    },
    { title: 'El DT', blocks: [want.has('dt') ? coachBlock(c) : null] },
  ]

  // El título de cada sección va pegado a su primer bloque (nunca queda solo al pie de una hoja).
  const blocks: Block[] = groups.flatMap(g => {
    const list = g.blocks.filter((b): b is Block => b !== null)
    if (!list.length) return []
    const head = sectionHead(g.title)
    return [{ h: head.h + list[0].h, draw: (d: Doc, y: number) => { head.draw(d, y); list[0].draw(d, y + head.h) } }, ...list.slice(1)]
  })

  doc.header()
  drawCover(c, HEADER_BOTTOM - 10)
  let y = HEADER_BOTTOM - 10 + COVER_H
  const bottom = HEADER_BOTTOM + doc.contentH
  let i = 0
  while (i < blocks.length && y + blocks[i].h <= bottom) {
    blocks[i].draw(doc, y)
    y += blocks[i].h + GAP
    i++
  }
  const rest = blocks.slice(i)
  for (const page of planPages(rest.map(b => b.h), doc.contentH, GAP)) {
    doc.newPage()
    let py = HEADER_BOTTOM
    for (const k of page) {
      rest[k].draw(doc, py)
      py += rest[k].h + GAP
    }
  }

  const total = pdf.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    pdf.setPage(p)
    const H = pdf.internal.pageSize.getHeight(), W = pdf.internal.pageSize.getWidth()
    doc.line(M, H - 30, W - M, H - 30)
    doc.text('Doble G Sports Group', M, H - 18, { size: 7, color: C.faint })
    doc.text(`Página ${p} de ${total}`, W - M, H - 18, { size: 7, color: C.faint, align: 'right' })
  }
  return pdf
}

export function coachPdfFileName(today: string, opp: string) {
  const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `test-opta_river_ponzio_vs-${slug(opp)}_${today}.pdf`
}
