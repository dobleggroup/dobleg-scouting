import { useEffect, useMemo, useState } from 'react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { addDays, todayAR } from '@/services/scoutsPanelService'
import {
  addMonths,
  fetchScoutCalendar,
  groupByDay,
  KIND_META,
  longDay,
  monthGrid,
  monthLabel,
  monthStart,
  WEEKDAY_HEAD,
  weekDays,
  weekdayShort,
  weekLabel,
  type CalendarDay,
  type CalendarEvent,
  type CalendarItem,
} from '@/features/scouts/calendar'

export type CalendarView = 'semana' | 'mes'

// Lo que ya se trajo, por scout y rango, para que ir y volver de semana o mes sea instantáneo.
const cache = new Map<string, CalendarEvent[]>()

function Arrow({ dir, onClick, label }: { dir: 'left' | 'right'; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="w-9 h-9 flex items-center justify-center rounded-xl border border-apple-gray-200 dark:border-apple-gray-600 text-apple-gray-600 dark:text-apple-gray-300 hover:border-brand-green hover:text-brand-green transition-colors"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d={dir === 'left' ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'} />
      </svg>
    </button>
  )
}

function EnteredMark({ entered }: { entered: boolean }) {
  return entered ? (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
      <span className="w-2 h-2 rounded-full bg-brand-green" />Entró
    </span>
  ) : (
    <span className="text-xs text-apple-gray-400 dark:text-apple-gray-500">No entró</span>
  )
}

/** Una actividad: qué es (con su color) y la frase de lo que hizo. */
function ItemRow({ it }: { it: CalendarItem }) {
  const m = KIND_META[it.kind]
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 py-2">
      <span className={`self-start sm:mt-0.5 sm:w-32 flex-shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-medium ${m.soft} ${m.text}`}>
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${m.dot}`} />
        <span className="truncate">{it.tag}</span>
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-base font-medium text-apple-gray-900 dark:text-white leading-snug">
          {it.title}
          {it.badge && <span className="ml-2 align-middle px-2 py-0.5 rounded-md text-xs font-medium bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-700 dark:text-apple-gray-200">{it.badge}</span>}
          {it.pending && <span className="ml-2 align-middle px-2 py-0.5 rounded-md text-xs font-medium bg-amber-500/15 text-amber-800 dark:text-amber-300">Falta aceptar</span>}
        </div>
        {it.detail && <div className="text-sm text-apple-gray-600 dark:text-apple-gray-300 leading-snug break-words line-clamp-3 sm:line-clamp-2">{it.detail}</div>}
      </div>
    </div>
  )
}

function DayItems({ day }: { day: CalendarDay | undefined }) {
  if (!day?.items.length) return <p className="py-2 text-sm text-apple-gray-400 dark:text-apple-gray-500">Sin actividad cargada</p>
  return <div className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700/60">{day.items.map((it, i) => <ItemRow key={i} it={it} />)}</div>
}

/** La semana como agenda: un renglón por día, con todo lo que hizo escrito. */
function WeekView({ days, byDay, today }: { days: string[]; byDay: Map<string, CalendarDay>; today: string }) {
  return (
    <div className="rounded-xl border border-apple-gray-100 dark:border-apple-gray-700 divide-y divide-apple-gray-100 dark:divide-apple-gray-700 overflow-hidden">
      {days.map(d => {
        const day = byDay.get(d)
        const isToday = d === today
        const future = d > today
        return (
          <div key={d} className={`flex flex-col sm:flex-row gap-1 sm:gap-4 px-4 py-2.5 ${isToday ? 'bg-brand-green/[0.07]' : ''} ${future ? 'opacity-50' : ''}`}>
            <div className="sm:w-28 flex-shrink-0 flex sm:flex-col items-baseline sm:items-start gap-2 sm:gap-0.5 pt-2">
              <div className={`flex items-baseline gap-1.5 ${isToday ? 'text-brand-green' : 'text-apple-gray-800 dark:text-apple-gray-100'}`}>
                <span className="text-sm font-semibold uppercase">{weekdayShort(d)}</span>
                <span className="text-xl font-bold tabular-nums">{Number(d.slice(8))}</span>
                {isToday && <span className="text-xs font-semibold">Hoy</span>}
              </div>
              {!future && <EnteredMark entered={!!day?.entered} />}
            </div>
            <div className="min-w-0 flex-1">
              {future ? <p className="py-2 text-sm text-apple-gray-400">—</p> : <DayItems day={day} />}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MonthView({ anchor, byDay, today, selected, onSelect }: {
  anchor: string
  byDay: Map<string, CalendarDay>
  today: string
  selected: string | null
  onSelect: (d: string) => void
}) {
  const month = anchor.slice(0, 7)
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1.5">
        {WEEKDAY_HEAD.map(h => <div key={h} className="text-center text-xs font-semibold uppercase tracking-wide text-apple-gray-500 dark:text-apple-gray-400">{h}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {monthGrid(anchor).flat().map(d => {
          const inMonth = d.slice(0, 7) === month
          const day = byDay.get(d)
          const items = day?.items ?? []
          const isToday = d === today
          const isSel = d === selected
          const future = d > today
          return (
            <button
              key={d}
              type="button"
              onClick={() => onSelect(d)}
              className={`flex flex-col justify-start text-left rounded-lg sm:rounded-xl p-1.5 sm:p-2 min-h-[3.5rem] sm:min-h-[4.5rem] lg:min-h-[6.5rem] transition-all ${
                !inMonth ? 'opacity-35' : ''
              } ${isSel ? 'ring-2 ring-brand-green' : isToday ? 'ring-1 ring-brand-green/50' : ''} ${
                isToday ? 'bg-brand-green/10' : 'bg-apple-gray-50 dark:bg-apple-gray-900/50 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-sm sm:text-base font-bold tabular-nums ${isToday ? 'text-brand-green' : 'text-apple-gray-800 dark:text-apple-gray-100'}`}>{Number(d.slice(8))}</span>
                {!future && day?.entered && <span title="Entró" className="w-2 h-2 rounded-full bg-brand-green" />}
              </div>
              {/* En celular y tablet, solo puntitos de colores; tocando el día se ve el detalle. */}
              <div className="flex flex-wrap gap-0.5 mt-1 sm:mt-2 lg:hidden">
                {items.slice(0, 6).map((it, i) => <span key={i} className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${KIND_META[it.kind].dot}`} />)}
              </div>
              <div className="hidden lg:block mt-1 space-y-0.5">
                {items.slice(0, 3).map((it, i) => (
                  <div key={i} className={`flex items-center gap-1 min-w-0 px-1.5 py-0.5 rounded-md ${KIND_META[it.kind].soft} border`}>
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${KIND_META[it.kind].dot}`} />
                    <span className="text-xs text-apple-gray-800 dark:text-apple-gray-100 truncate">{it.short}</span>
                  </div>
                ))}
                {items.length > 3 && <div className="text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400 pl-1.5">+{items.length - 3} más</div>}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function ScoutCalendar({ scoutId, view, onView, anchor, onAnchor }: {
  scoutId: string
  view: CalendarView
  onView: (v: CalendarView) => void
  /** Un día dentro de la semana / el mes que se está viendo (YYYY-MM-DD). */
  anchor: string
  onAnchor: (d: string) => void
}) {
  const today = todayAR()
  const [events, setEvents] = useState<CalendarEvent[] | null>(null)
  const [error, setError] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  const days = useMemo(() => (view === 'semana' ? weekDays(anchor) : monthGrid(anchor).flat()), [view, anchor])
  const from = days[0]
  const to = days[days.length - 1]

  useEffect(() => {
    const key = `${scoutId}|${from}|${to}`
    const hit = cache.get(key)
    if (hit) { setEvents(hit); setError(false); return }
    let alive = true
    setEvents(null)
    setError(false)
    fetchScoutCalendar(from, to, scoutId)
      .then(ev => { cache.set(key, ev); if (alive) setEvents(ev) })
      .catch(() => { if (alive) { setError(true); setEvents([]) } })
    return () => { alive = false }
  }, [scoutId, from, to])

  // Al cambiar de mes, se deselecciona el día si quedó afuera.
  useEffect(() => { if (selected && (selected < from || selected > to)) setSelected(null) }, [from, to, selected])

  const byDay = useMemo(() => groupByDay(events ?? []), [events])

  const move = (n: number) => onAnchor(view === 'semana' ? addDays(anchor, n * 7) : addMonths(monthStart(anchor), n))
  const atToday = view === 'semana' ? weekDays(today).includes(anchor) : monthStart(today) === monthStart(anchor)
  const selDay = selected ? byDay.get(selected) : undefined

  const viewBtn = (v: CalendarView, label: string) => (
    <button
      type="button"
      onClick={() => { onView(v); setSelected(null) }}
      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
        view === v ? 'bg-white dark:bg-apple-gray-700 text-apple-gray-900 dark:text-white shadow-sm' : 'text-apple-gray-600 dark:text-apple-gray-300 hover:text-apple-gray-900 dark:hover:text-white'
      }`}
    >
      {label}
    </button>
  )

  return (
    <section className="bg-white dark:bg-apple-gray-800 rounded-2xl border border-apple-gray-100 dark:border-apple-gray-700 shadow-sm p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-apple-gray-900 dark:text-white mr-1">Calendario</h3>
          <div className="inline-flex p-1 rounded-xl bg-apple-gray-100 dark:bg-apple-gray-900/60">
            {viewBtn('semana', 'Semana')}
            {viewBtn('mes', 'Mes')}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Arrow dir="left" onClick={() => move(-1)} label={view === 'semana' ? 'Semana anterior' : 'Mes anterior'} />
          <span className="flex-1 sm:flex-none sm:min-w-[13rem] text-center text-sm sm:text-base font-semibold text-apple-gray-900 dark:text-white leading-tight">
            {view === 'semana' ? weekLabel(anchor) : monthLabel(anchor)}
          </span>
          <Arrow dir="right" onClick={() => move(1)} label={view === 'semana' ? 'Semana siguiente' : 'Mes siguiente'} />
          {!atToday && (
            <button type="button" onClick={() => onAnchor(today)} className="ml-1 px-3 py-1.5 rounded-xl text-sm font-medium text-brand-green hover:bg-brand-green/10">
              Hoy
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-700 dark:text-red-400 bg-red-500/10 px-4 py-3 rounded-xl mb-3">No se pudo cargar el calendario. Probá de nuevo en un rato.</p>}

      <div className="relative">
        {events === null && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 dark:bg-apple-gray-800/60 rounded-xl">
            <LoadingSpinner />
          </div>
        )}
        {view === 'semana'
          ? <WeekView days={days} byDay={byDay} today={today} />
          : <MonthView anchor={anchor} byDay={byDay} today={today} selected={selected} onSelect={d => setSelected(d === selected ? null : d)} />}
      </div>

      {view === 'mes' && selected && (
        <div className="mt-4 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 px-4 py-3">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h4 className="text-base font-semibold text-apple-gray-900 dark:text-white">{longDay(selected)}</h4>
            <div className="flex items-center gap-3">
              {selected <= today && <EnteredMark entered={!!selDay?.entered} />}
              <button type="button" onClick={() => setSelected(null)} aria-label="Cerrar" className="p-1 rounded-lg text-apple-gray-400 hover:text-apple-gray-700 dark:hover:text-white">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
          <DayItems day={selDay} />
        </div>
      )}
    </section>
  )
}
