import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import { useElementWidth } from '@/features/tablero/components/useElementWidth'
import { fetchMatchFeed, loadMatchLog, type OptaLeague, type OptaMatch } from '@/features/opta/data'
import { useAgencyInOpta, useAsync, useOptaLeague } from '@/features/opta/hooks'
import { Card, DgBadge, Segmented, TeamDot, fmtDate } from '@/features/opta/components/ui'
import { Pitch, PX, PY } from '@/features/opta/components/pitch'

// Colores fijos local / visitante (par validado para daltonismo, claro y oscuro).
const HOME = { fill: 'fill-[#16a34a]', stroke: 'stroke-[#16a34a]', bg: 'bg-[#16a34a]', text: 'text-[#16a34a]' }
const AWAY = { fill: 'fill-[#2563eb] dark:fill-[#3b82f6]', stroke: 'stroke-[#2563eb] dark:stroke-[#3b82f6]', bg: 'bg-[#2563eb] dark:bg-[#3b82f6]', text: 'text-[#2563eb] dark:text-[#3b82f6]' }

interface Stat { type: string; value: string | number }
interface Ma2 { liveData: { lineUp: Array<{ contestantId: string; formationUsed?: string; stat?: Stat[]; player: Array<{ playerId: string; matchName: string; shirtNumber?: number; position: string; stat?: Stat[] }> }>; goal?: Array<{ contestantId: string; timeMin: number; scorerName?: string; type: string }> } }
interface Ma27 { liveData: { predictions?: Array<{ timeMin: number; periodId: number; prediction: Array<{ type: string; probability: string }> }>; goal?: Array<{ contestantId: string; timeMin: number; scorerName?: string; type: string }> } }
interface Ma12 { liveData: { event?: Array<{ typeId: number; contestantId: string; playerName?: string; timeMin: number; x: number; y: number; qualifier?: Array<{ qualifierId: number; value?: string }> }> } }
interface Ma4 { liveData: { lineUp: Array<{ contestantId: string; player: Array<{ playerId: string; matchName: string; shirtNumber?: number; position: string; x?: number; y?: number; passSuccess?: number; playerPass?: Array<{ playerId: string; value: number }> }> }> } }
interface Ma30 { possessionValue?: Array<{ contestant: Array<{ id: string; lineUp?: { player: Array<{ playerId: string; matchName?: string; pvCategories?: Record<string, Record<string, string | number>> }> } }> }> }

export default function OptaMatchPage() {
  const { id = '' } = useParams()
  const { data: league, loading, error } = useOptaLeague()
  if (loading) return <LoadingSpinner fullScreen message="Cargando partido..." />
  if (error || !league) return <div className="max-w-screen-xl mx-auto px-4 py-8"><EmptyState title="Error" description={error ?? ''} icon="error" /></div>
  const match = league.matchById.get(id)
  if (!match) return <div className="max-w-screen-xl mx-auto px-4 py-8"><EmptyState title="Partido no encontrado" description="" icon="search" /></div>
  return <MatchView league={league} match={match} />
}

function MatchView({ league, match: m }: { league: OptaLeague; match: OptaMatch }) {
  const home = league.teamById.get(m.home), away = league.teamById.get(m.away)
  const ma2 = useAsync(() => fetchMatchFeed<Ma2>('ma2', m.id), [m.id])
  const ma27 = useAsync(() => fetchMatchFeed<Ma27>('ma27', m.id), [m.id])
  const ma12 = useAsync(() => fetchMatchFeed<Ma12>('ma12', m.id), [m.id])
  const ma4 = useAsync(() => fetchMatchFeed<Ma4>('ma4', m.id), [m.id])
  const ma30 = useAsync(() => fetchMatchFeed<Ma30>('ma30', m.id), [m.id])
  const liveDown = [ma2, ma27, ma12].every(s => !s.loading && s.error)
  const goals = ma2.data?.liveData.goal ?? ma27.data?.liveData.goal ?? []

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 pb-28 sm:pb-10 animate-fade-in space-y-5">
      <nav className="flex items-center gap-2 text-sm text-apple-gray-500 dark:text-apple-gray-400">
        <Link to="/opta?tab=partidos" className="hover:text-brand-green transition-colors">Test Opta · Partidos</Link>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        <span className="text-apple-gray-800 dark:text-white font-medium truncate">{home?.short} vs {away?.short}</span>
      </nav>

      <div className="card-apple p-5">
        <div className="text-center text-xs text-apple-gray-400 mb-3">{m.stage}{m.week ? ` · Fecha ${m.week}` : ''} · {fmtDate(m.date)}{m.venue ? ` · ${m.venue}` : ''}</div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <Link to={`/opta/equipo/${m.home}`} className="flex flex-col sm:flex-row items-center sm:justify-end gap-2 text-center sm:text-right hover:text-brand-green">
            <span className="font-semibold text-apple-gray-800 dark:text-white">{home?.name}</span><TeamDot team={home} size={22} />
          </Link>
          <div className="text-center">
            <div className="text-3xl sm:text-4xl font-bold tabular-nums text-apple-gray-800 dark:text-white">{m.hs ?? '-'} : {m.as ?? '-'}</div>
            {m.hxg !== null && <div className="text-xs text-apple-gray-500 tabular-nums mt-0.5" title="Goles esperados por la calidad de las chances">xG {m.hxg.toFixed(2)} – {(m.axg ?? 0).toFixed(2)}</div>}
          </div>
          <Link to={`/opta/equipo/${m.away}`} className="flex flex-col sm:flex-row items-center gap-2 text-center sm:text-left hover:text-brand-green">
            <TeamDot team={away} size={22} /><span className="font-semibold text-apple-gray-800 dark:text-white">{away?.name}</span>
          </Link>
        </div>
        {goals.length > 0 && (
          <div className="grid grid-cols-2 gap-6 mt-3 text-xs text-apple-gray-500">
            <div className="text-right space-y-0.5">{goals.filter(g => g.contestantId === m.home).map((g, i) => <div key={i}>{g.scorerName} {g.timeMin}'{g.type === 'OG' ? ' (e/c)' : g.type === 'PG' ? ' (p)' : ''}</div>)}</div>
            <div className="space-y-0.5">{goals.filter(g => g.contestantId === m.away).map((g, i) => <div key={i}>{g.scorerName} {g.timeMin}'{g.type === 'OG' ? ' (e/c)' : g.type === 'PG' ? ' (p)' : ''}</div>)}</div>
          </div>
        )}
      </div>

      {liveDown && (
        <div className="px-4 py-3 rounded-apple-lg bg-amber-50 dark:bg-amber-900/20 text-sm text-amber-800 dark:text-amber-200">
          No se pudo consultar a Opta en vivo ({ma2.error}). Abajo quedan los datos guardados del partido.
        </div>
      )}

      <Momentum state={ma27} match={m} league={league} />

      <div className="grid lg:grid-cols-2 gap-5">
        <MatchShots state={ma12} match={m} league={league} />
        <TeamStats state={ma2} match={m} league={league} />
      </div>

      <PassNetwork state={ma4} match={m} league={league} />
      <PlayersOfMatch match={m} league={league} pv={ma30} />
    </div>
  )
}

type Async<T> = { data: T | null; error: string | null; loading: boolean }

function LiveBlock<T>({ state, children, title, subtitle }: { state: Async<T>; children: (d: T) => React.ReactNode; title: string; subtitle?: string }) {
  return (
    <Card title={title} subtitle={subtitle}>
      {state.loading ? <div className="h-48 rounded-apple bg-apple-gray-100 dark:bg-apple-gray-700/40 animate-pulse" />
        : state.error || !state.data ? <p className="text-sm text-apple-gray-400 py-8 text-center">{state.error ?? 'Sin datos'}</p>
        : children(state.data)}
    </Card>
  )
}

// ─── Momentum ───────────────────────────────────────────────────────────────

function Momentum({ state, match: m, league }: { state: Async<Ma27>; match: OptaMatch; league: OptaLeague }) {
  const [boxRef, W] = useElementWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  return (
    <LiveBlock state={state} title="Momentum del partido" subtitle="Quién dominaba en cada minuto según el modelo de Opta (arriba: local, abajo: visitante). Las marcas son los goles.">
      {d => {
        const pts = (d.liveData.predictions ?? []).map(p => ({ min: p.timeMin, v: Number(p.prediction.find(x => x.type === 'Combined')?.probability ?? 0) })).sort((a, b) => a.min - b.min)
        if (!pts.length) return <p className="text-sm text-apple-gray-400">Sin datos de momentum.</p>
        const H = 200, P = { l: 8, r: 8, t: 14, b: 22 }
        const maxMin = Math.max(90, ...pts.map(p => p.min))
        const maxV = Math.max(0.05, ...pts.map(p => Math.abs(p.v)))
        const bw = (W - P.l - P.r) / (maxMin + 1)
        const mid = P.t + (H - P.t - P.b) / 2
        const half = (H - P.t - P.b) / 2
        const X = (min: number) => P.l + min * bw
        const goals = d.liveData.goal ?? []
        const hp = hover !== null ? pts[hover] : null
        return (
          <div ref={boxRef} className="relative">
            <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block w-full h-auto" role="img" aria-label="Momentum minuto a minuto">
              <line x1={P.l} x2={W - P.r} y1={mid} y2={mid} className="stroke-apple-gray-300 dark:stroke-apple-gray-600" />
              <line x1={X(45)} x2={X(45)} y1={P.t} y2={H - P.b} className="stroke-apple-gray-200 dark:stroke-apple-gray-700" strokeDasharray="3 3" />
              {pts.map((p, i) => {
                const h = (Math.abs(p.v) / maxV) * half
                return (
                  <rect key={i} x={X(p.min) + 0.5} width={Math.max(1, bw - 1)} y={p.v >= 0 ? mid - h : mid} height={Math.max(0.5, h)} rx={Math.min(2, bw / 3)}
                    className={p.v >= 0 ? HOME.fill : AWAY.fill} opacity={hover === null || hover === i ? 0.85 : 0.4}
                    onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
                )
              })}
              {goals.map((g, i) => {
                const homeGoal = (g.contestantId === m.home) !== (g.type === 'OG')
                return (
                  <g key={i}>
                    <line x1={X(g.timeMin) + bw / 2} x2={X(g.timeMin) + bw / 2} y1={P.t} y2={H - P.b} className="stroke-apple-gray-500" strokeWidth={1} />
                    <circle cx={X(g.timeMin) + bw / 2} cy={homeGoal ? P.t + 4 : H - P.b - 4} r={4} className={`${homeGoal ? HOME.fill : AWAY.fill} stroke-white dark:stroke-apple-gray-800`} strokeWidth={1.5} />
                  </g>
                )
              })}
              {[0, 15, 30, 45, 60, 75, 90].map(t => <text key={t} x={X(t) + bw / 2} y={H - 6} textAnchor="middle" className="text-[10px] fill-apple-gray-400">{t}'</text>)}
            </svg>
            <div className="flex justify-between text-xs mt-1">
              <span className={`inline-flex items-center gap-1.5 ${HOME.text}`}><span className={`w-2.5 h-2.5 rounded-sm ${HOME.bg}`} />{league.teamById.get(m.home)?.short}</span>
              <span className={`inline-flex items-center gap-1.5 ${AWAY.text}`}><span className={`w-2.5 h-2.5 rounded-sm ${AWAY.bg}`} />{league.teamById.get(m.away)?.short}</span>
            </div>
            {hp && <div className="absolute top-0 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-apple bg-white/95 dark:bg-apple-gray-800/95 shadow border border-apple-gray-200 dark:border-apple-gray-700 text-xs pointer-events-none">Minuto {hp.min}: domina {hp.v >= 0 ? league.teamById.get(m.home)?.short : league.teamById.get(m.away)?.short}</div>}
          </div>
        )
      }}
    </LiveBlock>
  )
}

// ─── Remates del partido ────────────────────────────────────────────────────

function MatchShots({ state, match: m, league }: { state: Async<Ma12>; match: OptaMatch; league: OptaLeague }) {
  const [hover, setHover] = useState<number | null>(null)
  return (
    <LiveBlock state={state} title="Remates y xG" subtitle={`${league.teamById.get(m.home)?.short} ataca hacia la derecha y ${league.teamById.get(m.away)?.short} hacia la izquierda. Tamaño = xG; relleno = gol.`}>
      {d => {
        const shots = (d.liveData.event ?? []).filter(e => [13, 14, 15, 16].includes(e.typeId)).map(e => {
          const q = new Map((e.qualifier ?? []).map(x => [x.qualifierId, x.value]))
          const isHome = e.contestantId === m.home
          return { home: isHome, x: isHome ? e.x : 100 - e.x, y: isHome ? e.y : 100 - e.y, xg: Number(q.get(321) ?? 0), goal: e.typeId === 16 && !q.has(28), name: e.playerName ?? '', min: e.timeMin }
        })
        const h = hover !== null ? shots[hover] : null
        return (
          <div className="relative">
            <Pitch label="Remates del partido" arrow={false}>
              {shots.map((s, i) => (
                <circle key={i} cx={PX(s.x)} cy={PY(s.y)} r={0.9 + Math.sqrt(s.xg) * 3.6}
                  className={`${s.home ? HOME.stroke : AWAY.stroke} ${s.goal ? (s.home ? HOME.fill : AWAY.fill) : 'fill-transparent'}`}
                  strokeWidth={0.4} opacity={hover === null || hover === i ? 1 : 0.35}
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
              ))}
            </Pitch>
            {h && <div className="absolute left-2 top-2 px-2.5 py-1.5 rounded-apple bg-white/95 dark:bg-apple-gray-800/95 shadow border border-apple-gray-200 dark:border-apple-gray-700 text-xs pointer-events-none"><b>{h.name}</b> {h.min}' · xG {h.xg.toFixed(2)}{h.goal ? ' · GOL' : ''}</div>}
          </div>
        )
      }}
    </LiveBlock>
  )
}

// ─── Estadísticas de equipo ─────────────────────────────────────────────────

const TEAM_ROWS: Array<{ key: string; label: string; pct?: boolean; lower?: boolean }> = [
  { key: 'possessionPercentage', label: 'Posesión', pct: true },
  { key: 'totalScoringAtt', label: 'Remates' },
  { key: 'ontargetScoringAtt', label: 'Al arco' },
  { key: 'bigChanceCreated', label: 'Chances claras' },
  { key: 'totalPass', label: 'Pases' },
  { key: 'accuratePass', label: 'Pases buenos' },
  { key: 'successfulFinalThirdPasses', label: 'Pases al último tercio' },
  { key: 'penAreaEntries', label: 'Llegadas al área' },
  { key: 'wonCorners', label: 'Córners' },
  { key: 'possWonAtt3rd', label: 'Recuperaciones arriba' },
  { key: 'ppda', label: 'PPDA (menos = más presión)', lower: true },
  { key: 'fkFoulLost', label: 'Faltas', lower: true },
]

function TeamStats({ state, match: m, league }: { state: Async<Ma2>; match: OptaMatch; league: OptaLeague }) {
  return (
    <LiveBlock state={state} title="Números del partido">
      {d => {
        const byTeam = Object.fromEntries(d.liveData.lineUp.map(l => [l.contestantId, Object.fromEntries((l.stat ?? []).map(s => [s.type, Number(s.value)]))]))
        const hs = byTeam[m.home] ?? {}, as = byTeam[m.away] ?? {}
        const form = Object.fromEntries(d.liveData.lineUp.map(l => [l.contestantId, l.formationUsed]))
        return (
          <div>
            <div className="flex justify-between text-xs font-semibold mb-2">
              <span className={HOME.text}>{league.teamById.get(m.home)?.short}{form[m.home] ? ` · ${String(form[m.home]).split('').join('-')}` : ''}</span>
              <span className={AWAY.text}>{form[m.away] ? `${String(form[m.away]).split('').join('-')} · ` : ''}{league.teamById.get(m.away)?.short}</span>
            </div>
            <ul className="space-y-2">
              {TEAM_ROWS.filter(r => hs[r.key] !== undefined || as[r.key] !== undefined).map(r => {
                const a = hs[r.key] ?? 0, b = as[r.key] ?? 0
                const total = a + b || 1
                return (
                  <li key={r.key}>
                    <div className="flex justify-between text-sm tabular-nums">
                      <span className="font-semibold text-apple-gray-800 dark:text-white">{r.pct ? `${a.toFixed(0)}%` : r.key === 'ppda' ? a.toFixed(1) : a}</span>
                      <span className="text-xs text-apple-gray-500">{r.label}</span>
                      <span className="font-semibold text-apple-gray-800 dark:text-white">{r.pct ? `${b.toFixed(0)}%` : r.key === 'ppda' ? b.toFixed(1) : b}</span>
                    </div>
                    <div className="flex gap-0.5 h-1.5 mt-1">
                      <div className={`rounded-l-full ${HOME.bg}`} style={{ width: `${(a / total) * 100}%`, opacity: 0.8 }} />
                      <div className={`rounded-r-full ${AWAY.bg}`} style={{ width: `${(b / total) * 100}%`, opacity: 0.8 }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      }}
    </LiveBlock>
  )
}

// ─── Red de pases ───────────────────────────────────────────────────────────

function PassNetwork({ state, match: m, league }: { state: Async<Ma4>; match: OptaMatch; league: OptaLeague }) {
  const [side, setSide] = useState<'home' | 'away'>('home')
  const teamId = side === 'home' ? m.home : m.away
  return (
    <Card
      title="Red de pases"
      subtitle="Cada círculo es un titular en su posición promedio (más grande = más pases buenos). Las líneas unen a los que más se pasaron la pelota: muestra el dibujo real y por dónde circula el juego."
      action={<Segmented size="sm" value={side} onChange={setSide} options={[{ value: 'home', label: league.teamById.get(m.home)?.short ?? 'Local' }, { value: 'away', label: league.teamById.get(m.away)?.short ?? 'Visitante' }]} />}
    >
      {state.loading ? <div className="h-64 rounded-apple bg-apple-gray-100 dark:bg-apple-gray-700/40 animate-pulse" />
        : state.error || !state.data ? <p className="text-sm text-apple-gray-400 py-8 text-center">{state.error ?? 'Sin datos'}</p>
        : <NetworkPitch data={state.data} teamId={teamId} home={side === 'home'} />}
    </Card>
  )
}

function NetworkPitch({ data, teamId, home }: { data: Ma4; teamId: string; home: boolean }) {
  const [hover, setHover] = useState<string | null>(null)
  const lu = data.liveData.lineUp.find(l => l.contestantId === teamId)
  const players = (lu?.player ?? []).filter(p => p.position !== 'Substitute' && p.x !== undefined && p.y !== undefined)
  if (!players.length) return <p className="text-sm text-apple-gray-400 py-8 text-center">Opta no trae posiciones promedio para este equipo.</p>
  const byId = new Map(players.map(p => [p.playerId, p]))
  const links = new Map<string, { a: string; b: string; n: number }>()
  for (const p of players) for (const pp of p.playerPass ?? []) {
    if (!byId.has(pp.playerId)) continue
    const k = [p.playerId, pp.playerId].sort().join('|')
    const cur = links.get(k) ?? { a: p.playerId, b: pp.playerId, n: 0 }
    cur.n += pp.value
    links.set(k, cur)
  }
  const ls = [...links.values()].filter(l => l.n >= 3)
  const maxN = Math.max(1, ...ls.map(l => l.n))
  const maxP = Math.max(1, ...players.map(p => p.passSuccess ?? 0))
  const c = home ? HOME : AWAY
  return (
    <div className="max-w-3xl mx-auto">
      <Pitch label="Red de pases">
        {ls.map((l, i) => {
          const a = byId.get(l.a)!, b = byId.get(l.b)!
          const on = !hover || hover === l.a || hover === l.b
          return <line key={i} x1={PX(a.x!)} y1={PY(a.y!)} x2={PX(b.x!)} y2={PY(b.y!)} className={c.stroke} strokeWidth={0.25 + (l.n / maxN) * 1.6} strokeLinecap="round" opacity={on ? 0.25 + (l.n / maxN) * 0.6 : 0.06} />
        })}
        {players.map(p => {
          const r = 1.6 + ((p.passSuccess ?? 0) / maxP) * 2.2
          return (
            <g key={p.playerId} onMouseEnter={() => setHover(p.playerId)} onMouseLeave={() => setHover(null)} style={{ cursor: 'default' }}>
              <circle cx={PX(p.x!)} cy={PY(p.y!)} r={r} className={`${c.fill} stroke-white dark:stroke-apple-gray-900`} strokeWidth={0.4} />
              <text x={PX(p.x!)} y={PY(p.y!) + 0.9} textAnchor="middle" className="fill-white font-bold" style={{ fontSize: 2.4 }}>{p.shirtNumber ?? ''}</text>
              <text x={PX(p.x!)} y={PY(p.y!) + r + 2.6} textAnchor="middle" className="fill-apple-gray-700 dark:fill-apple-gray-200" style={{ fontSize: 2 }}>{p.matchName}</text>
            </g>
          )
        })}
      </Pitch>
      <p className="text-xs text-apple-gray-400 mt-2">Ataca hacia la derecha. Pasá el mouse por un jugador para ver solo sus conexiones. Líneas con 3 pases o más.</p>
    </div>
  )
}

// ─── Jugadores del partido (valor de posesión) ──────────────────────────────

function PlayersOfMatch({ match: m, league, pv }: { match: OptaMatch; league: OptaLeague; pv: Async<Ma30> }) {
  const log = useAsync(loadMatchLog, [])
  const dg = useAgencyInOpta(league)
  const rows = useMemo(() => {
    if (!log.data) return []
    const live = new Map<string, number>()
    for (const c of pv.data?.possessionValue?.[0]?.contestant ?? []) for (const p of c.lineUp?.player ?? []) {
      const v = p.pvCategories?.totalPossessionValue
      if (v) live.set(p.playerId, Number(Object.values(v)[0]))
    }
    const out: Array<{ id: string; team: string; min: number; goals: number; assists: number; xg: number; pv: number | null; touches: number }> = []
    for (const [pid, rs] of Object.entries(log.data)) for (const r of rs) if (r.match === m.id) {
      out.push({ id: pid, team: r.team, min: r.min, goals: r.goals, assists: r.assists, xg: r.xg, pv: live.get(pid) ?? r.pv, touches: r.touches })
    }
    return out.sort((a, b) => (b.pv ?? -9) - (a.pv ?? -9))
  }, [log.data, pv.data, m.id])
  if (log.loading) return null
  return (
    <Card title="Quién aportó más" subtitle="Valor de posesión: cuánto subió (o bajó) cada jugador la chance de gol de su equipo con sus acciones en este partido. Modelo de Opta.">
      <div className="grid md:grid-cols-2 gap-x-8">
        {[m.home, m.away].map(tid => (
          <div key={tid}>
            <div className={`text-xs font-semibold mb-1.5 ${tid === m.home ? HOME.text : AWAY.text}`}>{league.teamById.get(tid)?.name}</div>
            <ul className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700/50">
              {rows.filter(r => r.team === tid).map(r => {
                const p = league.playerById.get(r.id)
                if (!p) return null
                return (
                  <li key={r.id} className="py-1.5 flex items-center gap-2 text-sm">
                    <Link to={`/opta/jugador/${r.id}`} className="flex-1 min-w-0 truncate text-apple-gray-800 dark:text-white hover:text-brand-green">{p.name}{dg.has(r.id) && <DgBadge className="ml-1.5" />}</Link>
                    <span className="text-xs text-apple-gray-400 tabular-nums">{r.min}'{r.goals ? ` · ${r.goals}G` : ''}{r.assists ? ` · ${r.assists}A` : ''}{r.xg ? ` · xG ${r.xg.toFixed(2)}` : ''}</span>
                    <span className={`w-12 text-right text-xs font-semibold tabular-nums ${r.pv === null ? 'text-apple-gray-400' : r.pv >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{r.pv === null ? '—' : r.pv.toFixed(2)}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  )
}
