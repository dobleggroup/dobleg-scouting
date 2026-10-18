import { useState } from 'react'
import { Link } from 'react-router-dom'
import WidgetCard from '@/features/coaches/components/summary/WidgetCard'
import { TeamDot } from '@/features/opta/components/ui'
import type { StandingTable } from '@/features/opta/data'
import { AREAS, AREA_LABEL, TEAM_METRICS, fmtMetric, leagueAverage, metricValue, rankTeams, type TeamGame } from '../teamData'
import { RIVER_FACT_WORDS, lanes, readStyle, strengthsWeaknesses, teamFacts } from '../style'
import { TEAM_ID, type CoachData } from '../useCoachData'
import { dayMonth, kickoff } from '../format'
import { FormStrip, PctBar, ResultChip } from './charts'
import { KeyFacts, LanesBar, StyleProfile, factItems } from './styleViews'

export { dayMonth, dec1, kickoff } from '../format'

const LAST_ROWS: Array<{ label: string; v: (g: TeamGame, side: 'us' | 'them') => number; dec?: number; unit?: string; lower?: boolean }> = [
  { label: 'Goles esperados (xG)', v: (g, s) => g[s].xg ?? 0, dec: 2 },
  { label: 'Posesión', v: (g, s) => g[s].possessionPercentage ?? 0, dec: 0, unit: '%' },
  { label: 'Remates (al arco)', v: (g, s) => g[s].totalScoringAtt ?? 0 },
  { label: 'Ocasiones claras', v: (g, s) => g[s].bigChanceCreated ?? 0 },
  { label: 'Llegadas al área', v: (g, s) => g[s].penAreaEntries ?? 0 },
  { label: 'Pases', v: (g, s) => g[s].totalPass ?? 0 },
  { label: 'Recuperaciones en campo rival', v: (g, s) => g[s].possWonAtt3rd ?? 0 },
]

function LastMatch({ g, d }: { g: TeamGame; d: CoachData }) {
  const opp = d.league.teamById.get(g.oppId)
  const [home, away] = g.home ? [d.team, opp] : [opp, d.team]
  const [hs, as] = g.home ? [g.gf, g.ga] : [g.ga, g.gf]
  return (
    <WidgetCard title="Último partido" description={`${g.match.stage ?? ''}${g.match.week ? `, fecha ${g.match.week}` : ''} · ${dayMonth(g.match)} · ${g.home ? 'de local' : 'de visitante'}`}
      action={<Link to={`/opta/partido/${g.match.id}`} className="text-xs font-semibold text-brand-green hover:underline whitespace-nowrap">Ver partido completo →</Link>}>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 mb-4">
        <div className="flex items-center gap-2 justify-end min-w-0"><span className="text-sm font-semibold text-apple-gray-800 dark:text-white truncate">{home?.short}</span><TeamDot team={home} size={18} /></div>
        <div className="flex items-center gap-2">
          <span className="text-3xl font-bold tabular-nums text-apple-gray-800 dark:text-white">{hs} - {as}</span>
          <ResultChip r={g.result} />
        </div>
        <div className="flex items-center gap-2 min-w-0"><TeamDot team={away} size={18} /><span className="text-sm font-semibold text-apple-gray-800 dark:text-white truncate">{away?.short}</span></div>
      </div>
      <div className="space-y-2">
        {LAST_ROWS.map(r => {
          const a = r.v(g, 'us'), b = r.v(g, 'them')
          const tot = a + b || 1
          const fmt = (v: number) => `${v.toLocaleString('es-AR', { maximumFractionDigits: r.dec ?? 0, minimumFractionDigits: r.dec ?? 0 })}${r.unit ?? ''}`
          const extra = r.label.startsWith('Remates') ? [` (${g.us.ontargetScoringAtt ?? 0})`, ` (${g.them.ontargetScoringAtt ?? 0})`] : ['', '']
          return (
            <div key={r.label}>
              <div className="flex justify-between text-xs">
                <span className={`tabular-nums font-semibold ${a >= b ? 'text-apple-gray-800 dark:text-white' : 'text-apple-gray-400'}`}>{fmt(a)}{extra[0]}</span>
                <span className="text-apple-gray-500 dark:text-apple-gray-400">{r.label}</span>
                <span className={`tabular-nums font-semibold ${b > a ? 'text-apple-gray-800 dark:text-white' : 'text-apple-gray-400'}`}>{fmt(b)}{extra[1]}</span>
              </div>
              <div className="flex gap-[2px] h-1.5 mt-1">
                <div className="h-full rounded-l-full bg-brand-green" style={{ width: `${(a / tot) * 100}%` }} />
                <div className="h-full rounded-r-full bg-apple-gray-300 dark:bg-apple-gray-600" style={{ width: `${(b / tot) * 100}%` }} />
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-2xs text-apple-gray-400 mt-3">Izquierda: River · derecha: {opp?.short}</p>
    </WidgetCard>
  )
}

function NextMatch({ d, onRival }: { d: CoachData; onRival: () => void }) {
  const m = d.next
  if (!m) return <WidgetCard title="Próximo partido"><p className="text-sm text-apple-gray-400">No hay partidos programados.</p></WidgetCard>
  const home = m.home === TEAM_ID
  const oppId = home ? m.away : m.home
  const opp = d.league.teamById.get(oppId)
  const zone = d.zoneOf(oppId)
  const row = zone?.rows.find(r => r.teamId === oppId)
  const last5 = d.gamesOf(oppId, 'temporada').slice(-5)
  return (
    <section className="relative overflow-hidden bg-white dark:bg-apple-gray-800 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 p-4 sm:p-5">
      <div className="absolute inset-x-0 top-0 h-1 bg-brand-green" />
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand-green">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse-soft" />Próximo partido
        </span>
        <span className="text-xs text-apple-gray-400">{m.stage}{m.week ? `, fecha ${m.week}` : ''}</span>
      </div>
      <div className="flex items-center gap-3 mt-4">
        <TeamDot team={opp} size={44} />
        <div className="min-w-0">
          <div className="text-xl font-bold text-apple-gray-800 dark:text-white truncate">{home ? 'vs' : 'visita a'} {opp?.name}</div>
          <div className="text-sm text-apple-gray-500 dark:text-apple-gray-400 first-letter:uppercase">{kickoff(m)}{m.venue ? ` · ${m.venue}` : ''}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className="bg-apple-gray-50 dark:bg-apple-gray-900/40 rounded-apple-lg px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-apple-gray-400">En su zona</div>
          <div className="text-lg font-bold text-apple-gray-800 dark:text-white tabular-nums">{row ? `${row.rank}º · ${row.pts} pts` : '—'}</div>
        </div>
        <div className="bg-apple-gray-50 dark:bg-apple-gray-900/40 rounded-apple-lg px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-apple-gray-400">Últimos 5</div>
          <div className="flex gap-1 mt-1">{last5.map(g => <ResultChip key={g.match.id} r={g.result} />)}</div>
        </div>
      </div>
      <button type="button" onClick={onRival} className="mt-4 w-full min-h-[40px] rounded-full bg-brand-green text-apple-gray-900 text-sm font-semibold transition-transform duration-200 ease-apple hover:-translate-y-0.5">
        Ver el análisis de {opp?.short}
      </button>
    </section>
  )
}

export function ZoneTable({ table, d, highlight = [] }: { table: StandingTable; d: CoachData; highlight?: string[] }) {
  return (
    <div className="overflow-x-auto -mx-4 sm:-mx-5">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-2xs uppercase tracking-wide text-apple-gray-400 border-b border-apple-gray-100 dark:border-apple-gray-700">
            {['#', 'Equipo', 'PJ', 'G', 'E', 'P', 'Goles', 'Pts'].map((h, i) => <th key={h} className={`py-2 font-semibold ${i === 1 ? 'text-left px-2' : 'text-center px-1.5'} ${i === 0 ? 'pl-4 sm:pl-5' : ''} ${i === 7 ? 'pr-4 sm:pr-5' : ''} ${i === 6 ? 'hidden sm:table-cell' : ''}`}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {table.rows.map(r => {
            const t = d.league.teamById.get(r.teamId)
            const me = r.teamId === TEAM_ID, hl = highlight.includes(r.teamId)
            return (
              <tr key={r.teamId} className={`border-b border-apple-gray-50 dark:border-apple-gray-700/40 last:border-0 ${me ? 'bg-brand-green/[0.08]' : hl ? 'bg-sky-500/[0.07]' : ''}`}>
                <td className="py-1.5 pl-4 sm:pl-5 text-center tabular-nums text-apple-gray-400">{r.rank}</td>
                <td className="py-1.5 px-2">
                  <Link to={`/opta/equipo/${r.teamId}`} className={`inline-flex items-center gap-1.5 max-w-[9.5rem] sm:max-w-none truncate hover:text-brand-green ${me ? 'font-bold text-apple-gray-800 dark:text-white' : 'text-apple-gray-700 dark:text-apple-gray-200'}`}>
                    <TeamDot team={t} size={12} />{t?.short ?? '—'}
                  </Link>
                </td>
                {[r.pj, r.w, r.d, r.l].map((v, i) => <td key={i} className="py-1.5 px-1.5 text-center tabular-nums">{v}</td>)}
                <td className="py-1.5 px-1.5 text-center tabular-nums text-apple-gray-500 hidden sm:table-cell">{r.gf}:{r.ga}</td>
                <td className="py-1.5 px-1.5 pr-4 sm:pr-5 text-center tabular-nums font-bold text-apple-gray-800 dark:text-white">{r.pts}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Fortalezas y debilidades de un equipo (puestos entre los de la liga) y, a pedido, todos los datos. */
export function TeamNumbers({ teamId, pool, name }: { teamId: string; pool: Map<string, TeamGame[]>; name: string }) {
  const [open, setOpen] = useState(false)
  const games = pool.get(teamId) ?? []
  const rows = TEAM_METRICS.map(m => ({ m, r: rankTeams(m, pool).get(teamId)!, avg: leagueAverage(m, pool) }))
  const avgOf = new Map(rows.map(x => [x.m.key, x.avg]))
  const sw = strengthsWeaknesses(teamId, pool, 5)
  const strong = sw.strong.map(x => ({ ...x, avg: avgOf.get(x.m.key) ?? null }))
  const weak = sw.weak.map(x => ({ ...x, avg: avgOf.get(x.m.key) ?? null }))
  const line = ({ m, r, avg }: (typeof rows)[number], tone: string) => (
    <li key={m.key} className="flex items-center gap-3" title={m.help}>
      <span className={`w-10 h-10 rounded-apple-lg flex items-center justify-center flex-shrink-0 text-sm font-bold tabular-nums ${tone}`}>{r.rank}º</span>
      <div className="min-w-0">
        <div className="text-sm font-medium text-apple-gray-800 dark:text-white">{m.label}</div>
        <div className="text-xs text-apple-gray-500 dark:text-apple-gray-400 tabular-nums">{name} {fmtMetric(m, metricValue(m, games))} · liga {fmtMetric(m, avg)}</div>
      </div>
    </li>
  )
  return (
    <div>
      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <h4 className="text-[10px] font-bold uppercase tracking-wide text-brand-green mb-2">Lo mejor</h4>
          {strong.length ? <ul className="space-y-2.5">{strong.map(x => line(x, 'bg-brand-green/15 text-brand-green'))}</ul> : <p className="text-sm text-apple-gray-400">Nada entre los 6 mejores.</p>}
        </div>
        <div>
          <h4 className="text-[10px] font-bold uppercase tracking-wide text-red-500 mb-2">Lo peor</h4>
          {weak.length ? <ul className="space-y-2.5">{weak.map(x => line(x, 'bg-red-500/10 text-red-500'))}</ul> : <p className="text-sm text-apple-gray-400">Nada entre los 6 peores.</p>}
        </div>
      </div>
      <button type="button" onClick={() => setOpen(v => !v)} className="mt-4 text-xs font-semibold text-brand-green hover:underline">
        {open ? 'Ocultar el resto' : `Ver los ${rows.length} datos`}
      </button>
      {open && (
        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4 mt-3">
          {AREAS.map(area => (
            <div key={area}>
              <h4 className="text-[10px] font-bold uppercase tracking-wide text-apple-gray-400 mb-1.5">{AREA_LABEL[area]}</h4>
              <ul className="space-y-2">
                {rows.filter(x => x.m.area === area).map(({ m, r, avg }) => (
                  <li key={m.key} title={m.help}>
                    <div className="flex justify-between gap-2 text-sm">
                      <span className="text-apple-gray-700 dark:text-apple-gray-200 truncate">{m.label}</span>
                      <span className="tabular-nums whitespace-nowrap"><b className="text-apple-gray-800 dark:text-white">{fmtMetric(m, metricValue(m, games))}</b> <span className="text-xs text-apple-gray-400">· {m.neutral ? `${r.rank}º más alto` : `${r.rank}º`} · liga {fmtMetric(m, avg)}</span></span>
                    </div>
                    <div className="mt-1">
                      {m.neutral
                        ? <div className="h-2 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700/60 overflow-hidden"><div className="h-full rounded-full bg-apple-gray-400 dark:bg-apple-gray-500" style={{ width: `${Math.max(3, 100 - ((r.rank - 1) / Math.max(1, pool.size - 1)) * 100)}%` }} /></div>
                        : <PctBar pct={r.pct} />}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PanoramaTab({ d, onRival }: { d: CoachData; onRival: () => void }) {
  const last = d.games[d.games.length - 1]
  const zone = d.zoneOf(TEAM_ID)
  const myRow = zone?.rows.find(r => r.teamId === TEAM_ID)
  const annualRow = d.annual?.rows.find(r => r.teamId === TEAM_ID)
  const all = d.allTeams('torneo')
  const mine = d.gamesOf(TEAM_ID, 'torneo')
  const nextOpp = d.next ? (d.next.home === TEAM_ID ? d.next.away : d.next.home) : null
  const style = readStyle(TEAM_ID, all)
  const facts = factItems(teamFacts(TEAM_ID, all, RIVER_FACT_WORDS))

  return (
    <div className="space-y-5 sm:space-y-6">
      {myRow && (
        <p className="text-sm sm:text-base text-apple-gray-700 dark:text-apple-gray-200 leading-relaxed">
          River está <b className="text-apple-gray-900 dark:text-white">{myRow.rank}º en su zona del Clausura</b> con {myRow.pts} puntos en {myRow.pj} partidos
          ({myRow.w} ganados, {myRow.d} empatados, {myRow.l} perdidos){annualRow ? <>, y <b className="text-apple-gray-900 dark:text-white">{annualRow.rank}º en la tabla anual</b> con {annualRow.pts} puntos</> : null}.
        </p>
      )}

      <div className="grid gap-5 sm:gap-6 lg:grid-cols-2 items-start">
        {last && <LastMatch g={last} d={d} />}
        <NextMatch d={d} onRival={onRival} />
      </div>

      <KeyFacts title="Lo que define a River" subtitle={`Lo más marcado de su juego en el Clausura, comparado con los ${all.size} equipos de la liga.`} items={facts} />

      <div className="grid gap-5 sm:gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] items-start">
        <WidgetCard title="Cómo juega River" description="Cada línea va de un estilo al opuesto; el punto es River y la rayita del medio, el promedio de la liga. Pasá el mouse para ver qué mide.">
          <StyleProfile readings={style} />
        </WidgetCard>
        <div className="space-y-5 sm:space-y-6">
          <WidgetCard title="Cómo viene" description="Los últimos 10 partidos: resultado y goles esperados (xG) de cada lado. Si la barra verde es más alta, River generó más peligro que el rival.">
            <FormStrip games={d.games.slice(-10)} league={d.league} />
          </WidgetCard>
          <WidgetCard title="Por dónde ataca" description="Reparto de sus toques en el último tercio de la cancha, en el Clausura.">
            <LanesBar lanes={lanes(mine)} />
          </WidgetCard>
        </div>
      </div>

      <div className="grid gap-5 sm:gap-6 lg:grid-cols-2 items-start">
        {zone && (
          <WidgetCard title="Tabla de la zona" description={`Clausura ${d.league.meta.season}. En celeste, el próximo rival.`}>
            <ZoneTable table={zone} d={d} highlight={nextOpp ? [nextOpp] : []} />
          </WidgetCard>
        )}
        <WidgetCard title="River en números" description={`En el Clausura, por partido: dónde está entre los mejores y entre los peores de los ${all.size} equipos.`}>
          <TeamNumbers teamId={TEAM_ID} pool={all} name="River" />
        </WidgetCard>
      </div>
    </div>
  )
}
