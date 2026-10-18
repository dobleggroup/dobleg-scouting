import { useCallback } from 'react'
import { useCurrency } from '@/context/CurrencyContext'
import { formatMarketValueInCurrency } from '@/utils/scoring'
import { FLAG_LABEL, VERDICT_LABEL, type Flag, type Verdict } from '../value'

/** Plata en la moneda elegida en la app (€ o US$), con el mismo formato que Scout Externo. */
export function useMoney() {
  const { currency, rate } = useCurrency()
  return useCallback((eur: number | null | undefined) => (eur ? formatMarketValueInCurrency(eur, currency, rate) : '—'), [currency, rate])
}
export type Money = ReturnType<typeof useMoney>

/** Lado del veredicto: para colores del gráfico y de las barras. */
export type Side = 'barato' | 'justo' | 'caro'
export const sideOf = (v: Verdict | null): Side | null =>
  v === null ? null : v === 'muyBarato' || v === 'barato' ? 'barato' : v === 'justo' ? 'justo' : 'caro'

const VERDICT_CLASS: Record<Verdict, string> = {
  muyBarato: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  barato: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  justo: 'bg-apple-gray-100 dark:bg-apple-gray-700/70 text-apple-gray-600 dark:text-apple-gray-300',
  caro: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  muyCaro: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
}

export function VerdictBadge({ verdict, size = 'sm' }: { verdict: Verdict | null; size?: 'sm' | 'md' }) {
  if (!verdict) return <span className="text-xs text-apple-gray-400">—</span>
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full font-semibold ${VERDICT_CLASS[verdict]} ${size === 'md' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs'}`}>
      {VERDICT_LABEL[verdict]}
    </span>
  )
}

const FLAG_CLASS: Record<Flag, string> = {
  barato: 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/10',
  libre: 'text-sky-700 dark:text-sky-300 bg-sky-500/10',
  contrato: 'text-sky-700 dark:text-sky-300 bg-sky-500/10',
  joven: 'text-violet-700 dark:text-violet-300 bg-violet-500/10',
  sinRep: 'text-amber-700 dark:text-amber-300 bg-amber-500/10',
  familia: 'text-amber-700 dark:text-amber-300 bg-amber-500/10',
  caro: 'text-orange-700 dark:text-orange-300 bg-orange-500/10',
}

export function FlagChips({ flags, skip = [] }: { flags: Flag[]; skip?: Flag[] }) {
  const list = flags.filter(f => !skip.includes(f))
  if (!list.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map(f => <span key={f} className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${FLAG_CLASS[f]}`}>{FLAG_LABEL[f]}</span>)}
    </div>
  )
}

const MONTHS = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sept.', 'oct.', 'nov.', 'dic.']
export const monthYear = (d: string | null) => (d ? `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : '—')

/** "dic. 2026 · faltan 2 meses" con color según lo cerca que está. */
export function ContractText({ end, months, compact = false }: { end: string | null; months: number | null; compact?: boolean }) {
  if (!end || months === null) return <span className="text-apple-gray-400">Sin dato</span>
  const tone = months <= 3 ? 'text-sky-600 dark:text-sky-400 font-semibold' : months <= 9 ? 'text-sky-600/90 dark:text-sky-400/90' : 'text-apple-gray-600 dark:text-apple-gray-300'
  const left = months < 0 ? 'vencido' : months === 0 ? 'termina este mes' : months === 1 ? 'falta 1 mes' : `faltan ${months} meses`
  return <span className={`tabular-nums ${tone}`}>{monthYear(end)}{!compact && <span className="font-normal text-apple-gray-400"> · {left}</span>}</span>
}

/**
 * Dos barras en la misma escala: lo que vale y lo que valen los que rinden
 * parecido. La del jugador va con el color del veredicto.
 */
export function ValueBars({ value, fair, verdict, money }: { value: number | null; fair: number | null; verdict: Verdict | null; money: Money }) {
  if (!value || !fair) return null
  const max = Math.max(value, fair)
  const side = sideOf(verdict)
  const bar = side === 'barato' ? 'bg-emerald-500' : side === 'caro' ? 'bg-orange-500' : 'bg-apple-gray-500 dark:bg-apple-gray-400'
  const row = (label: string, v: number, cls: string, strong: boolean) => (
    <div className="grid grid-cols-[7.5rem_1fr_auto] sm:grid-cols-[8.5rem_1fr_auto] items-center gap-2">
      <span className="text-xs text-apple-gray-500 dark:text-apple-gray-400 truncate">{label}</span>
      <span className="h-2.5 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700/60 overflow-hidden">
        <span className={`block h-full rounded-full ${cls}`} style={{ width: `${Math.max(3, (v / max) * 100)}%` }} />
      </span>
      <span className={`text-sm tabular-nums text-right min-w-[3.5rem] ${strong ? 'font-bold text-apple-gray-800 dark:text-white' : 'font-medium text-apple-gray-500 dark:text-apple-gray-400'}`}>{money(v)}</span>
    </div>
  )
  return (
    <div className="space-y-1.5">
      {row('Vale', value, bar, true)}
      {row('Valen los parecidos', fair, 'bg-apple-gray-300 dark:bg-apple-gray-500', false)}
    </div>
  )
}

/** Edad desde–hasta con dos manijas sobre la misma barra. */
export function AgeRange({ min, max, value, onChange }: {
  min: number; max: number; value: [number, number]; onChange: (v: [number, number]) => void
}) {
  const [lo, hi] = value
  const pct = (v: number) => ((v - min) / Math.max(1, max - min)) * 100
  const all = lo === min && hi === max
  return (
    <div className="flex items-center gap-3 h-8 px-3 rounded-apple bg-apple-gray-100 dark:bg-apple-gray-700/60">
      <span className="text-xs text-apple-gray-500 dark:text-apple-gray-400 whitespace-nowrap">Edad</span>
      <div className="dual-range relative w-32 sm:w-40 h-4">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-apple-gray-200 dark:bg-apple-gray-600" />
        <div className="absolute top-1/2 -translate-y-1/2 h-1 rounded-full bg-brand-green" style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }} />
        <input type="range" aria-label="Edad mínima" min={min} max={max} value={lo} style={{ zIndex: lo > (min + max) / 2 ? 3 : 1 }} onChange={e => onChange([Math.min(Number(e.target.value), hi), hi])} />
        <input type="range" aria-label="Edad máxima" min={min} max={max} value={hi} onChange={e => onChange([lo, Math.max(Number(e.target.value), lo)])} />
      </div>
      <span className="text-xs font-semibold tabular-nums text-apple-gray-700 dark:text-apple-gray-200 whitespace-nowrap min-w-[5.5rem]">
        {all ? 'Todas' : lo === hi ? `${lo} años` : `${lo} a ${hi} años`}
      </span>
    </div>
  )
}
