import { useEffect, useMemo, useState } from 'react'
import { useData } from '@/context/DataContext'
import Panel, { PanelSkeleton, Segmented } from '@/features/tablero/components/Panel'
import { loadMinuta } from '../loadMinuta'
import { buildReport, monthTitle, shiftMonth, type ActionItem, type MinutaReport, type PlayerMonth, type Quadrant, type Tone } from '../analyze'

/**
 * "Resumen del mes" de Rendimiento individual: lo mismo que la minuta que se
 * manda por mail el 6 de cada mes, con todo el detalle de cada jugador.
 */

const TONE_TEXT: Record<Tone, string> = {
  good: 'text-emerald-700 dark:text-emerald-400',
  bad: 'text-red-600 dark:text-red-400',
  neutral: 'text-amber-700 dark:text-amber-400',
}
const TONE_DOT: Record<Tone, string> = { good: 'bg-emerald-500', bad: 'bg-red-500', neutral: 'bg-amber-400' }
const TONE_BORDER: Record<Tone, string> = { good: 'border-l-emerald-500', bad: 'border-l-red-500', neutral: 'border-l-amber-400' }
const TONE_SOFT: Record<Tone, string> = {
  good: 'bg-emerald-50 dark:bg-emerald-900/20', bad: 'bg-red-50 dark:bg-red-900/20', neutral: 'bg-amber-50 dark:bg-amber-900/20',
}
const POS: Record<string, string> = { ARQ: 'Arquero', DEF: 'Central', LAT: 'Lateral', VC: 'Volante central', MED: 'Volante', EXT: 'Extremo', DEL: 'Delantero' }
const MONTH_INITIAL = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const fmt1 = (v: number) => v.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

const cache = new Map<string, Promise<MinutaReport>>()

/** Último mes cerrado: hasta el 5 inclusive todavía se completan los datos del anterior. */
function lastClosedMonth(today = new Date()) {
  const ym = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  return shiftMonth(ym, today.getDate() > 5 ? -1 : -2)
}

function Strip({ p }: { p: PlayerMonth }) {
  return (
    <div className="flex gap-1" aria-label="Últimos 6 meses">
      {p.history.map(m => (
        <span key={m.month} className="flex flex-col items-center gap-0.5" title={`${monthTitle(m.month)}: ${m.tone === 'good' ? 'bueno' : m.tone === 'bad' ? 'flojo' : m.tone === 'neutral' ? 'parejo' : 'sin datos'}`}>
          <span className={`w-2.5 h-2.5 rounded-full ${m.tone ? TONE_DOT[m.tone] : 'bg-apple-gray-200 dark:bg-apple-gray-600'}`} />
          <span className="text-[9px] leading-none text-apple-gray-400">{MONTH_INITIAL[Number(m.month.slice(5, 7)) - 1]}</span>
        </span>
      ))}
    </div>
  )
}

function ActionCard({ a }: { a: ActionItem }) {
  return (
    <div className={`border border-apple-gray-200/60 dark:border-apple-gray-700/40 border-l-4 ${TONE_BORDER[a.tone]} rounded-apple p-3.5 bg-white dark:bg-apple-gray-800`}>
      <span className={`inline-block text-2xs font-semibold px-2 py-0.5 rounded-full ${TONE_SOFT[a.tone]} ${TONE_TEXT[a.tone]}`}>{a.tag}</span>
      <p className="mt-1.5 text-sm font-semibold text-apple-gray-800 dark:text-white">{a.title}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-apple-gray-500 dark:text-apple-gray-400">{a.text}</p>
    </div>
  )
}

function FormColumn({ title, list, up }: { title: string; list: PlayerMonth[]; up: boolean }) {
  return (
    <div className="rounded-apple bg-apple-gray-50 dark:bg-apple-gray-700/30 p-4">
      <h3 className={`text-sm font-semibold ${up ? TONE_TEXT.good : TONE_TEXT.bad}`}>{title}</h3>
      {list.length === 0 && <p className="mt-2 text-xs text-apple-gray-400">Nadie con un cambio claro.</p>}
      <ul className="mt-1 divide-y divide-apple-gray-200/60 dark:divide-apple-gray-700/40">
        {list.map(p => {
          const n = p.wy ? (up ? p.wy.better.length : p.wy.worse.length) : 0
          return (
            <li key={p.key} className="py-2">
              <p className="text-sm font-medium text-apple-gray-800 dark:text-white">{p.name} <span className="text-xs font-normal text-apple-gray-400">{p.club}</span></p>
              <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400">
                {p.rating != null && <>Nota {fmt1(p.rating)}{p.baseRating != null && <span className="text-apple-gray-400"> (venía {fmt1(p.baseRating)})</span>}</>}
                {p.wy && p.wy.total >= 4 && n > 0 && <> · Wyscout: {up ? 'mejor' : 'peor'} en {n} de {p.wy.total}</>}
              </p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const QUAD: Record<Quadrant, { title: string; hint: string; tone: Tone }> = {
  pidePista: { title: 'Rinden pero no juegan', hint: 'Merecen más minutos', tone: 'neutral' },
  consolidado: { title: 'Consolidados', hint: 'Juegan y rinden', tone: 'good' },
  enRiesgo: { title: 'En riesgo', hint: 'Ni juegan ni rinden', tone: 'bad' },
  aMejorar: { title: 'Juegan pero no rinden', hint: 'Tienen lugar, falta nivel', tone: 'neutral' },
}

function numbers(p: PlayerMonth) {
  const n = p.nums
  if (!n.matches) return null
  const bits = [`${n.matches} ${n.matches === 1 ? 'partido' : 'partidos'} (${n.starts} de titular)`, `${n.minutes.toLocaleString('es-AR')}'`]
  if (n.goals) bits.push(`${n.goals} ${n.goals === 1 ? 'gol' : 'goles'}`)
  if (n.assists) bits.push(`${n.assists} ${n.assists === 1 ? 'asistencia' : 'asistencias'}`)
  if (p.share != null) bits.push(`${Math.round(p.share * 100)}% de los minutos de su equipo`)
  return bits.join(' · ')
}

function PlayerRow({ p }: { p: PlayerMonth }) {
  const line = numbers(p)
  return (
    <li className="py-3.5 flex gap-4 items-start">
      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${TONE_DOT[p.tone]}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-sm font-semibold text-apple-gray-800 dark:text-white">
            {p.name} <span className="text-xs font-normal text-apple-gray-400">{[p.club, p.group ? POS[p.group] : null].filter(Boolean).join(' · ')}</span>
          </p>
          <Strip p={p} />
        </div>
        <p className="mt-1 text-sm text-apple-gray-700 dark:text-apple-gray-200">{p.headline}</p>
        {line && <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400">{line}</p>}
        {p.pattern && <p className={`mt-0.5 text-xs font-semibold ${TONE_TEXT[p.pattern.tone]}`}>{p.pattern.text}.</p>}
        {p.detail.length > 0 && (
          <ul className="mt-1.5 space-y-0.5">
            {p.detail.map(d => <li key={d} className="text-xs leading-relaxed text-apple-gray-500 dark:text-apple-gray-400">{d}</li>)}
          </ul>
        )}
      </div>
    </li>
  )
}

type ToneFilter = 'all' | Tone

export default function MonthSummaryView() {
  const { internal } = useData()
  const months = useMemo(() => {
    const last = lastClosedMonth()
    return Array.from({ length: 6 }, (_, i) => shiftMonth(last, -i))
  }, [])
  const [month, setMonth] = useState(months[0])
  const [report, setReport] = useState<MinutaReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<ToneFilter>('all')

  useEffect(() => {
    let alive = true
    setReport(null)
    setError(null)
    if (!cache.has(month)) {
      const p = loadMinuta(month, { internalRows: internal as unknown as Array<Record<string, string>>, coaches: false }).then(buildReport)
      p.catch(() => cache.delete(month))
      cache.set(month, p)
    }
    cache.get(month)!.then(r => { if (alive) setReport(r) }).catch(e => { if (alive) setError((e as Error).message) })
    return () => { alive = false }
  }, [month, internal])

  const monthPicker = (
    <select
      value={month}
      onChange={e => setMonth(e.target.value)}
      aria-label="Mes"
      className="text-xs font-medium rounded-lg border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 text-apple-gray-700 dark:text-apple-gray-200 px-2.5 py-1.5"
    >
      {months.map(m => <option key={m} value={m}>{monthTitle(m)}</option>)}
    </select>
  )

  if (error) {
    return <div className="px-4 py-3 rounded-apple-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 text-sm text-red-700 dark:text-red-300">No se pudo armar el resumen del mes: {error}</div>
  }
  if (!report) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">Armando el resumen de {monthTitle(month).toLowerCase()} con partidos, Wyscout y GPS…</p>
          {monthPicker}
        </div>
        <PanelSkeleton height="h-44" />
        <PanelSkeleton height="h-64" />
      </div>
    )
  }

  const r = report
  const classes: Array<[string, PlayerMonth[]]> = [
    ['Clase A', r.players.filter(p => p.cls === 'A')], ['Clase B', r.players.filter(p => p.cls === 'B')],
    ['Clase C', r.players.filter(p => p.cls === 'C')], ['Sin calificar', r.players.filter(p => !p.cls)],
  ]
  const shown = (p: PlayerMonth) => filter === 'all' || p.tone === filter

  return (
    <div className="space-y-5">
      {/* ── Cabecera ── */}
      <section className="rounded-apple-lg bg-apple-gray-900 dark:bg-apple-gray-800 text-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-2xs font-semibold uppercase tracking-wider text-emerald-400">Resumen del mes · también llega por mail el 6</p>
            <h2 className="mt-1 text-xl sm:text-2xl font-bold">Cómo rindieron en {monthTitle(r.month).toLowerCase()}</h2>
          </div>
          {monthPicker}
        </div>
        <ul className="mt-4 space-y-1.5">
          {r.summary.map(s => <li key={s} className="flex gap-2 text-sm text-apple-gray-200"><span className="text-emerald-400">•</span>{s}</li>)}
        </ul>
      </section>

      {/* ── Números ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {r.kpis.map(k => {
          const f = k.fmt ?? ((v: number) => v.toLocaleString('es-AR'))
          const d = k.value - k.prev
          return (
            <div key={k.label} className="bg-white dark:bg-apple-gray-800 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 p-4">
              <p className="text-2xs text-apple-gray-500 dark:text-apple-gray-400">{k.label}</p>
              <p className="mt-1 text-2xl font-bold text-apple-gray-900 dark:text-white tabular-nums">{f(k.value)}{k.hint && <span className="text-xs font-medium text-apple-gray-400"> {k.hint}</span>}</p>
              <p className={`text-2xs font-semibold ${d > 0 ? TONE_TEXT.good : d < 0 ? TONE_TEXT.bad : 'text-apple-gray-400'}`}>
                {d > 0 ? `▲ ${f(d)}` : d < 0 ? `▼ ${f(-d)}` : '= igual'} <span className="font-normal text-apple-gray-400">vs. mes anterior</span>
              </p>
            </div>
          )
        })}
      </div>

      {r.actions.length > 0 && (
        <Panel title="Para decidir" subtitle="Lo que pide una decisión este mes, primero los clase A.">
          <div className="grid gap-2.5 md:grid-cols-2">{r.actions.map(a => <ActionCard key={a.key + a.tag} a={a} />)}</div>
        </Panel>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Forma del mes" subtitle="Cada uno contra sí mismo en los 6 meses anteriores."
          source="Se compara la nota promedio de los partidos (API-Football / Sofascore) y las métricas de Wyscout que importan en su puesto, contra sus propios 6 meses anteriores. Hace falta jugar al menos 90 minutos en el mes.">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormColumn title="▲ Subieron" list={r.risers} up />
            <FormColumn title="▼ Bajaron" list={r.fallers} up={false} />
          </div>
        </Panel>

        <Panel title="Mapa de la cartera" subtitle="Cuánto juega contra cómo rinde, en el mes."
          source="Minutos que jugó sobre los minutos de su equipo (juega = 50% o más) y nota promedio del mes (rinde = 6,8 o más). Hacen falta 2 partidos con nota.">
          <div className="grid grid-cols-2 gap-2.5">
            {(['pidePista', 'consolidado', 'enRiesgo', 'aMejorar'] as Quadrant[]).map(q => (
              <div key={q} className={`rounded-apple p-3 ${TONE_SOFT[QUAD[q].tone]}`}>
                <p className={`text-sm font-semibold ${TONE_TEXT[QUAD[q].tone]}`}>{QUAD[q].title} ({r.quadrants[q].length})</p>
                <p className="text-2xs text-apple-gray-500 dark:text-apple-gray-400 mb-1.5">{QUAD[q].hint}</p>
                {r.quadrants[q].length === 0 && <p className="text-xs text-apple-gray-400">Nadie este mes</p>}
                {r.quadrants[q].map(p => (
                  <p key={p.key} className="text-xs text-apple-gray-700 dark:text-apple-gray-200">
                    {p.name} <span className="text-apple-gray-400">{p.share != null ? `${Math.round(p.share * 100)}%` : ''}{p.rating != null ? ` · ${fmt1(p.rating)}` : ''}</span>
                  </p>
                ))}
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {r.patterns.length > 0 && (
        <Panel title="Tendencias" subtitle="Lo que se repite mes a mes: un mal mes puede ser casualidad, tres seguidos ya es un patrón."
          source="Cada punto es el veredicto de un mes (verde bueno, ámbar parejo, rojo flojo, gris sin datos), calculado con la misma regla que el mes actual. El último punto es el mes elegido.">
          <ul className="grid gap-x-6 md:grid-cols-2 divide-y md:divide-y-0 divide-apple-gray-100 dark:divide-apple-gray-700/50">
            {r.patterns.map(p => (
              <li key={p.key} className="py-2.5 flex items-center justify-between gap-3 md:border-b md:border-apple-gray-100 md:dark:border-apple-gray-700/50">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-apple-gray-800 dark:text-white truncate">{p.name}{p.cls && <span className="text-xs font-normal text-apple-gray-400"> · Clase {p.cls}</span>}</p>
                  <p className={`text-xs font-medium ${TONE_TEXT[p.pattern!.tone]}`}>{p.pattern!.text}</p>
                </div>
                <Strip p={p} />
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel
        title="Jugador por jugador"
        subtitle="El punto de color resume el mes; a la derecha, sus últimos 6 meses."
        actions={<Segmented label="Filtrar" value={filter} onChange={setFilter}
          options={[{ id: 'all', label: 'Todos' }, { id: 'good', label: 'Buen mes' }, { id: 'neutral', label: 'Parejo' }, { id: 'bad', label: 'Flojo' }]} />}
        source="Partidos, minutos, goles y nota: API-Football y Sofascore (si Wyscout tiene más partidos de Primera, se usa Wyscout). Titular = 55 minutos o más. Wyscout: las métricas de su puesto contra sus 6 meses anteriores; si sólo jugó en Reserva, se analiza su Reserva. GPS: sólo para los jugadores cuyos clubes lo mandan (se empezó a cargar hace poco), partidos de 30 minutos o más."
      >
        {classes.filter(([, l]) => l.some(shown)).map(([title, list]) => (
          <div key={title} className="mt-2 first:mt-0">
            <h3 className="text-2xs font-semibold uppercase tracking-wider text-apple-gray-400">{title} · {list.filter(shown).length}</h3>
            <ul className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700/50">
              {list.filter(shown).map(p => <PlayerRow key={p.key} p={p} />)}
            </ul>
          </div>
        ))}
      </Panel>

      <p className="text-2xs leading-relaxed text-apple-gray-400 dark:text-apple-gray-500">
        Los datos de cada mes se cierran el día 5 (partidos de todas las ligas, Wyscout, GPS y Transfermarkt). Si un partido de los últimos días todavía no estaba cargado, aparece en el resumen del mes siguiente.
      </p>
    </div>
  )
}
