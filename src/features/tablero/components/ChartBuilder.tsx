import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import CopyChartButton from '@/components/ui/CopyChartButton'
import {
  METRICS, GROUPS, RANGES, PER90_MIN_MINUTES, RATING_MIN_MATCHES,
  runQuery, metricDef, canPer90,
  type Appearance, type QueryContext, type QuerySpec, type MetricId, type GroupBy, type RangeId, type QueryRow,
} from '../tableroData'
import { fmtDate } from './Panel'

export const POSITION_PLURAL: Record<string, string> = {
  Todos: 'todos los jugadores',
  Arquero: 'los arqueros',
  'Defensor Central': 'los defensores centrales',
  Lateral: 'los laterales',
  'Volante Central': 'los volantes centrales',
  'Volante Interno': 'los volantes internos',
  Extremo: 'los extremos',
  Delantero: 'los delanteros',
}

const DEFAULT_SPEC: QuerySpec = { metric: 'contributions', groupBy: 'player', range: '6m', position: 'Todos', per90: false }

const QUICK: { q: string; spec: QuerySpec }[] = [
  { q: '¿Quién hizo más goles en el año?', spec: { metric: 'goals', groupBy: 'player', range: '1y', position: 'Todos', per90: false } },
  { q: '¿En qué liga rinden mejor los nuestros?', spec: { metric: 'rating', groupBy: 'league', range: '6m', position: 'Todos', per90: false } },
  { q: '¿Cómo vienen los goles mes a mes?', spec: { metric: 'contributions', groupBy: 'month', range: '1y', position: 'Todos', per90: false } },
  { q: '¿Qué atacante convierte más cada 90 minutos?', spec: { metric: 'goals', groupBy: 'player', range: '1y', position: 'Delantero', per90: true } },
  { q: '¿Quién recupera más pelotas?', spec: { metric: 'recoveries', groupBy: 'player', range: '90d', position: 'Todos', per90: true } },
  { q: '¿Quién sumó más minutos este mes?', spec: { metric: 'minutes', groupBy: 'player', range: '30d', position: 'Todos', per90: false } },
]

const VISIBLE_BARS = 12

function readSpec(params: URLSearchParams): QuerySpec {
  const metric = params.get('m') as MetricId | null
  const groupBy = params.get('g') as GroupBy | null
  const range = params.get('r') as RangeId | null
  const position = params.get('p')
  return {
    metric: METRICS.some(m => m.id === metric) ? metric! : DEFAULT_SPEC.metric,
    groupBy: GROUPS.some(g => g.id === groupBy) ? groupBy! : DEFAULT_SPEC.groupBy,
    range: RANGES.some(r => r.id === range) ? range! : DEFAULT_SPEC.range,
    position: position && POSITION_PLURAL[position] ? position : 'Todos',
    per90: params.get('n') === '1',
  }
}

function sameSpec(a: QuerySpec, b: QuerySpec): boolean {
  return a.metric === b.metric && a.groupBy === b.groupBy && a.range === b.range && a.position === b.position && a.per90 === b.per90
}

/** Un `<select>` vestido de palabra resaltada dentro de la oración. */
function Word<T extends string>({ value, onChange, options, label }: {
  value: T
  onChange: (v: T) => void
  options: { id: T; label: string }[]
  label: string
}) {
  return (
    <span className="relative inline-flex items-center align-baseline">
      <select
        aria-label={label}
        value={value}
        onChange={e => onChange(e.target.value as T)}
        className="appearance-none cursor-pointer bg-brand-green/10 hover:bg-brand-green/20 text-brand-green font-semibold rounded-lg pl-2.5 pr-7 py-0.5 border-0 border-b-2 border-brand-green/40 focus:outline-none focus:ring-2 focus:ring-brand-green/40 transition-colors"
      >
        {options.map(o => <option key={o.id} value={o.id} className="text-apple-gray-900 bg-white">{o.label}</option>)}
      </select>
      <svg className="pointer-events-none absolute right-2 w-3 h-3 text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
      </svg>
    </span>
  )
}

function formatValue(v: number, decimals: number): string {
  return decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString('es-AR')
}

function BarRows({ rows, decimals, onPick, unit }: { rows: QueryRow[]; decimals: number; onPick?: (r: QueryRow) => void; unit: string }) {
  const max = Math.max(...rows.map(r => r.value), 0) || 1
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <button
          key={r.key}
          onClick={() => onPick?.(r)}
          disabled={!onPick}
          title={`${r.label}: ${formatValue(r.value, decimals)}${unit} · ${r.matches} partidos · ${r.minutes.toLocaleString('es-AR')}'`}
          className="w-full grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_auto] items-center gap-3 text-left group disabled:cursor-default"
        >
          <span className="text-xs text-apple-gray-700 dark:text-apple-gray-200 truncate group-enabled:group-hover:text-brand-green transition-colors">
            <span className="text-apple-gray-400 dark:text-apple-gray-500 tabular-nums mr-1.5">{i + 1}</span>{r.label}
          </span>
          <span className="h-5 rounded-r-[4px] bg-apple-gray-100 dark:bg-apple-gray-700/40 overflow-hidden">
            <span
              className={`block h-full rounded-r-[4px] transition-all duration-500 ${i === 0 ? 'bg-brand-green' : 'bg-brand-green/55 group-hover:bg-brand-green/80'}`}
              style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }}
            />
          </span>
          <span className="text-xs font-bold tabular-nums text-apple-gray-800 dark:text-white min-w-[3rem] text-right">{formatValue(r.value, decimals)}</span>
        </button>
      ))}
    </div>
  )
}

function MonthColumns({ rows, decimals, unit }: { rows: QueryRow[]; decimals: number; unit: string }) {
  const [hover, setHover] = useState<string | null>(null)
  const max = Math.max(...rows.map(r => r.value), 0) || 1
  const isAvg = decimals > 0
  const min = isAvg ? Math.max(0, Math.min(...rows.map(r => r.value)) - 0.4) : 0
  return (
    <div className="flex items-end gap-1.5 sm:gap-2 h-56 pt-6" onMouseLeave={() => setHover(null)}>
      {rows.map(r => {
        const h = ((r.value - min) / ((max - min) || 1)) * 100
        const active = hover === r.key
        return (
          <div key={r.key} className="flex-1 min-w-0 h-full flex flex-col items-center justify-end gap-1.5 relative" onMouseEnter={() => setHover(r.key)}>
            <span className={`text-2xs font-bold tabular-nums transition-colors ${active ? 'text-apple-gray-900 dark:text-white' : 'text-apple-gray-500 dark:text-apple-gray-400'}`}>
              {formatValue(r.value, decimals)}
            </span>
            <span
              className={`w-full max-w-[44px] rounded-t-[4px] transition-all duration-500 ${active ? 'bg-brand-green' : 'bg-brand-green/60'}`}
              style={{ height: `${Math.max(2, h * 0.8)}%` }}
            />
            <span className="text-[10px] text-apple-gray-400 dark:text-apple-gray-500 truncate w-full text-center">{r.label}</span>
            {active && (
              <div className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full px-2 py-1 rounded-md bg-apple-gray-900 dark:bg-white text-white dark:text-apple-gray-900 text-2xs whitespace-nowrap shadow-apple-md pointer-events-none z-10">
                {r.label}: {formatValue(r.value, decimals)}{unit} · {r.matches} partidos
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function ChartBuilder({ apps, ctx, now, positions }: {
  apps: Appearance[]
  ctx: QueryContext
  now: number
  positions: string[]
}) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const spec = readSpec(params)
  const [expanded, setExpanded] = useState(false)

  const update = (patch: Partial<QuerySpec>) => {
    const next = { ...spec, ...patch }
    if (!canPer90(next)) next.per90 = false
    const p = new URLSearchParams(params)
    p.set('m', next.metric); p.set('g', next.groupBy); p.set('r', next.range); p.set('p', next.position)
    if (next.per90) p.set('n', '1'); else p.delete('n')
    setParams(p, { replace: true })
    setExpanded(false)
  }

  const result = useMemo(() => runQuery(spec, apps, ctx, now), [spec.metric, spec.groupBy, spec.range, spec.position, spec.per90, apps, ctx, now]) // eslint-disable-line react-hooks/exhaustive-deps
  const metric = metricDef(spec.metric)
  const per90 = spec.per90 && canPer90(spec)
  const decimals = per90 ? 2 : metric.decimals
  const unit = metric.id === 'minutes' ? "'" : ''
  const range = RANGES.find(r => r.id === spec.range)!
  const group = GROUPS.find(g => g.id === spec.groupBy)!
  const rows = spec.groupBy === 'month' || expanded ? result.rows : result.rows.slice(0, VISIBLE_BARS)

  const title = `${metric.label}${per90 ? ' cada 90 minutos' : ''} — ${POSITION_PLURAL[spec.position]}, ${range.label}, ${group.label}`
  const how = metric.kind === 'avg'
    ? `Promediamos ${metric.phrase}${spec.groupBy === 'player' ? ` (sólo quien tiene al menos ${RATING_MIN_MATCHES} partidos con puntaje)` : ''}`
    : per90
      ? `Sumamos ${metric.phrase}, lo dividimos por los minutos jugados y lo llevamos a 90 minutos (sólo quien jugó al menos ${PER90_MIN_MINUTES}')`
      : `Sumamos ${metric.phrase}`

  const positionOptions = ['Todos', ...positions].map(p => ({ id: p, label: POSITION_PLURAL[p] ?? p }))

  return (
    <div>
      {/* Preguntas rápidas */}
      <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1 -mx-1 px-1 mb-4">
        {QUICK.map(item => {
          const active = sameSpec(item.spec, spec)
          return (
            <button
              key={item.q}
              onClick={() => update(item.spec)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                active
                  ? 'bg-brand-green text-apple-gray-900 border-brand-green'
                  : 'bg-white dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-300 border-apple-gray-200 dark:border-apple-gray-700 hover:border-brand-green/60'
              }`}
            >
              {item.q}
            </button>
          )
        })}
      </div>

      {/* La pregunta como oración: cada palabra verde se puede cambiar */}
      <div className="rounded-apple bg-apple-gray-50 dark:bg-apple-gray-700/30 p-4 mb-5">
        <p className="text-base sm:text-lg leading-[2.2] text-apple-gray-700 dark:text-apple-gray-200">
          Mostrame{' '}
          <Word label="Dato" value={spec.metric} onChange={m => update({ metric: m })} options={METRICS.map(m => ({ id: m.id, label: m.label.toLowerCase() }))} />{' '}
          de{' '}
          <Word label="Jugadores" value={spec.position} onChange={p => update({ position: p })} options={positionOptions} />{' '}
          en{' '}
          <Word label="Período" value={spec.range} onChange={r => update({ range: r })} options={RANGES.map(r => ({ id: r.id, label: r.label }))} />,{' '}
          <Word label="Agrupar" value={spec.groupBy} onChange={g => update({ groupBy: g })} options={GROUPS.map(g => ({ id: g.id, label: g.label }))} />
        </p>
        {canPer90(spec) && (
          <label className="inline-flex items-center gap-2 mt-2 text-xs text-apple-gray-500 dark:text-apple-gray-400 cursor-pointer select-none">
            <input type="checkbox" checked={spec.per90} onChange={e => update({ per90: e.target.checked })} />
            Contar cada 90 minutos (para comparar a quien juega poco con quien juega todo)
          </label>
        )}
      </div>

      <div id="tablero-grafico" className="bg-white dark:bg-apple-gray-800 rounded-apple">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-apple-gray-800 dark:text-white">{title}</p>
            <p className="text-2xs text-apple-gray-400 dark:text-apple-gray-500 mt-0.5">
              {result.matches} partidos de {result.players} jugadores Doble G · {fmtDate(new Date(result.from).toISOString())} al {fmtDate(new Date(result.to).toISOString())}
            </p>
          </div>
          <div className="flex-shrink-0"><CopyChartButton targetId="tablero-grafico" filename="tablero-doble-g" /></div>
        </div>

        {result.rows.length === 0 ? (
          <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 text-center py-10">
            No hay datos para esta pregunta. Probá con otro período o con todos los jugadores.
          </p>
        ) : spec.groupBy === 'month' ? (
          <MonthColumns rows={rows} decimals={decimals} unit={unit} />
        ) : (
          <BarRows
            rows={rows}
            decimals={decimals}
            unit={unit}
            onPick={spec.groupBy === 'player' ? r => navigate(`/jugador/${encodeURIComponent(r.key)}?source=interno`) : undefined}
          />
        )}
      </div>

      {spec.groupBy !== 'month' && result.rows.length > VISIBLE_BARS && (
        <button onClick={() => setExpanded(e => !e)} className="mt-3 text-xs font-medium text-brand-green hover:underline">
          {expanded ? 'Ver menos' : `Ver los ${result.rows.length}`}
        </button>
      )}

      <div className="mt-4 flex gap-2.5 items-start text-xs leading-relaxed text-apple-gray-500 dark:text-apple-gray-400 bg-apple-gray-50 dark:bg-apple-gray-700/30 rounded-apple p-3">
        <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p>
          <span className="font-semibold text-apple-gray-700 dark:text-apple-gray-300">Cómo se armó este gráfico:</span>{' '}
          tomamos los {result.matches} partidos en los que {spec.position === 'Todos' ? 'los jugadores' : POSITION_PLURAL[spec.position]} de Doble G sumaron minutos
          entre el {fmtDate(new Date(result.from).toISOString())} y hoy. {how} y {spec.groupBy === 'month' ? 'lo separamos por mes' : `lo ordenamos ${group.label}`}.
          {per90 && result.droppedLowMinutes > 0 && ` Quedaron afuera ${result.droppedLowMinutes} por jugar menos de ${PER90_MIN_MINUTES} minutos.`}
          {' '}Los datos son de las estadísticas públicas de cada partido (API-Football y Sofascore) y se actualizan solos.
          {' '}Este gráfico tiene su propio link: copiá la dirección de la página para mandarlo tal cual.
        </p>
      </div>
    </div>
  )
}
