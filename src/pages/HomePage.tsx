import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AGENCY_PLAYERS } from '@/constants/agencyPlayers'
import { fetchAllAgencyFixtures, getFixturesForDate, groupFixturesByDate } from '@/services/footballApiService'
import { fetchManualFixtures, manualToAgencyFixtures } from '@/services/agencyManualFixturesService'
import { fetchAgencyPerformanceRows, aggregatePerformance, type PerformancePeriod, type AgencyPlayerPerformance } from '@/services/agencyPerformanceService'
import type { SquadStatRow } from '@/services/playerStatsService'
import { fetchDebutAlerts, type DebutAlert } from '@/services/debutAlertsService'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { useData } from '@/context/DataContext'
import { useCurrency } from '@/context/CurrencyContext'
import { formatMarketValueInCurrency } from '@/utils/scoring'
import { LANGUAGE_LOCALES, type Language } from '@/constants/translations'
import type { AgencyFixture } from '@/types/footballApi'
import type { EnrichedPlayer, TrackingStatus, ScoutPlayerStatusRecord } from '@/types'
import { fetchScoutPlayersWithScores, fetchScoutPlayerStatuses, fetchScoutPlayers, type ScoutPlayerWithScore } from '@/services/scoutPlayersService'
import { PlayerPhoto } from '@/components/ui/PlayerPhoto'
import OpportunityHero from '@/components/dashboard/OpportunityHero'
import PortfolioValueChart from '@/components/charts/PortfolioValueChart'
import AgencyClassificationInsights from '@/components/dashboard/AgencyClassificationInsights'
import PortfolioInsights from '@/components/dashboard/PortfolioInsights'
import { FILTER_POSITION_MAP } from '@/constants/scoring'
import { useRecentForm, useLeagues } from '@/hooks/usePlayerStats'
import { isApiFootballPlayer } from '@/services/playerStatsService'
import { excludeAgencyPlayers } from '@/utils/agencyFilter'
import type { RecentFormPlayer, LeagueInfo } from '@/types/scoring'

const AR_TZ = 'America/Argentina/Buenos_Aires'

// Nombres de día/mes vía Intl según el idioma activo, no arrays fijos en
// español — evita mantener 9 listas de días/meses a mano por idioma.
function formatDateLong(date: Date, language: Language): string {
  return new Intl.DateTimeFormat(LANGUAGE_LOCALES[language], {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: AR_TZ,
  }).format(date)
}

function formatDateShort(date: Date, language: Language): string {
  return new Intl.DateTimeFormat(LANGUAGE_LOCALES[language], {
    day: 'numeric', month: 'short', timeZone: AR_TZ,
  }).format(date)
}

function formatDayShort(date: Date, language: Language): string {
  return new Intl.DateTimeFormat(LANGUAGE_LOCALES[language], {
    weekday: 'short', timeZone: AR_TZ,
  }).format(date).toUpperCase()
}

function dateKey(date: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).format(date)
}

function getGreetingKey(): string {
  const h = parseInt(new Intl.DateTimeFormat('es-AR', {
    hour: 'numeric', hour12: false,
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date()), 10)
  if (h < 12) return 'greeting.morning'
  if (h < 19) return 'greeting.afternoon'
  return 'greeting.evening'
}

function formatMatchTime(dateStr: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date(dateStr))
}

function isSameDay(a: Date, b: Date): boolean {
  return dateKey(a) === dateKey(b)
}

function isMatchFinished(status: string): boolean {
  return ['FT', 'AET', 'PEN'].includes(status)
}

function isMatchLive(status: string): boolean {
  return ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE'].includes(status)
}

function isAbroad(fixture: AgencyFixture): boolean {
  return fixture.leagueCountry !== 'Argentina'
}

// ─── Bloque de sección genérico (título + link "ver todo" opcional) ───────────

function HomeSection({ title, badge, action, children }: {
  title: string
  badge?: number
  action?: { label: string; to: string }
  children: React.ReactNode
}) {
  return (
    <section className="bg-white dark:bg-apple-gray-800 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <h2 className="text-base font-semibold text-apple-gray-800 dark:text-white">{title}</h2>
          {badge !== undefined && badge > 0 && (
            <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-md bg-brand-green/15 text-brand-green text-2xs font-bold">
              {badge}
            </span>
          )}
        </div>
        {action && (
          <Link to={action.to} className="text-xs font-medium text-brand-green hover:text-emerald-600 transition-colors flex-shrink-0">
            {action.label} →
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

// ─── Separador de sección (Scout Interno / Scout Externo) ──────────────────

function SectionDivider({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 pt-4">
      <div className="w-10 h-10 rounded-xl bg-brand-green/10 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div>
        <h2 className="text-lg font-bold text-apple-gray-800 dark:text-white tracking-tight">{title}</h2>
        <p className="text-xs text-apple-gray-400 dark:text-apple-gray-500">{subtitle}</p>
      </div>
      <div className="flex-1 h-px bg-apple-gray-200 dark:bg-apple-gray-700/60 ml-2" />
    </div>
  )
}

// ─── Accesos rápidos ────────────────────────────────────────────────────────

function QuickAccess() {
  const { t } = useLanguage()
  const items = [
    { to: '/interno', label: t('home.qaPlantel'), icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
    { to: '/scouting', label: t('home.qaScouting'), icon: 'M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z' },
    { to: '/seguimiento-gg', label: t('home.qaSeguimiento'), icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
    { to: '/mercado', label: t('home.qaMercado'), icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
  ]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map(it => (
        <Link
          key={it.to}
          to={it.to}
          className="flex flex-col items-center justify-center gap-2 py-4 rounded-apple-lg bg-white dark:bg-apple-gray-800 border border-apple-gray-200/60 dark:border-apple-gray-700/40 hover:border-brand-green/40 hover:shadow-apple dark:hover:shadow-apple-dark hover:-translate-y-0.5 transition-all"
        >
          <div className="w-9 h-9 rounded-full bg-brand-green/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={it.icon} />
            </svg>
          </div>
          <span className="text-xs font-medium text-apple-gray-700 dark:text-apple-gray-200">{it.label}</span>
        </Link>
      ))}
    </div>
  )
}

// ─── Resumen (KPIs) ─────────────────────────────────────────────────────────

function SummaryCards({ internal }: { internal: EnrichedPlayer[] }) {
  const { t } = useLanguage()
  const { currency, rate } = useCurrency()
  const totalValue = internal.reduce((sum, p) => sum + (p.marketValueRaw || 0), 0)
  const critical = internal.filter(p => p.monthsRemaining !== null && p.monthsRemaining <= 6).length

  // La lista `monitoring` de DataContext (CSV) está vacía -- el dato real de
  // "en seguimiento" vive en `scout_players` (in_scouts_gg_list), la misma
  // fuente que usan SeguimientoWidget y /seguimiento-gg. Antes esta tarjeta
  // mostraba siempre 0 porque leía de `monitoring.length`.
  const [seguimientoCount, setSeguimientoCount] = useState<number | null>(null)
  useEffect(() => {
    let alive = true
    fetchScoutPlayers('scouts_gg').then(p => { if (alive) setSeguimientoCount(p.length) }).catch(() => { if (alive) setSeguimientoCount(0) })
    return () => { alive = false }
  }, [])

  const cards = [
    {
      label: t('home.kpiJugadores'), value: String(internal.length), to: '/interno',
      icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
      iconBg: 'bg-apple-gray-100 dark:bg-apple-gray-700/60', iconColor: 'text-apple-gray-500 dark:text-apple-gray-300',
    },
    {
      label: t('home.kpiValorPortfolio'), value: formatMarketValueInCurrency(totalValue, currency, rate), to: '/interno',
      icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
      iconBg: 'bg-brand-green/10', iconColor: 'text-brand-green',
    },
    {
      label: t('home.kpiContratosCriticos'), value: String(critical), alert: critical > 0, to: '/interno',
      icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
      iconBg: 'bg-red-500/10', iconColor: 'text-red-500',
    },
    {
      label: t('home.kpiSeguimiento'), value: seguimientoCount === null ? '—' : String(seguimientoCount), to: '/seguimiento-gg',
      icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
      iconBg: 'bg-sky-500/10', iconColor: 'text-sky-500',
    },
  ]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map(c => (
        <Link
          key={c.label}
          to={c.to}
          className="group flex flex-col bg-white dark:bg-apple-gray-800 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 p-4 hover:border-brand-green/40 hover:shadow-apple dark:hover:shadow-apple-dark hover:-translate-y-0.5 transition-all"
        >
          <div className="flex items-center justify-between mb-2.5">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center ${c.iconBg}`}>
              <svg className={`w-3.5 h-3.5 ${c.iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={c.icon} />
              </svg>
            </div>
            <svg className="w-3.5 h-3.5 text-apple-gray-300 dark:text-apple-gray-600 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <p className="text-2xs font-medium text-apple-gray-400 dark:text-apple-gray-500 uppercase tracking-wide mb-1">{c.label}</p>
          <p className={`text-xl font-bold tabular-nums ${c.alert ? 'text-red-500' : 'text-apple-gray-800 dark:text-white'}`}>{c.value}</p>
        </Link>
      ))}
    </div>
  )
}

// ─── Rendimiento de la agencia (minutos reales, por período) ──────────────────

function PerformanceWidget({ rows }: { rows: SquadStatRow[] | null }) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [period, setPeriod] = useState<PerformancePeriod>('month')

  const loading = rows === null
  const data = useMemo(() => rows ? aggregatePerformance(period, rows, AGENCY_PLAYERS) : null, [rows, period])
  // Filtra el pie de "sin rodaje" a equipos con evidencia de partidos
  // recientes cargados — ver nota en `teamsWithRecentActivity`.
  const reliableNoMinutes = useMemo(() => {
    if (!rows || !data) return []
    const activeTeams = teamsWithRecentActivity(rows, 30)
    const apiTeamIdByName = new Map(AGENCY_PLAYERS.map(p => [p.fullName, p.apiTeamId]))
    return data.noMinutes.filter(name => {
      const teamId = apiTeamIdByName.get(name)
      return teamId != null && activeTeams.has(teamId)
    })
  }, [rows, data])

  const periods: { id: PerformancePeriod; label: string }[] = [
    { id: 'month', label: t('home.perfUltimoMes') },
    { id: '6months', label: t('home.perf6Meses') },
    { id: 'year', label: t('home.perfUltimoAnio') },
  ]

  return (
    <HomeSection title={t('home.rendimientoAgencia')}>
      <div className="flex gap-1 bg-apple-gray-100 dark:bg-apple-gray-700/50 p-1 rounded-apple w-fit mb-4">
        {periods.map(p => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              period === p.id
                ? 'bg-white dark:bg-apple-gray-800 text-apple-gray-800 dark:text-white shadow-apple dark:shadow-apple-dark'
                : 'text-apple-gray-500 dark:text-apple-gray-400'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="h-32 animate-pulse bg-apple-gray-100 dark:bg-apple-gray-700/40 rounded-apple" />
      ) : !data || data.byPlayer.length === 0 ? (
        <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 text-center py-6">{t('home.sinMinutosPeriodo')}</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-apple-gray-800 dark:text-white tabular-nums">{data.totalMinutes.toLocaleString('es-AR')}</p>
              <p className="text-2xs text-apple-gray-400 dark:text-apple-gray-500 uppercase tracking-wide mt-0.5">{t('home.minutosTotales')}</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-apple-gray-800 dark:text-white tabular-nums">{data.totalStarts}</p>
              <p className="text-2xs text-apple-gray-400 dark:text-apple-gray-500 uppercase tracking-wide mt-0.5">{t('home.titularidades')}</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-apple-gray-800 dark:text-white tabular-nums">{data.totalMatches}</p>
              <p className="text-2xs text-apple-gray-400 dark:text-apple-gray-500 uppercase tracking-wide mt-0.5">Partidos</p>
            </div>
          </div>

          <div className="space-y-1.5 mb-3">
            {data.byPlayer.slice(0, 5).map(p => {
              const player = AGENCY_PLAYERS.find(ap => ap.fullName === p.fullName)
              const pct = Math.min(100, (p.minutes / data.byPlayer[0].minutes) * 100)
              return (
                <button
                  key={p.fullName}
                  onClick={() => navigate(`/jugador/${encodeURIComponent(p.fullName)}?source=interno`)}
                  className="w-full flex items-center gap-3 py-1.5 text-left rounded-lg px-1.5 -mx-1.5 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/30 transition-colors"
                >
                  <PlayerPhoto src={player?.image ?? null} name={p.fullName} size="sm" rounded="full" />
                  <span className="text-xs font-medium text-apple-gray-700 dark:text-apple-gray-200 w-28 truncate flex-shrink-0">{p.fullName}</span>
                  <div className="flex-1 h-1.5 bg-apple-gray-100 dark:bg-apple-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-green rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs tabular-nums text-apple-gray-500 dark:text-apple-gray-400 w-12 text-right flex-shrink-0">{p.minutes}'</span>
                </button>
              )
            })}
          </div>

          {reliableNoMinutes.length > 0 && (
            <p className="text-2xs text-apple-gray-400 dark:text-apple-gray-500 pt-2 border-t border-apple-gray-100 dark:border-apple-gray-700/40">
              {t('home.sinRodaje')}: {reliableNoMinutes.slice(0, 4).join(', ')}{reliableNoMinutes.length > 4 ? '…' : ''}
            </p>
          )}
        </>
      )}
    </HomeSection>
  )
}

// ─── Debutantes ─────────────────────────────────────────────────────────────

function DebutantesWidget() {
  const { t, language } = useLanguage()
  const [alerts, setAlerts] = useState<DebutAlert[] | null>(null)

  useEffect(() => {
    let alive = true
    fetchDebutAlerts().then(a => { if (alive) setAlerts(a) }).catch(() => { if (alive) setAlerts([]) })
    return () => { alive = false }
  }, [])

  const recent = (alerts ?? []).slice(0, 8)

  return (
    <HomeSection title={t('home.debutantes')} action={{ label: t('home.verTodos'), to: '/debutantes' }}>
      {alerts === null ? (
        <div className="h-32 animate-pulse bg-apple-gray-100 dark:bg-apple-gray-700/40 rounded-apple" />
      ) : recent.length === 0 ? (
        <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 text-center py-6">{t('home.sinDebutantes')}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {recent.map(a => (
            <div key={`${a.playerId}-${a.debutDate}`} className="flex items-center gap-3 py-2 px-2.5 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-700/30 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700/50 transition-colors">
              <PlayerPhoto src={a.photo} name={a.playerName} size="sm" rounded="full" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-apple-gray-800 dark:text-white truncate">{a.playerName}</p>
                <p className="text-2xs text-apple-gray-400 dark:text-apple-gray-500 truncate">
                  {a.teamName} · {formatDateShort(new Date(`${a.debutDate}T00:00:00`), language)}
                </p>
              </div>
              {a.rating != null && (
                <span className="text-xs font-bold text-brand-green bg-brand-green/10 rounded-full px-2 py-1 flex-shrink-0 tabular-nums">{a.rating.toFixed(1)}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </HomeSection>
  )
}

// ─── Contratos por vencer ───────────────────────────────────────────────────

function ContractAlertsWidget({ internal }: { internal: EnrichedPlayer[] }) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const alerts = useMemo(() =>
    [...internal]
      .filter(p => p.monthsRemaining !== null && p.monthsRemaining <= 12 && p.monthsRemaining >= 0)
      .sort((a, b) => (a.monthsRemaining ?? 999) - (b.monthsRemaining ?? 999))
      .slice(0, 5),
    [internal],
  )

  return (
    <HomeSection title={t('home.contratosPorVencer')} action={{ label: t('home.verTodos'), to: '/interno' }}>
      {alerts.length === 0 ? (
        <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 text-center py-6">{t('home.sinContratosProximos')}</p>
      ) : (
        <div className="space-y-1">
          {alerts.map(p => (
            <button
              key={p.Jugador}
              onClick={() => navigate(`/jugador/${encodeURIComponent(p.Jugador)}?source=interno`)}
              className="w-full flex items-center gap-3 py-2 px-1.5 -mx-1.5 rounded-lg hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/30 transition-colors text-left"
            >
              <PlayerPhoto src={p.Imagen} name={p.Jugador} size="sm" rounded="full" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-apple-gray-800 dark:text-white truncate">{p.Jugador}</p>
                <p className="text-2xs text-apple-gray-400 dark:text-apple-gray-500 truncate">{p.Equipo}</p>
              </div>
              <span className={`text-xs font-bold flex-shrink-0 ${(p.monthsRemaining ?? 99) <= 6 ? 'text-red-500' : 'text-amber-500'}`}>
                {p.monthsRemaining}m
              </span>
            </button>
          ))}
        </div>
      )}
    </HomeSection>
  )
}

// ─── Cumpleaños del plantel ─────────────────────────────────────────────────

function daysUntilBirthday(birthDate: string, today: Date): number {
  const [, m, d] = birthDate.split('-').map(Number)
  const year = today.getUTCFullYear()
  let next = Date.UTC(year, m - 1, d)
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  if (next < todayUtc) next = Date.UTC(year + 1, m - 1, d)
  return Math.round((next - todayUtc) / (24 * 60 * 60 * 1000))
}

function BirthdaysWidget({ today, internal }: { today: Date; internal: EnrichedPlayer[] }) {
  const { t } = useLanguage()
  const upcoming = useMemo(() => {
    // `birthDateLive` (Transfermarkt, vía `players`) alcanza a casi todo el
    // plantel — el `birthDate` estático de agencyPlayers.ts sólo lo tenía
    // cargado a mano para 2 de 39 jugadores. Se usa como fallback igual, por
    // si a alguno le falta el vínculo vivo.
    const byName = new Map<string, string>()
    for (const p of internal) {
      const live = p.birthDateLive
      if (typeof live === 'string' && live) byName.set(normalizeNameLocal(p.Jugador), live)
    }
    const seen = new Set<string>()
    const out: { fullName: string; image: string | null; team: string; days: number }[] = []
    for (const p of AGENCY_PLAYERS) {
      const key = normalizeNameLocal(p.fullName)
      const birthDate = byName.get(key) ?? p.birthDate ?? null
      if (!birthDate || seen.has(key)) continue
      seen.add(key)
      out.push({ fullName: p.fullName, image: p.image, team: p.team, days: daysUntilBirthday(birthDate, today) })
    }
    return out.sort((a, b) => a.days - b.days).slice(0, 8)
  }, [today, internal])

  return (
    <HomeSection title={t('home.cumpleanos')}>
      {upcoming.length === 0 ? (
        <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 text-center py-6">{t('home.sinCumpleanos')}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {upcoming.map(player => (
            <div key={player.fullName} className="flex items-center gap-3 py-2 px-2.5 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-700/30 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700/50 transition-colors">
              <PlayerPhoto src={player.image} name={player.fullName} size="sm" rounded="full" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-apple-gray-800 dark:text-white truncate">{player.fullName}</p>
                <p className="text-2xs text-apple-gray-400 dark:text-apple-gray-500 truncate">{player.team}</p>
              </div>
              <span className="text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400 flex-shrink-0">
                {player.days === 0 ? t('home.hoy') : t('home.enXDias').replace('{n}', String(player.days))}
              </span>
            </div>
          ))}
        </div>
      )}
    </HomeSection>
  )
}

// ─── Ranking genérico (Top Rendimiento / Mayor Valor / Jóvenes Promesas) ────
// Un solo componente para las 3 listas ordenadas: comparten podio + foto +
// nombre, sólo cambia qué métrica final se muestra por fila.

function RankingList({ players, renderMetric }: { players: EnrichedPlayer[]; renderMetric: (p: EnrichedPlayer) => React.ReactNode }) {
  const navigate = useNavigate()
  return (
    <div className="space-y-1">
      {players.map((p, i) => (
        <button
          key={p.Jugador}
          onClick={() => navigate(`/jugador/${encodeURIComponent(p.Jugador)}?source=interno`)}
          className="w-full flex items-center gap-3 py-1.5 px-1.5 -mx-1.5 rounded-lg hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/30 transition-colors text-left"
        >
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-2xs font-bold flex-shrink-0 ${
            i === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' :
            i === 1 ? 'bg-apple-gray-200 text-apple-gray-600 dark:bg-apple-gray-600 dark:text-apple-gray-300' :
            i === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400' :
            'bg-apple-gray-100 text-apple-gray-500 dark:bg-apple-gray-700 dark:text-apple-gray-400'
          }`}>
            {i + 1}
          </div>
          <PlayerPhoto src={p.Imagen} name={p.Jugador} size="sm" rounded="full" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-apple-gray-800 dark:text-white truncate">{p.Jugador}</p>
            <p className="text-2xs text-apple-gray-400 dark:text-apple-gray-500 truncate">{p.Equipo}</p>
          </div>
          {renderMetric(p)}
        </button>
      ))}
    </div>
  )
}

// ─── Rating por Posición ────────────────────────────────────────────────────
// Usa directamente `p.rating` (ya viene 1-10 de la API) en vez de recalcularlo.

const POSITION_GROUPS: Record<string, string> = {
  'Arquero': 'Arquero',
  'Defensor Central': 'Defensor Central',
  'Lateral Derecho': 'Lateral', 'Lateral Izquierdo': 'Lateral', 'Lateral': 'Lateral',
  'Volante Central': 'Volante Central',
  'Volante Interno': 'Volante Interno',
  'Extremo Derecho': 'Extremo', 'Extremo Izquierdo': 'Extremo', 'Extremo': 'Extremo',
  'Delantero': 'Delantero',
}
const POSITION_ORDER = ['Arquero', 'Defensor Central', 'Lateral', 'Volante Central', 'Volante Interno', 'Extremo', 'Delantero']

function PositionRatingWidget({ internal }: { internal: EnrichedPlayer[] }) {
  const groups = useMemo(() => {
    const acc: Record<string, number[]> = {}
    for (const p of internal) {
      if (p.rating === null) continue
      const normPos = FILTER_POSITION_MAP[p['Posición']] ?? ''
      const group = POSITION_GROUPS[normPos]
      if (!group) continue
      ;(acc[group] ??= []).push(p.rating)
    }
    return POSITION_ORDER
      .filter(g => acc[g]?.length)
      .map(g => ({ label: g, count: acc[g].length, avg: acc[g].reduce((s, v) => s + v, 0) / acc[g].length }))
  }, [internal])

  if (groups.length === 0) return null

  return (
    <HomeSection title="Rating por posición">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {groups.map(({ label, avg, count }) => {
          const colorClass = avg >= 7.3 ? 'text-emerald-400' : avg >= 6.8 ? 'text-emerald-500' : avg >= 6.4 ? 'text-amber-500' : 'text-orange-500'
          const barColor = avg >= 7.3 ? 'bg-emerald-400' : avg >= 6.8 ? 'bg-emerald-500' : avg >= 6.4 ? 'bg-amber-500' : 'bg-orange-500'
          const barWidth = Math.min(100, Math.max(0, ((avg - 5.5) / (8.5 - 5.5)) * 100))
          return (
            <div key={label} className="flex flex-col gap-1.5 rounded-lg p-2 -m-2 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/30 transition-colors">
              <div className="flex items-end justify-between">
                <span className="text-xs text-apple-gray-500 dark:text-apple-gray-400 leading-tight">{label}</span>
                <span className="text-2xs text-apple-gray-400 tabular-nums">{count}j</span>
              </div>
              <div className={`text-xl font-bold tabular-nums ${colorClass}`}>{avg.toFixed(1)}</div>
              <div className="h-1.5 bg-apple-gray-100 dark:bg-apple-gray-700 rounded-full overflow-hidden">
                <div className={`h-full ${barColor} rounded-full`} style={{ width: `${barWidth}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </HomeSection>
  )
}

// ─── Jugadores en riesgo (señal negativa: caída de minutos) ────────────────
// Compara los últimos 30 días contra los 30 anteriores usando las mismas
// filas cacheadas de `player_match_stats` — sin fetch extra. Dos motivos de
// alerta: se quedó sin minutos de golpe, o los minutos cayeron a la mitad.

interface AtRiskPlayer {
  fullName: string
  current: number
  previous: number
  reason: 'sin_minutos' | 'baja'
}

// El sync de fixtures se corta para algunos equipos sin avisar (caso real:
// Benfica, último fixture cargado 2026-05-16 — 4 meses viejo — mientras el
// resto de la app sigue en septiembre). Sin este chequeo, un jugador de un
// equipo con el sync roto sale como "0 minutos"/"en riesgo" aunque en
// realidad viene jugando normal — el problema es que la base no tiene sus
// partidos, no que no los tenga. Se exige evidencia de que el EQUIPO (no
// necesariamente el jugador puntual) tuvo algún partido cargado en la
// ventana reciente antes de confiar en cualquier "0 minutos" de ese equipo.
function teamsWithRecentActivity(rows: SquadStatRow[], withinDays: number): Set<number> {
  const now = Date.now()
  const cutoff = now - withinDays * 24 * 60 * 60 * 1000
  const active = new Set<number>()
  for (const row of rows) {
    const date = row.fixture?.date
    if (!date) continue
    if (new Date(date).getTime() >= cutoff) active.add(row.team_id)
  }
  return active
}

function computeAtRiskPlayers(rows: SquadStatRow[], roster: { fullName: string; apiTeamId: number | null }[]): AtRiskPlayer[] {
  const now = Date.now()
  const DAY = 24 * 60 * 60 * 1000
  const activeTeams = teamsWithRecentActivity(rows, 30)
  const rosterByNormalized = new Map(roster.map(p => [normalizeNameLocal(p.fullName), p.fullName]))
  const current = new Map<string, number>()
  const previous = new Map<string, number>()

  for (const row of rows) {
    const rawName = row.player?.name
    const date = row.fixture?.date
    if (!rawName || !date) continue
    const fullName = rosterByNormalized.get(normalizeNameLocal(rawName))
    if (!fullName) continue
    const ageMs = now - new Date(date).getTime()
    const minutes = row.minutes ?? 0
    if (ageMs >= 0 && ageMs < 30 * DAY) {
      current.set(fullName, (current.get(fullName) ?? 0) + minutes)
    } else if (ageMs >= 30 * DAY && ageMs < 60 * DAY) {
      previous.set(fullName, (previous.get(fullName) ?? 0) + minutes)
    }
  }

  const out: AtRiskPlayer[] = []
  for (const p of roster) {
    if (p.apiTeamId == null || !activeTeams.has(p.apiTeamId)) continue
    const prev = previous.get(p.fullName) ?? 0
    const curr = current.get(p.fullName) ?? 0
    if (prev < 45) continue // sin base previa confiable, no comparamos
    if (curr === 0) {
      out.push({ fullName: p.fullName, current: curr, previous: prev, reason: 'sin_minutos' })
    } else if (curr < prev * 0.5) {
      out.push({ fullName: p.fullName, current: curr, previous: prev, reason: 'baja' })
    }
  }
  return out.sort((a, b) => (b.previous - b.current) - (a.previous - a.current)).slice(0, 8)
}

// normalizeName vive en utils/scoring — copiado acá liviano (sin accents) para
// no importar el módulo entero sólo por esto en un archivo ya grande.
function normalizeNameLocal(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function AtRiskWidget({ rows }: { rows: SquadStatRow[] | null }) {
  const navigate = useNavigate()
  const players = useMemo(() => rows ? computeAtRiskPlayers(rows, AGENCY_PLAYERS) : [], [rows])

  if (rows === null) {
    return (
      <HomeSection title="Jugadores en riesgo">
        <div className="h-24 animate-pulse bg-apple-gray-100 dark:bg-apple-gray-700/40 rounded-apple" />
      </HomeSection>
    )
  }
  if (players.length === 0) return null

  return (
    <HomeSection title="Jugadores en riesgo">
      <p className="text-2xs text-apple-gray-400 dark:text-apple-gray-500 mb-3 -mt-1">
        Caída de minutos: últimos 30 días vs. los 30 anteriores
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {players.map(p => {
          const player = AGENCY_PLAYERS.find(ap => ap.fullName === p.fullName)
          const dropPct = p.reason === 'sin_minutos' ? 100 : Math.round((1 - p.current / p.previous) * 100)
          return (
            <button
              key={p.fullName}
              onClick={() => navigate(`/jugador/${encodeURIComponent(p.fullName)}?source=interno`)}
              className="flex items-center gap-3 py-2 px-3 rounded-lg border-l-2 border-red-500 bg-red-50/50 dark:bg-red-950/20 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors text-left"
            >
              <PlayerPhoto src={player?.image ?? null} name={p.fullName} size="sm" rounded="full" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-apple-gray-800 dark:text-white truncate">{p.fullName}</p>
                <p className="text-2xs text-apple-gray-500 dark:text-apple-gray-400 truncate">
                  {p.reason === 'sin_minutos' ? 'Sin minutos en 30 días' : `${p.previous}' → ${p.current}'`}
                </p>
              </div>
              <span className="text-xs font-bold text-red-500 bg-red-500/10 rounded-full px-2 py-1 flex-shrink-0 tabular-nums">
                -{dropPct}%
              </span>
            </button>
          )
        })}
      </div>
    </HomeSection>
  )
}

// ─── Sin rodaje (señal negativa: 0 minutos en el mes) ───────────────────────
// Promueve a widget propio lo que antes era sólo una línea chica al pie de
// "Rodaje de la agencia" (`data.noMinutes`) — jugadores de la agencia con
// equipo conocido que no sumaron un solo minuto en los últimos 30 días.
// Sólo cuenta si el EQUIPO tiene evidencia de partidos recientes cargados —
// ver `teamsWithRecentActivity` (caso real: Steimbach y varios más salían acá
// por equipos con el sync de fixtures roto, no por estar realmente sin jugar).

function SinRodajeWidget({ rows }: { rows: SquadStatRow[] | null }) {
  const navigate = useNavigate()
  // Filtro de período propio (30 días sigue siendo la lectura por default,
  // ver [[project-sin-rodaje-false-negatives]]) -- antes esto sólo miraba 30
  // días fijo, así que un jugador sin jugar hace, por ejemplo, 45 días no
  // aparecía en ningún lado (ni acá por el corte de 30, ni en "riesgo" que
  // compara contra los 30 anteriores). Con estos tabs se puede pedir 6 meses
  // o el año y verlo igual (caso real pedido: Iván Erquiaga).
  const [period, setPeriod] = useState<PerformancePeriod>('month')
  const noMinutes = useMemo(() => {
    if (!rows) return null
    // El chequeo de "equipo con sync sano" se mantiene siempre en 30 días --
    // responde otra pregunta (¿está viva la carga de este equipo?), no la del
    // período elegido para medir al jugador.
    const activeTeams = teamsWithRecentActivity(rows, 30)
    const reliableRoster = AGENCY_PLAYERS.filter(p => p.apiTeamId != null && activeTeams.has(p.apiTeamId))
    return aggregatePerformance(period, rows, reliableRoster).noMinutes
  }, [rows, period])

  if (noMinutes === null) {
    return (
      <HomeSection title="Sin rodaje">
        <div className="h-24 animate-pulse bg-apple-gray-100 dark:bg-apple-gray-700/40 rounded-apple" />
      </HomeSection>
    )
  }

  return (
    <HomeSection title="Sin rodaje">
      <div className="flex gap-1 bg-apple-gray-100 dark:bg-apple-gray-700/50 p-1 rounded-apple mb-3 w-fit">
        {PERIOD_TABS.map(p => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`px-3 py-1.5 rounded-lg text-2xs font-medium transition-all ${
              period === p.id
                ? 'bg-white dark:bg-apple-gray-800 text-apple-gray-800 dark:text-white shadow-apple dark:shadow-apple-dark'
                : 'text-apple-gray-500 dark:text-apple-gray-400'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {noMinutes.length === 0 ? (
        <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 text-center py-6">Nadie sin rodaje en este período.</p>
      ) : (
      <div className="space-y-1.5">
        {noMinutes.slice(0, 8).map(fullName => {
          const player = AGENCY_PLAYERS.find(ap => ap.fullName === fullName)
          return (
            <button
              key={fullName}
              onClick={() => navigate(`/jugador/${encodeURIComponent(fullName)}?source=interno`)}
              className="w-full flex items-center gap-3 py-2 px-3 rounded-lg border-l-2 border-red-500 bg-red-50/50 dark:bg-red-950/20 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors text-left"
            >
              <PlayerPhoto src={player?.image ?? null} name={fullName} size="sm" rounded="full" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-apple-gray-800 dark:text-white truncate">{fullName}</p>
                <p className="text-2xs text-apple-gray-500 dark:text-apple-gray-400 truncate">{player?.team}</p>
              </div>
              <span className="text-xs font-bold text-red-500 bg-red-500/10 rounded-full px-2 py-1 flex-shrink-0">0'</span>
            </button>
          )
        })}
      </div>
      )}
    </HomeSection>
  )
}

// ─── Delanteros y extremos sin gol (señal negativa) ─────────────────────────
// Minutos suficientes como para pedirles gol (≥180' en el mes) y todavía en
// cero — el candidato más urgente es el que más jugó sin convertir.

// Piso de minutos para "jugó lo suficiente como para pedirle gol" -- escala
// con el período (180' en un mes son ~2 partidos; ese mismo criterio en 6
// meses o el año sería un piso ridículo, casi todo el mundo lo pasa).
const MIN_MINUTES_BY_PERIOD: Record<PerformancePeriod, number> = {
  month: 180,
  '6months': 900,
  year: 1500,
}

function DelanterosSinGolWidget({ rows, internal }: { rows: SquadStatRow[] | null; internal: EnrichedPlayer[] }) {
  const navigate = useNavigate()
  const posByName = usePositionLookup(internal)
  // Antes fijo en 30 días -- un delantero sin convertir hace 6 semanas se
  // caía del todo del radar apenas pasaba ese corte.
  const [period, setPeriod] = useState<PerformancePeriod>('month')

  const players = useMemo(() => {
    if (!rows) return null
    const minMinutes = MIN_MINUTES_BY_PERIOD[period]
    const data = aggregatePerformance(period, rows, AGENCY_PLAYERS).byPlayer
    return data
      .filter(p => {
        const pos = posByName.get(normalizeNameLocal(p.fullName))
        return (pos === 'Extremo' || pos === 'Delantero') && p.minutes >= minMinutes && p.goals === 0
      })
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 8)
  }, [rows, posByName, period])

  if (players === null) {
    return (
      <HomeSection title="Delanteros y extremos sin gol">
        <div className="h-24 animate-pulse bg-apple-gray-100 dark:bg-apple-gray-700/40 rounded-apple" />
      </HomeSection>
    )
  }

  return (
    <HomeSection title="Delanteros y extremos sin gol">
      <div className="flex gap-1 bg-apple-gray-100 dark:bg-apple-gray-700/50 p-1 rounded-apple mb-3 w-fit">
        {PERIOD_TABS.map(p => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`px-3 py-1.5 rounded-lg text-2xs font-medium transition-all ${
              period === p.id
                ? 'bg-white dark:bg-apple-gray-800 text-apple-gray-800 dark:text-white shadow-apple dark:shadow-apple-dark'
                : 'text-apple-gray-500 dark:text-apple-gray-400'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {players.length === 0 ? (
        <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 text-center py-6">Nadie por encima del piso de minutos sin convertir en este período.</p>
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {players.map(p => {
          const player = AGENCY_PLAYERS.find(ap => ap.fullName === p.fullName)
          return (
            <button
              key={p.fullName}
              onClick={() => navigate(`/jugador/${encodeURIComponent(p.fullName)}?source=interno`)}
              className="flex items-center gap-3 py-2 px-3 rounded-lg border-l-2 border-red-500 bg-red-50/50 dark:bg-red-950/20 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors text-left"
            >
              <PlayerPhoto src={player?.image ?? null} name={p.fullName} size="sm" rounded="full" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-apple-gray-800 dark:text-white truncate">{p.fullName}</p>
                <p className="text-2xs text-apple-gray-500 dark:text-apple-gray-400 truncate">{p.minutes}' jugados</p>
              </div>
              <span className="text-xs font-bold text-red-500 bg-red-500/10 rounded-full px-2 py-1 flex-shrink-0">0G</span>
            </button>
          )
        })}
      </div>
      )}
    </HomeSection>
  )
}

// ─── Composición por edad ────────────────────────────────────────────────────

function AgeCompositionWidget({ internal }: { internal: EnrichedPlayer[] }) {
  const { buckets, avgAge } = useMemo(() => {
    let jovenes = 0, peak = 0, veteranos = 0
    let ageSum = 0, ageCount = 0
    for (const p of internal) {
      if (!p.ageNum) continue
      if (p.ageNum <= 21) jovenes++
      else if (p.ageNum <= 28) peak++
      else veteranos++
      ageSum += p.ageNum
      ageCount++
    }
    return {
      buckets: [
        { label: 'Jóvenes (≤21)', value: jovenes, color: 'bg-sky-400' },
        { label: 'Peak (22-28)', value: peak, color: 'bg-brand-green' },
        { label: 'Veteranos (29+)', value: veteranos, color: 'bg-amber-500' },
      ],
      avgAge: ageCount > 0 ? ageSum / ageCount : null,
    }
  }, [internal])
  const total = buckets.reduce((s, b) => s + b.value, 0)
  if (total === 0) return null

  return (
    <HomeSection title="Composición por edad">
      {avgAge != null && (
        <p className="text-2xs text-apple-gray-400 dark:text-apple-gray-500 mb-3 -mt-1">
          Edad promedio del plantel: <span className="font-semibold text-apple-gray-600 dark:text-apple-gray-300">{avgAge.toFixed(1)} años</span>
        </p>
      )}
      <div className="grid grid-cols-3 gap-3">
        {buckets.map(b => (
          <div key={b.label} className="rounded-lg p-2 -m-2 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/30 transition-colors">
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`w-2 h-2 rounded-full ${b.color}`} />
              <span className="text-2xs text-apple-gray-500 dark:text-apple-gray-400">{b.label}</span>
            </div>
            <p className="text-xl font-bold text-apple-gray-800 dark:text-white tabular-nums">{b.value}</p>
          </div>
        ))}
      </div>
    </HomeSection>
  )
}

// ─── Composición por posición ────────────────────────────────────────────────

const COARSE_POSITION_GROUPS: Record<string, string> = {
  'Arquero': 'Arqueros',
  'Defensor Central': 'Defensores', 'Lateral': 'Defensores',
  'Volante Central': 'Mediocampistas', 'Volante Interno': 'Mediocampistas',
  'Extremo': 'Delanteros', 'Delantero': 'Delanteros',
}
const COARSE_POSITION_ORDER = ['Arqueros', 'Defensores', 'Mediocampistas', 'Delanteros']

function PositionCompositionWidget({ internal }: { internal: EnrichedPlayer[] }) {
  const buckets = useMemo(() => {
    const acc: Record<string, number> = {}
    for (const p of internal) {
      const fine = FILTER_POSITION_MAP[p['Posición']] ?? ''
      const coarseFine = POSITION_GROUPS[fine] ?? ''
      const coarse = COARSE_POSITION_GROUPS[coarseFine]
      if (!coarse) continue
      acc[coarse] = (acc[coarse] ?? 0) + 1
    }
    return COARSE_POSITION_ORDER.map(g => ({ label: g, value: acc[g] ?? 0 }))
  }, [internal])
  const total = buckets.reduce((s, b) => s + b.value, 0)
  if (total === 0) return null

  return (
    <HomeSection title="Composición por posición">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {buckets.map(b => (
          <div key={b.label} className="rounded-lg p-2 -m-2 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/30 transition-colors">
            <p className="text-2xs text-apple-gray-500 dark:text-apple-gray-400 mb-1">{b.label}</p>
            <p className="text-xl font-bold text-apple-gray-800 dark:text-white tabular-nums">{b.value}</p>
          </div>
        ))}
      </div>
    </HomeSection>
  )
}

// ─── Nacionalidades ─────────────────────────────────────────────────────────
// `nationalityLive` viene de `players` (Transfermarkt, mismo enriquecimiento
// que ya trae valor de mercado) — a veces guarda más de una nacionalidad en
// el mismo campo ("Argentina, Italia") para doble ciudadanía; se parsea por
// separador para no asumir que siempre es una sola.

function parseNationalities(raw: string): string[] {
  return raw.split(/[,/&]| y /i).map(s => s.trim()).filter(Boolean)
}

function NationalitiesWidget({ internal }: { internal: EnrichedPlayer[] }) {
  const navigate = useNavigate()
  const { counts, dualNationals } = useMemo(() => {
    const counts = new Map<string, number>()
    const dualNationals: { fullName: string; nationalities: string[] }[] = []
    for (const p of internal) {
      const raw = p.nationalityLive
      if (typeof raw !== 'string' || !raw) continue
      const nats = parseNationalities(raw)
      for (const n of nats) counts.set(n, (counts.get(n) ?? 0) + 1)
      if (nats.length > 1) dualNationals.push({ fullName: p.Jugador, nationalities: nats })
    }
    return { counts, dualNationals }
  }, [internal])

  const top = useMemo(() =>
    [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
    [counts],
  )

  if (top.length === 0) return null
  const max = Math.max(...top.map(([, v]) => v))

  return (
    <HomeSection title="Nacionalidades">
      <div className="space-y-2 mb-4">
        {top.map(([label, value]) => (
          <div key={label} className="flex items-center gap-3 rounded-lg p-1.5 -m-1.5 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/30 transition-colors">
            <span className="text-xs text-apple-gray-600 dark:text-apple-gray-300 w-28 truncate flex-shrink-0">{label}</span>
            <div className="flex-1 h-1.5 bg-apple-gray-100 dark:bg-apple-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-brand-green rounded-full" style={{ width: `${(value / max) * 100}%` }} />
            </div>
            <span className="text-xs tabular-nums text-apple-gray-500 dark:text-apple-gray-400 w-6 text-right flex-shrink-0">{value}</span>
          </div>
        ))}
      </div>
      {dualNationals.length > 0 && (
        <div className="pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700/40">
          <p className="text-2xs font-semibold text-apple-gray-400 dark:text-apple-gray-500 uppercase tracking-wide mb-2">Doble nacionalidad</p>
          <div className="flex flex-wrap gap-1.5">
            {dualNationals.map(p => (
              <button
                key={p.fullName}
                onClick={() => navigate(`/jugador/${encodeURIComponent(p.fullName)}?source=interno`)}
                className="text-2xs font-medium px-2 py-1 rounded-full bg-brand-green/10 text-brand-green hover:bg-brand-green/20 transition-colors"
                title={p.nationalities.join(' · ')}
              >
                {p.fullName}
              </button>
            ))}
          </div>
        </div>
      )}
    </HomeSection>
  )
}

// ─── Métricas por categoría (ofensivas / duelos / pases) ────────────────────
// Antes era un solo widget con todo mezclado. Ahora son 3, cada uno con su
// propio filtro de posición + período (pills, no <select> — consistente con
// el resto de la app). "Duelos" y "Regates" muestran % de eficacia como dato
// principal Y volumen por 90' junto al lado — antes el /90 solo (sin el %)
// no decía nada por sí solo.

const PERIOD_TABS: { id: PerformancePeriod; label: string }[] = [
  { id: 'month', label: 'Últimos 30 días' },
  { id: '6months', label: 'Últimos 6 meses' },
  { id: 'year', label: 'Último año' },
]

function usePositionLookup(internal: EnrichedPlayer[]) {
  return useMemo(
    () => new Map(internal.map(p => [normalizeNameLocal(p.Jugador), POSITION_GROUPS[FILTER_POSITION_MAP[p['Posición']] ?? ''] ?? ''])),
    [internal],
  )
}

function FilterBar({ period, onPeriod, position, onPosition }: {
  period: PerformancePeriod; onPeriod: (p: PerformancePeriod) => void
  position: string; onPosition: (p: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <div className="flex gap-1 bg-apple-gray-100 dark:bg-apple-gray-700/50 p-1 rounded-apple">
        {PERIOD_TABS.map(p => (
          <button
            key={p.id}
            onClick={() => onPeriod(p.id)}
            className={`px-3 py-1.5 rounded-lg text-2xs font-medium transition-all ${
              period === p.id
                ? 'bg-white dark:bg-apple-gray-800 text-apple-gray-800 dark:text-white shadow-apple dark:shadow-apple-dark'
                : 'text-apple-gray-500 dark:text-apple-gray-400'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5 overflow-x-auto scrollbar-thin">
        {['Todos', ...POSITION_ORDER].map(pos => (
          <button
            key={pos}
            onClick={() => onPosition(pos)}
            className={`px-2.5 py-1 rounded-full text-2xs font-semibold whitespace-nowrap transition-all ${
              position === pos
                ? 'bg-brand-green text-apple-gray-900'
                : 'bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-500 dark:text-apple-gray-400'
            }`}
          >
            {pos}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Qué es el rating (explicación en criollo, para gente que abre la app
// sin contexto técnico) ───────────────────────────────────────────────────

function RatingExplainer() {
  return (
    <div className="flex gap-3 items-start bg-apple-gray-50 dark:bg-apple-gray-800/50 border border-apple-gray-100 dark:border-apple-gray-700/50 rounded-apple p-4 mb-6">
      <svg className="w-5 h-5 text-apple-gray-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 leading-relaxed">
        <span className="font-semibold text-apple-gray-700 dark:text-apple-gray-300">¿Qué es el rating?</span> Es un puntaje del 1 al 10 que se calcula solo, partido a partido, a partir de datos públicos de estadísticas (goles, pases, duelos, etc.) — no es la opinión de nadie de la agencia. <span className="font-semibold text-apple-gray-700 dark:text-apple-gray-300">Top rendimiento</span> muestra a quiénes promediaron el puntaje más alto en el período elegido; <span className="font-semibold text-apple-gray-700 dark:text-apple-gray-300">Peores rendimiento</span> es el mismo cálculo, mirando a quiénes les fue peor. Sólo entran jugadores con al menos 3 partidos puntuados en ese período, para no juzgar a alguien con muy pocos datos.
      </p>
    </div>
  )
}

// ─── Top rendimiento (evolutivo, con filtro de período) ─────────────────────
// Antes ordenaba por `rating` estático (score general de la ficha, sin
// dimensión temporal) — sin nada de "evolutivo" pedido. Ahora promedia el
// rating de partido (`SquadStatRow.rating`) dentro del período elegido, la
// misma fuente que ya usan Ofensivas/Duelos/Pases.

function TopRendimientoWidget({ rows }: { rows: SquadStatRow[] | null }) {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<PerformancePeriod>('month')

  const players = useMemo(() => {
    if (!rows) return null
    const data = aggregatePerformance(period, rows, AGENCY_PLAYERS).byPlayer
    return data
      .filter(p => p.matchesWithRating >= 3)
      .map(p => ({ fullName: p.fullName, avg: p.ratingSum / p.matchesWithRating, matches: p.matchesWithRating }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 8)
  }, [rows, period])

  return (
    <HomeSection title="Top rendimiento" action={{ label: 'Ver ranking', to: '/interno' }}>
      <div className="flex gap-1 bg-apple-gray-100 dark:bg-apple-gray-700/50 p-1 rounded-apple w-fit mb-4">
        {PERIOD_TABS.map(p => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              period === p.id
                ? 'bg-white dark:bg-apple-gray-800 text-apple-gray-800 dark:text-white shadow-apple dark:shadow-apple-dark'
                : 'text-apple-gray-500 dark:text-apple-gray-400'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {players === null ? (
        <div className="h-40 animate-pulse bg-apple-gray-100 dark:bg-apple-gray-700/40 rounded-apple" />
      ) : players.length === 0 ? (
        <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 text-center py-6">Sin partidos con rating en este período (mín. 3).</p>
      ) : (
        <div className="space-y-1">
          {players.map((p, i) => {
            const player = AGENCY_PLAYERS.find(ap => ap.fullName === p.fullName)
            return (
              <button
                key={p.fullName}
                onClick={() => navigate(`/jugador/${encodeURIComponent(p.fullName)}?source=interno`)}
                className="w-full flex items-center gap-3 py-1.5 px-1.5 -mx-1.5 rounded-lg hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/30 transition-colors text-left"
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-2xs font-bold flex-shrink-0 ${
                  i === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' :
                  i === 1 ? 'bg-apple-gray-200 text-apple-gray-600 dark:bg-apple-gray-600 dark:text-apple-gray-300' :
                  i === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400' :
                  'bg-apple-gray-100 text-apple-gray-500 dark:bg-apple-gray-700 dark:text-apple-gray-400'
                }`}>
                  {i + 1}
                </div>
                <PlayerPhoto src={player?.image ?? null} name={p.fullName} size="sm" rounded="full" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-apple-gray-800 dark:text-white truncate">{p.fullName}</p>
                  <p className="text-2xs text-apple-gray-400 dark:text-apple-gray-500 truncate">{p.matches} partidos con rating</p>
                </div>
                <span className="text-sm font-extrabold text-brand-green bg-brand-green/10 rounded-full px-2.5 py-1 flex-shrink-0 tabular-nums">{p.avg.toFixed(1)}</span>
              </button>
            )
          })}
        </div>
      )}
    </HomeSection>
  )
}

// ─── Peores rendimiento (evolutivo, con filtro de período) ──────────────────
// Mismo cálculo que "Top rendimiento" (rating promedio de partido dentro del
// período), pero de menor a mayor -- excluye igual a quien no tiene mínimo de
// partidos con rating (no es "el peor" si no hay dato, es simplemente sin dato).

function PeoresRendimientoWidget({ rows }: { rows: SquadStatRow[] | null }) {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<PerformancePeriod>('month')

  const players = useMemo(() => {
    if (!rows) return null
    const data = aggregatePerformance(period, rows, AGENCY_PLAYERS).byPlayer
    // Tope de 3 (a propósito, distinto del 8 de "Top rendimiento") -- con el
    // mismo pool chico de jugadores con rating, un top 8 y un peor 8 terminaban
    // repitiendo gente en ambos widgets, lo cual no tenía sentido.
    return data
      .filter(p => p.matchesWithRating >= 3)
      .map(p => ({ fullName: p.fullName, avg: p.ratingSum / p.matchesWithRating, matches: p.matchesWithRating }))
      .sort((a, b) => a.avg - b.avg)
      .slice(0, 3)
  }, [rows, period])

  return (
    <HomeSection title="Peores rendimiento" action={{ label: 'Ver ranking', to: '/interno' }}>
      <div className="flex gap-1 bg-apple-gray-100 dark:bg-apple-gray-700/50 p-1 rounded-apple w-fit mb-4">
        {PERIOD_TABS.map(p => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              period === p.id
                ? 'bg-white dark:bg-apple-gray-800 text-apple-gray-800 dark:text-white shadow-apple dark:shadow-apple-dark'
                : 'text-apple-gray-500 dark:text-apple-gray-400'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {players === null ? (
        <div className="h-40 animate-pulse bg-apple-gray-100 dark:bg-apple-gray-700/40 rounded-apple" />
      ) : players.length === 0 ? (
        <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 text-center py-6">Sin partidos con rating en este período (mín. 3).</p>
      ) : (
        <div className="space-y-1">
          {players.map(p => {
            const player = AGENCY_PLAYERS.find(ap => ap.fullName === p.fullName)
            return (
              <button
                key={p.fullName}
                onClick={() => navigate(`/jugador/${encodeURIComponent(p.fullName)}?source=interno`)}
                className="w-full flex items-center gap-3 py-1.5 px-1.5 -mx-1.5 rounded-lg hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/30 transition-colors text-left"
              >
                <PlayerPhoto src={player?.image ?? null} name={p.fullName} size="sm" rounded="full" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-apple-gray-800 dark:text-white truncate">{p.fullName}</p>
                  <p className="text-2xs text-apple-gray-400 dark:text-apple-gray-500 truncate">{p.matches} partidos con rating</p>
                </div>
                <span className="text-sm font-extrabold text-red-500 bg-red-500/10 rounded-full px-2.5 py-1 flex-shrink-0 tabular-nums">{p.avg.toFixed(1)}</span>
              </button>
            )
          })}
        </div>
      )}
    </HomeSection>
  )
}

// ─── Ofensivas ────────────────────────────────────────────────────────────────

type OffenseMetric = 'goals' | 'assists' | 'ga' | 'shots' | 'shotsOn'
const OFFENSE_TABS: { id: OffenseMetric; label: string; hint: string }[] = [
  { id: 'goals', label: 'Goles', hint: 'Goles convertidos' },
  { id: 'assists', label: 'Asistencias', hint: 'Asistencias' },
  { id: 'ga', label: 'G+A', hint: 'Goles + asistencias' },
  { id: 'shots', label: 'Remates', hint: 'Remates totales' },
  { id: 'shotsOn', label: 'Remates al arco', hint: 'Remates al arco' },
]

function offenseValue(p: AgencyPlayerPerformance, m: OffenseMetric): number | null {
  switch (m) {
    case 'goals': return p.goals > 0 ? p.goals : null
    case 'assists': return p.assists > 0 ? p.assists : null
    case 'ga': return (p.goals + p.assists) > 0 ? p.goals + p.assists : null
    case 'shots': return p.shotsTotal > 0 ? p.shotsTotal : null
    case 'shotsOn': return p.shotsOn > 0 ? p.shotsOn : null
  }
}
const OFFENSE_IS_PCT: Record<OffenseMetric, boolean> = { goals: false, assists: false, ga: false, shots: false, shotsOn: false }
function offenseBadge(m: OffenseMetric, v: number): string {
  if (m === 'goals') return `${v}G`
  if (m === 'assists') return `${v}A`
  if (m === 'ga') return `${v} G+A`
  return String(v)
}

function OfensivasWidget({ rows, internal }: { rows: SquadStatRow[] | null; internal: EnrichedPlayer[] }) {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<PerformancePeriod>('year')
  const [metric, setMetric] = useState<OffenseMetric>('goals')
  const [position, setPosition] = useState('Todos')
  const posByName = usePositionLookup(internal)

  const items = useMemo(() => {
    if (!rows) return null
    const data = aggregatePerformance(period, rows, AGENCY_PLAYERS).byPlayer
    const withValue = data
      .map(p => ({ p, value: offenseValue(p, metric) }))
      .filter((x): x is { p: AgencyPlayerPerformance; value: number } => x.value !== null)
      .filter(x => position === 'Todos' || posByName.get(normalizeNameLocal(x.p.fullName)) === position)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
    const max = Math.max(1, ...withValue.map(x => x.value))
    const isPct = OFFENSE_IS_PCT[metric]
    return withValue.map(x => ({ fullName: x.p.fullName, pct: isPct ? Math.min(100, x.value) : (x.value / max) * 100, badge: offenseBadge(metric, x.value) }))
  }, [rows, period, metric, position, posByName])

  const activeTab = OFFENSE_TABS.find(m => m.id === metric)!

  return (
    <HomeSection title="Ofensivas">
      <FilterBar period={period} onPeriod={setPeriod} position={position} onPosition={setPosition} />
      <div className="flex gap-1.5 overflow-x-auto scrollbar-thin mb-1 pb-1">
        {OFFENSE_TABS.map(m => (
          <button key={m.id} onClick={() => setMetric(m.id)} className={`px-3 py-1.5 rounded-full text-2xs font-semibold whitespace-nowrap transition-all ${metric === m.id ? 'bg-brand-green text-apple-gray-900' : 'bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-500 dark:text-apple-gray-400 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700'}`}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="text-2xs text-apple-gray-400 dark:text-apple-gray-500 mb-3">{activeTab.hint}</p>
      <MetricRows items={items} />
    </HomeSection>
  )
}

// ─── Duelos (duelos + regates, % y volumen/90 juntos) ───────────────────────

type DuelMetric = 'duels' | 'dribbles'
const DUEL_TABS: { id: DuelMetric; label: string; hint: string }[] = [
  { id: 'duels', label: 'Duelos ganados', hint: '% de duelos ganados (mín. 10 jugados) — el número chico es cuántos gana cada 90\'' },
  { id: 'dribbles', label: 'Regates exitosos', hint: '% de regates exitosos (mín. 6 intentados) — el número chico es cuántos completa cada 90\'' },
]

function DuelosWidget({ rows, internal }: { rows: SquadStatRow[] | null; internal: EnrichedPlayer[] }) {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<PerformancePeriod>('year')
  const [metric, setMetric] = useState<DuelMetric>('duels')
  const [position, setPosition] = useState('Todos')
  const posByName = usePositionLookup(internal)

  const items = useMemo(() => {
    if (!rows) return null
    const data = aggregatePerformance(period, rows, AGENCY_PLAYERS).byPlayer
    const withValue = data
      .map(p => {
        const won = metric === 'duels' ? p.duelsWon : p.dribbleSuccess
        const total = metric === 'duels' ? p.duelsTotal : p.dribbleAttempted
        const minSample = metric === 'duels' ? 10 : 6
        if (total < minSample || p.minutes < 90) return null
        return { p, pct: (won / total) * 100, per90: (won / p.minutes) * 90 }
      })
      .filter((x): x is { p: AgencyPlayerPerformance; pct: number; per90: number } => x !== null)
      .filter(x => position === 'Todos' || posByName.get(normalizeNameLocal(x.p.fullName)) === position)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 8)
    return withValue.map(x => ({
      fullName: x.p.fullName,
      pct: Math.min(100, x.pct),
      badge: `${Math.round(x.pct)}%`,
      subBadge: `${x.per90.toFixed(1)}/90'`,
    }))
  }, [rows, period, metric, position, posByName])

  const activeTab = DUEL_TABS.find(m => m.id === metric)!

  return (
    <HomeSection title="Duelos">
      <FilterBar period={period} onPeriod={setPeriod} position={position} onPosition={setPosition} />
      <div className="flex gap-1.5 overflow-x-auto scrollbar-thin mb-1 pb-1">
        {DUEL_TABS.map(m => (
          <button key={m.id} onClick={() => setMetric(m.id)} className={`px-3 py-1.5 rounded-full text-2xs font-semibold whitespace-nowrap transition-all ${metric === m.id ? 'bg-brand-green text-apple-gray-900' : 'bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-500 dark:text-apple-gray-400 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700'}`}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="text-2xs text-apple-gray-400 dark:text-apple-gray-500 mb-3">{activeTab.hint}</p>
      <MetricRows items={items} navigateOverride={navigate} />
    </HomeSection>
  )
}

// ─── Pases ────────────────────────────────────────────────────────────────────

type PassMetric = 'keyPasses' | 'completedPerMatch' | 'accuracy'
const PASS_TABS: { id: PassMetric; label: string; hint: string }[] = [
  { id: 'keyPasses', label: 'Pases clave', hint: 'Pases clave totales' },
  { id: 'completedPerMatch', label: 'Pases acertados', hint: 'Pases que llegan a destino, promedio por partido (intentos × precisión — mín. 2 partidos con dato)' },
  { id: 'accuracy', label: 'Precisión', hint: '% de precisión de pase, promedio por partido (mín. 2 partidos con dato)' },
]

function PasesWidget({ rows, internal }: { rows: SquadStatRow[] | null; internal: EnrichedPlayer[] }) {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<PerformancePeriod>('year')
  const [metric, setMetric] = useState<PassMetric>('keyPasses')
  const [position, setPosition] = useState('Todos')
  const posByName = usePositionLookup(internal)

  const items = useMemo(() => {
    if (!rows) return null
    const data = aggregatePerformance(period, rows, AGENCY_PLAYERS).byPlayer
    const withValue = data
      .map(p => {
        let value: number | null = null
        if (metric === 'keyPasses') value = p.passesKey > 0 ? p.passesKey : null
        else if (metric === 'completedPerMatch') value = p.matchesWithPassesCompleted >= 2 ? p.passesCompletedSum / p.matchesWithPassesCompleted : null
        else if (metric === 'accuracy') value = p.matchesWithPassAcc >= 2 ? p.passesAccuracySum / p.matchesWithPassAcc : null
        return value === null ? null : { p, value }
      })
      .filter((x): x is { p: AgencyPlayerPerformance; value: number } => x !== null)
      .filter(x => position === 'Todos' || posByName.get(normalizeNameLocal(x.p.fullName)) === position)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
    const max = Math.max(1, ...withValue.map(x => x.value))
    const isPct = metric === 'accuracy'
    return withValue.map(x => ({
      fullName: x.p.fullName,
      pct: isPct ? Math.min(100, x.value) : (x.value / max) * 100,
      badge: isPct ? `${Math.round(x.value)}%` : metric === 'completedPerMatch' ? `${x.value.toFixed(1)}/partido` : String(x.value),
    }))
  }, [rows, period, metric, position, posByName])

  const activeTab = PASS_TABS.find(m => m.id === metric)!

  return (
    <HomeSection title="Pases">
      <FilterBar period={period} onPeriod={setPeriod} position={position} onPosition={setPosition} />
      <div className="flex gap-1.5 overflow-x-auto scrollbar-thin mb-1 pb-1">
        {PASS_TABS.map(m => (
          <button key={m.id} onClick={() => setMetric(m.id)} className={`px-3 py-1.5 rounded-full text-2xs font-semibold whitespace-nowrap transition-all ${metric === m.id ? 'bg-brand-green text-apple-gray-900' : 'bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-500 dark:text-apple-gray-400 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700'}`}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="text-2xs text-apple-gray-400 dark:text-apple-gray-500 mb-3">{activeTab.hint}</p>
      <MetricRows items={items} navigateOverride={navigate} />
    </HomeSection>
  )
}

// ─── Filas compartidas por los 3 widgets de métricas ────────────────────────

function MetricRows({ items, navigateOverride }: {
  items: { fullName: string; pct: number; badge: string; subBadge?: string }[] | null
  navigateOverride?: ReturnType<typeof useNavigate>
}) {
  const ownNavigate = useNavigate()
  const navigate = navigateOverride ?? ownNavigate

  if (items === null) return <div className="h-40 animate-pulse bg-apple-gray-100 dark:bg-apple-gray-700/40 rounded-apple" />
  if (items.length === 0) return <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 text-center py-6">Sin datos suficientes para esta combinación.</p>

  return (
    <div className="space-y-3">
      {items.map(s => {
        const player = AGENCY_PLAYERS.find(ap => ap.fullName === s.fullName)
        return (
          <button
            key={s.fullName}
            onClick={() => navigate(`/jugador/${encodeURIComponent(s.fullName)}?source=interno`)}
            className="w-full text-left rounded-lg p-1.5 -m-1.5 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/30 transition-colors"
          >
            <div className="flex items-center gap-3 mb-1.5">
              <PlayerPhoto src={player?.image ?? null} name={s.fullName} size="sm" rounded="full" />
              <span className="text-sm font-medium text-apple-gray-800 dark:text-white flex-1 truncate">{s.fullName}</span>
              {s.subBadge && (
                <span className="text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 flex-shrink-0">{s.subBadge}</span>
              )}
              <span className="text-xs font-bold text-brand-green bg-brand-green/10 rounded-full px-2 py-0.5 tabular-nums flex-shrink-0">{s.badge}</span>
            </div>
            <div className="h-1.5 bg-apple-gray-100 dark:bg-apple-gray-700 rounded-full overflow-hidden ml-11">
              <div className="h-full bg-brand-green rounded-full" style={{ width: `${s.pct}%` }} />
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ─── Mejores del Scouting Externo (LATAM, por liga) ──────────────────────────
// El Sheet "Scouting Externo" casi no tiene rating cargado (es una lista de
// prospectos armada a mano, no sincronizada con Sofascore/API-Football), así
// que este widget usa la misma fuente que ya prueba tener cobertura real en
// toda la plataforma: `useRecentForm` (Supabase, `player_season_scores` vía
// RPC) — la que ya alimenta "Oportunidades de mercado". Se filtra a ligas de
// Latinoamérica (pedido explícito: "pone las ligas de LATAM") y se excluye al
// roster propio (no es una oportunidad si ya lo representamos).

// `league_name` NO alcanza para saber si una liga es de Latinoamérica: dos ligas
// distintas comparten nombre pero no país (id 135 "Serie A" = Italia, id 71
// "Serie A" = Brasil — confirmado contra la tabla `leagues`). Hay que cruzar por
// `team.league_id` contra `leagues.country`, no filtrar por texto de la liga.
// Por el mismo motivo el nombre solo tampoco alcanza para mostrarlo en la UI:
// "Primera División" es Uruguay, Chile, Bolivia o Venezuela según el caso — se
// muestra siempre "Liga · País".
// "South America" queda afuera a propósito: son competencias continentales
// (Copa Libertadores, Copa Sudamericana), no ligas domésticas — "sudamericana
// y libertadores no son ligas" (pedido explícito del usuario).
const LATAM_COUNTRIES = new Set([
  'argentina', 'uruguay', 'brazil', 'brasil', 'chile', 'mexico', 'méxico', 'colombia',
  'peru', 'perú', 'paraguay', 'bolivia', 'ecuador', 'venezuela', 'costa rica', 'honduras',
  'guatemala', 'panama', 'panamá', 'el salvador', 'nicaragua', 'dominican republic', 'cuba',
])

// La tabla `leagues` trae el país en inglés (viene de API-Football) — para
// mostrarlo hay que traducirlo, si no queda "Brazil"/"Mexico"/"Peru" en vez de
// "Brasil"/"México"/"Perú".
const COUNTRY_ES: Record<string, string> = {
  brazil: 'Brasil', mexico: 'México', peru: 'Perú', panama: 'Panamá',
  'dominican republic': 'República Dominicana',
}
function countryEs(country: string): string {
  return COUNTRY_ES[country.toLowerCase()] ?? country
}

interface LatamPlayer extends RecentFormPlayer {
  leagueDisplay: string
}

// Última palabra del nombre (normalizada) — para no fusionar por error a dos
// personas reales distintas que comparten fecha de nacimiento.
function lastNameKey(name: string): string {
  const parts = name.trim().split(/\s+/)
  return normalizeNameLocal(parts[parts.length - 1] ?? name)
}

function useLatamScouting() {
  const { agencyPlayers } = useData()
  const leagues = useLeagues()
  // `p_cheap_max_value`/`p_contract_max_months` en null devuelven 0 filas
  // siempre (bug confirmado del lado del RPC `fetch_recent_form`) — se pasan
  // valores altos a propósito para que no filtren nada en la práctica.
  // windowMonths/fallbackMonths/limit calcados de los que ya usa
  // "Oportunidades de mercado" — con valores más altos (probados: 6/12/300)
  // el RPC tira 500 "statement timeout" seguido bajo carga.
  const { players, loading } = useRecentForm({
    windowMonths: 3, minMatches: 2, fallbackMonths: 6,
    cheapMaxValue: 100_000_000, contractMaxMonths: 120, limit: 200,
  })
  return useMemo(() => {
    const leagueById = new Map<number, LeagueInfo>(leagues.map((l: LeagueInfo) => [l.id, l]))
    const withoutAgency = excludeAgencyPlayers(players, agencyPlayers)
    const latamRaw: LatamPlayer[] = []
    for (const p of withoutAgency) {
      const leagueId = p.team?.league_id
      const info = leagueId != null ? leagueById.get(leagueId) : undefined
      if (!info || !LATAM_COUNTRIES.has(info.country.toLowerCase())) continue
      latamRaw.push({ ...p, leagueDisplay: `${p.league_name ?? info.name} · ${countryEs(info.country)}` })
    }
    // La base tiene "gemelos" del mismo jugador real (fila de API-Football +
    // fila de Sofascore, ver `isApiFootballPlayer`) — la de Sofascore queda
    // desactualizada en traspasos (caso real: Juan Fernando Quintero se movió
    // a Independiente Medellín, su gemelo Sofascore seguía marcando River
    // Plate). Se agrupa por fecha de nacimiento + apellido y se prioriza la
    // fila de API-Football.
    const groups = new Map<string, LatamPlayer[]>()
    const singles: LatamPlayer[] = []
    for (const p of latamRaw) {
      if (!p.birth_date) { singles.push(p); continue }
      const key = `${p.birth_date}|${lastNameKey(p.name)}`
      const arr = groups.get(key) ?? []
      arr.push(p)
      groups.set(key, arr)
    }
    const deduped = [...singles]
    for (const group of groups.values()) {
      deduped.push(group.length === 1 ? group[0] : (group.find(isApiFootballPlayer) ?? group[0]))
    }
    return { players: deduped, loading: loading || leagues.length === 0 }
  }, [players, agencyPlayers, loading, leagues])
}

function ExternalTopByLeagueWidget({ players, loading }: { players: LatamPlayer[]; loading: boolean }) {
  const navigate = useNavigate()
  const [league, setLeague] = useState<string | null>(null)

  const leagues = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of players) counts.set(p.leagueDisplay, (counts.get(p.leagueDisplay) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l)
  }, [players])

  // "Liga Profesional" (Argentina) primero si está disponible — si no, la
  // liga con más jugadores en el listado.
  const defaultLeague = useMemo(
    () => leagues.find(l => l.startsWith('Liga Profesional')) ?? leagues[0] ?? null,
    [leagues],
  )
  const effectiveLeague = league ?? defaultLeague

  const top = useMemo(() =>
    players
      .filter(p => p.leagueDisplay === effectiveLeague)
      .sort((a, b) => b.recent_avg - a.recent_avg)
      .slice(0, 8),
    [players, effectiveLeague],
  )

  if (loading) {
    return (
      <HomeSection title="Mejores del scouting externo (LATAM)">
        <div className="h-40 animate-pulse bg-apple-gray-100 dark:bg-apple-gray-700/40 rounded-apple" />
      </HomeSection>
    )
  }
  if (players.length === 0) return null

  return (
    <HomeSection title="Mejores del scouting externo (LATAM)" action={{ label: 'Ver scout externo', to: '/scouting' }}>
      <div className="flex gap-1.5 overflow-x-auto scrollbar-thin mb-3 pb-1">
        {leagues.slice(0, 15).map(l => (
          <button
            key={l}
            onClick={() => setLeague(l)}
            className={`px-2.5 py-1 rounded-full text-2xs font-semibold whitespace-nowrap transition-all ${
              effectiveLeague === l ? 'bg-brand-green text-apple-gray-900' : 'bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-500 dark:text-apple-gray-400'
            }`}
          >
            {l}
          </button>
        ))}
      </div>
      {top.length === 0 ? (
        <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 text-center py-6">Sin jugadores con rating en esta liga.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {top.map((p, i) => (
            <button
              key={p.id}
              onClick={() => navigate(`/jugador/${encodeURIComponent(p.name)}?source=externo&apiId=${p.id}`)}
              className="flex items-center gap-3 py-2 px-2.5 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-700/30 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700/50 transition-colors text-left"
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-2xs font-bold flex-shrink-0 ${
                i === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' : 'bg-apple-gray-100 text-apple-gray-500 dark:bg-apple-gray-700 dark:text-apple-gray-400'
              }`}>{i + 1}</div>
              <PlayerPhoto src={p.photo} name={p.name} size="sm" rounded="full" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-apple-gray-800 dark:text-white truncate">{p.name}</p>
                <p className="text-2xs text-apple-gray-400 dark:text-apple-gray-500 truncate">{p.team?.name ?? '—'} · {p.leagueDisplay}</p>
              </div>
              <span className="text-sm font-extrabold text-brand-green bg-brand-green/10 rounded-full px-2.5 py-1 flex-shrink-0 tabular-nums">{p.recent_avg.toFixed(1)}</span>
            </button>
          ))}
        </div>
      )}
    </HomeSection>
  )
}

// ─── Jugadores en seguimiento (Scout Externo) ────────────────────────────────
// `/seguimiento-gg` tiene datos reales (scout_players con in_scouts_gg_list) —
// la lista `monitoring` de DataContext está vacía pero esto es otra fuente.
// Filtrable por estado, igual que la página completa.

const SEGUIMIENTO_STATUS_CONFIG: Record<TrackingStatus, { label: string; color: string; bg: string; dot: string }> = {
  en_seguimiento: { label: 'En seguimiento', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10', dot: 'bg-blue-500' },
  contactado: { label: 'Contactado', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10', dot: 'bg-amber-500' },
  en_negociacion: { label: 'En negociación', color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-500/10', dot: 'bg-purple-500' },
  completado: { label: 'Completado', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10', dot: 'bg-emerald-500' },
  descartado: { label: 'Descartado', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/10', dot: 'bg-red-500' },
}
const SEGUIMIENTO_STATUS_ORDER: TrackingStatus[] = ['en_seguimiento', 'contactado', 'en_negociacion', 'completado', 'descartado']

function SeguimientoWidget() {
  const navigate = useNavigate()
  const [players, setPlayers] = useState<ScoutPlayerWithScore[] | null>(null)
  const [statuses, setStatuses] = useState<Record<string, ScoutPlayerStatusRecord>>({})
  const [statusFilter, setStatusFilter] = useState<TrackingStatus | 'Todos'>('Todos')

  useEffect(() => {
    let alive = true
    Promise.all([
      fetchScoutPlayersWithScores('scouts_gg'),
      fetchScoutPlayerStatuses('scouts_gg'),
    ]).then(([p, s]) => { if (alive) { setPlayers(p); setStatuses(s) } })
      .catch(() => { if (alive) setPlayers([]) })
    return () => { alive = false }
  }, [])

  const filtered = useMemo(() => {
    if (!players) return []
    return players
      .filter(p => {
        const status = (statuses[p.id]?.status as TrackingStatus) || 'en_seguimiento'
        return statusFilter === 'Todos' || status === statusFilter
      })
      .slice(0, 8)
  }, [players, statuses, statusFilter])

  const goToPlayer = (p: ScoutPlayerWithScore) => {
    if (p.supabase_player_id) navigate(`/jugador/${encodeURIComponent(p.full_name)}?source=externo&apiId=${p.supabase_player_id}`)
    else if (p.player_db_id) navigate(`/jugador/${encodeURIComponent(p.player_db_id)}?source=${p.player_db_source || 'externo'}`)
    else navigate('/seguimiento-gg')
  }

  if (players === null) {
    return <HomeSection title="Jugadores en seguimiento"><div className="h-40 animate-pulse bg-apple-gray-100 dark:bg-apple-gray-700/40 rounded-apple" /></HomeSection>
  }
  if (players.length === 0) return null

  return (
    <HomeSection title="Jugadores en seguimiento" action={{ label: 'Ver todos', to: '/seguimiento-gg' }}>
      <div className="flex gap-1.5 overflow-x-auto scrollbar-thin mb-3">
        <button
          onClick={() => setStatusFilter('Todos')}
          className={`px-2.5 py-1 rounded-full text-2xs font-semibold whitespace-nowrap transition-all ${
            statusFilter === 'Todos' ? 'bg-brand-green text-apple-gray-900' : 'bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-500 dark:text-apple-gray-400'
          }`}
        >
          Todos ({players.length})
        </button>
        {SEGUIMIENTO_STATUS_ORDER.map(s => {
          const count = players.filter(p => ((statuses[p.id]?.status as TrackingStatus) || 'en_seguimiento') === s).length
          if (count === 0) return null
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-2xs font-semibold whitespace-nowrap transition-all ${
                statusFilter === s ? `${SEGUIMIENTO_STATUS_CONFIG[s].bg} ${SEGUIMIENTO_STATUS_CONFIG[s].color}` : 'bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-500 dark:text-apple-gray-400'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${SEGUIMIENTO_STATUS_CONFIG[s].dot}`} />
              {SEGUIMIENTO_STATUS_CONFIG[s].label} ({count})
            </button>
          )
        })}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 text-center py-6">Sin jugadores en este estado.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {filtered.map(p => {
            const status = (statuses[p.id]?.status as TrackingStatus) || 'en_seguimiento'
            const cfg = SEGUIMIENTO_STATUS_CONFIG[status]
            return (
              <button
                key={p.id}
                onClick={() => goToPlayer(p)}
                className="flex items-center gap-3 py-2 px-2.5 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-700/30 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700/50 transition-colors text-left"
              >
                <PlayerPhoto src={p.player_photo} name={p.full_name} size="sm" rounded="full" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-apple-gray-800 dark:text-white truncate">{p.full_name}</p>
                  <p className="text-2xs text-apple-gray-400 dark:text-apple-gray-500 truncate">{p.team_name || p.club || p.liga || '—'}</p>
                </div>
                <span className={`text-2xs font-bold rounded-full px-2 py-0.5 flex-shrink-0 ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </HomeSection>
  )
}

// ─── Ligas de la agencia ──────────────────────────────────────────────────────

function LeaguesWidget({ internal }: { internal: EnrichedPlayer[] }) {
  const leagues = useMemo(() => {
    const acc: Record<string, number> = {}
    for (const p of internal) {
      const liga = (p.Liga || '').trim()
      if (!liga) continue
      acc[liga] = (acc[liga] ?? 0) + 1
    }
    return Object.entries(acc)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6)
  }, [internal])
  if (leagues.length === 0) return null
  const max = Math.max(...leagues.map(l => l.value))

  return (
    <HomeSection title="Ligas de la agencia">
      <p className="text-2xs text-apple-gray-400 dark:text-apple-gray-500 mb-3 -mt-1">
        {new Set(internal.map(p => p.Liga).filter(Boolean)).size} ligas distintas representadas
      </p>
      <div className="space-y-2">
        {leagues.map(l => (
          <div key={l.label} className="flex items-center gap-3 rounded-lg p-1.5 -m-1.5 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/30 transition-colors">
            <span className="text-xs text-apple-gray-600 dark:text-apple-gray-300 w-36 truncate flex-shrink-0">{l.label}</span>
            <div className="flex-1 h-1.5 bg-apple-gray-100 dark:bg-apple-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-brand-green rounded-full" style={{ width: `${(l.value / max) * 100}%` }} />
            </div>
            <span className="text-xs tabular-nums text-apple-gray-500 dark:text-apple-gray-400 w-6 text-right flex-shrink-0">{l.value}</span>
          </div>
        ))}
      </div>
    </HomeSection>
  )
}

// ─── Físico destacado (GPS) ──────────────────────────────────────────────────
// Positivo a propósito: no todos los jugadores tienen carga GPS, así que sólo
// se muestran los mejores valores reales cargados — nunca "faltan datos de X".
// Sólo distancia y sprints por ahora (velocidad punta se sacó: los datos de
// vel_max tienen nombres duplicados con variantes de acentos que rompen la
// comparación entre jugadores — ver nota de Juan Ignacio Díaz).

function PhysicalHighlightsWidget() {
  const { gpsEntries } = useData()
  const navigate = useNavigate()

  const highlights = useMemo(() => {
    const best = (metricKey: string) => {
      let top: { name: string; value: number; rival: string | null; date: string } | null = null
      for (const e of gpsEntries) {
        const v = e.metrics?.[metricKey]
        if (v == null || v <= 0) continue
        if (!top || v > top.value) top = { name: e.player_name, value: v, rival: e.rival, date: e.match_date }
      }
      return top
    }
    return {
      distancia: best('distancia_total'),
      sprints: best('sprints'),
    }
  }, [gpsEntries])

  const cards = [
    { key: 'distancia', label: 'Mayor distancia recorrida', unit: 'm', data: highlights.distancia },
    { key: 'sprints', label: 'Más sprints en un partido', unit: '', data: highlights.sprints },
  ].filter(c => c.data)

  if (cards.length === 0) return null

  return (
    <HomeSection title="Físico destacado">
      <p className="text-2xs text-apple-gray-400 dark:text-apple-gray-500 mb-3 -mt-1">
        Mejores registros GPS cargados (no todos los partidos tienen carga física)
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {cards.map(c => (
          <button
            key={c.key}
            onClick={() => navigate(`/jugador/${encodeURIComponent(c.data!.name)}?source=interno`)}
            className="text-left bg-apple-gray-50 dark:bg-apple-gray-700/30 rounded-lg p-3 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700/50 transition-colors"
          >
            <p className="text-2xs text-apple-gray-400 dark:text-apple-gray-500 uppercase tracking-wide mb-1">{c.label}</p>
            <p className="text-lg font-bold text-brand-green tabular-nums">{c.data!.value.toLocaleString('es-AR')}{c.unit}</p>
            <p className="text-xs text-apple-gray-600 dark:text-apple-gray-300 truncate mt-0.5">{c.data!.name}</p>
          </button>
        ))}
      </div>
    </HomeSection>
  )
}

// ─── Match Card (today/live) ────────────────────────────────────────────────

function MatchCard({ fixture }: { fixture: AgencyFixture }) {
  const time = formatMatchTime(fixture.date)
  const finished = isMatchFinished(fixture.statusShort)
  const live = isMatchLive(fixture.statusShort)
  const abroad = isAbroad(fixture)

  return (
    <div className={`bg-white dark:bg-apple-gray-800 rounded-apple-lg border transition-all hover:shadow-apple-md dark:hover:shadow-apple-dark-md ${
      live ? 'border-brand-green/50 shadow-[0_0_12px_rgba(34,197,94,0.1)]' : 'border-apple-gray-200/60 dark:border-apple-gray-700/40'
    }`}>
      <div className="px-4 py-3 border-b border-apple-gray-100 dark:border-apple-gray-700/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src={fixture.leagueLogo} alt="" className="w-4 h-4 object-contain" />
          <span className="text-xs text-apple-gray-400 dark:text-apple-gray-500 truncate max-w-[180px]">
            {fixture.leagueName} · {fixture.round.replace('Regular Season - ', 'J')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {abroad && fixture.leagueFlag && (
            <span className="inline-flex items-center gap-1 text-2xs text-sky-400">
              <img src={fixture.leagueFlag} alt="" className="w-3.5 h-2.5 object-cover rounded-[1px]" />
              {fixture.leagueCountry}
            </span>
          )}
          {live ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-green">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse-soft" />
              {fixture.elapsed}'
            </span>
          ) : (
            <span className="text-xs text-apple-gray-400 dark:text-apple-gray-500">{time}</span>
          )}
        </div>
      </div>

      <div className="px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <img src={fixture.homeTeam.logo} alt="" className="w-8 h-8 object-contain flex-shrink-0" />
            <span className="text-sm font-medium text-apple-gray-800 dark:text-white truncate">
              {fixture.homeTeam.name}
            </span>
          </div>
          <div className="flex-shrink-0 px-3">
            {finished || live ? (
              <span className="text-lg font-bold text-apple-gray-800 dark:text-white tabular-nums">
                {fixture.goalsHome} - {fixture.goalsAway}
              </span>
            ) : (
              <span className="text-sm font-medium text-apple-gray-300 dark:text-apple-gray-600">vs</span>
            )}
          </div>
          <div className="flex items-center gap-2.5 flex-1 min-w-0 justify-end">
            <span className="text-sm font-medium text-apple-gray-800 dark:text-white truncate text-right">
              {fixture.awayTeam.name}
            </span>
            <img src={fixture.awayTeam.logo} alt="" className="w-8 h-8 object-contain flex-shrink-0" />
          </div>
        </div>
      </div>

      <div className={`px-4 py-3 border-t border-apple-gray-100 dark:border-apple-gray-700/40 flex items-center gap-2 flex-wrap ${
        fixture.isHome ? 'justify-start' : 'justify-end'
      }`}>
        {fixture.players.map(p => (
          <span key={p.fullName} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium bg-brand-green/10 text-brand-green">
            {p.image && <img src={p.image} alt="" className="w-6 h-6 rounded-full object-cover" />}
            {p.shortName}
          </span>
        ))}
        {(fixture.coaches ?? []).map(c => (
          <span key={c.fullName} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium bg-sky-500/10 text-sky-500">
            {c.photo && <img src={c.photo} alt="" className="w-6 h-6 rounded-full object-cover" />}
            DT {c.fullName}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Loading Skeleton ────────────────────────────────────────────────────────

function MatchSkeleton() {
  return (
    <div className="bg-white dark:bg-apple-gray-800 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 animate-pulse">
      <div className="px-4 py-3 border-b border-apple-gray-100 dark:border-apple-gray-700/40">
        <div className="h-3 bg-apple-gray-100 dark:bg-apple-gray-700 rounded w-32" />
      </div>
      <div className="px-4 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700" />
          <div className="h-4 bg-apple-gray-100 dark:bg-apple-gray-700 rounded w-24" />
        </div>
        <div className="h-5 bg-apple-gray-100 dark:bg-apple-gray-700 rounded w-8" />
        <div className="flex items-center gap-2.5">
          <div className="h-4 bg-apple-gray-100 dark:bg-apple-gray-700 rounded w-24" />
          <div className="w-8 h-8 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700" />
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function HomePage() {
  const { userDisplayName } = useAuth()
  const { t, language } = useLanguage()
  const { internal, monitoring, marketValueHistory, loading: dataLoading } = useData()
  const { currency, rate } = useCurrency()
  const latamScouting = useLatamScouting()
  const [fixtures, setFixtures] = useState<AgencyFixture[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [refreshing, setRefreshing] = useState(false)
  const [perfRows, setPerfRows] = useState<SquadStatRow[] | null>(null)

  // Se pide una sola vez el rango más amplio (año) y varios widgets (Rendimiento,
  // Jugadores en riesgo, Minutos por posición) recalculan en el cliente sobre las
  // mismas filas — antes cada uno pegaba su propio fetch a Supabase.
  useEffect(() => {
    let alive = true
    fetchAgencyPerformanceRows()
      .then(r => { if (alive) setPerfRows(r) })
      .catch(() => { if (alive) setPerfRows([]) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    Promise.all([
      fetchAllAgencyFixtures().catch(e => { setError(e.message || 'Error cargando fixtures'); return [] as AgencyFixture[] }),
      fetchManualFixtures().then(rows => manualToAgencyFixtures(rows)).catch(() => [] as AgencyFixture[]),
    ])
      .then(([api, manual]) => {
        setFixtures([...api, ...manual])
        if (api.length > 0) setError(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const [data, manual] = await Promise.all([
        fetchAllAgencyFixtures(true),
        fetchManualFixtures().then(rows => manualToAgencyFixtures(rows)).catch(() => [] as AgencyFixture[]),
      ])
      setFixtures([...data, ...manual])
      setError(null)
    } catch (e: any) {
      setError(e.message || 'Error cargando fixtures')
    }
    setRefreshing(false)
  }

  // Recalcular al volver a primer plano: la app puede quedar horas en background
  // (Capacitor) y si el usuario la retoma después de medianoche AR, "hoy" quedaba
  // congelado en el día viejo hasta recargar — justo lo opuesto al requisito de
  // abrir siempre mostrando los partidos de HOY.
  const [today, setToday] = useState(() => new Date())
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setToday(new Date())
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  const todayFixtures = useMemo(
    () => getFixturesForDate(fixtures, today),
    [fixtures, today]
  )

  const fixturesByDate = useMemo(
    () => groupFixturesByDate(fixtures),
    [fixtures]
  )

  const selectedDayFixtures = useMemo(
    () => getFixturesForDate(fixtures, selectedDate),
    [fixtures, selectedDate]
  )

  const calendarDays = useMemo(() => {
    const days: Date[] = []
    for (let i = 0; i < 14; i++) {
      const d = new Date(today)
      d.setDate(today.getDate() + i)
      days.push(d)
    }
    return days
  }, [today])

  const nextMatchDate = useMemo(() => {
    for (const day of calendarDays) {
      if (isSameDay(day, today)) continue
      const key = dateKey(day)
      if (fixturesByDate.has(key)) return day
    }
    return null
  }, [calendarDays, today, fixturesByDate])

  const mostValuable = useMemo(() =>
    [...internal].filter(p => p.marketValueRaw > 0).sort((a, b) => b.marketValueRaw - a.marketValueRaw).slice(0, 5),
    [internal],
  )
  const leastValuable = useMemo(() =>
    [...internal].filter(p => p.marketValueRaw > 0).sort((a, b) => a.marketValueRaw - b.marketValueRaw).slice(0, 5),
    [internal],
  )
  const youngTalents = useMemo(() =>
    [...internal]
      .filter(p => p.ageNum <= 21 && p.rating !== null && (p.rating ?? 0) >= 4.0)
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, 5),
    [internal],
  )

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 space-y-8 animate-fade-in">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-apple-gray-800 dark:text-white tracking-tight">
            {t(getGreetingKey())}{userDisplayName ? `, ${userDisplayName}` : ''}
          </h1>
          <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 mt-0.5">
            {formatDateLong(today, language)}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800 transition-colors disabled:opacity-50"
        >
          <svg className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {t('home.actualizar')}
        </button>
      </div>

      {/* ── Error Banner ───────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-apple-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 text-sm text-red-700 dark:text-red-300">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <span className="flex-1">{error}</span>
          <button onClick={handleRefresh} className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline">{t('home.reintentar')}</button>
        </div>
      )}

      {/* ── Agenda: partidos de hoy + calendario 14 días (arriba de todo) ── */}
      <HomeSection title={t('home.agenda')} badge={todayFixtures.length} action={{ label: t('home.verCalendario'), to: '/calendario' }}>
        {loading ? (
          <div className="grid grid-cols-1 gap-3">
            <MatchSkeleton />
          </div>
        ) : todayFixtures.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500">{t('home.noHayPartidosHoy')}</p>
            {nextMatchDate && (
              <p className="text-xs text-apple-gray-300 dark:text-apple-gray-600 mt-1">
                {t('home.proximo')}: {formatDateLong(nextMatchDate, language)}
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 mb-4">
            {todayFixtures.map(f => (
              <MatchCard key={f.fixtureId} fixture={f} />
            ))}
          </div>
        )}

        <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-thin [-webkit-overflow-scrolling:touch] border-t border-apple-gray-100 dark:border-apple-gray-700/40 mt-2 pt-2">
          {calendarDays.map(day => {
            const key = dateKey(day)
            const count = fixturesByDate.get(key)?.length || 0
            const isToday = isSameDay(day, today)
            const isSelected = isSameDay(day, selectedDate)

            return (
              <button
                key={key}
                onClick={() => setSelectedDate(day)}
                className={`flex-1 min-w-[44px] snap-start flex flex-col items-center py-2 px-1 rounded-lg transition-all ${
                  isSelected ? 'bg-brand-green/10' : 'hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/30'
                }`}
              >
                <span className="text-2xs font-medium text-apple-gray-400 dark:text-apple-gray-500 uppercase">
                  {formatDayShort(day, language)}
                </span>
                <span className={`text-sm font-semibold mt-0.5 w-6 h-6 flex items-center justify-center rounded-full ${
                  isToday ? 'bg-brand-green text-white' : isSelected ? 'text-brand-green' : 'text-apple-gray-700 dark:text-apple-gray-300'
                }`}>
                  {day.getDate()}
                </span>
                <div className="flex gap-0.5 mt-1 h-1.5">
                  {count > 0 && Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                    <span key={i} className={`w-1 h-1 rounded-full ${isSelected ? 'bg-brand-green' : 'bg-apple-gray-300 dark:bg-apple-gray-600'}`} />
                  ))}
                </div>
              </button>
            )
          })}
        </div>

        {!loading && !isSameDay(selectedDate, today) && (
          <div className="border-t border-apple-gray-100 dark:border-apple-gray-700/40 mt-2 pt-2">
            {selectedDayFixtures.length === 0 ? (
              <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 text-center py-4">
                {t('home.sinPartidosEl')} {formatDateLong(selectedDate, language)}
              </p>
            ) : (
              <div className="space-y-2">
                {selectedDayFixtures.map(f => (
                  <div key={f.fixtureId} className="flex items-center gap-3 p-3 rounded-apple bg-apple-gray-50 dark:bg-apple-gray-800/40">
                    <span className="text-xs font-mono text-apple-gray-400 dark:text-apple-gray-500 w-12 flex-shrink-0 text-center">
                      {formatMatchTime(f.date)}
                    </span>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <img src={f.homeTeam.logo} alt="" className="w-5 h-5 object-contain" />
                      <span className="text-sm text-apple-gray-700 dark:text-apple-gray-300 truncate">{f.homeTeam.name}</span>
                      <span className="text-xs text-apple-gray-300 dark:text-apple-gray-600 flex-shrink-0">vs</span>
                      <span className="text-sm text-apple-gray-700 dark:text-apple-gray-300 truncate">{f.awayTeam.name}</span>
                      <img src={f.awayTeam.logo} alt="" className="w-5 h-5 object-contain" />
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {f.players.map(p => (
                        <span key={p.fullName} className="text-2xs font-medium text-brand-green">{p.shortName}</span>
                      ))}
                      {(f.coaches ?? []).map(c => (
                        <span key={c.fullName} className="text-2xs font-medium text-sky-500">DT {c.fullName}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </HomeSection>

      {/* ── Accesos rápidos ─────────────────────────────────── */}
      <QuickAccess />

      {/* ═══════════════════ SCOUT INTERNO ═══════════════════ */}
      <SectionDivider
        title="Scout Interno"
        subtitle="El plantel representado por la agencia"
        icon={<svg className="w-5 h-5 text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>}
      />

      {/* ── Qué es el rating (una sola vez, cubre Top y Peores -- son
          exactamente el mismo cálculo, sólo cambia el orden) ──────────── */}
      <RatingExplainer />

      {/* ── Top Rendimiento (prioridad alta, evolutivo) ──────── */}
      <TopRendimientoWidget rows={perfRows} />

      {/* ── Peores Rendimiento (mismo cálculo, orden inverso) ── */}
      <PeoresRendimientoWidget rows={perfRows} />

      {/* ── Clasificación interna (prioridad alta) ───────────── */}
      {!dataLoading && internal.length > 0 && (
        <HomeSection title="Clasificación interna" action={{ label: 'Ver todos', to: '/clasificacion-interna' }}>
          <AgencyClassificationInsights />
        </HomeSection>
      )}

      {/* ── Composición del plantel ───────────────────────────── */}
      {!dataLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <AgeCompositionWidget internal={internal} />
          <PositionCompositionWidget internal={internal} />
        </div>
      )}

      {/* ── Nacionalidades ────────────────────────────────────── */}
      {!dataLoading && <NationalitiesWidget internal={internal} />}

      {/* ── Resumen ──────────────────────────────────────────── */}
      {!dataLoading && <SummaryCards internal={internal} />}

      {/* ── Rendimiento de la agencia ────────────────────────── */}
      <PerformanceWidget rows={perfRows} />

      {/* ── Ofensivas ─────────────────────────────────────────── */}
      {!dataLoading && <OfensivasWidget rows={perfRows} internal={internal} />}

      {/* ── Duelos (duelos + regates) ─────────────────────────── */}
      {!dataLoading && <DuelosWidget rows={perfRows} internal={internal} />}

      {/* ── Pases ─────────────────────────────────────────────── */}
      {!dataLoading && <PasesWidget rows={perfRows} internal={internal} />}

      {/* ── Señales negativas ─────────────────────────────────── */}
      <AtRiskWidget rows={perfRows} />
      <SinRodajeWidget rows={perfRows} />
      <DelanterosSinGolWidget rows={perfRows} internal={internal} />

      {/* ── Rating por posición ──────────────────────────────── */}
      {!dataLoading && <PositionRatingWidget internal={internal} />}

      {/* ── Físico destacado: oculto hasta mejorar calidad de datos GPS ── */}

      {/* ── Contratos por vencer ─────────────────────────────── */}
      {!dataLoading && <ContractAlertsWidget internal={internal} />}

      {/* ── Valor de mercado evolutivo + concentración/riesgo ── */}
      {!dataLoading && marketValueHistory.length > 0 && (
        <HomeSection title={t('home.valorMercadoEvolutivo')}>
          <PortfolioValueChart data={marketValueHistory} players={internal} />
          <div className="mt-5 pt-5 border-t border-apple-gray-100 dark:border-apple-gray-700/40">
            <PortfolioInsights players={internal} history={marketValueHistory} />
          </div>
        </HomeSection>
      )}

      {/* ── Mayor Valor de Mercado + Jóvenes Promesas ─────────── */}
      {!dataLoading && (mostValuable.length > 0 || youngTalents.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {mostValuable.length > 0 && (
            <HomeSection title="Mayor valor de mercado" action={{ label: 'Ver todos', to: '/interno' }}>
              <RankingList
                players={mostValuable}
                renderMetric={p => (
                  <span className="text-xs font-bold text-apple-gray-700 dark:text-apple-gray-200 flex-shrink-0">
                    {formatMarketValueInCurrency(p.marketValueRaw, currency, rate)}
                  </span>
                )}
              />
            </HomeSection>
          )}
          {leastValuable.length > 0 && (
            <HomeSection title="Menor valor de mercado" action={{ label: 'Ver todos', to: '/interno' }}>
              <RankingList
                players={leastValuable}
                renderMetric={p => (
                  <span className="text-xs font-bold text-apple-gray-700 dark:text-apple-gray-200 flex-shrink-0">
                    {formatMarketValueInCurrency(p.marketValueRaw, currency, rate)}
                  </span>
                )}
              />
            </HomeSection>
          )}
        </div>
      )}

      {/* ── Jóvenes Promesas ──────────────────────────────────── */}
      {!dataLoading && youngTalents.length > 0 && (
        <HomeSection title="Jóvenes promesas" action={{ label: 'Ver todos', to: '/interno' }}>
          <RankingList
            players={youngTalents}
            renderMetric={p => (
              <span className="text-sm font-extrabold text-brand-green bg-brand-green/10 rounded-full px-2.5 py-1 flex-shrink-0 tabular-nums">{p.rating?.toFixed(1)}</span>
            )}
          />
        </HomeSection>
      )}

      {/* ── Ligas de la agencia ───────────────────────────────── */}
      {!dataLoading && <LeaguesWidget internal={internal} />}

      {/* ── Cumpleaños del plantel ───────────────────────────── */}
      <BirthdaysWidget today={today} internal={internal} />

      {/* ═══════════════════ SCOUT EXTERNO ═══════════════════ */}
      <SectionDivider
        title="Scout Externo"
        subtitle="Prospectos y oportunidades fuera de la agencia"
        icon={<svg className="w-5 h-5 text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" /></svg>}
      />

      {/* ── Debutantes ────────────────────────────────────────── */}
      <DebutantesWidget />

      {/* ── Jugadores en seguimiento ──────────────────────────── */}
      <SeguimientoWidget />

      {/* ── Mejores del scouting externo (por liga) ──────────── */}
      <ExternalTopByLeagueWidget players={latamScouting.players} loading={latamScouting.loading} />

      {/* ── Oportunidades de mercado ────────────────────────── */}
      <OpportunityHero />
    </div>
  )
}
