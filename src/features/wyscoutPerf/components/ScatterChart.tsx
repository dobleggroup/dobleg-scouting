import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useElementWidth } from '@/features/tablero/components/useElementWidth'
import { fmtMetric, type MetricDef } from '../metrics'

export interface ScatterPoint {
  key: string
  name: string
  x: number
  y: number
  minutes: number
}

const PAD = { l: 48, r: 16, t: 16, b: 40 }

/**
 * Dispersión de dos métricas para los jugadores de la agencia. Las líneas
 * punteadas son el promedio: arriba a la derecha están los que son buenos en
 * las dos cosas.
 */
export default function ScatterChart({ points, mx, my, highlight, colorOf }: {
  points: ScatterPoint[]
  mx: MetricDef
  my: MetricDef
  /** Uno o varios jugadores resaltados. */
  highlight?: string | string[] | null
  colorOf?: (key: string) => string | undefined
}) {
  const [boxRef, W] = useElementWidth<HTMLDivElement>()
  return <div ref={boxRef}>{points.length < 3
    ? <p className="text-sm text-apple-gray-400 py-10 text-center">Hacen falta al menos 3 jugadores con minutos suficientes en las dos métricas.</p>
    : <Chart points={points} mx={mx} my={my} marked={new Set(highlight ? (Array.isArray(highlight) ? highlight : [highlight]) : [])} colorOf={colorOf} W={W} />}</div>
}

function Chart({ points, mx, my, marked, colorOf, W }: {
  points: ScatterPoint[]; mx: MetricDef; my: MetricDef; marked: Set<string>; colorOf?: (key: string) => string | undefined; W: number
}) {
  const navigate = useNavigate()
  const [hover, setHover] = useState<string | null>(null)
  const H = W < 480 ? 300 : 380
  const range = (vs: number[], m: MetricDef) => {
    let lo = Math.min(...vs), hi = Math.max(...vs)
    const pad = (hi - lo) * 0.12 || 1
    lo -= pad; hi += pad
    if (m.unit === '%') { lo = Math.max(0, lo); hi = Math.min(100, hi) }
    else if (Math.min(...vs) >= 0) lo = Math.max(0, lo)
    return [lo, hi] as const
  }
  const [x0, x1] = range(points.map(p => p.x), mx)
  const [y0, y1] = range(points.map(p => p.y), my)
  // "Mejor" siempre hacia arriba y a la derecha: si menos es mejor, se da vuelta el eje.
  const fx = (v: number) => (mx.lowerIsBetter ? (x1 - v) / (x1 - x0) : (v - x0) / (x1 - x0))
  const fy = (v: number) => (my.lowerIsBetter ? (y1 - v) / (y1 - y0) : (v - y0) / (y1 - y0))
  const X = (v: number) => PAD.l + fx(v) * (W - PAD.l - PAD.r)
  const Y = (v: number) => PAD.t + (1 - fy(v)) * (H - PAD.t - PAD.b)
  const ax = points.reduce((s, p) => s + p.x, 0) / points.length
  const ay = points.reduce((s, p) => s + p.y, 0) / points.length
  const hp = points.find(p => p.key === hover) ?? null

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block w-full h-auto select-none" role="img" aria-label={`${mx.label} contra ${my.label}`}>
        <rect x={X(ax)} y={PAD.t} width={Math.max(0, W - PAD.r - X(ax))} height={Math.max(0, Y(ay) - PAD.t)} className="fill-emerald-500/[0.07]" />
        {[0, 0.5, 1].map(f => {
          const vx = mx.lowerIsBetter ? x1 - f * (x1 - x0) : x0 + f * (x1 - x0)
          const vy = my.lowerIsBetter ? y1 - f * (y1 - y0) : y0 + f * (y1 - y0)
          return (
            <g key={f}>
              <text x={PAD.l + f * (W - PAD.l - PAD.r)} y={H - PAD.b + 16} textAnchor="middle" className="fill-apple-gray-400 text-[10px] tabular-nums">{fmtMetric(mx, vx)}</text>
              <text x={PAD.l - 8} y={PAD.t + (1 - f) * (H - PAD.t - PAD.b) + 3} textAnchor="end" className="fill-apple-gray-400 text-[10px] tabular-nums">{fmtMetric(my, vy)}</text>
            </g>
          )
        })}
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 4} textAnchor="middle" className="fill-apple-gray-500 dark:fill-apple-gray-400 text-[10px] font-medium">{mx.label}{mx.lowerIsBetter ? ' (menos es mejor)' : ''} →</text>
        <text x={12} y={(PAD.t + H - PAD.b) / 2} textAnchor="middle" transform={`rotate(-90 12 ${(PAD.t + H - PAD.b) / 2})`} className="fill-apple-gray-500 dark:fill-apple-gray-400 text-[10px] font-medium">{my.label}{my.lowerIsBetter ? ' (menos es mejor)' : ''} →</text>
        <line x1={X(ax)} x2={X(ax)} y1={PAD.t} y2={H - PAD.b} className="stroke-apple-gray-300 dark:stroke-apple-gray-600" strokeDasharray="4 4" />
        <line x1={PAD.l} x2={W - PAD.r} y1={Y(ay)} y2={Y(ay)} className="stroke-apple-gray-300 dark:stroke-apple-gray-600" strokeDasharray="4 4" />
        <text x={W - PAD.r - 6} y={PAD.t + 12} textAnchor="end" className="fill-emerald-700 dark:fill-emerald-400 text-[10px] font-semibold uppercase tracking-wide">Bueno en las dos</text>
        {points.map(p => {
          const me = marked.has(p.key)
          const own = me ? colorOf?.(p.key) : undefined
          const show = me || hover === p.key || points.length <= 12
          return (
            <g key={p.key} className="cursor-pointer" onMouseEnter={() => setHover(p.key)} onMouseLeave={() => setHover(null)}
              onClick={() => navigate(`/jugador/${encodeURIComponent(p.name)}?source=interno`)}>
              <circle cx={X(p.x)} cy={Y(p.y)} r={14} fill="transparent" />
              <circle cx={X(p.x)} cy={Y(p.y)} r={me ? 7 : 5}
                className={`${me ? (own ? '' : 'fill-brand-green') : 'fill-apple-gray-400 dark:fill-apple-gray-500'} stroke-white dark:stroke-apple-gray-800`} strokeWidth={2} fill={own}
                opacity={hover && hover !== p.key && !me ? 0.35 : 1} />
              {show && (
                <text x={X(p.x) + 9} y={Y(p.y) + 3} className={`text-[10px] ${me ? 'fill-apple-gray-900 dark:fill-white font-semibold' : 'fill-apple-gray-500 dark:fill-apple-gray-400'}`}>
                  {p.name.split(' ').slice(-1)[0]}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {hp && (
        <div className="absolute z-10 pointer-events-none px-3 py-2 rounded-lg bg-apple-gray-900 dark:bg-white text-white dark:text-apple-gray-900 shadow-apple-md text-2xs whitespace-nowrap"
          style={{ left: `${(X(hp.x) / W) * 100}%`, top: `${(Y(hp.y) / H) * 100}%`, transform: `translate(${X(hp.x) > W * 0.6 ? 'calc(-100% - 12px)' : '12px'}, -50%)` }}>
          <p className="font-semibold text-xs">{hp.name}</p>
          <p className="tabular-nums">{mx.label}: {fmtMetric(mx, hp.x)}</p>
          <p className="tabular-nums">{my.label}: {fmtMetric(my, hp.y)}</p>
          <p className="opacity-70 tabular-nums">{hp.minutes.toLocaleString('es-AR')} minutos</p>
        </div>
      )}
    </div>
  )
}
