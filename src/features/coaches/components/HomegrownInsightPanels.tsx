// src/features/coaches/components/HomegrownInsightPanels.tsx
// Paneles desplegables de "Jugadores surgidos del club": minutos de los chicos, quién jugó
// cada partido y edad de los titulares. Mismo lenguaje visual que la tarjeta (superficies
// apple-gray, verde de marca, líneas de tendencia punteadas en gris neutro).
import { useState, type ReactNode } from 'react'
import { Area, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { HomegrownMatchUsage, HomegrownPlayerTotals } from '@/features/coaches/homegrown/homegrownMatchUsage'

const AXIS_TICK = { fontSize: 9, fill: '#9CA3AF' }

/** "#15803D" + 0.4 -> "rgba(21,128,61,0.4)": la intensidad como transparencia del verde, así
 *  la celda se ve bien sobre fondo claro y oscuro. */
function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.replace('#', ''), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha.toFixed(2)})`
}

export interface TrendColors { accent: string; trend: string; surface: string }

/** Bloque desplegable: título + resumen en una línea; el contenido se monta solo al abrir. */
export function Collapsible({ title, summary, children }: { title: string; summary?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-apple-lg border border-apple-gray-200/70 dark:border-apple-gray-700/50 overflow-hidden bg-white dark:bg-apple-gray-800">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-green/40 transition-colors"
      >
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-apple-gray-800 dark:text-white">{title}</span>
          {summary && <span className="block text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-0.5 truncate">{summary}</span>}
        </span>
        <svg className={`w-4 h-4 flex-shrink-0 text-apple-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {open && <div className="px-4 pb-4 pt-1 animate-fade-in">{children}</div>}
    </div>
  )
}

/** "↗ En aumento: de 3,0 a 4,6 por partido". `goodWhenUp` decide si subir es buena noticia. */
export function TrendChip({ start, end, format, unit, goodWhenUp = true, threshold }: {
  start: number; end: number; format: (v: number) => string; unit: string; goodWhenUp?: boolean; threshold: number
}) {
  const delta = end - start
  const flat = Math.abs(delta) < threshold
  const up = delta > 0
  const good = flat ? null : up === goodWhenUp
  const label = flat ? 'Estable' : up ? 'En aumento' : 'En baja'
  const arrow = flat ? '→' : up ? '↗' : '↘'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
      good === true ? 'bg-brand-green/10 text-brand-green' : good === false ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300'
    }`}>
      <span aria-hidden="true">{arrow}</span>
      {label}: de {format(start)} a {format(end)} {unit}
    </span>
  )
}

interface SeriesRow { label: string; value: number | null; trend: number | null; tooltip: string }

function SeriesTooltip({ active, payload }: { active?: boolean; payload?: { payload?: SeriesRow }[] }) {
  const row = active ? payload?.[0]?.payload : undefined
  if (!row) return null
  return <div className="rounded-lg bg-apple-gray-800 dark:bg-apple-gray-700 text-white px-3 py-2 text-[11px] shadow-apple-md whitespace-pre-line">{row.tooltip}</div>
}

/** % de los minutos del equipo que jugaron los chicos del club, partido a partido. */
export function MinutesShareChart({ rows, colors, minWidth }: { rows: SeriesRow[]; colors: TrendColors; minWidth: number }) {
  return (
    <div className="overflow-x-auto overflow-y-hidden -mx-1 px-1">
      <div className="h-48" style={{ minWidth }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 14, bottom: 0, left: -12 }}>
            <defs>
              <linearGradient id="hg-minutes-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.accent} stopOpacity={0.35} />
                <stop offset="100%" stopColor={colors.accent} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} interval={0} height={20} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={36} tickFormatter={v => `${v}%`} domain={[0, 'auto']} />
            <Tooltip content={<SeriesTooltip />} cursor={{ stroke: colors.trend, strokeOpacity: 0.3 }} />
            <Area type="monotone" dataKey="value" stroke={colors.accent} strokeWidth={2} fill="url(#hg-minutes-fill)" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} connectNulls />
            <Line type="monotone" dataKey="trend" stroke={colors.trend} strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/** Edad promedio de los titulares por partido. */
export function StarterAgeChart({ rows, colors, minWidth }: { rows: SeriesRow[]; colors: TrendColors; minWidth: number }) {
  const values = rows.map(r => r.value).filter((v): v is number => v !== null)
  const lo = values.length ? Math.floor(Math.min(...values) - 0.5) : 20
  const hi = values.length ? Math.ceil(Math.max(...values) + 0.5) : 30
  return (
    <div className="overflow-x-auto overflow-y-hidden -mx-1 px-1">
      <div className="h-48" style={{ minWidth }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 14, bottom: 0, left: -12 }}>
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} interval={0} height={20} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={36} domain={[lo, hi]} tickFormatter={v => `${v}`} />
            <Tooltip content={<SeriesTooltip />} cursor={{ stroke: colors.trend, strokeOpacity: 0.3 }} />
            <Line type="monotone" dataKey="value" stroke={colors.accent} strokeWidth={2} dot={{ r: 2.5, fill: colors.accent, strokeWidth: 0 }} activeDot={{ r: 4 }} isAnimationActive={false} connectNulls />
            <Line type="monotone" dataKey="trend" stroke={colors.trend} strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/** Mapa de participación: una fila por chico, una columna por partido. La celda se pinta
 *  según los minutos (más verde = más minutos), con estrella en el debut y punto en los goles. */
export function ParticipationMap({ players, usage, labels, debutByPlayer, goalsByFixture, accent }: {
  players: HomegrownPlayerTotals[]
  usage: HomegrownMatchUsage[]
  labels: string[]
  debutByPlayer: Map<number, number>
  goalsByFixture: Map<number, { playerId: number }[]>
  accent: string
}) {
  const surname = (name: string) => { const p = name.trim().split(/\s+/); return p.length > 1 ? p.slice(1).join(' ') : name }
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="border-separate" style={{ borderSpacing: 3 }}>
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-white dark:bg-apple-gray-800 min-w-[7.5rem]" />
            {labels.map((l, i) => (
              <th key={i} className="text-[9px] font-medium text-apple-gray-400 w-[22px] h-10 align-bottom">
                {i % 3 === 0 || i === labels.length - 1 ? <span className="inline-block -rotate-45 origin-bottom-left translate-x-2 whitespace-nowrap">{l}</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map(p => (
            <tr key={p.apiPlayerId}>
              <th scope="row" className="sticky left-0 z-10 bg-white dark:bg-apple-gray-800 pr-2 text-left text-xs font-medium text-apple-gray-700 dark:text-apple-gray-200 whitespace-nowrap">
                {surname(p.name)}
              </th>
              {usage.map((u, i) => {
                const entry = [...u.starters, ...u.subsIn].find(e => e.apiPlayerId === p.apiPlayerId)
                const goals = (goalsByFixture.get(u.fixtureId) ?? []).filter(g => g.playerId === p.apiPlayerId).length
                const isDebut = debutByPlayer.get(p.apiPlayerId) === u.fixtureId
                const intensity = entry ? 0.22 + 0.78 * Math.min(1, entry.minutes / 90) : 0
                const title = `${p.name} · ${labels[i]} vs ${u.rival}` + (entry
                  ? ` · ${entry.minutes}' ${entry.started ? '(titular)' : `(entró ${entry.inAt ?? ''}')`}${goals ? ` · ${goals} gol${goals > 1 ? 'es' : ''}` : ''}${isDebut ? ' · debut en Primera' : ''}`
                  : ' · no jugó')
                return (
                  <td key={u.fixtureId} title={title} className="p-0">
                    <div
                      className={`relative w-[22px] h-[22px] rounded-[5px] ${entry ? '' : 'border border-apple-gray-200/80 dark:border-apple-gray-700/60'}`}
                      style={entry ? { backgroundColor: withAlpha(accent, intensity) } : undefined}
                    >
                      {isDebut && (
                        <svg className="absolute inset-0 m-auto w-3 h-3 text-white drop-shadow" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path d="M10 1.8l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.4l-4.94 2.6.94-5.5-4-3.9 5.53-.8L10 1.8z" />
                        </svg>
                      )}
                      {goals > 0 && !isDebut && <span className="absolute inset-0 m-auto w-2 h-2 rounded-full bg-white ring-2 ring-apple-gray-900/40" />}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-2xs text-apple-gray-500 dark:text-apple-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-[3px]" style={{ backgroundColor: withAlpha(accent, 0.3) }} />
          pocos minutos
        </span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-[3px]" style={{ backgroundColor: accent }} />90 minutos</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-[3px] border border-apple-gray-300 dark:border-apple-gray-600" />no jugó</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-apple-gray-500" />gol</span>
        <span className="flex items-center gap-1.5">★ debut en Primera</span>
      </div>
    </div>
  )
}
