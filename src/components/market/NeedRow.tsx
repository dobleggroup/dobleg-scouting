import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { TeamLogo } from '@/components/ui/PlayerPhoto'
import AssigneeSelect from './AssigneeSelect'
import MarketNotesPanel from './MarketNotesPanel'
import NeedCandidatesPanel from './NeedCandidatesPanel'
import StatusPill from './StatusPill'
import FollowupDateField from './FollowupDateField'
import { NEED_STATUS_LABEL_KEY, NEED_STATUS_COLOR, NEED_STATUS_ORDER, NEED_STATUS_ACCENT, CANDIDATE_STATUS_ORDER, CANDIDATE_STATUS_LABEL_KEY } from './marketLabels'
import { updateNeedStatus, updateFollowupDate, reassignNeed, setNeedHidden } from '@/services/marketService'
import type { ClubNeed, NeedStatus, NeedCandidate, Negotiation, TeamMember, CandidateStatus } from '@/types/market'

/** Punto de color por estado del ofrecido, para el resumen de la fila cerrada. */
const CANDIDATE_DOT: Record<CandidateStatus, string> = {
  propuesto: 'bg-sky-500',
  en_negociacion: 'bg-amber-500',
  fichado: 'bg-emerald-500',
  descartado: 'bg-red-400',
}

export default function NeedRow({
  need,
  onUpdated,
  defaultExpanded = false,
  overdue = false,
  flash = false,
  onNegotiationMightHaveChanged,
  candidates,
  negotiationsById,
  overdueNegotiationIds,
  members,
  onCandidatesChange,
  onNegotiationUpserted,
  onNegotiationRemoved,
  onOpenNegotiation,
}: {
  need: ClubNeed
  onUpdated: (n: ClubNeed) => void
  candidates: NeedCandidate[]
  negotiationsById: Map<number, Negotiation>
  overdueNegotiationIds: Set<number>
  members: TeamMember[]
  onCandidatesChange: (update: (prev: NeedCandidate[]) => NeedCandidate[]) => void
  onNegotiationUpserted: (n: Negotiation) => void
  onNegotiationRemoved: (id: number) => void
  onOpenNegotiation: (id: number) => void
  defaultExpanded?: boolean
  overdue?: boolean
  /** Resalte momentáneo al llegar desde el calendario semanal, para ubicar
   * la fila sin forzar que se expanda. */
  flash?: boolean
  /** Cambiar el estado de un candidato acá se sincroniza server-side a la
   * negociación de la que vino (si vino de una) — se llama para que esa
   * lista hermana no quede desactualizada en pantalla. */
  onNegotiationMightHaveChanged?: () => void
}) {
  const { user, userDisplayName } = useAuth()
  const { t } = useLanguage()
  const [expanded, setExpanded] = useState(defaultExpanded)
  const rowRef = useRef<HTMLDivElement>(null)

  // Reacciona a `defaultExpanded` (no solo al montaje): si ya estabas en esta
  // página y tocás otra notificación de la campanita, la fila que corresponde
  // recién ahora pasa a `defaultExpanded=true` sin que el componente se
  // remonte — sin este efecto dependiendo del valor, ni se expandía ni
  // scrolleaba.
  useEffect(() => {
    if (defaultExpanded) {
      setExpanded(true)
      rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [defaultExpanded])
  const [reassigning, setReassigning] = useState(false)
  const [notesRefreshSignal, setNotesRefreshSignal] = useState(0)

  const closed = need.status === 'cerrado'
  // Activos primero (en negociación > ofrecido > fichado), descartados al final.
  const summary = [...candidates].sort((a, b) =>
    ['en_negociacion', 'propuesto', 'fichado', 'descartado'].indexOf(a.status) - ['en_negociacion', 'propuesto', 'fichado', 'descartado'].indexOf(b.status))
  const candidateLabels = Object.fromEntries(
    CANDIDATE_STATUS_ORDER.map(s => [s, t(CANDIDATE_STATUS_LABEL_KEY[s])]),
  ) as Record<CandidateStatus, string>

  const handleStatusChange = async (status: NeedStatus) => {
    const ok = await updateNeedStatus(need.id, status)
    if (ok) onUpdated({ ...need, status })
  }

  const needStatusLabels = Object.fromEntries(
    NEED_STATUS_ORDER.map(s => [s, t(NEED_STATUS_LABEL_KEY[s])]),
  ) as Record<NeedStatus, string>

  const isHidden = !!need.hidden_at
  const handleToggleHidden = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isHidden && !confirm(t('mercado.confirmarOcultarBusqueda').replace('{club}', need.team_name))) return
    const name = userDisplayName || 'Usuario'
    if (await setNeedHidden(need.id, !isHidden, name)) {
      onUpdated({ ...need, hidden_at: isHidden ? null : new Date().toISOString(), hidden_by_name: isHidden ? null : name })
    }
  }

  const handleFollowupChange = async (date: string | null) => {
    const ok = await updateFollowupDate({ needId: need.id }, date)
    if (ok) onUpdated({ ...need, next_followup_date: date })
  }

  const handleReassign = async (id: number, name: string) => {
    const ok = await reassignNeed(need.id, id, name, user?.id ?? null, userDisplayName || 'Usuario')
    if (ok) {
      onUpdated({ ...need, assigned_to_id: id, assigned_to_name: name })
      setReassigning(false)
      setNotesRefreshSignal(s => s + 1)
    }
  }

  return (
    <div
      ref={rowRef}
      id={`market-need-${need.id}`}
      className={`rounded-xl border overflow-hidden transition-all ${
        closed ? 'bg-apple-gray-50 dark:bg-apple-gray-800/40' : 'bg-white dark:bg-apple-gray-800'
      } ${defaultExpanded || flash ? 'border-brand-green ring-1 ring-brand-green/30' : closed ? 'border-dashed border-apple-gray-300 dark:border-apple-gray-700' : 'border-apple-gray-200 dark:border-apple-gray-700'} ${isHidden ? 'opacity-60' : ''}`}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(e => !e)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(x => !x) } }}
        className="w-full flex flex-col gap-2 sm:grid sm:grid-cols-[auto_minmax(0,2fr)_7rem_7rem_5.5rem_2rem] sm:items-center sm:gap-3 px-4 py-3 sm:py-3.5 text-left hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/40 transition-colors font-sans cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0 sm:contents">
          <div className={`flex items-center gap-2 flex-shrink-0 ${closed ? 'opacity-50 grayscale' : ''}`}>
            <TeamLogo src={need.team_logo} className="w-8 h-8 drop-shadow-md flex-shrink-0" />
          </div>

          <div className="min-w-0 flex-1 sm:flex-none">
            <p className={`font-semibold text-sm truncate flex items-center gap-1.5 ${closed ? 'text-apple-gray-500 dark:text-apple-gray-400' : 'text-apple-gray-800 dark:text-white'}`}>
              {closed && (
                <svg className="w-3.5 h-3.5 flex-shrink-0 text-apple-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-label={t('mercado.busquedaCerrada')}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              )}
              <span className="truncate">{need.team_name}</span>
            </p>
            <p className="text-2xs text-apple-gray-400 truncate">{need.position_label}</p>
            {summary.length > 0 && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                {summary.slice(0, 4).map(c => (
                  <span
                    key={c.id}
                    title={candidateLabels[c.status]}
                    className={`inline-flex items-center gap-1 max-w-[10rem] pl-1.5 pr-2 py-0.5 rounded-full text-2xs ${
                      c.status === 'descartado'
                        ? 'text-apple-gray-400 line-through decoration-apple-gray-300 bg-transparent'
                        : 'text-apple-gray-600 dark:text-apple-gray-300 bg-apple-gray-100 dark:bg-apple-gray-700/70'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${CANDIDATE_DOT[c.status]}`} />
                    <span className="truncate">{c.player_name}</span>
                  </span>
                ))}
                {summary.length > 4 && <span className="text-2xs text-apple-gray-400">+{summary.length - 4}</span>}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap pl-[3.25rem] sm:pl-0 sm:contents">
          <StatusPill
            value={need.status}
            options={NEED_STATUS_ORDER}
            labels={needStatusLabels}
            colors={NEED_STATUS_COLOR}
            onChange={handleStatusChange}
            title={t('mercado.cambiarEstado')}
          />
          <span className="text-xs text-apple-gray-500 dark:text-apple-gray-400 truncate min-w-0">{need.assigned_to_name || '—'}</span>
          <div className="ml-auto sm:ml-0 sm:text-right">
            {closed
              ? <span className="text-2xs text-apple-gray-400">{t('mercado.busquedaCerrada')}</span>
              : <FollowupDateField value={need.next_followup_date} overdue={overdue} onChange={handleFollowupChange} />}
          </div>
          <button
            type="button"
            onClick={handleToggleHidden}
            title={isHidden ? t('mercado.volverAMostrar') : t('mercado.ocultarBusqueda')}
            aria-label={isHidden ? t('mercado.volverAMostrar') : t('mercado.ocultarBusqueda')}
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${isHidden
              ? 'text-brand-green hover:bg-brand-green/10'
              : 'text-apple-gray-400 dark:text-apple-gray-500 hover:text-red-500 hover:bg-red-500/10'}`}
          >
            {isHidden ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            )}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-apple-gray-100 dark:border-apple-gray-700 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
            <div>
              <label className="block text-2xs font-medium text-apple-gray-400 mb-1">{t('mercado.estado')}</label>
              <select
                value={need.status}
                onChange={e => handleStatusChange(e.target.value as NeedStatus)}
                className={`input-apple text-sm w-full ${NEED_STATUS_ACCENT[need.status]}`}
              >
                {(Object.keys(NEED_STATUS_LABEL_KEY) as NeedStatus[]).map(s => (
                  <option key={s} value={s}>{t(NEED_STATUS_LABEL_KEY[s])}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end justify-between gap-2">
              <div className="min-w-0">
                <p className="text-2xs font-medium text-apple-gray-400 mb-1">{t('mercado.responsableBusqueda')}</p>
                <p className="text-sm text-apple-gray-700 dark:text-apple-gray-200 truncate">{need.assigned_to_name || t('mercado.sinAsignar')}</p>
              </div>
              <button onClick={() => setReassigning(r => !r)} className="text-xs font-medium text-brand-green hover:text-emerald-600 flex-shrink-0">
                {t('mercado.reasignar')}
              </button>
            </div>
            {reassigning && <div className="sm:col-span-2"><AssigneeSelect value={need.assigned_to_id} onChange={handleReassign} /></div>}
          </div>

          <div className="pt-2 border-t border-apple-gray-100 dark:border-apple-gray-700">
            <NeedCandidatesPanel
              need={need}
              readOnly={closed}
              candidates={candidates}
              negotiationsById={negotiationsById}
              overdueNegotiationIds={overdueNegotiationIds}
              members={members}
              onCandidatesChange={onCandidatesChange}
              onNegotiationUpserted={onNegotiationUpserted}
              onNegotiationRemoved={onNegotiationRemoved}
              onNegotiationMightHaveChanged={onNegotiationMightHaveChanged}
              onOpenNegotiation={onOpenNegotiation}
            />
          </div>

          <div className="pt-2 border-t border-apple-gray-100 dark:border-apple-gray-700">
            <MarketNotesPanel
              target={{ needId: need.id }}
              refreshSignal={notesRefreshSignal}
            />
          </div>
        </div>
      )}
    </div>
  )
}
