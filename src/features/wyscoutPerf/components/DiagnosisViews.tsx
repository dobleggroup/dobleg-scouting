import type { ReactNode } from 'react'
import { PlayerPhoto } from '@/components/ui/PlayerPhoto'
import { POS_GROUP_LABEL, fmtMetric, lowerFirst, unitSuffix } from '../metrics'
import { formChip, formText, levelChip, levelText, type BoardRow, type DiagItem, type Diagnosis, type Direction } from '../diagnosis'

type ChipTone = 'good' | 'bad' | 'neutral'
const CHIP: Record<ChipTone, string> = {
  good: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  bad: 'bg-red-500/10 text-red-700 dark:text-red-300',
  neutral: 'bg-apple-gray-100 dark:bg-apple-gray-700/60 text-apple-gray-600 dark:text-apple-gray-300',
}
const dirTone = (s: Direction): ChipTone => (s === 'up' ? 'good' : s === 'down' ? 'bad' : 'neutral')
const dirIcon = (s: Direction) => (s === 'up' ? '▲' : s === 'down' ? '▼' : '=')

function Chip({ tone, icon, children, title }: { tone: ChipTone; icon?: string; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-2xs font-semibold whitespace-nowrap ${CHIP[tone]}`}>
      {icon && <span aria-hidden>{icon}</span>}{children}
    </span>
  )
}

const ROLE_CHIP: Record<Diagnosis['role'], { label: string; tone: ChipTone }> = {
  titular: { label: 'Titular', tone: 'good' },
  alterna: { label: 'Alterna', tone: 'neutral' },
  suplente: { label: 'Suplente', tone: 'bad' },
  casiNoJuega: { label: 'Casi no juega', tone: 'bad' },
  sinPartidos: { label: 'Sin partidos', tone: 'bad' },
}

/** Rol, cómo viene y contra sus pares, en tres etiquetas. */
export function DiagnosisChips({ d }: { d: Diagnosis }) {
  const role = d.roleChange === 'perdioElPuesto' ? { label: 'Perdió el puesto', tone: 'bad' as ChipTone }
    : d.roleChange === 'ganoElPuesto' ? { label: 'Se ganó el puesto', tone: 'good' as ChipTone }
    : ROLE_CHIP[d.role]
  return (
    <div className="flex flex-wrap gap-1.5">
      <Chip tone={role.tone} title={d.roleText}>{role.label}</Chip>
      {d.form && <Chip tone={dirTone(d.form.state)} icon={dirIcon(d.form.state)} title="Últimos 6 meses contra el año anterior, en las métricas de su puesto">{formChip(d.form)}</Chip>}
      {d.level && <Chip tone={dirTone(d.level.state)} title="Último año, contra los de su posición en la agencia">{levelChip(d.level, d.group)}</Chip>}
    </div>
  )
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="leading-snug">
      <span className="font-semibold text-apple-gray-700 dark:text-apple-gray-200">{label}: </span>
      <span className="text-apple-gray-600 dark:text-apple-gray-300">{children}</span>
    </p>
  )
}

/** La conclusión y sus tres motivos, con números. */
export function DiagnosisSummary({ d, size = 'sm', headline = true }: { d: Diagnosis; size?: 'sm' | 'xs'; headline?: boolean }) {
  const many = d.group ? POS_GROUP_LABEL[d.group].many : 'de su puesto'
  return (
    <div className={`space-y-1 ${size === 'xs' ? 'text-xs' : 'text-sm'}`}>
      {headline && <p className="font-semibold text-apple-gray-800 dark:text-white leading-snug">{d.headline}</p>}
      <Line label="Rol">{d.roleText}</Line>
      {d.form && <Line label="Últimos 6 meses contra el año anterior">{formText(d.form)}</Line>}
      {d.level && <Line label={`Contra los otros ${d.level.peers} ${many} de la agencia`}>{levelText(d.level)}</Line>}
    </div>
  )
}

function ItemList({ title, items, icon, iconCls, fmt, empty }: {
  title: string; items: DiagItem[]; icon: string; iconCls: string; fmt: (i: DiagItem) => string; empty: string
}) {
  return (
    <div>
      <h4 className="text-2xs font-semibold uppercase tracking-wide text-apple-gray-500 dark:text-apple-gray-400 mb-1.5">{title}</h4>
      {items.length ? (
        <ul className="space-y-1">
          {items.map(i => (
            <li key={i.metric.key} className="flex gap-2 text-sm leading-snug text-apple-gray-700 dark:text-apple-gray-200">
              <span className={`shrink-0 text-xs mt-0.5 ${iconCls}`} aria-hidden>{icon}</span>
              <span>{fmt(i)}</span>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500">{empty}</p>}
    </div>
  )
}

const val = (i: DiagItem, x: number) => `${fmtMetric(i.metric, x)}${unitSuffix(i.metric)}`

/** Diagnóstico completo de un jugador (vista de detalle): todas las métricas que se movieron. */
export function DiagnosisPanel({ d }: { d: Diagnosis }) {
  const many = d.group ? POS_GROUP_LABEL[d.group].many : 'de su puesto'
  const green = 'text-emerald-600 dark:text-emerald-400', red = 'text-red-600 dark:text-red-400'
  return (
    <div className="space-y-4">
      <DiagnosisChips d={d} />
      <DiagnosisSummary d={d} />
      <div className="grid md:grid-cols-2 gap-5 pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700/60">
        {d.form && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-apple-gray-800 dark:text-white">Cómo viene <span className="font-normal text-apple-gray-400">· últimos 6 meses contra el año anterior ({d.form.total} métricas)</span></h3>
            <ItemList title="Mejoró" items={d.form.better} icon="▲" iconCls={green} empty="En nada claro."
              fmt={i => `${i.metric.label}: de ${fmtMetric(i.metric, i.ref)} a ${val(i, i.value)}`} />
            <ItemList title="Bajó" items={d.form.worse} icon="▼" iconCls={red} empty="En nada claro."
              fmt={i => `${i.metric.label}: de ${fmtMetric(i.metric, i.ref)} a ${val(i, i.value)}`} />
          </div>
        )}
        {d.level && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-apple-gray-800 dark:text-white">Contra los otros {d.level.peers} {many} <span className="font-normal text-apple-gray-400">· último año ({d.level.total} métricas)</span></h3>
            <ItemList title="Mejor que ellos" items={d.level.better} icon="✓" iconCls={green} empty="En nada claro."
              fmt={i => `${i.metric.label}: ${val(i, i.value)} (ellos ${fmtMetric(i.metric, i.ref)})`} />
            <ItemList title="Peor que ellos" items={d.level.worse} icon="✗" iconCls={red} empty="En nada claro."
              fmt={i => `${i.metric.label}: ${val(i, i.value)} (ellos ${fmtMetric(i.metric, i.ref)})`} />
          </div>
        )}
      </div>
      <p className="text-2xs text-apple-gray-400 dark:text-apple-gray-500">
        Solo cuenta una diferencia cuando es clara: 5 puntos o más en los porcentajes, y 25% o más (y al menos 3 jugadas) en lo que es por partido. "Ellos" es el promedio de los {many} de la agencia.
      </p>
    </div>
  )
}

/** Lo bueno y lo malo en una línea cada uno, para la tarjeta del jugador. */
export function DiagnosisMini({ d }: { d: Diagnosis }) {
  const best = d.form?.better[0] ?? d.level?.better[0]
  const worst = d.form?.worse[0] ?? d.level?.worse[0]
  const fmt = (i: DiagItem, trend: boolean) => trend
    ? `${lowerFirst(i.metric.label)} ${fmtMetric(i.metric, i.ref)} → ${fmtMetric(i.metric, i.value)}`
    : `${lowerFirst(i.metric.label)} ${fmtMetric(i.metric, i.value)} (prom. ${fmtMetric(i.metric, i.ref)})`
  if (!best && !worst) return null
  return (
    <div className="space-y-1 text-xs leading-snug">
      {best && <p className="text-apple-gray-700 dark:text-apple-gray-200"><span className="text-emerald-600 dark:text-emerald-400 font-semibold">▲ </span>{fmt(best, best === d.form?.better[0])}</p>}
      {worst && <p className="text-apple-gray-500 dark:text-apple-gray-400"><span className="text-red-600 dark:text-red-400 font-semibold">▼ </span>{fmt(worst, worst === d.form?.worse[0])}</p>}
    </div>
  )
}

/** Lista de jugadores con su diagnóstico (para "En su mejor momento" / "Preocupan"). */
export function MomentList({ items, photo, onOpen, empty }: {
  items: Array<{ d: Diagnosis; name: string; lead?: ReactNode }>
  photo: (k: string) => string | null
  onOpen?: (k: string) => void
  empty: string
}) {
  if (!items.length) return <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500">{empty}</p>
  return (
    <ul className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700/60">
      {items.map(({ d, name, lead }) => {
        const Tag = onOpen ? 'button' : 'div'
        return (
          <li key={d.key}>
            <Tag onClick={onOpen ? () => onOpen(d.key) : undefined} className={`w-full text-left flex gap-3 py-3 ${onOpen ? 'hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/30 rounded-apple -mx-2 px-2 transition' : ''}`}>
              <PlayerPhoto src={photo(d.key)} name={name} size="sm" rounded="full" />
              <span className="min-w-0 flex-1 space-y-1.5">
                <span className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-apple-gray-800 dark:text-white truncate">{name}</span>
                  {lead}
                  {d.group && <span className="text-2xs text-apple-gray-400">{POS_GROUP_LABEL[d.group].one}</span>}
                </span>
                <DiagnosisChips d={d} />
                <DiagnosisSummary d={d} size="xs" headline={false} />
              </span>
            </Tag>
          </li>
        )
      })}
    </ul>
  )
}

/** Lo bueno y lo malo de cada posición (Inicio). */
export function PositionBoard({ rows, name, photo, onOpen }: {
  rows: BoardRow[]
  name: (k: string) => string
  photo: (k: string) => string | null
  onOpen?: (k: string) => void
}) {
  const side = (items: BoardRow['good'], good: boolean) => (
    <ul className="space-y-2.5">
      {items.length ? items.map(i => {
        const Tag = onOpen ? 'button' : 'div'
        return (
          <li key={i.key}>
            <Tag onClick={onOpen ? () => onOpen(i.key) : undefined} className={`w-full text-left flex gap-2 text-xs leading-snug ${onOpen ? 'hover:opacity-80 transition' : ''}`}>
              <PlayerPhoto src={photo(i.key)} name={name(i.key)} size="xs" rounded="full" className="!w-6 !h-6 shrink-0 mt-0.5" />
              <span className="min-w-0">
                <span className="font-semibold text-apple-gray-800 dark:text-white">{name(i.key)}</span>
                <span className={good ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'} aria-hidden> {good ? '▲' : '▼'} </span>
                <span className="text-apple-gray-600 dark:text-apple-gray-300">{i.text}</span>
              </span>
            </Tag>
          </li>
        )
      }) : <li className="text-xs text-apple-gray-400 dark:text-apple-gray-500">{good ? 'Nadie se destaca claro.' : 'Nada preocupante.'}</li>}
    </ul>
  )
  return (
    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
      {rows.map(r => (
        <div key={r.group} className="rounded-apple border border-apple-gray-200/70 dark:border-apple-gray-700/50 p-4">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-sm font-semibold text-apple-gray-800 dark:text-white">{POS_GROUP_LABEL[r.group].many[0].toUpperCase() + POS_GROUP_LABEL[r.group].many.slice(1)}</h3>
            <span className="text-2xs text-apple-gray-400">{r.players} {r.players === 1 ? 'jugador' : 'jugadores'}</span>
          </div>
          <p className="text-2xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400 mb-1.5">Lo bueno</p>
          {side(r.good, true)}
          <p className="text-2xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400 mt-4 mb-1.5">Lo malo</p>
          {side(r.bad, false)}
        </div>
      ))}
    </div>
  )
}
