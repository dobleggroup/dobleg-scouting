import { useState, useEffect, useMemo } from 'react'
import { AGENCY_PLAYERS, getTotalPortfolioValue, formatPortfolioValue, getExpiringContracts } from '@/constants/agencyPlayers'
import { fetchAllAgencyFixtures, getFixturesForDate, groupFixturesByDate } from '@/services/footballApiService'
import type { AgencyFixture } from '@/types/footballApi'

const DAYS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const DAYS_SHORT = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB']
const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function formatDateLong(date: Date): string {
  return `${DAYS_ES[date.getDay()]} ${date.getDate()} de ${MONTHS_ES[date.getMonth()]}`
}

function dateKey(date: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).format(date)
}

function getGreeting(): string {
  const h = new Date().getHours()
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
  return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
}

function isMatchFinished(status: string): boolean {
  return ['FT', 'AET', 'PEN'].includes(status)
}

function isMatchLive(status: string): boolean {
  return ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE'].includes(status)
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="bg-white dark:bg-apple-gray-800/60 rounded-apple-lg p-4 border border-apple-gray-200/60 dark:border-apple-gray-700/40 transition-all hover:shadow-apple dark:hover:shadow-apple-dark">
      <p className={`text-2xl font-bold tracking-tight ${accent ? 'text-brand-green' : 'text-apple-gray-800 dark:text-white'}`}>
        {value}
      </p>
      <p className="text-xs text-apple-gray-400 dark:text-apple-gray-500 mt-0.5">{label}</p>
    </div>
  )
}

// ─── Match Card ──────────────────────────────────────────────────────────────

function MatchCard({ fixture }: { fixture: AgencyFixture }) {
  const time = formatMatchTime(fixture.date)
  const finished = isMatchFinished(fixture.statusShort)
  const live = isMatchLive(fixture.statusShort)

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
        {live ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-green">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse-soft" />
            {fixture.elapsed}'
          </span>
        ) : (
          <span className="text-xs text-apple-gray-400 dark:text-apple-gray-500">{time}</span>
        )}
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

      <div className="px-4 py-2.5 border-t border-apple-gray-100 dark:border-apple-gray-700/40 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {fixture.players.map(p => (
            <span key={p.fullName} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-green/10 text-brand-green">
              {p.image && <img src={p.image} alt="" className="w-3.5 h-3.5 rounded-full object-cover" />}
              {p.shortName}
            </span>
          ))}
        </div>
        <span className={`text-xs flex-shrink-0 ${fixture.isHome ? 'text-blue-500' : 'text-orange-400'}`}>
          {fixture.isHome ? 'Local' : 'Visitante'}
        </span>
      </div>
    </div>
  )
}

// ─── Player Mini Card ────────────────────────────────────────────────────────

function PlayerMiniCard({ player }: { player: typeof AGENCY_PLAYERS[0] }) {
  return (
    <div className="group bg-white dark:bg-apple-gray-800/40 rounded-apple p-3 border border-apple-gray-200/50 dark:border-apple-gray-700/30 transition-all hover:shadow-apple dark:hover:shadow-apple-dark hover:border-apple-gray-300 dark:hover:border-apple-gray-600">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full overflow-hidden bg-apple-gray-100 dark:bg-apple-gray-700 flex-shrink-0 ring-2 ring-apple-gray-200/50 dark:ring-apple-gray-600/50">
          {player.image ? (
            <img src={player.image} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-apple-gray-400 text-sm font-medium">
              {player.shortName.charAt(0)}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-apple-gray-800 dark:text-white truncate">{player.shortName}</p>
          <p className="text-xs text-apple-gray-400 dark:text-apple-gray-500 truncate">{player.team}</p>
        </div>
        {player.marketValue && (
          <span className="text-xs font-medium text-brand-green flex-shrink-0">{player.marketValue}</span>
        )}
      </div>
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
      <div className="px-4 py-2.5 border-t border-apple-gray-100 dark:border-apple-gray-700/40">
        <div className="h-3 bg-apple-gray-100 dark:bg-apple-gray-700 rounded w-20" />
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function HomePage() {
  const [fixtures, setFixtures] = useState<AgencyFixture[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    fetchAllAgencyFixtures()
      .then(setFixtures)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const data = await fetchAllAgencyFixtures(true)
      setFixtures(data)
    } catch { /* ignore */ }
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

  const portfolioValue = useMemo(() => formatPortfolioValue(getTotalPortfolioValue()), [])
  const expiringCount = useMemo(() => getExpiringContracts().length, [])
  const uniqueTeams = useMemo(() => new Set(AGENCY_PLAYERS.map(p => p.team)).size, [])

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 space-y-8 animate-fade-in">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-apple-gray-800 dark:text-white tracking-tight">
            {getGreeting()}
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

      {/* ── Quick Stats ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard value={String(AGENCY_PLAYERS.length)} label="Jugadores" />
        <StatCard value={portfolioValue} label="Valor portfolio" accent />
        <StatCard value={String(uniqueTeams)} label="Equipos" />
        <StatCard value={String(expiringCount)} label="Contratos por vencer" />
      </div>

      {/* ── Today's Matches ─────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold text-apple-gray-800 dark:text-white mb-4 flex items-center gap-2">
          Partidos de hoy
          {todayFixtures.length > 0 && (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-brand-green text-white text-xs font-bold">
              {todayFixtures.length}
            </span>
          )}
        </h2>

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <MatchSkeleton />
            <MatchSkeleton />
          </div>
        ) : todayFixtures.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-apple-gray-800/30 rounded-apple-lg border border-apple-gray-200/40 dark:border-apple-gray-700/30">
            <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-apple-gray-100 dark:bg-apple-gray-800 flex items-center justify-center">
              <svg className="w-6 h-6 text-apple-gray-300 dark:text-apple-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500">No hay partidos hoy</p>
            {nextMatchDate && (
              <p className="text-xs text-apple-gray-300 dark:text-apple-gray-600 mt-1">
                Próximo: {formatDateLong(nextMatchDate)}
              </p>
            )}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {todayFixtures.map(f => (
              <MatchCard key={f.fixtureId} fixture={f} />
            ))}
          </div>
        )}
      </section>

      {/* ── Calendar + Upcoming ─────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold text-apple-gray-800 dark:text-white mb-4">
          Próximos partidos
        </h2>

        {/* Calendar Strip */}
        <div className="bg-white dark:bg-apple-gray-800/60 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 overflow-hidden">
          <div className="flex overflow-x-auto">
            {calendarDays.map(day => {
              const key = dateKey(day)
              const count = fixturesByDate.get(key)?.length || 0
              const isToday = isSameDay(day, today)
              const isSelected = isSameDay(day, selectedDate)

              return (
                <button
                  key={key}
                  onClick={() => setSelectedDate(day)}
                  className={`flex-1 min-w-[48px] flex flex-col items-center py-3 px-1 transition-all ${
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

          {/* Selected Day Matches */}
          {!loading && (
            <div className="border-t border-apple-gray-200/60 dark:border-apple-gray-700/40">
              {selectedDayFixtures.length === 0 ? (
                <div className="py-8 text-center">
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
                          <span key={p.fullName} className="px-1.5 py-0.5 rounded text-2xs font-medium bg-brand-green/10 text-brand-green">
                            {p.shortName}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Roster ──────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold text-apple-gray-800 dark:text-white mb-4">
          Plantilla
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
          {AGENCY_PLAYERS.map((player, i) => (
            <PlayerMiniCard key={`${player.fullName}-${i}`} player={player} />
          ))}
        </div>
      </section>
    </div>
  )
}
