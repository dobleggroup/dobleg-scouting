import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCurrency } from '@/context/CurrencyContext'
import { formatMarketValueInCurrency } from '@/utils/scoring'
import { AGENCY_PLAYERS } from '@/constants/agencyPlayers'
import type { ValuePoint } from '../tableroInsights'
import { useElementWidth } from './useElementWidth'

const PAD = { l: 40, r: 16, t: 16, b: 34 }
/** 0,15 de rating o más por encima de lo esperado para su valor = "rinde más de lo que vale". */
export const VALUE_GAP = 0.15
const LABELS = 3

/** Nombre corto del roster ("M. Palacios") si es de una sola persona; si no, el completo. */
function shortLabel(fullName: string): string {
  const short = AGENCY_PLAYERS.find(p => p.fullName === fullName)?.shortName
  if (!short || AGENCY_PLAYERS.filter(p => p.shortName === short).length > 1) return fullName
  return short
}

export default function ValueChart({ points, slope, intercept }: { points: ValuePoint[]; slope: number; intercept: number }) {
  const navigate = useNavigate()
  const { currency, rate } = useCurrency()
  const [hover, setHover] = useState<string | null>(null)
  const [boxRef, W] = useElementWidth<HTMLDivElement>()
  const H = W < 480 ? 280 : 340

  const { xMin, xMax, yMin, yMax } = useMemo(() => {
    const lx = points.map(p => Math.log10(p.value))
    const ry = points.map(p => p.rating)
    return {
      xMin: Math.floor(Math.min(...lx) * 2) / 2,
      xMax: Math.ceil(Math.max(...lx) * 2) / 2,
      yMin: Math.floor((Math.min(...ry) - 0.1) * 2) / 2,
      yMax: Math.ceil((Math.max(...ry) + 0.1) * 2) / 2,
    }
  }, [points])

  const x = (v: number) => PAD.l + ((Math.log10(v) - xMin) / ((xMax - xMin) || 1)) * (W - PAD.l - PAD.r)
  const y = (r: number) => PAD.t + (1 - (r - yMin) / ((yMax - yMin) || 1)) * (H - PAD.t - PAD.b)
  const xTicks: number[] = []
  // En pantallas angostas, una marca de por medio para que los montos no se pisen.
  const step = W < 480 ? 2 : 1
  for (let e = Math.ceil(xMin); e <= Math.floor(xMax); e += step) xTicks.push(10 ** e)
  const yTicks: number[] = []
  for (let v = yMin; v <= yMax + 1e-9; v += 0.5) yTicks.push(Number(v.toFixed(1)))

  const fit = (lv: number) => intercept + slope * lv
  const undervalued = points.filter(p => p.residual >= VALUE_GAP).sort((a, b) => b.residual - a.residual)
  const labelled = new Set(undervalued.slice(0, LABELS).map(p => p.fullName))
  const hovered = points.find(p => p.fullName === hover) ?? null
  const money = (v: number) => formatMarketValueInCurrency(v, currency, rate)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 text-2xs text-apple-gray-500 dark:text-apple-gray-400">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-brand-green" /> Rinde más de lo que vale</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-apple-gray-400 dark:bg-apple-gray-500" /> El resto</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-4 h-px bg-apple-gray-400" /> Rating esperado para su valor</span>
      </div>

      <div className="relative" ref={boxRef}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block w-full h-auto select-none" role="img" aria-label="Rating promedio contra valor de mercado">
          {yTicks.map(v => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="stroke-apple-gray-100 dark:stroke-apple-gray-700/60" />
              <text x={PAD.l - 8} y={y(v) + 3} textAnchor="end" className="fill-apple-gray-400 dark:fill-apple-gray-500 text-[10px]">{v.toFixed(1)}</text>
            </g>
          ))}
          {xTicks.map((v, i) => (
            <text key={v} x={x(v)} y={H - PAD.b + 16} textAnchor={xTicks.length > 1 && i === xTicks.length - 1 && x(v) > W - PAD.r - 30 ? 'end' : 'middle'} className="fill-apple-gray-400 dark:fill-apple-gray-500 text-[10px]">{money(v)}</text>
          ))}
          <text x={(PAD.l + W - PAD.r) / 2} y={H - 4} textAnchor="middle" className="fill-apple-gray-500 dark:fill-apple-gray-400 text-[10px] font-medium">Valor de mercado →</text>
          <text x={12} y={(PAD.t + H - PAD.b) / 2} textAnchor="middle" transform={`rotate(-90 12 ${(PAD.t + H - PAD.b) / 2})`} className="fill-apple-gray-500 dark:fill-apple-gray-400 text-[10px] font-medium">Rating promedio →</text>

          <line
            x1={x(10 ** xMin)} y1={y(fit(xMin))} x2={x(10 ** xMax)} y2={y(fit(xMax))}
            className="stroke-apple-gray-400 dark:stroke-apple-gray-500" strokeWidth={1.5}
          />

          {points.map(p => {
            const good = p.residual >= VALUE_GAP
            const dim = hover && hover !== p.fullName
            return (
              <g key={p.fullName} className="cursor-pointer"
                onMouseEnter={() => setHover(p.fullName)} onMouseLeave={() => setHover(null)}
                onClick={() => navigate(`/jugador/${encodeURIComponent(p.fullName)}?source=interno`)}>
                <circle cx={x(p.value)} cy={y(p.rating)} r={16} fill="transparent" />
                <circle
                  cx={x(p.value)} cy={y(p.rating)} r={hover === p.fullName ? 8 : 6}
                  className={`${good ? 'fill-brand-green' : 'fill-apple-gray-400 dark:fill-apple-gray-500'} stroke-white dark:stroke-apple-gray-800 transition-all`}
                  strokeWidth={2} opacity={dim ? 0.3 : 1}
                />
                {labelled.has(p.fullName) && !hover && (
                  <text
                    x={x(p.value) + (x(p.value) > W * 0.75 ? -10 : 10)} y={y(p.rating) + 4}
                    textAnchor={x(p.value) > W * 0.75 ? 'end' : 'start'}
                    className="fill-apple-gray-700 dark:fill-apple-gray-200 text-[11px] font-semibold"
                  >
                    {shortLabel(p.fullName)}
                  </text>
                )}
              </g>
            )
          })}
        </svg>

        {hovered && (
          <div
            className="absolute z-10 pointer-events-none px-3 py-2 rounded-lg bg-apple-gray-900 dark:bg-white text-white dark:text-apple-gray-900 shadow-apple-md text-2xs whitespace-nowrap"
            style={{
              left: `${(x(hovered.value) / W) * 100}%`,
              top: `${(y(hovered.rating) / H) * 100}%`,
              transform: `translate(${x(hovered.value) > W * 0.6 ? 'calc(-100% - 12px)' : '12px'}, -50%)`,
            }}
          >
            <p className="font-semibold text-xs">{hovered.fullName}</p>
            <p className="mt-0.5 tabular-nums">Valor {money(hovered.value)} · rating {hovered.rating.toFixed(2)} ({hovered.matches} partidos)</p>
            <p className="tabular-nums opacity-80">
              {hovered.residual >= 0 ? '+' : '−'}{Math.abs(hovered.residual).toFixed(2)} contra lo esperado para su valor
            </p>
          </div>
        )}
      </div>

      {undervalued.length > 0 && (
        <p className="mt-3 text-xs text-apple-gray-600 dark:text-apple-gray-300">
          <span className="font-semibold">Rinden más de lo que valen:</span>{' '}
          {undervalued.map((p, i) => (
            <span key={p.fullName}>
              {i > 0 && ', '}
              <button onClick={() => navigate(`/jugador/${encodeURIComponent(p.fullName)}?source=interno`)} className="font-medium text-brand-green hover:underline">
                {p.fullName}
              </button>
              <span className="text-apple-gray-400"> ({money(p.value)})</span>
            </span>
          ))}
        </p>
      )}
    </div>
  )
}
