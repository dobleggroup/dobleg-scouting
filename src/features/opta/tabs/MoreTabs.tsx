import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PlayerPhoto } from '@/components/ui/PlayerPhoto'
import EmptyState from '@/components/ui/EmptyState'
import type { AgencyPlayer } from '@/constants/agencyPlayers'
import type { AppPos, OptaLeague, OptaPlayer } from '../data'
import {
  fmt, metric, POS_ORDER, MIN_MINUTES_FOR_PCT, monthsLeft, POS_LABEL, POS_SHORT, profileScore, strengthsAndWeaknesses,
  type PercentileIndex,
} from '../metrics'
import { Card, DgBadge, PctPill, Segmented, TeamDot, TeamName, fmtDate } from '../components/ui'

// ─── Partidos ───────────────────────────────────────────────────────────────

export function MatchesListTab({ league }: { league: OptaLeague }) {
  const stages = [...new Set(league.matches.map(m => m.stage ?? ''))].filter(Boolean)
  const lastPlayed = [...league.matches].filter(m => m.status === 'Played').sort((a, b) => b.date.localeCompare(a.date))[0]
  const [stage, setStage] = useState(lastPlayed?.stage ?? stages[0] ?? '')
  const weeks = [...new Set(league.matches.filter(m => m.stage === stage).map(m => m.week ?? ''))].sort((a, b) => Number(a) - Number(b))
  const [week, setWeek] = useState(lastPlayed?.stage === stage ? lastPlayed?.week ?? weeks[0] : weeks[0])
  const list = league.matches.filter(m => m.stage === stage && (weeks.length <= 1 || m.week === week)).sort((a, b) => a.date.localeCompare(b.date))
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={stage} onChange={e => { setStage(e.target.value); setWeek(league.matches.find(m => m.stage === e.target.value)?.week ?? '') }} className="input-apple text-xs py-1.5 px-3 min-w-0 w-auto">
          {stages.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {weeks.length > 1 && (
          <select value={week ?? ''} onChange={e => setWeek(e.target.value)} className="input-apple text-xs py-1.5 px-3 min-w-0 w-auto">
            {weeks.map(w => <option key={w} value={w}>Fecha {w}</option>)}
          </select>
        )}
        <span className="text-xs text-apple-gray-500">Tocá un partido para ver el centro de partido de Opta: momentum, xG, red de pases.</span>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {list.map(m => {
          const h = league.teamById.get(m.home), a = league.teamById.get(m.away)
          const played = m.status === 'Played'
          const body = (
            <>
              <div className="flex items-center justify-between text-2xs text-apple-gray-400 mb-2">
                <span>{fmtDate(m.date)}{m.time ? ` · ${m.time.slice(0, 5)} UTC` : ''}</span>
                <span className="truncate ml-2">{m.venue ?? ''}</span>
              </div>
              {[{ t: h, g: m.hs, xg: m.hxg }, { t: a, g: m.as, xg: m.axg }].map((r, i) => (
                <div key={i} className="flex items-center gap-2 py-0.5">
                  <TeamName team={r.t} short={false} className="flex-1 text-sm text-apple-gray-800 dark:text-white" />
                  {played && r.xg !== null && <span className="text-xs text-apple-gray-400 tabular-nums" title="Goles esperados">xG {r.xg.toFixed(2)}</span>}
                  <span className="w-6 text-right text-lg font-bold tabular-nums text-apple-gray-800 dark:text-white">{played ? r.g : ''}</span>
                </div>
              ))}
              {!played && <div className="text-xs text-apple-gray-400 mt-1">{m.status === 'Fixture' ? 'Por jugarse' : m.status}</div>}
            </>
          )
          return played
            ? <Link key={m.id} to={`/opta/partido/${m.id}`} className="card-apple-hover p-3 block">{body}</Link>
            : <div key={m.id} className="card-apple p-3 opacity-80">{body}</div>
        })}
      </div>
    </div>
  )
}

// ─── Mercado: contratos que vencen ──────────────────────────────────────────

export function MarketTab({ league, idx, dg }: { league: OptaLeague; idx: PercentileIndex; dg: Map<string, AgencyPlayer> }) {
  const [horizon, setHorizon] = useState('12')
  const [pos, setPos] = useState<AppPos | 'all'>('all')
  const [maxAge, setMaxAge] = useState(40)
  const rows = useMemo(() => league.players
    .filter(p => p.minutes >= idx.minMinutes && (pos === 'all' || p.pos === pos) && (p.age ?? 0) <= maxAge)
    .map(p => ({ p, ml: monthsLeft(p.contractEnd), score: profileScore(p, idx) }))
    .filter(r => r.ml !== null && r.ml >= 0 && r.ml <= Number(horizon) && r.score !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0)), [league, idx, horizon, pos, maxAge])
  const withContract = league.players.filter(p => p.contractEnd).length
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented size="sm" value={horizon} onChange={setHorizon} options={[{ value: '6', label: 'Vence en 6 meses' }, { value: '12', label: 'En 1 año' }, { value: '18', label: 'En 18 meses' }]} />
        <select value={pos} onChange={e => setPos(e.target.value as AppPos | 'all')} className="input-apple text-xs py-1.5 px-3 min-w-0 w-auto">
          <option value="all">Todas las posiciones</option>
          {POS_ORDER.map(x => <option key={x} value={x}>{POS_LABEL[x]}</option>)}
        </select>
        <select value={maxAge} onChange={e => setMaxAge(Number(e.target.value))} className="input-apple text-xs py-1.5 px-3 min-w-0 w-auto">
          <option value={40}>Cualquier edad</option>
          <option value={21}>Hasta 21 años</option>
          <option value={23}>Hasta 23 años</option>
          <option value={26}>Hasta 26 años</option>
        </select>
      </div>
      <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400">
        Jugadores con al menos {idx.minMinutes}' cuyo contrato termina pronto, ordenados por su nota (rendimiento en su puesto). Opta trae fecha de fin de contrato de {withContract} jugadores de la liga.
      </p>
      {rows.length === 0 ? <EmptyState title="Sin resultados" description="Ningún jugador con contrato por vencer con esos filtros." icon="filter" /> : (
        <div className="card-apple overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-apple-gray-200 dark:border-apple-gray-700 text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">
                <th className="text-left py-3 px-4">Jugador</th>
                <th className="text-left py-3 px-3">Equipo</th>
                <th className="text-center py-3 px-3">Pos</th>
                <th className="text-center py-3 px-3">Edad</th>
                <th className="text-center py-3 px-3">Vence</th>
                <th className="text-left py-3 px-3">Se destaca en</th>
                <th className="text-center py-3 px-3">Nota</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-apple-gray-100 dark:divide-apple-gray-800">
              {rows.slice(0, 60).map(({ p, ml, score }) => {
                const top = strengthsAndWeaknesses(p, idx).strong[0]
                return (
                  <tr key={p.id} className="hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/50">
                    <td className="py-2.5 px-4"><Link to={`/opta/jugador/${p.id}`} className="flex items-center gap-3"><PlayerPhoto name={p.name} size="sm" /><span className="text-sm font-medium text-apple-gray-800 dark:text-white hover:text-brand-green">{p.name}</span>{dg.has(p.id) && <DgBadge />}</Link></td>
                    <td className="py-2.5 px-3 text-sm text-apple-gray-600 dark:text-apple-gray-300"><TeamName team={league.teamById.get(p.teamId ?? '')} /></td>
                    <td className="py-2.5 px-3 text-center"><span className="inline-block px-2 py-0.5 rounded-md bg-apple-gray-100 dark:bg-apple-gray-800 text-xs font-semibold text-apple-gray-600 dark:text-apple-gray-300">{POS_SHORT[p.pos]}</span></td>
                    <td className="py-2.5 px-3 text-center text-sm tabular-nums text-apple-gray-600 dark:text-apple-gray-300">{p.age ?? '—'}</td>
                    <td className={`py-2.5 px-3 text-center text-sm tabular-nums font-semibold ${ml! <= 6 ? 'text-orange-500' : 'text-amber-500'}`}>{fmtDate(p.contractEnd)}</td>
                    <td className="py-2.5 px-3 text-xs text-apple-gray-500 dark:text-apple-gray-400">{top ? `${top.m.goodLabel ?? top.m.label} (p${top.pct})` : '—'}</td>
                    <td className="py-2.5 px-3 text-center"><PctPill pct={score} size="md" /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Doble G en Opta ────────────────────────────────────────────────────────

export function AgencyTab({ league, idx, dg }: { league: OptaLeague; idx: PercentileIndex; dg: Map<string, AgencyPlayer> }) {
  const found = [...dg.keys()].map(id => league.playerById.get(id)!).filter(Boolean).sort((a, b) => b.minutes - a.minutes)
  if (!found.length) return <EmptyState title="Sin jugadores Doble G" description="No encontramos jugadores de la agencia con minutos en la Liga Profesional 2026." icon="search" />
  return (
    <div className="space-y-4">
      <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">
        {found.length} jugadores de Doble G con minutos en la Liga Profesional 2026, con su nota y lo que mejor hacen comparados con su puesto en toda la liga.
      </p>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {found.map(p => {
          const { strong, weak } = strengthsAndWeaknesses(p, idx)
          const team = league.teamById.get(p.teamId ?? '')
          return (
            <Link key={p.id} to={`/opta/jugador/${p.id}`} className="card-apple-hover p-4 block">
              <div className="flex items-center gap-3">
                <PlayerPhoto name={p.name} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-apple-gray-800 dark:text-white truncate">{p.name}</div>
                  <div className="text-xs text-apple-gray-500 truncate flex items-center gap-1.5"><TeamDot team={team} size={10} />{team?.short} · {POS_LABEL[p.pos]}</div>
                </div>
                <PctPill pct={profileScore(p, idx)} size="md" />
              </div>
              <div className="flex gap-4 mt-3 text-xs text-apple-gray-500 tabular-nums">
                <span><b className="text-apple-gray-800 dark:text-white">{p.stats.appearances ?? 0}</b> PJ</span>
                <span><b className="text-apple-gray-800 dark:text-white">{p.minutes}</b> min</span>
                <span><b className="text-apple-gray-800 dark:text-white">{p.stats.goals ?? 0}</b> G</span>
                <span><b className="text-apple-gray-800 dark:text-white">{p.stats.goalAssist ?? 0}</b> A</span>
                <span>xG <b className="text-apple-gray-800 dark:text-white">{fmt(p.xg.expectedGoals ?? 0, { decimals: 1 })}</b></span>
              </div>
              <div className="mt-3 space-y-1">
                {strong.slice(0, 3).map(s => (
                  <div key={s.m.key} className="flex items-center justify-between text-xs">
                    <span className="text-apple-gray-600 dark:text-apple-gray-300 truncate">{s.m.goodLabel ?? s.m.label}</span><PctPill pct={s.pct} />
                  </div>
                ))}
                {p.minutes < MIN_MINUTES_FOR_PCT
                  ? <div className="text-xs text-amber-600 dark:text-amber-400">Jugó muy poco ({p.minutes}') para compararlo con la liga.</div>
                  : <>
                      {!strong.length && <div className="text-xs text-apple-gray-400">Sin métricas por encima del percentil 80.</div>}
                      {p.minutes < idx.minMinutes && <div className="text-xs text-amber-600 dark:text-amber-400">Pocos minutos: los números todavía pueden cambiar mucho.</div>}
                    </>}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// ─── Hallazgos (insights automáticos) ───────────────────────────────────────

interface Insight { title: string; why: string; rows: Array<{ p: OptaPlayer; value: string; note?: string }> }

export function InsightsTab({ league, idx, dg }: { league: OptaLeague; idx: PercentileIndex; dg: Map<string, AgencyPlayer> }) {
  const insights = useMemo<Insight[]>(() => {
    const ok = league.players.filter(p => p.minutes >= 900)
    const score = (p: OptaPlayer) => profileScore(p, idx) ?? 0
    const per90 = (p: OptaPlayer, v: number) => (v / p.minutes) * 90
    const out: Insight[] = []
    out.push({
      title: 'Jóvenes que ya rinden',
      why: 'Sub-21 con más de 900 minutos y nota alta en su puesto. Son los que más valor pueden ganar.',
      rows: ok.filter(p => (p.age ?? 99) <= 21).sort((a, b) => score(b) - score(a)).slice(0, 8)
        .map(p => ({ p, value: `nota ${score(p)}`, note: `${p.age} años · ${POS_SHORT[p.pos]}` })),
    })
    out.push({
      title: 'Buen nivel y contrato por vencer',
      why: 'Nota 65 o más y contrato que termina en los próximos 12 meses: oportunidades de mercado.',
      rows: ok.filter(p => { const ml = monthsLeft(p.contractEnd); return ml !== null && ml >= 0 && ml <= 12 && score(p) >= 65 })
        .sort((a, b) => score(b) - score(a)).slice(0, 8)
        .map(p => ({ p, value: `nota ${score(p)}`, note: `vence ${fmtDate(p.contractEnd)}` })),
    })
    out.push({
      title: 'Generan pero no convierten',
      why: 'Llegan mucho (xG alto) pero hicieron bastantes menos goles de los esperados. Si siguen generando, los goles suelen llegar: se pueden conseguir antes de que suban.',
      rows: ok.filter(p => (p.stats.totalScoringAtt ?? 0) >= 20 && (idx.pct(p, 'npxg') ?? 0) >= 60)
        .map(p => ({ p, d: (p.stats.goals ?? 0) - (p.xg.expectedGoals ?? 0) })).filter(r => r.d <= -2)
        .sort((a, b) => a.d - b.d).slice(0, 8)
        .map(({ p, d }) => ({ p, value: `${fmt(d, { decimals: 1 })} goles`, note: `${p.stats.goals ?? 0} G con ${fmt(p.xg.expectedGoals ?? 0, { decimals: 1 })} xG` })),
    })
    out.push({
      title: 'Convierten muy por encima de lo esperado',
      why: 'Hicieron muchos más goles que su xG. Puede ser gran definición o una racha que no dura: conviene mirar el video antes de pagar por esos goles.',
      rows: ok.map(p => ({ p, d: (p.stats.goals ?? 0) - (p.xg.expectedGoals ?? 0) })).filter(r => r.d >= 2.5)
        .sort((a, b) => b.d - a.d).slice(0, 8)
        .map(({ p, d }) => ({ p, value: `+${fmt(d, { decimals: 1 })} goles`, note: `${p.stats.goals ?? 0} G con ${fmt(p.xg.expectedGoals ?? 0, { decimals: 1 })} xG` })),
    })
    out.push({
      title: 'Los que más suman con la pelota',
      why: 'Valor de posesión cada 90 minutos: cuánto aumentan la chance de gol de su equipo con pases, regates y recuperaciones. Es el modelo propio de Opta y no lo da ninguna otra fuente que usamos hoy.',
      rows: [...ok].sort((a, b) => per90(b, b.pv.totalPossessionValue ?? 0) - per90(a, a.pv.totalPossessionValue ?? 0)).slice(0, 8)
        .map(p => ({ p, value: fmt(per90(p, p.pv.totalPossessionValue ?? 0), { decimals: 3 }), note: POS_LABEL[p.pos] })),
    })
    out.push({
      title: 'Presión alta',
      why: 'Más pelotas recuperadas en el último tercio cada 90 minutos: los que mejor presionan arriba.',
      rows: [...ok].sort((a, b) => (metric('highRecoveries').value(b) ?? 0) - (metric('highRecoveries').value(a) ?? 0)).slice(0, 8)
        .map(p => ({ p, value: fmt(metric('highRecoveries').value(p), { decimals: 2 }), note: POS_LABEL[p.pos] })),
    })
    out.push({
      title: 'Centrales zurdos que salen jugando',
      why: 'Un perfil escaso y caro: defensores centrales zurdos ordenados por pases progresivos.',
      rows: ok.filter(p => p.group === 'CB' && p.foot === 'left')
        .sort((a, b) => (metric('progPasses').value(b) ?? 0) - (metric('progPasses').value(a) ?? 0)).slice(0, 8)
        .map(p => ({ p, value: `${fmt(metric('progPasses').value(p), { decimals: 2 })} prog/90`, note: `p${idx.pct(p, 'progPasses') ?? '—'}` })),
    })
    out.push({
      title: 'Especialistas en pelota parada',
      why: 'Mayor xA de pelota parada (córners y tiros libres que terminan en remate peligroso).',
      rows: ok.filter(p => (p.xg.expectedAssistsSetplay ?? 0) > 0)
        .sort((a, b) => (b.xg.expectedAssistsSetplay ?? 0) - (a.xg.expectedAssistsSetplay ?? 0)).slice(0, 8)
        .map(p => ({ p, value: `${fmt(p.xg.expectedAssistsSetplay ?? 0, { decimals: 1 })} xA`, note: `${p.stats.goalAssistSetplay ?? 0} asist. de pelota parada` })),
    })
    return out.filter(i => i.rows.length)
  }, [league, idx])

  return (
    <div className="space-y-4">
      <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">
        Búsquedas que la app arma sola con los datos de Opta (jugadores con más de 900'). Son puntos de partida para el scouting, no conclusiones: siempre conviene confirmar con video.
      </p>
      <div className="grid lg:grid-cols-2 gap-4">
        {insights.map(ins => (
          <Card key={ins.title} title={ins.title} subtitle={ins.why}>
            <ol className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700/50">
              {ins.rows.map(({ p, value, note }, i) => (
                <li key={p.id} className="py-1.5 flex items-center gap-2.5 text-sm">
                  <span className="w-4 text-2xs text-apple-gray-400 tabular-nums">{i + 1}</span>
                  <TeamDot team={league.teamById.get(p.teamId ?? '')} size={10} />
                  <Link to={`/opta/jugador/${p.id}`} className="flex-1 min-w-0 truncate font-medium text-apple-gray-800 dark:text-white hover:text-brand-green">
                    {p.name}{dg.has(p.id) && <DgBadge className="ml-1.5" />}
                  </Link>
                  {note && <span className="hidden sm:inline text-xs text-apple-gray-400 truncate max-w-[11rem]">{note}</span>}
                  <span className="text-xs font-semibold tabular-nums text-apple-gray-700 dark:text-apple-gray-200 whitespace-nowrap">{value}</span>
                </li>
              ))}
            </ol>
          </Card>
        ))}
      </div>
    </div>
  )
}
