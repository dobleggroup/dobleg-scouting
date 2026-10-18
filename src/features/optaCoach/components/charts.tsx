import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useElementWidth } from '@/features/tablero/components/useElementWidth'
import type { OptaLeague } from '@/features/opta/data'
import { fmtDate } from '@/features/opta/components/ui'
import { fmtMetric, rolling, type TeamGame, type TeamMetric } from '../teamData'

export const RESULT_CLASS: Record<TeamGame['result'], string> = {
  G: 'bg-brand-green/15 text-brand-green',
  E: 'bg-apple-gray-200 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300',
  P: 'bg-red-500/15 text-red-600 dark:text-red-400',
}

export function ResultChip({ r }: { r: TeamGame['result'] }) {
  return <span className={`inline-flex w-5 h-5 items-center justify-center rounded text-[10px] font-bold ${RESULT_CLASS[r]}`}>{r}</span>
}

const short = (league: OptaLeague, id: string) => league.teamById.get(id)?.short ?? '—'

/**
 * Últimos partidos: resultado y, debajo, el xG de cada lado (barras verticales:
 * verde = River, gris = rival). Muestra si ganó/perdió lo que merecía.
 */
export function FormStrip({ games, league }: { games: TeamGame[]; league: OptaLeague }) {
  const max = Math.max(1, ...games.flatMap(g => [g.us.xg ?? 0, g.them.xg ?? 0]))
  return (
    <div>
      <div className="grid gap-1.5 sm:gap-2" style={{ gridTemplateColumns: `repeat(${games.length}, minmax(0, 1fr))` }}>
        {games.map(g => (
          <Link key={g.match.id} to={`/opta/partido/${g.match.id}`} className="group flex flex-col items-center gap-1 min-w-0" title={`${fmtDate(g.match.date)} · ${g.home ? 'vs' : 'en cancha de'} ${short(league, g.oppId)} ${g.gf}-${g.ga} · xG ${(g.us.xg ?? 0).toFixed(2)} a ${(g.them.xg ?? 0).toFixed(2)}`}>
            <div className="flex items-end gap-[2px] h-16 w-full justify-center">
              <div className="w-2.5 sm:w-3 rounded-t-[3px] bg-brand-green" style={{ height: `${((g.us.xg ?? 0) / max) * 100}%`, minHeight: 2 }} />
              <div className="w-2.5 sm:w-3 rounded-t-[3px] bg-apple-gray-300 dark:bg-apple-gray-600" style={{ height: `${((g.them.xg ?? 0) / max) * 100}%`, minHeight: 2 }} />
            </div>
            <ResultChip r={g.result} />
            <span className="text-[11px] font-semibold tabular-nums text-apple-gray-800 dark:text-white">{g.gf}-{g.ga}</span>
            <span className="text-[10px] text-apple-gray-400 truncate max-w-full group-hover:text-brand-green">{short(league, g.oppId)}</span>
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-3">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-brand-green" />xG de River</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-apple-gray-300 dark:bg-apple-gray-600" />xG del rival</span>
        <span>Tocá un partido para ver el detalle</span>
      </div>
    </div>
  )
}

/**
 * Una métrica partido por partido: barras (color por resultado), promedio de los
 * últimos 5 (línea), promedio de la liga (punteada) y la llegada del DT (vertical).
 */
export function MatchTrend({ games, metric, league, leagueAvg, coachFrom, coachShort }: {
  games: TeamGame[]; metric: TeamMetric; league: OptaLeague; leagueAvg: number | null; coachFrom: string; coachShort: string
}) {
  const [ref, W] = useElementWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const H = 240, P = { l: 40, r: 12, t: 22, b: 30 }
  const vals = games.map(g => {
    if (!metric.den) return metric.num(g)
    const d = metric.den(g)
    if (!d) return 0
    return metric.key === 'xgPerShot' ? metric.num(g) / d : (metric.num(g) / d) * 100
  })
  const roll = rolling(vals, 5)
  const max = Math.max(leagueAvg ?? 0, ...vals) * 1.12 || 1
  const iw = W - P.l - P.r, ih = H - P.t - P.b
  const step = iw / Math.max(1, games.length)
  const bw = Math.max(3, Math.min(22, step * 0.62))
  const X = (i: number) => P.l + step * i + step / 2
  const Y = (v: number) => P.t + ih - (v / max) * ih
  const coachIdx = games.findIndex(g => g.match.date >= coachFrom)
  const ticks = [0, max / 2, max * 0.95].map(v => Number(v.toFixed(metric.dec > 0 ? 1 : 0)))
  const h = hover !== null ? games[hover] : null
  const linePath = roll.map((v, i) => (v === null ? null : `${X(i)},${Y(v)}`)).filter(Boolean).join(' L ')
  const barTone = (g: TeamGame) => {
    // Color por resultado: así se ve si los partidos buenos coinciden con la métrica.
    if (g.result === 'G') return 'fill-brand-green'
    if (g.result === 'E') return 'fill-apple-gray-400 dark:fill-apple-gray-500'
    return 'fill-red-400 dark:fill-red-500/80'
  }

  return (
    <div ref={ref} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block w-full h-auto select-none" role="img" aria-label={`${metric.label} partido por partido`}>
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={P.l} x2={W - P.r} y1={Y(v)} y2={Y(v)} className="stroke-apple-gray-100 dark:stroke-apple-gray-700/60" />
            <text x={P.l - 6} y={Y(v) + 3} textAnchor="end" className="text-[10px] fill-apple-gray-400">{fmtMetric(metric, v)}</text>
          </g>
        ))}
        {coachIdx > 0 && (
          <g>
            <rect x={X(coachIdx) - step / 2} y={P.t - 14} width={W - P.r - (X(coachIdx) - step / 2)} height={ih + 14} className="fill-brand-green/[0.05]" />
            <line x1={X(coachIdx) - step / 2} x2={X(coachIdx) - step / 2} y1={P.t - 14} y2={P.t + ih} className="stroke-brand-green" strokeDasharray="3 3" />
            <text x={X(coachIdx) - step / 2 + 5} y={P.t - 4} className="text-[10.5px] font-semibold fill-brand-green">Con {coachShort}</text>
          </g>
        )}
        {games.map((g, i) => (
          <rect key={g.match.id} x={X(i) - bw / 2} y={Y(vals[i])} width={bw} height={Math.max(0, P.t + ih - Y(vals[i]))} rx={Math.min(4, bw / 2)}
            className={`${barTone(g)} ${hover === null || hover === i ? 'opacity-100' : 'opacity-40'} transition-opacity`} />
        ))}
        {leagueAvg !== null && (
          <g>
            <line x1={P.l} x2={W - P.r} y1={Y(leagueAvg)} y2={Y(leagueAvg)} className="stroke-apple-gray-500 dark:stroke-apple-gray-400" strokeDasharray="5 4" />
          </g>
        )}
        {linePath && <path d={`M ${linePath}`} fill="none" className="stroke-apple-gray-800 dark:stroke-white" strokeWidth={2} strokeLinejoin="round" />}
        {games.map((g, i) => (
          <rect key={`h${g.match.id}`} x={X(i) - step / 2} y={P.t} width={step} height={ih} fill="transparent"
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
        ))}
        {games.map((g, i) => (i % Math.ceil(games.length / 12) === 0 || i === games.length - 1) && (
          <text key={`x${g.match.id}`} x={X(i)} y={H - 10} textAnchor="middle" className="text-[9.5px] fill-apple-gray-400">{fmtDate(g.match.date).slice(0, 5)}</text>
        ))}
      </svg>
      {h && hover !== null && (
        <div className="absolute top-1 left-12 px-3 py-2 rounded-apple bg-white/95 dark:bg-apple-gray-800/95 shadow-lg border border-apple-gray-200 dark:border-apple-gray-700 text-xs pointer-events-none">
          <div className="font-semibold text-apple-gray-800 dark:text-white">{h.home ? 'vs' : 'en cancha de'} {short(league, h.oppId)} · {h.gf}-{h.ga}</div>
          <div className="text-apple-gray-400">{fmtDate(h.match.date)} · {h.match.stage}</div>
          <div className="mt-1 tabular-nums text-apple-gray-700 dark:text-apple-gray-200">{metric.label}: <b>{fmtMetric(metric, vals[hover])}</b></div>
          {roll[hover] !== null && <div className="tabular-nums text-apple-gray-500">Últimos 5: {fmtMetric(metric, roll[hover])}</div>}
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-1">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-brand-green" />Ganó</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-apple-gray-400" />Empató</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-400" />Perdió</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-4 h-0.5 bg-apple-gray-800 dark:bg-white" />Promedio de los últimos 5</span>
        {leagueAvg !== null && <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-apple-gray-500" />Promedio de la liga</span>}
      </div>
    </div>
  )
}

/** Barra de percentil con el mismo código de color que el resto de Test Opta. */
export function PctBar({ pct }: { pct: number }) {
  const cls = pct >= 80 ? 'bg-emerald-400' : pct >= 55 ? 'bg-emerald-500' : pct >= 35 ? 'bg-amber-500' : pct >= 20 ? 'bg-orange-500' : 'bg-red-500'
  return (
    <div className="h-2 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700/60 overflow-hidden">
      <div className={`h-full rounded-full ${cls}`} style={{ width: `${Math.max(3, pct)}%` }} />
    </div>
  )
}
