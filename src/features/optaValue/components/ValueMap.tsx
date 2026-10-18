import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useElementWidth } from '@/features/tablero/components/useElementWidth'
import { useCurrency } from '@/context/CurrencyContext'
import type { OptaLeague } from '@/features/opta/data'
import { VERDICT_LABEL, type Valuation } from '../value'
import { sideOf, type Money } from './bits'

const PAD = { l: 52, r: 16, t: 12, b: 40 }
/** Líneas en números redondos de la moneda que se muestra. */
const TICKS = [50_000, 100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000, 10_000_000, 25_000_000]

const DOT: Record<'barato' | 'justo' | 'caro', string> = {
  barato: 'fill-emerald-500 stroke-white dark:stroke-apple-gray-800',
  justo: 'fill-apple-gray-400/50 dark:fill-apple-gray-500/60 stroke-white/0',
  caro: 'fill-white dark:fill-apple-gray-800 stroke-orange-500',
}

/**
 * Nota en su puesto (→) contra valor de mercado (↑, escala que multiplica: cada
 * línea vale más del doble que la de abajo). Verde: barato para lo que rinde;
 * aro naranja: caro; gris: precio justo. Los Doble G van con nombre.
 */
export default function ValueMap({ rows, league, dg, money, labelIds }: {
  rows: Valuation[]; league: OptaLeague; dg: Map<string, unknown>; money: Money
  /** Además de los Doble G, quiénes llevan el nombre escrito. */
  labelIds: Set<string>
}) {
  const [boxRef, W] = useElementWidth<HTMLDivElement>()
  const navigate = useNavigate()
  const [hover, setHover] = useState<string | null>(null)
  const H = W < 520 ? 340 : 440
  const { currency, rate } = useCurrency()
  const toEur = currency === 'USD' ? 1 / rate : 1

  const geo = useMemo(() => {
    const vals = rows.map(r => r.value!)
    const lo = Math.log10(Math.max(30_000, Math.min(...vals) * 0.8))
    const hi = Math.log10(Math.max(...vals) * 1.2)
    return {
      X: (v: number) => PAD.l + (v / 100) * (W - PAD.l - PAD.r),
      Y: (v: number) => PAD.t + (1 - (Math.log10(v) - lo) / (hi - lo)) * (H - PAD.t - PAD.b),
      ticks: TICKS.map(t => t * toEur).filter(t => Math.log10(t) >= lo && Math.log10(t) <= hi),
    }
  }, [rows, W, H, toEur])

  if (rows.length < 3) return <p className="text-sm text-apple-gray-400 py-10 text-center">No hay jugadores suficientes con esos filtros.</p>
  const { X, Y } = geo
  const hp = rows.find(r => r.p.id === hover) ?? null
  const named = rows.filter(r => dg.has(r.p.id) || labelIds.has(r.p.id))
  const order = [...rows].sort((a, b) => Number(dg.has(a.p.id)) - Number(dg.has(b.p.id)))

  return (
    <div ref={boxRef} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block w-full h-auto select-none" role="img" aria-label="Nota contra valor de mercado">
        {geo.ticks.map(t => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={Y(t)} y2={Y(t)} className="stroke-apple-gray-100 dark:stroke-apple-gray-700/60" />
            <text x={PAD.l - 6} y={Y(t) + 3} textAnchor="end" className="text-[10px] fill-apple-gray-400">{money(t)}</text>
          </g>
        ))}
        {[0, 25, 50, 75, 100].map(v => (
          <text key={v} x={X(v)} y={H - PAD.b + 14} textAnchor="middle" className="text-[10px] fill-apple-gray-400">{v}</text>
        ))}
        <text x={W - PAD.r} y={H - 6} textAnchor="end" className="text-[11px] font-medium fill-apple-gray-500 dark:fill-apple-gray-400">Nota en su puesto (Opta) →</text>
        <text x={12} y={PAD.t + 4} transform={`rotate(-90 12 ${PAD.t + 4})`} textAnchor="end" className="text-[11px] font-medium fill-apple-gray-500 dark:fill-apple-gray-400">Valor de mercado →</text>
        {order.map(r => {
          const side = sideOf(r.verdict) ?? 'justo'
          const isDg = dg.has(r.p.id)
          const big = isDg || hover === r.p.id
          return (
            <g key={r.p.id} onMouseEnter={() => setHover(r.p.id)} onMouseLeave={() => setHover(null)} onClick={() => navigate(`/opta/jugador/${r.p.id}`)} style={{ cursor: 'pointer' }}>
              {/* Zona de toque más grande que el punto. */}
              <circle cx={X(r.score!)} cy={Y(r.value!)} r={9} className="fill-transparent" />
              <circle cx={X(r.score!)} cy={Y(r.value!)} r={big ? 6 : 4} strokeWidth={side === 'caro' ? 1.75 : 1.5} className={DOT[side]} />
              {isDg && <circle cx={X(r.score!)} cy={Y(r.value!)} r={9} className="fill-none stroke-brand-green" strokeWidth={2} />}
            </g>
          )
        })}
        {placeLabels(named, X, Y, W, dg).map(({ r, x, anchor }) => (
          <text key={`l${r.p.id}`} x={x} y={Y(r.value!) + 3.5} textAnchor={anchor} className={`text-[10.5px] pointer-events-none ${dg.has(r.p.id) ? 'font-semibold fill-apple-gray-800 dark:fill-white' : 'fill-apple-gray-500 dark:fill-apple-gray-400'}`}>
            {r.p.name}
          </text>
        ))}
      </svg>
      {hp && (
        <div className="absolute top-2 right-2 px-3 py-2 rounded-apple bg-white/95 dark:bg-apple-gray-800/95 shadow-lg border border-apple-gray-200 dark:border-apple-gray-700 text-xs pointer-events-none max-w-[15rem]">
          <div className="font-semibold text-apple-gray-800 dark:text-white">{hp.p.name}</div>
          <div className="text-apple-gray-400">{league.teamById.get(hp.p.teamId ?? '')?.short} · {hp.p.age} años</div>
          <div className="mt-1 tabular-nums text-apple-gray-700 dark:text-apple-gray-200">Nota <b>{hp.score}</b> · vale <b>{money(hp.value)}</b></div>
          <div className="tabular-nums text-apple-gray-700 dark:text-apple-gray-200">Los parecidos valen <b>{money(hp.fair)}</b></div>
          {hp.verdict && <div className="mt-0.5 font-semibold text-apple-gray-800 dark:text-white">{VERDICT_LABEL[hp.verdict]}</div>}
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-1">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Barato para lo que rinde</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-apple-gray-400/60" /> Precio justo</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full border-2 border-orange-500" /> Caro para lo que rinde</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border-2 border-brand-green" /> Doble G</span>
        <span>Tocá un punto para ver la ficha</span>
      </div>
    </div>
  )
}

/** Nombres sin pisarse: primero los Doble G; si no entra de ningún lado, se ve al pasar el mouse. */
function placeLabels(list: Valuation[], X: (v: number) => number, Y: (v: number) => number, W: number, dg: Map<string, unknown>) {
  const boxes: Array<{ x0: number; x1: number; y0: number; y1: number }> = []
  const hits = (b: { x0: number; x1: number; y0: number; y1: number }) => boxes.some(o => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0)
  const out: Array<{ r: Valuation; x: number; anchor: 'start' | 'end' }> = []
  for (const r of [...list].sort((a, b) => Number(dg.has(b.p.id)) - Number(dg.has(a.p.id)))) {
    const px = X(r.score!), py = Y(r.value!), w = r.p.name.length * 5.6 + 4
    const right = { x0: px + 10, x1: px + 10 + w, y0: py - 6, y1: py + 6 }
    const left = { x0: px - 10 - w, x1: px - 10, y0: py - 6, y1: py + 6 }
    if (right.x1 <= W - 4 && !hits(right)) { boxes.push(right); out.push({ r, x: px + 11, anchor: 'start' }) }
    else if (left.x0 >= PAD.l && !hits(left)) { boxes.push(left); out.push({ r, x: px - 11, anchor: 'end' }) }
  }
  return out
}
