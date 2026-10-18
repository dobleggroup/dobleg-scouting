import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlayerPhoto } from '@/components/ui/PlayerPhoto'
import { AGENCY_PLAYERS } from '@/constants/agencyPlayers'
import type { ActivityDay } from '../tableroData'
import { ratingTone, fmtRating } from './Panel'

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const MONTH = new Intl.DateTimeFormat('es-AR', { month: 'short', timeZone: 'UTC' })
const LONG = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

function level(players: number): number {
  if (players === 0) return 0
  if (players <= 2) return 1
  if (players <= 4) return 2
  if (players <= 7) return 3
  return 4
}

const LEVEL_CLASS = [
  'bg-apple-gray-100 dark:bg-apple-gray-600/40',
  'bg-brand-green/20',
  'bg-brand-green/45',
  'bg-brand-green/70',
  'bg-brand-green',
]

const asDate = (key: string) => new Date(`${key}T12:00:00Z`)
const longDay = (key: string) => { const s = LONG.format(asDate(key)); return s[0].toUpperCase() + s.slice(1) }

export default function ActivityCalendar({ grid, teamName }: {
  grid: (ActivityDay | null)[][]
  teamName: (id: number | null) => string
}) {
  const navigate = useNavigate()
  const scrollRef = useRef<HTMLDivElement>(null)
  const days = useMemo(() => grid.flat().filter((d): d is ActivityDay => d != null), [grid])
  const lastActive = useMemo(() => [...days].reverse().find(d => d.players > 0)?.dayKey ?? null, [days])
  const [selected, setSelected] = useState<string | null>(lastActive)
  const [hover, setHover] = useState<ActivityDay | null>(null)

  useEffect(() => { setSelected(s => s ?? lastActive) }, [lastActive])
  // En el celular la grilla no entra entera: arranca mostrando lo más reciente.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [grid])

  const day = days.find(d => d.dayKey === selected) ?? null
  const totals = useMemo(() => ({
    activeDays: days.filter(d => d.players > 0).length,
    busiest: days.reduce<ActivityDay | null>((best, d) => (!best || d.players > best.players ? d : best), null),
  }), [days])

  const monthLabels = grid.map((col, i) => {
    const first = col.find(d => d != null)
    if (!first) return null
    const prev = grid[i - 1]?.find(d => d != null)
    const m = asDate(first.dayKey).getUTCMonth()
    if (prev && asDate(prev.dayKey).getUTCMonth() === m) return null
    return MONTH.format(asDate(first.dayKey)).replace('.', '')
  })

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-5">
      <div className="min-w-0">
        <div ref={scrollRef} className="overflow-x-auto scrollbar-thin pb-1">
          <div className="inline-flex gap-[4px] relative" onMouseLeave={() => setHover(null)}>
            <div className="flex flex-col gap-[4px] pr-1 pt-[17px]">
              {WEEKDAYS.map((w, i) => (
                <span key={i} className="h-[18px] text-[10px] leading-[18px] text-apple-gray-400 dark:text-apple-gray-500">{i % 2 === 0 ? w : ''}</span>
              ))}
            </div>
            {grid.map((col, ci) => (
              <div key={ci} className="flex flex-col gap-[4px]">
                <span className="h-[13px] text-[9px] text-apple-gray-400 dark:text-apple-gray-500 whitespace-nowrap">{monthLabels[ci] ?? ''}</span>
                {col.map((d, di) => d == null ? (
                  <span key={di} className="w-[18px] h-[18px]" />
                ) : (
                  <button
                    key={di}
                    type="button"
                    onClick={() => setSelected(d.dayKey)}
                    onMouseEnter={() => setHover(d)}
                    onFocus={() => setHover(d)}
                    onBlur={() => setHover(null)}
                    aria-label={`${LONG.format(asDate(d.dayKey))}: ${d.players} jugadores con minutos`}
                    aria-pressed={selected === d.dayKey}
                    className={`w-[18px] h-[18px] rounded-[3px] transition-transform hover:scale-125 ${LEVEL_CLASS[level(d.players)]} ${
                      selected === d.dayKey ? 'ring-2 ring-apple-gray-900 dark:ring-white ring-offset-1 ring-offset-white dark:ring-offset-apple-gray-800' : ''
                    }`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
          <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 min-h-[16px]">
            {hover ? (
              <><span className="font-semibold text-apple-gray-700 dark:text-apple-gray-200">{longDay(hover.dayKey)}</span> · {hover.players === 0 ? 'nadie jugó' : `${hover.players} ${hover.players === 1 ? 'jugador' : 'jugadores'} en cancha`}</>
            ) : (
              <>{totals.activeDays} días con jugadores en cancha{totals.busiest && totals.busiest.players > 0 && <> · el día más cargado fue el {LONG.format(asDate(totals.busiest.dayKey))} ({totals.busiest.players})</>}</>
            )}
          </p>
          <div className="flex items-center gap-1.5 text-[10px] text-apple-gray-400 dark:text-apple-gray-500" aria-hidden>
            Menos
            {LEVEL_CLASS.map((c, i) => <span key={i} className={`w-[11px] h-[11px] rounded-[3px] ${c}`} />)}
            Más
          </div>
        </div>
      </div>

      <div className="bg-apple-gray-50 dark:bg-apple-gray-700/30 rounded-apple p-4 min-h-[180px]">
        {!day ? (
          <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 text-center py-10">Tocá un día para ver quién jugó.</p>
        ) : (
          <>
            <p className="text-sm font-semibold text-apple-gray-800 dark:text-white">{longDay(day.dayKey)}</p>
            <p className="text-2xs text-apple-gray-400 dark:text-apple-gray-500 mb-3">
              {day.players === 0 ? 'Ningún jugador Doble G sumó minutos' : `${day.players} ${day.players === 1 ? 'jugador sumó' : 'jugadores sumaron'} minutos`}
            </p>
            <div className="space-y-1 max-h-[260px] overflow-y-auto scrollbar-thin -mx-1 px-1">
              {day.apps.map(a => {
                const photo = AGENCY_PLAYERS.find(p => p.fullName === a.fullName)?.image ?? null
                const result = a.goalsFor != null && a.goalsAgainst != null ? `${a.goalsFor}-${a.goalsAgainst}` : null
                return (
                  <button
                    key={`${a.fullName}-${a.fixtureId}`}
                    onClick={() => navigate(`/jugador/${encodeURIComponent(a.fullName)}?source=interno`)}
                    className="w-full flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-white dark:hover:bg-apple-gray-700/60 transition-colors text-left"
                  >
                    <PlayerPhoto src={photo} name={a.fullName} size="sm" rounded="full" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-apple-gray-800 dark:text-white truncate">{a.fullName}</p>
                      <p className="text-2xs text-apple-gray-400 dark:text-apple-gray-500 truncate">
                        {a.isHome ? 'vs.' : 'en cancha de'} {teamName(a.rivalId)}{result && ` · ${result}`} · {a.minutes}'
                        {a.goals > 0 && ` · ${a.goals} ${a.goals === 1 ? 'gol' : 'goles'}`}
                        {a.assists > 0 && ` · ${a.assists} asist.`}
                      </p>
                    </div>
                    <span className={`text-2xs font-bold tabular-nums rounded-md px-1.5 py-0.5 ${ratingTone(a.rating)}`}>{fmtRating(a.rating)}</span>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
