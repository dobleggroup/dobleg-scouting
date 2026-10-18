import { useNavigate } from 'react-router-dom'
import { PlayerPhoto } from '@/components/ui/PlayerPhoto'
import { fmtMetric } from '../metrics'
import type { TrendResult } from '../conclusions'

/** En alza / en baja: últimos 6 meses contra el año anterior. */
export default function TrendList({ trends, photo, limit = 5 }: {
  trends: TrendResult[]
  photo: (key: string) => string | null
  limit?: number
}) {
  const navigate = useNavigate()
  const up = trends.filter(t => t.index > 0.05).sort((a, b) => b.index - a.index).slice(0, limit)
  const down = trends.filter(t => t.index < -0.05).sort((a, b) => a.index - b.index).slice(0, limit)

  const Col = ({ title, list, good }: { title: string; list: TrendResult[]; good: boolean }) => (
    <div className="rounded-apple bg-apple-gray-50 dark:bg-apple-gray-700/30 p-3">
      <p className={`text-xs font-semibold mb-2 ${good ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>{title}</p>
      {list.length === 0 ? <p className="text-2xs text-apple-gray-400 italic">Nadie por ahora</p> : (
        <ul className="space-y-1.5">
          {list.map(t => {
            const d = good ? t.best : t.worst
            return (
              <li key={t.player_key}>
                <button onClick={() => navigate(`/jugador/${encodeURIComponent(t.player_name)}?source=interno`)}
                  className="w-full flex items-center gap-2 text-left rounded-lg px-1.5 py-1 hover:bg-white dark:hover:bg-apple-gray-800 transition-colors">
                  <PlayerPhoto src={photo(t.player_key)} name={t.player_name} size="xs" rounded="full" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-apple-gray-800 dark:text-white truncate">{t.player_name}</span>
                    {d && (
                      <span className="block text-2xs text-apple-gray-500 dark:text-apple-gray-400 truncate">
                        {d.metric.label}: {fmtMetric(d.metric, d.before)} → <span className="font-semibold">{fmtMetric(d.metric, d.now)}</span>
                      </span>
                    )}
                  </span>
                  <span className={`text-xs font-bold tabular-nums ${good ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {good ? '▲' : '▼'} {Math.round(Math.abs(t.index) * 100)}%
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <Col title="En alza" list={up} good />
      <Col title="En baja" list={down} good={false} />
    </div>
  )
}
