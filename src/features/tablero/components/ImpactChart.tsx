import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TeamImpact } from '../tableroInsights'

const VISIBLE = 8
const pct = (ppg: number) => `${(ppg / 3) * 100}%`

/**
 * Pesa con mancuernas: por jugador, puntos por partido de su club sin él
 * (gris) y con él (verde), en una escala de 0 a 3. La línea que los une es
 * la diferencia. Nombre arriba y escala abajo a todo el ancho, para que en el
 * celular la escala no quede apretada.
 */
export default function ImpactChart({ items, teamName }: { items: TeamImpact[]; teamName: (id: number) => string }) {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? items : items.slice(0, VISIBLE)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-2xs text-apple-gray-500 dark:text-apple-gray-400">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-brand-green" /> Con él en cancha (45' o más)</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-apple-gray-400 dark:bg-apple-gray-500" /> Sin él</span>
      </div>

      <div className="relative h-4 mb-1 text-[10px] text-apple-gray-400 dark:text-apple-gray-500 mx-1.5">
        {[0, 1, 2, 3].map(v => (
          <span key={v} className={`absolute whitespace-nowrap ${v === 0 ? '' : v === 3 ? '-translate-x-full' : '-translate-x-1/2'}`} style={{ left: pct(v) }}>
            {v === 3 ? '3 pts por partido' : v}
          </span>
        ))}
      </div>

      <div className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700/50">
        {shown.map(it => {
          const lo = Math.min(it.withPpg, it.withoutPpg)
          const hi = Math.max(it.withPpg, it.withoutPpg)
          const better = it.diff >= 0
          return (
            <button
              key={it.fullName}
              onClick={() => navigate(`/jugador/${encodeURIComponent(it.fullName)}?source=interno`)}
              title={`Con él: ${it.withPpg.toFixed(2)} pts por partido (${it.withWins} ganados de ${it.withMatches}) · Sin él: ${it.withoutPpg.toFixed(2)} (${it.withoutWins} de ${it.withoutMatches})`}
              className="w-full text-left py-2 group"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-xs font-medium text-apple-gray-800 dark:text-white truncate group-hover:text-brand-green transition-colors">
                  {it.fullName} <span className="font-normal text-apple-gray-400 dark:text-apple-gray-500">· {teamName(it.teamId)}</span>
                </p>
                <span className={`text-xs font-bold tabular-nums flex-shrink-0 ${
                  Math.abs(it.diff) < 0.05 ? 'text-apple-gray-400' : better ? 'text-emerald-700 dark:text-emerald-400' : 'text-apple-gray-500 dark:text-apple-gray-400'
                }`}>
                  {it.diff > 0.005 ? '+' : it.diff < -0.005 ? '−' : ''}{Math.abs(it.diff).toFixed(2)}
                </span>
              </div>
              <div className="relative h-5 mt-1 mx-1.5">
                {[0, 1, 2, 3].map(v => (
                  <span key={v} className="absolute top-0 bottom-0 w-px bg-apple-gray-100 dark:bg-apple-gray-700/60" style={{ left: pct(v) }} />
                ))}
                <span
                  className={`absolute top-1/2 -translate-y-1/2 h-[3px] rounded-full ${better ? 'bg-brand-green/40' : 'bg-apple-gray-300 dark:bg-apple-gray-600'}`}
                  style={{ left: pct(lo), width: `calc(${pct(hi)} - ${pct(lo)})` }}
                />
                <span
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-apple-gray-400 dark:bg-apple-gray-500 ring-2 ring-white dark:ring-apple-gray-800"
                  style={{ left: pct(it.withoutPpg) }}
                />
                <span
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-brand-green ring-2 ring-white dark:ring-apple-gray-800"
                  style={{ left: pct(it.withPpg) }}
                />
              </div>
            </button>
          )
        })}
      </div>

      {items.length > VISIBLE && (
        <button onClick={() => setExpanded(e => !e)} className="mt-2 text-xs font-medium text-brand-green hover:underline">
          {expanded ? 'Ver menos' : `Ver los ${items.length}`}
        </button>
      )}
    </div>
  )
}
