import { useMemo, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import type { WyscoutPoint } from '@/services/wyscoutEvolutionService'
import { aggregateByMonth } from '@/services/wyscoutEvolutionService'

export type EvolutionMode = 'weekly' | 'monthly'

interface Props {
  series: WyscoutPoint[]
  unit: '%' | ''
  label: string
  mode?: EvolutionMode
  onModeChange?: (m: EvolutionMode) => void
}

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function shortDate(d: string): string {
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : `${dt.getDate()} ${MONTHS[dt.getMonth()]}`
}

function monthLabel(d: string): string {
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : `${MONTHS[dt.getMonth()]} '${String(dt.getFullYear()).slice(2)}`
}

export default function MetricEvolutionChart({ series, unit, mode: controlledMode, onModeChange }: Props) {
  const [internalMode, setInternalMode] = useState<EvolutionMode>('weekly')
  const mode = controlledMode ?? internalMode
  const setMode = (m: EvolutionMode) => (onModeChange ? onModeChange(m) : setInternalMode(m))

  const data = useMemo(() => {
    const base = mode === 'monthly' ? aggregateByMonth(series) : series.filter(s => s.value !== null)
    return base.map(s => ({
      label: mode === 'monthly' ? monthLabel(s.date) : shortDate(s.date),
      value: s.value as number,
      sub: s.matchLabel,
      comp: mode === 'monthly' ? '' : s.competition,
    }))
  }, [series, mode])

  const avg = useMemo(
    () => (data.length ? Math.round((data.reduce((a, b) => a + b.value, 0) / data.length) * 10) / 10 : null),
    [data],
  )
  const fmt = (v: number) => (unit === '%' ? `${Math.round(v)}%` : (Math.round(v * 100) / 100).toString())

  return (
    <div>
      <div className="flex items-center justify-end mb-2">
        <div className="flex bg-apple-gray-100 dark:bg-white/5 rounded-lg p-0.5">
          {(['weekly', 'monthly'] as EvolutionMode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 text-xs rounded-md transition-all ${
                mode === m
                  ? 'bg-white dark:bg-white/10 text-apple-gray-800 dark:text-white shadow-sm'
                  : 'text-apple-gray-500 dark:text-gray-400 hover:text-apple-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {m === 'weekly' ? 'Semanal' : 'Mensual'}
            </button>
          ))}
        </div>
      </div>

      {data.length === 0 ? (
        <div className="text-center text-apple-gray-400 text-sm py-8">Sin datos para esta métrica</div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
            <defs>
              <linearGradient id="metricEvoGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              domain={unit === '%' ? [0, 100] : ['auto', 'auto']}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null
                const d = payload[0].payload as { value: number; sub: string; comp: string }
                return (
                  <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-xl">
                    <p className="font-bold text-white">{fmt(d.value)}</p>
                    {d.sub && <p className="text-gray-300">{d.sub}</p>}
                    {d.comp && <p className="text-gray-400">{d.comp}</p>}
                  </div>
                )
              }}
            />
            {avg !== null && (
              <ReferenceLine
                y={avg}
                stroke="#6b7280"
                strokeDasharray="4 4"
                label={{ value: `Prom: ${fmt(avg)}`, fill: '#6b7280', fontSize: 10, position: 'right' }}
              />
            )}
            <Area
              type="monotone"
              dataKey="value"
              stroke="#22c55e"
              strokeWidth={2}
              fill="url(#metricEvoGradient)"
              dot={false}
              activeDot={{ r: 4, fill: '#22c55e', stroke: '#fff', strokeWidth: 1 }}
              animationDuration={600}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
