export type PortfolioPeriod = '1y' | '3y' | 'all'

export interface ValuePoint { date: string; value: number } // date = 'YYYY-MM-DD'

export interface SeriesPlayer {
  currentValue: number
  history: ValuePoint[]
  /** Tiene la carrera cargada en la planilla: antes de su primer valor, Transfermarkt no lo tasaba. */
  hasCareerHistory: boolean
}

export interface TotalPoint { date: string; total: number }

const lastDayOfMonth = (y: number, m: number) =>
  new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10)

/** Último valor conocido a una fecha. `history` tiene que venir ordenado. */
export function valueAt(player: SeriesPlayer, date: string): number {
  let value: number | null = null
  for (const p of player.history) {
    if (p.date > date) break
    value = p.value
  }
  if (value !== null) return value
  if (player.hasCareerHistory) return 0
  // Sin carrera cargada, su primer registro es sólo el día que empezamos a guardarlo: se
  // lo toma como su valor de antes para que el total no pegue un salto que no existió.
  return player.history[0]?.value ?? player.currentValue
}

/**
 * Total del plantel actual, a fin de cada mes. Siempre los mismos jugadores, para que la
 * línea muestre cuánto cambió el valor y no quién entró a la lista. El último punto es
 * hoy, con el valor vivo: da igual que el total de la tarjeta.
 */
export function computeTotalSeries(players: SeriesPlayer[], today: string): TotalPoint[] {
  const valued = players.filter(p => p.currentValue > 0 || p.history.length > 0)
  const firstDate = valued.flatMap(p => p.history.map(h => h.date)).sort()[0]
  const todayTotal = valued.reduce((s, p) => s + p.currentValue, 0)
  if (!firstDate) return todayTotal > 0 ? [{ date: today, total: todayTotal }] : []

  const out: TotalPoint[] = []
  let y = Number(firstDate.slice(0, 4))
  let m = Number(firstDate.slice(5, 7)) - 1
  for (;;) {
    const date = lastDayOfMonth(y, m)
    if (date >= today) break
    out.push({ date, total: valued.reduce((s, p) => s + valueAt(p, date), 0) })
    m++
    if (m === 12) { m = 0; y++ }
  }
  out.push({ date: today, total: todayTotal })
  return out
}

export function sliceSeries(series: TotalPoint[], period: PortfolioPeriod, today: string): TotalPoint[] {
  if (period === 'all') return series
  const y = Number(today.slice(0, 4)) - (period === '1y' ? 1 : 3)
  const start = `${y}${today.slice(4)}`
  const slice = series.filter(p => p.date >= start)
  return slice.length >= 2 ? slice : series
}

/** Variación % entre el primer y el último punto. `null` si no hay contra qué comparar. */
export function seriesChange(series: TotalPoint[]): number | null {
  if (series.length < 2 || series[0].total <= 0) return null
  return ((series[series.length - 1].total - series[0].total) / series[0].total) * 100
}

export interface SharePlayer { name: string; value: number; position: string; monthsRemaining: number | null }
export interface ShareSlice { id: string; label: string; value: number; count: number; share: number }

function toSlices(groups: { id: string; label: string }[], idOf: (p: SharePlayer) => string, players: SharePlayer[]): ShareSlice[] {
  const valued = players.filter(p => p.value > 0)
  const total = valued.reduce((s, p) => s + p.value, 0)
  return groups
    .map(g => {
      const inGroup = valued.filter(p => idOf(p) === g.id)
      const value = inGroup.reduce((s, p) => s + p.value, 0)
      return { ...g, value, count: inGroup.length, share: total > 0 ? value / total : 0 }
    })
    .filter(s => s.count > 0)
}

export function positionGroup(position: string): string {
  const p = position.toLowerCase()
  if (p.includes('arquero') || p.includes('portero') || p.includes('goalkeeper')) return 'arq'
  if (p.includes('volante') || p.includes('medio') || p.includes('midfield')) return 'med'
  if (p.includes('defens') || p.includes('central') || p.includes('lateral') || p.includes('back')) return 'def'
  if (p.includes('extremo') || p.includes('delanter') || p.includes('wing') || p.includes('forward') || p.includes('striker')) return 'del'
  return 'nd'
}

export function valueByPosition(players: SharePlayer[]): ShareSlice[] {
  return toSlices([
    { id: 'arq', label: 'Arqueros' },
    { id: 'def', label: 'Defensores' },
    { id: 'med', label: 'Mediocampistas' },
    { id: 'del', label: 'Delanteros' },
    { id: 'nd', label: 'Sin dato' },
  ], p => positionGroup(p.position), players)
}

export function contractGroup(months: number | null): string {
  // Un contrato ya vencido en la base es un dato viejo, no un vencimiento que se viene.
  if (months === null || months < 0) return 'nd'
  if (months <= 6) return 'm6'
  if (months <= 12) return 'm12'
  if (months <= 24) return 'm24'
  return 'mas'
}

export function valueByContract(players: SharePlayer[]): ShareSlice[] {
  return toSlices([
    { id: 'm6', label: 'Hasta 6 meses' },
    { id: 'm12', label: '7 a 12 meses' },
    { id: 'm24', label: '1 a 2 años' },
    { id: 'mas', label: 'Más de 2 años' },
    { id: 'nd', label: 'Sin dato' },
  ], p => contractGroup(p.monthsRemaining), players)
}

export interface CountryPlayer { name: string; value: number; country: string | null; noClub: boolean }
export interface CountryRow { country: string; value: number; share: number; players: string[]; level: number }
export interface CountryBreakdown {
  rows: CountryRow[]
  noClub: { value: number; count: number }
  unknown: { value: number; count: number }
}

/**
 * Valor por país donde juegan. El nivel (0-4) sale de una escala logarítmica: México tiene
 * cientos de veces el valor de Bolivia, y en escala lineal el resto del mapa queda igual.
 */
export function valueByCountry(players: CountryPlayer[]): CountryBreakdown {
  const valued = players.filter(p => p.value > 0)
  const total = valued.reduce((s, p) => s + p.value, 0)
  const byCountry = new Map<string, CountryPlayer[]>()
  const noClub = { value: 0, count: 0 }
  const unknown = { value: 0, count: 0 }
  for (const p of valued) {
    if (p.noClub) { noClub.value += p.value; noClub.count++; continue }
    if (!p.country) { unknown.value += p.value; unknown.count++; continue }
    byCountry.set(p.country, [...(byCountry.get(p.country) ?? []), p])
  }
  const sums = [...byCountry.entries()].map(([country, list]) => ({
    country,
    list: [...list].sort((a, b) => b.value - a.value),
    value: list.reduce((s, p) => s + p.value, 0),
  }))
  const logs = sums.map(s => Math.log10(s.value))
  const min = Math.min(...logs)
  const max = Math.max(...logs)
  const rows = sums
    .map(s => ({
      country: s.country,
      value: s.value,
      share: total > 0 ? s.value / total : 0,
      players: s.list.map(p => p.name),
      level: max === min ? 4 : Math.min(4, Math.floor(((Math.log10(s.value) - min) / (max - min)) * 5)),
    }))
    .sort((a, b) => b.value - a.value)
  return { rows, noClub, unknown }
}
