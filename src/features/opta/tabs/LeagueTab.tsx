import { useState } from 'react'
import type { OptaLeague, OptaPlayer, StandingTable } from '../data'
import { fmt, type OptaMetric } from '../metrics'
import { Card, PlayerLink, Segmented, TeamDot, TeamName } from '../components/ui'

export default function LeagueTab({ league, dg }: { league: OptaLeague; dg: Map<string, unknown> }) {
  return (
    <div className="space-y-5">
      <Standings league={league} />
      <XgTable league={league} />
      <Leaders league={league} dg={dg} />
      <PowerRanking league={league} />
    </div>
  )
}

// ─── Posiciones ─────────────────────────────────────────────────────────────

function Standings({ league }: { league: OptaLeague }) {
  const stages = league.standings.filter(s => s.tables.some(t => t.type === 'total' && t.rows.some(r => r.pj > 0)))
  const annual = league.standings.flatMap(s => s.tables).find(t => t.type === 'championship' && t.rows.length > 15) ?? null
  const options = [...stages.map(s => ({ value: s.name, label: s.name })), ...(annual ? [{ value: '__anual', label: 'Tabla anual' }] : [])]
  const [sel, setSel] = useState(stages[stages.length - 1]?.name ?? options[0]?.value ?? '')
  const tables: StandingTable[] = sel === '__anual' && annual ? [annual] : stages.find(s => s.name === sel)?.tables.filter(t => t.type === 'total') ?? []
  // xG del torneo elegido (la tabla anual usa toda la temporada).
  const xgByTeam = new Map<string, { f: number; a: number }>()
  for (const m of league.matches) {
    if (m.status !== 'Played' || m.hxg === null || m.axg === null) continue
    if (sel !== '__anual' && m.stage !== sel) continue
    const h = xgByTeam.get(m.home) ?? { f: 0, a: 0 }, w = xgByTeam.get(m.away) ?? { f: 0, a: 0 }
    h.f += m.hxg; h.a += m.axg; w.f += m.axg; w.a += m.hxg
    xgByTeam.set(m.home, h); xgByTeam.set(m.away, w)
  }
  return (
    <Card
      title="Posiciones"
      subtitle="Con xG: los goles que su juego merecía según la calidad de las chances. Si hizo muchos más goles que xG, puede estar teniendo suerte."
      action={options.length > 1 ? <Segmented size="sm" value={sel} onChange={setSel} options={options} /> : null}
    >
      <div className={`grid gap-5 ${tables.length > 1 ? 'xl:grid-cols-2' : ''}`}>
        {tables.map((t, i) => <StandingTableView key={i} table={t} league={league} xg={xgByTeam} title={tables.length > 1 ? `Zona ${String.fromCharCode(65 + i)}` : null} />)}
      </div>
    </Card>
  )
}

function StandingTableView({ table, league, title, xg }: { table: StandingTable; league: OptaLeague; title: string | null; xg: Map<string, { f: number; a: number }> }) {
  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      {title && <div className="px-4 sm:px-0 text-xs font-semibold text-apple-gray-500 mb-1">{title}</div>}
      <table className="w-full text-sm min-w-[460px]">
        <thead>
          <tr className="text-2xs uppercase tracking-wide text-apple-gray-400 text-right">
            <th className="py-1.5 pl-4 sm:pl-0 pr-2 text-left font-medium w-6">#</th>
            <th className="py-1.5 pr-2 text-left font-medium">Equipo</th>
            <th className="py-1.5 px-1.5 font-medium">PJ</th>
            <th className="py-1.5 px-1.5 font-medium">G-E-P</th>
            <th className="py-1.5 px-1.5 font-medium">Goles</th>
            <th className="py-1.5 px-1.5 font-medium" title="Goles esperados a favor y en contra en este torneo">xG</th>
            <th className="py-1.5 pl-1.5 pr-4 sm:pr-0 font-medium">Pts</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700/50">
          {table.rows.map(r => {
            const t = league.teamById.get(r.teamId)
            return (
              <tr key={r.teamId} className="text-right tabular-nums">
                <td className="py-1.5 pl-4 sm:pl-0 pr-2 text-left text-apple-gray-400">{r.rank}</td>
                <td className="py-1.5 pr-2 text-left text-apple-gray-800 dark:text-white"><TeamName team={t} /></td>
                <td className="py-1.5 px-1.5 text-apple-gray-500">{r.pj}</td>
                <td className="py-1.5 px-1.5 text-apple-gray-500 whitespace-nowrap">{r.w}-{r.d}-{r.l}</td>
                <td className="py-1.5 px-1.5 text-apple-gray-600 dark:text-apple-gray-300 whitespace-nowrap">{r.gf}:{r.ga}</td>
                <td className="py-1.5 px-1.5 text-apple-gray-500 whitespace-nowrap">{xg.get(r.teamId) ? `${xg.get(r.teamId)!.f.toFixed(1)}:${xg.get(r.teamId)!.a.toFixed(1)}` : '—'}</td>
                <td className="py-1.5 pl-1.5 pr-4 sm:pr-0 font-semibold text-apple-gray-800 dark:text-white">{r.pts}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── xG: quién rinde por encima / por debajo ─────────────────────────────────

function XgTable({ league }: { league: OptaLeague }) {
  const [side, setSide] = useState<'ataque' | 'defensa'>('ataque')
  const rows = league.teams
    .filter(t => t.games > 0)
    .map(t => {
      const goals = t.stats.goals ?? 0, conceded = t.stats.goalsConceded ?? 0
      return side === 'ataque'
        ? { t, real: goals, exp: t.xgFor, diff: goals - t.xgFor }
        : { t, real: conceded, exp: t.xgAgainst, diff: t.xgAgainst - conceded }
    })
    .sort((a, b) => b.diff - a.diff)
  const max = Math.max(1, ...rows.map(r => Math.abs(r.diff)))
  return (
    <Card
      title="Suerte o mérito"
      subtitle={side === 'ataque'
        ? 'Goles hechos menos goles esperados (xG). Arriba: convierten más de lo que generan.'
        : 'Goles esperados en contra menos goles recibidos. Arriba: les hacen menos de lo que conceden (buen arquero o suerte).'}
      action={<Segmented size="sm" value={side} onChange={setSide} options={[{ value: 'ataque', label: 'Ataque' }, { value: 'defensa', label: 'Defensa' }]} />}
    >
      <ul className="lg:columns-2 gap-x-10">
        {rows.map(r => (
          <li key={r.t.id} className="grid grid-cols-[7.5rem_1fr_3.5rem] sm:grid-cols-[9rem_1fr_4rem] items-center gap-2 text-xs py-0.5 break-inside-avoid" title={`${r.real} goles · ${r.exp.toFixed(1)} xG`}>
            <TeamName team={r.t} className="text-apple-gray-700 dark:text-apple-gray-200" />
            <div className="relative h-3.5">
              <div className="absolute inset-y-0 left-1/2 w-px bg-apple-gray-300 dark:bg-apple-gray-600" />
              <div
                className={`absolute inset-y-0.5 rounded ${r.diff >= 0 ? 'bg-emerald-500/75' : 'bg-red-400/75'}`}
                style={r.diff >= 0 ? { left: '50%', width: `${(r.diff / max) * 50}%` } : { right: '50%', width: `${(-r.diff / max) * 50}%` }}
              />
            </div>
            <span className={`text-right tabular-nums font-semibold ${r.diff >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
              {r.diff >= 0 ? '+' : ''}{r.diff.toFixed(1)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

// ─── Líderes ────────────────────────────────────────────────────────────────

const LEADERS: Array<{ title: string; value: (p: OptaPlayer) => number; mt: Pick<OptaMetric, 'decimals' | 'unit'> }> = [
  { title: 'Goles', value: p => p.stats.goals ?? 0, mt: { decimals: 0 } },
  { title: 'xG (goles esperados)', value: p => p.xg.expectedGoals ?? 0, mt: { decimals: 1 } },
  { title: 'Asistencias', value: p => p.stats.goalAssist ?? 0, mt: { decimals: 0 } },
  { title: 'xA (asistencias esperadas)', value: p => p.xg.expectedAssists ?? 0, mt: { decimals: 1 } },
  { title: 'Pases progresivos', value: p => p.ev.prog, mt: { decimals: 0 } },
  { title: 'Regates ganados', value: p => p.stats.wonContest ?? 0, mt: { decimals: 0 } },
  { title: 'Recuperaciones', value: p => p.stats.ballRecovery ?? 0, mt: { decimals: 0 } },
  { title: 'Valor de posesión', value: p => p.pv.totalPossessionValue ?? 0, mt: { decimals: 2 } },
]

function Leaders({ league, dg }: { league: OptaLeague; dg: Map<string, unknown> }) {
  return (
    <Card title="Líderes de la temporada" subtitle="Totales del año (Apertura + Clausura).">
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-5">
        {LEADERS.map(l => {
          const top = [...league.players].sort((a, b) => l.value(b) - l.value(a)).slice(0, 5)
          return (
            <div key={l.title}>
              <div className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 mb-1.5">{l.title}</div>
              <ol className="space-y-1">
                {top.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-2 text-sm">
                    <span className="w-4 text-2xs text-apple-gray-400 tabular-nums">{i + 1}</span>
                    <TeamDot team={league.teamById.get(p.teamId ?? '')} size={10} />
                    <PlayerLink player={p} dg={dg.has(p.id)} className="flex-1" />
                    <span className="tabular-nums font-semibold text-apple-gray-800 dark:text-white">{fmt(l.value(p), l.mt)}</span>
                  </li>
                ))}
              </ol>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// ─── Power ranking de Opta ──────────────────────────────────────────────────

function PowerRanking({ league }: { league: OptaLeague }) {
  const rows = league.teams.filter(t => t.power).sort((a, b) => a.power!.rank - b.power!.rank)
  if (!rows.length) return null
  const lo = Math.min(...rows.map(r => r.power!.rating)), hi = Math.max(...rows.map(r => r.power!.rating))
  return (
    <Card
      title="Power ranking de Opta"
      subtitle={`Rating de fuerza que Opta calcula para cada equipo del mundo (0-100).${league.meta.power?.globalRank ? ` La Liga Profesional es la liga #${league.meta.power.globalRank} del mundo y la #${league.meta.power.confRank} de Sudamérica en su ranking.` : ''}`}
    >
      <ol className="sm:columns-2 gap-x-8">
        {rows.map(t => (
          <li key={t.id} className="grid grid-cols-[1.5rem_8.5rem_1fr_2.5rem] items-center gap-2 text-xs py-0.5 break-inside-avoid">
            <span className="text-apple-gray-400 tabular-nums">{t.power!.rank}</span>
            <TeamName team={t} className="text-apple-gray-700 dark:text-apple-gray-200" />
            <div className="h-2 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700/60 overflow-hidden">
              <div className="h-full rounded-full bg-brand-green/70" style={{ width: `${8 + ((t.power!.rating - lo) / (hi - lo || 1)) * 92}%` }} />
            </div>
            <span className="text-right tabular-nums font-semibold text-apple-gray-800 dark:text-white">{t.power!.rating.toFixed(1)}</span>
          </li>
        ))}
      </ol>
    </Card>
  )
}
