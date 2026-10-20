import { useState } from 'react'
import { useElementWidth } from '@/features/tablero/components/useElementWidth'
import { fmtMetric, unitSuffix, type MetricDef } from '../metrics'
import type { EvolutionPoint } from '../analysis'

const PAD = { l: 44, r: 16, t: 18, b: 40 }

/**
 * Evolución de una métrica por temporada / año / mes. Línea verde = el jugador;
 * punteada gris = promedio de los de su posición en la agencia en esas fechas.
 */
export default function EvolutionChart({ points, metric }: { points: EvolutionPoint[]; metric: MetricDef }) {
  const [boxRef, W] = useElementWidth<HTMLDivElement>()
  return <div ref={boxRef}><Chart points={points} metric={metric} W={W} /></div>
}

function Chart({ points, metric, W }: { points: EvolutionPoint[]; metric: MetricDef; W: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const H = W < 480 ? 240 : 290
  const vals = points.flatMap(p => [p.value, p.agency]).filter((v): v is number => v !== null)

  if (vals.length === 0) {
    return <div className="h-40 flex items-center justify-center text-sm text-apple-gray-400">Sin minutos suficientes para mostrar esta métrica.</div>
  }

  let lo = Math.min(...vals), hi = Math.max(...vals)
  if (metric.unit === '%') { lo = Math.max(0, Math.floor((lo - 5) / 10) * 10); hi = Math.min(100, Math.ceil((hi + 5) / 10) * 10) }
  else { const pad = (hi - lo) * 0.15 || hi * 0.2 || 1; lo = Math.max(lo < 0 ? lo - pad : 0, lo - pad); hi = hi + pad }
  if (lo === hi) hi = lo + 1

  const n = points.length
  const x = (i: number) => PAD.l + (n === 1 ? 0.5 : i / (n - 1)) * (W - PAD.l - PAD.r)
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => lo + f * (hi - lo))
  const path = (key: 'value' | 'agency') => {
    let d = ''
    let pen = false
    points.forEach((p, i) => {
      const v = p[key]
      if (v === null) { pen = false; return }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `
      pen = true
    })
    return d
  }
  const step = Math.max(1, Math.ceil(n / Math.max(4, Math.floor(W / 70))))
  const hp = hover !== null ? points[hover] : null

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 mb-2 text-2xs text-apple-gray-500 dark:text-apple-gray-400">
        <span className="inline-flex items-center gap-1.5"><span className="w-4 h-0.5 rounded bg-brand-green" />Jugador</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-apple-gray-400" />Promedio de su posición en la agencia</span>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block w-full h-auto select-none" role="img" aria-label={`Evolución de ${metric.label}`}>
          {ticks.map((v, i) => (
            <g key={i}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="stroke-apple-gray-100 dark:stroke-apple-gray-700/60" />
              <text x={PAD.l - 8} y={y(v) + 3} textAnchor="end" className="fill-apple-gray-400 dark:fill-apple-gray-500 text-[10px] tabular-nums">{fmtMetric(metric, v)}</text>
            </g>
          ))}
          {points.map((p, i) => (i % step === 0 || i === n - 1) && (
            <text key={i} x={x(i)} y={H - PAD.b + 16} textAnchor="middle" className="fill-apple-gray-400 dark:fill-apple-gray-500 text-[10px]">{p.label}</text>
          ))}
          <path d={path('agency')} fill="none" className="stroke-apple-gray-400 dark:stroke-apple-gray-500" strokeWidth={1.5} strokeDasharray="5 4" />
          <path d={path('value')} fill="none" className="stroke-brand-green" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) => p.value !== null && (
            <circle key={i} cx={x(i)} cy={y(p.value)} r={hover === i ? 6 : 4} className="fill-brand-green stroke-white dark:stroke-apple-gray-800" strokeWidth={2} />
          ))}
          {points.map((_, i) => (
            <rect key={i} x={x(i) - (W / Math.max(n, 1)) / 2} y={PAD.t} width={W / Math.max(n, 1)} height={H - PAD.t - PAD.b}
              fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(i)} />
          ))}
        </svg>
        {hp && hover !== null && (
          <div
            className="absolute z-10 pointer-events-none px-3 py-2 rounded-lg bg-apple-gray-900 dark:bg-white text-white dark:text-apple-gray-900 shadow-apple-md text-2xs whitespace-nowrap"
            style={{ left: `${(x(hover) / W) * 100}%`, top: 4, transform: `translateX(${x(hover) > W * 0.6 ? 'calc(-100% - 8px)' : '8px'})` }}
          >
            <p className="font-semibold text-xs">{hp.label}</p>
            <p className="tabular-nums">Jugador: {fmtMetric(metric, hp.value)}{unitSuffix(metric)}</p>
            <p className="tabular-nums opacity-70">Su posición en la agencia: {fmtMetric(metric, hp.agency)}</p>
            <p className="opacity-70 tabular-nums">{hp.matches} partidos · {hp.minutes.toLocaleString('es-AR')}'</p>
          </div>
        )}
      </div>
    </div>
  )
}
