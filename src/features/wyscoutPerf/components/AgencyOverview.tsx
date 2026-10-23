import { PlayerPhoto } from '@/components/ui/PlayerPhoto'
import { POS_GROUP_LABEL } from '../metrics'
import { monthLabel } from '../periods'
import { LOW_MINUTES_3M, STATUS_LABEL, type Snapshot, type Status } from '../overview'
import { CLASS_GROUPS, ClassBadge, type ClassOrNone } from './classes'
import type { Diagnosis } from '../diagnosis'
import { DiagnosisChips } from './DiagnosisViews'

export interface OverviewPlayer extends Snapshot {
  name: string
  cls: ClassOrNone
  /** Partidos de titular en los últimos 3 meses (API-Football / Sofascore). */
  starts3m: number | null
  diag: Diagnosis | null
}

const STATUS_ORDER: Status[] = ['mejorando', 'parejo', 'bajando', 'sinHistoria', 'juegaPoco', 'sinPartidos']

const STATUS_CHIP: Record<Status, { cls: string; icon: string }> = {
  mejorando: { cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', icon: '▲' },
  bajando: { cls: 'bg-red-500/10 text-red-700 dark:text-red-300', icon: '▼' },
  parejo: { cls: 'bg-apple-gray-100 dark:bg-apple-gray-700/60 text-apple-gray-600 dark:text-apple-gray-300', icon: '=' },
  juegaPoco: { cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-300', icon: '◷' },
  sinPartidos: { cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-300', icon: '!' },
  sinHistoria: { cls: 'bg-apple-gray-100 dark:bg-apple-gray-700/60 text-apple-gray-500 dark:text-apple-gray-400', icon: '·' },
}

const TILES: Array<{ status: Status; title: string; hint: string; tone: string }> = [
  { status: 'mejorando', title: 'Vienen mejorando', hint: 'Contra el año anterior', tone: 'text-emerald-600 dark:text-emerald-400' },
  { status: 'bajando', title: 'Vienen bajando', hint: 'Contra el año anterior', tone: 'text-red-600 dark:text-red-400' },
  { status: 'juegaPoco', title: 'Juegan poco', hint: `Menos de ${LOW_MINUTES_3M}' en 3 meses`, tone: 'text-amber-600 dark:text-amber-400' },
  { status: 'sinPartidos', title: 'Sin partidos recientes', hint: 'Ni este mes ni el anterior', tone: 'text-amber-600 dark:text-amber-400' },
]

/** Cuatro números grandes que se pueden tocar para filtrar las tarjetas. */
export function StatusTiles({ players, active, onPick, photo }: {
  players: OverviewPlayer[]
  active: Status | null
  onPick: (s: Status | null) => void
  photo: (key: string) => string | null
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {TILES.map(t => {
        const list = players.filter(p => p.status === t.status)
        const on = active === t.status
        return (
          <button
            key={t.status}
            onClick={() => onPick(on ? null : t.status)}
            aria-pressed={on}
            className={`text-left p-4 rounded-apple-lg border transition-all ${on ? 'border-brand-green ring-2 ring-brand-green/30 bg-white dark:bg-apple-gray-800' : 'border-apple-gray-200/60 dark:border-apple-gray-700/40 bg-white dark:bg-apple-gray-800 hover:border-apple-gray-300 dark:hover:border-apple-gray-600'}`}
          >
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-bold tabular-nums ${t.tone}`}>{list.length}</span>
              <span className="text-sm font-semibold text-apple-gray-800 dark:text-white leading-tight">{t.title}</span>
            </div>
            <p className="text-2xs text-apple-gray-500 dark:text-apple-gray-400 mt-1 leading-snug">{t.hint}</p>
            <div className="flex -space-x-1.5 mt-2.5 h-6">
              {list.slice(0, 7).map(p => (
                <span key={p.key} title={p.name} className="rounded-full ring-2 ring-white dark:ring-apple-gray-800">
                  <PlayerPhoto src={photo(p.key)} name={p.name} size="xs" rounded="full" className="!w-6 !h-6" />
                </span>
              ))}
              {list.length > 7 && <span className="w-6 h-6 rounded-full ring-2 ring-white dark:ring-apple-gray-800 bg-apple-gray-100 dark:bg-apple-gray-700 text-[9px] font-semibold text-apple-gray-500 flex items-center justify-center">+{list.length - 7}</span>}
            </div>
          </button>
        )
      })}
    </div>
  )
}

/** Minutos por mes del último año: se ve de un vistazo si juega o no. */
function MinutesStrip({ months }: { months: Snapshot['months'] }) {
  const CAP = 450
  return (
    <div className="flex items-end gap-[2px] h-6" role="img" aria-label="Minutos jugados por mes, último año">
      {months.map(m => (
        <span
          key={m.month}
          title={`${monthLabel(`${m.month}-01`)}: ${m.minutes.toLocaleString('es-AR')}'`}
          className={`flex-1 rounded-sm ${m.minutes ? 'bg-brand-green/80' : 'bg-apple-gray-200 dark:bg-apple-gray-700'}`}
          style={{ height: m.minutes ? `${Math.max(14, Math.min(1, m.minutes / CAP) * 100)}%` : '3px' }}
        />
      ))}
    </div>
  )
}

const posLabel = (p: OverviewPlayer) =>
  p.group ? POS_GROUP_LABEL[p.group].one[0].toUpperCase() + POS_GROUP_LABEL[p.group].one.slice(1) : 'Sin posición'

/** Una fila por jugador: quién es, cuánto juega y las tres etiquetas. */
function PlayerRow({ p, photo, onOpen }: { p: OverviewPlayer; photo: (k: string) => string | null; onOpen: () => void }) {
  const chip = STATUS_CHIP[p.status]
  return (
    <li>
      <button onClick={onOpen} className="w-full text-left grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,15rem)_9rem_minmax(0,11rem)_minmax(0,1fr)] items-center gap-x-4 gap-y-1.5 py-2.5 px-2 -mx-2 rounded-apple hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/30 transition">
        <span className="flex items-center gap-2.5 min-w-0">
          <PlayerPhoto src={photo(p.key)} name={p.name} size="sm" rounded="full" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-apple-gray-800 dark:text-white truncate">{p.name}</span>
            <span className="block text-2xs text-apple-gray-500 dark:text-apple-gray-400 truncate">{posLabel(p)}{p.competition ? ` · ${p.competition}` : ''}</span>
          </span>
        </span>

        <span className="hidden md:block">
          <MinutesStrip months={p.months} />
        </span>

        <span className="text-xs text-right md:text-left tabular-nums text-apple-gray-600 dark:text-apple-gray-300" title="Últimos 3 meses. Partidos de API-Football y Sofascore (los de Reserva, de Wyscout)">
          {p.status === 'sinPartidos'
            ? <span className="font-semibold text-amber-600 dark:text-amber-400">Último partido: {monthLabel(`${p.lastMonth}-01`)}</span>
            : <>{p.matches3m} PJ{p.starts3m !== null ? ` · ${p.starts3m} tit.` : ''} · {p.minutes3m.toLocaleString('es-AR')}'</>}
        </span>

        <span className="col-span-2 md:col-span-1">
          {p.diag ? <DiagnosisChips d={p.diag} /> : (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-2xs font-semibold ${chip.cls}`}>
              <span aria-hidden>{chip.icon}</span>{STATUS_LABEL[p.status]}
            </span>
          )}
        </span>
      </button>
    </li>
  )
}

/** Todos los jugadores en una lista corta, agrupados por clase de la agencia. */
export function PlayerCards({ players, photo, onOpen }: {
  players: OverviewPlayer[]
  photo: (key: string) => string | null
  onOpen: (key: string) => void
}) {
  if (!players.length) return <p className="text-sm text-apple-gray-400 py-6 text-center">No hay jugadores con esos filtros.</p>
  return (
    <div className="space-y-5">
      <div className="hidden md:grid grid-cols-[minmax(0,15rem)_9rem_minmax(0,11rem)_minmax(0,1fr)] gap-x-4 text-2xs font-semibold uppercase tracking-wide text-apple-gray-400">
        <span>Jugador</span><span>Minutos por mes (1 año)</span><span>Últimos 3 meses</span><span>Cómo está</span>
      </div>
      {CLASS_GROUPS.map(g => {
        const list = players
          .filter(p => (p.cls ?? 'none') === g.id)
          .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || b.minutes3m - a.minutes3m)
        if (!list.length) return null
        return (
          <div key={g.id}>
            <div className="flex items-center gap-2 pb-1.5 mb-1 border-b border-apple-gray-100 dark:border-apple-gray-700/60">
              <ClassBadge c={g.id === 'none' ? null : g.id} />
              <h3 className="text-sm font-semibold text-apple-gray-800 dark:text-white">{g.label}</h3>
              <span className="text-xs text-apple-gray-400">{list.length} {list.length === 1 ? 'jugador' : 'jugadores'}</span>
            </div>
            <ul className="divide-y divide-apple-gray-100/70 dark:divide-apple-gray-700/40">
              {list.map(p => <PlayerRow key={p.key} p={p} photo={photo} onOpen={() => onOpen(p.key)} />)}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
