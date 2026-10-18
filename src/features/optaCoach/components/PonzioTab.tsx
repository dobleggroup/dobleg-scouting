import { useState } from 'react'
import { Link } from 'react-router-dom'
import WidgetCard, { SectionHeading } from '@/features/coaches/components/summary/WidgetCard'
import { Segmented } from '@/features/opta/components/ui'
import { StatTile, Note } from '@/features/optaClub/components/bits'
import { AREAS, AREA_LABEL, TEAM_METRICS, fmtMetric, formations, metricValue, minutesShift, prettyFormation, recordOf } from '../teamData'
import { averageShape, heights } from '../style'
import { TeamShape } from './styleViews'
import { COACH_SHORT, type CoachData } from '../useCoachData'

type Base = 'torneo' | 'temporada'

function DotRow({ label, help, before, after, lo, hi, avg, lower, neutral, fmt }: {
  label: string; help: string; before: number | null; after: number | null; lo: number; hi: number; avg: number | null; lower?: boolean; neutral?: boolean; fmt: (v: number | null) => string
}) {
  const pos = (v: number) => { const t = hi > lo ? (v - lo) / (hi - lo) : 0.5; return Math.max(0, Math.min(1, lower ? 1 - t : t)) * 100 }
  const better = before !== null && after !== null ? (lower ? after < before : after > before) : null
  const change = before !== null && after !== null && before !== 0 ? Math.abs((after - before) / before) : 0
  const tone = neutral || better === null || change < 0.05 ? 'text-apple-gray-600 dark:text-apple-gray-300' : better ? 'text-brand-green' : 'text-red-500'
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[13rem_minmax(0,1fr)_8.5rem] gap-x-3 gap-y-1 items-center py-1.5" title={help}>
      <span className="order-1 text-sm text-apple-gray-700 dark:text-apple-gray-200 truncate">{label}{neutral ? <span className="text-2xs text-apple-gray-400"> (estilo)</span> : null}</span>
      <div className="order-3 sm:order-2 col-span-2 sm:col-span-1 relative h-5 mx-1.5 sm:mx-0">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700/60" />
        {avg !== null && <div className="absolute top-0.5 bottom-0.5 w-px bg-apple-gray-400 dark:bg-apple-gray-500" style={{ left: `${pos(avg)}%` }} title={`Promedio de la liga: ${fmt(avg)}`} />}
        {before !== null && after !== null && (
          <div className={`absolute top-1/2 h-1 -translate-y-1/2 rounded-full ${neutral ? 'bg-apple-gray-400/40' : better ? 'bg-brand-green/40' : 'bg-red-400/40'}`} style={{ left: `${Math.min(pos(before), pos(after))}%`, width: `${Math.abs(pos(after) - pos(before))}%` }} />
        )}
        {before !== null && <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-apple-gray-400 dark:bg-apple-gray-500 ring-2 ring-white dark:ring-apple-gray-800" style={{ left: `${pos(before)}%` }} />}
        {after !== null && <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-brand-green ring-2 ring-white dark:ring-apple-gray-800" style={{ left: `${pos(after)}%` }} />}
      </div>
      <span className="order-2 sm:order-3 text-xs tabular-nums text-right whitespace-nowrap">
        <span className="text-apple-gray-400">{fmt(before)}</span>
        <span className="text-apple-gray-300 dark:text-apple-gray-600"> → </span>
        <b className={tone}>{fmt(after)}</b>
      </span>
    </div>
  )
}

export default function PonzioTab({ d }: { d: CoachData }) {
  const [base, setBase] = useState<Base>('torneo')
  const scopeGames = d.gamesOf(d.team.id, base)
  const before = scopeGames.filter(g => g.match.date < d.coachFrom)
  const after = d.games.filter(g => g.match.date >= d.coachFrom)
  const rb = recordOf(before), ra = recordOf(after)
  const all = d.allTeams(base)
  const ppg = (r: ReturnType<typeof recordOf>) => (r.played ? (r.points / r.played).toFixed(2).replace('.', ',') : '—')

  const { gained, lost } = minutesShift(before, after, d.block.lineups)
  const shape = averageShape(after, d.block.lineups)
  const h = heights(after)
  const name = (id: string) => d.league.playerById.get(id)?.name ?? '—'
  const fb = formations(before), fa = formations(after)

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-apple-gray-600 dark:text-apple-gray-300">Comparar los {ra.played} partidos con {COACH_SHORT} contra:</span>
        <Segmented size="sm" value={base} onChange={setBase} options={[{ value: 'torneo', label: `El Clausura antes (${d.gamesOf(d.team.id, 'torneo').filter(g => g.match.date < d.coachFrom).length})` }, { value: 'temporada', label: `Todo 2026 antes (${d.games.filter(g => g.match.date < d.coachFrom).length})` }]} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label={`Récord con ${COACH_SHORT}`} value={`${ra.won}-${ra.drawn}-${ra.lost}`} accent detail={`antes: ${rb.won}-${rb.drawn}-${rb.lost} (ganados-empatados-perdidos)`} />
        <StatTile label="Puntos por partido" value={ppg(ra)} accent detail={`antes: ${ppg(rb)}`} />
        <StatTile label="Goles a favor por partido" value={ra.played ? (ra.gf / ra.played).toFixed(2).replace('.', ',') : '—'} detail={`antes: ${rb.played ? (rb.gf / rb.played).toFixed(2).replace('.', ',') : '—'}`} />
        <StatTile label="Goles en contra por partido" value={ra.played ? (ra.ga / ra.played).toFixed(2).replace('.', ',') : '—'} detail={`antes: ${rb.played ? (rb.ga / rb.played).toFixed(2).replace('.', ',') : '—'}`} />
      </div>

      <WidgetCard
        title={`Qué cambió con ${COACH_SHORT}`}
        description="Cada línea va del peor equipo de la liga (izquierda) al mejor (derecha); en los datos de estilo, de menos a más. Gris: antes · verde: con Ponzio · rayita: promedio de la liga. Pasá el mouse por el nombre para ver qué mide."
      >
        <div className="space-y-4">
          {AREAS.map(area => (
            <div key={area}>
              <h4 className="text-2xs font-bold uppercase tracking-wide text-apple-gray-400 mb-1">{AREA_LABEL[area]}</h4>
              {TEAM_METRICS.filter(m => m.area === area).map(m => {
                const vals = [...all.values()].map(gs => metricValue(m, gs)).filter((v): v is number => v !== null)
                const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null
                return (
                  <DotRow key={m.key} label={m.label} help={m.help} lower={m.lower} neutral={m.neutral}
                    before={metricValue(m, before)} after={metricValue(m, after)}
                    lo={Math.min(...vals)} hi={Math.max(...vals)} avg={avg} fmt={v => fmtMetric(m, v)} />
                )
              })}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-4">
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-apple-gray-400" />Antes</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-brand-green" />Con {COACH_SHORT}</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-px h-3 bg-apple-gray-400" />Promedio de la liga</span>
        </div>
      </WidgetCard>

      <SectionHeading title="Los jugadores" subtitle={`Quién juega con ${COACH_SHORT}`} />
      <div className="grid gap-5 sm:gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-start">
        <WidgetCard title="El equipo que más usa" description={`Los 11 con más partidos de titular con ${COACH_SHORT}, en su posición media (ataca hacia la derecha). Pasá el mouse por un jugador para ver cuántas veces fue titular.`}>
          <TeamShape players={shape} league={d.league} lineX={h.lineX} blockX={h.blockX} label={`Posiciones medias de River con ${COACH_SHORT}`} />
          <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-3">
            Dibujo con {COACH_SHORT}: {fa.map(f => `${prettyFormation(f.formation)} (${f.count})`).join(', ') || '—'} · antes: {fb.slice(0, 3).map(f => `${prettyFormation(f.formation)} (${f.count})`).join(', ') || '—'}
          </p>
        </WidgetCard>
        <div className="grid gap-5 sm:gap-6 sm:grid-cols-2 xl:grid-cols-1">
          {[{ title: 'Ganaron lugar', list: gained, good: true }, { title: 'Perdieron lugar', list: lost, good: false }].map(col => (
            <WidgetCard key={col.title} title={col.title} description="Parte de los minutos del equipo que jugó cada uno, antes y con Ponzio.">
              {col.list.length === 0 ? <p className="text-sm text-apple-gray-400">Nadie con un cambio grande.</p> : (
                <div className="space-y-2.5">
                  {col.list.map(x => (
                    <div key={x.id}>
                      <div className="flex items-baseline justify-between gap-2">
                        <Link to={`/opta/jugador/${x.id}`} className="text-sm font-medium text-apple-gray-800 dark:text-white hover:text-brand-green truncate">{name(x.id)}</Link>
                        <span className={`text-xs font-semibold tabular-nums ${col.good ? 'text-brand-green' : 'text-red-500'}`}>{Math.round(x.b * 100)}% → {Math.round(x.a * 100)}%</span>
                      </div>
                      <div className="relative h-1.5 mt-1 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700/60">
                        <div className={`absolute inset-y-0 rounded-full ${col.good ? 'bg-brand-green' : 'bg-red-400'}`} style={{ left: `${Math.min(x.a, x.b) * 100}%`, width: `${Math.abs(x.delta) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </WidgetCard>
          ))}
        </div>
      </div>
      <Note>Con {after.length} partidos la muestra todavía es chica: un partido puede mover mucho los promedios.</Note>
    </div>
  )
}
