import { PlayerPhoto } from '@/components/ui/PlayerPhoto'
import { POS_GROUP_LABEL } from '../metrics'
import { monthLabel } from '../periods'
import { LOW_MINUTES_3M, STATUS_LABEL, type Snapshot, type Status } from '../overview'
import { CLASS_GROUPS, ClassBadge, type ClassOrNone } from './classes'
import type { Diagnosis } from '../diagnosis'
import { DiagnosisChips, DiagnosisMini } from './DiagnosisViews'

export interface OverviewPlayer extends Snapshot {
  name: string
  cls: ClassOrNone
  /** Partidos de titular en los últimos 3 meses (estimado por minutos). */
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
  { status: 'mejorando', title: 'Vienen mejorando', hint: 'Mejoraron en la mayoría de las métricas de su puesto (últimos 6 meses contra el año anterior)', tone: 'text-emerald-600 dark:text-emerald-400' },
  { status: 'bajando', title: 'Vienen bajando', hint: 'Bajaron en la mayoría de las métricas de su puesto (últimos 6 meses contra el año anterior)', tone: 'text-red-600 dark:text-red-400' },
  { status: 'juegaPoco', title: 'Juegan poco', hint: `Menos de ${LOW_MINUTES_3M} minutos en los últimos 3 meses`, tone: 'text-amber-600 dark:text-amber-400' },
  { status: 'sinPartidos', title: 'Sin partidos recientes', hint: 'Nada cargado este mes ni el anterior', tone: 'text-amber-600 dark:text-amber-400' },
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
    <div className="flex items-end gap-[3px] h-7" role="img" aria-label="Minutos jugados por mes, último año">
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

function PlayerCard({ p, photo, onOpen }: { p: OverviewPlayer; photo: (k: string) => string | null; onOpen: () => void }) {
  const chip = STATUS_CHIP[p.status]
  return (
    <button onClick={onOpen} className="card-apple-hover p-4 text-left flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <PlayerPhoto src={photo(p.key)} name={p.name} size="md" rounded="full" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sm text-apple-gray-800 dark:text-white truncate">{p.name}</span>
          </div>
          <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 truncate">
            {p.group ? POS_GROUP_LABEL[p.group].one[0].toUpperCase() + POS_GROUP_LABEL[p.group].one.slice(1) : 'Sin posición'}
            {p.competition ? ` · ${p.competition}` : ''}
          </p>
        </div>
        <ClassBadge c={p.cls} />
      </div>

      <div>
        <MinutesStrip months={p.months} />
        <div className="flex justify-between mt-1 text-2xs text-apple-gray-400">
          <span>Minutos por mes, último año</span>
          {p.status === 'sinPartidos'
            ? <span className="font-semibold text-amber-600 dark:text-amber-400">Último partido: {monthLabel(`${p.lastMonth}-01`)}</span>
            : <span className="tabular-nums" title="Titular = jugó 55 minutos o más">{p.matches3m} PJ{p.starts3m !== null ? ` (${p.starts3m} de titular)` : ''} · {p.minutes3m.toLocaleString('es-AR')}' en 3 meses</span>}
        </div>
      </div>

      {p.diag ? <DiagnosisChips d={p.diag} /> : (
        <span className={`self-start inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold ${chip.cls}`}>
          <span aria-hidden>{chip.icon}</span>{STATUS_LABEL[p.status]}
        </span>
      )}

      {p.diag && (
        <div className="mt-auto pt-2.5 border-t border-apple-gray-100 dark:border-apple-gray-700/60 space-y-2">
          <p className="text-xs font-medium leading-snug text-apple-gray-800 dark:text-apple-gray-100">{p.diag.headline}</p>
          <DiagnosisMini d={p.diag} />
        </div>
      )}
    </button>
  )
}

/** Tarjetas de todos los jugadores, agrupadas por clase de la agencia. */
export function PlayerCards({ players, photo, onOpen }: {
  players: OverviewPlayer[]
  photo: (key: string) => string | null
  onOpen: (key: string) => void
}) {
  if (!players.length) return <p className="text-sm text-apple-gray-400 py-6 text-center">No hay jugadores con esos filtros.</p>
  return (
    <div className="space-y-6">
      {CLASS_GROUPS.map(g => {
        const list = players
          .filter(p => (p.cls ?? 'none') === g.id)
          .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || b.minutes3m - a.minutes3m)
        if (!list.length) return null
        return (
          <div key={g.id}>
            <div className="flex items-center gap-2 mb-3">
              <ClassBadge c={g.id === 'none' ? null : g.id} />
              <h3 className="text-sm font-semibold text-apple-gray-800 dark:text-white">{g.label}</h3>
              <span className="text-xs text-apple-gray-400">{list.length} {list.length === 1 ? 'jugador' : 'jugadores'}</span>
            </div>
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {list.map(p => <PlayerCard key={p.key} p={p} photo={photo} onOpen={() => onOpen(p.key)} />)}
            </div>
          </div>
        )
      })}
    </div>
  )
}
