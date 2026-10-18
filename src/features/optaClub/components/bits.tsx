import type { ReactNode } from 'react'
import { PlayerPhoto } from '@/components/ui/PlayerPhoto'

export function SurgidoBadge({ className = '' }: { className?: string }) {
  return (
    <span title="Surgido del club: debutó en Primera en Temperley" className={`inline-flex items-center px-1.5 py-px rounded text-[10px] font-bold tracking-wide bg-brand-green/15 text-brand-green whitespace-nowrap ${className}`}>
      Del club
    </span>
  )
}

export function StatTile({ label, value, detail, accent }: { label: string; value: ReactNode; detail?: ReactNode; accent?: boolean }) {
  return (
    <div className="bg-white dark:bg-apple-gray-800 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 px-4 py-3 min-w-0">
      <div className="text-2xs font-semibold uppercase tracking-wide text-apple-gray-400">{label}</div>
      <div className={`text-2xl font-bold tabular-nums mt-0.5 truncate ${accent ? 'text-brand-green' : 'text-apple-gray-800 dark:text-white'}`}>{value}</div>
      {detail && <div className="text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">{detail}</div>}
    </div>
  )
}

export function Face({ src, name, size = 'sm' }: { src?: string | null; name: string; size?: 'xs' | 'sm' | 'md' | 'lg' }) {
  return <PlayerPhoto src={src} name={name} size={size} />
}

/** Barra horizontal simple: el largo es la proporción sobre `max`. */
export function HBar({ value, max, accent, className = '' }: { value: number; max: number; accent?: boolean; className?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div className={`h-2.5 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700/60 overflow-hidden ${className}`}>
      <div
        className={`h-full rounded-full ${accent ? 'bg-brand-green' : 'bg-apple-gray-400 dark:bg-apple-gray-500'}`}
        style={{ width: `${pct}%`, minWidth: value > 0 ? 4 : 0 }}
      />
    </div>
  )
}

export function LegendDot({ accent, label }: { accent?: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2.5 h-2.5 rounded-full ${accent ? 'bg-brand-green' : 'bg-apple-gray-400 dark:bg-apple-gray-500'}`} />
      {label}
    </span>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="text-xs text-apple-gray-400 dark:text-apple-gray-500 leading-relaxed">{children}</p>
}

export const fmtInt = (n: number) => n.toLocaleString('es-AR')

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export const longDate = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${d} de ${MONTHS[m - 1]} de ${y}`
}
export const monthYear = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const [y, m] = iso.slice(0, 10).split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}
