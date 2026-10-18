import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import { PlayerPhoto } from '@/components/ui/PlayerPhoto'
import { loadHeatmaps, loadMatchLog, loadShots, type OptaLeague, type OptaShot, type OptaTeam } from '@/features/opta/data'
import { useAgencyInOpta, useAsync, useOptaLeague, usePercentiles } from '@/features/opta/hooks'
import { monthsLeft, POS_SHORT, profileScore, type PercentileIndex } from '@/features/opta/metrics'
import { Card, DgBadge, PctPill, Segmented, TeamDot, TeamName, Tile, fmtDate, pctTone } from '@/features/opta/components/ui'
import { Heatmap, ShotMap } from '@/features/opta/components/pitch'

/** Indicadores de estilo por partido, con percentil contra los 30 equipos. */
const STYLE: Array<{ key: string; label: string; help: string; value: (t: OptaTeam) => number; lower?: boolean; unit?: string; dec?: number }> = [
  { key: 'poss', label: 'Posesión', help: 'Porcentaje de tenencia promedio.', value: t => (t.stats.possessionPercentage ?? 0) / t.games, unit: '%', dec: 1 },
  { key: 'ppda', label: 'Presión (PPDA)', help: 'Pases que deja dar al rival antes de una acción defensiva. Menos = presiona más.', value: t => (t.stats.ppda ?? 0) / t.games, lower: true, dec: 1 },
  { key: 'xg', label: 'xG a favor', help: 'Goles esperados por partido.', value: t => t.xgFor / t.games, dec: 2 },
  { key: 'xga', label: 'xG en contra', help: 'Goles esperados del rival por partido. Menos es mejor.', value: t => t.xgAgainst / t.games, lower: true, dec: 2 },
  { key: 'passes', label: 'Pases por partido', help: 'Volumen de juego asociado.', value: t => (t.stats.totalPass ?? 0) / t.games, dec: 0 },
  { key: 'long', label: '% de pelotas largas', help: 'Qué parte de sus pases son largos: más alto = juego más directo.', value: t => ((t.stats.totalLongBalls ?? 0) / Math.max(1, t.stats.totalPass ?? 0)) * 100, unit: '%', dec: 1 },
  { key: 'cross', label: 'Centros por partido', help: 'Cuánto busca por afuera.', value: t => (t.stats.totalCrossNocorner ?? 0) / t.games, dec: 1 },
  { key: 'fast', label: 'Contraataques', help: 'Remates de contraataque por partido.', value: t => (t.stats.shotFastbreak ?? 0) / t.games, dec: 2 },
  { key: 'high', label: 'Recuperaciones arriba', help: 'Pelotas ganadas en el último tercio por partido.', value: t => (t.stats.possWonAtt3rd ?? 0) / t.games, dec: 1 },
  { key: 'box', label: 'Llegadas al área', help: 'Entradas al área rival por partido.', value: t => (t.stats.penAreaEntries ?? 0) / t.games, dec: 1 },
]

export default function OptaTeamPage() {
  const { id = '' } = useParams()
  const { data: league, loading, error } = useOptaLeague()
  const idx = usePercentiles(league)
  if (loading) return <LoadingSpinner fullScreen message="Cargando equipo..." />
  if (error || !league || !idx) return <div className="max-w-screen-xl mx-auto px-4 py-8"><EmptyState title="Error" description={error ?? ''} icon="error" /></div>
  const team = league.teamById.get(id)
  if (!team || !team.games) return <div className="max-w-screen-xl mx-auto px-4 py-8"><EmptyState title="Equipo no encontrado" description="" icon="search" /></div>
  return <TeamView league={league} team={team} idx={idx} />
}

function TeamView({ league, team, idx }: { league: OptaLeague; team: OptaTeam; idx: PercentileIndex }) {
  const navigate = useNavigate()
  const dg = useAgencyInOpta(league)
  const maps = useAsync(loadHeatmaps, [])
  const shots = useAsync(loadShots, [])
  const log = useAsync(loadMatchLog, [])
  const [shotSide, setShotSide] = useState<'for' | 'against'>('for')
  const teams = league.teams.filter(t => t.games > 0)
  const squad = league.players.filter(p => p.teamId === team.id).sort((a, b) => b.minutes - a.minutes)
  const matches = league.matches.filter(m => m.status === 'Played' && (m.home === team.id || m.away === team.id)).sort((a, b) => b.date.localeCompare(a.date))
  const pts = matches.reduce((s, m) => {
    const gf = m.home === team.id ? m.hs ?? 0 : m.as ?? 0, ga = m.home === team.id ? m.as ?? 0 : m.hs ?? 0
    return s + (gf > ga ? 3 : gf === ga ? 1 : 0)
  }, 0)

  const style = STYLE.map(s => {
    const vals = teams.map(s.value)
    const v = s.value(team)
    const below = vals.filter(x => (s.lower ? x > v : x < v)).length
    return { ...s, v, pct: Math.round((below / Math.max(1, vals.length - 1)) * 100), rank: vals.filter(x => (s.lower ? x < v : x > v)).length + 1 }
  })

  // Mapa de calor del equipo: suma de los mapas de su plantel actual.
  const teamHeat = useMemo(() => {
    if (!maps.data) return null
    const g = new Array(96).fill(0)
    for (const p of squad) { const m = maps.data[p.id]; if (m) m.t.forEach((v, i) => { g[i] += v }) }
    return g
  }, [maps.data, squad])

  // Remates a favor / en contra (con el equipo que jugaba cada uno en ese partido).
  const teamShots = useMemo(() => {
    if (!shots.data || !log.data) return { for: [] as OptaShot[], against: [] as OptaShot[] }
    const teamIn = new Map<string, string>()
    for (const [pid, rows] of Object.entries(log.data)) for (const r of rows) teamIn.set(`${pid}|${r.match}`, r.team)
    const ids = new Set(matches.map(m => m.id))
    const out = { for: [] as OptaShot[], against: [] as OptaShot[] }
    for (const [pid, list] of Object.entries(shots.data)) for (const s of list) {
      if (!ids.has(s[5])) continue
      ;(teamIn.get(`${pid}|${s[5]}`) === team.id ? out.for : out.against).push(s)
    }
    return out
  }, [shots.data, log.data, matches, team.id])

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 pb-28 sm:pb-10 animate-fade-in space-y-5">
      <nav className="flex items-center gap-2 text-sm text-apple-gray-500 dark:text-apple-gray-400">
        <Link to="/opta?tab=equipos" className="hover:text-brand-green transition-colors">Test Opta · Equipos</Link>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        <span className="text-apple-gray-800 dark:text-white font-medium truncate">{team.name}</span>
      </nav>

      <div className="card-apple p-5 flex flex-wrap items-center gap-4">
        <TeamDot team={team} size={44} />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-apple-gray-800 dark:text-white tracking-tight">{team.name}</h1>
          <p className="text-sm text-apple-gray-500">{team.venue ?? ''}{team.formation ? ` · dibujo más usado ${team.formation.split('').join('-')}` : ''}{team.power ? ` · #${team.power.rank} en el power ranking de Opta (${team.power.rating.toFixed(1)})` : ''}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="Partidos" value={matches.length} hint={`${pts} puntos (${(pts / Math.max(1, matches.length)).toFixed(2)} por partido)`} />
        <Tile label="Goles" value={`${team.stats.goals ?? 0} : ${team.stats.goalsConceded ?? 0}`} hint="a favor : en contra" />
        <Tile label="xG" value={`${team.xgFor.toFixed(1)} : ${team.xgAgainst.toFixed(1)}`} hint="esperados a favor : en contra" />
        <Tile label="Diferencia" value={`${((team.stats.goals ?? 0) - team.xgFor >= 0 ? '+' : '')}${((team.stats.goals ?? 0) - team.xgFor).toFixed(1)}`} hint="goles hechos menos xG" />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="Cómo juega" subtitle="Cada indicador por partido, comparado con los 30 equipos de la liga (barra = percentil).">
          <ul className="space-y-2">
            {style.map(s => {
              const tone = pctTone(s.pct)
              return (
                <li key={s.key} title={s.help}>
                  <div className="flex justify-between text-sm">
                    <span className="text-apple-gray-700 dark:text-apple-gray-200">{s.label}</span>
                    <span className="tabular-nums"><b className="text-apple-gray-800 dark:text-white">{s.v.toFixed(s.dec ?? 1)}{s.unit ?? ''}</b> <span className="text-xs text-apple-gray-400">· {s.rank}º de {teams.length}</span></span>
                  </div>
                  <div className="h-2 mt-1 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700/60 overflow-hidden"><div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${s.pct}%` }} /></div>
                </li>
              )
            })}
          </ul>
        </Card>
        <Card title="Por dónde juega" subtitle="Acciones con pelota de todo el plantel en la temporada (ataca hacia la derecha).">
          {teamHeat ? <Heatmap grid={teamHeat} label={`Mapa de calor de ${team.name}`} /> : <div className="h-48 rounded-apple bg-apple-gray-100 dark:bg-apple-gray-700/40 animate-pulse" />}
        </Card>
      </div>

      <Card title={shotSide === 'for' ? 'Remates a favor' : 'Remates en contra'}
        subtitle={shotSide === 'for' ? `${teamShots.for.length} remates, ${teamShots.for.reduce((s, x) => s + x[2], 0).toFixed(1)} xG.` : `${teamShots.against.length} remates recibidos, ${teamShots.against.reduce((s, x) => s + x[2], 0).toFixed(1)} xG: desde dónde le llegan.`}
        action={<Segmented size="sm" value={shotSide} onChange={setShotSide} options={[{ value: 'for', label: 'A favor' }, { value: 'against', label: 'En contra' }]} />}>
        {shots.loading || log.loading ? <div className="h-48 rounded-apple bg-apple-gray-100 dark:bg-apple-gray-700/40 animate-pulse" /> : <div className="max-w-2xl mx-auto"><ShotMap shots={teamShots[shotSide]} league={league} playerTeamId={shotSide === 'for' ? team.id : null} /></div>}
      </Card>

      <Card title="Plantel" subtitle="Ordenado por minutos. Nota = percentiles en su puesto contra toda la liga.">
        <div className="overflow-x-auto -mx-4 sm:-mx-5">
          <table className="w-full text-sm min-w-[620px]">
            <thead>
              <tr className="text-2xs uppercase tracking-wide text-apple-gray-400">
                <th className="py-2 pl-4 sm:pl-5 pr-2 text-left font-medium">Jugador</th>
                <th className="py-2 px-2 text-center font-medium">Pos</th>
                <th className="py-2 px-2 text-center font-medium">Edad</th>
                <th className="py-2 px-2 text-center font-medium">Min</th>
                <th className="py-2 px-2 text-center font-medium">G</th>
                <th className="py-2 px-2 text-center font-medium">A</th>
                <th className="py-2 px-2 text-center font-medium">Contrato</th>
                <th className="py-2 pl-2 pr-4 sm:pr-5 text-center font-medium">Nota</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700/50">
              {squad.map(p => {
                const ml = monthsLeft(p.contractEnd)
                return (
                  <tr key={p.id} className="hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/30 cursor-pointer" onClick={() => navigate(`/opta/jugador/${p.id}`)}>
                    <td className="py-2 pl-4 sm:pl-5 pr-2"><div className="flex items-center gap-2.5"><PlayerPhoto name={p.name} size="xs" /><span className="font-medium text-apple-gray-800 dark:text-white truncate">{p.name}</span>{dg.has(p.id) && <DgBadge />}</div></td>
                    <td className="py-2 px-2 text-center text-xs font-semibold text-apple-gray-500">{POS_SHORT[p.pos]}</td>
                    <td className="py-2 px-2 text-center tabular-nums text-apple-gray-600 dark:text-apple-gray-300">{p.age ?? '—'}</td>
                    <td className="py-2 px-2 text-center tabular-nums text-apple-gray-600 dark:text-apple-gray-300">{p.minutes}</td>
                    <td className="py-2 px-2 text-center tabular-nums text-apple-gray-800 dark:text-white">{p.stats.goals || ''}</td>
                    <td className="py-2 px-2 text-center tabular-nums text-apple-gray-800 dark:text-white">{p.stats.goalAssist || ''}</td>
                    <td className={`py-2 px-2 text-center tabular-nums text-xs ${ml !== null && ml <= 6 ? 'text-orange-500 font-semibold' : ml !== null && ml <= 12 ? 'text-amber-500' : 'text-apple-gray-500'}`}>{p.contractEnd ? fmtDate(p.contractEnd) : '—'}</td>
                    <td className="py-2 pl-2 pr-4 sm:pr-5 text-center"><PctPill pct={p.minutes >= idx.minMinutes ? profileScore(p, idx) : null} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Resultados">
        <ul className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700/50">
          {matches.map(m => {
            const homeSide = m.home === team.id
            const opp = league.teamById.get(homeSide ? m.away : m.home)
            const gf = homeSide ? m.hs : m.as, ga = homeSide ? m.as : m.hs
            const xf = homeSide ? m.hxg : m.axg, xa = homeSide ? m.axg : m.hxg
            const res = (gf ?? 0) > (ga ?? 0) ? 'G' : gf === ga ? 'E' : 'P'
            return (
              <li key={m.id}>
                <Link to={`/opta/partido/${m.id}`} className="py-2 flex items-center gap-3 text-sm hover:text-brand-green">
                  <span className="w-16 text-xs text-apple-gray-400 tabular-nums">{fmtDate(m.date)}</span>
                  <span className={`w-5 text-center rounded text-2xs font-bold ${res === 'G' ? 'bg-emerald-500/15 text-emerald-600' : res === 'P' ? 'bg-red-500/15 text-red-600' : 'bg-apple-gray-200 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300'}`}>{res}</span>
                  <span className="text-xs text-apple-gray-400 w-3">{homeSide ? 'L' : 'V'}</span>
                  <TeamName team={opp} className="flex-1 text-apple-gray-700 dark:text-apple-gray-200" />
                  <span className="tabular-nums font-semibold text-apple-gray-800 dark:text-white">{gf}-{ga}</span>
                  {xf !== null && xa !== null && <span className="hidden sm:inline w-24 text-right text-xs text-apple-gray-400 tabular-nums">xG {xf.toFixed(1)}-{xa.toFixed(1)}</span>}
                </Link>
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}
