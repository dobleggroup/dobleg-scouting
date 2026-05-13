import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { fetchAllAgencyFixtures, groupFixturesByDate, toArDateKey } from '@/services/footballApiService'
import { AGENCY_PLAYERS } from '@/constants/agencyPlayers'
import type { AgencyFixture } from '@/types/footballApi'

const DAYS_SHORT = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM']
const DAYS_FULL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

type View = 'month' | 'week'

function isoDay(date: Date): number {
  return date.getDay() === 0 ? 6 : date.getDay() - 1
}

function sameDay(a: Date, b: Date): boolean {
  return toArDateKey(a) === toArDateKey(b)
}

function formatTime(dateStr: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date(dateStr))
}

function isFinished(s: string): boolean {
  return ['FT', 'AET', 'PEN'].includes(s)
}

function isLive(s: string): boolean {
  return ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE'].includes(s)
}

function getMonthGrid(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const start = new Date(first)
  start.setDate(first.getDate() - isoDay(first))

  const weeks: Date[][] = []
  const cursor = new Date(start)
  while (cursor <= last || weeks.length < 5) {
    const week: Date[] = []
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cursor))
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(week)
    if (weeks.length >= 6) break
  }
  return weeks
}

function getWeekDays(date: Date): Date[] {
  const monday = new Date(date)
  monday.setDate(date.getDate() - isoDay(date))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function isAway(fixture: AgencyFixture): boolean {
  return fixture.leagueCountry !== 'Argentina'
}

// ─── Match Pill (compact, for month cells) ────────────────────────────────────

function MatchPill({ fixture }: { fixture: AgencyFixture }) {
  const live = isLive(fixture.statusShort)
  const done = isFinished(fixture.statusShort)
  const opponent = fixture.isHome ? fixture.awayTeam : fixture.homeTeam
  const abroad = isAway(fixture)

  return (
    <div className={`flex items-center gap-1.5 py-0.5 text-sm leading-tight truncate ${
      live ? 'text-brand-green font-semibold' :
      done ? 'text-apple-gray-400 dark:text-apple-gray-500' :
      'text-apple-gray-700 dark:text-apple-gray-300'
    }`}>
      {abroad && fixture.leagueFlag && (
        <img src={fixture.leagueFlag} alt={fixture.leagueCountry} className="w-4 h-3 object-cover rounded-[2px] flex-shrink-0" />
      )}
      <img src={opponent.logo} alt="" className="w-5 h-5 object-contain flex-shrink-0" />
      <span className="truncate">
        {done ? `${fixture.goalsHome}-${fixture.goalsAway}` : formatTime(fixture.date)}
        {' vs '}{opponent.name.length > 14 ? opponent.name.slice(0, 13) + '…' : opponent.name}
      </span>
      {live && <span className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse-soft flex-shrink-0" />}
    </div>
  )
}

// ─── Match Detail Row (for week view & expanded day) ──────────────────────────

function MatchDetailRow({ fixture }: { fixture: AgencyFixture }) {
  const live = isLive(fixture.statusShort)
  const done = isFinished(fixture.statusShort)
  const abroad = isAway(fixture)

  return (
    <div className={`flex items-center gap-3 p-3 rounded-apple transition-colors hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/30 ${
      live ? 'bg-brand-green/5 ring-1 ring-brand-green/20' : ''
    }`}>
      <div className="w-12 text-center flex-shrink-0">
        {live ? (
          <span className="text-xs font-bold text-brand-green">{fixture.elapsed}'</span>
        ) : (
          <span className="text-xs font-mono text-apple-gray-400">{formatTime(fixture.date)}</span>
        )}
      </div>

      <img src={fixture.leagueLogo} alt="" className="w-4 h-4 object-contain flex-shrink-0" />

      <div className="flex items-center gap-2 flex-1 min-w-0">
        <img src={fixture.homeTeam.logo} alt="" className="w-7 h-7 object-contain flex-shrink-0" />
        <span className={`text-sm truncate ${done ? 'text-apple-gray-500' : 'text-apple-gray-800 dark:text-white'}`}>
          {fixture.homeTeam.name}
        </span>
        <span className="text-sm font-bold text-apple-gray-800 dark:text-white tabular-nums flex-shrink-0 px-1">
          {done || live ? `${fixture.goalsHome} - ${fixture.goalsAway}` : 'vs'}
        </span>
        <span className={`text-sm truncate ${done ? 'text-apple-gray-500' : 'text-apple-gray-800 dark:text-white'}`}>
          {fixture.awayTeam.name}
        </span>
        <img src={fixture.awayTeam.logo} alt="" className="w-7 h-7 object-contain flex-shrink-0" />
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {fixture.players.map(p => (
          <span key={p.fullName} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-2xs font-medium bg-brand-green/10 text-brand-green">
            {p.image && <img src={p.image} alt="" className="w-3 h-3 rounded-full object-cover" />}
            {p.shortName}
          </span>
        ))}
      </div>

      {abroad && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-medium bg-sky-500/10 text-sky-400 flex-shrink-0">
          {fixture.leagueFlag && <img src={fixture.leagueFlag} alt="" className="w-3.5 h-2.5 object-cover rounded-[1px]" />}
          {fixture.leagueCountry}
        </span>
      )}
    </div>
  )
}

// ─── Month View ───────────────────────────────────────────────────────────────

function MonthView({
  year, month, fixturesByDate, today, selectedDay, onSelectDay,
}: {
  year: number; month: number
  fixturesByDate: Map<string, AgencyFixture[]>
  today: Date; selectedDay: Date | null
  onSelectDay: (d: Date) => void
}) {
  const weeks = useMemo(() => getMonthGrid(year, month), [year, month])

  return (
    <div className="bg-white dark:bg-apple-gray-800/60 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-7 border-b border-apple-gray-200/60 dark:border-apple-gray-700/40">
        {DAYS_SHORT.map(d => (
          <div key={d} className="py-2.5 text-center text-2xs font-semibold text-apple-gray-400 dark:text-apple-gray-500 uppercase tracking-wider">
            {d}
          </div>
        ))}
      </div>

      {/* Weeks */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 border-b last:border-b-0 border-apple-gray-100 dark:border-apple-gray-700/30">
          {week.map(day => {
            const key = toArDateKey(day)
            const matches = fixturesByDate.get(key) || []
            const isCurrentMonth = day.getMonth() === month
            const isToday = sameDay(day, today)
            const isSelected = selectedDay && sameDay(day, selectedDay)

            return (
              <button
                key={key}
                onClick={() => onSelectDay(day)}
                className={`min-h-[110px] sm:min-h-[155px] p-2 sm:p-3 text-left border-r last:border-r-0 border-apple-gray-100 dark:border-apple-gray-700/20 transition-colors ${
                  isSelected ? 'bg-brand-green/5 dark:bg-brand-green/10' :
                  isToday ? 'bg-apple-gray-50 dark:bg-apple-gray-800/80' :
                  'hover:bg-apple-gray-50/50 dark:hover:bg-apple-gray-700/20'
                } ${!isCurrentMonth ? 'opacity-30' : ''}`}
              >
                <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold mb-1.5 ${
                  isToday ? 'bg-brand-green text-white' :
                  isSelected ? 'text-brand-green' :
                  'text-apple-gray-700 dark:text-apple-gray-300'
                }`}>
                  {day.getDate()}
                </span>
                <div className="space-y-1.5 hidden sm:block">
                  {matches.slice(0, 4).map(m => (
                    <MatchPill key={m.fixtureId} fixture={m} />
                  ))}
                  {matches.length > 4 && (
                    <span className="text-xs text-apple-gray-400 pl-1">+{matches.length - 4} más</span>
                  )}
                </div>
                {/* Mobile: just dots */}
                <div className="flex gap-0.5 mt-0.5 sm:hidden">
                  {matches.slice(0, 4).map(m => (
                    <span key={m.fixtureId} className={`w-1.5 h-1.5 rounded-full ${
                      isLive(m.statusShort) ? 'bg-brand-green animate-pulse-soft' :
                      isFinished(m.statusShort) ? 'bg-apple-gray-300 dark:bg-apple-gray-600' :
                      'bg-brand-green/60'
                    }`} />
                  ))}
                </div>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ─── Week View ────────────────────────────────────────────────────────────────

function WeekView({
  baseDate, fixturesByDate, today,
}: {
  baseDate: Date
  fixturesByDate: Map<string, AgencyFixture[]>
  today: Date
}) {
  const days = useMemo(() => getWeekDays(baseDate), [baseDate])

  return (
    <div className="space-y-2">
      {days.map((day, i) => {
        const key = toArDateKey(day)
        const matches = fixturesByDate.get(key) || []
        const isToday = sameDay(day, today)

        return (
          <div
            key={key}
            className={`bg-white dark:bg-apple-gray-800/60 rounded-apple-lg border overflow-hidden transition-all ${
              isToday ? 'border-brand-green/30 shadow-[0_0_8px_rgba(34,197,94,0.06)]' : 'border-apple-gray-200/60 dark:border-apple-gray-700/40'
            }`}
          >
            <div className={`flex items-center gap-3 px-4 py-2.5 border-b border-apple-gray-100 dark:border-apple-gray-700/30 ${
              isToday ? 'bg-brand-green/5' : ''
            }`}>
              <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                isToday ? 'bg-brand-green text-white' : 'text-apple-gray-700 dark:text-apple-gray-300'
              }`}>
                {day.getDate()}
              </span>
              <span className="text-sm font-medium text-apple-gray-600 dark:text-apple-gray-400">
                {DAYS_FULL[i]}
              </span>
              {isToday && (
                <span className="text-2xs font-semibold text-brand-green uppercase tracking-wider">Hoy</span>
              )}
              {matches.length > 0 && (
                <span className="ml-auto text-2xs font-medium text-apple-gray-400">
                  {matches.length} {matches.length === 1 ? 'partido' : 'partidos'}
                </span>
              )}
            </div>

            {matches.length > 0 ? (
              <div className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700/30">
                {matches.map(m => (
                  <MatchDetailRow key={m.fixtureId} fixture={m} />
                ))}
              </div>
            ) : (
              <div className="py-5 text-center text-xs text-apple-gray-300 dark:text-apple-gray-600">
                Sin partidos
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Selected Day Panel ───────────────────────────────────────────────────────

function DayPanel({
  day, fixtures, onClose,
}: {
  day: Date; fixtures: AgencyFixture[]; onClose: () => void
}) {
  const dayIdx = isoDay(day)

  return (
    <div className="mt-3 bg-white dark:bg-apple-gray-800/60 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 overflow-hidden animate-slide-up">
      <div className="flex items-center justify-between px-4 py-3 border-b border-apple-gray-100 dark:border-apple-gray-700/30">
        <span className="text-sm font-semibold text-apple-gray-800 dark:text-white">
          {DAYS_FULL[dayIdx]} {day.getDate()} de {MONTHS[day.getMonth()]}
        </span>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors">
          <svg className="w-4 h-4 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      {fixtures.length > 0 ? (
        <div className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700/30">
          {fixtures.map(m => (
            <MatchDetailRow key={m.fixtureId} fixture={m} />
          ))}
        </div>
      ) : (
        <div className="py-8 text-center text-sm text-apple-gray-400">Sin partidos este día</div>
      )}
    </div>
  )
}

// ─── Player Search ───────────────────────────────────────────────────────────

function normSearch(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

const ACTIVE_PLAYERS = AGENCY_PLAYERS.filter(p => !p.isReserve && p.apiTeamId)

function PlayerSearch({
  onSelect,
  selected,
  onClear,
}: {
  onSelect: (player: typeof ACTIVE_PLAYERS[number]) => void
  selected: typeof ACTIVE_PLAYERS[number] | null
  onClear: () => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const results = useMemo(() => {
    if (!query.trim()) return ACTIVE_PLAYERS
    const q = normSearch(query)
    return ACTIVE_PLAYERS.filter(p =>
      normSearch(p.fullName).includes(q) ||
      normSearch(p.shortName).includes(q) ||
      normSearch(p.team).includes(q)
    )
  }, [query])

  if (selected) {
    return (
      <button
        onClick={onClear}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-green/10 text-brand-green text-sm font-medium hover:bg-brand-green/20 transition-colors group"
      >
        {selected.image && (
          <img src={selected.image} alt="" className="w-5 h-5 rounded-full object-cover" />
        )}
        {selected.shortName}
        <svg className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    )
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar jugador..."
          className="w-full sm:w-56 pl-8 pr-3 py-1.5 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 border border-apple-gray-200/60 dark:border-apple-gray-700/40 text-sm text-apple-gray-800 dark:text-white placeholder:text-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green/40 transition-all"
        />
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 sm:right-auto sm:w-72 mt-1.5 bg-white dark:bg-apple-gray-800 border border-apple-gray-200/60 dark:border-apple-gray-700/40 rounded-xl shadow-lg overflow-hidden z-50 max-h-[320px] overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-apple-gray-400">Sin resultados</div>
          ) : (
            results.map(p => (
              <button
                key={p.fullName}
                onClick={() => { onSelect(p); setQuery(''); setOpen(false) }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-brand-green/5 dark:hover:bg-brand-green/10 transition-colors text-left"
              >
                {p.image ? (
                  <img src={p.image} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700 flex items-center justify-center flex-shrink-0">
                    <span className="text-2xs font-semibold text-apple-gray-500">{p.shortName.split(' ').map(w => w[0]).join('')}</span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-apple-gray-800 dark:text-white truncate">{p.fullName}</div>
                  <div className="text-2xs text-apple-gray-400 truncate">{p.team}</div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Calendar Page ───────────────────────────────────────────────────────

export default function CalendarPage() {
  const [fixtures, setFixtures] = useState<AgencyFixture[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [selectedPlayer, setSelectedPlayer] = useState<typeof ACTIVE_PLAYERS[number] | null>(null)

  const today = useMemo(() => new Date(), [])

  useEffect(() => {
    fetchAllAgencyFixtures()
      .then(f => { setFixtures(f); setError(null) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filteredFixtures = useMemo(() => {
    if (!selectedPlayer) return fixtures
    return fixtures.filter(f =>
      f.homeTeam.id === selectedPlayer.apiTeamId || f.awayTeam.id === selectedPlayer.apiTeamId
    )
  }, [fixtures, selectedPlayer])

  const fixturesByDate = useMemo(() => groupFixturesByDate(filteredFixtures), [filteredFixtures])

  const selectedDayFixtures = useMemo(
    () => selectedDay ? fixturesByDate.get(toArDateKey(selectedDay)) || [] : [],
    [selectedDay, fixturesByDate]
  )

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const monthMatchCount = useMemo(() => {
    let count = 0
    const grid = getMonthGrid(year, month)
    for (const week of grid) {
      for (const day of week) {
        if (day.getMonth() === month) {
          count += (fixturesByDate.get(toArDateKey(day)) || []).length
        }
      }
    }
    return count
  }, [year, month, fixturesByDate])

  const navigate = useCallback((dir: number) => {
    setSelectedDay(null)
    if (view === 'month') {
      setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + dir, 1))
    } else {
      setCurrentDate(prev => {
        const d = new Date(prev)
        d.setDate(prev.getDate() + dir * 7)
        return d
      })
    }
  }, [view])

  const goToToday = useCallback(() => {
    setCurrentDate(new Date())
    setSelectedDay(null)
  }, [])

  const weekRange = useMemo(() => {
    const days = getWeekDays(currentDate)
    const first = days[0]
    const last = days[6]
    if (first.getMonth() === last.getMonth()) {
      return `${first.getDate()} - ${last.getDate()} de ${MONTHS[first.getMonth()]}`
    }
    return `${first.getDate()} ${MONTHS[first.getMonth()].slice(0, 3)} - ${last.getDate()} ${MONTHS[last.getMonth()].slice(0, 3)}`
  }, [currentDate])

  const title = view === 'month'
    ? `${MONTHS[month]} ${year}`
    : weekRange

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 space-y-5 animate-fade-in">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-apple-gray-400 hover:text-apple-gray-600 dark:hover:text-apple-gray-300 transition-colors flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Inicio
        </Link>
        <PlayerSearch
          selected={selectedPlayer}
          onSelect={p => { setSelectedPlayer(p); setSelectedDay(null) }}
          onClear={() => { setSelectedPlayer(null); setSelectedDay(null) }}
        />
      </div>

      {/* ── Controls ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800 transition-colors"
          >
            <svg className="w-5 h-5 text-apple-gray-600 dark:text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl sm:text-2xl font-bold text-apple-gray-800 dark:text-white tracking-tight min-w-[200px] text-center">
            {title}
          </h1>
          <button
            onClick={() => navigate(1)}
            className="p-2 rounded-lg hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800 transition-colors"
          >
            <svg className="w-5 h-5 text-apple-gray-600 dark:text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button
            onClick={goToToday}
            className="ml-1 px-3 py-1.5 rounded-lg text-xs font-medium text-brand-green hover:bg-brand-green/10 transition-colors"
          >
            Hoy
          </button>
          {view === 'month' && monthMatchCount > 0 && (
            <span className="ml-2 text-xs text-apple-gray-400">
              {monthMatchCount} {monthMatchCount === 1 ? 'partido' : 'partidos'}
            </span>
          )}
        </div>

        {/* View Toggle */}
        <div className="flex bg-apple-gray-100 dark:bg-apple-gray-800 rounded-lg p-0.5">
          <button
            onClick={() => { setView('month'); setSelectedDay(null) }}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              view === 'month'
                ? 'bg-white dark:bg-apple-gray-700 text-apple-gray-800 dark:text-white shadow-sm'
                : 'text-apple-gray-500 dark:text-apple-gray-400 hover:text-apple-gray-700 dark:hover:text-apple-gray-300'
            }`}
          >
            Mes
          </button>
          <button
            onClick={() => { setView('week'); setSelectedDay(null) }}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              view === 'week'
                ? 'bg-white dark:bg-apple-gray-700 text-apple-gray-800 dark:text-white shadow-sm'
                : 'text-apple-gray-500 dark:text-apple-gray-400 hover:text-apple-gray-700 dark:hover:text-apple-gray-300'
            }`}
          >
            Semana
          </button>
        </div>
      </div>

      {/* ── Error ───────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-apple-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 text-sm text-red-700 dark:text-red-300">
          <span className="flex-1">{error}</span>
        </div>
      )}

      {/* ── Loading ─────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 bg-apple-gray-100 dark:bg-apple-gray-800 rounded-apple-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* ── Calendar Content ────────────────────────────── */}
          {view === 'month' ? (
            <>
              <MonthView
                year={year}
                month={month}
                fixturesByDate={fixturesByDate}
                today={today}
                selectedDay={selectedDay}
                onSelectDay={d => setSelectedDay(prev => prev && sameDay(prev, d) ? null : d)}
              />
              {selectedDay && (
                <DayPanel
                  day={selectedDay}
                  fixtures={selectedDayFixtures}
                  onClose={() => setSelectedDay(null)}
                />
              )}
            </>
          ) : (
            <WeekView
              baseDate={currentDate}
              fixturesByDate={fixturesByDate}
              today={today}
            />
          )}
        </>
      )}
    </div>
  )
}
