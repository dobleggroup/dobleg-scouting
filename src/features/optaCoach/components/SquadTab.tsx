import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import WidgetCard from '@/features/coaches/components/summary/WidgetCard'
import { POS_SHORT } from '@/features/opta/metrics'
import { currentClub, debutOf, isHomegrown } from '@/features/optaClub/clubData'
import { HBar, LegendDot, Note, StatTile, SurgidoBadge, fmtInt } from '@/features/optaClub/components/bits'
import { fmtDate } from '@/features/opta/components/ui'
import { playerUsage } from '../teamData'
import { COACH_SHORT, TEAM_ID, type CoachData } from '../useCoachData'

export default function SquadTab({ d }: { d: CoachData }) {
  const { club, league } = d
  // Surgidos: los del plantel que debutaron en River y los que ya se fueron (el script solo guarda surgidos).
  const homegrown = useMemo(() => new Set([
    ...club.squad.filter(p => isHomegrown(p, TEAM_ID)).map(p => p.id),
    ...club.alumni.map(p => p.id),
  ]), [club])

  const withCoach = d.games.filter(g => g.match.date >= d.coachFrom)
  const usage = playerUsage(withCoach, d.block.lineups)
  const possible = withCoach.length * 90
  const totalMin = usage.reduce((s, u) => s + u.minutes, 0)
  const hgMin = usage.filter(u => homegrown.has(u.playerId)).reduce((s, u) => s + u.minutes, 0)
  const seasonUsage = playerUsage(d.games, d.block.lineups)
  const seasonHg = seasonUsage.filter(u => homegrown.has(u.playerId)).reduce((s, u) => s + u.minutes, 0)
  const seasonTot = seasonUsage.reduce((s, u) => s + u.minutes, 0)

  const perMatch = d.games.map(g => {
    const lu = d.block.lineups[g.match.id]?.[TEAM_ID] ?? []
    return { g, starters: lu.filter(p => p[3] === 1 && homegrown.has(p[0])).length, subs: lu.filter(p => p[3] === 0 && homegrown.has(p[0])).length }
  })
  const maxPer = Math.max(1, ...perMatch.map(x => x.starters + x.subs))
  const [showAll, setShowAll] = useState(false)
  // Primero los que están en la Liga Profesional (tienen ficha de Opta), después el resto por club.
  const away = club.alumni.map(p => ({ p, now: currentClub(p), d: debutOf(p), lpf: league.playerById.has(p.id) })).filter(x => x.now)
    .sort((a, b) => Number(b.lpf) - Number(a.lpf) || a.now!.team.localeCompare(b.now!.team))

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label={`Jugadores usados con ${COACH_SHORT}`} value={usage.length} detail={`en ${withCoach.length} partidos`} />
        <StatTile label={`Minutos de chicos del club con ${COACH_SHORT}`} value={`${totalMin ? Math.round((hgMin / totalMin) * 100) : 0}%`} accent detail={`en todo 2026: ${seasonTot ? Math.round((seasonHg / seasonTot) * 100) : 0}%`} />
        <StatTile label="Surgidos en el plantel" value={club.squad.filter(p => homegrown.has(p.id)).length} detail={`de ${club.squad.length} jugadores`} />
        <StatTile label="Surgidos jugando en otros clubes" value={away.length} detail="según Opta" />
      </div>

      <div className="grid gap-5 sm:gap-6 lg:grid-cols-2 items-start">
        <WidgetCard title={`Minutos con ${COACH_SHORT}`} description={`La barra llena son los ${fmtInt(possible)} minutos que jugó River con él.`}>
          <div className="space-y-2.5">
            {usage.map(u => {
              const p = league.playerById.get(u.playerId)
              const hg = homegrown.has(u.playerId)
              return (
                <div key={u.playerId} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {p && <span className="text-[10px] font-semibold text-apple-gray-400 w-7">{POS_SHORT[p.pos]}</span>}
                      <Link to={`/opta/jugador/${u.playerId}`} className="text-sm font-medium text-apple-gray-800 dark:text-white hover:text-brand-green truncate">{p?.name ?? '—'}</Link>
                      {hg && <SurgidoBadge />}
                    </div>
                    <HBar value={u.minutes} max={possible} accent={hg} className="mt-1" />
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular-nums text-apple-gray-800 dark:text-white">{fmtInt(u.minutes)}'</div>
                    <div className="text-2xs text-apple-gray-400 tabular-nums whitespace-nowrap">{u.starts} de titular</div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-4">
            <LegendDot accent label="Surgido del club" /><LegendDot label="Resto" />
          </div>
        </WidgetCard>

        <div className="space-y-5 sm:space-y-6">
          <WidgetCard title="Chicos del club en cada partido" description="Cuántos surgidos de River jugaron cada partido de 2026. Verde: titulares · gris: entraron. La zona marcada es con Ponzio.">
            <div className="flex items-end gap-[3px] h-32">
              {perMatch.map(({ g, starters, subs }) => {
                const withC = g.match.date >= d.coachFrom
                return (
                  <Link key={g.match.id} to={`/opta/partido/${g.match.id}`} title={`${fmtDate(g.match.date)} vs ${league.teamById.get(g.oppId)?.short}: ${starters} titulares, ${subs} entraron`}
                    className={`flex-1 min-w-0 h-full flex flex-col justify-end gap-[2px] rounded-t ${withC ? 'bg-brand-green/[0.07]' : ''}`}>
                    <div className="w-full rounded-t-[3px] bg-apple-gray-300 dark:bg-apple-gray-600" style={{ height: `${(subs / maxPer) * 100}%` }} />
                    <div className={`w-full bg-brand-green ${subs ? '' : 'rounded-t-[3px]'}`} style={{ height: `${(starters / maxPer) * 100}%` }} />
                  </Link>
                )
              })}
            </div>
            <div className="flex justify-between text-[10px] text-apple-gray-400 mt-1 tabular-nums">
              <span>{fmtDate(d.games[0]?.match.date)}</span><span>{fmtDate(d.games[d.games.length - 1]?.match.date)}</span>
            </div>
          </WidgetCard>

          <WidgetCard title="Surgidos de River en otros clubes" description="Dónde juegan hoy, según Opta.">
            <div className="flex flex-wrap gap-1.5">
              {(showAll ? away : away.slice(0, 24)).map(({ p, now, lpf: inLeague }) => {
                const chip = (
                  <>
                    <span className="font-medium text-apple-gray-800 dark:text-white">{p.name}</span>
                    <span className="text-apple-gray-400"> · {now!.team}{now!.loan ? ' (préstamo)' : ''}</span>
                  </>
                )
                return inLeague
                  ? <Link key={p.id} to={`/opta/jugador/${p.id}`} className="text-xs px-2.5 py-1 rounded-full border border-brand-green/40 hover:border-brand-green">{chip}</Link>
                  : <span key={p.id} className="text-xs px-2.5 py-1 rounded-full border border-apple-gray-200 dark:border-apple-gray-700">{chip}</span>
              })}
            </div>
            {away.length > 24 && (
              <button type="button" onClick={() => setShowAll(v => !v)} className="mt-3 text-xs font-semibold text-brand-green hover:underline">
                {showAll ? 'Ver menos' : `Ver los ${away.length}`}
              </button>
            )}
            <Note>Con borde verde, los que juegan en la Liga Profesional: tocalos para ver su ficha.</Note>
          </WidgetCard>
        </div>
      </div>
      <Note>Surgido del club = debutó en Primera en River, según la carrera que tiene Opta de cada jugador.</Note>
    </div>
  )
}
