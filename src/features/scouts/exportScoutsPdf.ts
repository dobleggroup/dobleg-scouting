// PDF de la página Scouts: uno de todos (comparación + ranking + una hoja por scout) o uno
// de un solo scout. Dibujado con jsPDF (texto vectorial), A4 vertical.
import { C, Doc, M, drawCells, drawHead, ROW_H, HEAD_H, type Col } from '@/features/coaches/wyscoutSquad/pdfDoc'
import {
  addDays,
  formatDay,
  lastActiveLabel,
  meetingTitle,
  todayAR,
  type ScoutSummary,
} from '@/services/scoutsPanelService'
import { CARD_METRICS, initials, METRIC_BY_KEY, METRICS, rank } from './metrics'
import { fullTeamName } from '@/utils/teamNames'

const TOP = 72
const BOTTOM_GAP = 48

/** Foto recortada en círculo (PNG). Si no se puede leer, undefined e iniciales. */
async function circlePhoto(url: string | null): Promise<string | undefined> {
  if (!url) return undefined
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.crossOrigin = 'anonymous'
      i.referrerPolicy = 'no-referrer'
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    const size = 200
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
    ctx.clip()
    const scale = Math.max(size / img.width, size / img.height)
    const w = img.width * scale
    const h = img.height * scale
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
    return canvas.toDataURL('image/png')
  } catch {
    return undefined
  }
}

class Writer {
  y = TOP
  constructor(public d: Doc) {}
  get bottom() { return this.d.H - BOTTOM_GAP }
  ensure(h: number) {
    if (this.y + h > this.bottom) { this.d.newPage('portrait'); this.y = TOP }
  }
  page() { this.d.newPage('portrait'); this.y = TOP }
}

function avatar(d: Doc, photo: string | undefined, name: string, x: number, y: number, size: number) {
  if (photo) {
    d.pdf.addImage(photo, 'PNG', x, y, size, size)
    return
  }
  d.pdf.setFillColor(C.greenTint)
  d.pdf.circle(x + size / 2, y + size / 2, size / 2, 'F')
  d.text(initials(name), x + size / 2, y + size / 2 + size * 0.13, { size: size * 0.36, bold: true, color: C.green, align: 'center' })
}

function sectionTitle(w: Writer, title: string) {
  w.ensure(40)
  w.d.text(title, M, w.y + 12, { size: 12, bold: true })
  w.y += 24
}

function lines(w: Writer, rows: { left: string; mid?: string; right?: string }[], empty: string, max = 15) {
  const d = w.d
  if (rows.length === 0) {
    w.ensure(16)
    d.text(empty, M, w.y + 10, { size: 9, color: C.muted })
    w.y += 22
    return
  }
  for (const r of rows.slice(0, max)) {
    w.ensure(17)
    d.text(r.left, M, w.y + 11, { size: 8.6, color: C.muted })
    d.text(d.fit(r.mid ?? '', d.CW - 120, 9.2, true), M + 62, w.y + 11, { size: 9.2, bold: true })
    if (r.right) d.text(r.right, d.W - M, w.y + 11, { size: 9, color: C.text, align: 'right' })
    d.line(M, w.y + 16, d.W - M, w.y + 16, C.line, 0.4)
    w.y += 17
  }
  if (rows.length > max) {
    w.ensure(16)
    d.text(`y ${rows.length - max} más`, M + 62, w.y + 11, { size: 8.4, color: C.muted })
    w.y += 17
  }
  w.y += 10
}

function comparison(w: Writer, scouts: ScoutSummary[]) {
  const d = w.d
  const keys = CARD_METRICS
  const metricW = 38
  const cols: Col[] = [
    { title: 'Scout', w: d.CW - 70 - metricW * keys.length },
    { title: 'Última vez', w: 70 },
    ...keys.map(k => ({ title: METRIC_BY_KEY[k].short, w: metricW, align: 'center' as const })),
  ]
  const best = Object.fromEntries(keys.map(k => [k, Math.max(0, ...scouts.map(METRIC_BY_KEY[k].value))]))
  w.ensure(HEAD_H + ROW_H * scouts.length + 10)
  drawHead(d, cols, w.y)
  w.y += HEAD_H + 2
  for (const s of rank(scouts, 'days').map(x => x.scout)) {
    const vals = keys.map(k => METRIC_BY_KEY[k].value(s))
    const colors = [undefined, undefined, ...vals.map((v, i) => (v > 0 && v === best[keys[i]] ? C.green : v ? undefined : C.faint))]
    drawCells(d, cols, [s.name, lastActiveLabel(s.last_active), ...vals.map(String)], w.y, {
      bold: [0, ...vals.map((v, i) => (v > 0 && v === best[keys[i]] ? i + 2 : -1)).filter(i => i >= 0)],
      colors,
    })
    d.line(M, w.y + ROW_H, d.W - M, w.y + ROW_H, C.line, 0.4)
    w.y += ROW_H
  }
  w.y += 8
  d.text('En verde, el mejor de cada columna.', M, w.y + 8, { size: 7.6, color: C.muted })
  w.y += 24
}

function rankings(w: Writer, scouts: ScoutSummary[]) {
  const d = w.d
  const perRow = 3
  const gap = 10
  const boxW = (d.CW - gap * (perRow - 1)) / perRow
  const boxH = 26 + scouts.length * 13 + 8
  for (let i = 0; i < METRICS.length; i += perRow) {
    w.ensure(boxH + gap)
    METRICS.slice(i, i + perRow).forEach((m, j) => {
      const x = M + j * (boxW + gap)
      d.rect(x, w.y, boxW, boxH, C.tile, 6)
      d.text(m.label.toUpperCase(), x + 10, w.y + 16, { size: 6.8, bold: true, color: C.muted })
      rank(scouts, m.key).forEach((r, k) => {
        const yy = w.y + 32 + k * 13
        const first = r.pos === 1 && r.value > 0
        d.text(`${r.pos}°`, x + 10, yy, { size: 8.4, bold: true, color: first ? C.green : C.muted })
        d.text(d.fit(r.scout.name, boxW - 64, 8.4, first), x + 28, yy, { size: 8.4, bold: first, color: first ? C.ink : C.text })
        d.text(String(r.value), x + boxW - 10, yy, { size: 8.6, bold: true, color: first ? C.green : C.ink, align: 'right' })
      })
    })
    w.y += boxH + gap
  }
  w.y += 6
}

function scoutSection(w: Writer, s: ScoutSummary, photo: string | undefined) {
  const d = w.d
  // Cabecera con foto
  avatar(d, photo, s.name, M, w.y, 56)
  d.text(s.name, M + 70, w.y + 22, { size: 18, bold: true })
  d.text(`Última vez que entró: ${lastActiveLabel(s.last_active)}`, M + 70, w.y + 40, { size: 10, color: C.text })
  w.y += 72

  // Últimos 30 días
  const today = todayAR()
  const set = new Set(s.recent_days)
  const cellGap = 2
  const cellW = (d.CW - cellGap * 29) / 30
  for (let i = 0; i < 30; i++) {
    const day = addDays(today, i - 29)
    d.rect(M + i * (cellW + cellGap), w.y, cellW, 12, set.has(day) ? C.greenBar : C.line, 2)
  }
  d.text('Hace 30 días', M, w.y + 24, { size: 7.4, color: C.muted })
  d.text(`Entró ${set.size} de los últimos 30 días`, d.W / 2, w.y + 24, { size: 7.6, bold: true, color: C.text, align: 'center' })
  d.text('Hoy', d.W - M, w.y + 24, { size: 7.4, color: C.muted, align: 'right' })
  w.y += 38

  // Números
  const perRow = 5
  const gap = 6
  const tileW = (d.CW - gap * (perRow - 1)) / perRow
  for (let i = 0; i < METRICS.length; i += perRow) {
    METRICS.slice(i, i + perRow).forEach((m, j) => {
      const x = M + j * (tileW + gap)
      const v = m.value(s)
      d.rect(x, w.y, tileW, 44, C.tile, 6)
      d.text(String(v), x + tileW / 2, w.y + 21, { size: 15, bold: true, color: v ? C.ink : C.faint, align: 'center' })
      const label = d.wrap(m.label, tileW - 8, 6.6)
      label.slice(0, 2).forEach((l, k) => d.text(l, x + tileW / 2, w.y + 32 + k * 7.5, { size: 6.6, color: C.muted, align: 'center' }))
    })
    w.y += 44 + gap
  }
  w.y += 14

  sectionTitle(w, `Búsquedas de clubes que cargó (${s.searches})`)
  lines(w, s.search_list.map(b => ({ left: formatDay(b.day), mid: fullTeamName(b.club), right: b.positions.length ? `Busca: ${b.positions.join(', ')}` : '' })),
    'No cargó búsquedas de clubes en este período.')

  sectionTitle(w, `Comentarios sobre jugadores (${s.comments})`)
  lines(w, s.comments_by_player.map(c => ({
    left: formatDay(c.last.slice(0, 10)),
    mid: c.player,
    right: [
      c.comments ? `${c.comments} ${c.comments === 1 ? 'comentario' : 'comentarios'}` : null,
      c.negotiation_notes ? `${c.negotiation_notes} en negociaciones` : null,
    ].filter(Boolean).join(' · '),
  })), 'No escribió comentarios sobre jugadores en este período.')

  const modeLabel = (m: string | null) => (m === 'presencial' ? 'En cancha' : m === 'tv' ? 'Por TV' : '')
  sectionTitle(w, `Partidos (${s.match_list.length})`)
  lines(w, s.match_list.map(m => ({
    left: formatDay(m.day),
    mid: [m.label || 'Partido', m.players ? `(vio a ${m.players})` : null].filter(Boolean).join(' '),
    right: [modeLabel(m.mode), m.place].filter(Boolean).join(' · '),
  })), 'Sin partidos en este período.')

  const meetings = s.activities.filter(a => a.kind === 'reunion')
  sectionTitle(w, `Reuniones (${s.meetings})`)
  lines(w, meetings.map(a => ({
    left: formatDay(a.day),
    mid: [meetingTitle(a), a.title && a.player ? `(sobre ${a.player})` : null, a.review_status === 'pendiente' ? '- falta aceptar' : null].filter(Boolean).join(' '),
    right: [a.mode === 'online' ? 'Online' : a.mode === 'presencial' ? 'Presencial' : '', a.place].filter(Boolean).join(' · '),
  })), 'Sin reuniones cargadas.')

  sectionTitle(w, `Viajes (${s.trip_list.length})`)
  lines(w, s.trip_list.map(t => ({
    left: formatDay(t.day),
    mid: t.place,
    right: [t.end_day && t.end_day !== t.day ? `hasta ${formatDay(t.end_day)}` : null, t.detail].filter(Boolean).join(' · '),
  })), 'Sin viajes en este período.')

  sectionTitle(w, `Reportes (${s.reports})`)
  lines(w, s.report_list.map(r => ({ left: formatDay(r.day), mid: r.player, right: [r.team, r.score != null ? `Nota ${r.score}` : null].filter(Boolean).join(' · ') })), 'Sin reportes en este período.')
}

function slug(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export async function exportScoutsPdf(scouts: ScoutSummary[], period: string, only: ScoutSummary | null): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true })
  const title = only ? `Scout ${only.name} · ${period}` : `Actividad de los scouts · ${period}`
  pdf.setProperties({ title, author: 'Doble G Sports Group', creator: 'Doble G Sports Group' })
  const d = new Doc(pdf, title)
  d.header()
  const w = new Writer(d)

  const list = only ? [only] : scouts
  const photos = await Promise.all(list.map(s => circlePhoto(s.photo_url)))

  if (!only) {
    d.text('Actividad de los scouts', M, w.y + 18, { size: 20, bold: true })
    d.text(`${period} · generado el ${formatDay(todayAR(), true)}`, M, w.y + 36, { size: 10, color: C.muted })
    w.y += 56
    sectionTitle(w, 'Comparación')
    comparison(w, scouts)
    sectionTitle(w, 'Ranking')
    rankings(w, scouts)
  }

  list.forEach((s, i) => {
    if (!only || i > 0) w.page()
    scoutSection(w, s, photos[i])
  })

  const total = pdf.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i)
    d.line(M, d.H - 30, d.W - M, d.H - 30)
    d.text('Doble G Sports Group', M, d.H - 18, { size: 7, color: C.faint })
    d.text(`Página ${i} de ${total}`, d.W - M, d.H - 18, { size: 7, color: C.faint, align: 'right' })
  }

  pdf.save(only ? `scout_${slug(only.name)}_${todayAR()}.pdf` : `scouts_${todayAR()}.pdf`)
}
