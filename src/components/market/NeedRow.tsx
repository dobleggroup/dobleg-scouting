import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { TeamLogo } from '@/components/ui/PlayerPhoto'
import MarketNotesPanel from './MarketNotesPanel'
import NeedCandidatesPanel from './NeedCandidatesPanel'
import PitchPositionPicker from './PitchPositionPicker'
import StatusPill from './StatusPill'
import { NEED_STATUS_LABEL_KEY, NEED_STATUS_COLOR, NEED_STATUS_ORDER } from './marketLabels'
import {
  updateNeedsStatus,
    setNeedHidden,
  updateNeedDetails,
  createClubNeed,
  pitchOrder,
  mergePitchSelection,
  pitchSpotsTaken,
  linkNeedsTeam,
  isMarketLinkAdmin,
} from '@/services/marketService'
import TeamSearchSelect from './TeamSearchSelect'
import { countryEs, leagueNameEs } from '@/utils/leagueLabels'
import type { ClubNeed, NeedStatus, NeedCandidate, Negotiation, TeamMember } from '@/types/market'

/** Detalle de una posición: se escribe y se guarda solo al salir del campo. */
// Las características de un puesto se guardan juntas en `details`, separadas por " · ".
const DETAIL_SEPARATOR = ' · '
const splitDetails = (details: string | null | undefined) =>
  (details ?? '').split(/\s*[·,\n]\s*/).map(d => d.trim()).filter(Boolean)

/**
 * Características del puesto ("segunda punta", "zurdo"...): se escribe una,
 * se toca Agregar (o Enter) y queda como etiqueta guardada; el campo se vacía
 * para escribir la siguiente. Cada etiqueta se borra con su ×.
 */
function PositionDetails({ need, readOnly, onSaved }: { need: ClubNeed; readOnly: boolean; onSaved: (details: string | null) => void }) {
  const { t } = useLanguage()
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const items = splitDetails(need.details)

  const persist = async (next: string[]) => {
    setSaving(true)
    setError(false)
    const value = next.length ? next.join(DETAIL_SEPARATOR) : null
    const ok = await updateNeedDetails(need.id, value)
    setSaving(false)
    if (ok) onSaved(value)
    else setError(true)
    return ok
  }

  const add = async () => {
    const text = draft.trim()
    if (!text || saving) return
    const fresh = splitDetails(text).filter(x => !items.some(i => i.toLowerCase() === x.toLowerCase()))
    if (fresh.length === 0) { setDraft(''); return }
    if (await persist([...items, ...fresh])) setDraft('')
  }

  const remove = (item: string) => persist(items.filter(i => i !== item))

  if (readOnly && items.length === 0) return null

  // Lo que pide el club va en gris neutro y sin caja; lo verde queda para
  // "Jugadores ofrecidos", que es lo que hacemos nosotros.
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 bg-apple-gray-100 text-apple-gray-500 dark:bg-apple-gray-700 dark:text-apple-gray-300">
          {/* planilla con tildes */}
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
        </span>
        <p className="text-sm font-semibold text-apple-gray-800 dark:text-white">{t('mercado.comoLoBuscan')}</p>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pl-8">
          {items.map(item => (
            <span key={item} className={`inline-flex items-center gap-1 ${readOnly ? 'px-2.5' : 'pl-2.5 pr-1'} py-1 rounded-md text-sm font-medium bg-apple-gray-100 text-apple-gray-700 border border-apple-gray-200 dark:bg-apple-gray-700/60 dark:text-apple-gray-100 dark:border-apple-gray-600`}>
              {item}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => remove(item)}
                  disabled={saving}
                  title={t('mercado.quitar')}
                  aria-label={`${t('mercado.quitar')} ${item}`}
                  className="w-5 h-5 rounded flex items-center justify-center text-apple-gray-400 hover:text-red-600 hover:bg-red-500/10 dark:text-apple-gray-400"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {!readOnly && <div className="flex gap-2 pl-8">
        <input
          type="text"
          value={draft}
          onChange={e => { setDraft(e.target.value); setError(false) }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          onBlur={add}
          placeholder={items.length ? t('mercado.otraCaracteristica') : t('mercado.detallePosicionPlaceholder')}
          className="input-apple text-sm flex-1 min-w-0"
        />
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={add}
          disabled={!draft.trim() || saving}
          className="px-4 rounded-apple text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-200 border border-apple-gray-300 dark:border-apple-gray-600 hover:border-apple-gray-400 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
        >
          {saving ? t('mercado.guardando') : `+ ${t('mercado.agregar')}`}
        </button>
      </div>}
      {error && <p className="text-xs text-red-600 dark:text-red-400 pl-8">{t('mercado.errorGuardar')}</p>}
    </div>
  )
}

/**
 * Una búsqueda de club = un renglón por club, con todas las posiciones que
 * busca. Por dentro cada posición es una fila de `market_club_needs` (con sus
 * propios ofrecidos y su detalle); estado, archivar y la fecha
 * de "volver a hablar" son de la búsqueda entera (la fecha vive en la
 * posición principal, la más vieja, para que el calendario la muestre una vez).
 */
export default function NeedRow({
  needs,
  league = null,
  onNeedsUpdated,
  onNeedCreated,
  defaultExpanded = false,
  flash = false,
  onNegotiationMightHaveChanged,
  candidatesByNeed,
  negotiationsById,
  overdueNegotiationIds,
  members,
  onCandidatesChange,
  onNegotiationUpserted,
  onNegotiationRemoved,
  onOpenNegotiation,
}: {
  needs: ClubNeed[]
  /** Liga del club (null si se escribió a mano o el club no tiene liga cargada). */
  league?: { name: string; country: string } | null
  onNeedsUpdated: (updated: ClubNeed[]) => void
  onNeedCreated: (need: ClubNeed) => void
  candidatesByNeed: Map<number, NeedCandidate[]>
  negotiationsById: Map<number, Negotiation>
  overdueNegotiationIds: Set<number>
  members: TeamMember[]
  onCandidatesChange: (needId: number, update: (prev: NeedCandidate[]) => NeedCandidate[]) => void
  onNegotiationUpserted: (n: Negotiation) => void
  onNegotiationRemoved: (id: number) => void
  onOpenNegotiation: (id: number) => void
  defaultExpanded?: boolean
  /** Resalte momentáneo al llegar desde el calendario semanal. */
  flash?: boolean
  onNegotiationMightHaveChanged?: () => void
}) {
  const { user, userDisplayName } = useAuth()
  const { t } = useLanguage()
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [addingPositions, setAddingPositions] = useState(false)
  const [newPositions, setNewPositions] = useState<string[]>([])
  const [savingPositions, setSavingPositions] = useState(false)
  const [error, setError] = useState('')
  const [linkingTeam, setLinkingTeam] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)

  // Reacciona a `defaultExpanded` (no solo al montaje): tocar otra
  // notificación de la campanita estando ya en /mercado cambia el valor sin
  // remontar el componente.
  useEffect(() => {
    if (defaultExpanded) {
      setExpanded(true)
      rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [defaultExpanded])

  const ids = needs.map(n => n.id)
  const primary = needs.reduce((a, b) => (a.id < b.id ? a : b))
  const positions = [...needs].sort((a, b) => pitchOrder(a.position_label) - pitchOrder(b.position_label) || a.id - b.id)
  const status: NeedStatus = needs.some(n => n.status === 'abierto') ? 'abierto' : 'cerrado'
  const closed = status === 'cerrado'
  const isHidden = needs.every(n => !!n.hidden_at)
  const logo = needs.find(n => n.team_logo)?.team_logo ?? null
  const offeredCount = needs.reduce((sum, n) => sum + (candidatesByNeed.get(n.id) ?? []).filter(c => c.status !== 'descartado').length, 0)

  const needStatusLabels = Object.fromEntries(
    NEED_STATUS_ORDER.map(s => [s, t(NEED_STATUS_LABEL_KEY[s])]),
  ) as Record<NeedStatus, string>

  const updateAll = (patch: Partial<ClubNeed>) => onNeedsUpdated(needs.map(n => ({ ...n, ...patch })))

  const handleStatusChange = async (next: NeedStatus) => {
    setError('')
    if (await updateNeedsStatus(ids, next)) updateAll({ status: next })
    else setError(t('mercado.errorGuardar'))
  }

  const handleToggleHidden = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isHidden && !confirm(t('mercado.confirmarOcultarBusqueda').replace('{club}', primary.team_name))) return
    const name = userDisplayName || 'Usuario'
    if (await setNeedHidden(ids, !isHidden, name)) {
      updateAll({ hidden_at: isHidden ? null : new Date().toISOString(), hidden_by_name: isHidden ? null : name })
    }
  }

  // Solo Marcos y Matías vinculan el club escrito a mano con uno de la base (por el escudo).
  const canLink = isMarketLinkAdmin(user?.email)
  const handleLinkTeam = async (team: { id: number; name: string; logo: string | null }) => {
    setError('')
    if (await linkNeedsTeam(ids, team)) {
      updateAll({ team_id: team.id, team_name: team.name, team_logo: team.logo })
      setLinkingTeam(false)
    } else {
      setError(t('mercado.errorGuardar'))
    }
  }

  const handleRemovePosition = async (need: ClubNeed) => {
    if (!confirm(t('mercado.confirmarQuitarPosicion').replace('{posicion}', need.position_label))) return
    const name = userDisplayName || 'Usuario'
    if (await setNeedHidden([need.id], true, name)) {
      onNeedsUpdated([{ ...need, hidden_at: new Date().toISOString(), hidden_by_name: name }])
    } else {
      setError(t('mercado.errorGuardar'))
    }
  }

  const handleAddPositions = async () => {
    if (newPositions.length === 0) return
    setSavingPositions(true)
    setError('')
    const ordered = mergePitchSelection(newPositions)
    for (const position of ordered) {
      const created = await createClubNeed(
        {
          team_id: primary.team_id,
          team_name: primary.team_name,
          team_logo: primary.team_logo,
          position_label: position,
          assigned_to_id: primary.assigned_to_id,
          assigned_to_name: primary.assigned_to_name,
          next_followup_date: null,
        },
        user?.id ?? null,
        userDisplayName || 'Usuario',
      )
      if (!created) { setError(t('mercado.errorGuardar')); break }
      onNeedCreated(created)
    }
    setSavingPositions(false)
    setNewPositions([])
    setAddingPositions(false)
  }

  return (
    <div
      ref={rowRef}
      id={`market-need-${primary.id}`}
      className={`rounded-xl border overflow-hidden transition-all ${
        closed ? 'bg-apple-gray-50 dark:bg-apple-gray-800/40' : 'bg-white dark:bg-apple-gray-800'
      } ${defaultExpanded || flash ? 'border-brand-green ring-1 ring-brand-green/30' : closed ? 'border-dashed border-apple-gray-300 dark:border-apple-gray-700' : 'border-apple-gray-200 dark:border-apple-gray-700'} ${isHidden ? 'opacity-60' : ''}`}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(e => !e)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(x => !x) } }}
        className="w-full flex flex-col gap-2 sm:grid sm:grid-cols-[auto_minmax(0,2fr)_minmax(0,1fr)_8rem_7rem_2rem] sm:items-center sm:gap-3 px-4 py-3 sm:py-3.5 text-left hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/40 transition-colors font-sans cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0 sm:contents">
          <div className={`flex items-center gap-2 flex-shrink-0 ${closed ? 'opacity-50 grayscale' : ''}`}>
            {logo
              ? <TeamLogo src={logo} className="w-9 h-9 drop-shadow-md flex-shrink-0" />
              : (
                <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 ring-1 ring-emerald-200 dark:ring-emerald-800/70">
                  {primary.team_name.trim().charAt(0).toUpperCase()}
                </span>
              )}
          </div>

          <div className="min-w-0 flex-1 sm:flex-none">
            <p className={`font-semibold text-base truncate flex items-center gap-1.5 ${closed ? 'text-apple-gray-500 dark:text-apple-gray-400' : 'text-apple-gray-900 dark:text-white'}`}>
              {closed && (
                <svg className="w-3.5 h-3.5 flex-shrink-0 text-apple-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-label={t('mercado.busquedaCerrada')}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              )}
              <span className="truncate">{primary.team_name}</span>
            </p>
            {league && (
              <p className="sm:hidden text-xs text-apple-gray-500 dark:text-apple-gray-400 truncate">
                {leagueNameEs(league.name)} · {countryEs(league.country)}
              </p>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {positions.map(n => {
                const offered = (candidatesByNeed.get(n.id) ?? []).filter(c => c.status !== 'descartado').length
                return (
                  <span
                    key={n.id}
                    title={n.details ?? undefined}
                    className={`inline-flex items-center gap-1.5 pl-2 pr-2.5 py-0.5 rounded-full text-xs font-medium border ${closed
                      ? 'bg-apple-gray-100 dark:bg-apple-gray-700/60 border-apple-gray-200 dark:border-apple-gray-600 text-apple-gray-600 dark:text-apple-gray-300'
                      : 'bg-emerald-50 dark:bg-emerald-900/25 border-emerald-200 dark:border-emerald-800/70 text-emerald-800 dark:text-emerald-300'}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${closed ? 'bg-apple-gray-400' : 'bg-emerald-500'}`} />
                    {n.position_label}
                    {offered > 0 && <span className="min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-brand-green text-white text-[10px] font-bold flex items-center justify-center tabular-nums">{offered}</span>}
                  </span>
                )
              })}
            </div>
          </div>
        </div>

        <div className="hidden sm:block min-w-0">
          {league ? (
            <>
              <p className={`text-sm font-medium truncate ${closed ? 'text-apple-gray-500 dark:text-apple-gray-400' : 'text-apple-gray-800 dark:text-apple-gray-100'}`}>{leagueNameEs(league.name)}</p>
              <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 truncate">{countryEs(league.country)}</p>
            </>
          ) : (
            <span className="text-sm text-apple-gray-400 dark:text-apple-gray-500">—</span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap pl-[3.25rem] sm:pl-0 sm:contents">
          <p className="hidden sm:block text-center">
            <span className={`text-lg font-bold tabular-nums ${offeredCount > 0 ? 'text-brand-green' : 'text-apple-gray-400 dark:text-apple-gray-500'}`}>{offeredCount}</span>
          </p>
          <span className={`sm:hidden text-xs font-semibold tabular-nums ${offeredCount > 0 ? 'text-brand-green' : 'text-apple-gray-500 dark:text-apple-gray-400'}`}>
            {t('mercado.ofrecidosResumen').replace('{n}', String(offeredCount))}
          </span>
          <StatusPill
            value={status}
            options={NEED_STATUS_ORDER}
            labels={needStatusLabels}
            colors={NEED_STATUS_COLOR}
            onChange={handleStatusChange}
            title={t('mercado.cambiarEstado')}
          />
          <button
            type="button"
            onClick={handleToggleHidden}
            title={isHidden ? t('mercado.volverAMostrar') : t('mercado.ocultarBusqueda')}
            aria-label={isHidden ? t('mercado.volverAMostrar') : t('mercado.ocultarBusqueda')}
            className={`ml-auto sm:ml-0 w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${isHidden
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
        <div className="px-4 pb-4 pt-4 border-t border-apple-gray-100 dark:border-apple-gray-700 space-y-4">
          {error && <p className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>}

          {canLink && (
            <div className="rounded-xl bg-apple-gray-50 dark:bg-apple-gray-900/40 border border-apple-gray-200 dark:border-apple-gray-700 px-3 py-2.5">
              {linkingTeam ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <TeamSearchSelect value={null} onChange={handleLinkTeam} />
                  </div>
                  <button type="button" onClick={() => setLinkingTeam(false)} className="text-sm text-apple-gray-500 hover:text-apple-gray-700 dark:text-apple-gray-400 dark:hover:text-apple-gray-200">
                    {t('mercado.cancelar')}
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  {primary.team_id ? (
                    <span className="inline-flex items-center gap-2 min-w-0 text-sm text-apple-gray-700 dark:text-apple-gray-200">
                      <TeamLogo src={logo} className="w-5 h-5 drop-shadow-md flex-shrink-0" />
                      <span className="truncate">{t('mercado.clubVinculado')}: <span className="font-semibold">{primary.team_name}</span></span>
                    </span>
                  ) : (
                    <span className="text-sm text-apple-gray-600 dark:text-apple-gray-300">{t('mercado.clubSinVincular')}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setLinkingTeam(true)}
                    className={primary.team_id
                      ? 'text-sm font-medium text-brand-green hover:text-emerald-600 flex-shrink-0'
                      : 'px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-brand-green hover:bg-emerald-600 flex-shrink-0'}
                  >
                    {primary.team_id ? t('mercado.cambiarClub') : t('mercado.vincularClub')}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-apple-gray-800 dark:text-white">{t('mercado.posicionesQueBusca')}</p>
              {!closed && (
                <button
                  type="button"
                  onClick={() => { setAddingPositions(a => !a); setNewPositions([]) }}
                  className="inline-flex items-center gap-1 text-sm font-medium text-brand-green hover:text-emerald-600"
                >
                  {addingPositions ? t('mercado.cancelar') : `+ ${t('mercado.agregarPosicion')}`}
                </button>
              )}
            </div>

            {addingPositions && (
              <div className="rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 p-3 space-y-3">
                <PitchPositionPicker value={newPositions} onChange={setNewPositions} disabled={pitchSpotsTaken(needs.map(n => n.position_label))} />
                <button
                  type="button"
                  onClick={handleAddPositions}
                  disabled={newPositions.length === 0 || savingPositions}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-green hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {savingPositions
                    ? t('mercado.guardando')
                    : mergePitchSelection(newPositions).length > 1
                      ? t('mercado.agregarPosiciones').replace('{n}', String(mergePitchSelection(newPositions).length))
                      : t('mercado.agregarPosicion')}
                </button>
              </div>
            )}

            {positions.map(need => (
              <div key={need.id} className={`rounded-xl border border-l-4 bg-white dark:bg-apple-gray-900/40 p-3.5 space-y-3 ${closed
                ? 'border-apple-gray-200 dark:border-apple-gray-700 border-l-apple-gray-300 dark:border-l-apple-gray-600'
                : 'border-apple-gray-200 dark:border-apple-gray-700 border-l-emerald-500 dark:border-l-emerald-500'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${closed
                      ? 'bg-apple-gray-100 text-apple-gray-500 dark:bg-apple-gray-700 dark:text-apple-gray-300'
                      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'}`}>
                      {/* camiseta */}
                      <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round"><path d="M8 3l-5 3 2 4 2-1v12h10V9l2 1 2-4-5-3c-.5 1.5-2 2.5-4 2.5S8.5 4.5 8 3z" /></svg>
                    </span>
                    <p className="text-base font-bold text-apple-gray-900 dark:text-white leading-tight truncate">{need.position_label}</p>
                  </div>
                  {!closed && positions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemovePosition(need)}
                      className="text-xs text-apple-gray-500 hover:text-red-600 dark:text-apple-gray-400 dark:hover:text-red-400"
                    >
                      {t('mercado.quitarPosicion')}
                    </button>
                  )}
                </div>
                <PositionDetails
                  need={need}
                  readOnly={closed}
                  onSaved={details => onNeedsUpdated([{ ...need, details }])}
                />
                <NeedCandidatesPanel
                  need={need}
                  compact
                  readOnly={closed}
                  candidates={candidatesByNeed.get(need.id) ?? []}
                  negotiationsById={negotiationsById}
                  overdueNegotiationIds={overdueNegotiationIds}
                  members={members}
                  onCandidatesChange={update => onCandidatesChange(need.id, update)}
                  onNegotiationUpserted={onNegotiationUpserted}
                  onNegotiationRemoved={onNegotiationRemoved}
                  onNegotiationMightHaveChanged={onNegotiationMightHaveChanged}
                  onOpenNegotiation={onOpenNegotiation}
                />
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-apple-gray-100 dark:border-apple-gray-700">
            <MarketNotesPanel target={{ needId: primary.id, needIds: ids }} />
          </div>
        </div>
      )}
    </div>
  )
}
