import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import { PlayerPhoto } from '@/components/ui/PlayerPhoto'
import { loadHeatmaps, loadShots, type OptaPlayer } from '@/features/opta/data'
import { useAgencyInOpta, useAsync, useOptaLeague, usePercentiles } from '@/features/opta/hooks'
import { CATEGORY_LABEL, fmt, GROUP_LABEL, GROUP_PROFILE, METRICS, metric, POS_LABEL, profileScore, type Category } from '@/features/opta/metrics'
import { Card, DgBadge, PctPill, Segmented, TeamName } from '@/features/opta/components/ui'
import { Radar, radarVsAverage, SERIES_BG, SERIES_CLASS } from '@/features/opta/components/charts'
import { Heatmap, ShotMap } from '@/features/opta/components/pitch'
import PlayerPicker from '@/features/opta/components/PlayerPicker'

export default function OptaComparePage() {
  const [params, setParams] = useSearchParams()
  const ids = (params.get('ids') ?? '').split(',').filter(Boolean).slice(0, 3)
  const { data: league, error, loading } = useOptaLeague()
  const idx = usePercentiles(league)
  const dg = useAgencyInOpta(league)
  const maps = useAsync(loadHeatmaps, [])
  const shots = useAsync(loadShots, [])
  const [mapKind, setMapKind] = useState<'calor' | 'remates'>('calor')
  const [radarMode, setRadarMode] = useState<'valor' | 'percentil'>('valor')
  const [showAvg, setShowAvg] = useState(true)

  if (loading) return <LoadingSpinner fullScreen message="Cargando comparación..." />
  if (error || !league || !idx) return <div className="max-w-screen-xl mx-auto px-4 py-8"><EmptyState title="Error" description={error ?? ''} icon="error" /></div>

  const players = ids.map(id => league.playerById.get(id)).filter((p): p is OptaPlayer => Boolean(p))
  const setIds = (next: string[]) => setParams(next.length ? { ids: next.join(',') } : {}, { replace: true })
  const group = players[0]?.group ?? 'CM'
  const mixed = players.some(p => p.group !== group)
  const axes = GROUP_PROFILE[group].map(metric)
  const cats = (Object.keys(CATEGORY_LABEL) as Category[]).filter(c => c !== 'arquero' || group === 'GK')

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 pb-28 sm:pb-10 animate-fade-in space-y-5">
      <nav className="flex items-center gap-2 text-sm text-apple-gray-500 dark:text-apple-gray-400">
        <Link to="/opta" className="hover:text-brand-green transition-colors">Test Opta</Link>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        <span className="text-apple-gray-800 dark:text-white font-medium">Comparar jugadores</span>
      </nav>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <h1 className="text-xl sm:text-2xl font-bold text-apple-gray-800 dark:text-white tracking-tight">Comparar jugadores</h1>
        {players.length < 3 && <PlayerPicker league={league} exclude={ids} autoFocus={players.length === 0} placeholder={players.length ? 'Agregar otro jugador…' : 'Elegí un jugador…'} onPick={p => setIds([...ids, p.id])} />}
      </div>

      {players.length === 0 ? (
        <EmptyState title="Elegí jugadores" description="Buscá hasta 3 jugadores de la Liga Profesional para compararlos con datos de Opta." icon="search" />
      ) : (
        <>
          <div className={`grid gap-3 ${players.length === 1 ? 'sm:grid-cols-1' : players.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
            {players.map((p, i) => (
              <div key={p.id} className="card-apple p-4 relative">
                <span className={`absolute left-0 top-3 bottom-3 w-1 rounded-r ${SERIES_BG[i]}`} />
                <button onClick={() => setIds(ids.filter(x => x !== p.id))} aria-label={`Quitar ${p.name}`} className="absolute right-2 top-2 w-6 h-6 rounded-full text-apple-gray-400 hover:text-red-500 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700">×</button>
                <div className="flex items-center gap-3">
                  <PlayerPhoto name={p.name} size="md" />
                  <div className="min-w-0 flex-1">
                    <Link to={`/opta/jugador/${p.id}`} className="font-semibold text-apple-gray-800 dark:text-white hover:text-brand-green truncate flex items-center gap-1.5">{p.name}{dg.has(p.id) && <DgBadge />}</Link>
                    <div className="text-xs text-apple-gray-500 truncate"><TeamName team={league.teamById.get(p.teamId ?? '')} /> · {POS_LABEL[p.pos]}</div>
                    <div className="text-xs text-apple-gray-400">{p.age ?? '—'} años · {p.minutes}' · {p.stats.appearances ?? 0} PJ</div>
                  </div>
                  <PctPill pct={profileScore(p, idx)} size="md" />
                </div>
              </div>
            ))}
          </div>

          {mixed && (
            <div className="px-4 py-3 rounded-apple-lg bg-amber-50 dark:bg-amber-900/20 text-sm text-amber-800 dark:text-amber-200">
              Son de puestos distintos: el radar usa las métricas de {GROUP_LABEL[group].toLowerCase()} y cada percentil se calcula contra el puesto de cada jugador.
            </div>
          )}

          <div className="grid lg:grid-cols-5 gap-5">
            <Card className="lg:col-span-2" title="Radar" subtitle={`Lo clave para ${GROUP_LABEL[group].toLowerCase()}. Pasá el mouse por un eje para ver los valores.`}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <Segmented size="sm" value={radarMode} onChange={setRadarMode} options={[{ value: 'valor', label: 'Valores reales' }, { value: 'percentil', label: 'Percentiles' }]} />
                <label className="inline-flex items-center gap-1.5 text-xs text-apple-gray-600 dark:text-apple-gray-300">
                  <input type="checkbox" checked={showAvg} onChange={e => setShowAvg(e.target.checked)} className="w-4 h-4 rounded border-apple-gray-300 text-brand-green focus:ring-brand-green/50" />
                  Promedio del puesto
                </label>
              </div>
              <Radar axes={axes} series={radarVsAverage(axes, players, idx, radarMode, showAvg)} scaleLabel={radarMode === 'valor' ? 'del peor al mejor 5% del puesto' : 'percentil 0-100'} />
            </Card>
            <Card className="lg:col-span-3" title="Métrica por métrica" subtitle="Valor cada 90' y percentil en su puesto. En negrita, el mejor de la comparación.">
              <div className="overflow-x-auto -mx-4 sm:-mx-5 max-h-[34rem] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white dark:bg-apple-gray-800 z-10">
                    <tr className="text-2xs uppercase tracking-wide text-apple-gray-400">
                      <th className="py-2 pl-4 sm:pl-5 pr-2 text-left font-medium">Métrica</th>
                      {players.map((p, i) => <th key={p.id} className="py-2 px-2 text-right font-medium"><span className={`inline-block w-2 h-2 rounded-full mr-1 ${SERIES_BG[i]}`} />{p.name.split(' ').slice(-1)[0]}</th>)}
                      <th className="py-2 pl-2 pr-4 sm:pr-5 text-right font-medium" title={`Promedio de ${GROUP_LABEL[group].toLowerCase()} de la liga`}>Prom. puesto</th>
                    </tr>
                  </thead>
                  {cats.map(c => (
                    <tbody key={c} className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700/50">
                      <tr><td colSpan={players.length + 2} className="pt-3 pb-1 pl-4 sm:pl-5 text-xs font-semibold text-apple-gray-500">{CATEGORY_LABEL[c]}</td></tr>
                      {METRICS.filter(m => m.category === c).map(m => {
                        const vals = players.map(p => m.value(p))
                        const valid = vals.filter((v): v is number => v !== null)
                        const best = valid.length > 1 ? (m.lowerIsBetter ? Math.min(...valid) : Math.max(...valid)) : null
                        return (
                          <tr key={m.key} title={m.help}>
                            <td className="py-1.5 pl-4 sm:pl-5 pr-2 text-apple-gray-600 dark:text-apple-gray-300">{m.label}</td>
                            {players.map((p, i) => (
                              <td key={p.id} className="py-1.5 px-2 text-right whitespace-nowrap tabular-nums">
                                <span className={vals[i] !== null && vals[i] === best ? 'font-bold text-apple-gray-900 dark:text-white' : 'text-apple-gray-600 dark:text-apple-gray-300'}>{fmt(vals[i], m)}</span>
                                <span className="ml-1.5"><PctPill pct={idx.pct(p, m.key)} /></span>
                              </td>
                            ))}
                            <td className="py-1.5 pl-2 pr-4 sm:pr-5 text-right whitespace-nowrap tabular-nums text-apple-gray-400">{fmt(idx.avg(group, m.key), m)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  ))}
                </table>
              </div>
            </Card>
          </div>

          <Card title={mapKind === 'calor' ? 'Dónde juega cada uno' : 'Remates de cada uno'}
            action={<Segmented size="sm" value={mapKind} onChange={setMapKind} options={[{ value: 'calor', label: 'Mapa de calor' }, { value: 'remates', label: 'Remates' }]} />}>
            <div className={`grid gap-4 ${players.length > 1 ? 'md:grid-cols-2' : ''} ${players.length > 2 ? 'xl:grid-cols-3' : ''}`}>
              {players.map((p, i) => (
                <div key={p.id}>
                  <div className={`text-sm font-semibold mb-1.5 ${SERIES_CLASS[i]}`}>{p.name}</div>
                  {mapKind === 'calor'
                    ? (maps.data?.[p.id] ? <Heatmap grid={maps.data[p.id].t} label={`Mapa de calor de ${p.name}`} avg={p.ev.avgX !== null ? { x: p.ev.avgX, y: p.ev.avgY ?? 50 } : null} /> : <div className="h-40 rounded-apple bg-apple-gray-100 dark:bg-apple-gray-700/40 animate-pulse" />)
                    : (shots.data ? <ShotMap shots={shots.data[p.id] ?? []} league={league} playerTeamId={p.teamId} /> : <div className="h-40 rounded-apple bg-apple-gray-100 dark:bg-apple-gray-700/40 animate-pulse" />)}
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
