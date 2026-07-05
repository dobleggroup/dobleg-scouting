import type { MetricStat } from '@/features/informes/types'

function formatValue(stat: MetricStat): string {
  if (stat.value == null) return '—'
  const v = stat.def.unit === '%' ? stat.value.toFixed(0) : stat.value.toFixed(2)
  return stat.def.unit === '%' ? `${v}%` : v
}

function colorClass(color: MetricStat['color']): string {
  switch (color) {
    case 'green': return 'text-brand-green'
    case 'amber': return 'text-amber-500 dark:text-amber-400'
    case 'red': return 'text-red-500'
    default: return 'text-apple-gray-400'
  }
}

interface InformeNumberCardProps {
  stat: MetricStat
}

/** Card compacta: valor grande + ranking + label de la métrica. */
export default function InformeNumberCard({ stat }: InformeNumberCardProps) {
  return (
    <div className="rounded-2xl border border-apple-gray-200 dark:border-apple-gray-800 bg-white dark:bg-apple-gray-900 p-4 flex flex-col items-center text-center gap-1">
      <span className={`text-3xl font-black tabular-nums ${colorClass(stat.color)}`}>
        {formatValue(stat)}
      </span>
      <span className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400">
        {stat.rank != null ? `N°${stat.rank} de ${stat.total}` : 'Sin datos'}
      </span>
      <span className="text-sm text-apple-gray-700 dark:text-apple-gray-200 leading-tight">{stat.def.label}</span>
    </div>
  )
}
