import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import WidgetCard from '@/features/coaches/components/summary/WidgetCard'
import { TeamName, fmtDate } from '@/features/opta/components/ui'
import { AREAS, AREA_LABEL, TEAM_METRIC, TEAM_METRICS, fmtMetric, leagueAverage } from '../teamData'
import { COACH_SHORT, type CoachData } from '../useCoachData'
import { MatchTrend, ResultChip } from './charts'
import { dec1 } from './PanoramaTab'

export default function MatchesTab({ d }: { d: CoachData }) {
  const navigate = useNavigate()
  const [key, setKey] = useState('xg')
  const metric = TEAM_METRIC.get(key)!
  const avg = leagueAverage(metric, d.allTeams('temporada'))
  const games = d.games

  return (
    <div className="space-y-5 sm:space-y-6">
      <WidgetCard
        title="Partido a partido"
        description={`Toda la temporada ${d.league.meta.season}. Elegí qué querés ver. La zona verde son los partidos con ${COACH_SHORT}.`}
        action={(
          <select value={key} onChange={e => setKey(e.target.value)} className="input-apple text-sm py-1.5 px-3 w-auto max-w-[14rem]">
            {AREAS.map(a => (
              <optgroup key={a} label={AREA_LABEL[a]}>
                {TEAM_METRICS.filter(m => m.area === a).map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </optgroup>
            ))}
          </select>
        )}
      >
        <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 -mt-2 mb-3">{metric.help}{metric.lower ? ' En este dato, menos es mejor.' : ''}</p>
        <MatchTrend games={games} metric={metric} league={d.league} leagueAvg={avg} coachFrom={d.coachFrom} coachShort={COACH_SHORT} />
      </WidgetCard>

      <WidgetCard title="Todos los partidos" description="Tocá un partido para abrir el centro de partido de Opta.">
        <div className="overflow-x-auto -mx-4 sm:-mx-5">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-2xs uppercase tracking-wide text-apple-gray-400 border-b border-apple-gray-100 dark:border-apple-gray-700">
                {['Fecha', 'Rival', '', 'Resultado', 'xG', 'Posesión', 'Remates', 'Ocasiones', 'Llegadas al área', 'PPDA', 'Dibujo'].map((h, i) => (
                  <th key={i} className={`py-2 px-2 font-semibold ${i < 2 ? 'text-left' : 'text-center'} ${i === 0 ? 'pl-4 sm:pl-5' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...games].reverse().map(g => {
                const withCoach = g.match.date >= d.coachFrom
                return (
                  <tr key={g.match.id} onClick={() => navigate(`/opta/partido/${g.match.id}`)}
                    className={`border-b border-apple-gray-50 dark:border-apple-gray-700/40 last:border-0 cursor-pointer hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/30 ${withCoach ? 'bg-brand-green/[0.04]' : ''}`}>
                    <td className="py-2 px-2 pl-4 sm:pl-5 tabular-nums text-apple-gray-500 whitespace-nowrap">{fmtDate(g.match.date)}</td>
                    <td className="py-2 px-2"><TeamName team={d.league.teamById.get(g.oppId)} className="text-apple-gray-800 dark:text-white" /></td>
                    <td className="py-2 px-2 text-center text-xs text-apple-gray-400">{g.home ? 'Local' : 'Visit.'}</td>
                    <td className="py-2 px-2 text-center"><span className="inline-flex items-center gap-1.5"><ResultChip r={g.result} /><b className="tabular-nums">{g.gf}-{g.ga}</b></span></td>
                    <td className="py-2 px-2 text-center tabular-nums">{dec1(g.us.xg ?? 0)} - {dec1(g.them.xg ?? 0)}</td>
                    <td className="py-2 px-2 text-center tabular-nums">{Math.round(g.us.possessionPercentage ?? 0)}%</td>
                    <td className="py-2 px-2 text-center tabular-nums">{g.us.totalScoringAtt ?? 0} - {g.them.totalScoringAtt ?? 0}</td>
                    <td className="py-2 px-2 text-center tabular-nums">{g.us.bigChanceCreated ?? 0} - {g.them.bigChanceCreated ?? 0}</td>
                    <td className="py-2 px-2 text-center tabular-nums">{g.us.penAreaEntries ?? 0} - {g.them.penAreaEntries ?? 0}</td>
                    <td className="py-2 px-2 text-center tabular-nums">{fmtMetric(TEAM_METRIC.get('ppda')!, g.us.ppda ?? null)}</td>
                    <td className="py-2 px-2 text-center tabular-nums text-apple-gray-500">{g.formation ? g.formation.split('').join('-') : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-2xs text-apple-gray-400 mt-3">En las columnas con dos números: River - rival. PPDA: pases que dejó dar al rival antes de presionar (menos = presiona más).</p>
      </WidgetCard>
    </div>
  )
}
