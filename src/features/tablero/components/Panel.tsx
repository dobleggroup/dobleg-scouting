import { useState, type ReactNode } from 'react'

/**
 * Tarjeta de un panel del Tablero. Todos llevan abajo "¿De dónde sale este
 * dato?": cada gráfico dice en palabras qué partidos tomó y cómo hizo la
 * cuenta, para que nadie tenga que confiar en un número a ciegas.
 */
export default function Panel({ id, title, subtitle, actions, source, children, className = '' }: {
  id?: string
  title: string
  subtitle?: string
  actions?: ReactNode
  source?: ReactNode
  children: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <section id={id} className={`bg-white dark:bg-apple-gray-800 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 p-5 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-apple-gray-800 dark:text-white">{title}</h2>
          {subtitle && <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
      {source && (
        <div className="mt-4 pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700/50">
          <button
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            className="inline-flex items-center gap-1.5 text-2xs font-medium text-apple-gray-400 dark:text-apple-gray-500 hover:text-apple-gray-600 dark:hover:text-apple-gray-300 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            ¿De dónde sale este dato?
            <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {open && (
            <div className="mt-2 text-xs leading-relaxed text-apple-gray-500 dark:text-apple-gray-400 bg-apple-gray-50 dark:bg-apple-gray-700/30 rounded-apple p-3 animate-fade-in">
              {source}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

/** Selector segmentado con el mismo look que los filtros de período del Inicio. */
export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T
  options: { id: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 bg-apple-gray-100 dark:bg-apple-gray-700/50 p-1 rounded-apple w-fit">
      {options.map(o => (
        <button
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`px-3 py-1.5 rounded-lg text-2xs font-medium transition-all whitespace-nowrap ${
            value === o.id
              ? 'bg-white dark:bg-apple-gray-800 text-apple-gray-800 dark:text-white shadow-apple dark:shadow-apple-dark'
              : 'text-apple-gray-500 dark:text-apple-gray-400 hover:text-apple-gray-700 dark:hover:text-apple-gray-200'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function PanelSkeleton({ height = 'h-48' }: { height?: string }) {
  return <div className={`${height} animate-pulse bg-apple-gray-100 dark:bg-apple-gray-700/40 rounded-apple`} />
}

/** Color del rating de un partido: mismo criterio en la tira de forma y el calendario. */
export function ratingTone(r: number | null): string {
  if (r == null) return 'bg-apple-gray-100 text-apple-gray-400 dark:bg-apple-gray-700/50 dark:text-apple-gray-500'
  if (r >= 7.5) return 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950'
  if (r >= 7) return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/25 dark:text-emerald-300'
  if (r >= 6.5) return 'bg-apple-gray-100 text-apple-gray-700 dark:bg-apple-gray-700 dark:text-apple-gray-200'
  if (r >= 6) return 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
  return 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300'
}

export const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', timeZone: 'America/Argentina/Buenos_Aires' })
    .format(new Date(iso)).replace('.', '')

export const fmtRating = (r: number | null) => (r == null ? '–' : r.toFixed(1))
