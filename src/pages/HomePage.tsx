import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AGENCY_PLAYERS, getExpiringContracts } from '@/constants/agencyPlayers'
import { fetchAllAgencyFixtures, getFixturesForDate, groupFixturesByDate, toArDateKey } from '@/services/footballApiService'
import { fetchManualFixtures, manualToAgencyFixtures } from '@/services/agencyManualFixturesService'
import { useAuth } from '@/context/AuthContext'
import type { AgencyFixture } from '@/types/footballApi'
import OpportunityHero from '@/components/dashboard/OpportunityHero'

const DAYS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const DAYS_SHORT = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB']
const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function formatDateLong(date: Date): string {
  return `${DAYS_ES[date.getDay()]} ${date.getDate()} de ${MONTHS_ES[date.getMonth()]}`
}

function formatDateShort(date: Date): string {
  return `${date.getDate()} ${MONTHS_ES[date.getMonth()].slice(0, 3)}`
}

function dateKey(date: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).format(date)
}

function getGreeting(): string {
  const h = parseInt(new Intl.DateTimeFormat('es-AR', {
    hour: 'numeric', hour12: false,
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date()), 10)
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
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

function parseContractDate(str: string): Date {
  const [d, m, y] = str.split('/')
  return new Date(+y, +m - 1, +d)
}

function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

// ─── Match Card (today/live) ────────────────────────────────────────────────

function MatchCard({ fixture }: { fixture: AgencyFixture }) {
  const time = formatMatchTime(fixture.date)
  const finished = isMatchFinished(fixture.statusShort)
  const live = isMatchLive(fixture.statusShort)
  const abroad = isAbroad(fixture)

  return (
    <div className={`bg-white dark:bg-apple-gray-800/60 rounded-apple-lg border transition-all hover:shadow-apple-md dark:hover:shadow-apple-dark-md ${
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

      <div className="px-4 py-3 border-t border-apple-gray-100 dark:border-apple-gray-700/40 flex items-center gap-2 flex-wrap">
        {fixture.players.map(p => (
          <span key={p.fullName} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium bg-brand-green/10 text-brand-green">
            {p.image && <img src={p.image} alt="" className="w-6 h-6 rounded-full object-cover" />}
            {p.shortName}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Result Row (compact) ───────────────────────────────────────────────────

function ResultRow({ fixture }: { fixture: AgencyFixture }) {
  const fixtureDate = new Date(fixture.date)
  const abroad = isAbroad(fixture)

  const ourTeamId = fixture.players.length > 0
    ? AGENCY_PLAYERS.find(p => fixture.players.some(fp => fp.fullName === p.fullName))?.apiTeamId
    : undefined
  const won = ourTeamId === fixture.homeTeam.id
    ? (fixture.goalsHome ?? 0) > (fixture.goalsAway ?? 0)
    : (fixture.goalsAway ?? 0) > (fixture.goalsHome ?? 0)
  const drew = fixture.goalsHome === fixture.goalsAway

  return (
    <div className="flex items-center gap-3 py-2">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
        drew ? 'bg-apple-gray-400' : won ? 'bg-brand-green' : 'bg-red-400'
      }`} />
      <span className="text-xs text-apple-gray-400 w-14 flex-shrink-0">
        {formatDateShort(fixtureDate)}
      </span>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <img src={fixture.homeTeam.logo} alt="" className="w-5 h-5 object-contain flex-shrink-0" />
        <span className="text-sm text-apple-gray-700 dark:text-apple-gray-300 truncate">
          {fixture.homeTeam.name}
        </span>
        <span className="text-sm font-bold text-apple-gray-800 dark:text-white tabular-nums flex-shrink-0">
          {fixture.goalsHome} - {fixture.goalsAway}
        </span>
        <span className="text-sm text-apple-gray-700 dark:text-apple-gray-300 truncate">
          {fixture.awayTeam.name}
        </span>
        <img src={fixture.awayTeam.logo} alt="" className="w-5 h-5 object-contain flex-shrink-0" />
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {fixture.players.slice(0, 2).map(p => (
          <span key={p.fullName} className="text-2xs text-brand-green font-medium">
            {p.shortName}
          </span>
        ))}
      </div>
      {abroad && fixture.leagueFlag && (
        <img src={fixture.leagueFlag} alt="" className="w-4 h-3 object-cover rounded-[1px] flex-shrink-0" />
      )}
    </div>
  )
}

// ─── Loading Skeleton ────────────────────────────────────────────────────────

function MatchSkeleton() {
  return (
    <div className="bg-white dark:bg-apple-gray-800/60 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 animate-pulse">
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
  const [fixtures, setFixtures] = useState<AgencyFixture[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [refreshing, setRefreshing] = useState(false)

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

  const today = useMemo(() => new Date(), [])

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

  const recentResults = useMemo(() => {
    const results: AgencyFixture[] = []
    for (let i = 1; i <= 5; i++) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      const key = toArDateKey(d)
      const dayFixtures = fixturesByDate.get(key) || []
      results.push(...dayFixtures.filter(f => isMatchFinished(f.statusShort)))
    }
    return results.sort((a, b) => b.timestamp - a.timestamp)
  }, [today, fixturesByDate])

  const upcomingTravel = useMemo(() => {
    const trips: AgencyFixture[] = []
    for (let i = 0; i <= 10; i++) {
      const d = new Date(today)
      d.setDate(today.getDate() + i)
      const key = toArDateKey(d)
      const dayFixtures = fixturesByDate.get(key) || []
      trips.push(...dayFixtures.filter(f => isAbroad(f) && !isMatchFinished(f.statusShort)))
    }
    return trips.sort((a, b) => a.timestamp - b.timestamp)
  }, [today, fixturesByDate])

  const expiringContracts = useMemo(() => {
    return getExpiringContracts(8).sort((a, b) => {
      const dateA = parseContractDate(a.contractEnd!)
      const dateB = parseContractDate(b.contractEnd!)
      return dateA.getTime() - dateB.getTime()
    })
  }, [])

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

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 space-y-8 animate-fade-in">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-apple-gray-800 dark:text-white tracking-tight">
            {getGreeting()}{userDisplayName ? `, ${userDisplayName}` : ''}
          </h1>
          <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 mt-0.5">
            {formatDateLong(today)}
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
          Actualizar
        </button>
      </div>

      {/* ── Error Banner ───────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-apple-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 text-sm text-red-700 dark:text-red-300">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <span className="flex-1">{error}</span>
          <button onClick={handleRefresh} className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline">Reintentar</button>
        </div>
      )}

      {/* ── Today's Matches ─────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold text-apple-gray-800 dark:text-white">
            Partidos de hoy
          </h2>
          {todayFixtures.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-md bg-brand-green/15 text-brand-green text-xs font-bold">
              {todayFixtures.length}
            </span>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-3">
            <MatchSkeleton />
            <MatchSkeleton />
          </div>
        ) : todayFixtures.length === 0 ? (
          <div className="text-center py-10 bg-white dark:bg-apple-gray-800/30 rounded-apple-lg border border-apple-gray-200/40 dark:border-apple-gray-700/30">
            <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500">No hay partidos hoy</p>
            {nextMatchDate && (
              <p className="text-xs text-apple-gray-300 dark:text-apple-gray-600 mt-1">
                Próximo: {formatDateLong(nextMatchDate)}
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {todayFixtures.map(f => (
              <MatchCard key={f.fixtureId} fixture={f} />
            ))}
          </div>
        )}
      </section>

      {/* ── Calendar Strip (14 days) ──────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-apple-gray-800 dark:text-white">
            Próximos 14 días
          </h2>
          <Link
            to="/calendario"
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-green hover:text-emerald-600 transition-colors"
          >
            Ver calendario
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        <div className="bg-white dark:bg-apple-gray-800/60 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 overflow-hidden">
          <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-thin [-webkit-overflow-scrolling:touch]">
            {calendarDays.map(day => {
              const key = dateKey(day)
              const count = fixturesByDate.get(key)?.length || 0
              const isToday = isSameDay(day, today)
              const isSelected = isSameDay(day, selectedDate)

              return (
                <button
                  key={key}
                  onClick={() => setSelectedDate(day)}
                  className={`flex-1 min-w-[48px] snap-start flex flex-col items-center py-3 px-1 transition-all ${
                    isSelected
                      ? 'bg-brand-green/10 dark:bg-brand-green/10'
                      : 'hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/30'
                  }`}
                >
                  <span className="text-2xs font-medium text-apple-gray-400 dark:text-apple-gray-500 uppercase">
                    {DAYS_SHORT[day.getDay()]}
                  </span>
                  <span className={`text-sm font-semibold mt-0.5 w-7 h-7 flex items-center justify-center rounded-full ${
                    isToday
                      ? 'bg-brand-green text-white'
                      : isSelected
                        ? 'text-brand-green'
                        : 'text-apple-gray-700 dark:text-apple-gray-300'
                  }`}>
                    {day.getDate()}
                  </span>
                  <div className="flex gap-0.5 mt-1.5 h-1.5">
                    {count > 0 && Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                      <span
                        key={i}
                        className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-brand-green' : 'bg-apple-gray-300 dark:bg-apple-gray-600'}`}
                      />
                    ))}
                  </div>
                </button>
              )
            })}
          </div>

          {!loading && (
            <div className="border-t border-apple-gray-200/60 dark:border-apple-gray-700/40">
              {selectedDayFixtures.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500">
                    Sin partidos el {formatDateLong(selectedDate)}
                  </p>
                </div>
              ) : (
                <div className="p-3 space-y-2">
                  {selectedDayFixtures.map(f => (
                    <div key={f.fixtureId} className="flex items-center gap-3 p-3 rounded-apple bg-apple-gray-50 dark:bg-apple-gray-800/40 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700/40 transition-colors">
                      <span className="text-xs font-mono text-apple-gray-400 dark:text-apple-gray-500 w-12 flex-shrink-0 text-center">
                        {formatMatchTime(f.date)}
                      </span>
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <img src={f.homeTeam.logo} alt="" className="w-5 h-5 object-contain" />
                        <span className="text-sm text-apple-gray-700 dark:text-apple-gray-300 truncate">
                          {f.homeTeam.name}
                        </span>
                        <span className="text-xs text-apple-gray-300 dark:text-apple-gray-600 flex-shrink-0">vs</span>
                        <span className="text-sm text-apple-gray-700 dark:text-apple-gray-300 truncate">
                          {f.awayTeam.name}
                        </span>
                        <img src={f.awayTeam.logo} alt="" className="w-5 h-5 object-contain" />
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {f.players.map(p => (
                          <span key={p.fullName} className="text-2xs font-medium text-brand-green">
                            {p.shortName}
                          </span>
                        ))}
                      </div>
                      {isAbroad(f) && f.leagueFlag && (
                        <img src={f.leagueFlag} alt="" className="w-4 h-3 object-cover rounded-[1px] flex-shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Viajes próximos (full width) ──────────────────── */}
      {upcomingTravel.length > 0 && (
        <section className="bg-gradient-to-r from-sky-50 to-blue-50 dark:from-sky-900/20 dark:to-blue-900/20 rounded-apple-lg border border-sky-200/50 dark:border-sky-800/30 p-5">
          <h3 className="text-sm font-semibold text-apple-gray-800 dark:text-white mb-4 flex items-center gap-2">
            <span className="text-lg">✈️</span>
            Viajes próximos
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400 text-2xs font-bold">
              {upcomingTravel.length}
            </span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {upcomingTravel.slice(0, 6).map(f => {
              const d = new Date(f.date)
              const opponent = f.isHome ? f.awayTeam : f.homeTeam
              return (
                <div key={f.fixtureId} className="flex items-center gap-3 bg-white/70 dark:bg-apple-gray-800/50 rounded-apple p-3">
                  <div className="text-center w-12 flex-shrink-0">
                    <p className="text-xs font-semibold text-apple-gray-700 dark:text-apple-gray-300">{formatDateShort(d)}</p>
                    <p className="text-2xs text-apple-gray-400">{formatMatchTime(f.date)}</p>
                  </div>
                  {f.leagueFlag && (
                    <img src={f.leagueFlag} alt="" className="w-5 h-3.5 object-cover rounded-[2px] flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-apple-gray-700 dark:text-apple-gray-300 truncate">
                      vs {opponent.name}
                    </p>
                    <p className="text-2xs text-sky-500">{f.leagueCountry} · {f.city}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {f.players.slice(0, 2).map(p => (
                      <span key={p.fullName} className="text-2xs text-brand-green font-medium">{p.shortName}</span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Results + Contracts (two columns) ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Recent Results */}
        {recentResults.length > 0 && (
          <section className="bg-white dark:bg-apple-gray-800/40 rounded-apple-lg border border-apple-gray-200/50 dark:border-apple-gray-700/30 p-5">
            <h3 className="text-sm font-semibold text-apple-gray-800 dark:text-white mb-2">
              Resultados recientes
            </h3>
            <div className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700/30">
              {recentResults.slice(0, 8).map(f => (
                <ResultRow key={f.fixtureId} fixture={f} />
              ))}
            </div>
          </section>
        )}

        {/* Expiring Contracts */}
        {expiringContracts.length > 0 && (
          <section className="bg-white dark:bg-apple-gray-800/40 rounded-apple-lg border border-apple-gray-200/50 dark:border-apple-gray-700/30 p-5">
            <h3 className="text-sm font-semibold text-apple-gray-800 dark:text-white mb-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Contratos por vencer
            </h3>
            <div className="space-y-2.5">
              {expiringContracts.map(p => {
                const endDate = parseContractDate(p.contractEnd!)
                const days = daysUntil(endDate)
                const urgent = days <= 60

                return (
                  <div key={p.fullName} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-apple-gray-100 dark:bg-apple-gray-700 flex-shrink-0">
                      {p.image ? (
                        <img src={p.image} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-apple-gray-400 text-xs">
                          {p.shortName.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-apple-gray-800 dark:text-white truncate">{p.shortName}</p>
                      <p className="text-2xs text-apple-gray-400 truncate">{p.team}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-xs font-semibold ${urgent ? 'text-red-400' : 'text-amber-400'}`}>
                        {days <= 0 ? 'Vencido' : `${days} días`}
                      </p>
                      <p className="text-2xs text-apple-gray-400">{p.contractEnd}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </div>

      {/* ── Oportunidades de mercado ────────────────────────── */}
      <OpportunityHero />
    </div>
  )
}
