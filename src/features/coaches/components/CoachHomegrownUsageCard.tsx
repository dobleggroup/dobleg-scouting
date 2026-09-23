import { useEffect, useMemo, useRef, useState } from 'react'
import { Bar, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AgencyCoach } from '@/constants/agencyCoaches'
import { loadHomegrownUsage, type HomegrownUsageResult } from '@/services/homegrownUsageService'
import type { SquadCareer } from '@/services/squadCareersService'
import type { HomegrownMatchUsage } from '@/features/coaches/homegrown/homegrownMatchUsage'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { linearTrend, movingAverage } from '@/features/coaches/homegrown/homegrownInsights'
import { buildHomegrownReport, cleanClub, reportFileName } from '@/features/coaches/homegrown/homegrownReport'
import { Collapsible, MinutesShareChart, ParticipationMap, StarterAgeChart, TrendChip } from './HomegrownInsightPanels'
import { useLanguage } from '@/context/LanguageContext'
import { useTheme } from '@/context/ThemeContext'
import { LANGUAGE_LOCALES } from '@/constants/translations'

type LoadState =
  | { status: 'loading' }
  | { status: 'hidden' }
  | { status: 'error' }
  | { status: 'ready'; data: HomegrownUsageResult }

// Paleta ordinal de un solo hue (titulares > ingresados), validada con el script de la
// skill dataviz contra la superficie del panel en cada modo. Titulares siempre llevan el
// verde de marca de ese modo (ver --color-brand-green en index.css).
const PALETTE = {
  light: { starters: '#15803D', subs: '#22C55E', noData: '#D2D2D7', surface: '#F6F6F8', debut: '#15803D', label: '#6E6E73', trend: '#8E8E93' },
  dark: { starters: '#22C55E', subs: '#15803D', noData: '#28282C', surface: '#0B0B0D', debut: '#22C55E', label: '#86868B', trend: '#A1A1A6' },
}
const AXIS_TICK = { fontSize: 9, fill: '#9CA3AF' }
const TREND_WINDOW = 5 // partidos del promedio móvil de las líneas de tendencia
const MIN_BAR_SLOT_PX = 30 // ancho mínimo por partido: con más de ~15 partidos el gráfico scrollea dentro del panel

interface ChartRow {
  fixtureId: number
  label: string
  startersCount: number
  subsCount: number
  noData: number
  /** Apellidos de los chicos que debutaron en Primera en este partido. */
  debutNames: string[]
  /** Promedio móvil (5 partidos) de chicos del club usados: la línea de tendencia. */
  trend: number | null
  match: HomegrownMatchUsage
}

async function loadLogoDataUrl(path: string): Promise<string | undefined> {
  try {
    const blob = await (await fetch(path)).blob()
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader()
      fr.onload = () => resolve(fr.result as string)
      fr.onerror = () => reject(fr.error)
      fr.readAsDataURL(blob)
    })
  } catch {
    return undefined
  }
}

/** Descarga el informe en PDF (dibujado, no una captura): se lee bien impreso y en el celular. */
function ExportPdfButton({ coach, data }: { coach: AgencyCoach; data: HomegrownUsageResult }) {
  const [status, setStatus] = useState<'idle' | 'working' | 'error'>('idle')
  const onClick = async () => {
    setStatus('working')
    try {
      const [{ exportHomegrownPdf }, logoDataUrl] = await Promise.all([
        import('@/features/coaches/homegrown/exportHomegrownPdf'),
        loadLogoDataUrl('/brand/logo-black.png'),
      ])
      const now = new Date()
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      await exportHomegrownPdf(buildHomegrownReport(data, coach), { fileName: reportFileName(coach.fullName, today), today, logoDataUrl })
      setStatus('idle')
    } catch (err) {
      console.error('[homegrown-pdf]', err)
      setStatus('error')
    }
  }
  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      {status === 'error' && <span className="text-2xs text-red-500" role="alert">No se pudo generar. Probá de nuevo.</span>}
      <button
        type="button"
        onClick={onClick}
        disabled={status === 'working'}
        className="inline-flex items-center gap-1.5 rounded-full border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 px-3 py-1.5 text-xs font-medium text-apple-gray-700 dark:text-apple-gray-200 hover:border-brand-green/60 hover:text-brand-green disabled:opacity-60 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/40 transition-colors"
      >
        {status === 'working' ? (
          <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
            <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
            <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
          </svg>
        )}
        {status === 'working' ? 'Generando PDF…' : 'Exportar PDF'}
      </button>
    </div>
  )
}

function StarIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M10 1.8l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.4l-4.94 2.6.94-5.5-4-3.9 5.53-.8L10 1.8z" />
    </svg>
  )
}

function surname(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  return parts.length > 1 ? parts.slice(1).join(' ') : fullName
}

/** El partido del debut de cada debutante: su primera aparición en el ciclo. */
function debutFixtureByPlayer(usage: HomegrownMatchUsage[], debutants: SquadCareer[]): Map<number, string[]> {
  const byFixture = new Map<number, string[]>()
  for (const c of debutants) {
    const first = usage.find(u => [...u.starters, ...u.subsIn].some(p => p.apiPlayerId === c.apiPlayerId))
    if (!first) continue
    byFixture.set(first.fixtureId, [...(byFixture.get(first.fixtureId) ?? []), surname(c.fullName)])
  }
  return byFixture
}

function StatTile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="bg-apple-gray-50 dark:bg-apple-gray-900/40 rounded-apple-lg px-3 py-3 text-center">
      <p className="text-lg sm:text-xl font-bold text-apple-gray-800 dark:text-white tabular-nums">{value}</p>
      <p className="text-[10px] font-semibold text-apple-gray-400 uppercase tracking-wide mt-0.5">{label}</p>
      {detail && <p className="text-2xs text-apple-gray-400 mt-0.5">{detail}</p>}
    </div>
  )
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-[3px]" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}

export default function CoachHomegrownUsageCard({ coach }: { coach: AgencyCoach }) {
  const { t, language } = useLanguage()
  const { theme } = useTheme()
  const locale = LANGUAGE_LOCALES[language]
  const colors = PALETTE[theme === 'dark' ? 'dark' : 'light']
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [openPlayer, setOpenPlayer] = useState<number | null>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })
    loadHomegrownUsage(coach)
      .then(data => { if (active) setState(data ? { status: 'ready', data } : { status: 'hidden' }) })
      .catch(() => { if (active) setState({ status: 'error' }) })
    return () => { active = false }
  }, [coach])

  const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleDateString(locale, opts)

  const rows: ChartRow[] = useMemo(() => {
    if (state.status !== 'ready') return []
    const debuts = debutFixtureByPlayer(state.data.usage, state.data.debutedWithCoach)
    const counts = state.data.usage.map(u => (u.hasData ? u.starters.length + u.subsIn.length : null))
    const trend = movingAverage(counts, TREND_WINDOW)
    return state.data.usage.map((u, i) => ({
      fixtureId: u.fixtureId,
      label: new Date(u.date).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' }),
      startersCount: u.starters.length,
      subsCount: u.subsIn.length,
      noData: u.hasData ? 0 : 0.4,
      debutNames: debuts.get(u.fixtureId) ?? [],
      trend: trend[i],
      match: u,
    }))
  }, [state, locale])

  // En pantallas angostas el gráfico scrollea de costado: arrancar mostrando los partidos
  // más recientes, que son los que importan, en vez de febrero.
  useEffect(() => {
    const el = scrollerRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [rows])

  if (state.status === 'hidden') return null
  if (state.status === 'loading') return <LoadingSpinner message={t('coachDetail.homegrownCargando')} />

  // Va dentro de la tarjeta de temporada (CoachSeasonStatsCard), entre "Local vs. visitante"
  // y "Nosotros vs. rival": sección sin borde propio, igual que sus vecinas.
  const cardClass = 'relative'

  if (state.status === 'error') {
    return (
      <div className={cardClass}>
        <h3 className="text-sm font-semibold text-apple-gray-800 dark:text-white">{t('coachDetail.homegrownTitulo')}</h3>
        <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-1">{t('coachDetail.homegrownError')}</p>
      </div>
    )
  }

  const { data } = state
  const { summary } = data
  const careersById = new Map(data.careers.filter(c => c.apiPlayerId !== null).map(c => [c.apiPlayerId as number, c]))
  const chartMinWidth = rows.length * MIN_BAR_SLOT_PX
  const maxCount = Math.max(1, ...rows.map(r => r.startersCount + r.subsCount))
  const maxDebutsInMatch = Math.max(0, ...rows.map(r => r.debutNames.length))
  const num = (v: number, digits = 1) => v.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  const matchCaption = (u: HomegrownMatchUsage) =>
    `${cleanClub(u.rival)}${u.score ? ` ${u.score}` : ''} · ${fmtDate(u.date, { day: 'numeric', month: 'short' })}`

  // Tendencia de chicos usados por partido (recta sobre todos los partidos del ciclo).
  const countTrend = linearTrend(rows.map(r => (r.match.hasData ? r.startersCount + r.subsCount : null)))

  // % de los minutos del equipo jugados por chicos del club, con su promedio móvil.
  const minutesPct = data.usage.map(u => (u.hasData && u.teamMinutes > 0 ? (u.totalMinutes / u.teamMinutes) * 100 : null))
  const minutesPctAvg = movingAverage(minutesPct, TREND_WINDOW)
  const minutesTrend = linearTrend(minutesPct)
  const minutesRows = data.usage.map((u, i) => ({
    label: rows[i].label,
    value: minutesPct[i] === null ? null : Math.round((minutesPct[i] as number) * 10) / 10,
    trend: minutesPctAvg[i],
    tooltip: `${matchCaption(u)}\n${minutesPct[i] === null ? 'Sin alineación' : `${num(minutesPct[i] as number, 0)}% de los minutos del equipo (${u.totalMinutes.toLocaleString(locale)}')`}`,
  }))

  // Edad promedio de los titulares, con su promedio móvil.
  const ages = data.starterAges.map(a => a.avgAge)
  const agesAvg = movingAverage(ages, TREND_WINDOW)
  const ageTrend = linearTrend(ages)
  const ageRows = data.usage.map((u, i) => ({
    label: rows[i].label,
    value: ages[i] === null ? null : Math.round((ages[i] as number) * 10) / 10,
    trend: agesAvg[i],
    tooltip: `${matchCaption(u)}\n${ages[i] === null ? 'Sin datos suficientes' : `Edad promedio de los titulares: ${num(ages[i] as number)} años`}`,
  }))

  // Partido del debut de cada debutante (para la estrella del mapa) y goles de los chicos.
  const debutByPlayer = new Map<number, number>()
  for (const c of data.debutedWithCoach) {
    const first = data.usage.find(u => [...u.starters, ...u.subsIn].some(p => p.apiPlayerId === c.apiPlayerId))
    if (first && c.apiPlayerId !== null) debutByPlayer.set(c.apiPlayerId, first.fixtureId)
  }
  const totalGoals = [...data.goalsByFixture.values()].reduce((s, g) => s + g.length, 0)
  const trendColors = { accent: colors.starters, trend: colors.trend, surface: colors.surface }

  const renderTooltip = ({ active, payload }: { active?: boolean; payload?: { payload?: ChartRow }[] }) => {
    const row = active ? payload?.[0]?.payload : undefined
    if (!row) return null
    const { match } = row
    const players = [...match.starters, ...match.subsIn]
    return (
      <div className="rounded-lg bg-apple-gray-800 dark:bg-apple-gray-700 text-white px-3 py-2 text-[11px] shadow-apple-md max-w-[240px]">
        <p className="font-semibold">
          {cleanClub(match.rival)}{match.score ? ` · ${match.score}` : ''}
        </p>
        <p className="text-apple-gray-300 mb-1.5">
          {fmtDate(match.date, { day: 'numeric', month: 'short' })} · {match.isHome ? t('coachDetail.homegrownLocal') : t('coachDetail.homegrownVisitante')} · {match.competition}
        </p>
        {row.debutNames.length > 0 && (
          <p className="flex items-center gap-1.5 font-semibold mb-1 text-[#4ADE80]">
            <StarIcon className="w-3 h-3 flex-shrink-0" />
            {t('coachDetail.homegrownDebutoHoy')}: {row.debutNames.join(', ')}
          </p>
        )}
        {!match.hasData && <p className="text-apple-gray-300">{t('coachDetail.homegrownSinDatos')}</p>}
        {players.map(p => (
          <p key={p.apiPlayerId} className="flex justify-between gap-3 tabular-nums">
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="w-2 h-2 rounded-[2px] flex-shrink-0" style={{ backgroundColor: p.started ? colors.starters : colors.subs }} />
              <span className="truncate">{surname(p.name)}</span>
            </span>
            <span className="text-apple-gray-300 whitespace-nowrap">
              {p.minutes}'
              {!p.started && p.inAt !== null && ` (${t('coachDetail.homegrownEntro').replace('{min}', String(p.inAt))})`}
              {p.sentOff && ` · ${t('coachDetail.homegrownRoja')}`}
            </span>
          </p>
        ))}
      </div>
    )
  }

  /** Arriba de cada barra: cuántos jugadores del club jugaron y, si alguno debutó, una estrella encima. */
  const renderBarTop = (props: { x?: number | string; y?: number | string; width?: number | string; index?: number }) => {
    const row = props.index !== undefined ? rows[props.index] : undefined
    if (!row || !row.match.hasData) return null
    const cx = Number(props.x) + Number(props.width) / 2
    const top = Number(props.y)
    const total = row.startersCount + row.subsCount
    return (
      <g>
        <text x={cx} y={top - 5} textAnchor="middle" fontSize={10} fontWeight={600} fill={colors.label} style={{ fontVariantNumeric: 'tabular-nums' }}>
          {total}
        </text>
        {row.debutNames.map((name, i) => {
          const cy = top - 27 - i * 21
          return (
            <g key={name + i}>
              <circle cx={cx} cy={cy} r={9.5} fill={colors.surface} stroke={colors.debut} strokeWidth={1.5} />
              <path transform={`translate(${cx - 6} ${cy - 6}) scale(0.6)`} fill={colors.debut}
                d="M10 1.8l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.4l-4.94 2.6.94-5.5-4-3.9 5.53-.8L10 1.8z" />
            </g>
          )
        })}
      </g>
    )
  }

  return (
    <div className={cardClass}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-apple-gray-800 dark:text-white">{t('coachDetail.homegrownTitulo')}</h3>
        <ExportPdfButton coach={coach} data={data} />
      </div>

      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-apple-gray-700 dark:text-apple-gray-200">
          {t('coachDetail.homegrownResumen')
            .replace('{partidos}', String(summary.matchesWithData))
            .replace('{dt}', coach.fullName)
            .replace('{jugadores}', String(summary.players.length))}
          {data.debutedWithCoach.length > 0 && (
            <> <span className="font-semibold text-apple-gray-900 dark:text-white">
              {t('coachDetail.homegrownResumenDebuts').replace('{n}', String(data.debutedWithCoach.length))}
            </span></>
          )}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
          <StatTile
            label={t('coachDetail.homegrownPromedio')}
            value={summary.avgPlayersPerMatch.toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}
          />
          <StatTile label={t('coachDetail.homegrownPartidosCon')} value={`${summary.matchesWithAny}/${summary.matchesWithData}`} />
          <StatTile
            label={t('coachDetail.homegrownMinutos')}
            value={summary.totalMinutes.toLocaleString(locale)}
            detail={`${(summary.minutesShare * 100).toLocaleString(locale, { maximumFractionDigits: 1 })}% ${t('coachDetail.homegrownPctMinutos')}`}
          />
          <StatTile label={t('coachDetail.homegrownJugadores')} value={String(summary.players.length)} />
          <StatTile label="Goles de chicos del club" value={String(totalGoals)} />
        </div>

        {data.debutedWithCoach.length > 0 && (
          <div className="rounded-apple-lg border border-brand-green/25 bg-brand-green/[0.06] dark:bg-brand-green/[0.08] p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-apple-gray-800 dark:text-white mb-3">
              <StarIcon className="w-4 h-4 text-brand-green flex-shrink-0" />
              {t('coachDetail.homegrownDebutaron').replace('{dt}', coach.fullName)}
            </p>
            <ul className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {data.debutedWithCoach.map(c => (
                <li key={c.tmPlayerId} className="text-sm leading-snug">
                  <span className="font-semibold text-apple-gray-800 dark:text-white">{c.fullName}</span>
                  {c.proDebutDate && (
                    <span className="block text-xs text-apple-gray-500 dark:text-apple-gray-400">
                      {t('coachDetail.homegrownDebutoEl')
                        .replace('{fecha}', fmtDate(c.proDebutDate + 'T12:00:00', { day: 'numeric', month: 'long' }))
                        .replace('{rival}', cleanClub(c.proDebutOpponent ?? ''))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="bg-apple-gray-50 dark:bg-apple-gray-900/40 rounded-apple-lg p-3 sm:p-4">
          {countTrend && (
            <div className="mb-3">
              <TrendChip start={countTrend.start} end={countTrend.end} format={v => num(v)} unit="chicos por partido" threshold={0.3} />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 text-2xs text-apple-gray-500 dark:text-apple-gray-400">
            <LegendSwatch color={colors.starters} label={t('coachDetail.homegrownTitulares')} />
            <LegendSwatch color={colors.subs} label={t('coachDetail.homegrownIngresados')} />
            {data.debutedWithCoach.length > 0 && (
              <span className="flex items-center gap-1.5">
                <StarIcon className="w-3 h-3" style={{ color: colors.debut }} />
                {t('coachDetail.homegrownMarcaDebut')}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <svg width="18" height="6" aria-hidden="true"><line x1="0" y1="3" x2="18" y2="3" stroke={colors.trend} strokeWidth="1.5" strokeDasharray="4 3" /></svg>
              Tendencia (promedio de {TREND_WINDOW} partidos)
            </span>
          </div>

          <div ref={scrollerRef} className="overflow-x-auto overflow-y-hidden -mx-1 px-1">
            <div style={{ minWidth: chartMinWidth }}>
              <p className="text-2xs font-medium text-apple-gray-500 dark:text-apple-gray-400">{t('coachDetail.homegrownJugadoresPartido')}</p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={rows} margin={{ top: 18 + maxDebutsInMatch * 21, right: 4, bottom: 0, left: 4 }} barCategoryGap="22%">
                    <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} interval={0} height={20} />
                    {/* El número va arriba de cada barra: el eje Y sería redundante. */}
                    <YAxis hide allowDecimals={false} domain={[0, maxCount]} />
                    <Tooltip content={renderTooltip} cursor={{ fill: theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }} />
                    <Bar dataKey="noData" stackId="n" fill={colors.noData} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="startersCount" stackId="n" fill={colors.starters} stroke={colors.surface} strokeWidth={1} isAnimationActive={false} />
                    <Bar dataKey="subsCount" stackId="n" fill={colors.subs} stroke={colors.surface} strokeWidth={1} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                      <LabelList dataKey="subsCount" content={renderBarTop} />
                    </Bar>
                    <Line type="monotone" dataKey="trend" stroke={colors.trend} strokeWidth={1.75} strokeDasharray="5 4" dot={false} activeDot={false} isAnimationActive={false} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Collapsible
            title="Minutos de los chicos del club"
            summary={minutesTrend ? `Qué parte de los minutos del equipo jugaron: de ${num(minutesTrend.start, 0)}% a ${num(minutesTrend.end, 0)}% en el ciclo` : 'Qué parte de los minutos del equipo jugaron en cada partido'}
          >
            {minutesTrend && (
              <div className="mb-3">
                <TrendChip start={minutesTrend.start} end={minutesTrend.end} format={v => `${num(v, 0)}%`} unit="de los minutos" threshold={3} />
              </div>
            )}
            <MinutesShareChart rows={minutesRows} colors={trendColors} minWidth={chartMinWidth} />
          </Collapsible>

          <Collapsible title="Quién jugó cada partido" summary="Un vistazo a la continuidad de cada chico: minutos, debut y goles, partido por partido">
            <ParticipationMap
              players={summary.players}
              usage={data.usage}
              labels={rows.map(r => r.label)}
              debutByPlayer={debutByPlayer}
              goalsByFixture={data.goalsByFixture}
              accent={colors.starters}
            />
          </Collapsible>

          <Collapsible
            title="¿Se rejuveneció el equipo?"
            summary={ageTrend ? `Edad promedio de los titulares: de ${num(ageTrend.start)} a ${num(ageTrend.end)} años` : 'Edad promedio de los titulares en cada partido'}
          >
            {ageTrend && (
              <div className="mb-3">
                <TrendChip start={ageTrend.start} end={ageTrend.end} format={v => num(v)} unit="años" goodWhenUp={false} threshold={0.4} />
              </div>
            )}
            <StarterAgeChart rows={ageRows} colors={trendColors} minWidth={chartMinWidth} />
          </Collapsible>
        </div>
      </div>

      {summary.players.length > 0 && (
        <div className="mt-4">
          <div className="grid grid-cols-[1fr_repeat(3,3rem)] sm:grid-cols-[1fr_repeat(3,4rem)] px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-apple-gray-400">
            <span>{t('coachDetail.homegrownJugador')}</span>
            <span className="text-right">{t('coachDetail.homegrownPJ')}</span>
            <span className="text-right">{t('coachDetail.homegrownTit')}</span>
            <span className="text-right">{t('coachDetail.homegrownMin')}</span>
          </div>
          <ul className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700/40 border-y border-apple-gray-100 dark:border-apple-gray-700/40">
            {summary.players.map(p => {
              const career = careersById.get(p.apiPlayerId)
              const open = openPlayer === p.apiPlayerId
              return (
                <li key={p.apiPlayerId}>
                  <button
                    type="button"
                    onClick={() => setOpenPlayer(open ? null : p.apiPlayerId)}
                    aria-expanded={open}
                    aria-label={t('coachDetail.homegrownVerCarrera').replace('{nombre}', p.name)}
                    className="w-full grid grid-cols-[1fr_repeat(3,3rem)] sm:grid-cols-[1fr_repeat(3,4rem)] items-center px-3 py-2.5 text-left text-sm hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/40 rounded-md transition-colors"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <svg className={`w-3 h-3 flex-shrink-0 text-apple-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                      </svg>
                      <span className="font-medium text-apple-gray-800 dark:text-white truncate">{p.name}</span>
                      {career?.position && <span className="hidden sm:inline text-2xs text-apple-gray-400 truncate">{career.position}</span>}
                    </span>
                    <span className="text-right tabular-nums text-apple-gray-700 dark:text-apple-gray-300">{p.appearances}</span>
                    <span className="text-right tabular-nums text-apple-gray-700 dark:text-apple-gray-300">{p.starts}</span>
                    <span className="text-right tabular-nums font-semibold text-apple-gray-800 dark:text-white">{p.minutes.toLocaleString(locale)}</span>
                  </button>
                  {open && career && <CareerDetail career={career} fmtDate={fmtDate} />}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

function CareerDetail({ career, fmtDate }: { career: SquadCareer; fmtDate: (iso: string, opts: Intl.DateTimeFormatOptions) => string }) {
  const { t } = useLanguage()
  const day = (iso: string) => fmtDate(iso.slice(0, 10) + 'T12:00:00', { day: 'numeric', month: 'short', year: 'numeric' })
  return (
    <div className="px-3 pb-3 pl-8 grid gap-3 sm:grid-cols-3 text-xs animate-fade-in">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-apple-gray-400 mb-1">{t('coachDetail.homegrownDebut')}</p>
        {career.proDebutDate ? (
          <p className="text-apple-gray-700 dark:text-apple-gray-300 leading-relaxed">
            <span className="font-semibold text-apple-gray-800 dark:text-white">{day(career.proDebutDate)}</span>
            {career.proDebutOpponent && <> vs {cleanClub(career.proDebutOpponent)}</>}
            {career.proDebutCompetition && <span className="block text-apple-gray-400">{career.proDebutCompetition}</span>}
            {career.proDebutCoach && <span className="block text-apple-gray-400">{t('coachDetail.homegrownDT')}: {career.proDebutCoach}</span>}
          </p>
        ) : (
          <p className="text-apple-gray-400">{t('coachDetail.homegrownSinDebut')}</p>
        )}
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-apple-gray-400 mb-1">{t('coachDetail.homegrownJuveniles')}</p>
        <p className="text-apple-gray-700 dark:text-apple-gray-300">{career.youthClubs.length ? career.youthClubs.join(' › ') : '—'}</p>
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-apple-gray-400 mb-1">{t('coachDetail.homegrownTrayectoria')}</p>
        {career.transferHistory.length ? (
          <ol className="space-y-0.5 text-apple-gray-700 dark:text-apple-gray-300">
            {career.transferHistory.map((tr, i) => (
              <li key={`${tr.date}-${i}`} className="tabular-nums">
                <span className="text-apple-gray-400">{day(tr.date)}</span> {tr.fromName} › {tr.toName}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-apple-gray-400">{t('coachDetail.homegrownSinPases')}</p>
        )}
      </div>
    </div>
  )
}
