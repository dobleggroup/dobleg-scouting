import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import WidgetCard from '@/features/coaches/components/summary/WidgetCard'
import { loadMatchLog, loadShots, type OptaShot } from '@/features/opta/data'
import { useAsync, usePercentiles } from '@/features/opta/hooks'
import { POS_LABEL, profileScore } from '@/features/opta/metrics'
import { PctPill, Segmented, TeamDot, fmtDate } from '@/features/opta/components/ui'
import { ShotMap } from '@/features/opta/components/pitch'
import { TEAM_METRIC, fmtMetric, formations, metricValue, prettyFormation, rankTeams, type TeamMetric } from '../teamData'
import { RIVAL_FACT_WORDS, averageShape, heights, lanes, readStyle, strengthsWeaknesses, teamFacts } from '../style'
import { SCOPE_LABEL, TEAM_ID, type CoachData, type Scope } from '../useCoachData'
import { ResultChip } from './charts'
import { dec1, kickoff } from './PanoramaTab'
import { KeyFacts, LanesBar, StyleProfile, TeamShape, factItems } from './styleViews'

const FACE_TO_FACE = ['goals', 'xg', 'shots', 'bigChances', 'boxEntries', 'poss', 'passPct', 'longPct', 'crosses', 'ga', 'xga', 'shotsAgainst', 'ppda', 'highRec', 'aerialPct', 'setPieceShots']

export default function RivalTab({ d }: { d: CoachData }) {
  const defaultOpp = d.next ? (d.next.home === TEAM_ID ? d.next.away : d.next.home) : d.league.teams.find(t => t.id !== TEAM_ID)!.id
  const [oppId, setOppId] = useState(defaultOpp)
  const [scope, setScope] = useState<Scope>('torneo')
  const [shotSide, setShotSide] = useState<'for' | 'against'>('for')
  const [showAll, setShowAll] = useState(false)
  const idx = usePercentiles(d.league)
  const shots = useAsync(loadShots, [])
  const log = useAsync(loadMatchLog, [])
  const opp = d.league.teamById.get(oppId)!
  const all = d.allTeams(scope)
  const oppGames = d.gamesOf(oppId, scope)
  const myGames = d.gamesOf(TEAM_ID, scope)
  const isNext = Boolean(d.next) && oppId === defaultOpp
  const zoneRow = d.zoneOf(oppId)?.rows.find(r => r.teamId === oppId)
  const inScope = scope === 'torneo' ? 'en el Clausura' : 'en todo 2026'

  const style = useMemo(() => readStyle(oppId, all), [oppId, all])
  const recent = d.gamesOf(oppId, 'temporada').slice(-5)
  const shape = averageShape(recent, d.block.lineups)
  const h = heights(recent)
  const forms = formations(oppGames)

  // Fortalezas y debilidades: solo datos de rendimiento (no de estilo), entre los 6 mejores / peores.
  const { strong, weak } = useMemo(() => strengthsWeaknesses(oppId, all), [all, oppId])

  const facts = useMemo(() => factItems(teamFacts(oppId, all, RIVAL_FACT_WORDS)), [oppId, all])

  const oppShots = useMemo(() => {
    const out = { for: [] as OptaShot[], against: [] as OptaShot[] }
    if (!shots.data || !log.data) return out
    const teamIn = new Map<string, string>()
    for (const [pid, rows] of Object.entries(log.data)) for (const r of rows) teamIn.set(`${pid}|${r.match}`, r.team)
    const ids = new Set(oppGames.map(g => g.match.id))
    for (const [pid, list] of Object.entries(shots.data)) for (const s of list) {
      if (!ids.has(s[5])) continue
      ;(teamIn.get(`${pid}|${s[5]}`) === oppId ? out.for : out.against).push(s)
    }
    return out
  }, [shots.data, log.data, oppGames, oppId])

  const keyPlayers = d.league.players.filter(p => p.teamId === oppId && p.minutes > 0)
    .sort((a, b) => (b.stats.goals ?? 0) + (b.stats.goalAssist ?? 0) + (b.xg.expectedGoals ?? 0) - ((a.stats.goals ?? 0) + (a.stats.goalAssist ?? 0) + (a.xg.expectedGoals ?? 0)))
    .slice(0, 5)
  const h2h = d.games.filter(g => g.oppId === oppId)

  const rankLine = ({ m, r }: { m: TeamMetric; r: { rank: number; value: number | null } }) => (
    <li key={m.key} className="flex items-baseline justify-between gap-2 text-sm" title={m.help}>
      <span className="text-apple-gray-700 dark:text-apple-gray-200">{m.label}</span>
      <span className="tabular-nums whitespace-nowrap text-apple-gray-500"><b className="text-apple-gray-800 dark:text-white">{r.rank}º</b> · {fmtMetric(m, r.value)}</span>
    </li>
  )

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <select value={oppId} onChange={e => setOppId(e.target.value)} className="input-apple text-sm py-1.5 px-3 w-auto">
          {d.league.teams.filter(t => t.id !== TEAM_ID && t.games > 0).sort((a, b) => a.short.localeCompare(b.short)).map(t => (
            <option key={t.id} value={t.id}>{t.short}{t.id === defaultOpp && d.next ? ' (próximo rival)' : ''}</option>
          ))}
        </select>
        <Segmented size="sm" value={scope} onChange={setScope} options={(['torneo', 'temporada'] as Scope[]).map(s => ({ value: s, label: SCOPE_LABEL[s] }))} />
      </div>

      <section className="bg-white dark:bg-apple-gray-800 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 p-4 sm:p-5 flex flex-wrap items-center gap-4">
        <TeamDot team={opp} size={48} />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg sm:text-xl font-bold text-apple-gray-800 dark:text-white">{opp.name}</h2>
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 first-letter:uppercase">
            {isNext && d.next ? `Próximo rival · River ${d.next.home === TEAM_ID ? 'de local' : 'de visitante'} · ${kickoff(d.next)}` : 'Rival elegido'}
            {zoneRow ? ` · ${zoneRow.rank}º en su zona con ${zoneRow.pts} puntos` : ''}
          </p>
        </div>
        <div className="flex gap-1" title="Últimos 5 partidos">{recent.map(g => <ResultChip key={g.match.id} r={g.result} />)}</div>
      </section>

      <KeyFacts accent="blue" title={`Lo que hay que saber de ${opp.short}`} subtitle={`Lo más marcado de su juego ${inScope}, comparado con los ${all.size} equipos de la liga.`} items={facts} />

      <div className="grid gap-5 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] items-start">
        <WidgetCard title={`Cómo juega ${opp.short}`} description={`Cada línea va de un estilo al opuesto; el punto es ${opp.short} y la rayita del medio, el promedio de la liga. Pasá el mouse para ver qué mide.`}>
          <StyleProfile readings={style} accent="blue" />
        </WidgetCard>
        <div className="space-y-5 sm:space-y-6">
          <WidgetCard title={`Cómo se para ${opp.short}`}
            description={`Los 11 más usados en sus últimos ${recent.length} partidos, en su posición media (ataca hacia la derecha). Dibujo más usado: ${forms.slice(0, 2).map(f => `${prettyFormation(f.formation)} (${f.count})`).join(', ') || '—'}.`}>
            <TeamShape players={shape} league={d.league} lineX={h.lineX} blockX={h.blockX} accent="blue" label={`Posiciones medias de ${opp.short}`} />
          </WidgetCard>
          <WidgetCard title="Por dónde ataca" description="Reparto de sus toques en el último tercio de la cancha.">
            <LanesBar lanes={lanes(oppGames)} accent="blue" />
          </WidgetCard>
        </div>
      </div>

      <div className="grid gap-5 sm:gap-6 lg:grid-cols-2 items-start">
        <WidgetCard title={shotSide === 'for' ? `Desde dónde remata ${opp.short}` : `Desde dónde le rematan a ${opp.short}`}
          description={`${(shotSide === 'for' ? oppShots.for : oppShots.against).length} remates ${inScope}. Más grande = más xG. Los rellenos son goles.`}
          action={<Segmented size="sm" value={shotSide} onChange={setShotSide} options={[{ value: 'for', label: 'Remata' }, { value: 'against', label: 'Le rematan' }]} />}>
          {shots.loading || log.loading
            ? <div className="h-64 rounded-apple bg-apple-gray-100 dark:bg-apple-gray-700/40 animate-pulse" />
            : <div className="max-w-md mx-auto"><ShotMap shots={oppShots[shotSide]} league={d.league} playerTeamId={shotSide === 'for' ? oppId : null} /></div>}
        </WidgetCard>

        <div className="space-y-5 sm:space-y-6">
          <WidgetCard title="Fortalezas y debilidades" description={`Donde está entre los 6 mejores o los 6 peores de la liga, ${inScope}.`}>
            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-wide text-brand-green mb-2">Fuerte en</h4>
                {strong.length ? <ul className="space-y-1.5">{strong.map(rankLine)}</ul> : <p className="text-sm text-apple-gray-400">Nada que se destaque.</p>}
              </div>
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-wide text-red-500 mb-2">Flojo en</h4>
                {weak.length ? <ul className="space-y-1.5">{weak.map(rankLine)}</ul> : <p className="text-sm text-apple-gray-400">Nada que se destaque.</p>}
              </div>
            </div>
          </WidgetCard>
          <WidgetCard title="Sus jugadores clave" description="Los que más goles, asistencias y xG suman en la temporada.">
            <div className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700/50">
              {keyPlayers.map(p => (
                <Link key={p.id} to={`/opta/jugador/${p.id}`} className="flex items-center gap-3 py-2 hover:text-brand-green">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-apple-gray-800 dark:text-white truncate">{p.name}</div>
                    <div className="text-xs text-apple-gray-500 dark:text-apple-gray-400 tabular-nums">{POS_LABEL[p.pos]} · {p.stats.goals ?? 0} goles · {p.stats.goalAssist ?? 0} asist. · xG {dec1(p.xg.expectedGoals ?? 0)}</div>
                  </div>
                  <PctPill pct={idx ? profileScore(p, idx) : null} />
                </Link>
              ))}
            </div>
          </WidgetCard>
          {h2h.length > 0 && (
            <WidgetCard title="Este año entre ellos">
              <ul className="space-y-1.5">
                {h2h.map(g => (
                  <li key={g.match.id}>
                    <Link to={`/opta/partido/${g.match.id}`} className="flex items-center gap-2 text-sm hover:text-brand-green">
                      <span className="text-xs text-apple-gray-400 tabular-nums w-16">{fmtDate(g.match.date)}</span>
                      <ResultChip r={g.result} />
                      <span className="flex-1 text-apple-gray-700 dark:text-apple-gray-200">{g.home ? 'River' : opp.short} {g.home ? g.gf : g.ga} - {g.home ? g.ga : g.gf} {g.home ? opp.short : 'River'}</span>
                      <span className="text-xs text-apple-gray-400 tabular-nums">xG {dec1(g.us.xg ?? 0)} a {dec1(g.them.xg ?? 0)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </WidgetCard>
          )}
        </div>
      </div>

      <WidgetCard title={`River y ${opp.short}, dato por dato`} description={`Por partido, ${inScope}. El número chico es el puesto entre los ${all.size} equipos.`}
        action={<button type="button" onClick={() => setShowAll(v => !v)} className="text-xs font-semibold text-brand-green hover:underline whitespace-nowrap">{showAll ? 'Ocultar' : `Ver los ${FACE_TO_FACE.length} datos`}</button>}>
        {showAll ? (
          <div className="grid lg:grid-cols-2 gap-x-8 gap-y-2">
            {FACE_TO_FACE.map(k => {
              const m = TEAM_METRIC.get(k)!
              const ranks = rankTeams(m, all)
              const us = ranks.get(TEAM_ID), them = ranks.get(oppId)
              const a = metricValue(m, myGames) ?? 0, b = metricValue(m, oppGames) ?? 0
              const max = Math.max(a, b) || 1
              const usBetter = us && them ? us.rank < them.rank : false
              return (
                <div key={k} title={m.help}>
                  <div className="text-center text-xs text-apple-gray-500 dark:text-apple-gray-400">{m.label}{m.lower ? ' (menos es mejor)' : ''}</div>
                  <div className="grid grid-cols-[4.5rem_1fr_1fr_4.5rem] items-center gap-1.5 mt-0.5">
                    <span className={`text-xs tabular-nums text-right ${usBetter ? 'font-bold text-apple-gray-800 dark:text-white' : 'text-apple-gray-500'}`}>{fmtMetric(m, a)} <span className="text-[10px] text-apple-gray-400">{us?.rank}º</span></span>
                    <div className="flex justify-end h-2"><div className="h-full rounded-l-full bg-brand-green" style={{ width: `${(a / max) * 100}%` }} /></div>
                    <div className="flex h-2"><div className="h-full rounded-r-full bg-[#2563eb] dark:bg-[#3b82f6]" style={{ width: `${(b / max) * 100}%` }} /></div>
                    <span className={`text-xs tabular-nums ${!usBetter ? 'font-bold text-apple-gray-800 dark:text-white' : 'text-apple-gray-500'}`}><span className="text-[10px] text-apple-gray-400">{them?.rank}º</span> {fmtMetric(m, b)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : <p className="text-sm text-apple-gray-400">Goles, xG, remates, posesión, presión y más, uno al lado del otro.</p>}
      </WidgetCard>
    </div>
  )
}
