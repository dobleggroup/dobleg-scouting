/**
 * Minuta mensual en HTML para mail. Hecha con tablas y estilos en línea porque
 * Gmail/Outlook ignoran flex, grid y SVG. Mismos colores que la plataforma
 * (grises "apple", verde de marca). Tiene que pesar menos de ~100 KB: más que
 * eso Gmail lo corta con "Ver mensaje completo".
 */
import { lowerFirst } from '@/features/wyscoutPerf/metrics'
import { fmtEur, fmtDate, monthName, shiftMonth, type ActionItem, type MinutaReport, type PlayerMonth, type Quadrant } from './analyze'

export const PLATFORM_URL = 'https://dobleg-scouting.netlify.app'
export const RENDIMIENTO_URL = `${PLATFORM_URL}/rendimiento-individual`

const C = {
  bg: '#F6F6F8', card: '#FFFFFF', line: '#E2E3E8', soft: '#EEEFF2',
  ink: '#161619', muted: '#6E6E73', faint: '#86868B',
  green: '#15803D', greenBg: '#ECF7EF', red: '#DC2626', redBg: '#FDEEEE', amber: '#B45309', amberBg: '#FDF4E7',
  dark: '#111111',
}
const FONT = 'Helvetica,Arial,sans-serif'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const fmt1 = (v: number) => v.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const toneColor = (t: string) => (t === 'good' ? C.green : t === 'bad' ? C.red : C.amber)
const toneBg = (t: string) => (t === 'good' ? C.greenBg : t === 'bad' ? C.redBg : C.amberBg)

const MONTH_INITIAL = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

/** Los últimos 6 meses como puntos de color (gris = sin datos). */
function strip(p: PlayerMonth, withLetters = false) {
  const dot = (t: string | null) => (t ? toneColor(t) : C.line)
  const dots = `<div style="font:15px/1 Arial,sans-serif;letter-spacing:2px;white-space:nowrap">${p.history.map(m => `<span style="color:${dot(m.tone)}">●</span>`).join('')}</div>`
  if (!withLetters) return dots
  return `${dots}<div style="font:500 9px/1 ${FONT};color:${C.faint};letter-spacing:7.6px;white-space:nowrap;margin-top:3px">${p.history.map(m => MONTH_INITIAL[Number(m.month.slice(5, 7)) - 1]).join('')}</div>`
}

const POS: Record<string, string> = { ARQ: 'Arquero', DEF: 'Central', LAT: 'Lateral', VC: 'Volante central', MED: 'Volante', EXT: 'Extremo', DEL: 'Delantero' }

function section(eyebrow: string, title: string, body: string, intro = '') {
  return `<tr><td style="padding:28px 0 0">
<div style="font:600 11px/1 ${FONT};letter-spacing:.08em;text-transform:uppercase;color:${C.green}">${esc(eyebrow)}</div>
<div style="font:700 21px/1.25 ${FONT};color:${C.ink};margin:6px 0 ${intro ? 4 : 12}px">${esc(title)}</div>
${intro ? `<div style="font:400 14px/1.5 ${FONT};color:${C.muted};margin:0 0 12px">${intro}</div>` : ''}
${body}
</td></tr>`
}

const card = (inner: string, pad = '16px 18px', extra = '') =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:1px solid ${C.line};border-radius:16px;${extra}"><tr><td style="padding:${pad}">${inner}</td></tr></table>`

const pill = (text: string, color: string, bg: string) =>
  `<span style="display:inline-block;font:600 11px/1 ${FONT};color:${color};background:${bg};border-radius:999px;padding:5px 9px;white-space:nowrap">${esc(text)}</span>`

const classPill = (c: PlayerMonth['cls']) => (c ? pill(`Clase ${c}`, C.ink, C.soft) : '')

function button(label: string, href: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto"><tr><td style="background:${C.green};border-radius:12px">
<a href="${href}" style="display:inline-block;padding:13px 22px;font:600 15px/1 ${FONT};color:#FFFFFF;text-decoration:none">${esc(label)}</a></td></tr></table>`
}

// ─── Bloques ─────────────────────────────────────────────────────────────────

function header(r: MinutaReport) {
  return `<tr><td style="background:${C.dark};border-radius:20px;padding:26px 26px 24px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle"><img src="${PLATFORM_URL}/brand/logo-white.png" alt="Doble G" height="30" style="display:block;height:30px;border:0"></td>
<td style="text-align:right;vertical-align:middle;font:500 12px/1.3 ${FONT};color:#A1A1A6">Envío del ${esc(fmtDate(r.sendDate))}</td>
</tr></table>
<div style="font:600 12px/1 ${FONT};letter-spacing:.08em;text-transform:uppercase;color:#4ADE80;margin:26px 0 8px">Reporte Mensual · Scout Interno</div>
<div style="font:700 30px/1.15 ${FONT};color:#FFFFFF">Cómo rindieron en ${esc(monthName(r.month))}</div>
<div style="font:400 14px/1.5 ${FONT};color:#C7C7CC;margin-top:8px">Partidos, Wyscout, GPS y mercado de los ${r.players.length} jugadores de la agencia, con lo que hay que decidir este mes.</div>
</td></tr>`
}

function summary(r: MinutaReport) {
  const items = r.summary.map(s => `<tr><td style="width:18px;vertical-align:top;padding:3px 0;font:700 14px/1.5 ${FONT};color:${C.green}">•</td><td style="padding:3px 0;font:400 15px/1.5 ${FONT};color:${C.ink}">${esc(s)}</td></tr>`).join('')
  return section('En pocas palabras', 'El mes en cuatro renglones', card(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table>`))
}

function actionRow(a: ActionItem) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:1px solid ${C.line};border-left:4px solid ${toneColor(a.tone)};border-radius:12px;margin:0 0 8px"><tr><td style="padding:12px 16px">
<div style="margin:0 0 6px">${pill(a.tag, toneColor(a.tone), toneBg(a.tone))}</div>
<div style="font:600 15px/1.4 ${FONT};color:${C.ink}">${esc(a.title)}</div>
<div style="font:400 14px/1.5 ${FONT};color:${C.muted};margin-top:3px">${esc(a.text)}</div>
</td></tr></table>`
}

function actions(r: MinutaReport) {
  if (!r.actions.length) return ''
  return section('Para decidir', 'Lo que pide una decisión este mes', r.actions.map(actionRow).join(''),
    'Ordenado por importancia: primero los clase A.')
}

function kpis(r: MinutaReport) {
  const cell = (k: MinutaReport['kpis'][number]) => {
    const f = k.fmt ?? ((v: number) => v.toLocaleString('es-AR'))
    const d = k.value - k.prev
    const arrow = d > 0 ? `<span style="color:${C.green}">▲ ${f(d)}</span>` : d < 0 ? `<span style="color:${C.red}">▼ ${f(-d)}</span>` : `<span style="color:${C.faint}">= igual</span>`
    return `<td width="33%" style="padding:4px;vertical-align:top"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:1px solid ${C.line};border-radius:14px"><tr><td style="padding:14px 14px 12px">
<div style="font:500 12px/1.3 ${FONT};color:${C.muted}">${esc(k.label)}</div>
<div style="font:700 26px/1.1 ${FONT};color:${C.ink};margin:6px 0 4px">${f(k.value)}${k.hint ? `<span style="font:500 13px ${FONT};color:${C.faint}"> ${esc(k.hint)}</span>` : ''}</div>
<div style="font:600 12px/1.3 ${FONT}">${arrow}</div></td></tr></table></td>`
  }
  const rows = [r.kpis.slice(0, 3), r.kpis.slice(3, 6)].map(row => `<tr>${row.map(cell).join('')}</tr>`).join('')
  return section('La cartera en números', `${monthName(r.month).replace(/^./, c => c.toUpperCase())} contra ${monthName(shiftMonth(r.month, -1))}`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 -4px">${rows}</table>`,
    'Sólo partidos de Primera (Reserva aparte). Titular = jugó 55 minutos o más.')
}

function formList(list: PlayerMonth[], up: boolean) {
  if (!list.length) return `<div style="font:400 13px/1.5 ${FONT};color:${C.faint}">Nadie con un cambio claro.</div>`
  return list.map((p, i) => {
    const note = p.rating != null && p.baseRating != null
      ? `Nota ${fmt1(p.rating)} <span style="color:${C.faint}">(venía ${fmt1(p.baseRating)})</span>` : p.rating != null ? `Nota ${fmt1(p.rating)}` : ''
    const items = p.wy && p.wy.total >= 4 ? (up ? p.wy.better : p.wy.worse) : []
    const wy = items.length ? `Wyscout: ${up ? 'mejoró' : 'empeoró'} en ${esc(items.slice(0, 2).map(i => lowerFirst(i.metric.label)).join(' y '))}` : ''
    return `<tr><td style="padding:9px 0;border-top:${i ? `1px solid ${C.soft}` : '0'};vertical-align:top">
<div style="font:600 14px/1.3 ${FONT};color:${C.ink}">${esc(p.name)}</div>
<div style="font:400 12px/1.4 ${FONT};color:${C.muted};margin-top:2px">${esc(p.club)}</div>
<div style="font:500 12px/1.4 ${FONT};color:${C.ink};margin-top:3px">${[note, wy].filter(Boolean).join(' · ')}</div></td></tr>`
  }).join('')
}

function form(r: MinutaReport) {
  const col = (title: string, color: string, inner: string) => `<td width="50%" style="padding:4px;vertical-align:top">${card(
    `<div style="font:700 14px/1 ${FONT};color:${color};margin-bottom:6px">${title}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${inner}</table>`, '14px 16px')}</td>`
  return section('Forma del mes', 'Los que más subieron y los que más bajaron',
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 -4px"><tr>${col('▲ Subieron', C.green, formList(r.risers, true))}${col('▼ Bajaron', C.red, formList(r.fallers, false))}</tr></table>`,
    'Cada uno contra sí mismo en los 6 meses anteriores: la nota de los partidos y las métricas de Wyscout que importan en su puesto.')
}

function patterns(r: MinutaReport) {
  // Los 10 más claros: primero los que vienen mal, después los que vienen bien.
  const list = r.patterns.slice(0, 10)
  if (!list.length) return ''
  const letters = list[0].history.map(m => MONTH_INITIAL[Number(m.month.slice(5, 7)) - 1]).join('')
  const rows = list.map(p => `<tr><td style="padding:8px 0;border-top:1px solid ${C.soft}"><div style="font:600 14px/1.3 ${FONT};color:${C.ink}">${esc(p.name)}${p.cls ? ` <span style="font-weight:500;color:${C.faint};font-size:12px">· Clase ${p.cls}</span>` : ''}</div>
<div style="font:500 12px/1.4 ${FONT};color:${toneColor(p.pattern!.tone)}">${esc(p.pattern!.text)}</div></td>
<td style="padding:8px 0;border-top:1px solid ${C.soft};text-align:right;width:110px">${strip(p)}</td></tr>`).join('')
  const head = `<tr><td></td><td style="text-align:right;padding:4px 0;font:500 10px/1 Arial,sans-serif;color:${C.faint};letter-spacing:8.3px;white-space:nowrap">${letters}</td></tr>`
  return section('Tendencias', 'Lo que se repite mes a mes', card(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${head}${rows}</table>`, '6px 16px'),
    'Un mal mes puede ser casualidad; tres seguidos ya es un patrón. Cada punto es un mes (el último es el de este reporte): verde bueno, ámbar parejo, rojo flojo, gris sin datos.')
}

const QUAD: Record<Quadrant, { title: string; hint: string; tone: string }> = {
  consolidado: { title: 'Consolidados', hint: 'Juegan y rinden', tone: 'good' },
  pidePista: { title: 'Rinden pero no juegan', hint: 'Merecen más minutos', tone: 'neutral' },
  aMejorar: { title: 'Juegan pero no rinden', hint: 'Tienen lugar, falta nivel', tone: 'neutral' },
  enRiesgo: { title: 'En riesgo', hint: 'Ni juegan ni rinden', tone: 'bad' },
}

function quadrants(r: MinutaReport) {
  const cell = (q: Quadrant) => {
    const meta = QUAD[q]
    const list = r.quadrants[q]
    const names = list.length
      ? list.map(p => `<div style="font:500 13px/1.45 ${FONT};color:${C.ink}">${esc(p.name)} <span style="color:${C.faint};font-weight:400">${p.share != null ? `${Math.round(p.share * 100)}%` : ''}${p.rating != null ? ` · ${fmt1(p.rating)}` : ''}</span></div>`).join('')
      : `<div style="font:400 13px/1.45 ${FONT};color:${C.faint}">Nadie este mes</div>`
    return `<td width="50%" style="padding:4px;vertical-align:top"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${toneBg(meta.tone)};border-radius:14px"><tr><td style="padding:14px 14px 12px">
<div style="font:700 14px/1.2 ${FONT};color:${toneColor(meta.tone)}">${meta.title} <span style="font-weight:600">(${list.length})</span></div>
<div style="font:400 12px/1.3 ${FONT};color:${C.muted};margin:2px 0 8px">${meta.hint}</div>${names}</td></tr></table></td>`
  }
  return section('Mapa de la cartera', '¿Dónde hay que intervenir?',
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 -4px"><tr>${cell('pidePista')}${cell('consolidado')}</tr><tr>${cell('enRiesgo')}${cell('aMejorar')}</tr></table>`,
    `Minutos que jugó sobre los de su equipo (juega = 50% o más) y nota promedio del mes (rinde = 6,8 o más). Al lado de cada nombre: % de minutos · nota.`)
}

function portfolio(r: MinutaReport) {
  const { now, before, movers, history, top, undervalued } = r.portfolio
  const d = now - before
  const sub = (t: string) => `<div style="height:1px;background:${C.soft};margin:16px 0 10px"></div><div style="font:600 12px ${FONT};color:${C.muted};margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em">${t}</div>`

  // Evolución: 12 barras verticales (el último mes en verde).
  const max = Math.max(1, ...history.map(h => h.eur))
  const bars = history.map((h, i) => {
    const hgt = Math.max(3, Math.round((h.eur / max) * 64))
    const last = i === history.length - 1
    return `<td style="vertical-align:bottom;text-align:center;padding:0 2px"><div style="height:${hgt}px;background:${last ? C.green : C.line};border-radius:4px 4px 0 0;font-size:0;line-height:0">&nbsp;</div><div style="font:500 9px/1 ${FONT};color:${C.faint};margin-top:4px">${MONTH_INITIAL[Number(h.month.slice(5, 7)) - 1]}</div></td>`
  }).join('')
  const first = history.find(h => h.eur > 0)
  const yearText = first && first.month !== history[history.length - 1].month
    ? `${now >= first.eur ? 'Subió' : 'Bajó'} ${fmtEur(Math.abs(now - first.eur))} desde ${monthName(first.month)} de ${first.month.slice(0, 4)}.` : ''

  // Quién lo movió: antes → ahora, la barra mide el % (así un cambio chico también se ve).
  const rows = movers.slice(0, 8).map(m => {
    const up = m.delta > 0
    const w = Math.max(4, Math.min(100, Math.round(Math.abs(m.pct) * 100)))
    const color = up ? C.green : C.red
    return `<tr><td style="padding:6px 8px 6px 0;font:500 13px/1.3 ${FONT};color:${C.ink};width:42%">${esc(m.p.name)}<div style="font:400 11px ${FONT};color:${C.faint}">${fmtEur(m.p.value!.before!)} → <b style="color:${C.ink}">${fmtEur(m.p.value!.now)}</b></div></td>
<td style="padding:6px 0"><table width="${w}%" cellpadding="0" cellspacing="0"><tr><td style="background:${color};height:8px;border-radius:4px;font-size:0;line-height:0">&nbsp;</td></tr></table></td>
<td style="padding:6px 0 6px 10px;font:700 13px ${FONT};color:${color};text-align:right;width:56px">${up ? '+' : '−'}${Math.round(Math.abs(m.pct) * 100)}%</td></tr>`
  }).join('')
  const still = r.players.filter(p => p.value && (p.value.before == null || p.value.before === p.value.now)).length

  const topRows = top.map(t => `<tr><td style="padding:5px 8px 5px 0;font:500 13px ${FONT};color:${C.ink};width:42%">${esc(t.p.name)}</td>
<td style="padding:5px 0"><table width="100%" cellpadding="0" cellspacing="0" style="background:${C.soft};border-radius:4px"><tr><td width="${Math.max(2, Math.round(t.share * 100))}%" style="background:${C.ink};height:8px;border-radius:4px;font-size:0;line-height:0">&nbsp;</td><td style="font-size:0;line-height:0">&nbsp;</td></tr></table></td>
<td style="padding:5px 0 5px 10px;font:600 13px ${FONT};color:${C.ink};text-align:right;width:56px">${Math.round(t.share * 100)}%</td></tr>`).join('')
  const lead = top[0]

  const body = card(`<table width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:bottom"><div style="font:500 12px ${FONT};color:${C.muted}">Valor total de la cartera (Transfermarkt)</div><div style="font:700 32px/1.1 ${FONT};color:${C.ink};margin-top:4px">${fmtEur(now)}</div></td>
<td style="text-align:right;vertical-align:bottom;font:600 15px ${FONT};color:${d >= 0 ? C.green : C.red}">${d === 0 ? '= igual' : `${d > 0 ? '▲ +' : '▼ −'}${fmtEur(Math.abs(d))}`}<div style="font:400 12px ${FONT};color:${C.faint}">en el mes</div></td></tr></table>
${sub('Últimos 12 meses')}<table width="100%" cellpadding="0" cellspacing="0" style="height:80px"><tr>${bars}</tr></table>${yearText ? `<div style="font:400 12px ${FONT};color:${C.muted};margin-top:6px">${yearText}</div>` : ''}
${rows ? `${sub('Quién lo movió este mes')}<table width="100%" cellpadding="0" cellspacing="0">${rows}</table><div style="font:400 12px ${FONT};color:${C.faint};margin-top:4px">${still} jugadores mantuvieron su valor.</div>` : ''}
${topRows ? `${sub('Dónde está el valor')}<table width="100%" cellpadding="0" cellspacing="0">${topRows}</table>${lead && lead.share >= 0.35 ? `<div style="font:400 12px/1.5 ${FONT};color:${C.muted};margin-top:6px">${esc(lead.p.name)} por sí solo es el ${Math.round(lead.share * 100)}% del valor de la cartera: lo que pase con él mueve todo el número.</div>` : ''}` : ''}
${undervalued.length ? `${sub('Rinden más de lo que marca su valor')}<div style="font:400 13px/1.55 ${FONT};color:${C.ink}">${undervalued.map(p => `<b>${esc(p.name)}</b> <span style="color:${C.faint}">(${fmtEur(p.value!.now)})</span>`).join(', ')}.</div><div style="font:400 12px/1.5 ${FONT};color:${C.muted};margin-top:4px">Vienen bien y su valor no se movió en 3 meses: es el momento de mostrarlos antes de que suba.</div>` : ''}`)
  return section('Valor de mercado', 'Cuánto vale la cartera', body)
}

const STATUS: Record<string, string> = {
  contactado: 'Contactado', reunion: 'Reunión', oferta_enviada: 'Oferta enviada', en_espera: 'En espera',
  cerrado_exitoso: 'Se cerró', cerrado_rechazado: 'Rechazada', cerrado_caido: 'Se cayó',
}

function agenda(r: MinutaReport) {
  const parts: string[] = []
  if (r.contracts.length) {
    const byDate = new Map<string, PlayerMonth[]>()
    for (const c of r.contracts) byDate.set(c.date, [...(byDate.get(c.date) ?? []), c.p])
    const blocks = [...byDate].map(([date, ps]) => `<div style="font:700 14px/1.3 ${FONT};color:${C.ink};margin:0 0 8px">Vencen el ${esc(fmtDate(date))} <span style="color:${C.faint};font-weight:500">· ${ps.length} jugadores</span></div>
<div style="line-height:2">${ps.map(p => `<span style="display:inline-block;font:500 12px/1 ${FONT};color:${C.ink};background:${p.cls === 'A' ? C.amberBg : C.soft};border-radius:999px;padding:6px 10px;margin:0 4px 4px 0;white-space:nowrap">${esc(p.name)}${p.cls ? ` <b style="color:${p.cls === 'A' ? C.amber : C.muted}">${p.cls}</b>` : ''}</span>`).join('')}</div>`).join('')
    parts.push(card(`<div style="font:600 12px ${FONT};color:${C.muted};margin-bottom:8px;text-transform:uppercase;letter-spacing:.06em">Contratos (próximos 6 meses)</div>${blocks}`))
  }
  const negs = r.negotiations.map(n => {
    const name = r.players.find(p => p.name.toLowerCase().includes(n.player.toLowerCase().trim()) || n.player.toLowerCase().includes(p.name.toLowerCase()))?.name ?? n.player
    return `<tr><td style="padding:8px 0;border-top:1px solid ${C.soft};font:500 14px/1.4 ${FONT};color:${C.ink}">${esc(name)} → ${esc(n.team)}</td>
<td style="padding:8px 0;border-top:1px solid ${C.soft};text-align:right">${pill(STATUS[n.status] ?? n.status, n.status === 'cerrado_exitoso' ? C.green : n.status.startsWith('cerrado') ? C.red : C.amber, n.status === 'cerrado_exitoso' ? C.greenBg : n.status.startsWith('cerrado') ? C.redBg : C.amberBg)}</td></tr>`
  }).join('')
  parts.push(card(`<div style="font:600 12px ${FONT};color:${C.muted};margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em">Mercado: negociaciones que se movieron en ${esc(monthName(r.month))}</div>
${negs ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${negs}</table>` : `<div style="font:400 14px ${FONT};color:${C.faint};padding-top:6px">No hubo movimientos cargados en Mercado.</div>`}`, '16px 18px', 'margin-top:8px'))
  parts.push(`<div style="font:400 13px/1.5 ${FONT};color:${C.muted};margin-top:10px">Próxima ventana de pases: enero (Argentina, Sudamérica y Europa). Lo que se defina en ${esc(monthName(shiftMonth(r.month, 1)))} y ${esc(monthName(shiftMonth(r.month, 2)))} llega a tiempo.</div>`)
  return section('Agenda comercial', 'Contratos y negociaciones', parts.join(''))
}

const GROUP_ES: Record<string, string> = { 'Group 1': 'Zona A', 'Group 2': 'Zona B', 'Group A': 'Zona A', 'Group B': 'Zona B' }

function coaches(r: MinutaReport) {
  if (!r.coaches.length) return ''
  const cards = [...r.coaches].sort((a, b) => Number(!!b.teamId) - Number(!!a.teamId)).map(c => {
    if (c.status === 'sin_club' || !c.teamId) {
      return card(`<div style="font:700 15px ${FONT};color:${C.ink}">${esc(c.name)}</div><div style="font:400 14px/1.5 ${FONT};color:${C.muted};margin-top:4px">Sin club. Disponible para ofrecer.</div>`, '14px 18px', 'margin-bottom:8px')
    }
    const w = c.matches.filter(m => m.gf > m.ga).length, dr = c.matches.filter(m => m.gf === m.ga).length, l = c.matches.length - w - dr
    const pts = w * 3 + dr
    const chips = c.matches.map(m => {
      const res = m.gf > m.ga ? ['G', C.green] : m.gf === m.ga ? ['E', C.faint] : ['P', C.red]
      return `<tr><td style="width:26px;padding:5px 0"><span style="display:inline-block;width:22px;height:22px;border-radius:6px;background:${res[1]};color:#fff;font:700 12px/22px ${FONT};text-align:center">${res[0]}</span></td>
<td style="padding:5px 8px;font:500 13px/1.3 ${FONT};color:${C.ink}">${m.home ? 'vs' : 'en cancha de'} ${esc(m.rival)}</td><td style="padding:5px 0;text-align:right;font:600 13px ${FONT};color:${C.ink}">${m.gf}-${m.ga}</td></tr>`
    }).join('')
    const st = c.standing
    return card(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td><div style="font:700 15px ${FONT};color:${C.ink}">${esc(c.name)}</div><div style="font:400 13px ${FONT};color:${C.muted};margin-top:2px">${esc(c.club ?? '')} · ${esc(c.league ?? '')}</div></td>
<td style="text-align:right"><div style="font:700 22px/1 ${FONT};color:${C.ink}">${pts}<span style="font:500 13px ${FONT};color:${C.faint}"> de ${c.matches.length * 3}</span></div><div style="font:400 12px ${FONT};color:${C.muted};margin-top:3px">puntos en el mes</div></td></tr></table>
<div style="font:500 13px/1.5 ${FONT};color:${C.ink};margin:10px 0 4px">${w} ganados, ${dr} empatados, ${l} perdidos${st ? ` · En la tabla: ${st.rank}° de ${esc(GROUP_ES[st.group] ?? st.group)} con ${st.points} puntos${/play ?offs|reducido/i.test(st.description ?? '') ? ' (puesto de Reducido)' : ''}` : ''}</div>
${chips ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${chips}</table>` : ''}`, '16px 18px', 'margin-bottom:8px')
  }).join('')
  return section('Entrenadores representados', 'Cómo les fue a los DT', cards)
}

/** "4 partidos (3 de titular) · 320' · 2 goles · 1 asistencia" */
function numbersLine(p: PlayerMonth) {
  const n = p.nums
  if (!n.matches) return ''
  const bits = [`${n.matches} ${n.matches === 1 ? 'partido' : 'partidos'} (${n.starts} de titular)`, `${n.minutes.toLocaleString('es-AR')}'`]
  if (n.goals) bits.push(`${n.goals} ${n.goals === 1 ? 'gol' : 'goles'}`)
  if (n.assists) bits.push(`${n.assists} ${n.assists === 1 ? 'asist.' : 'asist.'}`)
  if (p.rating != null) bits.push(`nota ${fmt1(p.rating)}`)
  if (p.share != null) bits.push(`${Math.round(p.share * 100)}% de los minutos`)
  return bits.join(' · ')
}

// Renglón compacto por jugador: el detalle completo está en la plataforma.
function playerRow(p: PlayerMonth, first: boolean) {
  const sub = [p.club, p.group ? POS[p.group] : null].filter(Boolean).join(' · ')
  const line = numbersLine(p)
  // En el mail, un ejemplo por lado; la lista completa está en la plataforma.
  const det = p.detail.filter(d => !d.startsWith('Nota promedio') && !d.startsWith('Contrato')).map(d => d.replace(/; [^.]+\./g, '.'))
  return `<tr><td style="padding:11px 0 10px;${first ? '' : `border-top:1px solid ${C.soft};`}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font:700 14px/1.35 ${FONT};color:${C.ink}">${esc(p.name)} <span style="font-weight:400;color:${C.faint};font-size:12px">${esc(sub)}</span></td><td style="text-align:right;width:96px">${strip(p)}</td></tr></table>
<div style="font:600 13px/1.45 ${FONT};color:${C.ink};margin-top:3px">${esc(p.headline)}</div>
${line ? `<div style="font:400 12px/1.45 ${FONT};color:${C.muted}">${esc(line)}</div>` : ''}
${p.pattern ? `<div style="font:600 12px/1.45 ${FONT};color:${toneColor(p.pattern.tone)}">${esc(p.pattern.text)}.</div>` : ''}
${det.length ? `<div style="font:400 12px/1.5 ${FONT};color:${C.muted};margin-top:3px">${det.map(esc).join('<br>')}</div>` : ''}
</td></tr>`
}

function players(r: MinutaReport) {
  const groups: Array<[string, PlayerMonth[]]> = [
    ['Clase A', r.players.filter(p => p.cls === 'A')], ['Clase B', r.players.filter(p => p.cls === 'B')],
    ['Clase C', r.players.filter(p => p.cls === 'C')], ['Sin calificar', r.players.filter(p => !p.cls)],
  ]
  const quiet = (p: PlayerMonth) => p.role === 'noFigura' || p.role === 'sinDatos'
  const body = groups.filter(([, l]) => l.length).map(([title, list]) => {
    const active = list.filter(p => !quiet(p))
    const rest = list.filter(quiet)
    return `<div style="font:700 13px ${FONT};color:${C.ink};margin:18px 0 8px;text-transform:uppercase;letter-spacing:.06em">${title} <span style="color:${C.faint};font-weight:500">· ${list.length}</span></div>
${active.length ? card(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${active.map((p, i) => playerRow(p, i === 0)).join('')}</table>`, '4px 16px') : ''}
${rest.length ? `<div style="font:400 13px/1.5 ${FONT};color:${C.muted};padding:4px 2px 0">Sin actividad registrada en el mes: ${esc(rest.map(p => `${p.name} (${p.club})`).join(', '))}.</div>` : ''}`
  }).join('')
  return section('Jugador por jugador', 'La ficha del mes', body,
    'Los puntos de la derecha son sus últimos 6 meses (el último es éste): verde bueno, ámbar parejo, rojo flojo, gris sin datos. Wyscout compara las métricas que importan en su puesto contra sus 6 meses anteriores.')
}

function coverage(r: MinutaReport) {
  const c = r.coverage
  const bar = (label: string, n: number) => {
    const w = Math.round((n / c.total) * 100)
    return `<tr><td style="padding:5px 10px 5px 0;font:500 13px ${FONT};color:${C.ink};white-space:nowrap;width:150px">${label}</td>
<td style="padding:5px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.soft};border-radius:5px"><tr><td width="${Math.max(2, w)}%" style="background:${C.green};height:10px;border-radius:5px;font-size:0;line-height:0">&nbsp;</td><td style="font-size:0;line-height:0">&nbsp;</td></tr></table></td>
<td style="padding:5px 0 5px 10px;font:600 13px ${FONT};color:${C.ink};text-align:right;width:60px">${n} de ${c.total}</td></tr>`
  }
  const withMatches = r.players.filter(p => p.sources.partidos).length
  const withWy = r.players.filter(p => p.sources.wyscout).length
  const none = c.none.length
    ? `<div style="font:400 13px/1.5 ${FONT};color:${C.muted};margin-top:12px"><b style="color:${C.ink}">Sin ninguna fuente en el mes (${c.none.length}):</b> ${esc(c.none.map(p => `${p.name} (${p.club})`).join(', '))}. De estos no sabemos si jugaron: es el argumento concreto para una fuente que cubra esas ligas y la Reserva.</div>` : ''
  return section('Calidad de los datos', 'Qué tan completa está la información', card(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${bar('Partidos (API/Sofascore)', withMatches)}${bar('Wyscout cargado', withWy)}${bar('GPS del club', c.gps)}</table>
<div style="font:400 12px/1.5 ${FONT};color:${C.faint};margin-top:6px">El GPS lo mandan pocos clubes y se empezó a cargar hace poco: es un dato extra para los que lo tienen, no una falta.</div>${none}`))
}

// ─── Mail completo ───────────────────────────────────────────────────────────

export function renderMinutaEmail(r: MinutaReport): string {
  return compact(renderFull(r))
}

/** Gmail corta los mails de más de ~100 KB: se sacan atributos y saltos que no cambian nada. */
function compact(html: string) {
  return html.replace(/ role="presentation"/g, '').replace(/>\s*\n\s*</g, '><')
}

function renderFull(r: MinutaReport): string {
  const cta = `<tr><td style="padding:28px 0 0">${card(`<div style="text-align:center;font:700 18px/1.3 ${FONT};color:${C.ink}">¿Querés ver más?</div>
<div style="text-align:center;font:400 14px/1.5 ${FONT};color:${C.muted};margin:6px 0 16px">En Rendimiento individual están los gráficos, la evolución temporada por temporada y la comparación cara a cara de cada jugador.</div>
${button('Ver más en la plataforma', RENDIMIENTO_URL)}`, '22px 20px')}</td></tr>`
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(r.title)}</title></head>
<body style="margin:0;padding:0;background:${C.bg}">
<div style="display:none;max-height:0;overflow:hidden">${esc(r.summary[0] ?? '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:20px 12px 40px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px">
${header(r)}
${summary(r)}
${actions(r)}
${kpis(r)}
${form(r)}
${patterns(r)}
${quadrants(r)}
${portfolio(r)}
${agenda(r)}
${coaches(r)}
${players(r)}
${cta}
${coverage(r)}
<tr><td style="padding:24px 0 0">${card(`<div style="font:700 13px/1.4 ${FONT};color:${C.ink}">Sobre los datos de este reporte</div>
<div style="font:400 13px/1.55 ${FONT};color:${C.muted};margin-top:4px">Los datos del mes se cierran el día 5: hasta ese día se completan los partidos (API-Football y Sofascore, de todas las ligas: Primera, Primera Nacional, Uruguay y el resto), la carga de Wyscout, los GPS de los clubes que los mandan y los valores de Transfermarkt. El reporte sale el 6. Si algún partido de los últimos días del mes todavía no estaba cargado en las fuentes, no figura acá y se suma en el reporte del mes que viene.</div>`, '14px 18px')}</td></tr>
<tr><td style="padding:20px 8px 0;text-align:center;font:400 12px/1.6 ${FONT};color:${C.faint}">
Reporte automático de Doble G Sports Group · se envía el 6 de cada mes.<br>Fuentes: API-Football, Sofascore, Wyscout (carga interna), GPS de los clubes y Transfermarkt.
</td></tr>
</table></td></tr></table></body></html>`
}
