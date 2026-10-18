import { Link } from 'react-router-dom'
import EmptyState from '@/components/ui/EmptyState'
import { PctPill } from '@/features/opta/components/ui'
import { GROUP_LABEL } from '@/features/opta/metrics'
import { agencyAdvice, type Advice, type Valuation, type Verdict } from '../value'
import type { ValueData } from '../useValueData'
import { ContractText, ValueBars, VerdictBadge, useMoney, type Money } from './bits'
import { PlayerHead } from './PlayerCards'

const VERDICT_ORDER: Verdict[] = ['muyBarato', 'barato', 'justo', 'caro', 'muyCaro']

const ADVICE_DOT: Record<Advice['tone'], string> = {
  good: 'bg-emerald-500',
  warn: 'bg-sky-500',
  info: 'bg-apple-gray-300 dark:bg-apple-gray-500',
}

/** Nuestros jugadores en la Liga Profesional: cuánto valen contra lo que rinden y qué hacer. */
export default function AgencyValueTab({ d }: { d: ValueData }) {
  const money = useMoney()
  const ours = [...d.dg.keys()].map(id => d.byId.get(id)).filter((v): v is Valuation => Boolean(v))
  if (!ours.length) return <EmptyState title="Sin jugadores Doble G" description="No encontramos jugadores de la agencia en la Liga Profesional 2026." icon="search" />
  const rated = ours.filter(v => v.verdict !== null).sort((a, b) => VERDICT_ORDER.indexOf(a.verdict!) - VERDICT_ORDER.indexOf(b.verdict!) || (a.ratio ?? 0) - (b.ratio ?? 0))
  const rest = ours.filter(v => v.verdict === null).sort((a, b) => b.p.minutes - a.p.minutes)
  const cheap = rated.filter(v => v.verdict === 'muyBarato' || v.verdict === 'barato')
  const ending = ours.filter(v => v.monthsLeft !== null && v.monthsLeft >= 0 && v.monthsLeft <= 9)

  return (
    <div className="space-y-5">
      <div className="card-apple px-4 py-3 sm:px-5 text-sm text-apple-gray-600 dark:text-apple-gray-300">
        <b className="text-apple-gray-800 dark:text-white">{ours.length} jugadores Doble G</b> en la Liga Profesional.{' '}
        {cheap.length > 0 && <>{cheap.length === 1 ? 'Uno vale' : `${cheap.length} valen`} menos de lo que rinden. </>}
        {ending.length > 0 && <>{ending.length === 1 ? 'A uno se le termina' : `A ${ending.length} se les termina`} el contrato en menos de 9 meses.</>}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {rated.map(v => <AgencyCard key={v.p.id} v={v} d={d} money={money} />)}
      </div>

      {rest.length > 0 && (
        <section className="card-apple p-4 sm:p-5">
          <h2 className="text-base font-semibold text-apple-gray-800 dark:text-white">Con pocos minutos para evaluar</h2>
          <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-0.5 mb-3">Jugaron menos de {d.idx.minMinutes}' en la liga: no hay nota todavía, pero sí valor y contrato.</p>
          <div className="divide-y divide-apple-gray-100 dark:divide-apple-gray-800">
            {rest.map(v => (
              <Link key={v.p.id} to={`/opta/jugador/${v.p.id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 hover:opacity-80">
                <PlayerHead v={v} league={d.league} dg />
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-apple-gray-500 dark:text-apple-gray-400">Vale <b className="text-apple-gray-800 dark:text-white tabular-nums">{money(v.value)}</b></span>
                  <span className="text-apple-gray-500 dark:text-apple-gray-400">Contrato <ContractText end={v.contractEnd} months={v.monthsLeft} compact /></span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function AgencyCard({ v, d, money }: { v: Valuation; d: ValueData; money: Money }) {
  const rank = d.rank.get(v.p.id)
  const advice = agencyAdvice(v, x => money(x))
  const closest = v.comps.slice(0, 4)
  return (
    <section className="card-apple p-4 sm:p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <Link to={`/opta/jugador/${v.p.id}`} className="min-w-0 hover:opacity-80"><PlayerHead v={v} league={d.league} dg size="lg" /></Link>
        <VerdictBadge verdict={v.verdict} size="md" />
      </div>

      <ValueBars value={v.value} fair={v.fair} verdict={v.verdict} money={money} />

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-apple bg-apple-gray-50 dark:bg-apple-gray-800/60 px-3 py-2">
          <div className="text-2xs uppercase tracking-wide text-apple-gray-400">Nota en su puesto</div>
          <div className="flex items-center gap-2 mt-1">
            <PctPill pct={v.score} size="md" />
            {rank && <span className="text-xs text-apple-gray-500 dark:text-apple-gray-400">{rank.rank}º de {rank.total} {GROUP_LABEL[v.p.group].toLowerCase()}</span>}
          </div>
        </div>
        <div className="rounded-apple bg-apple-gray-50 dark:bg-apple-gray-800/60 px-3 py-2">
          <div className="text-2xs uppercase tracking-wide text-apple-gray-400">Contrato</div>
          <div className="mt-1.5 text-sm"><ContractText end={v.contractEnd} months={v.monthsLeft} /></div>
        </div>
      </div>

      <ul className="space-y-1.5">
        {advice.map(a => (
          <li key={a.text} className="flex gap-2 text-sm text-apple-gray-700 dark:text-apple-gray-200">
            <span className={`mt-[7px] w-1.5 h-1.5 rounded-full flex-shrink-0 ${ADVICE_DOT[a.tone]}`} />
            <span>{a.text}</span>
          </li>
        ))}
      </ul>

      {closest.length > 0 && (
        <div>
          <div className="text-2xs uppercase tracking-wide text-apple-gray-400 mb-1">Los que más se le parecen</div>
          <div className="divide-y divide-apple-gray-100 dark:divide-apple-gray-800">
            {closest.map(c => (
              <Link key={c.p.id} to={`/opta/jugador/${c.p.id}`} className="flex items-center justify-between gap-2 py-1.5 text-sm hover:text-brand-green">
                <span className="min-w-0 flex items-center gap-1.5">
                  <span className="truncate font-medium text-apple-gray-700 dark:text-apple-gray-200">{c.p.name}</span>
                  <span className="text-xs text-apple-gray-400 truncate">{d.league.teamById.get(c.p.teamId ?? '')?.short} · {c.age} años</span>
                </span>
                <span className="flex items-center gap-2 flex-shrink-0">
                  <PctPill pct={c.score} />
                  <span className="tabular-nums w-14 text-right text-apple-gray-700 dark:text-apple-gray-200">{money(c.value)}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
