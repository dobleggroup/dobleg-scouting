import { useState } from 'react'
import type { PulseKpi, PulseFigures } from '../tableroData'

interface Tile {
  key: keyof PulseFigures
  label: string
  format: (v: number) => string
  decimals: number
}

const TILES: Tile[] = [
  { key: 'players', label: 'Jugadores que sumaron minutos', format: v => String(v), decimals: 0 },
  { key: 'minutes', label: 'Minutos jugados', format: v => v.toLocaleString('es-AR'), decimals: 0 },
  { key: 'goalContributions', label: 'Goles + asistencias', format: v => String(v), decimals: 0 },
  { key: 'avgRating', label: 'Rating promedio', format: v => v.toFixed(2), decimals: 2 },
]

function weekLabel(index: number, total: number): string {
  const ago = total - 1 - index
  if (ago === 0) return 'Últimos 7 días'
  if (ago === 1) return 'Semana anterior'
  return `Hace ${ago} semanas`
}

function TrendBars({ values, format, label }: { values: (number | null)[]; format: (v: number) => string; label: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const nums = values.map(v => v ?? 0)
  const max = Math.max(...nums, 0)
  const min = label === 'Rating promedio' ? Math.min(...values.filter((v): v is number => v != null), max) - 0.3 : 0
  const range = max - min || 1
  return (
    <div className="relative mt-3">
      <div className="flex items-end gap-[2px] h-9" onMouseLeave={() => setHover(null)}>
        {values.map((v, i) => {
          const h = v == null || v <= 0 ? 0 : Math.max(8, ((v - min) / range) * 100)
          const isLast = i === values.length - 1
          return (
            <button
              key={i}
              type="button"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${weekLabel(i, values.length)}: ${v == null ? 'sin datos' : format(v)}`}
              className="flex-1 h-full flex items-end"
            >
              <span
                className={`block w-full rounded-t-[3px] transition-colors ${
                  h === 0 ? 'h-[2px] bg-apple-gray-200 dark:bg-apple-gray-700'
                    : isLast ? 'bg-brand-green'
                    : hover === i ? 'bg-brand-green/60' : 'bg-apple-gray-200 dark:bg-apple-gray-600'
                }`}
                style={h ? { height: `${h}%` } : undefined}
              />
            </button>
          )
        })}
      </div>
      {hover != null && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded-md bg-apple-gray-900 dark:bg-white text-white dark:text-apple-gray-900 text-2xs font-medium whitespace-nowrap shadow-apple-md pointer-events-none z-10">
          {weekLabel(hover, values.length)}: {values[hover] == null ? 'sin datos' : format(values[hover]!)}
        </div>
      )}
    </div>
  )
}

export default function PulseStrip({ pulse }: { pulse: PulseKpi }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {TILES.map(t => {
        const cur = pulse.current[t.key]
        const prev = pulse.previous[t.key]
        const delta = cur != null && prev != null ? cur - prev : null
        const flat = delta == null || Math.abs(delta) < (t.decimals ? 0.005 : 0.5)
        return (
          <div key={t.key} className="bg-white dark:bg-apple-gray-800 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 p-4">
            <p className="text-2xs font-medium uppercase tracking-wide text-apple-gray-400 dark:text-apple-gray-500 leading-snug min-h-[28px]">{t.label}</p>
            <p className="text-2xl font-bold text-apple-gray-900 dark:text-white tabular-nums mt-1">
              {cur == null ? '–' : t.format(cur)}
            </p>
            <p className={`text-2xs font-semibold mt-0.5 tabular-nums ${
              flat ? 'text-apple-gray-400 dark:text-apple-gray-500'
                : delta! > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {delta == null ? 'sin datos la semana anterior'
                : flat ? '= igual que la semana anterior'
                : `${delta > 0 ? '▲' : '▼'} ${t.format(Math.abs(delta))} vs. semana anterior`}
            </p>
            <TrendBars values={pulse.weekly.map(w => w[t.key])} format={t.format} label={t.label} />
          </div>
        )
      })}
    </div>
  )
}
