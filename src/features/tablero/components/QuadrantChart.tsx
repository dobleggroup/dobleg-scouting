import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlayerPhoto } from '@/components/ui/PlayerPhoto'
import { AGENCY_PLAYERS } from '@/constants/agencyPlayers'
import { useElementWidth } from './useElementWidth'
import { QUADRANT_RATING, QUADRANT_SHARE, type QuadrantId, type QuadrantPoint } from '../tableroData'

export const QUADRANTS: Record<QuadrantId, { label: string; hint: string; dot: string; chip: string }> = {
  figura: {
    label: 'Figuras', hint: 'Juegan mucho y rinden',
    dot: 'fill-emerald-600 dark:fill-emerald-500', chip: 'bg-emerald-600 dark:bg-emerald-500',
  },
  pidePista: {
    label: 'Piden pista', hint: 'Rinden cuando entran pero juegan poco',
    dot: 'fill-amber-600 dark:fill-amber-500', chip: 'bg-amber-600 dark:bg-amber-500',
  },
  aMejorar: {
    label: 'Titulares a mejorar', hint: 'Juegan mucho pero el rating no acompaña',
    dot: 'fill-violet-600 dark:fill-violet-400', chip: 'bg-violet-600 dark:bg-violet-400',
  },
  sinLugar: {
    label: 'Sin lugar', hint: 'Juegan poco y con rating bajo',
    dot: 'fill-apple-gray-400 dark:fill-apple-gray-500', chip: 'bg-apple-gray-400 dark:bg-apple-gray-500',
  },
}

export const QUADRANT_ORDER: QuadrantId[] = ['figura', 'pidePista', 'aMejorar', 'sinLugar']

const PAD = { l: 40, r: 16, t: 16, b: 34 }

export default function QuadrantChart({ points, teamName }: { points: QuadrantPoint[]; teamName: (id: number) => string }) {
  const navigate = useNavigate()
  const [hover, setHover] = useState<string | null>(null)
  const [focusQ, setFocusQ] = useState<QuadrantId | null>(null)
  const [boxRef, W] = useElementWidth<HTMLDivElement>()
  const H = W < 480 ? 300 : 380

  const [yMin, yMax] = useMemo(() => {
    const rs = points.map(p => p.avgRating)
    const lo = Math.min(6.4, ...rs) - 0.15
    const hi = Math.max(7.6, ...rs) + 0.15
    return [Math.floor(lo * 2) / 2, Math.ceil(hi * 2) / 2]
  }, [points])

  const x = (share: number) => PAD.l + share * (W - PAD.l - PAD.r)
  const y = (r: number) => PAD.t + (1 - (r - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b)
  const yTicks: number[] = []
  for (let v = yMin; v <= yMax + 1e-9; v += 0.5) yTicks.push(Number(v.toFixed(1)))

  const hovered = points.find(p => p.fullName === hover) ?? null
  const byQuadrant = useMemo(() => {
    const m = new Map<QuadrantId, QuadrantPoint[]>()
    for (const q of QUADRANT_ORDER) m.set(q, [])
    for (const p of points) m.get(p.quadrant)!.push(p)
    for (const list of m.values()) list.sort((a, b) => b.avgRating - a.avgRating)
    return m
  }, [points])

  const cx = x(QUADRANT_SHARE)
  const cy = y(QUADRANT_RATING)
  const corner = (q: QuadrantId) => {
    const right = q === 'figura' || q === 'aMejorar'
    const top = q === 'figura' || q === 'pidePista'
    return { x: right ? W - PAD.r - 8 : PAD.l + 8, y: top ? PAD.t + 14 : H - PAD.b - 8, anchor: right ? 'end' : 'start' } as const
  }

  return (
    <div>
      {/* Leyenda = filtro: tocar un cuadrante resalta a sus jugadores */}
      <div className="flex flex-wrap gap-2 mb-3">
        {QUADRANT_ORDER.map(q => {
          const n = byQuadrant.get(q)!.length
          const active = focusQ === q
          return (
            <button
              key={q}
              onClick={() => setFocusQ(active ? null : q)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-2xs font-semibold transition-all ${
                active
                  ? 'bg-apple-gray-900 text-white dark:bg-white dark:text-apple-gray-900'
                  : 'bg-apple-gray-100 text-apple-gray-600 dark:bg-apple-gray-700/60 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${QUADRANTS[q].chip}`} />
              {QUADRANTS[q].label}
              <span className="tabular-nums opacity-70">{n}</span>
            </button>
          )
        })}
      </div>

      <div className="relative" ref={boxRef}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block w-full h-auto select-none" role="img" aria-label="Gráfico de minutos jugados contra rating promedio">
          {/* Cuadrante "piden pista" apenas teñido: es el que más le interesa a la agencia */}
          <rect x={PAD.l} y={PAD.t} width={cx - PAD.l} height={cy - PAD.t} className="fill-amber-500/[0.06]" />
          <rect x={cx} y={PAD.t} width={W - PAD.r - cx} height={cy - PAD.t} className="fill-emerald-500/[0.06]" />

          {yTicks.map(v => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="stroke-apple-gray-100 dark:stroke-apple-gray-700/60" strokeWidth={1} />
              <text x={PAD.l - 8} y={y(v) + 3} textAnchor="end" className="fill-apple-gray-400 dark:fill-apple-gray-500 text-[10px]">{v.toFixed(1)}</text>
            </g>
          ))}
          {[0, 0.25, 0.5, 0.75, 1].map(v => (
            <text key={v} x={x(v)} y={H - PAD.b + 16} textAnchor="middle" className="fill-apple-gray-400 dark:fill-apple-gray-500 text-[10px]">{Math.round(v * 100)}%</text>
          ))}
          <text x={(PAD.l + W - PAD.r) / 2} y={H - 4} textAnchor="middle" className="fill-apple-gray-500 dark:fill-apple-gray-400 text-[10px] font-medium">Minutos jugados de los que jugó su equipo →</text>
          <text x={12} y={(PAD.t + H - PAD.b) / 2} textAnchor="middle" transform={`rotate(-90 12 ${(PAD.t + H - PAD.b) / 2})`} className="fill-apple-gray-500 dark:fill-apple-gray-400 text-[10px] font-medium">Rating promedio →</text>

          <line x1={cx} x2={cx} y1={PAD.t} y2={H - PAD.b} className="stroke-apple-gray-300 dark:stroke-apple-gray-600" strokeWidth={1} />
          <line x1={PAD.l} x2={W - PAD.r} y1={cy} y2={cy} className="stroke-apple-gray-300 dark:stroke-apple-gray-600" strokeWidth={1} />

          {QUADRANT_ORDER.map(q => {
            const c = corner(q)
            return (
              <text key={q} x={c.x} y={c.y} textAnchor={c.anchor} className={`text-[11px] font-semibold uppercase tracking-wide ${
                focusQ && focusQ !== q ? 'fill-apple-gray-300 dark:fill-apple-gray-600' : 'fill-apple-gray-500 dark:fill-apple-gray-400'
              }`}>{QUADRANTS[q].label}</text>
            )
          })}

          {points.map(p => {
            const dim = (focusQ && p.quadrant !== focusQ) || (hover && hover !== p.fullName)
            return (
              <g
                key={p.fullName}
                className="cursor-pointer"
                onMouseEnter={() => setHover(p.fullName)}
                onMouseLeave={() => setHover(null)}
                onClick={() => navigate(`/jugador/${encodeURIComponent(p.fullName)}?source=interno`)}
              >
                <circle cx={x(p.share)} cy={y(p.avgRating)} r={16} fill="transparent" />
                <circle
                  cx={x(p.share)} cy={y(p.avgRating)} r={hover === p.fullName ? 8 : 6}
                  className={`${QUADRANTS[p.quadrant].dot} stroke-white dark:stroke-apple-gray-800 transition-all`}
                  strokeWidth={2}
                  opacity={dim ? 0.25 : 1}
                />
              </g>
            )
          })}
        </svg>

        {hovered && (
          <div
            className="absolute z-10 pointer-events-none px-3 py-2 rounded-lg bg-apple-gray-900 dark:bg-white text-white dark:text-apple-gray-900 shadow-apple-md text-2xs whitespace-nowrap"
            style={{
              left: `${(x(hovered.share) / W) * 100}%`,
              top: `${(y(hovered.avgRating) / H) * 100}%`,
              transform: `translate(${hovered.share > 0.6 ? 'calc(-100% - 12px)' : '12px'}, -50%)`,
            }}
          >
            <p className="font-semibold text-xs">{hovered.fullName}</p>
            <p className="opacity-70">{teamName(hovered.teamId)}</p>
            <p className="mt-1 tabular-nums">Rating {hovered.avgRating.toFixed(2)} en {hovered.ratedMatches} partidos</p>
            <p className="tabular-nums">{hovered.minutes.toLocaleString('es-AR')}' de {(hovered.teamMatches * 90).toLocaleString('es-AR')}' posibles ({Math.round(hovered.share * 100)}%)</p>
          </div>
        )}
      </div>

      {/* Vista en lista: lo mismo que el gráfico, leíble sin mouse ni colores */}
      <div className="grid sm:grid-cols-2 gap-3 mt-4">
        {QUADRANT_ORDER.filter(q => !focusQ || q === focusQ).map(q => {
          const list = byQuadrant.get(q)!
          return (
            <div key={q} className="rounded-apple bg-apple-gray-50 dark:bg-apple-gray-700/30 p-3">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`w-2 h-2 rounded-full ${QUADRANTS[q].chip}`} />
                <p className="text-xs font-semibold text-apple-gray-800 dark:text-white">{QUADRANTS[q].label}</p>
              </div>
              <p className="text-2xs text-apple-gray-400 dark:text-apple-gray-500 mb-2">{QUADRANTS[q].hint}</p>
              {list.length === 0 ? (
                <p className="text-2xs text-apple-gray-400 dark:text-apple-gray-500 italic">Nadie en este grupo</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {list.map(p => (
                    <button
                      key={p.fullName}
                      onClick={() => navigate(`/jugador/${encodeURIComponent(p.fullName)}?source=interno`)}
                      onMouseEnter={() => setHover(p.fullName)}
                      onMouseLeave={() => setHover(null)}
                      className="inline-flex items-center gap-1.5 pl-0.5 pr-2 py-0.5 rounded-full bg-white dark:bg-apple-gray-800 border border-apple-gray-200/70 dark:border-apple-gray-700 hover:border-brand-green/60 transition-colors"
                    >
                      <PlayerPhoto src={AGENCY_PLAYERS.find(a => a.fullName === p.fullName)?.image ?? null} name={p.fullName} size="xs" rounded="full" />
                      <span className="text-2xs font-medium text-apple-gray-700 dark:text-apple-gray-200">{p.fullName}</span>
                      <span className="text-2xs tabular-nums text-apple-gray-400">{p.avgRating.toFixed(1)} · {Math.round(p.share * 100)}%</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
