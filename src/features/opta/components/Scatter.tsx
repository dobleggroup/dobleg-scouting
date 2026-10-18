import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useElementWidth } from '@/features/tablero/components/useElementWidth'
import { fmt, type OptaMetric } from '../metrics'

export interface ScatterPt { id: string; name: string; team: string; x: number; y: number; dg?: boolean; focus?: boolean }

const PAD = { l: 52, r: 16, t: 16, b: 42 }

/**
 * Dispersión de dos métricas. Las líneas punteadas son el promedio; "mejor" queda
 * siempre arriba a la derecha (si menos es mejor, el eje se da vuelta). Los
 * jugadores Doble G y el elegido van con nombre; el resto al pasar el mouse.
 */
export default function Scatter({ points, mx, my, bestLabel, height, labelTop = 6, onSelect, legend }: {
  points: ScatterPt[]; mx: OptaMetric; my: OptaMetric
  /** Texto en la esquina buena (arriba a la derecha), ej. "Encaran y avanzan". */
  bestLabel?: string
  height?: number
  /** Cuántos de los mejores llevan el nombre escrito. */
  labelTop?: number
  /** Al tocar un punto (por defecto abre la ficha del jugador). */
  onSelect?: (id: string) => void
  /** Leyenda propia (por defecto: Doble G / resto de la liga). */
  legend?: ReactNode
}) {
  const [boxRef, W] = useElementWidth<HTMLDivElement>()
  const navigate = useNavigate()
  const [hover, setHover] = useState<string | null>(null)
  const H = height ?? (W < 520 ? 320 : 440)

  const geo = useMemo(() => {
    const range = (vs: number[], mt: OptaMetric) => {
      let lo = Math.min(...vs), hi = Math.max(...vs)
      const pad = (hi - lo) * 0.08 || 1
      lo -= pad; hi += pad
      if (mt.unit === '%') { lo = Math.max(0, lo); hi = Math.min(100, hi) }
      else if (Math.min(...vs) >= 0) lo = Math.max(0, lo)
      return [lo, hi] as const
    }
    const [x0, x1] = range(points.map(p => p.x), mx)
    const [y0, y1] = range(points.map(p => p.y), my)
    const fx = (v: number) => (mx.lowerIsBetter ? (x1 - v) / (x1 - x0) : (v - x0) / (x1 - x0))
    const fy = (v: number) => (my.lowerIsBetter ? (y1 - v) / (y1 - y0) : (v - y0) / (y1 - y0))
    return {
      X: (v: number) => PAD.l + fx(v) * (W - PAD.l - PAD.r),
      Y: (v: number) => PAD.t + (1 - fy(v)) * (H - PAD.t - PAD.b),
      ax: points.reduce((s, p) => s + p.x, 0) / points.length,
      ay: points.reduce((s, p) => s + p.y, 0) / points.length,
      x0, x1, y0, y1,
    }
  }, [points, mx, my, W, H])

  if (points.length < 3) return <p className="text-sm text-apple-gray-400 py-10 text-center">No hay jugadores suficientes con esos filtros.</p>

  const { X, Y, ax, ay } = geo
  // Etiquetas: DG, elegido, y los 6 mejores en la suma de las dos (en percentil de la nube).
  const rankX = [...points].sort((a, b) => (mx.lowerIsBetter ? a.x - b.x : b.x - a.x)).map(p => p.id)
  const rankY = [...points].sort((a, b) => (my.lowerIsBetter ? a.y - b.y : b.y - a.y)).map(p => p.id)
  const top = new Set([...points].sort((a, b) => (rankX.indexOf(a.id) + rankY.indexOf(a.id)) - (rankX.indexOf(b.id) + rankY.indexOf(b.id))).slice(0, labelTop).map(p => p.id))
  const hp = points.find(p => p.id === hover) ?? null
  const ticks = (a: number, b: number) => [0, 0.5, 1].map(f => a + (b - a) * f)

  return (
    <div ref={boxRef} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block w-full h-auto select-none" role="img" aria-label={`${mx.label} contra ${my.label}`}>
        <rect x={X(ax)} y={PAD.t} width={Math.max(0, W - PAD.r - X(ax))} height={Math.max(0, Y(ay) - PAD.t)} className="fill-emerald-500/[0.06]" />
        {bestLabel && <text x={W - PAD.r - 6} y={PAD.t + 14} textAnchor="end" className="text-[11px] font-semibold fill-emerald-600 dark:fill-emerald-400">{bestLabel}</text>}
        {ticks(geo.y0, geo.y1).map((v, i) => (
          <g key={`y${i}`}>
            <line x1={PAD.l} x2={W - PAD.r} y1={Y(v)} y2={Y(v)} className="stroke-apple-gray-100 dark:stroke-apple-gray-700/60" />
            <text x={PAD.l - 6} y={Y(v) + 3} textAnchor="end" className="text-[10px] fill-apple-gray-400">{fmt(v, my)}</text>
          </g>
        ))}
        {ticks(geo.x0, geo.x1).map((v, i) => (
          <text key={`x${i}`} x={X(v)} y={H - PAD.b + 14} textAnchor="middle" className="text-[10px] fill-apple-gray-400">{fmt(v, mx)}</text>
        ))}
        <line x1={X(ax)} x2={X(ax)} y1={PAD.t} y2={H - PAD.b} className="stroke-apple-gray-300 dark:stroke-apple-gray-600" strokeDasharray="4 4" />
        <line x1={PAD.l} x2={W - PAD.r} y1={Y(ay)} y2={Y(ay)} className="stroke-apple-gray-300 dark:stroke-apple-gray-600" strokeDasharray="4 4" />
        <text x={W - PAD.r} y={H - 6} textAnchor="end" className="text-[11px] font-medium fill-apple-gray-500 dark:fill-apple-gray-400">{mx.label} →</text>
        <text x={12} y={PAD.t + 4} transform={`rotate(-90 12 ${PAD.t + 4})`} textAnchor="end" className="text-[11px] font-medium fill-apple-gray-500 dark:fill-apple-gray-400">{my.label} →</text>
        {[...points].sort((a, b) => Number(Boolean(a.dg || a.focus)) - Number(Boolean(b.dg || b.focus))).map(p => {
          const strong = p.dg || p.focus
          return (
            <circle
              key={p.id} cx={X(p.x)} cy={Y(p.y)} r={strong ? 6 : hover === p.id ? 6 : 4}
              className={p.focus ? 'fill-[#2563eb] dark:fill-[#3b82f6] stroke-white dark:stroke-apple-gray-800' : p.dg ? 'fill-brand-green stroke-white dark:stroke-apple-gray-800' : 'fill-apple-gray-400/45 dark:fill-apple-gray-500/50 stroke-white/0'}
              strokeWidth={2}
              onMouseEnter={() => setHover(p.id)} onMouseLeave={() => setHover(null)}
              onClick={() => (onSelect ? onSelect(p.id) : navigate(`/opta/jugador/${p.id}`))}
              style={{ cursor: 'pointer' }}
            />
          )
        })}
        {placeLabels(points.filter(p => p.dg || p.focus || top.has(p.id)), X, Y, W).map(({ p, x, anchor }) => (
          <text key={`l${p.id}`} x={x} y={Y(p.y) + 3.5} textAnchor={anchor} className={`text-[10.5px] pointer-events-none ${p.dg || p.focus ? 'font-semibold fill-apple-gray-800 dark:fill-white' : 'fill-apple-gray-500 dark:fill-apple-gray-400'}`}>
            {p.name}
          </text>
        ))}
      </svg>
      {hp && (
        <div className="absolute top-2 right-2 px-3 py-2 rounded-apple bg-white/95 dark:bg-apple-gray-800/95 shadow-lg border border-apple-gray-200 dark:border-apple-gray-700 text-xs pointer-events-none">
          <div className="font-semibold text-apple-gray-800 dark:text-white">{hp.name}</div>
          <div className="text-apple-gray-400">{hp.team}</div>
          <div className="mt-1 tabular-nums text-apple-gray-700 dark:text-apple-gray-200">{mx.label}: <b>{fmt(hp.x, mx)}</b></div>
          <div className="tabular-nums text-apple-gray-700 dark:text-apple-gray-200">{my.label}: <b>{fmt(hp.y, my)}</b></div>
        </div>
      )}
      {legend ?? (
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-1">
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-brand-green" /> Doble G</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-apple-gray-400/60" /> Resto de la liga</span>
          <span>Arriba a la derecha: mejores en las dos cosas · tocá un punto para ver la ficha</span>
        </div>
      )}
    </div>
  )
}

/**
 * Ubica los nombres sin que se pisen: primero los Doble G y el elegido, después
 * el resto. Cada nombre va a la derecha del punto, o a la izquierda si no entra
 * o choca; si choca de los dos lados, no se escribe (se ve al pasar el mouse).
 */
function placeLabels(list: ScatterPt[], X: (v: number) => number, Y: (v: number) => number, W: number) {
  const boxes: Array<{ x0: number; x1: number; y0: number; y1: number }> = []
  const hits = (b: { x0: number; x1: number; y0: number; y1: number }) => boxes.some(o => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0)
  const out: Array<{ p: ScatterPt; x: number; anchor: 'start' | 'end' }> = []
  const ordered = [...list].sort((a, b) => Number(Boolean(b.dg || b.focus)) - Number(Boolean(a.dg || a.focus)))
  for (const p of ordered) {
    const px = X(p.x), py = Y(p.y), w = p.name.length * 5.6 + 4
    const right = { x0: px + 7, x1: px + 7 + w, y0: py - 6, y1: py + 6 }
    const left = { x0: px - 7 - w, x1: px - 7, y0: py - 6, y1: py + 6 }
    const strong = p.dg || p.focus
    if (right.x1 <= W - 4 && !hits(right)) { boxes.push(right); out.push({ p, x: px + 8, anchor: 'start' }) }
    else if (left.x0 >= 4 && !hits(left)) { boxes.push(left); out.push({ p, x: px - 8, anchor: 'end' }) }
    else if (strong) { const b = right.x1 <= W - 4 ? right : left; boxes.push(b); out.push({ p, x: b === right ? px + 8 : px - 8, anchor: b === right ? 'start' : 'end' }) }
  }
  return out
}
