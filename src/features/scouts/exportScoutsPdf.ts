// PDF de la página Scouts: el de todos (resumen, comparación y ranking + el informe de cada
// scout) o el de un solo scout. Cada informe individual: cabecera con foto y nombre, números,
// lo que cargó, el calendario del mes y el día por día. Todas las hojas de un scout llevan
// su nombre arriba, para que siempre se sepa de quién es. jsPDF (texto vectorial), A4.
import { C, clean, Doc, M } from '@/features/coaches/wyscoutSquad/pdfDoc'
import {
  addDays,
  formatDay,
  lastActiveDays,
  lastActiveLabel,
  meetingTitle,
  todayAR,
  type ScoutSummary,
} from '@/services/scoutsPanelService'
import { initials, METRIC_BY_KEY, METRICS, rank, type MetricKey } from './metrics'
import { fullTeamName } from '@/utils/teamNames'
import {
  countKinds,
  fetchScoutCalendar,
  groupByDay,
  ITEM_KINDS,
  KIND_META,
  monthEnd,
  monthGrid,
  monthLabel,
  monthStart,
  WEEKDAY_HEAD,
  weekdayShort,
  type CalendarDay,
  type CalendarEvent,
} from './calendar'

const TOP = 70
const BOTTOM_GAP = 48
const DARK = '#14532D'

/** Color mezclado con blanco (a = cuánto del color queda). */
function tint(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c: number) => Math.round(c * a + 255 * (1 - a)).toString(16).padStart(2, '0')
  return `#${mix(n >> 16)}${mix((n >> 8) & 255)}${mix(n & 255)}`
}

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
    const size = 220
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
    ctx.fillStyle = '#E8F3EC'
    ctx.fill()
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

interface Owner { name: string; photo: string | undefined }

class Writer {
  y = TOP
  /** De quién son las hojas que se están escribiendo (va arriba de cada hoja nueva). */
  owner: Owner | null = null
  constructor(public d: Doc) {}
  get bottom() { return this.d.H - BOTTOM_GAP }
  ensure(h: number) {
    if (this.y + h > this.bottom) this.page()
  }
  page() {
    this.d.newPage('portrait')
    this.y = TOP
    if (this.owner) ownerStrip(this, this.owner)
  }
}

function avatar(d: Doc, photo: string | undefined, name: string, x: number, y: number, size: number, onDark = false) {
  if (photo) {
    d.pdf.addImage(photo, 'PNG', x, y, size, size)
    return
  }
  d.pdf.setFillColor(onDark ? '#FFFFFF' : C.greenTint)
  d.pdf.circle(x + size / 2, y + size / 2, size / 2, 'F')
  d.text(initials(name), x + size / 2, y + size / 2 + size * 0.13, { size: size * 0.36, bold: true, color: C.green, align: 'center' })
}

function dot(d: Doc, x: number, y: number, color: string, r = 2.2) {
  d.pdf.setFillColor(color)
  d.pdf.circle(x, y, r, 'F')
}

function recencyColor(ts: string | null): string {
  const n = lastActiveDays(ts)
  return n <= 2 ? '#15803D' : n <= 7 ? '#B45309' : '#B91C1C'
}

/** Cabecera grande del informe de un scout (banda verde oscura con foto y nombre). */
function ownerBand(d: Doc, y: number, o: Owner, subtitle: string, right?: { label: string; value: string }, compact = false): number {
  const h = compact ? 54 : 74
  const pic = compact ? 38 : 52
  d.rect(M, y, d.CW, h, DARK, 10)
  avatar(d, o.photo, o.name, M + 12, y + (h - pic) / 2, pic, true)
  const tx = M + 24 + pic
  const rightW = right ? Math.max(d.width(right.label.toUpperCase(), 7, true), d.width(right.value, 12, true)) + 40 : 16
  const nameSize = compact ? 15 : 19
  d.text(d.fit(o.name, d.W - M - rightW - tx, nameSize, true), tx, y + h / 2 - (compact ? 1 : 4), { size: nameSize, bold: true, color: C.white })
  d.text(d.fit(subtitle, d.W - M - rightW - tx, 9.5), tx, y + h / 2 + (compact ? 13 : 14), { size: compact ? 9 : 9.5, color: '#BBF7D0' })
  if (right) {
    d.text(right.label.toUpperCase(), d.W - M - 16, y + h / 2 - 5, { size: 7, bold: true, color: '#86EFAC', align: 'right' })
    d.text(right.value, d.W - M - 16, y + h / 2 + 12, { size: 12, bold: true, color: C.white, align: 'right' })
  }
  return h
}

/** Recordatorio chico de quién es el informe, arriba de cada hoja que sigue. */
function ownerStrip(w: Writer, o: Owner) {
  const d = w.d
  avatar(d, o.photo, o.name, M, w.y, 20)
  d.text(o.name, M + 27, w.y + 14, { size: 10.5, bold: true })
  d.text('Informe individual · continúa', d.W - M, w.y + 14, { size: 8, color: C.muted, align: 'right' })
  d.line(M, w.y + 28, d.W - M, w.y + 28, C.line, 0.6)
  w.y += 40
}

function sectionTitle(w: Writer, title: string, count?: number) {
  w.ensure(46)
  const d = w.d
  d.rect(M, w.y + 2, 3, 13, C.greenBar, 1)
  d.text(title, M + 10, w.y + 13, { size: 12, bold: true })
  if (count !== undefined) d.text(String(count), M + 14 + d.width(title, 12, true), w.y + 13, { size: 12, color: C.muted })
  w.y += 24
}

/** Renglones: fecha · texto principal · detalle (a la derecha si entra, si no abajo). */
function lines(w: Writer, rows: { left: string; mid: string; right?: string }[], empty: string, max = 15) {
  const d = w.d
  if (rows.length === 0) {
    w.ensure(18)
    d.text(empty, M + 10, w.y + 10, { size: 9, color: C.muted })
    w.y += 24
    return
  }
  const xMid = M + 62
  const avail = d.W - M - xMid
  for (const r of rows.slice(0, max)) {
    const midW = Math.min(d.width(r.mid, 9.2, true), avail * 0.55)
    const rightW = r.right ? d.width(r.right, 8.6) : 0
    const inline = !r.right || midW + 14 + rightW <= avail
    const sub = !inline && r.right ? d.wrap(r.right, avail, 8.4).slice(0, 2) : []
    const h = 18 + sub.length * 10
    w.ensure(h)
    d.text(r.left, M + 10, w.y + 12, { size: 8.6, color: C.muted })
    d.text(d.fit(r.mid, inline ? avail - rightW - 14 : avail, 9.2, true), xMid, w.y + 12, { size: 9.2, bold: true })
    if (inline && r.right) d.text(r.right, d.W - M, w.y + 12, { size: 8.6, color: C.text, align: 'right' })
    sub.forEach((l, i) => d.text(l, xMid, w.y + 23 + i * 10, { size: 8.4, color: C.text }))
    d.line(M, w.y + h - 1, d.W - M, w.y + h - 1, C.line, 0.4)
    w.y += h
  }
  if (rows.length > max) {
    w.ensure(16)
    d.text(`y ${rows.length - max} más`, xMid, w.y + 12, { size: 8.4, color: C.muted })
    w.y += 18
  }
  w.y += 12
}

// ─── Resumen de todos ────────────────────────────────────────────────────────

const TABLE_KEYS: MetricKey[] = ['days', 'tracking_now', 'added', 'reports', 'matches', 'meetings', 'trips', 'searches', 'comments']

function comparison(w: Writer, scouts: ScoutSummary[], photos: Map<string, string | undefined>) {
  const d = w.d
  const keys = TABLE_KEYS
  const metricW = 34
  const nameW = d.CW - 76 - metricW * keys.length
  const rowH = 26
  const best = Object.fromEntries(keys.map(k => [k, Math.max(0, ...scouts.map(METRIC_BY_KEY[k].value))]))
  w.ensure(30 + rowH * scouts.length + 20)
  // Encabezado
  d.rect(M, w.y, d.CW, 26, DARK, 6)
  d.text('SCOUT', M + 10, w.y + 16, { size: 7, bold: true, color: C.white })
  d.text('ÚLTIMA VEZ', M + nameW + 4, w.y + 16, { size: 7, bold: true, color: C.white })
  keys.forEach((k, i) => {
    const cx = M + nameW + 76 + metricW * i + metricW / 2
    d.text(d.fit((k === 'meetings' ? 'Reun.' : METRIC_BY_KEY[k].short).toUpperCase(), metricW - 2, 5.8, true), cx, w.y + 16, { size: 5.8, bold: true, color: C.white, align: 'center' })
  })
  w.y += 30
  rank(scouts, 'days').map(x => x.scout).forEach((s, r) => {
    if (r % 2 === 1) d.rect(M, w.y, d.CW, rowH, C.tile, 4)
    avatar(d, photos.get(s.user_id), s.name, M + 6, w.y + 4, 18)
    d.text(d.fit(s.name, nameW - 36, 9.2, true), M + 30, w.y + 16.5, { size: 9.2, bold: true })
    d.text(lastActiveLabel(s.last_active), M + nameW + 4, w.y + 16.5, { size: 8.4, color: recencyColor(s.last_active) })
    keys.forEach((k, i) => {
      const v = METRIC_BY_KEY[k].value(s)
      const top = v > 0 && v === best[k]
      const cx = M + nameW + 76 + metricW * i + metricW / 2
      if (top) d.rect(cx - 13, w.y + 5, 26, 16, C.greenTint, 8)
      d.text(String(v), cx, w.y + 16.5, { size: 9.4, bold: top || v > 0, color: top ? C.green : v ? C.ink : C.faint, align: 'center' })
    })
    w.y += rowH
  })
  w.y += 8
  d.rect(M, w.y + 2, 18, 9, C.greenTint, 4.5)
  d.text('El mejor de cada columna', M + 24, w.y + 9.5, { size: 7.6, color: C.muted })
  w.y += 26
}

/** Solo los rubros en los que alguien hizo algo, y solo quienes lo hicieron. */
function rankings(w: Writer, scouts: ScoutSummary[]) {
  const d = w.d
  const perRow = 3
  const gap = 10
  const boxW = (d.CW - gap * (perRow - 1)) / perRow
  const boxes = METRICS
    .map(m => ({ m, rows: rank(scouts, m.key).filter(r => r.value > 0).slice(0, 5) }))
    .filter(b => b.rows.length > 0)
  for (let i = 0; i < boxes.length; i += perRow) {
    const row = boxes.slice(i, i + perRow)
    const boxH = 30 + Math.max(...row.map(b => b.rows.length)) * 14 + 6
    w.ensure(boxH + gap)
    row.forEach(({ m, rows }, j) => {
      const x = M + j * (boxW + gap)
      d.rect(x, w.y, boxW, boxH, C.tile, 8)
      d.text(m.label.toUpperCase(), x + 12, w.y + 18, { size: 7, bold: true, color: C.muted })
      rows.forEach((r, k) => {
        const yy = w.y + 35 + k * 14
        const first = r.pos === 1
        if (first) dot(d, x + 16, yy - 3, '#F59E0B', 5.5)
        d.text(String(r.pos), x + 16, yy, { size: 7.6, bold: true, color: first ? C.white : C.muted, align: 'center' })
        d.text(d.fit(r.scout.name, boxW - 66, 8.8, first), x + 28, yy, { size: 8.8, bold: first, color: first ? C.ink : C.text })
        d.text(String(r.value), x + boxW - 12, yy, { size: 9, bold: true, color: first ? C.green : C.ink, align: 'right' })
      })
    })
    w.y += boxH + gap
  }
  w.y += 6
}

// ─── Informe de un scout ─────────────────────────────────────────────────────

function scoutSection(w: Writer, s: ScoutSummary, o: Owner, period: string) {
  const d = w.d
  w.y += ownerBand(d, w.y, o, `Informe individual · ${period}`, { label: 'Última vez que entró', value: lastActiveLabel(s.last_active) }) + 16

  // Últimos 30 días
  const today = todayAR()
  const set = new Set(s.recent_days)
  const cellGap = 2
  const cellW = (d.CW - cellGap * 29) / 30
  d.text('Días que entró en los últimos 30', M, w.y + 9, { size: 8.6, bold: true, color: C.text })
  d.text(`${set.size} de 30`, d.W - M, w.y + 9, { size: 8.6, bold: true, color: C.green, align: 'right' })
  w.y += 16
  for (let i = 0; i < 30; i++) {
    const day = addDays(today, i - 29)
    d.rect(M + i * (cellW + cellGap), w.y, cellW, 12, set.has(day) ? C.greenBar : C.line, 2)
  }
  d.text('Hace 30 días', M, w.y + 23, { size: 7.2, color: C.muted })
  d.text('Hoy', d.W - M, w.y + 23, { size: 7.2, color: C.muted, align: 'right' })
  w.y += 36

  // Números
  const perRow = 6
  const gap = 6
  const tileW = (d.CW - gap * (perRow - 1)) / perRow
  for (let i = 0; i < METRICS.length; i += perRow) {
    METRICS.slice(i, i + perRow).forEach((m, j) => {
      const x = M + j * (tileW + gap)
      const v = m.value(s)
      d.rect(x, w.y, tileW, 46, v ? C.greenTint : C.tile, 7)
      d.text(String(v), x + tileW / 2, w.y + 22, { size: 16, bold: true, color: v ? C.green : C.faint, align: 'center' })
      d.wrap(m.label, tileW - 8, 6.8).slice(0, 2).forEach((l, k) => d.text(l, x + tileW / 2, w.y + 33 + k * 7.6, { size: 6.8, color: C.text, align: 'center' }))
    })
    w.y += 46 + gap
  }
  w.y += 16

  sectionTitle(w, 'Búsquedas de clubes que cargó', s.searches)
  lines(w, s.search_list.map(b => ({ left: formatDay(b.day), mid: fullTeamName(b.club), right: b.positions.length ? `Busca: ${b.positions.join(', ')}` : '' })),
    'No cargó búsquedas de clubes en este período.')

  sectionTitle(w, 'Comentarios sobre jugadores', s.comments)
  lines(w, s.comments_by_player.map(c => ({
    left: formatDay(c.last.slice(0, 10)),
    mid: c.player,
    right: [
      c.comments ? `${c.comments} ${c.comments === 1 ? 'comentario' : 'comentarios'}` : null,
      c.negotiation_notes ? `${c.negotiation_notes} en negociaciones` : null,
    ].filter(Boolean).join(' · '),
  })), 'No escribió comentarios sobre jugadores en este período.')

  const modeLabel = (m: string | null) => (m === 'presencial' ? 'En cancha' : m === 'tv' ? 'Por TV' : '')
  sectionTitle(w, 'Partidos', s.match_list.length)
  lines(w, s.match_list.map(m => ({
    left: formatDay(m.day),
    mid: m.label || 'Partido',
    right: [modeLabel(m.mode), m.place, m.players ? `Vio a ${m.players}` : null].filter(Boolean).join(' · '),
  })), 'Sin partidos en este período.')

  const meetings = s.activities.filter(a => a.kind === 'reunion')
  sectionTitle(w, 'Reuniones', s.meetings)
  lines(w, meetings.map(a => ({
    left: formatDay(a.day),
    mid: meetingTitle(a) + (a.review_status === 'pendiente' ? ' (falta aceptar)' : ''),
    right: [a.mode === 'online' ? 'Online' : a.mode === 'presencial' ? 'Presencial' : '', a.place, a.title && a.player ? `Sobre ${a.player}` : null].filter(Boolean).join(' · '),
  })), 'Sin reuniones cargadas.')

  sectionTitle(w, 'Viajes', s.trip_list.length)
  lines(w, s.trip_list.map(t => ({
    left: formatDay(t.day),
    mid: t.place,
    right: [t.end_day && t.end_day !== t.day ? `hasta ${formatDay(t.end_day)}` : null, t.detail].filter(Boolean).join(' · '),
  })), 'Sin viajes en este período.')

  sectionTitle(w, 'Reportes', s.reports)
  lines(w, s.report_list.map(r => ({ left: formatDay(r.day), mid: r.player, right: [r.team, r.score != null ? `Nota ${r.score}` : null].filter(Boolean).join(' · ') })), 'Sin reportes en este período.')
}

// ─── Calendario del mes ──────────────────────────────────────────────────────

/** Hoja apaisada: el mes en grilla, cada cosa con su color. */
function calendarPage(d: Doc, s: ScoutSummary, o: Owner, byDay: Map<string, CalendarDay>, month: string) {
  const today = todayAR()
  const first = monthStart(month)
  const last = monthEnd(month)
  const counts = countKinds(byDay, first, [last, today].sort()[0])

  d.newPage('landscape')
  const y0 = 62
  const bandH = ownerBand(d, y0, o, `Calendario · ${monthLabel(month)}`, { label: 'Días que entró en el mes', value: `${counts.entered} de ${counts.total}` }, true)

  // Leyenda
  let lx = M
  const ly = y0 + bandH + 16
  const legend = [
    { color: C.greenBar, text: 'Entró ese día' },
    ...ITEM_KINDS.filter(k => counts.byKind[k] > 0).map(k => ({ color: KIND_META[k].pdf, text: `${KIND_META[k].plural} (${counts.byKind[k]})` })),
  ]
  for (const l of legend) {
    dot(d, lx + 3.5, ly - 2.8, l.color, 3.2)
    d.text(l.text, lx + 11, ly, { size: 7.8, color: C.text })
    lx += d.width(l.text, 7.8) + 22
  }

  const weeks = monthGrid(month)
  const top = ly + 12
  const headH = 18
  const gap = 4
  const cellW = (d.CW - gap * 6) / 7
  const cellH = (d.H - 44 - top - headH - gap * (weeks.length - 1)) / weeks.length
  WEEKDAY_HEAD.forEach((h, i) => {
    const x = M + i * (cellW + gap)
    d.rect(x, top, cellW, 14, DARK, 4)
    d.text(h.toUpperCase(), x + cellW / 2, top + 9.8, { size: 7.4, bold: true, color: C.white, align: 'center' })
  })
  const chipH = 10
  const chipGap = 1.5
  const maxChips = Math.max(1, Math.floor((cellH - 19) / (chipH + chipGap)))
  weeks.forEach((week, r) => {
    week.forEach((day, c) => {
      const x = M + c * (cellW + gap)
      const y = top + headH + r * (cellH + gap)
      const inMonth = day.slice(0, 7) === month.slice(0, 7)
      const info = byDay.get(day)
      if (!inMonth) {
        d.pdf.setDrawColor(C.line)
        d.pdf.setLineWidth(0.6)
        d.pdf.roundedRect(x, y, cellW, cellH, 5, 5, 'S')
        d.text(String(Number(day.slice(8))), x + 7, y + 13, { size: 9, color: C.faint })
        return
      }
      d.rect(x, y, cellW, cellH, day === today ? C.greenTint : C.tile, 5)
      if (day === today) {
        d.pdf.setDrawColor(C.greenBar)
        d.pdf.setLineWidth(1)
        d.pdf.roundedRect(x, y, cellW, cellH, 5, 5, 'S')
      }
      d.text(String(Number(day.slice(8))), x + 7, y + 13, { size: 10, bold: true, color: C.ink })
      if (day <= today && info?.entered) dot(d, x + cellW - 9, y + 9.5, C.greenBar, 3)
      const items = info?.items ?? []
      const shown = items.length > maxChips ? maxChips - 1 : maxChips
      items.slice(0, shown).forEach((it, i) => {
        const cy = y + 17 + i * (chipH + chipGap)
        const color = KIND_META[it.kind].pdf
        d.rect(x + 4, cy, cellW - 8, chipH, tint(color, 0.16), 3)
        d.rect(x + 4, cy, 2.4, chipH, color, 1)
        d.text(d.fit(it.short, cellW - 18, 6.8), x + 10, cy + 7.2, { size: 6.8, color: C.ink })
      })
      if (items.length > shown) d.text(`+${items.length - shown} más`, x + 8, y + 17 + shown * (chipH + chipGap) + 7.4, { size: 6.8, bold: true, color: C.muted })
    })
  })
  void s
}

/** El mes día por día, con todo escrito (solo los días en que hizo algo). */
function dayByDay(w: Writer, byDay: Map<string, CalendarDay>, month: string) {
  const d = w.d
  const today = todayAR()
  sectionTitle(w, `Día por día · ${monthLabel(month)}`)
  let any = false
  const xText = M + 150
  for (let day = monthStart(month); day <= monthEnd(month) && day <= today; day = addDays(day, 1)) {
    const info = byDay.get(day)
    if (!info?.items.length) continue
    any = true
    const textW = d.W - M - xText
    const blocks = info.items.map(it => {
      const extra = [it.badge, it.pending ? 'falta aceptar' : null].filter(Boolean).join(' · ')
      // La frase en negrita puede ir en dos renglones (se parte a lo ancho de la negrita).
      d.font(9.2, true)
      const title = (d.pdf.splitTextToSize(clean(it.title + (extra ? `  (${extra})` : '')), textW) as string[]).slice(0, 2)
      const detail = it.detail ? d.wrap(it.detail, textW, 8.2).slice(0, 2) : []
      return { it, title, detail, h: 6 + title.length * 11 + detail.length * 10 }
    })
    const firstH = 20 + blocks[0].h
    w.ensure(30 + firstH)
    // Día
    d.rect(M, w.y, d.CW, 20, C.tile, 5)
    const label = `${weekdayShort(day)} ${Number(day.slice(8))}`
    d.text(label.charAt(0).toUpperCase() + label.slice(1), M + 10, w.y + 13.5, { size: 10, bold: true })
    d.text(formatDay(day, true), M + 16 + d.width(label, 10, true), w.y + 13.5, { size: 8.2, color: C.muted })
    if (info.entered) { dot(d, d.W - M - 40, w.y + 10, C.greenBar, 3); d.text('Entró', d.W - M - 10, w.y + 13.5, { size: 8.2, color: C.green, align: 'right' }) }
    else d.text('No entró', d.W - M - 10, w.y + 13.5, { size: 8.2, color: C.muted, align: 'right' })
    w.y += 26
    for (const { it, title, detail, h } of blocks) {
      w.ensure(h + 2)
      const color = KIND_META[it.kind].pdf
      const tagW = 120
      d.rect(M + 10, w.y, tagW, 13, tint(color, 0.16), 3)
      d.rect(M + 10, w.y, 2.6, 13, color, 1)
      d.text(d.fit(it.tag, tagW - 14, 7.6, true), M + 17, w.y + 9.2, { size: 7.6, bold: true, color: C.text })
      title.forEach((l, i) => d.text(l, xText, w.y + 9.6 + i * 11, { size: 9.2, bold: true }))
      const dy = w.y + 9.6 + title.length * 11
      detail.forEach((l, i) => d.text(l, xText, dy + i * 10, { size: 8.2, color: C.text }))
      w.y += h + 3
    }
    w.y += 8
  }
  if (!any) {
    d.text('Sin actividad cargada en este mes.', M + 10, w.y + 10, { size: 9, color: C.muted })
    w.y += 24
  }
}

/** "Fede Pereyra - Informe 04-11-2026.pdf": prolijo para mandar por WhatsApp o mail. */
export function pdfFileName(scoutName: string | null, today: string = todayAR()): string {
  const [y, m, d] = today.split('-')
  const date = `${d}-${m}-${y}`
  // Sin los signos que Windows / iPhone no aceptan en un nombre de archivo.
  const name = (scoutName ?? '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()
  return name ? `${name} - Informe ${date}.pdf` : `Informe de scouts - ${date}.pdf`
}

/**
 * En el celular se abre "Compartir" con el PDF como archivo (así llega con su nombre a
 * WhatsApp, sin un link "blob:"); en la compu se descarga.
 */
async function deliver(pdf: { save: (name: string) => unknown; output: (t: 'blob') => Blob }, fileName: string, title: string) {
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  if (touch && typeof navigator !== 'undefined' && navigator.share && typeof File !== 'undefined') {
    const file = new File([pdf.output('blob')], fileName, { type: 'application/pdf' })
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title })
        return
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return // cerró el menú de compartir
      }
    }
  }
  pdf.save(fileName)
}

export async function exportScoutsPdf(scouts: ScoutSummary[], period: string, only: ScoutSummary | null, calendarMonth: string = todayAR()): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true })
  const title = only ? `Informe de ${only.name} · ${period}` : `Informe de actividad de los scouts · ${period}`
  pdf.setProperties({ title, author: 'Doble G Sports Group', creator: 'Doble G Sports Group' })
  const d = new Doc(pdf, title)
  d.header()
  const w = new Writer(d)

  const list = only ? [only] : scouts
  const grid = monthGrid(calendarMonth).flat()
  const [photoList, events] = await Promise.all([
    Promise.all(scouts.map(s => circlePhoto(s.photo_url))),
    fetchScoutCalendar(grid[0], grid[grid.length - 1], only?.user_id ?? null),
  ])
  const photos = new Map(scouts.map((s, i) => [s.user_id, photoList[i]]))
  const eventsBy = new Map<string, CalendarEvent[]>()
  for (const e of events) eventsBy.set(e.user_id, [...(eventsBy.get(e.user_id) ?? []), e])

  if (!only) {
    d.text('Informe de actividad de los scouts', M, w.y + 20, { size: 22, bold: true })
    d.text(`${period}  ·  ${scouts.length} scouts  ·  generado el ${formatDay(todayAR(), true)}`, M, w.y + 38, { size: 10, color: C.muted })
    w.y += 58
    sectionTitle(w, 'Comparación')
    comparison(w, scouts, photos)
    sectionTitle(w, 'Ranking')
    rankings(w, scouts)
  }

  list.forEach((s, i) => {
    const o: Owner = { name: s.name, photo: photos.get(s.user_id) }
    w.owner = null
    if (!only || i > 0) w.page()
    w.owner = o
    scoutSection(w, s, o, period)
    const byDay = groupByDay(eventsBy.get(s.user_id) ?? [])
    calendarPage(d, s, o, byDay, calendarMonth)
    w.page()
    dayByDay(w, byDay, calendarMonth)
    w.owner = null
  })

  const total = pdf.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i)
    d.line(M, d.H - 30, d.W - M, d.H - 30)
    d.text('Doble G Sports Group', M, d.H - 18, { size: 7, color: C.faint })
    d.text(`Página ${i} de ${total}`, d.W - M, d.H - 18, { size: 7, color: C.faint, align: 'right' })
  }

  await deliver(pdf, pdfFileName(only?.name ?? null), title)
}
