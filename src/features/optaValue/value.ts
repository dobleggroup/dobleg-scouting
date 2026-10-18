import { agencyKey } from '@/services/agencyPlayersService'
import type { GroupCode, OptaLeague, OptaPlayer } from '@/features/opta/data'
import { profileScore, type PercentileIndex } from '@/features/opta/metrics'

/**
 * Detector de valor: cruza lo que rinde cada jugador en la Liga Profesional (nota
 * de Opta en su puesto) con lo que vale (Transfermarkt). El "valor por rendimiento"
 * es lo que valen los 15 jugadores de su mismo puesto más parecidos en
 * nota, edad y minutos. Si vale bastante menos que eso, está barato.
 */

/** Fila de la tabla `players` (Transfermarkt). */
export interface TmRow {
  id: number
  name: string
  birth_date: string | null
  market_value_eur: number | null
  contract_end_date: string | null
  agent: string | null
  canonical_id: number | null
  photo: string | null
  transfermarkt_url: string | null
}

export interface TmInfo {
  dbId: number
  value: number | null
  contractEnd: string | null
  agent: string | null
  tmUrl: string | null
  photo: string | null
}

const words = (s: string | null | undefined) => agencyKey(s ?? '').replace(/[-'’]/g, ' ').split(' ').filter(t => t.length > 2)

/**
 * Opta → Transfermarkt. Primero: misma fecha de nacimiento y el apellido de la
 * ficha de Transfermarkt dentro del nombre completo de Opta. Si no aparece (las
 * fechas a veces difieren por unos días o con día y mes dados vuelta): nombre y
 * apellido completos iguales y nacido el mismo año (±1). Si hay filas gemelas,
 * manda la canónica (players.canonical_id).
 */
export function matchTransfermarkt(players: OptaPlayer[], rows: TmRow[]): Map<string, TmInfo> {
  const byId = new Map(rows.map(r => [r.id, r]))
  const byDob = new Map<string, TmRow[]>()
  for (const r of rows) {
    if (!r.birth_date) continue
    const list = byDob.get(r.birth_date) ?? []
    list.push(r)
    byDob.set(r.birth_date, list)
  }
  const canonical = (r: TmRow) => byId.get(r.canonical_id ?? r.id) ?? r
  const pick = (hits: TmRow[]) => [...hits].sort((a, b) =>
    Number(Boolean(b.market_value_eur)) - Number(Boolean(a.market_value_eur)) || Number(b.id === b.canonical_id) - Number(a.id === a.canonical_id))[0]
  const tokensOf = (p: OptaPlayer) => new Set([...words(p.fullName), ...words(p.name), ...words(p.matchName)])

  const found = new Map<string, TmRow>()
  for (const p of players) {
    if (!p.dob) continue
    const have = tokensOf(p)
    const hits = (byDob.get(p.dob) ?? []).filter(r => { const w = words(r.name); return w.length > 0 && have.has(w[w.length - 1]) }).map(canonical)
    if (hits.length) found.set(p.id, pick(hits))
  }
  const used = new Set([...found.values()].map(r => r.id))
  for (const p of players) {
    if (found.has(p.id) || !p.dob) continue
    const year = Number(p.dob.slice(0, 4))
    const have = tokensOf(p)
    const hits = rows
      .filter(r => {
        const w = words(r.name)
        return w.length >= 2 && r.birth_date && Math.abs(Number(r.birth_date.slice(0, 4)) - year) <= 1 && w.every(t => have.has(t))
      })
      .map(canonical)
      .filter(r => !used.has(r.id))
    if (!hits.length || new Set(hits.map(r => r.id)).size > 1) continue
    found.set(p.id, hits[0])
    used.add(hits[0].id)
  }

  const out = new Map<string, TmInfo>()
  for (const [id, best] of found) {
    out.set(id, {
      dbId: best.id,
      value: best.market_value_eur && best.market_value_eur > 0 ? best.market_value_eur : null,
      contractEnd: best.contract_end_date,
      agent: best.agent?.trim() || null,
      tmUrl: best.transfermarkt_url,
      photo: best.photo,
    })
  }
  return out
}

export type Verdict = 'muyBarato' | 'barato' | 'justo' | 'caro' | 'muyCaro'

export const VERDICT_LABEL: Record<Verdict, string> = {
  muyBarato: 'Muy barato', barato: 'Barato', justo: 'Precio justo', caro: 'Caro', muyCaro: 'Muy caro',
}

/**
 * Veredicto con dos condiciones, para no marcar diferencias chicas:
 * - cuántos de los parecidos valen más que él (de 0 a 1), y
 * - cuánto vale contra el valor de referencia de los parecidos.
 * Un jugador que rinde menos que el promedio (nota < 50) no es "barato" aunque
 * valga poco: vale lo que rinde.
 */
export function verdictOf(ratio: number, score: number, worthMore: number): Verdict {
  if (score >= 50 && worthMore >= 0.9 && ratio <= 0.5) return 'muyBarato'
  if (score >= 50 && worthMore >= 0.75 && ratio <= 0.75) return 'barato'
  if (worthMore <= 0.1 && ratio >= 2) return 'muyCaro'
  if (worthMore <= 0.25 && ratio >= 1.35) return 'caro'
  return 'justo'
}

export type Flag = 'barato' | 'libre' | 'contrato' | 'joven' | 'sinRep' | 'familia' | 'caro'

export const FLAG_LABEL: Record<Flag, string> = {
  barato: 'Barato para lo que rinde',
  libre: 'Queda libre en diciembre',
  contrato: 'Contrato corto',
  joven: 'Joven que rinde',
  sinRep: 'Sin representante',
  familia: 'Lo representa la familia',
  caro: 'Caro para lo que rinde',
}

export interface Comp { p: OptaPlayer; score: number; value: number; age: number | null }

export interface Valuation {
  p: OptaPlayer
  tm: TmInfo | null
  /** Nota 0-100 en su puesto (Opta). */
  score: number | null
  /** Parte de los minutos de su equipo que jugó (0-1). */
  share: number
  value: number | null
  /** Valor de referencia: lo que valen los parecidos (los más parecidos pesan más). */
  fair: number | null
  ratio: number | null
  /** Cuántos de los parecidos valen más que él. */
  worthMore: number | null
  verdict: Verdict | null
  comps: Comp[]
  contractEnd: string | null
  monthsLeft: number | null
  flags: Flag[]
  /** Puntaje para ordenar oportunidades (solo sirve para ordenar). */
  opportunity: number
  /** Por qué no se pudo valuar, si no se pudo. */
  missing: 'minutos' | 'valor' | null
}

/** Desde acá la nota ya es confiable (unos 10 partidos completos). */
export const RELIABLE_MINUTES = 900

/** Cuántos parecidos se miran. */
export const COMPS = 15
/**
 * Cuánto se le cree a la nota según los minutos: con 300' cuenta la mitad de lo
 * que se aleja del promedio, con 900' tres cuartos, con 2.700' el 90%.
 */
const SURE_AT = 300

export function valuate(league: OptaLeague, idx: PercentileIndex, tm: Map<string, TmInfo>, today = new Date()): Valuation[] {
  const share = (p: OptaPlayer) => {
    const games = league.teamById.get(p.teamId ?? '')?.games ?? 0
    return games > 0 ? Math.min(1, p.minutes / (games * 90)) : 0
  }
  const base = league.players.map(p => {
    const info = tm.get(p.id) ?? null
    const score = p.minutes >= idx.minMinutes ? profileScore(p, idx) : null
    const sure = p.minutes / (p.minutes + SURE_AT)
    const adj = score === null ? null : 50 + (score - 50) * sure
    return { p, info, score, adj, share: share(p), value: info?.value ?? null }
  })
  // Los que entran en la comparación: con minutos, nota y valor.
  const pool = new Map<GroupCode, typeof base>()
  for (const b of base) {
    if (b.score === null || b.value === null) continue
    const list = pool.get(b.p.group) ?? []
    list.push(b)
    pool.set(b.p.group, list)
  }

  return base.map(({ p, info, score, adj, share: sh, value }) => {
    const contractEnd = info?.contractEnd ?? p.contractEnd
    const ml = contractEnd ? monthsLeftFrom(contractEnd, today) : null
    let comps: Comp[] = []
    let fair: number | null = null
    if (adj !== null) {
      const near = (pool.get(p.group) ?? [])
        .filter(o => o.p.id !== p.id)
        .map(o => ({
          o,
          d: Math.hypot((o.adj! - adj) / 10, ((o.p.age ?? 27) - (p.age ?? 27)) / 2.5, (o.share - sh) / 0.3),
        }))
        .sort((a, b) => a.d - b.d)
        .slice(0, COMPS)
      comps = near.map(({ o }) => ({ p: o.p, score: o.score!, value: o.value!, age: o.p.age }))
      if (comps.length >= 10) {
        // Promedio de lo que valen, en una escala que multiplica (de 500 mil a 1 millón es
        // lo mismo que de 1 a 2 millones), y los más parecidos pesan más.
        let sw = 0, sl = 0
        for (const { o, d } of near) { const w = 1 / (0.5 + d); sw += w; sl += w * Math.log(o.value!) }
        fair = Math.exp(sl / sw)
      }
    }
    const ratio = value !== null && fair ? value / fair : null
    const worthMore = value !== null && comps.length ? comps.filter(c => c.value > value).length / comps.length : null
    const verdict = ratio !== null && worthMore !== null ? verdictOf(ratio, score!, worthMore) : null
    const agent = agencyKey(info?.agent ?? '')

    const flags: Flag[] = []
    if ((verdict === 'muyBarato' || verdict === 'barato') && (score ?? 0) >= 50) flags.push('barato')
    if (ml !== null && ml >= 0 && ml <= 3) flags.push('libre')
    else if (ml !== null && ml > 3 && ml <= 9) flags.push('contrato')
    if ((p.age ?? 99) <= 23 && (score ?? 0) >= 60) flags.push('joven')
    if (agent === 'no agent') flags.push('sinRep')
    if (agent === 'relatives') flags.push('familia')
    if (verdict === 'caro' || verdict === 'muyCaro') flags.push('caro')

    const good = flags.some(f => f !== 'caro')
    const opportunity = score === null || score < 55 || !good ? 0
      : score
        + (verdict === 'muyBarato' ? 25 : verdict === 'barato' ? 15 : 0)
        + (flags.includes('libre') ? 12 : flags.includes('contrato') ? 8 : 0)
        + (flags.includes('joven') ? 10 : 0)
        + (flags.includes('sinRep') || flags.includes('familia') ? 8 : 0)
        - (flags.includes('caro') ? 25 : 0)
        // Con pocos partidos la nota es menos segura.
        - (p.minutes < RELIABLE_MINUTES ? 12 : 0)

    return {
      p, tm: info, score, share: sh, value, fair, ratio, worthMore: worthMore === null ? null : Math.round(worthMore * comps.length), verdict, comps, contractEnd, monthsLeft: ml, flags, opportunity,
      missing: score === null ? 'minutos' : value === null ? 'valor' : null,
    }
  })
}

function monthsLeftFrom(end: string, today: Date): number {
  const e = new Date(`${end.slice(0, 10)}T12:00:00`)
  return (e.getFullYear() - today.getFullYear()) * 12 + (e.getMonth() - today.getMonth())
}


const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const monthName = (d: string) => `${MONTH_NAMES[Number(d.slice(5, 7)) - 1]} de ${d.slice(0, 4)}`

export interface Advice { tone: 'good' | 'warn' | 'info'; text: string }

/** Qué hacer con un jugador de la agencia, en frases cortas. */
export function agencyAdvice(v: Valuation, money: (eur: number) => string): Advice[] {
  const out: Advice[] = []
  const { score, verdict, fair, p } = v
  if (v.missing === 'minutos') {
    out.push({ tone: 'info', text: `Jugó ${p.minutes}' en la liga: todavía no alcanza para compararlo (hacen falta 450').` })
  } else if (v.missing === 'valor') {
    out.push({ tone: 'info', text: 'Transfermarkt no tiene su valor de mercado.' })
  } else if (fair !== null && score !== null) {
    if (verdict === 'muyBarato' || verdict === 'barato') {
      out.push({ tone: 'good', text: `De ${v.comps.length} jugadores que rinden parecido, ${v.worthMore} valen más que él (en general, ${money(fair)}). Hay argumentos para que suba su valor o para mejorarle el contrato.` })
    } else if (verdict === 'justo' && score < 50 && v.ratio !== null && v.ratio <= 0.75) {
      out.push({ tone: 'info', text: `Vale poco, pero hoy también rinde poco en su puesto (nota ${score}). Para que suba su valor tiene que mejorar en la cancha.` })
    } else if (verdict === 'justo') {
      out.push({ tone: 'info', text: 'Su valor está en línea con lo que rinde: vale lo mismo que los que juegan parecido.' })
    } else if (score >= 60) {
      out.push({ tone: 'warn', text: `Rinde bien (nota ${score}), pero vale más que los que rinden parecido (${money(fair)}). Si llega una oferta, el precio está alto.` })
    } else {
      out.push({ tone: 'warn', text: `Vale más de lo que hoy muestra en la cancha (los que rinden parecido valen ${money(fair)}). Necesita minutos y rendimiento para sostener ese valor.` })
    }
  }
  if (v.monthsLeft !== null && v.contractEnd) {
    if (v.monthsLeft < 0) out.push({ tone: 'warn', text: 'Según Transfermarkt el contrato ya venció.' })
    else if (v.monthsLeft <= 3) out.push({ tone: 'warn', text: `El contrato termina en ${monthName(v.contractEnd)}: hay que definir ya si renueva o sale libre.` })
    else if (v.monthsLeft <= 9) out.push({ tone: 'warn', text: `Le quedan ${v.monthsLeft} meses de contrato: buen momento para negociar la renovación.` })
  }
  if (v.flags.includes('joven')) out.push({ tone: 'good', text: `Con ${p.age} años está entre los jóvenes que mejor rinden en su puesto.` })
  if (score !== null && p.minutes < RELIABLE_MINUTES) out.push({ tone: 'info', text: `Jugó ${p.minutes}': la nota todavía puede cambiar bastante.` })
  return out
}
