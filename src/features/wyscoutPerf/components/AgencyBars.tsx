import { useNavigate } from 'react-router-dom'
import { PlayerPhoto } from '@/components/ui/PlayerPhoto'
import { fmtMetric, type MetricDef } from '../metrics'
import type { PlayerValue } from '../analysis'

/**
 * Barras horizontales: un renglón por jugador de la agencia, ordenados del
 * mejor al peor en la métrica. El elegido queda resaltado.
 */
export default function AgencyBars({ values, metric, highlight, photo, limit = 14 }: {
  values: PlayerValue[]
  metric: MetricDef
  highlight?: string | null
  photo: (key: string) => string | null
  limit?: number
}) {
  const navigate = useNavigate()
  if (!values.length) return <p className="text-sm text-apple-gray-400">Nadie tiene minutos suficientes en este período.</p>

  // Si el elegido queda afuera del top, se agrega al final para que siempre se vea.
  let shown = values.slice(0, limit)
  const hiIdx = highlight ? values.findIndex(v => v.key === highlight) : -1
  if (hiIdx >= limit) shown = [...shown, values[hiIdx]]

  const max = Math.max(...values.map(v => Math.abs(v.value)), metric.unit === '%' ? 100 : 0.0001)
  const avg = values.reduce((s, v) => s + v.value, 0) / values.length

  return (
    <div>
      <div className="space-y-1.5">
        {shown.map(v => {
          const pos = values.indexOf(v) + 1
          const me = v.key === highlight
          return (
            <button
              key={v.key}
              onClick={() => navigate(`/jugador/${encodeURIComponent(v.name)}?source=interno`)}
              className={`w-full grid grid-cols-[1.25rem_minmax(0,9rem)_1fr_3.25rem] sm:grid-cols-[1.5rem_minmax(0,12rem)_1fr_3.5rem] items-center gap-2 px-2 py-1 rounded-lg text-left transition-colors ${me ? 'bg-brand-green/10 ring-1 ring-brand-green/40' : 'hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/40'}`}
            >
              <span className="text-2xs tabular-nums text-apple-gray-400 text-right">{pos}</span>
              <span className="flex items-center gap-1.5 min-w-0">
                <PlayerPhoto src={photo(v.key)} name={v.name} size="xs" rounded="full" />
                <span className={`text-xs truncate ${me ? 'font-semibold text-apple-gray-900 dark:text-white' : 'text-apple-gray-700 dark:text-apple-gray-200'}`}>{v.name}</span>
              </span>
              <span className="h-2.5 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700/60 overflow-hidden">
                <span
                  className={`block h-full rounded-full ${me ? 'bg-brand-green' : 'bg-apple-gray-400/70 dark:bg-apple-gray-500'}`}
                  style={{ width: `${Math.max(2, (Math.abs(v.value) / max) * 100)}%` }}
                />
              </span>
              <span className="text-xs font-semibold tabular-nums text-right text-apple-gray-800 dark:text-white">{fmtMetric(metric, v.value)}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-3 text-2xs text-apple-gray-400 dark:text-apple-gray-500">
        Promedio de la lista: <span className="font-semibold tabular-nums">{fmtMetric(metric, avg)}</span>
        {metric.unit === '%' ? '' : ' por partido'}{metric.lowerIsBetter ? ' · en esta métrica, menos es mejor' : ''} · {values.length} jugadores con minutos suficientes
      </p>
    </div>
  )
}
