import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import EmptyState from '@/components/ui/EmptyState'
import { PlayerPhoto } from '@/components/ui/PlayerPhoto'
import { Card, DgBadge, PctPill, Segmented, TeamName } from '@/features/opta/components/ui'
import { GROUP_LABEL, GROUP_ORDER, POS_SHORT } from '@/features/opta/metrics'
import type { GroupCode } from '@/features/opta/data'
import { agencyKey } from '@/services/agencyPlayersService'
import type { Valuation, Verdict } from '../value'
import type { ValueData } from '../useValueData'
import { AgeRange, ContractText, FlagChips, VerdictBadge, sideOf, useMoney, type Money } from './bits'
import { OpportunityCard } from './PlayerCards'
import ValueMap from './ValueMap'

type OppFilter = 'todas' | 'baratos' | 'libres' | 'jovenes' | 'sinRep'
const OPP_FILTERS: Array<{ value: OppFilter; label: string }> = [
  { value: 'todas', label: 'Todas' },
  { value: 'baratos', label: 'Baratos' },
  { value: 'libres', label: 'Quedan libres' },
  { value: 'jovenes', label: 'Jóvenes' },
  { value: 'sinRep', label: 'Sin representante' },
]
const oppMatch = (v: Valuation, f: OppFilter) =>
  f === 'todas' ? true
    : f === 'baratos' ? v.flags.includes('barato')
      : f === 'libres' ? v.flags.includes('libre') || v.flags.includes('contrato')
        : f === 'jovenes' ? v.flags.includes('joven')
          : v.flags.includes('sinRep') || v.flags.includes('familia')

function GroupSelect({ value, onChange }: { value: GroupCode | 'all'; onChange: (g: GroupCode | 'all') => void }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value as GroupCode | 'all')} className="input-apple text-xs py-1.5 px-3 min-w-0 w-auto">
      <option value="all">Todos los puestos</option>
      {GROUP_ORDER.map(g => <option key={g} value={g}>{GROUP_LABEL[g]}</option>)}
    </select>
  )
}

export default function LeagueValueTab({ d }: { d: ValueData }) {
  const money = useMoney()
  const valued = useMemo(() => d.rows.filter(r => r.verdict !== null), [d.rows])
  const skipped = d.rows.filter(r => r.p.minutes >= d.idx.minMinutes && r.verdict === null).length

  return (
    <div className="space-y-5">
      <HowItWorks total={valued.length} minMinutes={d.idx.minMinutes} />
      <Opportunities d={d} valued={valued} money={money} />
      <MarketMap d={d} valued={valued} money={money} />
      <AllPlayers d={d} valued={valued} money={money} skipped={skipped} />
    </div>
  )
}

function HowItWorks({ total, minMinutes }: { total: number; minMinutes: number }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="card-apple px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-apple-gray-600 dark:text-apple-gray-300">
          Comparamos lo que <b>vale</b> cada jugador (Transfermarkt) con lo que valen los que <b>rinden parecido</b> en su puesto (Opta). {total} jugadores de la Liga Profesional con al menos {minMinutes}'.
        </p>
        <button type="button" onClick={() => setOpen(o => !o)} className="text-xs font-semibold text-brand-green hover:underline whitespace-nowrap">
          {open ? 'Cerrar' : '¿Cómo se calcula?'}
        </button>
      </div>
      {open && (
        <ol className="mt-3 grid sm:grid-cols-3 gap-3 text-sm text-apple-gray-600 dark:text-apple-gray-300">
          {[
            ['Nota', 'Con los datos de Opta cada jugador tiene una nota de 0 a 100 contra los de su puesto (50 = el promedio). Si jugó poco, la nota se toma con pinzas.'],
            ['Los parecidos', 'Buscamos los 15 jugadores de su puesto que más se le parecen en nota, edad y minutos, y miramos cuánto valen.'],
            ['Veredicto', 'Barato: casi todos esos parecidos valen más que él, y bastante más. Caro: al revés. Si rinde menos que el promedio, nunca lo marcamos como barato.'],
          ].map(([t, x], i) => (
            <li key={t} className="flex gap-2.5">
              <span className="w-6 h-6 rounded-full bg-brand-green/15 text-brand-green text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
              <span><b className="text-apple-gray-800 dark:text-white">{t}.</b> {x}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function Opportunities({ d, valued, money }: { d: ValueData; valued: Valuation[]; money: Money }) {
  const [filter, setFilter] = useState<OppFilter>('todas')
  const [group, setGroup] = useState<GroupCode | 'all'>('all')
  const [more, setMore] = useState(false)
  const ageBounds = useAgeBounds(valued)
  const [ages, setAges] = useState<[number, number]>(ageBounds)
  const list = useMemo(() => valued
    .filter(v => v.opportunity > 0 && !d.dg.has(v.p.id) && oppMatch(v, filter) && (group === 'all' || v.p.group === group))
    .filter(v => v.p.age === null || (v.p.age >= ages[0] && v.p.age <= ages[1]))
    .sort((a, b) => b.opportunity - a.opportunity), [valued, d.dg, filter, group, ages])
  const shown = list.slice(0, more ? 24 : 9)
  return (
    <Card
      title="Oportunidades"
      subtitle="Rinden bien y además están baratos, quedan libres, son jóvenes o no tienen representante. Primero los más interesantes."
    >
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Segmented size="sm" value={filter} onChange={f => { setFilter(f); setMore(false) }} options={OPP_FILTERS} />
        <GroupSelect value={group} onChange={g => { setGroup(g); setMore(false) }} />
        <AgeRange min={ageBounds[0]} max={ageBounds[1]} value={ages} onChange={a => { setAges(a); setMore(false) }} />
      </div>
      {shown.length === 0 ? <EmptyState title="Sin oportunidades" description="Ningún jugador cumple con esos filtros." icon="filter" /> : (
        <>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {shown.map(v => <OpportunityCard key={v.p.id} v={v} league={d.league} money={money} rank={d.rank.get(v.p.id)} />)}
          </div>
          {list.length > 9 && (
            <div className="mt-4 text-center">
              <button type="button" onClick={() => setMore(m => !m)} className="text-sm font-semibold text-brand-green hover:underline">
                {more ? 'Ver menos' : `Ver más (${Math.min(24, list.length)} de ${list.length})`}
              </button>
            </div>
          )}
        </>
      )}
    </Card>
  )
}

type MapShow = 'todos' | 'barato' | 'justo' | 'caro'
const MAP_SHOW: Array<{ value: MapShow; label: string }> = [
  { value: 'todos', label: 'Todos' },
  { value: 'barato', label: 'Baratos' },
  { value: 'justo', label: 'Precio justo' },
  { value: 'caro', label: 'Caros' },
]

function MarketMap({ d, valued, money }: { d: ValueData; valued: Valuation[]; money: Money }) {
  const [group, setGroup] = useState<GroupCode | 'all'>('all')
  const [show, setShow] = useState<MapShow>('todos')
  const bounds = useAgeBounds(valued)
  const [ages, setAges] = useState<[number, number]>(bounds)
  const [contract, setContract] = useState<ContractFilter>('all')
  const [team, setTeam] = useState('all')
  const [q, setQ] = useState('')
  const teams = useMemo(() => [...d.league.teams].filter(t => t.games > 0).sort((a, b) => a.short.localeCompare(b.short)), [d.league])
  const rows = useMemo(() => valued
    .filter(v => group === 'all' || v.p.group === group)
    .filter(v => show === 'todos' || sideOf(v.verdict) === show)
    .filter(v => v.p.age === null || (v.p.age >= ages[0] && v.p.age <= ages[1]))
    .filter(v => contractMatch(v, contract))
    .filter(v => team === 'all' || v.p.teamId === team), [valued, group, show, ages, contract, team])
  const term = agencyKey(q.trim())
  // Con nombre: lo que se busca, todo el equipo elegido, o los 6 más baratos que rinden bien.
  const labelIds = useMemo(() => {
    if (term.length >= 3) return new Set(rows.filter(v => agencyKey(`${v.p.name} ${v.p.fullName ?? ''}`).includes(term)).map(v => v.p.id))
    if (team !== 'all') return new Set(rows.map(v => v.p.id))
    return new Set(rows.filter(v => v.flags.includes('barato') && !d.dg.has(v.p.id)).sort((a, b) => b.opportunity - a.opportunity).slice(0, 6).map(v => v.p.id))
  }, [rows, d.dg, term, team])
  const filtered = group !== 'all' || show !== 'todos' || ages[0] !== bounds[0] || ages[1] !== bounds[1] || contract !== 'all' || team !== 'all'
  return (
    <Card
      title="El mapa del mercado"
      subtitle="Cada punto es un jugador: cuanto más a la derecha, mejor rinde en su puesto; cuanto más arriba, más vale."
    >
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Segmented size="sm" value={show} onChange={setShow} options={MAP_SHOW} />
        <GroupSelect value={group} onChange={setGroup} />
        <AgeRange min={bounds[0]} max={bounds[1]} value={ages} onChange={setAges} />
        <select value={contract} onChange={e => setContract(e.target.value as ContractFilter)} className="input-apple text-xs py-1.5 px-3 min-w-0 w-auto">
          <option value="all">Cualquier contrato</option>
          <option value="libre">Termina en diciembre</option>
          <option value="anio">Termina antes de 2028</option>
        </select>
        <select value={team} onChange={e => setTeam(e.target.value)} className="input-apple text-xs py-1.5 px-3 min-w-0 w-auto">
          <option value="all">Todos los equipos</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.short}</option>)}
        </select>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Marcar un jugador" className="input-apple text-xs py-1.5 px-3 w-full sm:w-44" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1 text-xs text-apple-gray-500 dark:text-apple-gray-400">
        <span>{rows.length} jugadores en el mapa</span>
        {filtered && (
          <button type="button" onClick={() => { setGroup('all'); setShow('todos'); setAges(bounds); setContract('all'); setTeam('all'); setQ('') }} className="font-semibold text-brand-green hover:underline">
            Sacar filtros
          </button>
        )}
      </div>
      <ValueMap rows={rows} league={d.league} dg={d.dg} money={money} labelIds={labelIds} />
    </Card>
  )
}

/** Edad mínima y máxima de los jugadores valuados (para los deslizadores). */
function useAgeBounds(valued: Valuation[]): [number, number] {
  return useMemo(() => {
    const ages = valued.map(v => v.p.age).filter((a): a is number => a !== null)
    return [Math.min(...ages), Math.max(...ages)]
  }, [valued])
}

const contractMatch = (v: Valuation, c: ContractFilter) =>
  c === 'all' || (v.monthsLeft !== null && v.monthsLeft >= 0 && v.monthsLeft <= (c === 'libre' ? 3 : 14))

const VERDICT_ORDER: Verdict[] = ['muyBarato', 'barato', 'justo', 'caro', 'muyCaro']

type SortKey = 'opp' | 'score' | 'value' | 'fair' | 'ratio' | 'contract' | 'age'
type VerdictFilter = 'all' | 'barato' | 'justo' | 'caro'
type ContractFilter = 'all' | 'libre' | 'anio'

function AllPlayers({ d, valued, money, skipped }: { d: ValueData; valued: Valuation[]; money: Money; skipped: number }) {
  const [q, setQ] = useState('')
  const [group, setGroup] = useState<GroupCode | 'all'>('all')
  const [maxAge, setMaxAge] = useState(99)
  const [verdict, setVerdict] = useState<VerdictFilter>('all')
  const [contract, setContract] = useState<ContractFilter>('all')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'ratio', dir: 1 })
  const [open, setOpen] = useState<string | null>(null)
  const [limit, setLimit] = useState(40)

  const list = useMemo(() => {
    const term = agencyKey(q)
    const val = (v: Valuation): number => {
      switch (sort.key) {
        case 'opp': return v.opportunity
        case 'score': return v.score ?? 0
        case 'value': return v.value ?? 0
        case 'fair': return v.fair ?? 0
        // Primero por veredicto (un "justo" que rinde poco no va arriba de los baratos), después por cuánto.
        case 'ratio': return VERDICT_ORDER.indexOf(v.verdict!) * 1000 + (v.ratio ?? 0)
        case 'contract': return v.monthsLeft ?? 999
        case 'age': return v.p.age ?? 99
      }
    }
    return valued
      .filter(v => (group === 'all' || v.p.group === group) && (v.p.age ?? 0) <= maxAge)
      .filter(v => verdict === 'all' || sideOf(v.verdict) === verdict)
      .filter(v => contractMatch(v, contract))
      .filter(v => !term || agencyKey(`${v.p.name} ${v.p.fullName ?? ''} ${d.league.teamById.get(v.p.teamId ?? '')?.short ?? ''}`).includes(term))
      .sort((a, b) => (val(a) - val(b)) * sort.dir)
  }, [valued, group, maxAge, verdict, contract, q, sort, d.league])

  const th = (key: SortKey, label: string, cls = '', firstDir: 1 | -1 = -1) => (
    <th className={`py-3 px-3 ${cls}`}>
      <button
        type="button"
        onClick={() => setSort(s => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: firstDir }))}
        className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-apple-gray-800 dark:hover:text-white ${sort.key === key ? 'text-apple-gray-800 dark:text-white' : ''}`}
      >
        {label}{sort.key === key && <span aria-hidden>{sort.dir === 1 ? '↑' : '↓'}</span>}
      </button>
    </th>
  )

  return (
    <Card title="Todos los jugadores" subtitle="Ordená por cualquier columna. Tocá un jugador para ver con quiénes lo comparamos.">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input value={q} onChange={e => { setQ(e.target.value); setLimit(40) }} placeholder="Buscar jugador o equipo" className="input-apple text-xs py-1.5 px-3 w-full sm:w-56" />
        <GroupSelect value={group} onChange={g => { setGroup(g); setLimit(40) }} />
        <select value={maxAge} onChange={e => setMaxAge(Number(e.target.value))} className="input-apple text-xs py-1.5 px-3 min-w-0 w-auto">
          <option value={99}>Cualquier edad</option>
          <option value={21}>Hasta 21 años</option>
          <option value={23}>Hasta 23 años</option>
          <option value={26}>Hasta 26 años</option>
          <option value={29}>Hasta 29 años</option>
        </select>
        <select value={verdict} onChange={e => setVerdict(e.target.value as VerdictFilter)} className="input-apple text-xs py-1.5 px-3 min-w-0 w-auto">
          <option value="all">Baratos, justos y caros</option>
          <option value="barato">Solo baratos</option>
          <option value="justo">Solo precio justo</option>
          <option value="caro">Solo caros</option>
        </select>
        <select value={contract} onChange={e => setContract(e.target.value as ContractFilter)} className="input-apple text-xs py-1.5 px-3 min-w-0 w-auto">
          <option value="all">Cualquier contrato</option>
          <option value="libre">Termina en diciembre</option>
          <option value="anio">Termina antes de 2028</option>
        </select>
      </div>
      {list.length === 0 ? <EmptyState title="Sin resultados" description="Ningún jugador cumple con esos filtros." icon="filter" /> : (
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-apple-gray-200 dark:border-apple-gray-700 text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 text-left">
                <th className="py-3 px-4 uppercase tracking-wider">Jugador</th>
                {th('age', 'Edad', 'text-center', 1)}
                {th('score', 'Nota', 'text-center')}
                {th('value', 'Vale', 'text-right')}
                {th('fair', 'Los parecidos', 'text-right')}
                {th('ratio', 'Veredicto', 'text-center', 1)}
                {th('contract', 'Contrato', '', 1)}
              </tr>
            </thead>
            <tbody className="divide-y divide-apple-gray-100 dark:divide-apple-gray-800">
              {list.slice(0, limit).map(v => {
                const isOpen = open === v.p.id
                return (
                  <Fragment key={v.p.id}>
                    <tr onClick={() => setOpen(isOpen ? null : v.p.id)} className={`cursor-pointer transition-colors ${isOpen ? 'bg-apple-gray-50 dark:bg-apple-gray-800/60' : 'hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/50'}`}>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <PlayerPhoto src={v.tm?.photo} name={v.p.name} size="sm" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium text-apple-gray-800 dark:text-white truncate">{v.p.name}</span>
                              {d.dg.has(v.p.id) && <DgBadge />}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-apple-gray-500 dark:text-apple-gray-400">
                              <TeamName team={d.league.teamById.get(v.p.teamId ?? '')} />
                              <span>· {POS_SHORT[v.p.pos]}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center text-sm tabular-nums text-apple-gray-600 dark:text-apple-gray-300">{v.p.age ?? '—'}</td>
                      <td className="py-2.5 px-3 text-center"><PctPill pct={v.score} /></td>
                      <td className="py-2.5 px-3 text-right text-sm font-semibold tabular-nums text-apple-gray-800 dark:text-white">{money(v.value)}</td>
                      <td className="py-2.5 px-3 text-right text-sm tabular-nums text-apple-gray-500 dark:text-apple-gray-400">{money(v.fair)}</td>
                      <td className="py-2.5 px-3 text-center"><VerdictBadge verdict={v.verdict} /></td>
                      <td className="py-2.5 px-3 text-sm"><ContractText end={v.contractEnd} months={v.monthsLeft} compact /></td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-apple-gray-50 dark:bg-apple-gray-800/60">
                        <td colSpan={7} className="px-4 pb-4 pt-1"><CompsDetail v={v} d={d} money={money} /></td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-apple-gray-400">
        <span>{list.length} jugadores{skipped > 0 ? ` · ${skipped} con minutos quedan afuera porque no tienen valor en Transfermarkt o no los encontramos ahí` : ''}</span>
        {list.length > limit && (
          <button type="button" onClick={() => setLimit(l => l + 40)} className="text-sm font-semibold text-brand-green hover:underline">Ver 40 más</button>
        )}
      </div>
    </Card>
  )
}

/** Con quiénes se lo comparó y cuánto valen. */
export function CompsDetail({ v, d, money }: { v: Valuation; d: ValueData; money: Money }) {
  const team = (id: string | null) => d.league.teamById.get(id ?? '')
  return (
    <div className="rounded-apple-lg bg-white dark:bg-apple-gray-900/60 border border-apple-gray-200 dark:border-apple-gray-700 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <p className="text-sm text-apple-gray-600 dark:text-apple-gray-300">
          De los {v.comps.length} {GROUP_LABEL[v.p.group].toLowerCase()} que más se le parecen en nota, edad y minutos, <b className="text-apple-gray-800 dark:text-white">{v.worthMore} valen más</b> que él. En general valen <b className="text-apple-gray-800 dark:text-white">{money(v.fair)}</b>; {v.p.name} vale <b className="text-apple-gray-800 dark:text-white">{money(v.value)}</b>.
        </p>
        <Link to={`/opta/jugador/${v.p.id}`} className="text-xs font-semibold text-brand-green hover:underline whitespace-nowrap">Ver ficha →</Link>
      </div>
      <FlagChips flags={v.flags} />
      <div className="mt-2 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6">
        {[...v.comps].sort((a, b) => b.value - a.value).map(c => (
          <Link key={c.p.id} to={`/opta/jugador/${c.p.id}`} className="flex items-center justify-between gap-2 py-1.5 border-b border-apple-gray-100 dark:border-apple-gray-800 text-sm hover:text-brand-green">
            <span className="min-w-0 flex items-center gap-1.5">
              <span className="truncate font-medium text-apple-gray-700 dark:text-apple-gray-200">{c.p.name}</span>
              <span className="text-xs text-apple-gray-400 truncate">{team(c.p.teamId)?.short} · {c.age} años</span>
            </span>
            <span className="flex items-center gap-2 flex-shrink-0">
              <PctPill pct={c.score} />
              <span className="tabular-nums w-14 text-right text-apple-gray-700 dark:text-apple-gray-200">{money(c.value)}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
