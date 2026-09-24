import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import AuthModal from '@/components/auth/AuthModal'
import { usePlayersList, useLeagues } from '@/hooks/usePlayerStats'
import {
  fetchFormations,
  saveFormation,
  deleteFormation,
  addPlayerToPosition,
  removePlayerFromPosition,
  type FormationData,
  type PositionPlayer,
} from '@/services/formationService'
import type { PlayerWithScore, Position } from '@/types/scoring'
import {
  FORMATIONS,
  POSITION_KEY_API_MAP,
  FORMATION_POSITION_API_OVERRIDES,
  POSITION_DISPLAY_NAME,
  FORMATION_DISPLAY_OVERRIDES,
  FORMATION_SHORT_LABEL_OVERRIDES,
} from '@/constants/formations'
import { getScoreColorClass, type ScoreScale } from '@/components/ui/ScoreBar'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useLanguage } from '@/context/LanguageContext'
import { leagueLabel } from '@/utils/leagueLabels'

// ─── Age helper ──────────────────────────────────────────────────────────────

function getAge(birthDate: string | null): number | null {
  if (!birthDate) return null
  const diff = Date.now() - new Date(birthDate).getTime()
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000))
}

// ─── PlayerSelector ───────────────────────────────────────────────────────────

interface PlayerSelectorProps {
  positionKey: string
  formationType: string
  selectedLeagueIds: number[]
  nationality: string
  minAge: number
  maxAge: number
  currentPlayers: PositionPlayer[]
  allSelectedPlayerIds: Set<number>
  onAddPlayer: (player: PlayerWithScore) => void
  onRemovePlayer: (playerId: string) => void
  onClose: () => void
}

function PlayerSelector({
  positionKey,
  formationType,
  selectedLeagueIds,
  nationality,
  minAge,
  maxAge,
  currentPlayers,
  allSelectedPlayerIds,
  onAddPlayer,
  onRemovePlayer,
  onClose,
}: PlayerSelectorProps) {
  const { t } = useLanguage()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'search' | 'suggestions'>('suggestions')
  const searchInputRef = useRef<HTMLInputElement>(null)

  const allowedPositions: Position[] =
    FORMATION_POSITION_API_OVERRIDES[formationType]?.[positionKey] ??
    POSITION_KEY_API_MAP[positionKey] ??
    []

  const displayName =
    FORMATION_DISPLAY_OVERRIDES[formationType]?.[positionKey] ??
    POSITION_DISPLAY_NAME[positionKey] ??
    positionKey

  const canAddMore = currentPlayers.length < 3
  const currentPosIds = new Set(currentPlayers.map(p => p.playerId))
  const singleLeagueId = selectedLeagueIds.length === 1 ? selectedLeagueIds[0] : undefined

  const isExcluded = useCallback((p: PlayerWithScore) => {
    if (currentPosIds.has(String(p.id))) return true
    if (allSelectedPlayerIds.has(p.id)) return true
    return false
  }, [currentPosIds, allSelectedPlayerIds])

  // Sugeridos: se piden ya filtrados por posición al backend (top por Rating DE
  // ESA POSICIÓN), no recortados de un pool global de 300 ordenado por score total.
  // Antes, posiciones minoritarias como lateral casi no tenían candidatos porque
  // competían por un lugar en el top-300 general contra centrales/delanteros.
  const { players: suggestionPool, loading: suggestionsLoading } = usePlayersList(
    allowedPositions.length > 0
      ? {
          positions: allowedPositions,
          league_id: singleLeagueId,
          min_age: minAge > 15 ? minAge : undefined,
          max_age: maxAge < 40 ? maxAge : undefined,
          pageSize: 200,
        }
      : { pageSize: 0 }
  )

  const candidates = useMemo(() => {
    return suggestionPool
      .filter(p => {
        if (isExcluded(p)) return false
        if (selectedLeagueIds.length > 1 && !(p.league && selectedLeagueIds.includes(p.league.id))) return false
        if (nationality && (p.nationality ?? '') !== nationality) return false
        if (p.primary_score === null) return false
        return true
      })
      .slice(0, 15) // ya viene ordenado por avg_rating desc desde el RPC
  }, [suggestionPool, isExcluded, selectedLeagueIds, nationality])

  // Buscar: contra la base completa, sin recorte de pool ni de posición — antes
  // buscaba sólo dentro de ese mismo top-300 global, así que un jugador real que no
  // estuviera entre los mejores puntuados no aparecía nunca, ni por nombre exacto.
  const debouncedSearch = useDebouncedValue(searchQuery.trim(), 250)
  const { players: searchPool, loading: searchLoading } = usePlayersList(
    debouncedSearch.length >= 2 ? { search: debouncedSearch, pageSize: 15 } : { pageSize: 0 }
  )
  const searchResults = useMemo(() => searchPool.filter(p => !isExcluded(p)), [searchPool, isExcluded])
  const playersLoading = activeTab === 'search' ? searchLoading : suggestionsLoading

  // Focus search input when tab switches
  useEffect(() => {
    if (activeTab === 'search' && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [activeTab])

  const renderPlayerCard = (p: PlayerWithScore, i: number, showPosition = false) => {
    const score = p.primary_score
    const age = getAge(p.birth_date)
    return (
      <button
        key={`${p.id}-${i}`}
        onClick={() => onAddPlayer(p)}
        className="w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 border border-apple-gray-100 dark:border-apple-gray-700 hover:border-brand-green/50"
      >
        {p.photo ? (
          <img src={p.photo} alt="" className="w-10 h-10 rounded-lg object-cover bg-apple-gray-200" />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-apple-gray-200 dark:bg-apple-gray-600 flex items-center justify-center text-sm font-bold text-apple-gray-500">
            {p.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('')}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-apple-gray-800 dark:text-white text-sm truncate">{p.name}</p>
          <p className="text-xs text-apple-gray-500 truncate">
            {p.team?.name ?? '—'}{age !== null ? ` · ${age} ${t('externo.anios')}` : ''}
            {showPosition && p.primary_position && (
              <span className="text-apple-gray-400"> · {p.primary_position}</span>
            )}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          {score !== null ? (
            <p className={`text-sm font-bold ${getScoreColorClass(score, '10')}`}>
              {score.toFixed(1)}
            </p>
          ) : (
            <p className="text-sm font-bold text-apple-gray-400">—</p>
          )}
        </div>
      </button>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in" onClick={onClose}>
      <div
        className="bg-white dark:bg-apple-gray-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-hidden animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-apple-gray-200 dark:border-apple-gray-700">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-bold text-apple-gray-800 dark:text-white">{displayName}</h3>
              <p className="text-xs text-apple-gray-500 mt-0.5">
                {t('formacion.deJugadores').replace('{count}', String(currentPlayers.length))} · {canAddMore ? t('formacion.seleccionaParaAgregar') : t('formacion.maximoAlcanzado')}
              </p>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-apple-gray-400 hover:text-apple-gray-600 dark:hover:text-apple-gray-200 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          {canAddMore && (
            <div className="flex gap-1 bg-apple-gray-100 dark:bg-apple-gray-700 rounded-xl p-1">
              <button
                onClick={() => setActiveTab('suggestions')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'suggestions'
                    ? 'bg-white dark:bg-apple-gray-600 text-apple-gray-800 dark:text-white shadow-sm'
                    : 'text-apple-gray-500 hover:text-apple-gray-700 dark:hover:text-apple-gray-300'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {t('formacion.sugeridos')}
              </button>
              <button
                onClick={() => setActiveTab('search')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'search'
                    ? 'bg-white dark:bg-apple-gray-600 text-apple-gray-800 dark:text-white shadow-sm'
                    : 'text-apple-gray-500 hover:text-apple-gray-700 dark:hover:text-apple-gray-300'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {t('formacion.buscar')}
              </button>
            </div>
          )}
        </div>

        {/* Current players in position */}
        {currentPlayers.length > 0 && (
          <div className="p-4 bg-apple-gray-50 dark:bg-apple-gray-900/50 border-b border-apple-gray-200 dark:border-apple-gray-700">
            <p className="text-xs font-semibold text-apple-gray-500 uppercase tracking-wider mb-2">{t('formacion.enEstaPosicion')}</p>
            <div className="space-y-2">
              {currentPlayers.map((p) => (
                <div key={p.playerId} className="flex items-center justify-between bg-white dark:bg-apple-gray-800 rounded-xl p-3 shadow-sm border border-apple-gray-100 dark:border-apple-gray-700">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-brand-green/20 flex items-center justify-center text-brand-green font-bold text-sm">
                      {currentPlayers.indexOf(p) + 1}
                    </div>
                    <div>
                      <p className="font-medium text-sm text-apple-gray-800 dark:text-white">{p.playerName}</p>
                      <p className="text-xs text-apple-gray-500">{p.team}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.rating !== null && (
                      <span className={`text-sm font-bold ${getScoreColorClass(p.rating, '10')}`}>
                        {p.rating.toFixed(1)}
                      </span>
                    )}
                    <button
                      onClick={() => onRemovePlayer(p.playerId)}
                      className="w-7 h-7 flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Content area */}
        <div className="p-4 max-h-[50vh] overflow-y-auto">
          {!canAddMore ? (
            <p className="text-center text-apple-gray-500 py-4 text-sm">{t('formacion.maximo3PorPosicion')}</p>
          ) : playersLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
            </div>
          ) : activeTab === 'search' ? (
            <div className="space-y-3">
              {/* Search input */}
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={t('formacion.buscarPorNombreEquipo')}
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-apple-gray-100 dark:bg-apple-gray-700 border border-apple-gray-200 dark:border-apple-gray-600 text-apple-gray-800 dark:text-white placeholder-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/50 text-sm"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-apple-gray-400 hover:text-apple-gray-600"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Search results */}
              {searchQuery.trim() ? (
                searchResults.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs text-apple-gray-500">{t('formacion.resultadoCount').replace('{count}', String(searchResults.length))}</p>
                    {searchResults.map((p, i) => renderPlayerCard(p, i, true))}
                  </div>
                ) : (
                  <div className="py-8 text-center">
                    <svg className="w-12 h-12 mx-auto text-apple-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <p className="text-apple-gray-500 text-sm">{t('formacion.noSeEncontraronJugadores')}</p>
                    <p className="text-apple-gray-400 text-xs mt-1">{t('formacion.probaOtroNombreEquipo')}</p>
                  </div>
                )
              ) : (
                <div className="py-8 text-center">
                  <svg className="w-12 h-12 mx-auto text-apple-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <p className="text-apple-gray-500 text-sm">{t('formacion.buscaCualquierJugador')}</p>
                  <p className="text-apple-gray-400 text-xs mt-1">{t('formacion.sinRestriccionPosicion')}</p>
                </div>
              )}
            </div>
          ) : candidates.length === 0 ? (
            <div className="py-8 text-center">
              <svg className="w-12 h-12 mx-auto text-apple-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <p className="text-apple-gray-500 text-sm">{t('formacion.noHayJugadoresSugeridos')}</p>
              <p className="text-apple-gray-400 text-xs mt-1">{t('formacion.usaLaBusqueda')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-apple-gray-500 uppercase tracking-wider mb-2">{t('formacion.mejoresPara').replace('{position}', displayName)}</p>
              {candidates.map((p, i) => renderPlayerCard(p, i))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FormationPage() {
  const { t } = useLanguage()
  const { user, userDisplayName } = useAuth()
  const allLeagues = useLeagues()

  const [formation, setFormation] = useState('4-3-3')
  const [selectedLeagueIds, setSelectedLeagueIds] = useState<number[]>([])
  const [nationality, setNationality] = useState('')
  const [minAge, setMinAge] = useState(15)
  const [maxAge, setMaxAge] = useState(40)
  const [positions, setPositions] = useState<Record<string, PositionPlayer[]>>({})
  const [selectedPos, setSelectedPos] = useState<string | null>(null)
  const [savedFormations, setSavedFormations] = useState<FormationData[]>([])
  const [loadingFormations, setLoadingFormations] = useState(true)
  const [formationName, setFormationName] = useState('')
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [showLoadModal, setShowLoadModal] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [activeFormation, setActiveFormation] = useState<FormationData | null>(null)
  const [saving, setSaving] = useState(false)

  // ── Load players from Supabase ────────────────────────────────────────────
  const playerFilters = useMemo(() => ({
    league_id: selectedLeagueIds.length === 1 ? selectedLeagueIds[0] : undefined,
    min_age: minAge > 15 ? minAge : undefined,
    max_age: maxAge < 40 ? maxAge : undefined,
    pageSize: 300,
  }), [selectedLeagueIds, minAge, maxAge])

  // Sólo se usa para poblar el desplegable de nacionalidades; la selección real de
  // jugadores por posición ahora vive dentro de PlayerSelector (fetch propio,
  // filtrado por posición en vez de recortar este pool).
  const { players: apiPlayers } = usePlayersList(playerFilters)

  // Client-side filter for multiple leagues (when > 1 selected)
  const allPlayers = useMemo(() => {
    if (selectedLeagueIds.length <= 1) return apiPlayers
    return apiPlayers.filter(p =>
      p.league ? selectedLeagueIds.includes(p.league.id) : false
    )
  }, [apiPlayers, selectedLeagueIds])

  // Distinct nationalities from loaded players
  const nationalities = useMemo(() => {
    const set = new Set<string>()
    allPlayers.forEach(p => { if (p.nationality) set.add(p.nationality) })
    return [...set].sort()
  }, [allPlayers])

  // ── Load saved formations from Supabase ───────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoadingFormations(true)
      const data = await fetchFormations(user?.id)
      setSavedFormations(data)
      setLoadingFormations(false)
    }
    load()
  }, [user?.id])

  const currentFormation = FORMATIONS[formation]

  // All selected player IDs (numeric) across all positions
  const allSelectedPlayerIds = useMemo(() => {
    const ids = new Set<number>()
    Object.values(positions).forEach(players => {
      players.forEach(p => {
        const numId = Number(p.playerId)
        if (!isNaN(numId)) ids.add(numId)
      })
    })
    return ids
  }, [positions])

  const handleAddPlayer = useCallback((posKey: string, player: PlayerWithScore) => {
    if (!user) {
      setShowAuthModal(true)
      return
    }

    const newPlayer: PositionPlayer = {
      playerName: player.name,
      playerId: String(player.id),
      team: player.team?.name ?? '',
      rating: player.primary_score,
      addedBy: user.id,
      addedByName: userDisplayName,
      addedAt: new Date().toISOString(),
    }

    setPositions(prev => addPlayerToPosition(prev, posKey, newPlayer))
  }, [user, userDisplayName])

  const handleRemovePlayer = useCallback((posKey: string, playerId: string) => {
    setPositions(prev => removePlayerFromPosition(prev, posKey, playerId))
  }, [])

  const clearFormation = () => {
    setPositions({})
    setActiveFormation(null)
  }

  const handleSave = async () => {
    if (!user || !formationName.trim()) return
    setSaving(true)

    const saved = await saveFormation(
      formationName.trim(),
      formation,
      positions,
      user.id,
      userDisplayName,
      true
    )

    if (saved) {
      setSavedFormations(prev => [saved, ...prev])
      setActiveFormation(saved)
      setFormationName('')
      setShowSaveModal(false)
    }

    setSaving(false)
  }

  const handleLoad = (f: FormationData) => {
    setFormation(f.formation_type)
    setPositions(f.positions || {})
    setActiveFormation(f)
    setShowLoadModal(false)
  }

  const handleDelete = async (id: string) => {
    const success = await deleteFormation(id)
    if (success) {
      setSavedFormations(prev => prev.filter(f => f.id !== id))
      if (activeFormation?.id === id) {
        setActiveFormation(null)
      }
    }
  }

  const totalPlayers = Object.values(positions).reduce((sum, arr) => sum + arr.length, 0)

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-apple-gray-800 dark:text-white tracking-tight">
            {t('formacion.titulo')}
          </h1>
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
            {t('formacion.totalJugadores').replace('{count}', String(totalPlayers))}
            {activeFormation && (
              <span className="ml-2 text-brand-green">
                · {t('formacion.editando').replace('{name}', activeFormation.name)} <span className="text-apple-gray-400">({t('formacion.por').replace('{name}', activeFormation.created_by_name)})</span>
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLoadModal(true)}
            className="btn-apple-secondary"
          >
            {t('formacion.cargar')}
          </button>
          <button
            onClick={() => {
              if (!user) {
                setShowAuthModal(true)
              } else {
                setShowSaveModal(true)
              }
            }}
            disabled={totalPlayers === 0}
            className="btn-apple-primary disabled:opacity-50"
          >
            {t('formacion.guardar')}
          </button>
          <button
            onClick={clearFormation}
            className="btn-apple text-red-500 border border-red-300 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            {t('formacion.limpiar')}
          </button>
        </div>
      </div>

      <div className="flex gap-6 flex-wrap lg:flex-nowrap">
        {/* Sidebar */}
        <aside className="w-full lg:w-72 flex-shrink-0">
          <div className="card-apple p-5 space-y-5 sticky top-[4rem]">
            <div>
              <label className="block text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mb-2">{t('formacion.formacionLabel')}</label>
              <select
                value={formation}
                onChange={e => { setFormation(e.target.value); setPositions({}); setActiveFormation(null) }}
                className="input-apple"
              >
                {Object.keys(FORMATIONS).map(f => (
                  <option key={f} value={f}>{FORMATIONS[f].name}</option>
                ))}
              </select>
            </div>

            {/* Clear filters button */}
            {(selectedLeagueIds.length > 0 || nationality || minAge !== 15 || maxAge !== 40) && (
              <button
                onClick={() => {
                  setSelectedLeagueIds([])
                  setNationality('')
                  setMinAge(15)
                  setMaxAge(40)
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400 hover:text-red-500 dark:hover:text-red-400 bg-apple-gray-100 dark:bg-apple-gray-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                {t('formacion.limpiarFiltros')}
              </button>
            )}

            <div>
              <label className="block text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mb-2">
                {t('formacion.liga')} {selectedLeagueIds.length > 0 && <span className="text-brand-green">({selectedLeagueIds.length})</span>}
              </label>
              <select
                value={selectedLeagueIds.length === 1 ? selectedLeagueIds[0] : ''}
                onChange={e => {
                  const val = e.target.value
                  setSelectedLeagueIds(val ? [Number(val)] : [])
                }}
                className="input-apple"
              >
                <option value="">{t('formacion.todasLasLigas')}</option>
                {allLeagues.map(l => (
                  <option key={l.id} value={l.id}>{leagueLabel(l)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mb-2">{t('formacion.nacionalidad')}</label>
              <select value={nationality} onChange={e => setNationality(e.target.value)} className="input-apple">
                <option value="">{t('formacion.todas')}</option>
                {nationalities.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mb-2">
                {t('formacion.edadRange').replace('{min}', String(minAge)).replace('{max}', String(maxAge))}
              </label>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs text-apple-gray-500 mb-1">
                    <span>{t('formacion.minLabel').replace('{v}', String(minAge))}</span>
                    <span>{t('formacion.maxLabel').replace('{v}', String(maxAge))}</span>
                  </div>
                  <input
                    type="range"
                    min="15"
                    max="40"
                    value={minAge}
                    onChange={e => setMinAge(Math.min(Number(e.target.value), maxAge - 1))}
                    className="w-full h-2 bg-apple-gray-200 dark:bg-apple-gray-700 rounded-lg appearance-none cursor-pointer accent-brand-green"
                  />
                  <input
                    type="range"
                    min="15"
                    max="40"
                    value={maxAge}
                    onChange={e => setMaxAge(Math.max(Number(e.target.value), minAge + 1))}
                    className="w-full h-2 bg-apple-gray-200 dark:bg-apple-gray-700 rounded-lg appearance-none cursor-pointer accent-brand-green mt-2"
                  />
                </div>
                <div className="flex gap-1.5">
                  {[
                    { label: t('formacion.sub21'), min: 15, max: 21 },
                    { label: t('formacion.sub23'), min: 15, max: 23 },
                    { label: t('formacion.todosPreset'), min: 15, max: 40 },
                  ].map(preset => (
                    <button
                      key={preset.label}
                      onClick={() => { setMinAge(preset.min); setMaxAge(preset.max) }}
                      className={`flex-1 py-1.5 text-xs rounded-lg transition-all ${
                        minAge === preset.min && maxAge === preset.max
                          ? 'bg-brand-green text-black font-medium'
                          : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Field */}
        <div className="flex-1 flex items-start justify-center">
          <div className="bg-gradient-to-b from-emerald-600 to-emerald-700 rounded-2xl p-4 sm:p-6 relative aspect-[3/4] w-full max-w-xl shadow-2xl overflow-hidden">
            {/* Field markings */}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 130" preserveAspectRatio="none">
              <rect x="2" y="2" width="96" height="126" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.5" />
              <circle cx="50" cy="65" r="12" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.4" />
              <circle cx="50" cy="65" r="1" fill="rgba(255,255,255,0.5)" />
              <line x1="2" y1="65" x2="98" y2="65" stroke="rgba(255,255,255,0.4)" strokeWidth="0.4" />
              <rect x="20" y="2" width="60" height="20" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.4" />
              <rect x="30" y="2" width="40" height="8" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.4" />
              <rect x="20" y="108" width="60" height="20" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.4" />
              <rect x="30" y="120" width="40" height="8" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.4" />
              {/* Corner arcs */}
              <path d="M 2 6 Q 2 2 6 2" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.3" />
              <path d="M 94 2 Q 98 2 98 6" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.3" />
              <path d="M 2 124 Q 2 128 6 128" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.3" />
              <path d="M 94 128 Q 98 128 98 124" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.3" />
            </svg>

            {/* Position markers */}
            {currentFormation.positions.map(pos => {
              const playersInPos = positions[pos.key] || []
              const hasPlayers = playersInPos.length > 0

              return (
                <button
                  key={pos.key}
                  onClick={() => setSelectedPos(pos.key)}
                  className="absolute transform -translate-x-1/2 -translate-y-1/2 group"
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                >
                  <div className={`relative transition-all duration-200 ${hasPlayers ? '' : 'hover:scale-110'}`}>
                    {/* Main circle */}
                    <div className={`w-10 h-10 sm:w-14 sm:h-14 rounded-full flex items-center justify-center shadow-xl transition-all ${
                      hasPlayers
                        ? 'bg-white text-apple-gray-900 ring-2 ring-white/50'
                        : 'bg-white/15 border-2 border-dashed border-white/50 text-white/80 hover:bg-white/25 hover:border-white/70'
                    }`}>
                      {hasPlayers ? (
                        <span className="text-xl font-bold">{playersInPos.length}</span>
                      ) : (
                        <span className="text-sm font-semibold">
                          {FORMATION_SHORT_LABEL_OVERRIDES[formation]?.[pos.key] ?? pos.key}
                        </span>
                      )}
                    </div>

                    {/* Player badges */}
                    {hasPlayers && (
                      <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-0.5">
                        {playersInPos.slice(0, 3).map((p) => (
                          <div
                            key={p.playerId}
                            className="whitespace-nowrap bg-white dark:bg-apple-gray-800 rounded-md px-2 py-0.5 shadow-md text-xs"
                          >
                            <span className="font-semibold text-apple-gray-800 dark:text-white">
                              {p.playerName.split(' ').slice(-1)[0]}
                            </span>
                            {p.rating !== null && (
                              <span className={`ml-1.5 font-bold ${getScoreColorClass(p.rating, '10')}`}>
                                {p.rating.toFixed(1)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Player selector modal */}
      {selectedPos && (
        <PlayerSelector
          positionKey={selectedPos}
          formationType={formation}
          selectedLeagueIds={selectedLeagueIds}
          nationality={nationality}
          minAge={minAge}
          maxAge={maxAge}
          currentPlayers={positions[selectedPos] || []}
          allSelectedPlayerIds={allSelectedPlayerIds}
          onAddPlayer={(p) => handleAddPlayer(selectedPos, p)}
          onRemovePlayer={(id) => handleRemovePlayer(selectedPos, id)}
          onClose={() => setSelectedPos(null)}
        />
      )}

      {/* Save modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in" onClick={() => setShowSaveModal(false)}>
          <div className="bg-white dark:bg-apple-gray-800 rounded-apple-xl p-6 max-w-sm w-full shadow-apple-lg animate-scale-in" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-apple-gray-800 dark:text-white mb-2">{t('formacion.guardarFormacion')}</h3>
            <p className="text-sm text-apple-gray-500 mb-4">
              {(() => {
                const [before, after] = t('formacion.guardandoComo').split('{name}')
                return <>{before}<span className="font-medium text-brand-green">{userDisplayName}</span>{after}</>
              })()}
            </p>
            <input
              type="text"
              value={formationName}
              onChange={e => setFormationName(e.target.value)}
              placeholder={t('formacion.nombreFormacionPlaceholder')}
              className="input-apple mb-4"
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={() => setShowSaveModal(false)} className="btn-apple-secondary flex-1">
                {t('formacion.cancelar')}
              </button>
              <button
                onClick={handleSave}
                disabled={!formationName.trim() || saving}
                className="btn-apple-primary flex-1 disabled:opacity-50"
              >
                {saving ? t('formacion.guardando') : t('formacion.guardar')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Load modal */}
      {showLoadModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in" onClick={() => setShowLoadModal(false)}>
          <div className="bg-white dark:bg-apple-gray-800 rounded-apple-xl max-w-lg w-full max-h-[80vh] overflow-hidden shadow-apple-lg animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-apple-gray-200 dark:border-apple-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-bold text-apple-gray-800 dark:text-white">{t('formacion.formacionesGuardadas')}</h3>
              <button onClick={() => setShowLoadModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg text-apple-gray-400 hover:text-apple-gray-600 dark:hover:text-apple-gray-200 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              {loadingFormations ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
                </div>
              ) : savedFormations.length === 0 ? (
                <p className="text-center text-apple-gray-500 py-8">{t('formacion.noHayFormacionesGuardadas')}</p>
              ) : (
                <div className="space-y-2">
                  {savedFormations.map(f => {
                    const playerCount = Object.values(f.positions || {}).reduce((sum, arr) => sum + (arr?.length || 0), 0)
                    const isOwn = user?.id === f.created_by

                    return (
                      <div key={f.id} className="flex items-center justify-between p-4 bg-apple-gray-50 dark:bg-apple-gray-700 rounded-apple">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-apple-gray-800 dark:text-white text-sm truncate">{f.name}</p>
                            {isOwn && (
                              <span className="text-2xs bg-brand-green/20 text-brand-green px-1.5 py-0.5 rounded font-medium">{t('formacion.tuya')}</span>
                            )}
                          </div>
                          <p className="text-xs text-apple-gray-500 mt-0.5">
                            {(() => {
                              const [before, after] = t('formacion.formacionSummary')
                                .replace('{type}', f.formation_type)
                                .replace('{count}', String(playerCount))
                                .split('{name}')
                              return <>{before}<span className="font-medium">{f.created_by_name}</span>{after}</>
                            })()}
                          </p>
                        </div>
                        <div className="flex gap-1.5 ml-3">
                          <button
                            onClick={() => handleLoad(f)}
                            className="px-3 py-1.5 text-xs bg-brand-green text-black font-medium rounded-lg hover:bg-green-400 transition-colors"
                          >
                            {t('formacion.cargar')}
                          </button>
                          {isOwn && (
                            <button
                              onClick={() => handleDelete(f.id)}
                              className="w-8 h-8 flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Auth modal */}
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  )
}
