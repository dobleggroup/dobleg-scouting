import { useState } from 'react'
import { useElementWidth } from '@/features/tablero/components/useElementWidth'
import type { OptaPlayer } from '../data'
import { fmt, type OptaMetric, type PercentileIndex } from '../metrics'
import { pctTone } from './ui'

/** Colores fijos para comparar hasta 3 jugadores (validados para daltonismo, claro y oscuro). */
export const SERIES_CLASS = [
  'text-[#16a34a]',
  'text-[#2563eb] dark:text-[#3b82f6]',
  'text-[#ea580c]',
]
export const SERIES_BG = ['bg-[#16a34a]', 'bg-[#2563eb] dark:bg-[#3b82f6]', 'bg-[#ea580c]']

// ─── Radar ──────────────────────────────────────────────────────────────────

export interface RadarSeries {
  name: string
  /** 0-100 para dibujar (percentil o valor escalado). */
  values: Array<number | null>
  /** Texto a mostrar al pasar el mouse por cada eje (valor real). */
  display?: Array<string>
  /** 'avg' = promedio del puesto: gris y punteado, debajo de los jugadores. */
  kind?: 'avg'
}

export function Radar({ axes, series, size = 380, scaleLabel = 'percentil' }: { axes: OptaMetric[]; series: RadarSeries[]; size?: number; scaleLabel?: string }) {
  const [boxRef, W] = useElementWidth<HTMLDivElement>(size)
  const S = Math.min(W, size)
  const small = S < 330
  const cx = S / 2, cy = S / 2, R = S / 2 - (small ? 58 : 72)
  const n = axes.length
  const ang = (i: number) => -Math.PI / 2 + (i / n) * Math.PI * 2
  const pt = (i: number, v: number) => [cx + Math.cos(ang(i)) * R * (v / 100), cy + Math.sin(ang(i)) * R * (v / 100)] as const
  const [hover, setHover] = useState<number | null>(null)
  const players = series.filter(s => s.kind !== 'avg')
  const ordered = [...series.filter(s => s.kind === 'avg'), ...players]
  return (
    <div ref={boxRef} className="w-full flex flex-col items-center">
      <div className="relative">
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S} role="img" aria-label="Radar" className="block overflow-visible">
          {[25, 50, 75, 100].map(r => (
            <polygon key={r} points={axes.map((_, i) => pt(i, r).join(',')).join(' ')}
              className="fill-none stroke-apple-gray-200 dark:stroke-apple-gray-700" strokeWidth={1} />
          ))}
          {axes.map((a, i) => {
            const [x, y] = pt(i, 100)
            const [lx, ly] = pt(i, 100 + (small ? 28 : 32))
            const anchor = Math.abs(lx - cx) < 8 ? 'middle' : lx > cx ? 'start' : 'end'
            const lines: string[] = []
            for (const w of a.label.split(' ')) {
              if (lines.length && (lines[lines.length - 1] + ' ' + w).length <= 14) lines[lines.length - 1] += ' ' + w
              else lines.push(w)
            }
            return (
              <g key={a.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: 'default' }}>
                <line x1={cx} y1={cy} x2={x} y2={y} className="stroke-apple-gray-200 dark:stroke-apple-gray-700" strokeWidth={1} />
                <circle cx={lx} cy={ly} r={22} fill="transparent" />
                <text x={lx} y={ly - (lines.length - 1) * 6} textAnchor={anchor} className={`text-[10.5px] ${hover === i ? 'fill-apple-gray-900 dark:fill-white font-semibold' : 'fill-apple-gray-500 dark:fill-apple-gray-400'}`}>
                  {lines.map((l, j) => <tspan key={j} x={lx} dy={j ? 12 : 0}>{l}</tspan>)}
                </text>
              </g>
            )
          })}
          {ordered.map(s => {
            const si = players.indexOf(s)
            const pts = s.values.map((v, i) => pt(i, v ?? 0))
            if (s.kind === 'avg') {
              return (
                <polygon key="avg" points={pts.map(p => p.join(',')).join(' ')}
                  className="fill-apple-gray-400/15 stroke-apple-gray-400 dark:stroke-apple-gray-500" strokeWidth={1.75} strokeDasharray="5 4" strokeLinejoin="round" />
              )
            }
            return (
              <g key={si} className={SERIES_CLASS[si]}>
                <polygon points={pts.map(p => p.join(',')).join(' ')} fill="currentColor" fillOpacity={players.length > 1 ? 0.1 : 0.2} stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
                {pts.map((p, i) => s.values[i] !== null && (
                  <circle key={i} cx={p[0]} cy={p[1]} r={hover === i ? 5 : 3.5} fill="currentColor" className="stroke-white dark:stroke-apple-gray-800" strokeWidth={2} />
                ))}
              </g>
            )
          })}
          {/* Zonas de hover sobre cada eje, para mostrar los valores */}
          {axes.map((_, i) => {
            const [x, y] = pt(i, 100)
            return <line key={`h${i}`} x1={cx} y1={cy} x2={x} y2={y} stroke="transparent" strokeWidth={18} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
          })}
        </svg>
        {hover !== null && (
          <div className="absolute left-1/2 -translate-x-1/2 top-0 px-3 py-2 rounded-apple bg-white/95 dark:bg-apple-gray-800/95 shadow-lg border border-apple-gray-200 dark:border-apple-gray-700 text-xs pointer-events-none min-w-[11rem]">
            <div className="font-semibold text-apple-gray-800 dark:text-white mb-1">{axes[hover].label}</div>
            {ordered.map((s, k) => {
              const si = players.indexOf(s)
              return (
                <div key={k} className="flex items-center justify-between gap-3 tabular-nums">
                  <span className={`inline-flex items-center gap-1.5 ${s.kind === 'avg' ? 'text-apple-gray-500' : SERIES_CLASS[si]}`}>
                    <span className={`w-2 h-2 rounded-full ${s.kind === 'avg' ? 'bg-apple-gray-400' : SERIES_BG[si]}`} />
                    <span className="text-apple-gray-600 dark:text-apple-gray-300 truncate max-w-[8rem]">{s.name}</span>
                  </span>
                  <b className="text-apple-gray-800 dark:text-white">{s.display?.[hover] ?? (s.values[hover] ?? '—')}</b>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-1 text-xs">
        {ordered.map((s, k) => {
          const si = players.indexOf(s)
          return (
            <span key={k} className="inline-flex items-center gap-1.5 text-apple-gray-600 dark:text-apple-gray-300">
              {s.kind === 'avg'
                ? <span className="w-4 border-t-2 border-dashed border-apple-gray-400" />
                : <span className={`w-2.5 h-2.5 rounded-full ${SERIES_BG[si]}`} />}
              {s.name}
            </span>
          )
        })}
        <span className="text-apple-gray-400">· escala: {scaleLabel}</span>
      </div>
    </div>
  )
}

/** Series listas para el radar: jugador(es) contra el promedio de su puesto, en valores reales escalados. */
export function radarVsAverage(axes: OptaMetric[], players: OptaPlayer[], idx: PercentileIndex, mode: 'valor' | 'percentil', withAvg = true): RadarSeries[] {
  const group = players[0]?.group
  const out: RadarSeries[] = []
  if (withAvg && group) {
    out.push({
      name: 'Promedio del puesto',
      kind: 'avg',
      values: axes.map(a => (mode === 'percentil' ? 50 : idx.norm(group, a.key, idx.avg(group, a.key)))),
      display: axes.map(a => fmt(idx.avg(group, a.key), a)),
    })
  }
  for (const p of players) {
    out.push({
      name: p.name,
      values: axes.map(a => (mode === 'percentil' ? idx.pct(p, a.key) : idx.norm(p.group, a.key, a.value(p)))),
      display: axes.map(a => {
        const pct = idx.pct(p, a.key)
        return `${fmt(a.value(p), a)}${pct !== null ? ` · p${pct}` : ''}`
      }),
    })
  }
  return out
}

// ─── Contra el promedio del puesto (ficha) ──────────────────────────────────

/**
 * Cada métrica: su valor, el promedio de su puesto en la liga y la diferencia
 * en % (como la ficha de Scout Externo), con una barra que marca el promedio.
 */
export function VsAverageRows({ player, metrics, idx }: { player: OptaPlayer; metrics: OptaMetric[]; idx: PercentileIndex }) {
  return (
    <ul className="space-y-3">
      {metrics.map(mt => {
        const v = mt.value(player)
        const avg = idx.avg(player.group, mt.key)
        const pct = idx.pct(player, mt.key)
        const diff = idx.vsAvg(player, mt.key)
        const tone = pctTone(pct)
        const pos = idx.norm(player.group, mt.key, v)
        const avgPos = idx.norm(player.group, mt.key, avg)
        return (
          <li key={mt.key} className="group" title={mt.help}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-apple-gray-700 dark:text-apple-gray-200 truncate">{mt.label}</span>
              <span className="shrink-0 tabular-nums flex items-baseline gap-2">
                <span className="font-semibold text-apple-gray-800 dark:text-white">{fmt(v, mt)}</span>
                <span className="text-xs text-apple-gray-400">prom. {fmt(avg, mt)}</span>
                {diff !== null && (
                  <span className={`text-xs font-semibold w-12 text-right ${diff >= 10 ? 'text-emerald-500' : diff <= -10 ? 'text-orange-500' : 'text-apple-gray-400'}`}>
                    {diff > 0 ? '+' : ''}{Math.abs(diff) > 999 ? '>999' : diff}%
                  </span>
                )}
              </span>
            </div>
            <div className="relative h-2 mt-1.5 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700/60">
              <div className={`absolute inset-y-0 left-0 rounded-full ${tone.bar}`} style={{ width: `${pos ?? 0}%` }} />
              {avgPos !== null && (
                <div className="absolute -top-1 -bottom-1 w-0.5 rounded bg-apple-gray-800 dark:bg-white" style={{ left: `calc(${avgPos}% - 1px)` }} title={`Promedio del puesto: ${fmt(avg, mt)}`} />
              )}
            </div>
            <div className="flex justify-between text-2xs mt-0.5">
              <span className={`font-semibold ${tone.text}`}>{pct === null ? 'sin datos suficientes' : `percentil ${pct}`}</span>
              <span className="hidden group-hover:inline text-apple-gray-400 truncate ml-2">{mt.help}</span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// ─── Barras de percentiles (ficha) ──────────────────────────────────────────

export function PercentileRows({ player, metrics, idx }: { player: OptaPlayer; metrics: OptaMetric[]; idx: PercentileIndex }) {
  return (
    <ul className="space-y-2">
      {metrics.map(mt => {
        const v = mt.value(player)
        const p = idx.pct(player, mt.key)
        const avg = idx.avg(player.group, mt.key)
        const tone = pctTone(p)
        return (
          <li key={mt.key} className="group" title={mt.help}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-apple-gray-700 dark:text-apple-gray-200 truncate">{mt.label}</span>
              <span className="shrink-0 tabular-nums">
                <span className="font-semibold text-apple-gray-800 dark:text-white">{fmt(v, mt)}</span>
                <span className={`ml-2 text-xs font-semibold ${tone.text}`}>{p === null ? 'sin datos suficientes' : `percentil ${p}`}</span>
              </span>
            </div>
            <div className="relative h-2 mt-1 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700/60 overflow-hidden">
              <div className={`absolute inset-y-0 left-0 rounded-full ${tone.bar}`} style={{ width: `${p ?? 0}%` }} />
              <div className="absolute inset-y-0 w-px bg-apple-gray-500/60" style={{ left: '50%' }} title="Mitad de la tabla" />
            </div>
            <div className="hidden group-hover:block text-2xs text-apple-gray-400 mt-0.5">
              {mt.help} Promedio del puesto: {fmt(avg, mt)}.
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// ─── Barras por partido ─────────────────────────────────────────────────────

export interface BarDatum { key: string; label: string; sub?: string; value: number | null; accent?: boolean }

export function MatchBars({ data, format, height = 180, onSelect }: { data: BarDatum[]; format: (v: number) => string; height?: number; onSelect?: (key: string) => void }) {
  const [boxRef, W] = useElementWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const vals = data.map(d => d.value ?? 0)
  const hi = Math.max(0, ...vals), lo = Math.min(0, ...vals)
  const span = hi - lo || 1
  const PAD = { l: 8, r: 8, t: 14, b: 22 }
  const innerH = height - PAD.t - PAD.b
  const bw = (W - PAD.l - PAD.r) / Math.max(1, data.length)
  const Y = (v: number) => PAD.t + ((hi - v) / span) * innerH
  const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0
  const h = hover !== null ? data[hover] : null
  return (
    <div ref={boxRef} className="relative">
      <svg viewBox={`0 0 ${W} ${height}`} width={W} height={height} className="block w-full h-auto" role="img" aria-label="Valores por partido">
        <line x1={PAD.l} x2={W - PAD.r} y1={Y(0)} y2={Y(0)} className="stroke-apple-gray-300 dark:stroke-apple-gray-600" />
        <line x1={PAD.l} x2={W - PAD.r} y1={Y(avg)} y2={Y(avg)} className="stroke-apple-gray-400 dark:stroke-apple-gray-500" strokeDasharray="4 4" />
        {data.map((d, i) => {
          if (d.value === null) return null
          const x = PAD.l + i * bw + Math.min(2, bw * 0.15)
          const w = Math.max(1, bw - Math.min(4, bw * 0.3))
          const y0 = Y(Math.max(0, d.value)), y1 = Y(Math.min(0, d.value))
          return (
            <g key={d.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => onSelect?.(d.key)} style={{ cursor: onSelect ? 'pointer' : undefined }}>
              <rect x={PAD.l + i * bw} y={PAD.t} width={bw} height={innerH} fill="transparent" />
              <rect x={x} y={y0} width={w} height={Math.max(1, y1 - y0)} rx={Math.min(3, w / 2)}
                className={d.value < 0 ? 'fill-red-400/80' : d.accent ? 'fill-brand-green' : 'fill-brand-green/55'}
                opacity={hover === null || hover === i ? 1 : 0.45} />
            </g>
          )
        })}
        <text x={W - PAD.r} y={Y(avg) - 4} textAnchor="end" className="text-[10px] fill-apple-gray-400">promedio {format(avg)}</text>
      </svg>
      {h && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-apple bg-white/95 dark:bg-apple-gray-800/95 shadow border border-apple-gray-200 dark:border-apple-gray-700 text-xs pointer-events-none whitespace-nowrap">
          <span className="font-semibold text-apple-gray-800 dark:text-white">{h.label}</span>
          {h.sub && <span className="text-apple-gray-400"> · {h.sub}</span>}
          <span className="ml-2 font-semibold tabular-nums text-apple-gray-800 dark:text-white">{h.value === null ? '—' : format(h.value)}</span>
        </div>
      )}
    </div>
  )
}
