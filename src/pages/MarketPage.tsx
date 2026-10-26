import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchClubNeeds, fetchNegotiations, fetchTeamMembers, fetchAllCandidates, needGroupKey } from '@/services/marketService'
import { computeAlerts, type AlertableItem } from '@/utils/marketAlerts'
import { NEGOTIATION_STATUS_LABEL_KEY, NEGOTIATION_STATUS_ACCENT, NEED_STATUS_ACCENT } from '@/components/market/marketLabels'
import NegotiationRow from '@/components/market/NegotiationRow'
import NeedRow from '@/components/market/NeedRow'
import NewNegotiationForm from '@/components/market/NewNegotiationForm'
import NewNeedForm from '@/components/market/NewNeedForm'
import MarketWeekCalendar, { type CalendarEntry } from '@/components/market/MarketWeekCalendar'
import NegotiationBoard from '@/components/market/NegotiationBoard'
import CalendarDaySheet from '@/components/market/CalendarDaySheet'
import { fetchCalendarNotes, type CalendarNote } from '@/services/marketNotesService'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import { useLanguage } from '@/context/LanguageContext'
import type { ClubNeed, Negotiation, NegotiationStatus, NeedStatus, NeedCandidate, TeamMember } from '@/types/market'

type Tab = 'negociaciones' | 'objetivos'

export default function MarketPage() {
  const { t } = useLanguage()
  const [searchParams, setSearchParams] = useSearchParams()
  const highlight = searchParams.get('highlight')
  const [highlightKind, highlightIdStr] = highlight?.split('-') ?? []
  const highlightId = highlightIdStr ? Number(highlightIdStr) : null
  const [tab, setTab] = useState<Tab>(highlightKind === 'need' ? 'objetivos' : 'negociaciones')

  // `highlight` llega por query param (desde la campanita) y puede cambiar
  // sin que MarketPage se remonte — si ya estabas parado en /mercado, tocar
  // otra notificación solo actualiza la URL. Sin este efecto la pestaña se
  // quedaba en la que estaba montada la primera vez y el click no hacía nada.
  useEffect(() => {
    if (highlightKind === 'need') setTab('objetivos')
    else if (highlightKind === 'negotiation') setTab('negociaciones')
  }, [highlight])
  const [negotiations, setNegotiations] = useState<Negotiation[]>([])
  const [needs, setNeeds] = useState<ClubNeed[]>([])
  const [candidates, setCandidates] = useState<NeedCandidate[]>([])
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [clubFilter, setClubFilter] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState<number | 'all'>('all')
  const [agentFilter, setAgentFilter] = useState<string | 'all'>('all')
  const [ownershipFilter, setOwnershipFilter] = useState<'all' | 'propio' | 'intermediacion'>('all')
  const [negotiationStatusFilter, setNegotiationStatusFilter] = useState<NegotiationStatus | 'all'>('all')
  const [needStatusFilter, setNeedStatusFilter] = useState<NeedStatus | 'all'>('all')

  const [showNewNegotiation, setShowNewNegotiation] = useState(false)
  const [showNewNeed, setShowNewNeed] = useState(false)
  const [weekOffset, setWeekOffset] = useState(0)
  const [flashId, setFlashId] = useState<number | null>(null)
  const [negotiationView, setNegotiationView] = useState<'lista' | 'tablero'>('lista')
  // Las ocultadas a mano y las caídas no se ven por defecto; quedan guardadas.
  const [showArchived, setShowArchived] = useState(false)
  const [showArchivedNeeds, setShowArchivedNeeds] = useState(false)
  const [notes, setNotes] = useState<CalendarNote[]>([])
  const [openDay, setOpenDay] = useState<string | null>(null)

  // Desde la campanita llega ?nota=ID: abre el día de esa nota.
  const noteParam = searchParams.get('nota')
  useEffect(() => {
    if (!noteParam) return
    const note = notes.find(n => n.id === Number(noteParam))
    if (note) setOpenDay(note.note_date)
  }, [noteParam, notes])

  // El tablero no renderiza las filas de la lista, así que un click en una
  // tarjeta no puede scrollear a un elemento que no existe en el DOM — en vez
  // de eso, vuelve a la Lista y dispara el mismo mecanismo de `highlight` que
  // ya usa la campanita (reactivo, ver el efecto de `tab` más abajo).
  const handleBoardCardSelect = (id: number) => {
    setNegotiationView('lista')
    setSearchParams({ highlight: `negotiation-${id}` })
  }

  // El calendario muestra lo de las dos pestañas. Si la fila está en la
  // pestaña que se está mirando, solo scrollea y la resalta un momento; si
  // está en la otra, cambia de pestaña y la abre (mismo `highlight` que la
  // campanita).
  const handleCalendarSelect = (kind: 'negotiation' | 'need', id: number) => {
    const rowTab: Tab = kind === 'need' ? 'objetivos' : 'negociaciones'
    if (rowTab !== tab || (kind === 'negotiation' && negotiationView === 'tablero')) {
      setNegotiationView('lista')
      setSearchParams({ highlight: `${kind}-${id}` })
      return
    }
    document.getElementById(`market-${kind}-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setFlashId(id)
    setTimeout(() => setFlashId(f => f === id ? null : f), 1800)
  }

  const openNegotiation = (id: number) => {
    setNegotiationView('lista')
    setSearchParams({ highlight: `negotiation-${id}` })
  }

  const negotiationsById = useMemo(() => new Map(negotiations.map(n => [n.id, n])), [negotiations])
  const candidatesByNeed = useMemo(() => {
    const map = new Map<number, NeedCandidate[]>()
    for (const c of candidates) map.set(c.need_id, [...(map.get(c.need_id) ?? []), c])
    return map
  }, [candidates])
  const upsertNegotiation = (n: Negotiation) => setNegotiations(prev =>
    prev.some(x => x.id === n.id) ? prev.map(x => x.id === n.id ? n : x) : [n, ...prev])
  const removeNegotiation = (id: number) => setNegotiations(prev => prev.filter(x => x.id !== id))

  const loadData = () => {
    setLoading(true)
    Promise.all([fetchNegotiations(), fetchClubNeeds(), fetchTeamMembers(), fetchAllCandidates(), fetchCalendarNotes()])
      .then(([n, c, m, cands, ns]) => { setNegotiations(n); setNeeds(c); setMembers(m); setCandidates(cands); setNotes(ns) })
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [])

  // Crear una negociación con club destino + posición engancha (o crea) una
  // búsqueda del lado del club, y un cambio de estado en cualquiera de los
  // dos lados se sincroniza al otro server-side (ver marketService). Ninguno
  // de esos efectos toca el estado local del otro lado, así que sin este
  // refetch puntual la lista "hermana" queda vieja hasta recargar la página.
  const refreshNeeds = () => { fetchClubNeeds().then(setNeeds) }
  const refreshNegotiations = () => { fetchNegotiations().then(setNegotiations) }
  const refreshCandidates = () => { fetchAllCandidates().then(setCandidates) }

  const overdueIds = useMemo(() => {
    const items: AlertableItem[] = [
      ...negotiations.map(n => ({ id: n.id, kind: 'negotiation' as const, status: n.status, assigned_to_id: n.assigned_to_id, next_followup_date: n.next_followup_date })),
      ...needs.filter(n => !n.hidden_at).map(n => ({ id: n.id, kind: 'need' as const, status: n.status, assigned_to_id: n.assigned_to_id, next_followup_date: n.next_followup_date })),
    ]
    const alerts = computeAlerts(items, new Date())
    return {
      negotiations: new Set(alerts.filter(a => a.kind === 'negotiation' && a.urgency !== 'manana').map(a => a.id)),
      needs: new Set(alerts.filter(a => a.kind === 'need' && a.urgency !== 'manana').map(a => a.id)),
    }
  }, [negotiations, needs])

  const agentOptions = useMemo(() => (
    Array.from(new Set(negotiations.map(n => n.agent_name).filter((v): v is string => Boolean(v && v.trim())))).sort()
  ), [negotiations])

  // Los cerrados van siempre al final (para no ensuciar la lista con negociaciones
  // que ya no requieren acción) — éxito arriba de caído, y dentro de cada grupo
  // (activas / éxito / caído) se mantiene el orden por fecha de creación que ya
  // trae `fetchNegotiations`.
  const NEGOTIATION_SORT_RANK: Record<NegotiationStatus, number> = {
    ofrecido: 0, pausado: 0, en_negociacion: 0, avanzado: 0,
    cerrado_exito: 1,
    cerrado_caido: 2,
  }

  const isArchived = (n: Negotiation) => !!n.hidden_at || n.status === 'cerrado_caido'
  const archivedCount = negotiations.filter(isArchived).length
  const activeNegotiations = negotiations.filter(n => !isArchived(n))

  const visibleNegotiations = useMemo(() => negotiations.filter(n => {
    if (!showArchived && isArchived(n)) return false
    const playerText = clubFilter.trim().toLowerCase()
    if (playerText && !n.player_name.toLowerCase().includes(playerText)) return false
    if (assigneeFilter !== 'all' && n.assigned_to_id !== assigneeFilter) return false
    if (agentFilter !== 'all' && n.agent_name !== agentFilter) return false
    if (negotiationStatusFilter !== 'all' && n.status !== negotiationStatusFilter) return false
    if (ownershipFilter === 'propio' && n.belongs_to_agency !== true) return false
    if (ownershipFilter === 'intermediacion' && n.belongs_to_agency !== false) return false
    return true
  }).sort((a, b) => Number(isArchived(a)) - Number(isArchived(b)) || NEGOTIATION_SORT_RANK[a.status] - NEGOTIATION_SORT_RANK[b.status]),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [negotiations, clubFilter, assigneeFilter, agentFilter, negotiationStatusFilter, ownershipFilter, showArchived])

  // Una búsqueda en pantalla = un club con todas sus posiciones (cada posición
  // es una fila de market_club_needs). Las más nuevas primero.
  const needGroups = useMemo(() => {
    const map = new Map<string, ClubNeed[]>()
    for (const n of needs) {
      const key = needGroupKey(n)
      map.set(key, [...(map.get(key) ?? []), n])
    }
    return [...map.values()].sort((a, b) => Math.max(...b.map(n => n.id)) - Math.max(...a.map(n => n.id)))
  }, [needs])
  const groupStatus = (g: ClubNeed[]): NeedStatus => (g.some(n => n.status === 'abierto') ? 'abierto' : 'cerrado')
  const groupPrimary = (g: ClubNeed[]) => g.reduce((a, b) => (a.id < b.id ? a : b))

  const visibleGroups = useMemo(() => needGroups.filter(g => {
    if (clubFilter.trim() && !g[0].team_name.toLowerCase().includes(clubFilter.trim().toLowerCase())) return false
    if (assigneeFilter !== 'all' && !g.some(n => n.assigned_to_id === assigneeFilter)) return false
    if (needStatusFilter !== 'all' && groupStatus(g) !== needStatusFilter) return false
    return true
  }), [needGroups, clubFilter, assigneeFilter, needStatusFilter])

  // Las búsquedas cerradas van aparte, al final: ya no piden acción. Las
  // archivadas (sacadas a mano con la ×) no se ven salvo que se pidan.
  const activeGroups = needGroups.filter(g => !g[0].hidden_at)
  const archivedNeedsCount = needGroups.length - activeGroups.length
  const openGroups = visibleGroups.filter(g => !g[0].hidden_at && groupStatus(g) === 'abierto')
  const closedGroups = visibleGroups.filter(g => !g[0].hidden_at && groupStatus(g) === 'cerrado')
  const hiddenGroups = showArchivedNeeds ? visibleGroups.filter(g => g[0].hidden_at) : []
  const shownNeedsCount = openGroups.length + closedGroups.length + hiddenGroups.length

  // Un solo calendario para las dos pestañas: "a quién tengo que llamar" no
  // depende de en qué pestaña se cargó. Respeta el filtro de responsable (el
  // de texto y el de estado son propios de cada lista). Sin cerrados.
  const calendarEntries = useMemo((): CalendarEntry[] => [
    ...negotiations
      .filter(n => n.next_followup_date && !n.hidden_at && n.status !== 'cerrado_exito' && n.status !== 'cerrado_caido')
      .filter(n => assigneeFilter === 'all' || n.assigned_to_id === assigneeFilter)
      .map(n => ({
        kind: 'negotiation' as const,
        id: n.id,
        date: n.next_followup_date as string,
        title: n.player_name,
        subtitle: n.team_name ? `→ ${n.team_name}` : (n.current_team_name ?? ''),
        assignee: n.assigned_to_name,
      })),
    // Una entrada por búsqueda (no por posición).
    ...needGroups
      .filter(g => !g[0].hidden_at && groupStatus(g) === 'abierto')
      .filter(g => assigneeFilter === 'all' || g.some(n => n.assigned_to_id === assigneeFilter))
      .flatMap(g => {
        const primary = groupPrimary(g)
        const date = primary.next_followup_date ?? g.find(n => n.next_followup_date)?.next_followup_date
        if (!date) return []
        return [{
          kind: 'need' as const,
          id: primary.id,
          date,
          title: primary.team_name,
          subtitle: g.map(n => n.position_label).join(', '),
          assignee: primary.assigned_to_name,
        }]
      }),
  ], [negotiations, needGroups, assigneeFilter])

  // Las notas respetan el filtro de responsable (las sin asignar, de quien las escribió)
  const visibleNotes = useMemo(() => notes.filter(n =>
    assigneeFilter === 'all' || n.assigned_to_id === assigneeFilter
  ), [notes, assigneeFilter])

  const renderNeed = (g: ClubNeed[]) => (
    <NeedRow
      key={needGroupKey(g[0])}
      needs={g}
      overdue={g.some(n => overdueIds.needs.has(n.id))}
      defaultExpanded={highlightKind === 'need' && g.some(n => n.id === highlightId)}
      flash={g.some(n => n.id === flashId)}
      onNeedsUpdated={updated => setNeeds(prev => prev.map(x => updated.find(u => u.id === x.id) ?? x))}
      onNeedCreated={n => setNeeds(prev => [n, ...prev])}
      onNegotiationMightHaveChanged={refreshNegotiations}
      candidatesByNeed={candidatesByNeed}
      negotiationsById={negotiationsById}
      overdueNegotiationIds={overdueIds.negotiations}
      members={members}
      onCandidatesChange={(needId, update) => setCandidates(prev => [
        ...update(prev.filter(c => c.need_id === needId)),
        ...prev.filter(c => c.need_id !== needId),
      ])}
      onNegotiationUpserted={upsertNegotiation}
      onNegotiationRemoved={removeNegotiation}
      onOpenNegotiation={openNegotiation}
    />
  )

  return (
    <div className={`mx-auto px-4 sm:px-6 py-6 transition-[max-width] ${tab === 'negociaciones' && negotiationView === 'tablero' ? 'max-w-[1600px]' : 'max-w-screen-xl'}`}>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-apple-gray-800 dark:text-white tracking-tight">{t('mercado.titulo')}</h1>
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">{t('mercado.subtitulo')}</p>
        </div>
        <button
          onClick={() => (tab === 'negociaciones' ? setShowNewNegotiation(true) : setShowNewNeed(true))}
          className="flex items-center gap-2 px-3.5 py-2 bg-brand-green text-white rounded-xl font-semibold text-sm hover:bg-emerald-600 active:scale-95 transition-all shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          {tab === 'negociaciones' ? t('mercado.nuevaNegociacion') : t('mercado.nuevoObjetivo')}
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-1.5 bg-apple-gray-100 dark:bg-apple-gray-800 rounded-xl p-1">
          <button
            onClick={() => setTab('negociaciones')}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === 'negociaciones' ? 'bg-white dark:bg-apple-gray-700 text-apple-gray-800 dark:text-white shadow-sm' : 'text-apple-gray-500 dark:text-apple-gray-400'}`}
          >
            {t('mercado.tabNegociaciones')} ({activeNegotiations.length})
          </button>
          <button
            onClick={() => { setTab('objetivos'); setAssigneeFilter('all') }}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === 'objetivos' ? 'bg-white dark:bg-apple-gray-700 text-apple-gray-800 dark:text-white shadow-sm' : 'text-apple-gray-500 dark:text-apple-gray-400'}`}
          >
            {t('mercado.tabObjetivos')} ({activeGroups.length})
          </button>
        </div>

        {tab === 'negociaciones' && (
          <div className="flex items-center gap-1.5 bg-apple-gray-100 dark:bg-apple-gray-800 rounded-xl p-1">
            <button
              onClick={() => setNegotiationView('lista')}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${negotiationView === 'lista' ? 'bg-white dark:bg-apple-gray-700 text-apple-gray-800 dark:text-white shadow-sm' : 'text-apple-gray-500 dark:text-apple-gray-400'}`}
            >
              {t('mercado.vistaLista')}
            </button>
            <button
              onClick={() => setNegotiationView('tablero')}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${negotiationView === 'tablero' ? 'bg-white dark:bg-apple-gray-700 text-apple-gray-800 dark:text-white shadow-sm' : 'text-apple-gray-500 dark:text-apple-gray-400'}`}
            >
              {t('mercado.vistaTablero')}
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <input
          type="text"
          value={clubFilter}
          onChange={e => setClubFilter(e.target.value)}
          placeholder={tab === 'negociaciones' ? t('mercado.filtrarJugador') : t('mercado.filtrarClub')}
          className="input-apple text-sm w-full sm:w-48"
        />
        {/* Las búsquedas de clubes no tienen responsable: el filtro es solo de Negociaciones. */}
        {tab === 'negociaciones' && <select
          value={assigneeFilter}
          onChange={e => setAssigneeFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          className="input-apple text-sm w-auto min-w-0"
        >
          <option value="all">{t('mercado.todosResponsables')}</option>
          {members.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>}
        {tab === 'negociaciones' && agentOptions.length > 0 && (
          <select
            value={agentFilter}
            onChange={e => setAgentFilter(e.target.value)}
            className="input-apple text-sm w-auto min-w-0"
          >
            <option value="all">{t('mercado.todosRepresentantes')}</option>
            {agentOptions.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        )}
        {tab === 'negociaciones' && (
          <select
            value={ownershipFilter}
            onChange={e => setOwnershipFilter(e.target.value as 'all' | 'propio' | 'intermediacion')}
            className="input-apple text-sm w-auto min-w-0"
          >
            <option value="all">{t('mercado.todosOrigenes')}</option>
            <option value="propio">{t('mercado.origenPropio')}</option>
            <option value="intermediacion">{t('mercado.origenIntermediacion')}</option>
          </select>
        )}
        {tab === 'negociaciones' ? (
          <select
            value={negotiationStatusFilter}
            onChange={e => setNegotiationStatusFilter(e.target.value as NegotiationStatus | 'all')}
            className={`input-apple text-sm w-auto min-w-0 ${negotiationStatusFilter !== 'all' ? NEGOTIATION_STATUS_ACCENT[negotiationStatusFilter] : ''}`}
          >
            <option value="all">{t('mercado.todosEstados')}</option>
            {(Object.keys(NEGOTIATION_STATUS_LABEL_KEY) as NegotiationStatus[]).map(s => (
              <option key={s} value={s}>{t(NEGOTIATION_STATUS_LABEL_KEY[s])}</option>
            ))}
          </select>
        ) : (
          <select
            value={needStatusFilter}
            onChange={e => setNeedStatusFilter(e.target.value as NeedStatus | 'all')}
            className={`input-apple text-sm w-auto min-w-0 ${needStatusFilter !== 'all' ? NEED_STATUS_ACCENT[needStatusFilter] : ''}`}
          >
            <option value="all">{t('mercado.todosEstados')}</option>
            <option value="abierto">{t('mercado.estadoAbierto')}</option>
            <option value="cerrado">{t('mercado.estadoCerrado')}</option>
          </select>
        )}
      </div>

      {loading ? (
        <LoadingSpinner message={t('mercado.cargando')} />
      ) : tab === 'negociaciones' ? (
        visibleNegotiations.length === 0 ? (
          <div>
            <EmptyState
              title={t('mercado.sinNegociacionesTitulo')}
              description={negotiations.length === 0 ? t('mercado.sinNegociacionesVacio') : t('mercado.sinNegociacionesFiltro')}
            />
            {archivedCount > 0 && (
              <div className="flex justify-center">
                <button type="button" onClick={() => setShowArchived(v => !v)} className="text-xs text-apple-gray-400 hover:text-apple-gray-700 dark:hover:text-apple-gray-200 transition-colors">
                  {showArchived ? t('mercado.ocultarArchivadas') : t('mercado.verArchivadas').replace('{n}', String(archivedCount))}
                </button>
              </div>
            )}
          </div>
        ) : negotiationView === 'tablero' ? (
          <div className="space-y-2">
            <NegotiationBoard
              negotiations={visibleNegotiations}
              overdueIds={overdueIds.negotiations}
              onUpdated={updated => setNegotiations(prev => prev.map(x => x.id === updated.id ? updated : x))}
              onNeedMightHaveChanged={() => { refreshNeeds(); refreshCandidates() }}
              onSelect={handleBoardCardSelect}
            />
            <MarketWeekCalendar
              entries={calendarEntries}
              weekOffset={weekOffset}
              onWeekOffsetChange={setWeekOffset}
              onSelect={handleCalendarSelect}
              notes={visibleNotes}
              onOpenDay={setOpenDay}
            />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="hidden sm:grid grid-cols-[auto_minmax(0,2fr)_7rem_7rem_5.5rem_2rem] items-center gap-3 px-4 text-2xs font-semibold uppercase tracking-wide text-apple-gray-400">
              <span />
              <span>{t('mercado.jugador')}</span>
              <span>{t('mercado.estado')}</span>
              <span>{t('mercado.responsable')}</span>
              <span className="text-right">{t('mercado.columnaSeguimiento')}</span>
              <span />
            </div>
            {visibleNegotiations.map(n => (
              <NegotiationRow
                key={n.id}
                negotiation={n}
                overdue={overdueIds.negotiations.has(n.id)}
                defaultExpanded={highlightKind === 'negotiation' && n.id === highlightId}
                flash={flashId === n.id}
                onUpdated={updated => setNegotiations(prev => prev.map(x => x.id === updated.id ? updated : x))}
                onNeedMightHaveChanged={() => { refreshNeeds(); refreshCandidates() }}
              />
            ))}
            {archivedCount > 0 && (
              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={() => setShowArchived(v => !v)}
                  className="inline-flex items-center gap-1.5 text-xs text-apple-gray-400 hover:text-apple-gray-700 dark:hover:text-apple-gray-200 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                  {showArchived ? t('mercado.ocultarArchivadas') : t('mercado.verArchivadas').replace('{n}', String(archivedCount))}
                </button>
              </div>
            )}
            <MarketWeekCalendar
              entries={calendarEntries}
              weekOffset={weekOffset}
              onWeekOffsetChange={setWeekOffset}
              onSelect={handleCalendarSelect}
              notes={visibleNotes}
              onOpenDay={setOpenDay}
            />
          </div>
        )
      ) : shownNeedsCount === 0 ? (
        <div>
          <EmptyState
            title={t('mercado.sinObjetivosTitulo')}
            description={activeGroups.length === 0 ? t('mercado.sinObjetivosVacio') : t('mercado.sinObjetivosFiltro')}
          />
          {archivedNeedsCount > 0 && (
            <div className="flex justify-center">
              <button type="button" onClick={() => setShowArchivedNeeds(true)} className="text-xs text-apple-gray-500 hover:text-apple-gray-800 dark:text-apple-gray-400 dark:hover:text-apple-gray-200 transition-colors">
                {t('mercado.verBusquedasArchivadas').replace('{n}', String(archivedNeedsCount))}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="hidden sm:grid grid-cols-[auto_minmax(0,2fr)_7rem_5.5rem_2rem] items-center gap-3 px-4 text-2xs font-semibold uppercase tracking-wide text-apple-gray-400">
            <span />
            <span>{t('mercado.club')}</span>
            <span>{t('mercado.estado')}</span>
            <span className="text-right">{t('mercado.columnaSeguimiento')}</span>
            <span />
          </div>
          {openGroups.map(renderNeed)}
          {closedGroups.length > 0 && (
            <>
              <p className="pt-4 pb-1 px-1 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-apple-gray-400">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                {t('mercado.busquedasCerradas')} ({closedGroups.length})
              </p>
              {closedGroups.map(renderNeed)}
            </>
          )}
          {hiddenGroups.length > 0 && (
            <>
              <p className="pt-4 pb-1 px-1 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-apple-gray-500 dark:text-apple-gray-400">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                {t('mercado.busquedasArchivadas')} ({hiddenGroups.length})
              </p>
              {hiddenGroups.map(renderNeed)}
            </>
          )}
          {archivedNeedsCount > 0 && (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={() => setShowArchivedNeeds(v => !v)}
                className="inline-flex items-center gap-1.5 text-xs text-apple-gray-500 hover:text-apple-gray-800 dark:text-apple-gray-400 dark:hover:text-apple-gray-200 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                {showArchivedNeeds ? t('mercado.ocultarBusquedasArchivadas') : t('mercado.verBusquedasArchivadas').replace('{n}', String(archivedNeedsCount))}
              </button>
            </div>
          )}
          <MarketWeekCalendar
            entries={calendarEntries}
            weekOffset={weekOffset}
            onWeekOffsetChange={setWeekOffset}
            onSelect={handleCalendarSelect}
            notes={visibleNotes}
            onOpenDay={setOpenDay}
          />
        </div>
      )}

      <NewNegotiationForm
        open={showNewNegotiation}
        onClose={() => setShowNewNegotiation(false)}
        onCreated={n => { setNegotiations(prev => [n, ...prev]); if (n.need_id) { refreshNeeds(); refreshCandidates() } }}
      />
      <CalendarDaySheet
        date={openDay}
        notes={notes}
        members={members}
        onClose={() => {
          setOpenDay(null)
          if (noteParam) setSearchParams({})
        }}
        onChange={setNotes}
        negotiations={negotiations}
        onNegotiationUpdated={upsertNegotiation}
      />
      <NewNeedForm
        open={showNewNeed}
        onClose={() => setShowNewNeed(false)}
        onCreated={n => setNeeds(prev => [n, ...prev])}
        existingNeeds={needs}
      />
    </div>
  )
}
