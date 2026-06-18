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
import { getScoreColorClass, type ScoreScale } from '@/components/ui/ScoreBar'
import { smartSearch } from '@/lib/search'

// ─── Formation definitions ────────────────────────────────────────────────────

const FORMATIONS: Record<string, { name: string; positions: { key: string; x: number; y: number }[] }> = {
  '4-3-3': {
    name: '4-3-3',
    positions: [
      { key: 'GK', x: 50, y: 92 },
      { key: 'LB', x: 15, y: 72 },
      { key: 'CB1', x: 35, y: 75 },
      { key: 'CB2', x: 65, y: 75 },
      { key: 'RB', x: 85, y: 72 },
      { key: 'CM1', x: 30, y: 50 },
      { key: 'CM2', x: 50, y: 55 },
      { key: 'CM3', x: 70, y: 50 },
      { key: 'LW', x: 18, y: 25 },
      { key: 'ST', x: 50, y: 20 },
      { key: 'RW', x: 82, y: 25 },
    ],
  },
  '4-4-2': {
    name: '4-4-2',
    positions: [
      { key: 'GK', x: 50, y: 92 },
      { key: 'LB', x: 15, y: 72 },
      { key: 'CB1', x: 35, y: 75 },
      { key: 'CB2', x: 65, y: 75 },
      { key: 'RB', x: 85, y: 72 },
      { key: 'LM', x: 15, y: 48 },
      { key: 'CM1', x: 38, y: 52 },
      { key: 'CM2', x: 62, y: 52 },
      { key: 'RM', x: 85, y: 48 },
      { key: 'ST1', x: 35, y: 22 },
      { key: 'ST2', x: 65, y: 22 },
    ],
  },
  '4-2-3-1': {
    name: '4-2-3-1',
    positions: [
      { key: 'GK', x: 50, y: 92 },
      { key: 'LB', x: 15, y: 72 },
      { key: 'CB1', x: 35, y: 75 },
      { key: 'CB2', x: 65, y: 75 },
      { key: 'RB', x: 85, y: 72 },
      { key: 'CDM1', x: 38, y: 58 },
      { key: 'CDM2', x: 62, y: 58 },
      { key: 'LW', x: 18, y: 35 },
      { key: 'CAM', x: 50, y: 38 },
      { key: 'RW', x: 82, y: 35 },
      { key: 'ST', x: 50, y: 18 },
    ],
  },
  '3-5-2': {
    name: '3-5-2',
    positions: [
      { key: 'GK', x: 50, y: 92 },
      { key: 'CB1', x: 25, y: 75 },
      { key: 'CB2', x: 50, y: 78 },
      { key: 'CB3', x: 75, y: 75 },
      { key: 'LWB', x: 10, y: 50 },
      { key: 'CM1', x: 35, y: 52 },
      { key: 'CM2', x: 50, y: 48 },
      { key: 'CM3', x: 65, y: 52 },
      { key: 'RWB', x: 90, y: 50 },
      { key: 'ST1', x: 38, y: 22 },
      { key: 'ST2', x: 62, y: 22 },
    ],
  },
  '5-3-2': {
    name: '5-3-2',
    positions: [
      { key: 'GK', x: 50, y: 92 },
      { key: 'LWB', x: 10, y: 65 },
      { key: 'CB1', x: 28, y: 75 },
      { key: 'CB2', x: 50, y: 78 },
      { key: 'CB3', x: 72, y: 75 },
      { key: 'RWB', x: 90, y: 65 },
      { key: 'CM1', x: 30, y: 48 },
      { key: 'CM2', x: 50, y: 52 },
      { key: 'CM3', x: 70, y: 48 },
      { key: 'ST1', x: 38, y: 22 },
      { key: 'ST2', x: 62, y: 22 },
    ],
  },
}

// ─── Position key → API Position[] mapping ───────────────────────────────────
// Maps formation slot keys to the API Position values (ARQ|LD|CB|LI|VC|VI|EXT|DEL)

const POSITION_KEY_API_MAP: Record<string, Position[]> = {
  'GK':   ['ARQ'],
  'LB':   ['LI'],
  'RB':   ['LD'],
  'LWB':  ['LI'],
  'RWB':  ['LD'],
  'CB1':  ['CB'],
  'CB2':  ['CB'],
  'CB3':  ['CB'],
  'CDM':  ['VC'],
  'CDM1': ['VC'],
  'CDM2': ['VC'],
  'CM1':  ['VC', 'VI'],
  'CM2':  ['VC', 'VI'],
  'CM3':  ['VC', 'VI'],
  'CAM':  ['VI'],
  'LM':   ['EXT'],
  'RM':   ['EXT'],
  'LW':   ['EXT'],
  'RW':   ['EXT'],
  'ST':   ['DEL'],
  'ST1':  ['DEL'],
  'ST2':  ['DEL'],
}

// Formation-specific overrides for CM positions in 4-3-3
const FORMATION_POSITION_API_OVERRIDES: Record<string, Record<string, Position[]>> = {
  '4-3-3': {
    'CM1': ['VI'],
    'CM2': ['VC'],
    'CM3': ['VI'],
  },
}

const POSITION_DISPLAY_NAME: Record<string, string> = {
  'GK':   'Arquero',
  'LB':   'Lateral Izquierdo',
  'RB':   'Lateral Derecho',
  'LWB':  'Lateral Izquierdo',
  'RWB':  'Lateral Derecho',
  'CB1':  'Defensor Central',
  'CB2':  'Defensor Central',
  'CB3':  'Defensor Central',
  'CDM':  'Volante Central',
  'CDM1': 'Volante Central',
  'CDM2': 'Volante Central',
  'CM1':  'Mediocampista',
  'CM2':  'Mediocampista',
  'CM3':  'Mediocampista',
  'CAM':  'Mediapunta',
  'LM':   'Extremo Izquierdo',
  'RM':   'Extremo Derecho',
  'LW':   'Extremo Izquierdo',
  'RW':   'Extremo Derecho',
  'ST':   'Delantero',
  'ST1':  'Delantero',
  'ST2':  'Delantero',
}

const FORMATION_DISPLAY_OVERRIDES: Record<string, Record<string, string>> = {
  '4-3-3': {
    'CM1': 'Vol. Interno Izq.',
    'CM2': 'Volante Central',
    'CM3': 'Vol. Interno Der.',
  },
}

const FORMATION_SHORT_LABEL_OVERRIDES: Record<string, Record<string, string>> = {
  '4-3-3': {
    'CM1': 'VI',
    'CM2': 'VC',
    'CM3': 'VI',
  },
}

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
  allPlayers: PlayerWithScore[]
  playersLoading: boolean
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
  allPlayers,
  playersLoading,
  currentPlayers,
  allSelectedPlayerIds,
  onAddPlayer,
  onRemovePlayer,
  onClose,
}: PlayerSelectorProps) {
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

  // Players not already selected anywhere (use string id stored in PositionPlayer.playerId)
  const availablePlayers = useMemo(() => {
    return allPlayers.filter(p => {
      const strId = String(p.id)
      if (currentPosIds.has(strId)) return false
      if (allSelectedPlayerIds.has(p.id)) return false
      return true
    })
  }, [allPlayers, currentPosIds, allSelectedPlayerIds])

  // Search across all available players (no position restriction)
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return []
    return smartSearch(availablePlayers, searchQuery, p => `${p.name} ${p.team?.name ?? ''}`, 12)
  }, [availablePlayers, searchQuery])

  // Suggested candidates filtered by position + nationality
  const candidates = useMemo(() => {
    return availablePlayers
      .filter(p => {
        if (!p.primary_position) return false
        if (!allowedPositions.includes(p.primary_position)) return false
        if (nationality) {
          if ((p.nationality ?? '') !== nationality) return false
        }
        if (p.primary_score === null) return false
        return true
      })
      .sort((a, b) => (b.primary_score ?? 0) - (a.primary_score ?? 0))
      .slice(0, 15)
  }, [availablePlayers, allowedPositions, nationality])

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
            {p.team?.name ?? '—'}{age !== null ? ` · ${age} años` : ''}
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
                {currentPlayers.length}/3 jugadores · {canAddMore ? 'Selecciona para agregar' : 'Maximo alcanzado'}
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
                Sugeridos
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
                Buscar
              </button>
            </div>
          )}
        </div>

        {/* Current players in position */}
        {currentPlayers.length > 0 && (
          <div className="p-4 bg-apple-gray-50 dark:bg-apple-gray-900/50 border-b border-apple-gray-200 dark:border-apple-gray-700">
            <p className="text-xs font-semibold text-apple-gray-500 uppercase tracking-wider mb-2">En esta posicion</p>
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
                    {p.ggScore !== null && (
                      <span className={`text-sm font-bold ${getScoreColorClass(p.ggScore, '10')}`}>
                        {p.ggScore.toFixed(1)}
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
            <p className="text-center text-apple-gray-500 py-4 text-sm">Maximo 3 jugadores por posicion</p>
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
                  placeholder="Buscar por nombre o equipo..."
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
                    <p className="text-xs text-apple-gray-500">{searchResults.length} resultado{searchResults.length !== 1 ? 's' : ''}</p>
                    {searchResults.map((p, i) => renderPlayerCard(p, i, true))}
                  </div>
                ) : (
                  <div className="py-8 text-center">
                    <svg className="w-12 h-12 mx-auto text-apple-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <p className="text-apple-gray-500 text-sm">No se encontraron jugadores</p>
                    <p className="text-apple-gray-400 text-xs mt-1">Proba con otro nombre o equipo</p>
                  </div>
                )
              ) : (
                <div className="py-8 text-center">
                  <svg className="w-12 h-12 mx-auto text-apple-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <p className="text-apple-gray-500 text-sm">Busca cualquier jugador</p>
                  <p className="text-apple-gray-400 text-xs mt-1">Sin restriccion de posicion</p>
                </div>
              )}
            </div>
          ) : candidates.length === 0 ? (
            <div className="py-8 text-center">
              <svg className="w-12 h-12 mx-auto text-apple-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <p className="text-apple-gray-500 text-sm">No hay jugadores sugeridos</p>
              <p className="text-apple-gray-400 text-xs mt-1">Usa la busqueda para encontrar cualquier jugador</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-apple-gray-500 uppercase tracking-wider mb-2">Mejores para {displayName}</p>
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

  const { players: apiPlayers, loading: playersLoading } = usePlayersList(playerFilters)

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
      ggScore: player.primary_score,
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
            Constructor de Formaciones
          </h1>
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
            {totalPlayers} jugadores · Hasta 3 por posición
            {activeFormation && (
              <span className="ml-2 text-brand-green">
                · Editando: {activeFormation.name} <span className="text-apple-gray-400">(por {activeFormation.created_by_name})</span>
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLoadModal(true)}
            className="btn-apple-secondary"
          >
            Cargar
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
            Guardar
          </button>
          <button
            onClick={clearFormation}
            className="btn-apple text-red-500 border border-red-300 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            Limpiar
          </button>
        </div>
      </div>

      <div className="flex gap-6 flex-wrap lg:flex-nowrap">
        {/* Sidebar */}
        <aside className="w-full lg:w-72 flex-shrink-0">
          <div className="card-apple p-5 space-y-5 sticky top-[4rem]">
            <div>
              <label className="block text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mb-2">Formación</label>
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
                Limpiar filtros
              </button>
            )}

            <div>
              <label className="block text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mb-2">
                Liga {selectedLeagueIds.length > 0 && <span className="text-brand-green">({selectedLeagueIds.length})</span>}
              </label>
              <select
                value={selectedLeagueIds.length === 1 ? selectedLeagueIds[0] : ''}
                onChange={e => {
                  const val = e.target.value
                  setSelectedLeagueIds(val ? [Number(val)] : [])
                }}
                className="input-apple"
              >
                <option value="">Todas las ligas</option>
                {allLeagues.map(l => (
                  <option key={l.id} value={l.id}>{l.name} ({l.country})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mb-2">Nacionalidad</label>
              <select value={nationality} onChange={e => setNationality(e.target.value)} className="input-apple">
                <option value="">Todas</option>
                {nationalities.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mb-2">
                Edad: {minAge} - {maxAge} anos
              </label>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs text-apple-gray-500 mb-1">
                    <span>Min: {minAge}</span>
                    <span>Max: {maxAge}</span>
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
                    { label: 'Sub-21', min: 15, max: 21 },
                    { label: 'Sub-23', min: 15, max: 23 },
                    { label: 'Todos', min: 15, max: 40 },
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
                            {p.ggScore !== null && (
                              <span className={`ml-1.5 font-bold ${getScoreColorClass(p.ggScore, '10')}`}>
                                {p.ggScore.toFixed(0)}
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
          allPlayers={allPlayers}
          playersLoading={playersLoading}
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
            <h3 className="text-lg font-bold text-apple-gray-800 dark:text-white mb-2">Guardar formación</h3>
            <p className="text-sm text-apple-gray-500 mb-4">
              Guardando como <span className="font-medium text-brand-green">{userDisplayName}</span>
            </p>
            <input
              type="text"
              value={formationName}
              onChange={e => setFormationName(e.target.value)}
              placeholder="Nombre de la formación..."
              className="input-apple mb-4"
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={() => setShowSaveModal(false)} className="btn-apple-secondary flex-1">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={!formationName.trim() || saving}
                className="btn-apple-primary flex-1 disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Guardar'}
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
              <h3 className="text-lg font-bold text-apple-gray-800 dark:text-white">Formaciones guardadas</h3>
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
                <p className="text-center text-apple-gray-500 py-8">No hay formaciones guardadas</p>
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
                              <span className="text-2xs bg-brand-green/20 text-brand-green px-1.5 py-0.5 rounded font-medium">Tuya</span>
                            )}
                          </div>
                          <p className="text-xs text-apple-gray-500 mt-0.5">
                            {f.formation_type} · {playerCount} jugadores · por <span className="font-medium">{f.created_by_name}</span>
                          </p>
                        </div>
                        <div className="flex gap-1.5 ml-3">
                          <button
                            onClick={() => handleLoad(f)}
                            className="px-3 py-1.5 text-xs bg-brand-green text-black font-medium rounded-lg hover:bg-green-400 transition-colors"
                          >
                            Cargar
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
