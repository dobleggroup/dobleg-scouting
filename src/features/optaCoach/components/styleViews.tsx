import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { OptaLeague } from '@/features/opta/data'
import { PX, PY, Pitch } from '@/features/opta/components/pitch'
import type { Fact, ShapePlayer, StyleReading } from '../style'

export type Accent = 'green' | 'blue'
const ACCENT = {
  green: { fill: 'fill-brand-green', bg: 'bg-brand-green', text: 'text-brand-green', soft: 'bg-brand-green/[0.07] border-brand-green/30', stroke: 'stroke-brand-green' },
  blue: { fill: 'fill-[#2563eb] dark:fill-[#3b82f6]', bg: 'bg-[#2563eb] dark:bg-[#3b82f6]', text: 'text-[#2563eb] dark:text-[#60a5fa]', soft: 'bg-[#2563eb]/[0.06] border-[#2563eb]/30', stroke: 'stroke-[#2563eb] dark:stroke-[#3b82f6]' },
}

/** Lo importante primero: los rasgos más marcados, en frases cortas. */
export function KeyFacts({ title, subtitle, items, accent = 'green' }: {
  title: string; subtitle?: string; accent?: Accent
  items: Array<{ headline: string; text: ReactNode }>
}) {
  const a = ACCENT[accent]
  if (!items.length) return null
  return (
    <section className={`rounded-apple-lg border p-4 sm:p-5 ${a.soft}`}>
      <h3 className="text-base font-bold text-apple-gray-800 dark:text-white">{title}</h3>
      {subtitle && <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">{subtitle}</p>}
      <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-3 mt-4">
        {items.map((it, i) => (
          <li key={i} className="flex gap-3">
            <span className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white ${a.bg}`}>{i + 1}</span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-apple-gray-800 dark:text-white">{it.headline}</div>
              <div className="text-xs text-apple-gray-600 dark:text-apple-gray-300 mt-0.5">{it.text}</div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** Las claves (teamFacts) con el puesto resaltado. */
export const factItems = (facts: Fact[]) => facts.map(f => ({
  headline: f.headline,
  text: <>{f.detail} · <b>{f.rank}º de {f.total}</b></>,
}))

/** Cada eje de estilo: de un polo al otro, con el equipo ubicado contra la liga. */
export function StyleProfile({ readings, accent = 'green' }: { readings: StyleReading[]; accent?: Accent }) {
  const a = ACCENT[accent]
  return (
    <div className="grid sm:grid-cols-2 gap-x-8 gap-y-5">
      {readings.map(r => {
        const marked = r.strength >= 20
        return (
          <div key={r.axis.key} title={r.metric.help}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-apple-gray-400">{r.axis.title}</span>
              <span className="text-[10px] text-apple-gray-400 tabular-nums">{r.text}</span>
            </div>
            <div className={`text-sm font-semibold mt-0.5 ${marked ? a.text : 'text-apple-gray-600 dark:text-apple-gray-300'}`}>{r.verdict}</div>
            <div className="relative h-4 mt-1.5">
              <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-gradient-to-r from-apple-gray-200 via-apple-gray-100 to-apple-gray-200 dark:from-apple-gray-700 dark:via-apple-gray-800 dark:to-apple-gray-700" />
              <div className="absolute top-0 bottom-0 left-1/2 w-px bg-apple-gray-300 dark:bg-apple-gray-600" />
              <span className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white dark:ring-apple-gray-800 ${a.bg} ${marked ? 'w-3.5 h-3.5' : 'w-3 h-3 opacity-70'}`} style={{ left: `${Math.max(3, Math.min(97, r.pos))}%` }} />
            </div>
            <div className="flex justify-between gap-3 text-[10.5px] text-apple-gray-400 mt-1 leading-tight">
              <span className={r.pos <= 30 ? 'font-semibold text-apple-gray-600 dark:text-apple-gray-300' : ''}>{r.axis.low}</span>
              <span className={`text-right ${r.pos >= 70 ? 'font-semibold text-apple-gray-600 dark:text-apple-gray-300' : ''}`}>{r.axis.high}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Separa los puntos que quedan encimados (posiciones medias parecidas) para que se
 * lean todos: los empuja de a poco hasta que queden a `min` metros entre sí.
 */
function spread(points: Array<{ id: string; cx: number; cy: number }>, min = 8.5) {
  const out = points.map(p => ({ ...p }))
  for (let it = 0; it < 30; it++) {
    let moved = false
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
      const a = out[i], b = out[j]
      const dx = b.cx - a.cx, dy = b.cy - a.cy
      const dist = Math.hypot(dx, dy) || 0.01
      if (dist >= min) continue
      const push = (min - dist) / 2, ux = dx / dist, uy = dy / dist
      a.cx -= ux * push; a.cy -= uy * push; b.cx += ux * push; b.cy += uy * push
      moved = true
    }
    if (!moved) break
  }
  for (const p of out) { p.cx = Math.max(3, Math.min(102, p.cx)); p.cy = Math.max(3, Math.min(62, p.cy)) }
  return out
}

const surname = (name: string) => {
  const parts = name.trim().split(/\s+/)
  return parts.length > 1 ? parts.slice(1).join(' ') : name
}

/**
 * Cómo se para: los más usados en su posición media (ataca hacia la derecha), la
 * altura de la línea defensiva y dónde defiende el equipo.
 */
export function TeamShape({ players, league, lineX, blockX, accent = 'green', label }: {
  players: ShapePlayer[]; league: OptaLeague; lineX: number | null; blockX: number | null; accent?: Accent; label: string
}) {
  const navigate = useNavigate()
  const [hover, setHover] = useState<string | null>(null)
  const a = ACCENT[accent]
  const hp = players.find(p => p.id === hover)
  const placed = spread(players.map(p => ({ id: p.id, cx: PX(p.x), cy: PY(p.y) })))
  const posOf = new Map(placed.map(p => [p.id, p]))
  return (
    <div className="relative">
      <Pitch label={label}>
        {blockX !== null && (
          <g>
            <rect x={0} y={0} width={PX(blockX)} height={68} className={`${a.fill} opacity-[0.06]`} />
            <line x1={PX(blockX)} x2={PX(blockX)} y1={0} y2={68} className="stroke-apple-gray-400 dark:stroke-apple-gray-500" strokeWidth={0.3} strokeDasharray="1 1" />
            <text x={PX(blockX) + 0.8} y={5.8} className="fill-apple-gray-500 dark:fill-apple-gray-400" fontSize={2.2}>Defiende a {Math.round(blockX * 1.05)} m</text>
          </g>
        )}
        {lineX !== null && (
          <g>
            <line x1={PX(lineX)} x2={PX(lineX)} y1={0} y2={68} className={a.stroke} strokeWidth={0.45} strokeDasharray="1.6 1" />
            <text x={PX(lineX) + 0.8} y={2.8} className={a.fill} fontSize={2.3} fontWeight={600}>Línea defensiva · {Math.round(lineX * 1.05)} m</text>
          </g>
        )}
        {players.map(p => {
          const pl = league.playerById.get(p.id)
          const { cx, cy } = posOf.get(p.id)!
          // El nombre va abajo, salvo que debajo haya otro jugador: ahí va arriba.
          const crowdedBelow = placed.some(o => o.id !== p.id && Math.abs(o.cx - cx) < 9 && o.cy > cy && o.cy - cy < 8)
          const labelY = crowdedBelow ? cy - 4 : cy + 5.6
          const name = pl ? surname(pl.name) : '—'
          return (
            <g key={p.id} onMouseEnter={() => setHover(p.id)} onMouseLeave={() => setHover(null)} onClick={() => navigate(`/opta/jugador/${p.id}`)} style={{ cursor: 'pointer' }}>
              <circle cx={cx} cy={cy} r={hover === p.id ? 3.3 : 2.9} className={`${a.fill} stroke-white dark:stroke-apple-gray-900`} strokeWidth={0.5} />
              <text x={cx} y={cy + 0.85} textAnchor="middle" fontSize={2.4} fontWeight={700} className="fill-white pointer-events-none">{pl?.shirt ?? ''}</text>
              <text x={cx} y={labelY} textAnchor="middle" fontSize={2.3} fontWeight={600}
                className="fill-apple-gray-800 dark:fill-white stroke-white dark:stroke-apple-gray-900 pointer-events-none" strokeWidth={0.6} paintOrder="stroke">
                {name.length > 14 ? `${name.slice(0, 13)}…` : name}
              </text>
            </g>
          )
        })}
      </Pitch>
      {hp && (
        <div className="absolute top-2 left-2 px-3 py-2 rounded-apple bg-white/95 dark:bg-apple-gray-800/95 shadow-lg border border-apple-gray-200 dark:border-apple-gray-700 text-xs pointer-events-none">
          <div className="font-semibold text-apple-gray-800 dark:text-white">{league.playerById.get(hp.id)?.name}</div>
          <div className="text-apple-gray-500 tabular-nums">{hp.starts} de titular · {hp.minutes} minutos</div>
        </div>
      )}
    </div>
  )
}

/** Por dónde ataca: reparto de sus toques en el último tercio por banda. */
export function LanesBar({ lanes, accent = 'green' }: { lanes: { left: number; centre: number; right: number }; accent?: Accent }) {
  const a = ACCENT[accent]
  const max = Math.max(lanes.left, lanes.centre, lanes.right)
  const items = [{ k: 'Izquierda', v: lanes.left }, { k: 'Medio', v: lanes.centre }, { k: 'Derecha', v: lanes.right }]
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map(it => (
        <div key={it.k} className="rounded-apple-lg bg-apple-gray-50 dark:bg-apple-gray-900/40 px-3 py-2.5 text-center relative overflow-hidden">
          <div className={`absolute inset-x-0 bottom-0 ${a.bg} opacity-15`} style={{ height: `${(it.v / Math.max(1, max)) * 100}%` }} />
          <div className={`relative text-xl font-bold tabular-nums ${it.v === max ? a.text : 'text-apple-gray-700 dark:text-apple-gray-200'}`}>{it.v}%</div>
          <div className="relative text-[10px] font-semibold uppercase tracking-wide text-apple-gray-400">{it.k}</div>
        </div>
      ))}
    </div>
  )
}
