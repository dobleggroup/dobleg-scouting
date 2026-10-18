import { Link } from 'react-router-dom'
import { PlayerPhoto } from '@/components/ui/PlayerPhoto'
import { DgBadge, PctPill, TeamName } from '@/features/opta/components/ui'
import { GROUP_LABEL, POS_SHORT } from '@/features/opta/metrics'
import type { OptaLeague } from '@/features/opta/data'
import type { Valuation } from '../value'
import { ContractText, FlagChips, ValueBars, VerdictBadge, type Money } from './bits'

/** Foto, nombre, equipo, puesto, edad y minutos. */
export function PlayerHead({ v, league, dg, size = 'md' }: { v: Valuation; league: OptaLeague; dg: boolean; size?: 'md' | 'lg' }) {
  const { p } = v
  return (
    <div className="flex items-center gap-3 min-w-0">
      <PlayerPhoto src={v.tm?.photo} name={p.name} size={size === 'lg' ? 'lg' : 'md'} className={size === 'lg' ? '!w-14 !h-14' : ''} />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`font-semibold text-apple-gray-800 dark:text-white truncate ${size === 'lg' ? 'text-base' : 'text-sm'}`}>{p.name}</span>
          {dg && <DgBadge />}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
          <TeamName team={league.teamById.get(p.teamId ?? '')} />
          <span>{POS_SHORT[p.pos]} · {p.age ?? '—'} años · {p.minutes.toLocaleString('es-AR')}'</span>
        </div>
      </div>
    </div>
  )
}

/** Tarjeta de una oportunidad de la liga. */
export function OpportunityCard({ v, league, money, rank }: {
  v: Valuation; league: OptaLeague; money: Money; rank?: { rank: number; total: number }
}) {
  return (
    <Link to={`/opta/jugador/${v.p.id}`} className="card-apple-hover p-4 flex flex-col gap-3 group">
      <div className="flex items-start justify-between gap-2">
        <PlayerHead v={v} league={league} dg={false} />
        <VerdictBadge verdict={v.verdict} />
      </div>
      <ValueBars value={v.value} fair={v.fair} verdict={v.verdict} money={money} />
      <FlagChips flags={v.flags} skip={['barato', 'caro']} />
      <div className="mt-auto pt-2 border-t border-apple-gray-100 dark:border-apple-gray-700/60 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-apple-gray-500 dark:text-apple-gray-400">
        <span className="inline-flex items-center gap-1.5">Nota <PctPill pct={v.score} />{rank && <span>{rank.rank}º de {rank.total} {GROUP_LABEL[v.p.group].toLowerCase()}</span>}</span>
        <span>Contrato: <ContractText end={v.contractEnd} months={v.monthsLeft} compact /></span>
      </div>
    </Link>
  )
}
