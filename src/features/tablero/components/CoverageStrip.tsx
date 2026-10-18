import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlayerPhoto } from '@/components/ui/PlayerPhoto'
import { AGENCY_PLAYERS } from '@/constants/agencyPlayers'
import { COVERAGE_GROUP_TEXT, coverageSentence, type CoverageGap, type CoverageReason } from '../tableroInsights'
import { fmtDate } from './Panel'

const ORDER: CoverageReason[] = ['notPlaying', 'noLeague', 'noClub', 'reserve']

/**
 * Aviso simple de cobertura: cuántos jugadores tienen datos al día y, de los
 * que no, por qué — en una oración por jugador, así un hueco en un gráfico no
 * se lee como "no jugó".
 */
export default function CoverageStrip({ gaps, withData, total, teamName }: {
  gaps: CoverageGap[]
  withData: number
  total: number
  teamName: (id: number) => string
}) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const pct = total ? (withData / total) * 100 : 0
  const groups = ORDER.map(r => ({ reason: r, players: gaps.filter(g => g.reason === r) })).filter(g => g.players.length)

  return (
    <div className="bg-white dark:bg-apple-gray-800 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-full bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
          </span>
          <p className="text-sm text-apple-gray-700 dark:text-apple-gray-200">
            Tenemos datos al día de <span className="font-bold text-apple-gray-900 dark:text-white tabular-nums">{withData} de {total}</span> jugadores.
            {gaps.length > 0 && <span className="text-apple-gray-500 dark:text-apple-gray-400"> De {gaps.length === 1 ? 'uno' : `${gaps.length}`} no, y te contamos por qué.</span>}
          </p>
        </div>
        <div className="flex-1 min-w-[120px] h-1.5 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700 overflow-hidden" aria-hidden>
          <div className="h-full rounded-full bg-brand-green transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>
        {gaps.length > 0 && (
          <button
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            className="text-xs font-medium text-brand-green hover:underline whitespace-nowrap"
          >
            {open ? 'Ocultar' : 'Ver quiénes'}
          </button>
        )}
      </div>

      {open && (
        <div className="mt-4 space-y-4 animate-fade-in">
          {groups.map(g => (
            <div key={g.reason}>
              <p className="text-2xs font-semibold uppercase tracking-wide text-apple-gray-400 dark:text-apple-gray-500 mb-1.5">
                {COVERAGE_GROUP_TEXT[g.reason]}
              </p>
              <div className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700/50">
                {g.players.map(p => (
                  <button
                    key={p.fullName}
                    onClick={() => navigate(`/jugador/${encodeURIComponent(p.fullName)}?source=interno`)}
                    className="w-full flex items-start gap-3 py-2 text-left group"
                  >
                    <PlayerPhoto src={AGENCY_PLAYERS.find(a => a.fullName === p.fullName)?.image ?? null} name={p.fullName} size="sm" rounded="full" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-apple-gray-800 dark:text-white group-hover:text-brand-green transition-colors">{p.fullName}</p>
                      <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 leading-snug">
                        {coverageSentence(p, fmtDate, teamName)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="text-2xs text-apple-gray-400 dark:text-apple-gray-500">
            Los que no tienen datos al día no aparecen (o aparecen con datos viejos) en los gráficos de abajo. Que no tengamos el dato no quiere decir que no haya jugado.
          </p>
        </div>
      )}
    </div>
  )
}
