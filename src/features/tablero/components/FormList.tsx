import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlayerPhoto } from '@/components/ui/PlayerPhoto'
import { AGENCY_PLAYERS } from '@/constants/agencyPlayers'
import { FORM_LENGTH, type FormStrip } from '../tableroData'
import { Segmented, ratingTone, fmtRating, fmtDate } from './Panel'

type View = 'up' | 'down'
const VISIBLE = 6
/** Menos de 0,2 de diferencia es ruido: no se lo muestra como racha. */
const TREND_MIN = 0.2

export default function FormList({ strips, teamName }: { strips: FormStrip[]; teamName: (id: number | null) => string }) {
  const navigate = useNavigate()
  const [view, setView] = useState<View>('up')
  const [expanded, setExpanded] = useState(false)

  const list = useMemo(() => (
    view === 'up'
      ? strips.filter(s => s.trend >= TREND_MIN)
      : strips.filter(s => s.trend <= -TREND_MIN).reverse()
  ), [strips, view])
  const shown = expanded ? list : list.slice(0, VISIBLE)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <Segmented
          label="Tendencia"
          value={view}
          onChange={v => { setView(v); setExpanded(false) }}
          options={[
            { id: 'up', label: `▲ En alza (${strips.filter(s => s.trend >= TREND_MIN).length})` },
            { id: 'down', label: `▼ En baja (${strips.filter(s => s.trend <= -TREND_MIN).length})` },
          ]}
        />
        <span className="text-2xs text-apple-gray-400 dark:text-apple-gray-500">Últimos {FORM_LENGTH} partidos, del más viejo al más nuevo</span>
      </div>

      {list.length === 0 ? (
        <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 text-center py-6">
          {view === 'up' ? 'Nadie viene con una suba marcada.' : 'Nadie viene con una baja marcada.'}
        </p>
      ) : (
        <div className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700/50">
          {shown.map(s => {
            const photo = AGENCY_PLAYERS.find(p => p.fullName === s.fullName)?.image ?? null
            const up = s.trend > 0
            return (
              <div key={s.fullName} className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-2 py-2.5">
                <button
                  onClick={() => navigate(`/jugador/${encodeURIComponent(s.fullName)}?source=interno`)}
                  className="flex items-center gap-2.5 min-w-0 flex-1 sm:flex-none sm:w-48 text-left group"
                >
                  <PlayerPhoto src={photo} name={s.fullName} size="sm" rounded="full" />
                  <span className="text-sm font-medium text-apple-gray-800 dark:text-white truncate group-hover:text-brand-green transition-colors">{s.fullName}</span>
                </button>
                <span className={`sm:order-last text-2xs font-bold tabular-nums rounded-full px-2 py-1 whitespace-nowrap ${
                  up ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                    : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300'
                }`}>
                  {up ? '▲' : '▼'} {Math.abs(s.trend).toFixed(1)}
                </span>
                <div className="flex gap-1 w-full sm:w-auto sm:flex-1" role="list" aria-label={`Últimos partidos de ${s.fullName}`}>
                  {s.last.map((a, i) => {
                    const recent = i >= s.last.length - 3
                    return (
                      <span
                        key={a.fixtureId}
                        role="listitem"
                        title={`${fmtDate(a.date)} · ${a.isHome ? 'vs.' : 'en'} ${teamName(a.rivalId)} · ${a.minutes}' · rating ${fmtRating(a.rating)}`}
                        className={`flex-1 sm:flex-none sm:w-9 h-7 rounded-md flex items-center justify-center text-2xs font-bold tabular-nums ${ratingTone(a.rating)} ${
                          recent ? '' : 'opacity-60'
                        }`}
                      >
                        {fmtRating(a.rating)}
                      </span>
                    )
                  })}
                </div>
                <span className="hidden md:block text-2xs text-apple-gray-400 dark:text-apple-gray-500 tabular-nums whitespace-nowrap w-28 text-right">
                  {s.previousAvg.toFixed(1)} → <span className="font-semibold text-apple-gray-700 dark:text-apple-gray-200">{s.recentAvg.toFixed(1)}</span>
                </span>
              </div>
            )
          })}
        </div>
      )}

      {list.length > VISIBLE && (
        <button onClick={() => setExpanded(e => !e)} className="mt-2 text-xs font-medium text-brand-green hover:underline">
          {expanded ? 'Ver menos' : `Ver los ${list.length}`}
        </button>
      )}
    </div>
  )
}
