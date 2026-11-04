import { useCallback, useEffect, useMemo, useState } from 'react'
import NotFoundPage from '@/pages/NotFoundPage'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { ActivitySheet } from '@/components/scouts/ActivityForm'
import ScoutCalendar, { type CalendarView } from '@/components/scouts/ScoutCalendar'
import { useCanSeeScoutsPanel } from '@/hooks/useCanSeeScoutsPanel'
import { useCanApproveActivities } from '@/hooks/useCanApproveActivities'
import { useAuth } from '@/context/AuthContext'
import { fullTeamName } from '@/utils/teamNames'
import {
  addDays,
  deleteActivity,
  fetchScoutsPanel,
  reviewActivity,
  meetingTitle,
  formatDay,
  lastActiveDays,
  lastActiveLabel,
  todayAR,
  type ActivityKind,
  type ScoutActivity,
  type ScoutSummary,
} from '@/services/scoutsPanelService'
import {
  CARD_METRICS,
  initials,
  METRIC_BY_KEY,
  METRICS,
  PERIODS,
  periodLabel,
  periodRange,
  rank,
  type MetricKey,
  type PeriodKey,
} from '@/features/scouts/metrics'

// Página Scouts: cuánto usa la plataforma cada scout y qué trabajo hizo.
// Solo la ven las cuentas de `scouts_panel_viewers`; el resto ve "no encontrado".

// ─── Piezas chicas ───────────────────────────────────────────────────────────

function Avatar({ s, size = 56 }: { s: ScoutSummary; size?: number }) {
  const [failed, setFailed] = useState(false)
  const style = { width: size, height: size }
  if (s.photo_url && !failed) {
    return (
      <img
        src={s.photo_url}
        alt={s.name}
        style={style}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="rounded-full object-cover bg-apple-gray-100 dark:bg-apple-gray-700 ring-2 ring-white dark:ring-apple-gray-800 flex-shrink-0"
      />
    )
  }
  return (
    <div style={style} className="rounded-full bg-brand-green/15 text-brand-green font-bold flex items-center justify-center flex-shrink-0 ring-2 ring-white dark:ring-apple-gray-800">
      <span style={{ fontSize: size * 0.36 }}>{initials(s.name)}</span>
    </div>
  )
}

function lastActiveTone(ts: string | null): { dot: string; text: string } {
  const n = lastActiveDays(ts)
  if (n <= 2) return { dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400' }
  if (n <= 7) return { dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400' }
  return { dot: 'bg-red-500', text: 'text-red-700 dark:text-red-400' }
}

function LastActive({ ts, big = false }: { ts: string | null; big?: boolean }) {
  const tone = lastActiveTone(ts)
  return (
    <span className={`inline-flex items-center gap-2 font-medium ${tone.text} ${big ? 'text-base' : 'text-sm'}`}>
      <span className={`w-2.5 h-2.5 rounded-full ${tone.dot}`} />
      {lastActiveLabel(ts)}
    </span>
  )
}

/** Los últimos 30 días, un cuadradito por día: verde = entró. */
function DaysStrip({ days }: { days: string[] }) {
  const today = todayAR()
  const set = new Set(days)
  const cells = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29))
  return (
    <div>
      <div className="flex gap-[3px]">
        {cells.map(d => (
          <span
            key={d}
            title={`${formatDay(d)}${set.has(d) ? ' · entró' : ''}`}
            className={`flex-1 h-5 rounded-[3px] ${set.has(d) ? 'bg-brand-green' : 'bg-apple-gray-200 dark:bg-apple-gray-700'}`}
          />
        ))}
      </div>
      <div className="flex justify-between mt-1 text-xs text-apple-gray-500 dark:text-apple-gray-400">
        <span>Hace 30 días</span>
        <span>Entró {set.size} de 30 días</span>
        <span>Hoy</span>
      </div>
    </div>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl bg-apple-gray-50 dark:bg-apple-gray-900/60 px-2 py-2.5 text-center">
      <div className={`text-2xl font-bold tabular-nums ${value ? 'text-apple-gray-900 dark:text-white' : 'text-apple-gray-400 dark:text-apple-gray-500'}`}>{value}</div>
      <div className="text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 leading-tight mt-0.5">{label}</div>
    </div>
  )
}

const card = 'bg-white dark:bg-apple-gray-800 rounded-2xl border border-apple-gray-100 dark:border-apple-gray-700 shadow-sm'

// ─── Tarjeta de cada scout ───────────────────────────────────────────────────

function ScoutCard({ s, onOpen }: { s: ScoutSummary; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className={`${card} p-5 text-left hover:border-brand-green/60 hover:shadow-md transition-all`}>
      <div className="flex items-center gap-4">
        <Avatar s={s} size={64} />
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-apple-gray-900 dark:text-white truncate">{s.name}</h3>
          <div className="text-sm text-apple-gray-500 dark:text-apple-gray-400">Última vez que entró</div>
          <LastActive ts={s.last_active} />
        </div>
      </div>
      <div className="mt-4"><DaysStrip days={s.recent_days} /></div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {CARD_METRICS.map(k => <Stat key={k} value={METRIC_BY_KEY[k].value(s)} label={METRIC_BY_KEY[k].label} />)}
      </div>
      <div className="mt-4 text-sm font-medium text-brand-green text-center">Ver detalle</div>
    </button>
  )
}

// ─── Detalle de un scout ─────────────────────────────────────────────────────

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className={`${card} p-5`}>
      <h3 className="text-base font-semibold text-apple-gray-900 dark:text-white mb-3">
        {title}{count !== undefined && <span className="ml-2 text-apple-gray-500 dark:text-apple-gray-400 font-medium">{count}</span>}
      </h3>
      {children}
    </section>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">{text}</p>
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Borrar"
      className="p-1.5 rounded-lg text-apple-gray-400 hover:text-red-600 hover:bg-red-500/10 transition-colors flex-shrink-0"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
    </button>
  )
}

/** Jugadores escritos con coma; los que ya están en Seguimiento llevan tilde verde. */
function PlayerChips({ names, tracked = [] }: { names: string | null; tracked?: string[] }) {
  const list = (names ?? '').split(',').map(n => n.trim()).filter(Boolean)
  if (list.length === 0) return null
  const inTracking = new Set(tracked.map(n => n.toLowerCase()))
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {list.map(n => inTracking.has(n.toLowerCase()) ? (
        <span key={n} title="Está en Seguimiento" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-sm bg-brand-green/15 text-apple-gray-900 dark:text-white">
          <svg className="w-3.5 h-3.5 text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
          {n}
        </span>
      ) : (
        <span key={n} className="px-2 py-0.5 rounded-md text-sm bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-700 dark:text-apple-gray-200">{n}</span>
      ))}
    </div>
  )
}

function Row({ day, children, onDelete }: { day: string | null; children: React.ReactNode; onDelete?: () => void }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span className="w-16 flex-shrink-0 text-sm font-medium text-apple-gray-500 dark:text-apple-gray-400 tabular-nums pt-0.5">{formatDay(day)}</span>
      <div className="min-w-0 flex-1">{children}</div>
      {onDelete && <DeleteButton onClick={onDelete} />}
    </li>
  )
}

const MODE_PILL: Record<string, { label: string; cls: string }> = {
  presencial: { label: 'En cancha', cls: 'bg-brand-green/15 text-apple-gray-900 dark:text-white' },
  tv: { label: 'Por TV', cls: 'bg-sky-500/15 text-apple-gray-900 dark:text-white' },
}
const MEETING_PILL: Record<string, { label: string; cls: string }> = {
  presencial: { label: 'Presencial', cls: 'bg-brand-green/15 text-apple-gray-900 dark:text-white' },
  online: { label: 'Online', cls: 'bg-sky-500/15 text-apple-gray-900 dark:text-white' },
}

function Pill({ p }: { p: { label: string; cls: string } | null | undefined }) {
  if (!p) return null
  return <span className={`ml-2 align-middle px-2 py-0.5 rounded-md text-xs font-medium ${p.cls}`}>{p.label}</span>
}

/** "2 comentarios · 1 nota en una negociación" */
function commentsLabel(comments: number, notes: number): string {
  return [
    comments ? `${comments} ${comments === 1 ? 'comentario' : 'comentarios'}` : null,
    notes ? `${notes} ${notes === 1 ? 'nota en una negociación' : 'notas en negociaciones'}` : null,
  ].filter(Boolean).join(' · ')
}

const PENDING_PILL = { label: 'Falta aceptar', cls: 'bg-amber-500/15 text-amber-800 dark:text-amber-300' }

const mainText = 'text-base font-medium text-apple-gray-900 dark:text-white'
const subText = 'text-sm text-apple-gray-600 dark:text-apple-gray-300'

function ScoutDetail({ s, onBack, onPdf, pdfBusy, onAdd, onDelete }: {
  s: ScoutSummary
  onBack: () => void
  onPdf: (calendarMonth: string) => void
  pdfBusy: boolean
  onAdd: (k: ActivityKind) => void
  onDelete: (id: number) => void
}) {
  const [calView, setCalView] = useState<CalendarView>('semana')
  const [calAnchor, setCalAnchor] = useState(todayAR)
  const meetings = s.activities.filter(a => a.kind === 'reunion')
  const acceptedMeetings = meetings.filter(a => a.review_status === 'aceptada').length
  const pendingTrips = s.activities.filter(a => a.kind === 'viaje' && a.review_status === 'pendiente')
  const firstName = s.name.split(' ')[0]
  const outline = 'px-4 py-2.5 rounded-xl text-sm font-medium border border-apple-gray-200 dark:border-apple-gray-600 text-apple-gray-800 dark:text-white hover:border-brand-green transition-all'

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-apple-gray-600 dark:text-apple-gray-300 hover:text-brand-green">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Todos los scouts
      </button>

      <div className={`${card} p-5`}>
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <Avatar s={s} size={88} />
            <div className="min-w-0">
              <h2 className="text-2xl font-semibold text-apple-gray-900 dark:text-white">{s.name}</h2>
              <div className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-1">Última vez que entró</div>
              <LastActive ts={s.last_active} big />
            </div>
          </div>
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
            <button type="button" onClick={() => onAdd('reunion')} className={outline}>Cargar reunión de {firstName}</button>
            <button type="button" onClick={() => onAdd('viaje')} className={outline}>Cargar viaje de {firstName}</button>
            <button
              type="button"
              onClick={() => onPdf(calAnchor)}
              disabled={pdfBusy}
              className="px-4 py-2.5 rounded-xl text-sm font-medium bg-apple-gray-900 dark:bg-white text-white dark:text-apple-gray-900 hover:opacity-90 disabled:opacity-50 transition-all"
            >
              {pdfBusy ? 'Armando PDF...' : `Extraer PDF de ${s.name}`}
            </button>
          </div>
        </div>
        <div className="mt-5"><DaysStrip days={s.recent_days} /></div>
        <div className="mt-5 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {METRICS.map(m => <Stat key={m.key} value={m.value(s)} label={m.label} />)}
        </div>
      </div>

      <ScoutCalendar scoutId={s.user_id} view={calView} onView={setCalView} anchor={calAnchor} onAnchor={setCalAnchor} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Partidos" count={s.match_list.length}>
          {s.match_list.length === 0 ? <Empty text="Sin partidos en este período." /> : (
            <ul className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700">
              {s.match_list.map((m, i) => (
                <Row key={i} day={m.day}>
                  <div className={mainText}>{m.label || 'Partido'}<Pill p={m.mode ? MODE_PILL[m.mode] : null} /></div>
                  {(m.place || m.competition) && <div className={subText}>{[m.place, m.competition].filter(Boolean).join(' · ')}</div>}
                  <PlayerChips names={m.players} />
                </Row>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Búsquedas de clubes que cargó" count={s.searches}>
          {s.search_list.length === 0 ? <Empty text="No cargó búsquedas de clubes en este período." /> : (
            <ul className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700">
              {s.search_list.map(b => (
                <Row key={`${b.club}-${b.day}`} day={b.day}>
                  <div className={mainText}>{fullTeamName(b.club)}</div>
                  {b.positions.length > 0 && <div className={subText}>Busca: {b.positions.join(', ')}</div>}
                </Row>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Comentarios sobre jugadores" count={s.comments}>
          {s.comments_by_player.length === 0 ? <Empty text="No escribió comentarios sobre jugadores en este período." /> : (
            <ul className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700">
              {s.comments_by_player.map(c => (
                <Row key={c.player} day={c.last.slice(0, 10)}>
                  <div className={mainText}>{c.player}</div>
                  <div className={subText}>{commentsLabel(c.comments, c.negotiation_notes)}</div>
                </Row>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Reuniones" count={acceptedMeetings}>
          {meetings.length === 0 ? <Empty text="Sin reuniones cargadas." /> : (
            <ul className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700">
              {meetings.map(a => (
                <Row key={a.id} day={a.day} onDelete={() => onDelete(a.id)}>
                  <div className={mainText}>
                    {meetingTitle(a)}<Pill p={a.mode ? MEETING_PILL[a.mode] : null} />
                    {a.review_status === 'pendiente' && <Pill p={PENDING_PILL} />}
                  </div>
                  {a.place && <div className={subText}>{a.place}</div>}
                  <PlayerChips names={a.player} tracked={a.tracked} />
                  {a.notes && <div className={`${subText} mt-1 whitespace-pre-line`}>{a.notes}</div>}
                </Row>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Viajes" count={s.trip_list.length}>
          {s.trip_list.length === 0 && pendingTrips.length === 0 ? <Empty text="Sin viajes en este período." /> : (
            <ul className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700">
              {pendingTrips.map(a => (
                <Row key={`p${a.id}`} day={a.day} onDelete={() => onDelete(a.id)}>
                  <div className={mainText}>{a.place}<Pill p={PENDING_PILL} /></div>
                  {a.end_day && a.end_day !== a.day && <div className={subText}>Hasta {formatDay(a.end_day)}</div>}
                </Row>
              ))}
              {s.trip_list.map((t, i) => {
                const detail = [t.end_day && t.end_day !== t.day ? `Hasta ${formatDay(t.end_day)}` : null, t.detail].filter(Boolean).join(' · ')
                return (
                  <Row key={i} day={t.day} onDelete={t.source === 'viaje' && t.id ? () => onDelete(t.id as number) : undefined}>
                    <div className={mainText}>{t.place}</div>
                    {detail && <div className={subText}>{detail}</div>}
                  </Row>
                )
              })}
            </ul>
          )}
        </Section>

        <Section title="Reportes" count={s.reports}>
          {s.report_list.length === 0 ? <Empty text="Sin reportes en este período." /> : (
            <ul className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700">
              {s.report_list.map((r, i) => (
                <Row key={i} day={r.day}>
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className={`${mainText} truncate`}>{r.player}</div>
                      {r.team && <div className={`${subText} truncate`}>{r.team}</div>}
                    </div>
                    {r.score != null && <span className="px-2.5 py-0.5 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700 text-sm font-bold text-apple-gray-900 dark:text-white">{r.score}</span>}
                  </div>
                </Row>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  )
}

// ─── Ranking ─────────────────────────────────────────────────────────────────

const MEDAL = ['bg-amber-400', 'bg-slate-300', 'bg-orange-400']

function Ranking({ scouts }: { scouts: ScoutSummary[] }) {
  const [metric, setMetric] = useState<MetricKey>('days')
  const ranked = useMemo(() => rank(scouts, metric), [scouts, metric])
  const best = useMemo(
    () => Object.fromEntries(METRICS.map(m => [m.key, Math.max(0, ...scouts.map(m.value))])) as Record<MetricKey, number>,
    [scouts],
  )
  const top = ranked.slice(0, 3)
  const podiumOrder = top.length === 3 ? [top[1], top[0], top[2]] : top

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {METRICS.map(m => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMetric(m.key)}
            className={`px-3.5 py-2 rounded-xl text-sm font-medium border transition-all ${
              metric === m.key
                ? 'bg-brand-green border-brand-green text-gray-900'
                : 'bg-white dark:bg-apple-gray-800 border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-700 dark:text-apple-gray-200 hover:border-brand-green'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className={`${card} p-5`}>
        <h3 className="text-lg font-semibold text-apple-gray-900 dark:text-white text-center">{METRIC_BY_KEY[metric].label}</h3>
        <div className="mt-5 flex items-end justify-center gap-3 sm:gap-6">
          {podiumOrder.map(x => {
            const h = x.pos === 1 ? 'h-28' : x.pos === 2 ? 'h-20' : 'h-14'
            return (
              <div key={x.scout.user_id} className="flex flex-col items-center w-24 sm:w-32">
                <Avatar s={x.scout} size={x.pos === 1 ? 72 : 56} />
                <div className="mt-2 text-sm font-medium text-apple-gray-900 dark:text-white text-center leading-tight">{x.scout.name}</div>
                <div className="text-xl font-bold tabular-nums text-apple-gray-900 dark:text-white">{x.value}</div>
                <div className={`mt-1 w-full ${h} rounded-t-xl ${MEDAL[x.pos - 1] ?? 'bg-apple-gray-200'} flex items-start justify-center pt-2`}>
                  <span className="text-lg font-black text-gray-900/80">{x.pos}°</span>
                </div>
              </div>
            )
          })}
        </div>
        <ol className="mt-5 divide-y divide-apple-gray-100 dark:divide-apple-gray-700">
          {ranked.map(x => (
            <li key={x.scout.user_id} className="flex items-center gap-3 py-2.5">
              <span className="w-7 text-base font-medium text-apple-gray-500 dark:text-apple-gray-400 tabular-nums">{x.pos}°</span>
              <Avatar s={x.scout} size={36} />
              <span className="flex-1 text-base font-medium text-apple-gray-900 dark:text-white">{x.scout.name}</span>
              <span className="text-lg font-bold tabular-nums text-apple-gray-900 dark:text-white">{x.value}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-apple-gray-100 dark:border-apple-gray-700">
              <th className="text-left px-4 py-3 font-medium text-apple-gray-600 dark:text-apple-gray-300 sticky left-0 bg-white dark:bg-apple-gray-800">Scout</th>
              {METRICS.map(m => (
                <th key={m.key} className="px-2 py-3 font-medium text-apple-gray-600 dark:text-apple-gray-300 text-center whitespace-nowrap">
                  <button type="button" onClick={() => setMetric(m.key)} className={metric === m.key ? 'text-brand-green' : 'hover:text-brand-green'}>{m.short}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ranked.map(x => (
              <tr key={x.scout.user_id} className="border-b last:border-0 border-apple-gray-100 dark:border-apple-gray-700">
                <td className="px-4 py-2.5 sticky left-0 bg-white dark:bg-apple-gray-800">
                  <div className="flex items-center gap-2.5 whitespace-nowrap">
                    <Avatar s={x.scout} size={28} />
                    <span className="font-medium text-apple-gray-900 dark:text-white">{x.scout.name}</span>
                  </div>
                </td>
                {METRICS.map(m => {
                  const v = m.value(x.scout)
                  const isBest = v > 0 && v === best[m.key]
                  return (
                    <td key={m.key} className="px-2 py-2.5 text-center tabular-nums">
                      <span className={`inline-block min-w-[2rem] px-1.5 py-0.5 rounded-md font-medium ${
                        isBest ? 'bg-brand-green/20 text-apple-gray-900 dark:text-white' : v ? 'text-apple-gray-800 dark:text-apple-gray-200' : 'text-apple-gray-400 dark:text-apple-gray-500'
                      }`}>{v}</span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Para aceptar (Marcos y Matías) ─────────────────────────────────────────

function PendingReview({ items, onReview, busyId }: {
  items: { a: ScoutActivity; scout: ScoutSummary }[]
  onReview: (id: number, status: 'aceptada' | 'rechazada') => void
  busyId: number | null
}) {
  if (items.length === 0) return null
  return (
    <section className={`${card} p-5 border-amber-500/30 dark:border-amber-500/30`}>
      <h2 className="text-base font-semibold text-apple-gray-900 dark:text-white mb-3">
        Para aceptar <span className="ml-1 text-amber-700 dark:text-amber-300">{items.length}</span>
      </h2>
      <ul className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700">
        {items.map(({ a, scout }) => (
          <li key={a.id} className="flex flex-col sm:flex-row sm:items-center gap-3 py-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Avatar s={scout} size={40} />
              <div className="min-w-0">
                <div className={mainText}>
                  {a.kind === 'reunion' ? (a.title ? `Reunión con ${a.title}` : meetingTitle(a)) : `Viaje a ${a.place ?? ''}`}
                  {a.kind === 'reunion' && <Pill p={a.mode ? MEETING_PILL[a.mode] : null} />}
                </div>
                <div className={subText}>
                  {[
                    scout.name,
                    formatDay(a.day),
                    a.kind === 'viaje' && a.end_day && a.end_day !== a.day ? `hasta ${formatDay(a.end_day)}` : null,
                    a.kind === 'reunion' ? a.place : null,
                  ].filter(Boolean).join(' · ')}
                </div>
                <PlayerChips names={a.player} tracked={a.tracked} />
                {a.notes && <div className={`${subText} mt-1 whitespace-pre-line`}>{a.notes}</div>}
              </div>
            </div>
            <div className="flex gap-2 sm:flex-shrink-0">
              <button
                type="button"
                disabled={busyId === a.id}
                onClick={() => onReview(a.id, 'aceptada')}
                className="flex-1 sm:flex-none px-4 py-2 rounded-xl text-sm font-semibold text-gray-900 bg-brand-green hover:brightness-95 disabled:opacity-50 transition-all"
              >
                Aceptar
              </button>
              <button
                type="button"
                disabled={busyId === a.id}
                onClick={() => onReview(a.id, 'rechazada')}
                className="flex-1 sm:flex-none px-4 py-2 rounded-xl text-sm font-medium border border-apple-gray-300 dark:border-apple-gray-600 text-apple-gray-700 dark:text-apple-gray-200 hover:border-red-500 hover:text-red-600 disabled:opacity-50 transition-all"
              >
                Rechazar
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ─── Página ──────────────────────────────────────────────────────────────────

type Tab = 'scouts' | 'ranking'

export default function ScoutsPage() {
  const allowed = useCanSeeScoutsPanel()
  const canApprove = useCanApproveActivities()
  const { userDisplayName } = useAuth()
  const [reviewingId, setReviewingId] = useState<number | null>(null)
  const [period, setPeriod] = useState<PeriodKey>('30d')
  const [tab, setTab] = useState<Tab>('scouts')
  const [data, setData] = useState<ScoutSummary[] | null>(null)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState<{ kind: ActivityKind; scoutId: string } | null>(null)
  const [pdfBusy, setPdfBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { from, to } = periodRange(period)
    try {
      setError('')
      setData(await fetchScoutsPanel(from, to))
    } catch {
      setError('No se pudieron cargar los datos. Probá de nuevo en un rato.')
      setData([])
    }
  }, [period])

  useEffect(() => { if (allowed) load() }, [allowed, load])

  const pending = useMemo(
    () => (data ?? [])
      .flatMap(scout => scout.activities.filter(a => a.review_status === 'pendiente').map(a => ({ a, scout })))
      .sort((x, y) => x.a.created_at.localeCompare(y.a.created_at)),
    [data],
  )

  const handleReview = async (id: number, status: 'aceptada' | 'rechazada') => {
    setReviewingId(id)
    const err = await reviewActivity(id, status, userDisplayName || 'Usuario')
    setReviewingId(null)
    if (err) { setError('No se pudo guardar. Probá de nuevo.'); return }
    load()
  }

  const scoutList = useMemo(() => (data ?? []).map(s => ({ user_id: s.user_id, name: s.name })), [data])
  const open = data?.find(s => s.user_id === openId) ?? null

  const handlePdf = async (only: ScoutSummary | null, calendarMonth: string = todayAR()) => {
    if (!data || pdfBusy) return
    setPdfBusy(only?.user_id ?? 'all')
    try {
      const { exportScoutsPdf } = await import('@/features/scouts/exportScoutsPdf')
      await exportScoutsPdf(data, periodLabel(period), only, calendarMonth)
    } catch {
      setError('No se pudo armar el PDF. Probá de nuevo.')
    } finally {
      setPdfBusy(null)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Borrar esto?')) return
    const err = await deleteActivity(id)
    if (err) { setError('No se pudo borrar. Probá de nuevo.'); return }
    load()
  }

  if (allowed === undefined) return null
  if (!allowed) return <NotFoundPage />

  const tabBtn = (t: Tab, label: string) => (
    <button
      type="button"
      onClick={() => { setTab(t); setOpenId(null) }}
      className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
        tab === t ? 'bg-white dark:bg-apple-gray-700 text-apple-gray-900 dark:text-white shadow-sm' : 'text-apple-gray-600 dark:text-apple-gray-300 hover:text-apple-gray-900 dark:hover:text-white'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="min-h-screen bg-apple-gray-50 dark:bg-apple-gray-900">
      <div className="max-w-6xl mx-auto px-4 py-6 pb-32 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-apple-gray-900 dark:text-white">Scouts</h1>
            <p className="text-sm text-apple-gray-600 dark:text-apple-gray-400">{periodLabel(period)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex p-1 rounded-xl bg-apple-gray-100 dark:bg-apple-gray-800">
              {tabBtn('scouts', 'Scouts')}
              {tabBtn('ranking', 'Ranking')}
            </div>
            <button
              type="button"
              onClick={() => handlePdf(null)}
              disabled={!data?.length || !!pdfBusy}
              className="px-4 py-2.5 rounded-xl text-sm font-medium bg-apple-gray-900 dark:bg-white text-white dark:text-apple-gray-900 hover:opacity-90 disabled:opacity-50 transition-all"
            >
              {pdfBusy === 'all' ? 'Armando PDF...' : 'Extraer PDF de todos los scouts'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {PERIODS.map(p => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={`px-3.5 py-2 rounded-xl text-sm font-medium border transition-all ${
                period === p.key
                  ? 'bg-apple-gray-900 dark:bg-white border-transparent text-white dark:text-apple-gray-900'
                  : 'bg-white dark:bg-apple-gray-800 border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-700 dark:text-apple-gray-200 hover:border-apple-gray-400'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {error && <p className="text-sm text-red-700 dark:text-red-400 bg-red-500/10 px-4 py-3 rounded-xl">{error}</p>}

        {canApprove && <PendingReview items={pending} onReview={handleReview} busyId={reviewingId} />}

        {data === null ? (
          <div className="py-20 flex justify-center"><LoadingSpinner /></div>
        ) : tab === 'ranking' ? (
          <Ranking scouts={data} />
        ) : open ? (
          <ScoutDetail
            s={open}
            onBack={() => setOpenId(null)}
            onPdf={month => handlePdf(open, month)}
            pdfBusy={pdfBusy === open.user_id}
            onAdd={kind => setAdding({ kind, scoutId: open.user_id })}
            onDelete={handleDelete}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.map(s => <ScoutCard key={s.user_id} s={s} onOpen={() => { setOpenId(s.user_id); window.scrollTo({ top: 0 }) }} />)}
          </div>
        )}
      </div>

      <ActivitySheet
        kind={adding?.kind ?? null}
        defaultScoutId={adding?.scoutId}
        scouts={scoutList}
        onClose={() => setAdding(null)}
        onSaved={load}
      />
    </div>
  )
}
