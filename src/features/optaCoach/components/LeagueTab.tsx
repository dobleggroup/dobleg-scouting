import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import WidgetCard from '@/features/coaches/components/summary/WidgetCard'
import Scatter from '@/features/opta/components/Scatter'
import { Segmented } from '@/features/opta/components/ui'
import type { OptaMetric } from '@/features/opta/metrics'
import { AREAS, AREA_LABEL, TEAM_METRIC, TEAM_METRICS, fmtMetric, metricValue, rankTeams, type TeamGame, type TeamMetric } from '../teamData'
import { SCOPE_LABEL, TEAM_ID, type CoachData, type Scope } from '../useCoachData'
import { PctBar } from './charts'

type Group = 'liga' | 'zona'

/** Las métricas de equipo con la forma que espera el gráfico de dispersión de Test Opta. */
export const asAxis = (m: TeamMetric) => ({ key: m.key, label: m.label, decimals: m.dec, unit: m.unit, lowerIsBetter: m.lower }) as unknown as OptaMetric

const SCATTERS: Array<{ x: string; y: string; title: string; text: string }> = [
  { x: 'xg', y: 'xga', title: 'Peligro que genera y que recibe', text: 'xG a favor y xG en contra por partido. Arriba a la derecha: los que generan mucho y conceden poco.' },
  { x: 'poss', y: 'ppda', title: 'Posesión y presión', text: 'Cuánto tiene la pelota y qué tan rápido presiona para recuperarla (arriba = presiona más).' },
  { x: 'boxEntries', y: 'boxAgainst', title: 'Llegadas al área a favor y en contra', text: 'Cuántas veces entra al área rival y cuántas le entran (arriba = le llegan menos).' },
  { x: 'shots', y: 'xgPerShot', title: 'Cantidad y calidad de remates', text: 'Remates por partido y xG promedio de cada remate (arriba = remata desde mejores lugares).' },
]

export default function LeagueTab({ d }: { d: CoachData }) {
  const navigate = useNavigate()
  const [scope, setScope] = useState<Scope>('torneo')
  const [group, setGroup] = useState<Group>('liga')
  const all = d.allTeams(scope)
  const zone = d.zoneOf(TEAM_ID)
  const zoneIds = new Set(zone?.rows.map(r => r.teamId) ?? [])
  const pool = group === 'zona' ? new Map([...all].filter(([id]) => zoneIds.has(id))) : all
  const nextOpp = d.next ? (d.next.home === TEAM_ID ? d.next.away : d.next.home) : null
  const mine = pool.get(TEAM_ID) ?? ([] as TeamGame[])

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented size="sm" value={scope} onChange={setScope} options={(['torneo', 'temporada'] as Scope[]).map(s => ({ value: s, label: SCOPE_LABEL[s] }))} />
        <Segmented size="sm" value={group} onChange={setGroup} options={[{ value: 'liga', label: `Los ${all.size} equipos` }, { value: 'zona', label: 'Su zona' }]} />
      </div>

      <div className="grid gap-5 sm:gap-6 md:grid-cols-2 2xl:grid-cols-4 items-start">
        {AREAS.map(area => (
          <WidgetCard key={area} title={AREA_LABEL[area]} description={`Puesto de River entre ${pool.size} equipos, por partido.`}>
            <ul className="space-y-2.5">
              {TEAM_METRICS.filter(m => m.area === area).map(m => {
                const r = rankTeams(m, pool).get(TEAM_ID)
                return (
                  <li key={m.key} title={m.help}>
                    <div className="flex justify-between gap-2 text-sm">
                      <span className="text-apple-gray-700 dark:text-apple-gray-200 truncate">{m.label}</span>
                      <span className="tabular-nums whitespace-nowrap"><b className="text-apple-gray-800 dark:text-white">{fmtMetric(m, metricValue(m, mine))}</b> <span className="text-xs text-apple-gray-400">· {r?.rank ?? '—'}º{m.neutral ? ' más alto' : ''}</span></span>
                    </div>
                    <div className="mt-1">{m.neutral ? <div className="h-2 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700/60 overflow-hidden"><div className="h-full rounded-full bg-apple-gray-400 dark:bg-apple-gray-500" style={{ width: `${Math.max(3, 100 - (((r?.rank ?? 1) - 1) / Math.max(1, pool.size - 1)) * 100)}%` }} /></div> : <PctBar pct={r?.pct ?? 0} />}</div>
                  </li>
                )
              })}
            </ul>
          </WidgetCard>
        ))}
      </div>

      <div className="grid gap-5 sm:gap-6 lg:grid-cols-2">
        {SCATTERS.map(s => {
          const mx = TEAM_METRIC.get(s.x)!, my = TEAM_METRIC.get(s.y)!
          const points = [...pool].map(([id, gs]) => ({
            id, name: d.league.teamById.get(id)?.short ?? id, team: '',
            x: metricValue(mx, gs) ?? 0, y: metricValue(my, gs) ?? 0, dg: id === TEAM_ID, focus: id === nextOpp,
          }))
          return (
            <WidgetCard key={s.title} title={s.title} description={s.text}>
              <Scatter points={points} mx={asAxis(mx)} my={asAxis(my)} height={340} labelTop={pool.size} onSelect={id => navigate(`/opta/equipo/${id}`)}
                legend={(
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-1">
                    <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-brand-green" />River</span>
                    {nextOpp && <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#2563eb]" />Próximo rival</span>}
                    <span>Líneas punteadas: promedio · tocá un equipo para ver su ficha</span>
                  </div>
                )} />
            </WidgetCard>
          )
        })}
      </div>
    </div>
  )
}
