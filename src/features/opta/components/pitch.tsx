import { useId, useState, type ReactNode } from 'react'
import type { OptaLeague, OptaShot } from '../data'
import { fmtDate } from './ui'

/**
 * Cancha horizontal en coordenadas de Opta: x 0-100 de arco propio a arco rival,
 * y 0-100 de banda derecha a banda izquierda (mirando hacia el arco rival). Se
 * dibuja en metros (105 × 68) con el ataque hacia la derecha.
 */
export const PX = (x: number) => x * 1.05
export const PY = (y: number) => (100 - y) * 0.68

export function PitchLines({ half = false }: { half?: boolean }) {
  const x0 = half ? 52.5 : 0
  return (
    <g className="stroke-apple-gray-300 dark:stroke-apple-gray-600" fill="none" strokeWidth={0.35}>
      <rect x={x0} y={0} width={105 - x0} height={68} />
      {!half && <line x1={52.5} y1={0} x2={52.5} y2={68} />}
      <circle cx={52.5} cy={34} r={9.15} />
      {/* área rival */}
      <rect x={105 - 16.5} y={34 - 20.16} width={16.5} height={40.32} />
      <rect x={105 - 5.5} y={34 - 9.16} width={5.5} height={18.32} />
      <path d={`M ${105 - 16.5} ${34 - 7.3} A 9.15 9.15 0 0 0 ${105 - 16.5} ${34 + 7.3}`} />
      <circle cx={105 - 11} cy={34} r={0.35} className="fill-apple-gray-300 dark:fill-apple-gray-600" />
      <line x1={105} y1={34 - 3.66} x2={105} y2={34 + 3.66} strokeWidth={1.2} className="stroke-apple-gray-400 dark:stroke-apple-gray-500" />
      {!half && <>
        <rect x={0} y={34 - 20.16} width={16.5} height={40.32} />
        <rect x={0} y={34 - 9.16} width={5.5} height={18.32} />
        <path d={`M 16.5 ${34 - 7.3} A 9.15 9.15 0 0 1 16.5 ${34 + 7.3}`} />
        <circle cx={11} cy={34} r={0.35} className="fill-apple-gray-300 dark:fill-apple-gray-600" />
        <line x1={0} y1={34 - 3.66} x2={0} y2={34 + 3.66} strokeWidth={1.2} className="stroke-apple-gray-400 dark:stroke-apple-gray-500" />
      </>}
    </g>
  )
}

export function Pitch({ half = false, children, label, arrow = true }: { half?: boolean; children?: ReactNode; label: string; arrow?: boolean }) {
  const x0 = half ? 52.5 : 0
  return (
    <svg viewBox={`${x0 - 1} -1 ${105 - x0 + 2} 70`} className="block w-full h-auto rounded-apple bg-emerald-50/40 dark:bg-apple-gray-900/40" role="img" aria-label={label}>
      <PitchLines half={half} />
      {children}
      {arrow && !half && (
        <g className="fill-apple-gray-400 dark:fill-apple-gray-500" opacity={0.7}>
          <path d="M 46 66.2 L 58 66.2 L 58 65.4 L 60 66.6 L 58 67.8 L 58 67 L 46 67 Z" />
        </g>
      )}
    </svg>
  )
}

/**
 * Media cancha vertical con el arco rival arriba (formato habitual de los mapas
 * de remates). VX/VY pasan coordenadas de Opta a metros en esta vista.
 */
export const VX = (y: number) => (100 - y) * 0.68
export const VY = (x: number) => (100 - x) * 1.05

export function VerticalHalfPitch({ children, label }: { children?: ReactNode; label: string }) {
  return (
    <svg viewBox="-1 -1 70 54.5" className="block w-full h-auto rounded-apple bg-emerald-50/40 dark:bg-apple-gray-900/40" role="img" aria-label={label}>
      <g className="stroke-apple-gray-300 dark:stroke-apple-gray-600" fill="none" strokeWidth={0.35}>
        <rect x={0} y={0} width={68} height={52.5} />
        <rect x={34 - 20.16} y={0} width={40.32} height={16.5} />
        <rect x={34 - 9.16} y={0} width={18.32} height={5.5} />
        <path d={`M ${34 - 7.3} 16.5 A 9.15 9.15 0 0 0 ${34 + 7.3} 16.5`} />
        <path d={`M ${34 - 9.15} 52.5 A 9.15 9.15 0 0 1 ${34 + 9.15} 52.5`} />
        <circle cx={34} cy={11} r={0.35} className="fill-apple-gray-300 dark:fill-apple-gray-600" />
        <line x1={34 - 3.66} y1={0} x2={34 + 3.66} y2={0} strokeWidth={1.2} className="stroke-apple-gray-400 dark:stroke-apple-gray-500" />
      </g>
      {children}
    </svg>
  )
}

// ─── Mapa de remates ────────────────────────────────────────────────────────

const RESULT_LABEL: Record<OptaShot[3], string> = { G: 'Gol', S: 'Atajado', M: 'Afuera', P: 'Palo', B: 'Bloqueado' }
const BODY_LABEL: Record<OptaShot[6], string> = { H: 'Cabeza', L: 'Pie izquierdo', R: 'Pie derecho', O: 'Otra parte' }
const SIT_LABEL: Record<string, string> = { OP: 'Jugada', FB: 'Contraataque', SP: 'Pelota parada', CK: 'Córner', FK: 'Tiro libre directo', PEN: 'Penal' }

export function ShotMap({ shots, league, playerTeamId }: { shots: OptaShot[]; league: OptaLeague; playerTeamId?: string | null }) {
  const [hover, setHover] = useState<number | null>(null)
  const h = hover !== null ? shots[hover] : null
  const match = h ? league.matchById.get(h[5]) : null
  const opp = match ? league.teamById.get(match.home === playerTeamId ? match.away : match.home) : null
  // Los goles al final para que queden arriba.
  const order = shots.map((s, i) => i).sort((a, b) => (shots[a][3] === 'G' ? 1 : 0) - (shots[b][3] === 'G' ? 1 : 0))
  // Con muchos remates (mapa de un equipo) los círculos se achican para que se lea.
  const scale = shots.length > 150 ? 0.45 : shots.length > 60 ? 0.65 : 1
  return (
    <div className="relative">
      <VerticalHalfPitch label={`Mapa de ${shots.length} remates`}>
        {order.map(i => {
          const s = shots[i]
          const r = (0.9 + Math.sqrt(s[2]) * 3.6) * scale
          const goal = s[3] === 'G'
          return (
            <circle
              key={i}
              cx={VX(s[1])} cy={VY(s[0])} r={r}
              className={goal
                ? 'fill-brand-green stroke-white dark:stroke-apple-gray-900'
                : s[3] === 'S' || s[3] === 'P'
                  ? 'fill-sky-500/35 stroke-sky-600 dark:stroke-sky-400'
                  : 'fill-apple-gray-400/25 stroke-apple-gray-500 dark:stroke-apple-gray-400'}
              strokeWidth={goal ? 0.35 : 0.25}
              opacity={hover === null || hover === i ? 1 : 0.35}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => setHover(hover === i ? null : i)}
              style={{ cursor: 'pointer' }}
            />
          )
        })}
      </VerticalHalfPitch>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-apple-gray-500 dark:text-apple-gray-400">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-brand-green" /> Gol</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-sky-500/40 ring-1 ring-sky-600" /> Al arco / palo</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-apple-gray-400/30 ring-1 ring-apple-gray-500" /> Afuera / bloqueado</span>
        <span>Tamaño = xG (chance de gol)</span>
      </div>
      {h && (
        <div className="absolute left-2 top-2 max-w-[15rem] px-3 py-2 rounded-apple bg-white/95 dark:bg-apple-gray-800/95 shadow-lg border border-apple-gray-200 dark:border-apple-gray-700 text-xs pointer-events-none">
          <div className="font-semibold text-apple-gray-800 dark:text-white">{RESULT_LABEL[h[3]]} · min {h[4]}'</div>
          <div className="text-apple-gray-500 dark:text-apple-gray-400">{BODY_LABEL[h[6]]} · {SIT_LABEL[h[7]] ?? h[7]}</div>
          <div className="text-apple-gray-700 dark:text-apple-gray-200 mt-0.5">xG {h[2].toFixed(2)} · {Math.round(h[2] * 100)}% de chance de gol</div>
          {match && <div className="text-apple-gray-400 mt-0.5">vs {opp?.short ?? '—'} · {fmtDate(match.date)}</div>}
        </div>
      )}
    </div>
  )
}

// ─── Mapa de calor ──────────────────────────────────────────────────────────

/**
 * Grilla 12 × 8 de Opta (x por columnas, y por filas) → mapa de calor continuo:
 * se interpola a una grilla 4 veces más fina, se difumina y se recorta a la
 * cancha. Un solo color (verde de la app) que va de transparente a intenso;
 * la raíz suaviza para que también se vean las zonas de actividad media.
 */
export function Heatmap({ grid, gx = 12, gy = 8, label, avg, showZones = true }: {
  grid: number[]; gx?: number; gy?: number; label: string
  avg?: { x: number; y: number } | null
  /** Resumen por tercios y carriles debajo del mapa. */
  showZones?: boolean
}) {
  const uid = useId().replace(/:/g, '')
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...grid)
  const total = grid.reduce((s, v) => s + v, 0)
  const cw = 105 / gx, ch = 68 / gy
  const at = (cx: number, cy: number) => grid[Math.max(0, Math.min(gx - 1, cx)) * gy + Math.max(0, Math.min(gy - 1, cy))] ?? 0

  // Interpolación bilineal entre centros de celda.
  const F = 4
  const fine: Array<{ x: number; y: number; w: number; h: number; t: number }> = []
  for (let i = 0; i < gx * F; i++) {
    for (let j = 0; j < gy * F; j++) {
      const fx = (i + 0.5) / F - 0.5, fy = (j + 0.5) / F - 0.5
      const x0 = Math.floor(fx), y0 = Math.floor(fy)
      const dx = fx - x0, dy = fy - y0
      const v = at(x0, y0) * (1 - dx) * (1 - dy) + at(x0 + 1, y0) * dx * (1 - dy) + at(x0, y0 + 1) * (1 - dx) * dy + at(x0 + 1, y0 + 1) * dx * dy
      const t = Math.pow(v / max, 0.7)
      if (t < 0.04) continue
      fine.push({ x: (i / F) * cw, y: (gy - (j + 1) / F) * ch, w: cw / F + 0.05, h: ch / F + 0.05, t })
    }
  }

  // Tercios (x) y carriles (y; y = 0 es la banda derecha mirando al arco rival).
  const sumCols = (a: number, b: number) => { let s = 0; for (let c = a; c < b; c++) for (let r = 0; r < gy; r++) s += at(c, r); return s }
  const sumRows = (a: number, b: number) => { let s = 0; for (let r = a; r < b; r++) for (let c = 0; c < gx; c++) s += at(c, r); return s }
  const pctOf = (v: number) => (total ? Math.round((v / total) * 100) : 0)
  const thirds = [
    { label: 'Campo propio', v: pctOf(sumCols(0, gx / 3)) },
    { label: 'Mitad de cancha', v: pctOf(sumCols(gx / 3, (2 * gx) / 3)) },
    { label: 'Campo rival', v: pctOf(sumCols((2 * gx) / 3, gx)) },
  ]
  const lanes = [
    { label: 'Izquierda', v: pctOf(sumRows(Math.round(gy * 0.625), gy)) },
    { label: 'Centro', v: pctOf(sumRows(Math.round(gy * 0.375), Math.round(gy * 0.625))) },
    { label: 'Derecha', v: pctOf(sumRows(0, Math.round(gy * 0.375))) },
  ]

  return (
    <div className="relative">
      <Pitch label={label}>
        <defs>
          <clipPath id={`clip-${uid}`}><rect x={0} y={0} width={105} height={68} /></clipPath>
          <filter id={`blur-${uid}`} x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation={2.4} /></filter>
        </defs>
        <g clipPath={`url(#clip-${uid})`}>
          <g filter={`url(#blur-${uid})`}>
            {fine.map((c, k) => (
              <rect key={k} x={c.x} y={c.y} width={c.w} height={c.h} className="fill-brand-green" opacity={0.05 + c.t * 0.9} />
            ))}
          </g>
        </g>
        <PitchLines />
        {/* Zonas invisibles para el detalle al pasar el mouse */}
        {grid.map((v, i) => {
          const cx = Math.floor(i / gy), cy = i % gy
          return (
            <rect key={i} x={cx * cw} y={(gy - 1 - cy) * ch} width={cw} height={ch} fill="transparent"
              className={hover === i ? 'stroke-apple-gray-800 dark:stroke-white' : ''} strokeWidth={0.3}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
          )
        })}
        {avg && avg.x !== null && (
          <g pointerEvents="none">
            <circle cx={PX(avg.x)} cy={PY(avg.y)} r={2.2} className="fill-white dark:fill-apple-gray-900 stroke-apple-gray-800 dark:stroke-white" strokeWidth={0.5} />
            <circle cx={PX(avg.x)} cy={PY(avg.y)} r={0.75} className="fill-apple-gray-800 dark:fill-white" />
          </g>
        )}
      </Pitch>
      {hover !== null && (
        <div className="absolute right-2 top-2 px-2.5 py-1.5 rounded-apple bg-white/95 dark:bg-apple-gray-800/95 shadow border border-apple-gray-200 dark:border-apple-gray-700 text-xs pointer-events-none">
          {grid[hover]} acciones · {pctOf(grid[hover])}% del total
        </div>
      )}
      {showZones && total > 0 && (
        <div className="grid grid-cols-2 gap-3 mt-3">
          <ZoneBar title="Por tercios" parts={thirds} />
          <ZoneBar title="Por carriles" parts={lanes} />
        </div>
      )}
    </div>
  )
}

/** Barra apilada con el reparto de acciones (tercios o carriles). Cada parte lleva su número. */
function ZoneBar({ title, parts }: { title: string; parts: Array<{ label: string; v: number }> }) {
  const top = Math.max(...parts.map(p => p.v))
  return (
    <div>
      <div className="text-2xs uppercase tracking-wide text-apple-gray-400 mb-1">{title}</div>
      <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
        {parts.map(p => (
          <div key={p.label} className="bg-brand-green" style={{ width: `${p.v}%`, opacity: p.v === top ? 0.95 : 0.35 }} />
        ))}
      </div>
      <div className="grid grid-cols-3 mt-1 text-2xs text-apple-gray-500 dark:text-apple-gray-400 tabular-nums leading-tight">
        {parts.map((p, i) => (
          <div key={p.label} className={`${i === 0 ? 'text-left' : i === 1 ? 'text-center' : 'text-right'} ${p.v === top ? 'text-apple-gray-800 dark:text-white' : ''}`}>
            <div className="truncate">{p.label}</div>
            <div className={`text-xs ${p.v === top ? 'font-bold' : 'font-medium'}`}>{p.v}%</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Mapa de pases ──────────────────────────────────────────────────────────

export interface PassLine { x: number; y: number; ex: number; ey: number; strong?: boolean; faded?: boolean }

/**
 * Pases como flechas sobre la cancha (ataque hacia la derecha). `strong` resalta
 * (ej. asistencias o centros que llegaron); `faded` atenúa (centros que no llegaron).
 */
export function PassMap({ lines, label, legend }: { lines: PassLine[]; label: string; legend?: ReactNode }) {
  return (
    <div>
      <Pitch label={label}>
        <defs>
          <marker id="opta-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse">
            <path d="M0,0 L6,3 L0,6 Z" className="fill-brand-green" />
          </marker>
          <marker id="opta-arrow-strong" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse">
            <path d="M0,0 L6,3 L0,6 Z" className="fill-[#2563eb] dark:fill-[#3b82f6]" />
          </marker>
          <marker id="opta-arrow-faded" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse">
            <path d="M0,0 L6,3 L0,6 Z" className="fill-apple-gray-400" />
          </marker>
        </defs>
        {lines.map((l, i) => (
          <g key={i}>
            <line
              x1={PX(l.x)} y1={PY(l.y)} x2={PX(l.ex)} y2={PY(l.ey)}
              className={l.strong ? 'stroke-[#2563eb] dark:stroke-[#3b82f6]' : l.faded ? 'stroke-apple-gray-400' : 'stroke-brand-green'}
              strokeWidth={l.strong ? 0.55 : 0.35}
              opacity={l.faded ? 0.45 : l.strong ? 0.95 : 0.7}
              markerEnd={`url(#${l.strong ? 'opta-arrow-strong' : l.faded ? 'opta-arrow-faded' : 'opta-arrow'})`}
            />
            <circle cx={PX(l.x)} cy={PY(l.y)} r={0.45} className={l.strong ? 'fill-[#2563eb] dark:fill-[#3b82f6]' : l.faded ? 'fill-apple-gray-400' : 'fill-brand-green'} opacity={l.faded ? 0.45 : 0.85} />
          </g>
        ))}
      </Pitch>
      {legend && <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-apple-gray-500 dark:text-apple-gray-400">{legend}</div>}
    </div>
  )
}
