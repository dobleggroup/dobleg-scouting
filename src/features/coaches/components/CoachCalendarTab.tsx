import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchSeasonFixtures, toArDateKey } from '@/services/footballApiService'
import { listTrainingSessions } from '@/services/coachService'
import { isMatchFinished, mergeCalendarEvents } from '@/utils/coachCalendar'
import { buildMonthGrid, pickDefaultSelectedDate, type MonthGridCell } from '@/features/coaches/calendarMonthGrid'
import type { AgencyFixture } from '@/types/footballApi'
import type { CoachTrainingSession } from '@/services/coachService'
import type { AgencyCoach } from '@/constants/agencyCoaches'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useLanguage } from '@/context/LanguageContext'
import { LANGUAGE_LOCALES } from '@/constants/translations'

// Nombres de día vía Intl según el idioma activo, no un array fijo en español —
// 2 de enero de 2023 fue un lunes, se usa solo como semana de referencia.
function getDayLabels(locale: string): string[] {
  const base = new Date(2023, 0, 2)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    return new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(d)
  })
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-16 px-4 text-center">
      <p className="text-sm text-apple-gray-400 max-w-xs">{message}</p>
    </div>
  )
}

function BoltIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  )
}

function PlaneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 12 3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12Zm0 0h7.5"
      />
    </svg>
  )
}

/** `key` es una ArDateKey "YYYY-MM-DD". Parsearla directo con `new Date(string)` la
 *  interpreta como medianoche UTC: en un dispositivo con huso negativo (como AR,
 *  UTC-3) el posterior `toLocaleDateString` puede mostrar el día anterior. Se arma
 *  la fecha a partir de sus componentes locales para evitar ese corrimiento. */
function parseArDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function capitalize(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

export default function CoachCalendarTab({ coach }: { coach: AgencyCoach }) {
  const { t, language } = useLanguage()
  const locale = LANGUAGE_LOCALES[language]
  const dayLabels = useMemo(() => getDayLabels(locale), [locale])
  const [fixtures, setFixtures] = useState<AgencyFixture[] | null>(null)
  const [sessions, setSessions] = useState<CoachTrainingSession[] | null>(null)
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const t = parseArDateKey(toArDateKey(new Date()))
    return { year: t.getFullYear(), month: t.getMonth() }
  })
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  useEffect(() => {
    if (!coach.apiTeamId || !coach.leagueSeason) return
    let active = true
    Promise.all([
      fetchSeasonFixtures(coach.apiTeamId, coach.leagueSeason),
      listTrainingSessions(coach.key),
    ]).then(([f, s]) => {
      if (active) {
        setFixtures(f)
        setSessions(s)
      }
    })
    return () => {
      active = false
    }
  }, [coach.apiTeamId, coach.leagueSeason, coach.key])

  const todayKey = useMemo(() => toArDateKey(new Date()), [])
  const today = useMemo(() => parseArDateKey(todayKey), [todayKey])

  const eventsByDate = useMemo(() => {
    if (!fixtures || !sessions) return null
    return mergeCalendarEvents(fixtures, sessions)
  }, [fixtures, sessions])

  const grid = useMemo(() => buildMonthGrid(visibleMonth.year, visibleMonth.month), [visibleMonth])

  // Selecciona un dia por defecto una sola vez, apenas los datos terminan de cargar.
  // Despues de eso, la seleccion la maneja siempre una accion explicita del usuario
  // (flechas de mes, boton Hoy, tocar una celda) - ver goToMonthWithSelection.
  useEffect(() => {
    if (!eventsByDate || selectedDate !== null) return
    setSelectedDate(pickDefaultSelectedDate(grid, todayKey, eventsByDate))
  }, [eventsByDate, selectedDate, grid, todayKey])

  if (!coach.apiTeamId || !coach.leagueSeason) {
    return <EmptyState message={t('coachNotes.sinDatosEquipo')} />
  }

  if (eventsByDate === null || selectedDate === null) return <LoadingSpinner message={t('coachCalendar.cargando')} />

  const goToMonthWithSelection = (year: number, month: number, dateToSelect?: string) => {
    const newGrid = buildMonthGrid(year, month)
    setVisibleMonth({ year, month })
    setSelectedDate(dateToSelect ?? pickDefaultSelectedDate(newGrid, todayKey, eventsByDate))
  }

  const goPrevMonth = () => {
    const d = new Date(visibleMonth.year, visibleMonth.month - 1, 1)
    goToMonthWithSelection(d.getFullYear(), d.getMonth())
  }

  const goNextMonth = () => {
    const d = new Date(visibleMonth.year, visibleMonth.month + 1, 1)
    goToMonthWithSelection(d.getFullYear(), d.getMonth())
  }

  const goToday = () => {
    goToMonthWithSelection(today.getFullYear(), today.getMonth(), todayKey)
  }

  const handleCellClick = (cell: MonthGridCell) => {
    if (cell.isCurrentMonth) {
      setSelectedDate(cell.date)
      return
    }
    const d = parseArDateKey(cell.date)
    goToMonthWithSelection(d.getFullYear(), d.getMonth(), cell.date)
  }

  const monthLabel = capitalize(
    new Date(visibleMonth.year, visibleMonth.month, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' }),
  )
  const isCurrentMonthVisible =
    visibleMonth.year === today.getFullYear() && visibleMonth.month === today.getMonth()

  const selectedDay = eventsByDate.get(selectedDate) ?? {
    date: selectedDate,
    fixtures: [] as AgencyFixture[],
    sessions: [] as CoachTrainingSession[],
    isAbroad: false,
  }
  const selectedParsed = parseArDateKey(selectedDate)
  const selectedDateLabel = capitalize(
    selectedParsed.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }),
  )

  return (
    <div className="lg:flex lg:items-start lg:gap-8 animate-fade-in">
      {/* Columna del calendario: ancho fijo en desktop -- una grilla de 7 columnas estirada
          a lo ancho del layout de main.5xl (screen-2xl) da celdas gigantes con escudos de
          14px perdidos en el centro. Se acota para que la grilla quede proporcionada y el
          espacio sobrante en desktop se use para un detalle de partido mas grande, no vacio. */}
      <div className="lg:w-[46rem] lg:flex-shrink-0 space-y-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={goPrevMonth}
            aria-label={t('coachCalendar.mesAnterior')}
            className="w-9 h-9 flex items-center justify-center rounded-full text-apple-gray-400 hover:text-apple-gray-700 dark:hover:text-apple-gray-200 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <span className="text-base sm:text-lg font-semibold text-apple-gray-800 dark:text-white">{monthLabel}</span>
            {!isCurrentMonthVisible && (
              <button type="button" onClick={goToday} className="text-2xs font-semibold text-brand-green hover:underline">
                {t('calendario.hoy')}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={goNextMonth}
            aria-label={t('coachCalendar.mesSiguiente')}
            className="w-9 h-9 flex items-center justify-center rounded-full text-apple-gray-400 hover:text-apple-gray-700 dark:hover:text-apple-gray-200 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {dayLabels.map((label, i) => (
            <div key={i} className="text-center text-xs font-semibold text-apple-gray-400 uppercase py-1.5">
              {label}
            </div>
          ))}
          {grid.flat().map(cell => {
          const isToday = cell.date === todayKey
          const isSelected = cell.date === selectedDate
          const day = eventsByDate.get(cell.date)
          const hasFixture = !!day && day.fixtures.length > 0
          const hasSession = !!day && day.sessions.length > 0
          const isAbroad = !!day && day.isAbroad

          return (
            <button
              key={cell.date}
              type="button"
              onClick={() => handleCellClick(cell)}
              className={`flex flex-col items-center justify-center gap-1 sm:gap-1.5 aspect-square rounded-apple-lg text-sm sm:text-base lg:text-lg transition-colors duration-150 ease-apple ${
                !cell.isCurrentMonth
                  ? 'text-apple-gray-300 dark:text-apple-gray-600'
                  : isSelected
                    ? 'bg-brand-green text-apple-gray-900 font-bold'
                    : isToday
                      ? 'bg-brand-green/10 text-brand-green font-bold'
                      : hasFixture
                        ? 'bg-apple-gray-50 dark:bg-apple-gray-800/50 text-apple-gray-800 dark:text-white font-semibold hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800'
                        : 'text-apple-gray-700 dark:text-apple-gray-300 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800'
              }`}
            >
              <span>{cell.dayNumber}</span>
              {cell.isCurrentMonth && (hasFixture || hasSession) && (
                <span className="flex items-center gap-0.5">
                  {hasFixture && day!.fixtures.length === 1 && (
                    isAbroad ? (
                      <PlaneIcon className={`w-6 h-6 sm:w-8 sm:h-8 ${isSelected ? 'text-apple-gray-900' : 'text-brand-green'}`} />
                    ) : (
                      <img
                        src={(day!.fixtures[0].isHome ? day!.fixtures[0].awayTeam : day!.fixtures[0].homeTeam).logo}
                        alt=""
                        className="w-7 h-7 sm:w-9 sm:h-9 lg:w-11 lg:h-11 object-contain drop-shadow-sm"
                      />
                    )
                  )}
                  {hasFixture && day!.fixtures.length > 1 && (
                    <span className={`w-2.5 h-2.5 rounded-full ${isSelected ? 'bg-apple-gray-900' : 'bg-brand-green'}`} />
                  )}
                  {hasSession && (
                    <span className={`w-2.5 h-2.5 rounded-full ${isSelected ? 'bg-apple-gray-900/60' : 'bg-apple-gray-400'}`} />
                  )}
                </span>
              )}
            </button>
          )
        })}
        </div>
      </div>

      {/* Columna de detalle: en desktop usa el ancho que le sobra a la grilla acotada de al
          lado -- partidos como tarjetas mas grandes en vez de las mismas pill chiquitas
          estiradas sobre un contenedor ancho y vacio. */}
      <div className="mt-4 lg:mt-0 lg:flex-1 lg:min-w-0">
        <div className="rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 bg-white dark:bg-apple-gray-800/60 px-4 py-3 lg:p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-2xs font-semibold text-apple-gray-400 uppercase tracking-wide">
              {selectedDateLabel}
            </p>
            {selectedDay.isAbroad && (
              <span
                className="inline-flex items-center gap-1 text-2xs font-medium text-apple-gray-400"
                title={t('coachCalendar.viajeExterior')}
              >
                <PlaneIcon className="w-3.5 h-3.5" />
                {t('coachCalendar.viajeExterior')}
              </span>
            )}
          </div>
          {selectedDay.fixtures.length === 0 && selectedDay.sessions.length === 0 ? (
            <p className="text-sm text-apple-gray-300 dark:text-apple-gray-600">{t('coachCalendar.sinActividad')}</p>
          ) : (
            <div className="space-y-2 lg:space-y-3">
              {selectedDay.fixtures.map(f => {
                const opponent = f.isHome ? f.awayTeam : f.homeTeam
                const finished = isMatchFinished(f.statusShort)
                const scoreLabel =
                  finished && f.goalsHome !== null && f.goalsAway !== null ? `${f.goalsHome}-${f.goalsAway}` : null
                const card = (
                  <div className="flex items-center gap-3 w-full bg-apple-gray-50 dark:bg-apple-gray-900/40 rounded-apple-lg px-3 py-2.5 lg:px-4 lg:py-3 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-900/70 transition-colors">
                    <img src={opponent.logo} alt="" className="w-8 h-8 lg:w-10 lg:h-10 object-contain flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-apple-gray-800 dark:text-white truncate">
                        {f.isHome ? 'vs' : '@'} {opponent.name}
                      </p>
                      <p className="text-2xs text-apple-gray-400 truncate flex items-center gap-1">
                        <img src={f.leagueLogo} alt="" className="w-3 h-3 object-contain flex-shrink-0" />
                        {f.leagueName}
                        {f.round && ` · ${f.round}`}
                      </p>
                    </div>
                    {scoreLabel ? (
                      <span className="text-base font-bold text-apple-gray-800 dark:text-white flex-shrink-0">{scoreLabel}</span>
                    ) : (
                      <span className="text-2xs font-medium text-brand-green flex-shrink-0">
                        {new Date(f.date).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                )
                return finished ? (
                  <Link key={f.fixtureId} to={`/entrenadores/${coach.key}/partido/${f.fixtureId}`} className="block">
                    {card}
                  </Link>
                ) : (
                  <div key={f.fixtureId}>{card}</div>
                )
              })}
              {selectedDay.sessions.map(s => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 w-full bg-apple-gray-50 dark:bg-apple-gray-900/40 rounded-apple-lg px-3 py-2.5 lg:px-4 lg:py-3"
                >
                  <span className="w-8 h-8 lg:w-10 lg:h-10 flex-shrink-0 rounded-full bg-apple-gray-200 dark:bg-apple-gray-700 flex items-center justify-center text-apple-gray-500 dark:text-apple-gray-300">
                    <BoltIcon className="w-4 h-4" />
                  </span>
                  <p className="text-sm font-medium text-apple-gray-700 dark:text-apple-gray-300 truncate">{s.title}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
