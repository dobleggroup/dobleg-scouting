import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRecentForm } from '@/hooks/usePlayerStats'
import { marketTagsFor } from '@/utils/opportunities'
import Sparkline from '@/components/ui/Sparkline'

const CHEAP_MAX = 5_000_000, CONTRACT_MAX = 12
const TAG_LABEL = { contract: 'Fin de contrato', cheap: 'Precio bajo' } as const

export default function OpportunityHero() {
  const navigate = useNavigate()
  const { players, loading } = useRecentForm({
    windowMonths: 3, cheapMaxValue: CHEAP_MAX, contractMaxMonths: CONTRACT_MAX, limit: 8,
  })
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused || players.length < 2) return
    const t = setInterval(() => setIdx(i => (i + 1) % players.length), 5000)
    return () => clearInterval(t)
  }, [paused, players.length])

  useEffect(() => { if (idx >= players.length) setIdx(0) }, [players.length, idx])

  const active = players[idx]
  const tags = useMemo(
    () => active ? marketTagsFor(active, { cheapMaxValue: CHEAP_MAX, contractMaxMonths: CONTRACT_MAX }) : [],
    [active],
  )

  if (loading || players.length === 0) return null

  return (
    <section onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <h2 className="text-lg font-semibold text-apple-gray-800 dark:text-white mb-4">
        Oportunidades de mercado
      </h2>
      <div
        onClick={() => navigate(`/jugador/${encodeURIComponent(active.name)}?source=externo&apiId=${active.id}`)}
        className="cursor-pointer bg-white dark:bg-apple-gray-800/60 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 p-5 hover:shadow-apple-md transition-all"
      >
        <div className="flex items-center gap-1.5 mb-4">
          {players.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-5 bg-brand-green' : 'w-1.5 bg-apple-gray-300 dark:bg-apple-gray-600'}`} />
          ))}
        </div>
        <div className="flex items-center gap-4">
          {active.photo
            ? <img src={active.photo} alt="" className="w-16 h-16 rounded-full object-cover" />
            : <div className="w-16 h-16 rounded-full bg-apple-gray-200 dark:bg-apple-gray-700" />}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-apple-gray-800 dark:text-white truncate">{active.name}</h3>
              {active.on_the_rise && <span className="text-brand-green text-sm font-semibold">▲ en alza</span>}
            </div>
            <p className="text-sm text-apple-gray-500 truncate">
              {[active.team?.name, active.league_name].filter(Boolean).join(' · ')}
            </p>
            <div className="flex items-center gap-3 mt-1.5">
              {tags.map(t => (
                <span key={t} className="text-xs font-medium px-2 py-0.5 rounded-full bg-brand-green/10 text-brand-green">{TAG_LABEL[t]}</span>
              ))}
              {active.market_value_eur && (
                <span className="text-xs text-apple-gray-500">€{(active.market_value_eur / 1_000_000).toFixed(1)}M</span>
              )}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-2xl font-bold text-brand-green tabular-nums">{active.recent_avg.toFixed(1)}</p>
            <p className="text-2xs text-apple-gray-400">Score GG · {active.recent_matches} PJ</p>
            <div className="mt-1 flex justify-end"><Sparkline values={active.recent_scores} /></div>
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-3 overflow-x-auto scrollbar-thin">
        {players.map((p, i) => (
          <button key={p.id} onClick={() => setIdx(i)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs whitespace-nowrap transition-all ${
              i === idx ? 'bg-brand-green/15 text-brand-green' : 'bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-500'}`}>
            {p.photo && <img src={p.photo} alt="" className="w-4 h-4 rounded-full object-cover" />}
            {p.name.split(' ').slice(-1)[0]}
          </button>
        ))}
      </div>
    </section>
  )
}
