// src/features/coaches/components/summary/RankingWidget.tsx
// Ranking de un widget de jugadores: top 5 con barra por la metrica principal y el
// resto de las columnas al lado. "Ver todos" despliega la lista completa.
import { useMemo, useState } from 'react'
import WidgetCard, { WidgetMessage } from './WidgetCard'
import { metricValue, rankBy } from '@/features/coaches/wyscoutSquad/squadMetrics'
import { formatMetric, type RankingWidgetDef } from '@/features/coaches/wyscoutSquad/widgetDefs'
import type { SquadPlayer } from '@/features/coaches/wyscoutSquad/wyscoutSquadTypes'

const TOP = 5

export default function RankingWidget({ def, players, teamMatches, minMinutes }: {
  def: RankingWidgetDef
  players: SquadPlayer[]
  teamMatches: number
  minMinutes: number
}) {
  const [showAll, setShowAll] = useState(false)
  const [primary, ...rest] = def.columns
  const rows = useMemo(
    () => rankBy(players, primary.key, { teamMatches, minMinutes, perMinuteMetric: primary.perMinute }),
    [players, primary, teamMatches, minMinutes],
  )
  const byName = useMemo(() => new Map(players.map(p => [p.name, p])), [players])
  const max = Math.max(...rows.map(r => Math.abs(r.value)), 0)
  const visible = showAll ? rows : rows.slice(0, TOP)

  return (
    <WidgetCard
      title={def.title}
      description={def.description}
      action={rows.length > TOP ? (
        <button
          type="button"
          onClick={() => setShowAll(v => !v)}
          className="text-xs font-medium text-brand-green hover:text-emerald-600 transition-colors min-h-[32px]"
        >
          {showAll ? 'Ver menos' : `Ver todos (${rows.length})`}
        </button>
      ) : undefined}
    >
      {rows.length === 0 ? (
        <WidgetMessage>Ningún jugador llega al mínimo de minutos elegido.</WidgetMessage>
      ) : (
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wide text-apple-gray-400">
                <th className="text-left font-semibold pb-2 w-6">#</th>
                <th className="text-left font-semibold pb-2">Jugador</th>
                <th className="text-right font-semibold pb-2 pl-3 whitespace-nowrap text-brand-green">{primary.label}</th>
                {rest.map(c => (
                  <th key={c.key} className="text-right font-semibold pb-2 pl-3 whitespace-nowrap hidden sm:table-cell">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => {
                const p = byName.get(r.name)!
                const underMin = (p.stats.minutes ?? 0) < minMinutes
                return (
                  <tr key={r.name} className="border-t border-apple-gray-100 dark:border-apple-gray-700/50">
                    <td className="py-2 text-xs tabular-nums text-apple-gray-400">{i + 1}</td>
                    <td className="py-2 pr-2 min-w-[140px]">
                      <p className="font-medium text-apple-gray-800 dark:text-white truncate">{r.name}</p>
                      <div className="mt-1 h-1.5 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700/60 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${r.value < 0 ? 'bg-brand-red/70' : 'bg-brand-green'}`}
                          style={{ width: `${max > 0 ? (Math.abs(r.value) / max) * 100 : 0}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-2 pl-3 text-right font-bold tabular-nums text-apple-gray-800 dark:text-white whitespace-nowrap">
                      {formatMetric(r.value, primary.format)}
                    </td>
                    {rest.map(c => (
                      <td key={c.key} className="py-2 pl-3 text-right tabular-nums text-apple-gray-500 dark:text-apple-gray-400 whitespace-nowrap hidden sm:table-cell">
                        {c.perMinute && underMin ? '—' : formatMetric(metricValue(p, c.key, teamMatches), c.format)}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </WidgetCard>
  )
}
