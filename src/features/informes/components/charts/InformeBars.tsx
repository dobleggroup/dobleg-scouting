import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer, Cell, LabelList,
} from 'recharts'
import type { MetricStat } from '@/features/informes/types'

interface InformeBarsProps {
  stats: MetricStat[]
  keys: string[]
  contexto?: string
}

const COLOR_HEX: Record<MetricStat['color'], string> = {
  green: '#22C55E',
  amber: '#FBBF24',
  red: '#EF4444',
  neutral: '#9CA3AF',
}

function formatValue(stat: MetricStat): string {
  if (stat.value == null) return '—'
  return stat.def.unit === '%' ? `${stat.value.toFixed(0)}%` : stat.value.toFixed(2)
}

interface BarRow {
  name: string
  pct: number
  real: string
  rankLabel: string
  combinedLabel: string
  color: string
  avg: string
}

interface BarTooltipPayload { name: string; real: string; avg: string; rankLabel: string }

function BarsTooltip({ active, payload, contexto }: { active?: boolean; payload?: Array<{ payload: BarTooltipPayload }>; contexto?: string }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div className="bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 rounded-lg px-3 py-2.5 shadow-lg text-sm">
      <p className="font-semibold text-apple-gray-700 dark:text-apple-gray-200 mb-1.5">{d.name}</p>
      <p className="text-apple-gray-600 dark:text-apple-gray-300">Jugador: <strong>{d.real}</strong> ({d.rankLabel})</p>
      <p className="text-apple-gray-500 dark:text-apple-gray-400">Promedio {contexto || 'del grupo'}: <strong>{d.avg}</strong></p>
    </div>
  )
}

/** Una barra horizontal por métrica: longitud = percentil (0-100), etiqueta = valor real + ranking. */
export default function InformeBars({ stats, keys, contexto }: InformeBarsProps) {
  const rows = keys
    .map(key => stats.find(s => s.def.key === key))
    .filter((s): s is MetricStat => !!s)

  if (rows.length === 0) {
    return (
      <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 italic py-8 text-center">
        Asigná métricas a Barras en el paso 2 para verlas acá.
      </p>
    )
  }

  const data: BarRow[] = rows.map(stat => {
    const real = formatValue(stat)
    const rankLabel = stat.rank != null ? `N°${stat.rank}/${stat.total}` : 's/d'
    return {
      name: stat.def.label,
      pct: stat.percentile ?? 0,
      real,
      rankLabel,
      combinedLabel: `${real}  ·  ${rankLabel}`,
      color: COLOR_HEX[stat.color],
      avg: stat.avg == null ? '—' : (stat.def.unit === '%' ? `${stat.avg.toFixed(0)}%` : stat.avg.toFixed(2)),
    }
  })

  const withComparison = rows.filter(s => s.value != null && s.avg != null)
  const above = withComparison.filter(s => (s.def.higherIsBetter ? s.value! > s.avg! : s.value! < s.avg!)).length
  const below = withComparison.filter(s => (s.def.higherIsBetter ? s.value! < s.avg! : s.value! > s.avg!)).length

  return (
    <div>
      <div style={{ height: Math.max(220, rows.length * 52) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 100, left: 10, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(156,163,175,0.1)" />
            <XAxis type="number" domain={[0, 100]} tick={false} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fontWeight: 500 }} width={150} />
            <ReferenceLine x={50} stroke="rgba(156,163,175,0.5)" strokeDasharray="4 4" />
            <Tooltip cursor={{ fill: 'rgba(0,0,0,0.03)' }} content={<BarsTooltip contexto={contexto} />} />
            <Bar dataKey="pct" radius={[0, 5, 5, 0]} barSize={14}>
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
              <LabelList
                dataKey="combinedLabel"
                position="right"
                style={{ fontSize: 11, fontWeight: 600, fill: 'currentColor' }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-green/10 border border-brand-green/20">
          <span className="text-xl font-black text-brand-green">{above}</span>
          <span className="text-xs text-apple-gray-600 dark:text-apple-gray-400">por encima del promedio</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-700/50 border border-apple-gray-200 dark:border-apple-gray-600">
          <span className="text-xl font-black text-apple-gray-500 dark:text-apple-gray-400">{below}</span>
          <span className="text-xs text-apple-gray-600 dark:text-apple-gray-400">por debajo del promedio</span>
        </div>
      </div>
      <p className="text-xs text-apple-gray-400 dark:text-apple-gray-500 mt-3">
        Barras normalizadas por percentil (0–100). El punteado gris marca el promedio del grupo.
      </p>
    </div>
  )
}
