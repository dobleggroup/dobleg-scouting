import { useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import type { WyscoutPoint } from '@/services/wyscoutEvolutionService'

interface Props { series: WyscoutPoint[]; unit: '%' | ''; label: string }

function shortDate(d: string): string {
  const dt = new Date(d)
  const m = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return isNaN(dt.getTime()) ? d : `${dt.getDate()} ${m[dt.getMonth()]}`
}

export default function MetricEvolutionChart({ series, unit, label }: Props) {
  const data = useMemo(
    () => series.filter(s => s.value !== null).map(s => ({
      label: shortDate(s.date), value: s.value as number, match: s.matchLabel, comp: s.competition,
    })),
    [series],
  )
  const avg = useMemo(
    () => data.length ? Math.round((data.reduce((a, b) => a + b.value, 0) / data.length) * 10) / 10 : null,
    [data],
  )
  if (data.length === 0) {
    return <div className="text-center text-apple-gray-400 text-sm py-8">Sin datos de Wyscout para esta métrica</div>
  }
  const fmt = (v: number) => unit === '%' ? `${Math.round(v)}%` : (Math.round(v * 100) / 100).toString()
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
        <defs>
          <linearGradient id="wyscoutGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false}
               domain={unit === '%' ? [0, 100] : ['auto', 'auto']} />
        <Tooltip content={({ active, payload }) => {
          if (!active || !payload?.[0]) return null
          const d = payload[0].payload as { value: number; match: string; comp: string }
          return (
            <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-xl">
              <p className="font-bold text-white">{fmt(d.value)}</p>
              <p className="text-gray-300">{d.match}</p>
              <p className="text-gray-400">{d.comp}</p>
            </div>
          )
        }} />
        {avg !== null && (
          <ReferenceLine y={avg} stroke="#6b7280" strokeDasharray="4 4"
            label={{ value: `Prom: ${fmt(avg)}`, fill: '#6b7280', fontSize: 10, position: 'right' }} />
        )}
        <Area type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={2}
          fill="url(#wyscoutGradient)" dot={false}
          activeDot={{ r: 4, fill: '#22c55e', stroke: '#fff', strokeWidth: 1 }} animationDuration={600} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
