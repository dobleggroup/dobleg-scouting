import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Panel, { Segmented } from '@/features/tablero/components/Panel'
import { PlayerPhoto } from '@/components/ui/PlayerPhoto'
import { useElementWidth } from '@/features/tablero/components/useElementWidth'
import { METRICS, METRIC_BY_KEY, POS_GROUP_LABEL, fmtMetric, metricsFor, unitSuffix, type MetricDef } from '../metrics'
import { groupPeriods, monthsAgo, type MonthRow } from '../periods'
import { playerConclusions, playerGroup } from '../conclusions'
import { WINDOW_LABEL, playIn, windowTotals, type Window } from '../analysis'
import ConclusionList from './ConclusionList'
import MetricSelect from './MetricSelect'
import { ClassBadge, type ClassOrNone } from './classes'

/** Un color por jugador, en el mismo orden en que se eligieron (paleta apta para daltónicos). */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4']

const WINDOW_OPTS: { id: Window; label: string }[] = [
  { id: '3m', label: '3 meses' }, { id: '12m', label: '12 meses' }, { id: 'all', label: 'Carrera' },
]

interface Who { key: string; name: string; cls: ClassOrNone; rows: MonthRow[] }

/** Comparación lado a lado de 2 a 5 jugadores. */
export default function CompareView({ players, allRows, matchMinutes, photo, source }: {
  players: Who[]
  allRows: MonthRow[]
  matchMinutes: Map<string, Array<{ date: string; minutes: number }>>
  photo: (key: string) => string | null
  source: React.ReactNode
}) {
  const [win, setWin] = useState<Window>('12m')
  const groups = [...new Set(players.map(p => playerGroup(p.rows)))]
  const metrics = useMemo(() => {
    const keys = new Set(groups.flatMap(g => metricsFor(g).map(m => m.key)))
    return METRICS.filter(m => keys.has(m.key))
  }, [groups.join()]) // eslint-disable-line react-hooks/exhaustive-deps
  const [metricKey, setMetricKey] = useState(metrics[0]?.key ?? 'regates_ok_90')
  const metric = METRIC_BY_KEY[metricKey] ?? metrics[0]

  const totals = players.map(p => windowTotals(p.rows, win))
  const min = win === '3m' ? 270 : 450

  return (
    <div className="space-y-5">
      <Panel
        title="Cara a cara"
        subtitle={`${WINDOW_LABEL[win]}. En verde, el mejor de cada fila. Con menos de ${min} minutos no se muestra el número porque no alcanza para comparar.`}
        actions={<Segmented label="Período" value={win} options={WINDOW_OPTS} onChange={setWin} />}
        source={source}
      >
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="sticky left-0 bg-white dark:bg-apple-gray-800 text-left text-2xs font-medium text-apple-gray-400 pb-3 pr-3 min-w-[10rem]" />
                {players.map((p, i) => (
                  <th key={p.key} className="pb-3 px-2 min-w-[7rem] align-bottom">
                    <Link to={`/jugador/${encodeURIComponent(p.name)}?source=interno`} className="flex flex-col items-center gap-1 group">
                      <span className="relative">
                        <PlayerPhoto src={photo(p.key)} name={p.name} size="md" rounded="full" />
                        <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full ring-2 ring-white dark:ring-apple-gray-800" style={{ background: SERIES[i] }} />
                      </span>
                      <span className="text-xs font-semibold text-apple-gray-800 dark:text-white text-center leading-tight group-hover:underline">{p.name}</span>
                      <span className="flex items-center gap-1 text-2xs font-normal text-apple-gray-400">
                        <ClassBadge c={p.cls} size="xs" />
                        {(() => { const g = playerGroup(p.rows); return g ? POS_GROUP_LABEL[g].one : '' })()}
                      </span>
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <Row label="Partidos jugados" hint="De API-Football y Sofascore (los de Reserva, de Wyscout)" cells={players.map(p => (matchMinutes.has(p.key) ? String(playIn(matchMinutes.get(p.key), win).played) : '—'))} best={null} />
              <Row label="De titular" cells={players.map(p => (matchMinutes.has(p.key) ? String(playIn(matchMinutes.get(p.key), win).starts) : '—'))} best={null} />
              <Row label="Entrando de suplente" cells={players.map(p => (matchMinutes.has(p.key) ? String(playIn(matchMinutes.get(p.key), win).subs) : '—'))} best={null} />
              <Row label="Minutos" cells={players.map(p => (matchMinutes.has(p.key) ? playIn(matchMinutes.get(p.key), win).minutes.toLocaleString('es-AR') : '—'))} best={null} />
              {metrics.map(m => {
                const vals = totals.map(t => (t.minutes >= min ? m.compute(t) : null))
                const ok = vals.filter((v): v is number => v !== null)
                const target = ok.length >= 2 ? (m.lowerIsBetter ? Math.min(...ok) : Math.max(...ok)) : null
                const best = target === null || ok.every(v => v === target) ? null : vals.findIndex(v => v === target)
                return <Row key={m.key} label={m.label} hint={m.hint} unit={unitSuffix(m).trim()} cells={vals.map(v => fmtMetric(m, v))} best={best} />
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="Cómo evolucionaron"
        subtitle={metric?.hint}
        actions={<MetricSelect label="Métrica" value={metric.key} metrics={METRICS} onChange={setMetricKey} />}
        source={source}
      >
        <MultiLine players={players} metric={metric} />
      </Panel>

      <Panel title="Lo que dicen los datos de cada uno" subtitle="Cada uno comparado con él mismo y con los de su posición en la agencia." source={source}>
        <div className={`grid gap-4 ${players.length >= 3 ? 'lg:grid-cols-3' : ''} sm:grid-cols-2`}>
          {players.map((p, i) => (
            <div key={p.key}>
              <p className="flex items-center gap-2 text-sm font-semibold text-apple-gray-800 dark:text-white mb-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: SERIES[i] }} />{p.name}
              </p>
              <ConclusionList items={playerConclusions(p.rows, allRows)} />
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

function Row({ label, hint, unit, cells, best }: { label: string; hint?: string; unit?: string; cells: string[]; best: number | null }) {
  return (
    <tr className="group">
      <td className="sticky left-0 bg-white dark:bg-apple-gray-800 py-2 pr-3 border-t border-apple-gray-100 dark:border-apple-gray-700/60" title={hint}>
        <span className="text-xs text-apple-gray-700 dark:text-apple-gray-200">{label}</span>
        {unit && <span className="block text-2xs text-apple-gray-400">{unit}</span>}
      </td>
      {cells.map((c, i) => (
        <td key={i} className="py-2 px-2 text-center border-t border-apple-gray-100 dark:border-apple-gray-700/60">
          <span className={`inline-block min-w-[3rem] px-2 py-0.5 rounded-md tabular-nums text-sm ${i === best ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold' : 'text-apple-gray-700 dark:text-apple-gray-200'}`}>{c}</span>
        </td>
      ))}
    </tr>
  )
}

const PAD = { l: 44, r: 16, t: 14, b: 34 }

/** Una línea por jugador, año por año (o mes a mes los últimos 2 años). */
function MultiLine({ players, metric }: { players: Who[]; metric: MetricDef }) {
  const [grouping, setGrouping] = useState<'year' | 'month'>('year')
  const [boxRef, W] = useElementWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const H = W < 480 ? 240 : 300

  const { labels, series } = useMemo(() => {
    const from = monthsAgo(23)
    const per = players.map(p => {
      const ps = groupPeriods(p.rows, grouping).filter(x => grouping === 'year' || x.from >= from)
      return new Map(ps.map(x => [x.key, { v: x.minutes >= (grouping === 'month' ? 90 : 270) ? metric.compute(x) : null, label: x.label, matches: x.matches }]))
    })
    const keys = [...new Set(per.flatMap(m => [...m.keys()]))].sort()
    return {
      labels: keys.map(k => per.find(m => m.has(k))!.get(k)!.label),
      series: per.map(m => keys.map(k => m.get(k)?.v ?? null)),
    }
  }, [players, metric, grouping])

  const vals = series.flat().filter((v): v is number => v !== null)
  const n = labels.length
  let lo = vals.length ? Math.min(...vals) : 0, hi = vals.length ? Math.max(...vals) : 1
  if (metric.unit === '%') { lo = Math.max(0, Math.floor((lo - 5) / 10) * 10); hi = Math.min(100, Math.ceil((hi + 5) / 10) * 10) }
  else { const pad = (hi - lo) * 0.15 || hi * 0.2 || 1; lo = Math.max(lo < 0 ? lo - pad : 0, lo - pad); hi += pad }
  if (lo === hi) hi = lo + 1
  const x = (i: number) => PAD.l + (n === 1 ? 0.5 : i / (n - 1)) * (W - PAD.l - PAD.r)
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b)
  const step = Math.max(1, Math.ceil(n / Math.max(4, Math.floor(W / 64))))

  return (
    <div ref={boxRef}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-2xs text-apple-gray-500 dark:text-apple-gray-400">
          {players.map((p, i) => <span key={p.key} className="inline-flex items-center gap-1.5"><span className="w-4 h-0.5 rounded" style={{ background: SERIES[i] }} />{p.name}</span>)}
        </div>
        <Segmented label="Agrupar por" value={grouping} onChange={setGrouping} options={[{ id: 'year', label: 'Año' }, { id: 'month', label: 'Mes (2 años)' }]} />
      </div>
      {!vals.length ? <p className="h-40 flex items-center justify-center text-sm text-apple-gray-400">Sin minutos suficientes para esta métrica.</p> : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block w-full h-auto select-none" role="img" aria-label={`Evolución de ${metric.label}`}>
            {[0, 0.25, 0.5, 0.75, 1].map(f => {
              const v = lo + f * (hi - lo)
              return (
                <g key={f}>
                  <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="stroke-apple-gray-100 dark:stroke-apple-gray-700/60" />
                  <text x={PAD.l - 8} y={y(v) + 3} textAnchor="end" className="fill-apple-gray-400 text-[10px] tabular-nums">{fmtMetric(metric, v)}</text>
                </g>
              )
            })}
            {labels.map((l, i) => (i % step === 0 || i === n - 1) && <text key={i} x={x(i)} y={H - PAD.b + 16} textAnchor="middle" className="fill-apple-gray-400 text-[10px]">{l}</text>)}
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} className="stroke-apple-gray-300 dark:stroke-apple-gray-600" />}
            {series.map((s, si) => {
              let d = '', pen = false
              s.forEach((v, i) => { if (v === null) { pen = false; return } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `; pen = true })
              return (
                <g key={si}>
                  <path d={d} fill="none" stroke={SERIES[si]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {s.map((v, i) => v !== null && <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 5 : 3.5} fill={SERIES[si]} className="stroke-white dark:stroke-apple-gray-800" strokeWidth={1.5} />)}
                </g>
              )
            })}
            {labels.map((_, i) => (
              <rect key={i} x={x(i) - (W / Math.max(n, 1)) / 2} y={PAD.t} width={W / Math.max(n, 1)} height={H - PAD.t - PAD.b}
                fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(i)} />
            ))}
          </svg>
          {hover !== null && (
            <div className="absolute z-10 pointer-events-none px-3 py-2 rounded-lg bg-apple-gray-900 dark:bg-white text-white dark:text-apple-gray-900 shadow-apple-md text-2xs whitespace-nowrap"
              style={{ left: `${(x(hover) / W) * 100}%`, top: 4, transform: `translateX(${x(hover) > W * 0.6 ? 'calc(-100% - 8px)' : '8px'})` }}>
              <p className="font-semibold text-xs mb-0.5">{labels[hover]}</p>
              {players.map((p, i) => (
                <p key={p.key} className="tabular-nums flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: SERIES[i] }} />{p.name}: <b>{fmtMetric(metric, series[i][hover])}</b>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
