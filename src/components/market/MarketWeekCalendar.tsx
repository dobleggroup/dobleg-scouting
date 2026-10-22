import { useState } from 'react'
import { useLanguage } from '@/context/LanguageContext'
import { LANGUAGE_LOCALES } from '@/constants/translations'

export interface CalendarEntry {
  kind: 'negotiation' | 'need'
  id: number
  date: string
  title: string
  subtitle: string
  assignee: string | null
}

/**
 * Semana de lunes a domingo, navegable, con las entradas de "volver a
 * hablar" de esa semana agrupadas por día. Es el mismo calendario en las dos
 * pestañas (Negociaciones y Búsquedas): muestra todo, y cada entrada dice si
 * es un jugador o una búsqueda de club.
 *
 * Las fechas se arman con componentes locales (no `new Date(iso)` / getters
 * UTC), mismo motivo documentado en `marketAlerts.ts`: comparar contra un
 * string 'YYYY-MM-DD' vía UTC corre el calendario un día en Argentina.
 */
function toLocalISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function startOfWeekMonday(d: Date): Date {
  const day = d.getDay() // 0=domingo..6=sábado
  const diff = day === 0 ? -6 : 1 - day
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff)
}

export default function MarketWeekCalendar({
  entries,
  weekOffset,
  onWeekOffsetChange,
  onSelect,
}: {
  entries: CalendarEntry[]
  weekOffset: number
  onWeekOffsetChange: (offset: number) => void
  onSelect: (kind: CalendarEntry['kind'], id: number) => void
}) {
  const { t, language } = useLanguage()
  const locale = LANGUAGE_LOCALES[language]
  const [today] = useState(() => new Date())
  const todayISO = toLocalISODate(today)

  const monday = startOfWeekMonday(new Date(today.getFullYear(), today.getMonth(), today.getDate() + weekOffset * 7))
  const days = Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i))

  const entriesByDate = new Map<string, CalendarEntry[]>()
  for (const entry of entries) {
    const list = entriesByDate.get(entry.date) ?? []
    list.push(entry)
    entriesByDate.set(entry.date, list)
  }

  const rangeLabel = `${days[0].toLocaleDateString(locale, { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString(locale, { day: 'numeric', month: 'short' })}`
  const hasAnyEntry = entries.some(e => days.some(d => toLocalISODate(d) === e.date))

  return (
    <div className="mt-6 rounded-2xl border border-apple-gray-200 dark:border-apple-gray-700 p-3 sm:p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onWeekOffsetChange(weekOffset - 1)}
            aria-label={t('mercado.semanaAnterior')}
            className="p-1.5 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700/60 hover:text-apple-gray-700 dark:hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button
            onClick={() => onWeekOffsetChange(weekOffset + 1)}
            aria-label={t('mercado.semanaSiguiente')}
            className="p-1.5 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700/60 hover:text-apple-gray-700 dark:hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
          <span className="text-sm font-semibold text-apple-gray-700 dark:text-white ml-1 capitalize">{rangeLabel}</span>
        </div>
        {weekOffset !== 0 && (
          <button
            onClick={() => onWeekOffsetChange(0)}
            className="text-xs font-medium text-brand-green hover:text-emerald-600"
          >
            {t('mercado.hoy')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
        {days.map(day => {
          const iso = toLocalISODate(day)
          const isToday = iso === todayISO
          const isPast = iso < todayISO
          const dayEntries = entriesByDate.get(iso) ?? []
          return (
            <div
              key={iso}
              className={`rounded-xl p-2.5 min-h-[8rem] lg:min-h-[13rem] ${isToday ? 'bg-brand-green/10 ring-1 ring-brand-green/40' : 'bg-apple-gray-50 dark:bg-apple-gray-800/50'}`}
            >
              <p className={`text-xs font-semibold uppercase tracking-wide mb-2 flex items-baseline gap-1.5 ${isToday ? 'text-brand-green' : 'text-apple-gray-400'}`}>
                <span>{day.toLocaleDateString(locale, { weekday: 'short' })}</span>
                <span className={`text-base font-bold tabular-nums ${isToday ? 'text-brand-green' : 'text-apple-gray-600 dark:text-apple-gray-300'}`}>{day.getDate()}</span>
              </p>
              <div className="space-y-1.5">
                {dayEntries.map(entry => (
                  <button
                    key={`${entry.kind}-${entry.id}`}
                    onClick={() => onSelect(entry.kind, entry.id)}
                    className="w-full flex items-start gap-2 px-2 py-2 rounded-lg bg-white dark:bg-apple-gray-700/60 shadow-sm hover:shadow hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 text-left transition-all"
                  >
                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${isPast ? 'bg-red-500' : isToday ? 'bg-brand-green' : 'bg-amber-500'}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-apple-gray-800 dark:text-apple-gray-100 leading-snug break-words">{entry.title}</span>
                      {entry.subtitle && <span className="block text-2xs text-apple-gray-500 dark:text-apple-gray-400 leading-snug break-words">{entry.subtitle}</span>}
                      <span className="mt-1 flex items-center gap-1 text-2xs text-apple-gray-400">
                        <span className={`px-1 rounded ${entry.kind === 'need' ? 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-300' : 'bg-sky-50 text-sky-600 dark:bg-sky-900/20 dark:text-sky-300'}`}>
                          {t(entry.kind === 'need' ? 'mercado.calendarioBusqueda' : 'mercado.calendarioNegociacion')}
                        </span>
                        {entry.assignee && <span className="truncate">{entry.assignee}</span>}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      {!hasAnyEntry && (
        <p className="text-xs text-apple-gray-400 text-center mt-3">{t('mercado.sinFechasSemana')}</p>
      )}
    </div>
  )
}
