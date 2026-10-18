import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { getScoreBgClass, getScoreColorClass } from '@/components/ui/ScoreBar'
import type { OptaPlayer, OptaTeam } from '../data'
import { POS_SHORT } from '../metrics'

export function Card({ title, subtitle, action, children, className = '' }: {
  title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string
}) {
  return (
    <section className={`card-apple p-4 sm:p-5 ${className}`}>
      {(title || action) && (
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 mb-3">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold text-apple-gray-800 dark:text-white">{title}</h2>}
            {subtitle && <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Tile({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="card-apple px-4 py-3">
      <div className="text-2xs uppercase tracking-wide text-apple-gray-400">{label}</div>
      <div className="text-2xl font-bold text-apple-gray-800 dark:text-white tabular-nums mt-0.5">{value}</div>
      {hint && <div className="text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">{hint}</div>}
    </div>
  )
}

/** Escudo simple con los colores de la camiseta de Opta (no hay logos en el feed). */
export function TeamDot({ team, size = 14 }: { team: Pick<OptaTeam, 'kit' | 'kit2'> | null | undefined; size?: number }) {
  const a = team?.kit ?? '#9ca3af', b = team?.kit2 ?? a
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/15"
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${a} 0 50%, ${b} 50% 100%)` }}
    />
  )
}

export function TeamName({ team, short = true, className = '' }: { team: OptaTeam | null | undefined; short?: boolean; className?: string }) {
  if (!team) return <span className={className}>—</span>
  return (
    <span className={`inline-flex items-center gap-1.5 min-w-0 ${className}`}>
      <TeamDot team={team} />
      <span className="truncate">{short ? team.short : team.name}</span>
    </span>
  )
}

export function DgBadge({ className = '' }: { className?: string }) {
  return (
    <span title="Jugador de Doble G" className={`inline-flex items-center px-1.5 py-px rounded text-[10px] font-bold tracking-wide bg-brand-green/15 text-brand-green ${className}`}>
      DG
    </span>
  )
}

export function PlayerLink({ player, dg, className = '' }: { player: OptaPlayer; dg?: boolean; className?: string }) {
  return (
    <Link to={`/opta/jugador/${player.id}`} className={`inline-flex items-center gap-1.5 min-w-0 font-medium text-apple-gray-800 dark:text-white hover:text-brand-green ${className}`}>
      <span className="truncate">{player.name}</span>
      {dg && <DgBadge />}
    </Link>
  )
}

export function RoleChip({ player }: { player: OptaPlayer }) {
  return <span className="text-2xs font-semibold px-1.5 py-px rounded bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300">{POS_SHORT[player.pos]}</span>
}

/**
 * Color por percentil con los mismos cortes y colores que el score del resto de
 * la app (80 / 55 / 35 / 20). Siempre va acompañado del número.
 */
export function pctTone(p: number | null): { bar: string; text: string; bg: string } {
  if (p === null) return { bar: 'bg-apple-gray-200 dark:bg-apple-gray-700', text: 'text-apple-gray-400', bg: getScoreBgClass(null) }
  const bar = p >= 80 ? 'bg-emerald-400' : p >= 55 ? 'bg-emerald-500' : p >= 35 ? 'bg-amber-500' : p >= 20 ? 'bg-orange-500' : 'bg-red-500'
  return { bar, text: getScoreColorClass(p), bg: getScoreBgClass(p) }
}

/** Percentil como badge, igual que el score de Scout Externo. */
export function PctPill({ pct, size = 'sm' }: { pct: number | null; size?: 'sm' | 'md' }) {
  const tone = pctTone(pct)
  return (
    <span className={`inline-flex items-center justify-center rounded-lg font-bold tabular-nums ${tone.text} ${tone.bg} ${size === 'md' ? 'min-w-[2.75rem] px-2.5 py-1 text-sm' : 'min-w-[2.1rem] px-1.5 py-0.5 text-xs'}`}>
      {pct ?? '—'}
    </span>
  )
}

export function Loading({ label = 'Cargando datos de Opta…' }: { label?: string }) {
  return (
    <div className="space-y-3" aria-busy>
      <div className="text-sm text-apple-gray-400">{label}</div>
      <div className="h-24 rounded-apple-lg bg-apple-gray-100 dark:bg-apple-gray-700/40 animate-pulse" />
      <div className="h-64 rounded-apple-lg bg-apple-gray-100 dark:bg-apple-gray-700/40 animate-pulse" />
    </div>
  )
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="px-4 py-3 rounded-apple-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300">
      {message}
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange, size = 'md' }: {
  value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; size?: 'sm' | 'md'
}) {
  return (
    <div className="inline-flex p-0.5 rounded-apple bg-apple-gray-100 dark:bg-apple-gray-700/60 max-w-full overflow-x-auto">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`whitespace-nowrap rounded-[7px] font-medium transition-colors ${size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'} ${
            value === o.value
              ? 'bg-white dark:bg-apple-gray-600 text-apple-gray-800 dark:text-white shadow-sm'
              : 'text-apple-gray-500 dark:text-apple-gray-400 hover:text-apple-gray-700 dark:hover:text-apple-gray-200'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—'
  const [y, m, day] = d.slice(0, 10).split('-')
  return `${day}/${m}/${y.slice(2)}`
}
