import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { buildAgencyMatcher, identityKey, useData } from '@/context/DataContext'
import { useCurrency } from '@/context/CurrencyContext'
import { PlayerPhoto } from '@/components/ui/PlayerPhoto'
import { FILTER_POSITION_MAP } from '@/constants/scoring'
import { formatMarketValueInCurrency } from '@/utils/scoring'
import { countryEs } from '@/utils/leagueLabels'
import { fetchPortfolioLiveRows, fetchTeamCountries, type PortfolioLiveRow } from './portfolioData'
import { tmIdFromUrl } from '@/services/playerStatsService'
import {
  computeTotalSeries, seriesChange, sliceSeries, valueByContract, valueByCountry, valueByPosition,
  type CountryRow, type PortfolioPeriod, type SeriesPlayer, type ShareSlice, type SharePlayer, type TotalPoint, type ValuePoint,
} from './portfolioMetrics'
import { WORLD_COUNTRIES, WORLD_VIEWBOX } from './worldMapPaths'

const PERIODS: { id: PortfolioPeriod; label: string; since: string }[] = [
  { id: '1y', label: '1 año', since: 'en el último año' },
  { id: '3y', label: '3 años', since: 'en 3 años' },
  { id: 'all', label: 'Todo', since: 'en todo el historial' },
]

// Colores validados contra el fondo claro y el oscuro de las tarjetas.
const POSITION_COLORS: Record<string, string> = {
  arq: 'var(--pf-c4)',
  def: 'var(--pf-c2)',
  med: 'var(--pf-c1)',
  del: 'var(--pf-c3)',
  nd: 'var(--pf-none)',
}
const CONTRACT_COLORS: Record<string, string> = {
  m6: '#EF4444',
  m12: '#F59E0B',
  m24: '#4ADE80',
  mas: '#15803D',
  nd: 'var(--pf-none)',
}

const MAP_LEVEL_CLASS = [
  'fill-emerald-200 dark:fill-emerald-900',
  'fill-emerald-300 dark:fill-emerald-800',
  'fill-emerald-500 dark:fill-emerald-600',
  'fill-emerald-600 dark:fill-emerald-500',
  'fill-emerald-800 dark:fill-emerald-300',
]
const MAP_LEVEL_SWATCH = [
  'bg-emerald-200 dark:bg-emerald-900',
  'bg-emerald-300 dark:bg-emerald-800',
  'bg-emerald-500 dark:bg-emerald-600',
  'bg-emerald-600 dark:bg-emerald-500',
  'bg-emerald-800 dark:bg-emerald-300',
]

/** Nombres de los proveedores ("USA", "Saudi-Arabia") → nombres de los contornos del mapa. */
const MAP_NAME: Record<string, string> = { USA: 'United States of America' }
const mapName = (country: string) => MAP_NAME[country] ?? country.replace(/-/g, ' ')

/** Países tan chicos en el mapa que el color solo no se ve: llevan un punto encima. */
const SMALL_AREA = 200

/** Desde esta fecha guardamos un registro por día; lo anterior en la tabla es la carrera de Transfermarkt. */
const DAILY_TRACKING_START = '2026-05-28'

function monthsUntil(iso: string | null | undefined, today: string): number | null {
  if (!iso) return null
  const days = (Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000
  return Number.isNaN(days) ? null : Math.floor(days / 30.44)
}

const pct = (share: number) => `${(share * 100).toLocaleString('es-AR', { maximumFractionDigits: share < 0.1 ? 1 : 0 })}%`

const CARD = 'bg-white dark:bg-apple-gray-800 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 p-4 sm:p-5 min-w-0'
const CARD_TITLE = 'text-base font-semibold text-apple-gray-800 dark:text-white'

const shortDate = (iso: string) => new Intl.DateTimeFormat('es-AR', { month: 'short', year: '2-digit', timeZone: 'UTC' })
  .format(new Date(`${iso}T00:00:00Z`)).replace('.', '').replace(/ de /, ' ')
const longDate = (iso: string) => new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  .format(new Date(`${iso}T00:00:00Z`))

function ChartTooltip({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-apple-gray-700 rounded-lg shadow-lg border border-apple-gray-200 dark:border-apple-gray-600 px-3 py-2 text-xs text-apple-gray-700 dark:text-apple-gray-100 max-w-[240px]">
      {children}
    </div>
  )
}

// ─── Evolución ────────────────────────────────────────────────────────────────

function TrendCard({ series, period, onPeriod, fmt, today }: {
  series: TotalPoint[]
  period: PortfolioPeriod
  onPeriod: (p: PortfolioPeriod) => void
  fmt: (v: number) => string
  today: string
}) {
  const lastIndex = series.length - 1
  return (
    <section className={`${CARD} lg:col-span-7 flex flex-col`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 className={CARD_TITLE}>Evolución del valor total</h3>
        <div className="flex gap-1 bg-apple-gray-100 dark:bg-apple-gray-700/50 p-1 rounded-apple">
          {PERIODS.map(p => (
            <button
              key={p.id}
              type="button"
              aria-pressed={period === p.id}
              onClick={() => onPeriod(p.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                period === p.id
                  ? 'bg-white dark:bg-apple-gray-800 text-apple-gray-800 dark:text-white shadow-apple dark:shadow-apple-dark'
                  : 'text-apple-gray-500 dark:text-apple-gray-400'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {series.length < 2 ? (
        <p className="flex-1 flex items-center justify-center text-sm text-apple-gray-500 dark:text-apple-gray-400 py-16">Todavía no hay historial de valores.</p>
      ) : (
        <div className="flex-1 min-h-[260px] h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 28, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="pfTrendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(var(--color-brand-green))" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="rgb(var(--color-brand-green))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--pf-grid)" />
              <XAxis
                dataKey="date"
                tickFormatter={d => (d === today ? 'Hoy' : shortDate(d))}
                tick={{ fontSize: 11, fill: 'var(--pf-muted)' }}
                tickLine={false}
                axisLine={false}
                minTickGap={36}
              />
              <YAxis
                domain={[0, 'auto']}
                tickFormatter={v => (v === 0 ? '0' : fmt(v))}
                tick={{ fontSize: 11, fill: 'var(--pf-muted)' }}
                tickLine={false}
                axisLine={false}
                width={52}
              />
              <Tooltip
                cursor={{ stroke: 'var(--pf-muted)', strokeWidth: 1 }}
                content={({ active, payload }) => {
                  const p = payload?.[0]?.payload as TotalPoint | undefined
                  if (!active || !p) return null
                  return (
                    <ChartTooltip>
                      <p className="text-apple-gray-500 dark:text-apple-gray-300 first-letter:uppercase">{p.date === today ? 'Hoy' : longDate(p.date)}</p>
                      <p className="font-bold text-sm tabular-nums">{fmt(p.total)}</p>
                    </ChartTooltip>
                  )
                }}
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke="rgb(var(--color-brand-green))"
                strokeWidth={2}
                fill="url(#pfTrendFill)"
                isAnimationActive={false}
                dot={(props: { cx?: number; cy?: number; index?: number }) => {
                  const { cx = 0, cy = 0, index } = props
                  if (index !== lastIndex) return <g key={index} />
                  const label = fmt(series[lastIndex].total)
                  const w = label.length * 7.4 + 14
                  return (
                    <g key={index}>
                      <circle cx={cx} cy={cy} r={4.5} fill="rgb(var(--color-brand-green))" stroke="var(--pf-surface)" strokeWidth={2} />
                      <rect x={cx - w + 4} y={cy - 30} width={w} height={21} rx={6} fill="var(--pf-pill)" />
                      <text x={cx - w / 2 + 4} y={cy - 15.5} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--pf-pill-text)">{label}</text>
                    </g>
                  )
                }}
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--pf-surface)' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}

// ─── Gráficos circulares ──────────────────────────────────────────────────────

function Donut({ title, slices, colors, fmt, total }: {
  title: string
  slices: ShareSlice[]
  colors: Record<string, string>
  fmt: (v: number) => string
  total: number
}) {
  return (
    <div className="min-w-0">
      <h3 className={`${CARD_TITLE} mb-3`}>{title}</h3>
      <div className="relative h-[150px] max-w-[190px] mx-auto">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius="68%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              paddingAngle={slices.length > 1 ? 2 : 0}
              cornerRadius={3}
              stroke="none"
              isAnimationActive={false}
            >
              {slices.map(s => <Cell key={s.id} fill={colors[s.id]} />)}
            </Pie>
            <Tooltip
              wrapperStyle={{ zIndex: 20 }}
              content={({ active, payload }) => {
                const s = payload?.[0]?.payload as ShareSlice | undefined
                if (!active || !s) return null
                return (
                  <ChartTooltip>
                    <p className="font-semibold">{s.label}</p>
                    <p className="tabular-nums">{fmt(s.value)} · {pct(s.share)}</p>
                    <p className="text-apple-gray-500 dark:text-apple-gray-300">{s.count} {s.count === 1 ? 'jugador' : 'jugadores'}</p>
                  </ChartTooltip>
                )
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-lg font-bold text-apple-gray-800 dark:text-white tabular-nums leading-tight">{fmt(total)}</span>
          <span className="text-2xs text-apple-gray-500 dark:text-apple-gray-400">Valor total</span>
        </div>
      </div>
      <ul className="mt-3 space-y-1.5">
        {slices.map(s => (
          <li key={s.id} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: colors[s.id] }} />
            <span className="flex-1 min-w-0 truncate text-apple-gray-600 dark:text-apple-gray-300">{s.label}</span>
            <span className="font-semibold tabular-nums text-apple-gray-800 dark:text-white">{pct(s.share)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Mapa ─────────────────────────────────────────────────────────────────────

function MapCard({ rows, noClub, unknown, fmt, failed }: {
  rows: CountryRow[]
  noClub: { value: number; count: number }
  unknown: { value: number; count: number }
  fmt: (v: number) => string
  failed: boolean
}) {
  const [active, setActive] = useState<string | null>(null)
  const byMapName = useMemo(() => new Map(rows.map(r => [mapName(r.country), r])), [rows])
  const activeRow = rows.find(r => r.country === active) ?? null
  const activeShape = activeRow ? WORLD_COUNTRIES.find(c => c.name === mapName(activeRow.country)) : null
  const [, , vbW, vbH] = WORLD_VIEWBOX.split(' ').map(Number)
  const dots = WORLD_COUNTRIES.filter(c => byMapName.has(c.name) && c.area < SMALL_AREA)

  return (
    <section className={`${CARD} lg:col-span-7`}>
      <h3 className={`${CARD_TITLE} mb-3`}>Valor por país donde juegan</h3>
      {failed ? (
        <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 text-center py-16">No se pudo cargar el país de los clubes. Probá actualizar la página.</p>
      ) : (
        <div className="space-y-3">
          <div className="relative min-w-0" onMouseLeave={() => setActive(null)}>
            <svg viewBox={WORLD_VIEWBOX} className="w-full h-auto" role="img" aria-label="Mapa del mundo con el valor del plantel por país">
              {WORLD_COUNTRIES.map(c => {
                const row = byMapName.get(c.name)
                if (!row) return <path key={c.name} d={c.d} className="fill-apple-gray-200 dark:fill-apple-gray-600 stroke-white dark:stroke-apple-gray-800" strokeWidth={0.5} />
                return (
                  <path
                    key={c.name}
                    d={c.d}
                    className={`${MAP_LEVEL_CLASS[row.level]} cursor-pointer stroke-white dark:stroke-apple-gray-800 transition-opacity ${active && active !== row.country ? 'opacity-50' : ''}`}
                    strokeWidth={0.5}
                    onMouseEnter={() => setActive(row.country)}
                    onClick={() => setActive(row.country)}
                  />
                )
              })}
              {dots.map(c => {
                const row = byMapName.get(c.name)!
                return (
                  <circle
                    key={c.name}
                    cx={c.cx}
                    cy={c.cy}
                    r={7}
                    className={`${MAP_LEVEL_CLASS[row.level]} cursor-pointer stroke-white dark:stroke-apple-gray-800`}
                    strokeWidth={1.5}
                    onMouseEnter={() => setActive(row.country)}
                    onClick={() => setActive(row.country)}
                  />
                )
              })}
            </svg>
            {activeRow && activeShape && (
              <div
                className="absolute z-10 pointer-events-none -translate-x-1/2 -translate-y-full"
                style={{
                  left: `${Math.min(78, Math.max(22, (activeShape.cx / vbW) * 100))}%`,
                  top: `${Math.max(38, (activeShape.cy / vbH) * 100)}%`,
                }}
              >
                <ChartTooltip>
                  <p className="font-semibold">{countryEs(activeRow.country)}</p>
                  <p className="tabular-nums">{fmt(activeRow.value)} · {pct(activeRow.share)}</p>
                  <p className="text-apple-gray-500 dark:text-apple-gray-300">{activeRow.players.slice(0, 4).join(', ')}{activeRow.players.length > 4 ? ` y ${activeRow.players.length - 4} más` : ''}</p>
                </ChartTooltip>
              </div>
            )}
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-0.5 min-w-0">
            {rows.map(r => (
              <li key={r.country}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(r.country)}
                  onMouseLeave={() => setActive(null)}
                  onClick={() => setActive(r.country)}
                  className={`w-full flex items-center gap-2 py-1 px-1.5 rounded-md text-left text-xs transition-colors ${active === r.country ? 'bg-apple-gray-100 dark:bg-apple-gray-700/50' : ''}`}
                >
                  <span className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 ${MAP_LEVEL_SWATCH[r.level]}`} />
                  <span className="flex-1 min-w-0 truncate text-apple-gray-700 dark:text-apple-gray-200">{countryEs(r.country)}</span>
                  <span className="font-semibold tabular-nums text-apple-gray-800 dark:text-white">{fmt(r.value)}</span>
                  <span className="w-5 text-right tabular-nums text-apple-gray-500 dark:text-apple-gray-400" title="Jugadores">{r.players.length}</span>
                </button>
              </li>
            ))}
            {[{ label: 'Sin club', ...noClub }, { label: 'Sin dato del país', ...unknown }].filter(x => x.count > 0).map(x => (
              <li key={x.label} className="flex items-center gap-2 py-1 px-1.5 text-xs">
                <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0 bg-apple-gray-200 dark:bg-apple-gray-600" />
                <span className="flex-1 min-w-0 truncate text-apple-gray-600 dark:text-apple-gray-300">{x.label}</span>
                <span className="font-semibold tabular-nums text-apple-gray-800 dark:text-white">{fmt(x.value)}</span>
                <span className="w-5 text-right tabular-nums text-apple-gray-500 dark:text-apple-gray-400">{x.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

// ─── Los 10 de mayor valor ────────────────────────────────────────────────────

function TopPlayersCard({ players, fmt }: { players: { name: string; photo: string; team: string; value: number }[]; fmt: (v: number) => string }) {
  const max = players[0]?.value ?? 1
  return (
    <section className={`${CARD} lg:col-span-5`}>
      <h3 className={`${CARD_TITLE} mb-3`}>Los 10 de mayor valor</h3>
      <ol className="space-y-0.5">
        {players.map(p => (
          <li key={p.name}>
            <Link
              to={`/jugador/${encodeURIComponent(p.name)}?source=interno`}
              className="flex items-center gap-2.5 py-1 px-1.5 -mx-1.5 rounded-lg hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/30 transition-colors"
            >
              <PlayerPhoto src={p.photo} name={p.name} size="sm" rounded="full" />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-apple-gray-800 dark:text-white truncate">{p.name}</span>
                  <span className="text-xs font-bold tabular-nums text-apple-gray-800 dark:text-white flex-shrink-0">{fmt(p.value)}</span>
                </div>
                <div className="mt-1 h-1.5 bg-apple-gray-100 dark:bg-apple-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-green rounded-full" style={{ width: `${Math.max(1.5, (p.value / max) * 100)}%` }} />
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}

// ─── Widget ───────────────────────────────────────────────────────────────────

function Kpi({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white/[0.07] border border-white/10 backdrop-blur-sm px-3.5 py-3 sm:px-4 min-w-0">
      <p className="text-2xs font-medium uppercase tracking-wide text-white/70 truncate">{label}</p>
      <p className="text-2xl sm:text-3xl font-bold text-white tabular-nums mt-1 leading-none">{value}</p>
      <div className="text-xs text-white/75 mt-1.5 min-h-[16px]">{children}</div>
    </div>
  )
}

export default function PortfolioDashboard() {
  const { internal, marketValueHistory, agencyPlayers, loading } = useData()
  const { currency, rate } = useCurrency()
  const [live, setLive] = useState<PortfolioLiveRow[] | null>(null)
  const [teamCountries, setTeamCountries] = useState<Map<number, string>>(new Map())
  const [failed, setFailed] = useState(false)
  const [period, setPeriod] = useState<PortfolioPeriod>('1y')
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  // Ids de Transfermarkt del plantel: entran también los que TM lista con otro representante.
  const rosterTmIds = useMemo(
    () => [...new Set(internal.map(p => tmIdFromUrl(p.Transfermkt)).filter((id): id is number => id != null))].sort((a, b) => a - b).join(','),
    [internal],
  )
  useEffect(() => {
    if (loading) return
    let alive = true
    fetchPortfolioLiveRows(rosterTmIds ? rosterTmIds.split(',').map(Number) : [])
      .then(rows => { if (alive) setLive(rows) })
      .catch(() => { if (alive) { setLive([]); setFailed(true) } })
    return () => { alive = false }
  }, [rosterTmIds, loading])

  const rosterTeamIds = useMemo(
    () => [...new Set(agencyPlayers.map(a => a.apiTeamId).filter((id): id is number => id != null))].sort((a, b) => a - b).join(','),
    [agencyPlayers],
  )
  useEffect(() => {
    if (!rosterTeamIds) return
    let alive = true
    fetchTeamCountries(rosterTeamIds.split(',').map(Number))
      .then(m => { if (alive) setTeamCountries(m) })
      .catch(() => { /* quedan como "Sin dato del país" */ })
    return () => { alive = false }
  }, [rosterTeamIds])

  const fmt = (v: number) => formatMarketValueInCurrency(v, currency, rate)

  const model = useMemo(() => {
    const rows = live ?? []
    const findLive = buildAgencyMatcher(rows.map(r => ({ names: [r.name], value: r })))
    const keyCount = new Map<string, number>()
    for (const p of internal) keyCount.set(identityKey(p.Jugador), (keyCount.get(identityKey(p.Jugador)) ?? 0) + 1)

    const sheetByTm = new Map<string, ValuePoint[]>()
    const sheetByName = new Map<string, ValuePoint[]>()
    for (const e of marketValueHistory) {
      const point = { date: e.fecha.toISOString().slice(0, 10), value: e.valor }
      if (e.idTM) sheetByTm.set(e.idTM, [...(sheetByTm.get(e.idTM) ?? []), point])
      const k = identityKey(e.Jugador)
      sheetByName.set(k, [...(sheetByName.get(k) ?? []), point])
    }

    const findRoster = buildAgencyMatcher(agencyPlayers.map(a => ({ names: [a.fullName, a.shortName], value: a })))

    const joined = internal.map(p => {
      const row = findLive(p.Jugador, keyCount.get(identityKey(p.Jugador)) === 1)
      const sheet = (row?.transfermarktId != null ? sheetByTm.get(String(row.transfermarktId)) : undefined)
        ?? sheetByName.get(identityKey(p.Jugador))
        ?? []
      const seen = new Set(sheet.map(s => s.date))
      const history = [...sheet, ...(row?.snapshots ?? []).filter(s => !seen.has(s.date))].sort((a, b) => a.date.localeCompare(b.date))
      const hasCareerHistory = history.length > 0 && (sheet.length > 0 || history[0].date < DAILY_TRACKING_START)
      const rosterTeam = findRoster(p.Jugador, keyCount.get(identityKey(p.Jugador)) === 1)?.apiTeamId
      const country = row ? row.country : rosterTeam != null ? teamCountries.get(rosterTeam) ?? null : null
      const monthsRemaining = p.monthsRemaining ?? monthsUntil(row?.contractEnd, today)
      return { p, row, history, hasCareerHistory, country, monthsRemaining }
    })

    const seriesPlayers: SeriesPlayer[] = joined.map(j => ({
      currentValue: j.p.marketValueRaw || 0,
      history: j.history,
      hasCareerHistory: j.hasCareerHistory,
    }))
    const shares: SharePlayer[] = joined.map(j => ({
      name: j.p.Jugador,
      value: j.p.marketValueRaw || 0,
      position: FILTER_POSITION_MAP[j.p['Posición']] ?? j.p['Posición'] ?? '',
      monthsRemaining: j.monthsRemaining,
    }))
    const countries = valueByCountry(joined.map(j => ({
      name: j.p.Jugador,
      value: j.p.marketValueRaw || 0,
      country: j.country,
      noClub: j.row?.noClub ?? false,
    })))
    const valued = shares.filter(s => s.value > 0)
    const total = valued.reduce((s, p) => s + p.value, 0)
    const expiring = valued.filter(p => p.monthsRemaining !== null && p.monthsRemaining >= 0 && p.monthsRemaining <= 12)
    const top = [...internal]
      .filter(p => p.marketValueRaw > 0)
      .sort((a, b) => b.marketValueRaw - a.marketValueRaw)
      .slice(0, 10)
      .map(p => ({ name: p.Jugador, photo: p.Imagen, team: p.Equipo, value: p.marketValueRaw }))

    return {
      series: computeTotalSeries(seriesPlayers, today),
      byPosition: valueByPosition(shares),
      byContract: valueByContract(shares),
      countries,
      total,
      playerCount: internal.length,
      valuedCount: valued.length,
      expiringValue: expiring.reduce((s, p) => s + p.value, 0),
      expiringCount: expiring.length,
      top,
    }
  }, [internal, marketValueHistory, agencyPlayers, teamCountries, live, today])

  const series = useMemo(() => sliceSeries(model.series, period, today), [model.series, period, today])
  const change = seriesChange(series)
  const since = PERIODS.find(p => p.id === period)!.since

  if (loading || live === null) {
    return <div className="h-[720px] rounded-apple-lg bg-apple-gray-100 dark:bg-apple-gray-800 animate-pulse" />
  }
  if (internal.length === 0 || model.total === 0) return null

  return (
    <div className="pf-root space-y-4">
      <div className="relative overflow-hidden rounded-apple-lg bg-[#0E0E10] border border-transparent dark:border-apple-gray-700/40 p-4 sm:p-6">
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(700px 280px at 88% -20%, rgba(34,197,94,.30), transparent 70%), radial-gradient(500px 240px at 0% 120%, rgba(34,197,94,.12), transparent 70%)' }} />
        <div className="relative">
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Portfolio de la agencia</h2>
          <p className="text-sm text-white/70 mt-0.5 mb-4">Valores de mercado de Transfermarkt</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            <Kpi label="Valor total" value={fmt(model.total)}>
              {change !== null && (
                <span className="inline-flex items-center gap-1 flex-wrap">
                  <span className={`font-semibold tabular-nums ${change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {change >= 0 ? '▲ +' : '▼ '}{change.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%
                  </span>
                  {since}
                </span>
              )}
            </Kpi>
            <Kpi label="Jugadores" value={String(model.playerCount)}>{model.valuedCount} con valor de mercado</Kpi>
            <Kpi label="Valor promedio" value={fmt(model.total / Math.max(1, model.valuedCount))}>por jugador con valor</Kpi>
            <Kpi label="Vencen en 12 meses" value={model.expiringCount > 0 ? fmt(model.expiringValue) : '€0'}>
              {model.expiringCount} {model.expiringCount === 1 ? 'contrato' : 'contratos'}
            </Kpi>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <TrendCard series={series} period={period} onPeriod={setPeriod} fmt={fmt} today={today} />
        <section className={`${CARD} lg:col-span-5 grid grid-cols-1 min-[420px]:grid-cols-2 gap-5`}>
          <Donut title="Por posición" slices={model.byPosition} colors={POSITION_COLORS} fmt={fmt} total={model.total} />
          <Donut title="Por vencimiento" slices={model.byContract} colors={CONTRACT_COLORS} fmt={fmt} total={model.total} />
        </section>
        <MapCard rows={model.countries.rows} noClub={model.countries.noClub} unknown={model.countries.unknown} fmt={fmt} failed={failed} />
        <TopPlayersCard players={model.top} fmt={fmt} />
      </div>
    </div>
  )
}
