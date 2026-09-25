// src/features/coaches/components/summary/SquadTableWidget.tsx
// Todos los jugadores del archivo con las columnas principales. Un clic en el
// encabezado ordena por esa columna (otro clic invierte el orden).
import { useMemo, useState } from 'react'
import WidgetCard from './WidgetCard'
import { metricValue, type AnyMetric } from '@/features/coaches/wyscoutSquad/squadMetrics'
import { FULL_TABLE_COLUMNS, formatMetric } from '@/features/coaches/wyscoutSquad/widgetDefs'
import type { SquadPlayer } from '@/features/coaches/wyscoutSquad/wyscoutSquadTypes'

type SortKey = AnyMetric | 'name'

export default function SquadTableWidget({ players, teamMatches, minMinutes }: {
  players: SquadPlayer[]
  teamMatches: number
  minMinutes: number
}) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'minutes', desc: true })

  const rows = useMemo(() => {
    const list = [...players]
    list.sort((a, b) => {
      if (sort.key === 'name') return a.name.localeCompare(b.name, 'es') * (sort.desc ? -1 : 1)
      const va = metricValue(a, sort.key, teamMatches)
      const vb = metricValue(b, sort.key, teamMatches)
      if (va === null && vb === null) return a.name.localeCompare(b.name, 'es')
      if (va === null) return 1
      if (vb === null) return -1
      return (sort.desc ? vb - va : va - vb) || a.name.localeCompare(b.name, 'es')
    })
    return list
  }, [players, sort, teamMatches])

  const toggle = (key: SortKey) =>
    setSort(prev => (prev.key === key ? { key, desc: !prev.desc } : { key, desc: key !== 'name' }))

  const arrow = (key: SortKey) => (sort.key === key ? (sort.desc ? ' ↓' : ' ↑') : '')

  return (
    <WidgetCard
      title="Todos los jugadores"
      description={`Tocá el nombre de una columna para ordenar. Los valores cada 90 minutos de quienes jugaron menos de ${minMinutes} minutos aparecen en gris.`}
    >
      <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-wide text-apple-gray-400">
              <th className="sticky left-0 bg-white dark:bg-apple-gray-800 text-left pb-2 pr-3">
                <button type="button" onClick={() => toggle('name')} className="uppercase hover:text-brand-green">Jugador{arrow('name')}</button>
              </th>
              {FULL_TABLE_COLUMNS.map(c => (
                <th key={c.key} className="text-right pb-2 pl-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => toggle(c.key)}
                    className={`uppercase hover:text-brand-green ${sort.key === c.key ? 'text-brand-green' : ''}`}
                  >
                    {c.label}{arrow(c.key)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(p => {
              const underMin = (p.stats.minutes ?? 0) < minMinutes
              return (
                <tr key={p.name} className="border-t border-apple-gray-100 dark:border-apple-gray-700/50">
                  <td className="sticky left-0 bg-white dark:bg-apple-gray-800 py-2 pr-3 font-medium text-apple-gray-800 dark:text-white whitespace-nowrap">
                    {p.name}
                    {p.positions[0] && <span className="ml-1.5 text-[10px] font-semibold text-apple-gray-400">{p.positions[0]}</span>}
                  </td>
                  {FULL_TABLE_COLUMNS.map(c => (
                    <td
                      key={c.key}
                      className={`py-2 pl-3 text-right tabular-nums whitespace-nowrap ${
                        c.perMinute && underMin ? 'text-apple-gray-300 dark:text-apple-gray-600' : 'text-apple-gray-600 dark:text-apple-gray-300'
                      }`}
                    >
                      {formatMetric(metricValue(p, c.key, teamMatches), c.format)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </WidgetCard>
  )
}
