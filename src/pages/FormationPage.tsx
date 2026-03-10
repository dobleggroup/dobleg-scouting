import { useState, useMemo, useCallback, useEffect } from 'react'
import { useData } from '@/context/DataContext'
import { useAuth } from '@/context/AuthContext'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import AuthModal from '@/components/auth/AuthModal'
import { FILTER_POSITION_MAP, sortLeaguesByPriority } from '@/constants/scoring'
import {
  fetchFormations,
  saveFormation,
  updateFormationPositions,
  deleteFormation,
  addPlayerToPosition,
  removePlayerFromPosition,
  type FormationData,
  type PositionPlayer,
} from '@/services/formationService'
import type { EnrichedPlayer } from '@/types'

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

const POSITION_KEY_MAP: Record<string, string[]> = {
  'GK': ['Arquero'],
  'LB': ['Lateral Izquierdo', 'Lateral'],
  'RB': ['Lateral Derecho', 'Lateral'],
  'LWB': ['Lateral Izquierdo', 'Lateral'],
  'RWB': ['Lateral Derecho', 'Lateral'],
  'CB1': ['Defensor Central'],
  'CB2': ['Defensor Central'],
  'CB3': ['Defensor Central'],
  'CDM': ['Volante Central'],
  'CDM1': ['Volante Central'],
  'CDM2': ['Volante Central'],
  'CM1': ['Volante Central', 'Volante Interno'],
  'CM2': ['Volante Central', 'Volante Interno'],
  'CM3': ['Volante Central', 'Volante Interno'],
  'CAM': ['Volante Interno', 'Mediapunta'],
  'LM': ['Extremo Izquierdo', 'Extremo'],
  'RM': ['Extremo Derecho', 'Extremo'],
  'LW': ['Extremo Izquierdo', 'Extremo'],
  'RW': ['Extremo Derecho', 'Extremo'],
  'ST': ['Delantero'],
  'ST1': ['Delantero'],
  'ST2': ['Delantero'],
}

const POSITION_DISPLAY_NAME: Record<string, string> = {
  'GK': 'Arquero',
  'LB': 'Lateral Izquierdo',
  'RB': 'Lateral Derecho',
  'LWB': 'Lateral Izquierdo',
  'RWB': 'Lateral Derecho',
  'CB1': 'Defensor Central',
  'CB2': 'Defensor Central',
  'CB3': 'Defensor Central',
  'CDM': 'Volante Central',
  'CDM1': 'Volante Central',
  'CDM2': 'Volante Central',
  'CM1': 'Mediocampista',
  'CM2': 'Mediocampista',
  'CM3': 'Mediocampista',
  'CAM': 'Mediapunta',
  'LM': 'Extremo Izquierdo',
  'RM': 'Extremo Derecho',
  'LW': 'Extremo Izquierdo',
  'RW': 'Extremo Derecho',
  'ST': 'Delantero',
  'ST1': 'Delantero',
  'ST2': 'Delantero',
}

interface PlayerSelectorProps {
  positionKey: string
  selectedLeagues: string[]
  nationality: string
  minAge: number
  maxAge: number
  allPlayers: EnrichedPlayer[]
  currentPlayers: PositionPlayer[]
  allSelectedPlayerIds: Set<string>
  onAddPlayer: (player: EnrichedPlayer) => void
  onRemovePlayer: (playerId: string) => void
  onClose: () => void
  userName: string
}

function PlayerSelector({
  positionKey,
  selectedLeagues,
  nationality,
  minAge,
  maxAge,
  allPlayers,
  currentPlayers,
  allSelectedPlayerIds,
  onAddPlayer,
  onRemovePlayer,
  onClose,
  userName,
}: PlayerSelectorProps) {
  const allowedPositions = POSITION_KEY_MAP[positionKey] || []
  const displayName = POSITION_DISPLAY_NAME[positionKey] || positionKey
  const canAddMore = currentPlayers.length < 3
  const currentPosIds = new Set(currentPlayers.map(p => p.playerId))

  const candidates = useMemo(() => {
    return allPlayers
      .filter(p => {
        // Exclude players already in this position
        if (currentPosIds.has(p.Jugador)) return false
        // Exclude players already in other positions (can't play two positions)
        if (allSelectedPlayerIds.has(p.Jugador)) return false
        if (selectedLeagues.length > 0 && !selectedLeagues.includes(p.Liga)) return false
        if (nationality) {
          const playerNat = String(p['País de nacimiento'] || '')
          if (playerNat !== nationality) return false
        }
        if (p.ageNum < minAge || p.ageNum > maxAge) return false
        const rawPos = (p['Posición específica'] || p['Posición'])?.trim() ?? ''
        const playerPosKey = FILTER_POSITION_MAP[rawPos] ?? ''
        return allowedPositions.includes(playerPosKey)
      })
      .filter(p => p.ggScore !== null)
      .sort((a, b) => (b.ggScore ?? 0) - (a.ggScore ?? 0))
      .slice(0, 15)
  }, [allPlayers, selectedLeagues, nationality, minAge, maxAge, allowedPositions, currentPosIds, allSelectedPlayerIds])

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in" onClick={onClose}>
      <div
        className="bg-white dark:bg-apple-gray-800 rounded-apple-xl shadow-apple-lg dark:shadow-apple-dark-md max-w-lg w-full max-h-[85vh] overflow-hidden animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b border-apple-gray-200 dark:border-apple-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-apple-gray-800 dark:text-white">{displayName}</h3>
              <p className="text-xs text-apple-gray-500 mt-0.5">
                {currentPlayers.length}/3 jugadores · {canAddMore ? 'Seleccioná para agregar' : 'Máximo alcanzado'}
              </p>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-apple-gray-400 hover:text-apple-gray-600 dark:hover:text-apple-gray-200 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Current players in position */}
        {currentPlayers.length > 0 && (
          <div className="p-4 bg-apple-gray-50 dark:bg-apple-gray-900/50 border-b border-apple-gray-200 dark:border-apple-gray-700">
            <p className="text-xs font-semibold text-apple-gray-500 uppercase tracking-wider mb-2">En esta posición</p>
            <div className="space-y-2">
              {currentPlayers.map((p, i) => (
                <div key={p.playerId} className="flex items-center justify-between bg-white dark:bg-apple-gray-800 rounded-apple p-3 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-brand-green/20 flex items-center justify-center text-brand-green font-bold text-sm">
                      {i + 1}
                    </div>
                    <div>
                      <p className="font-medium text-sm text-apple-gray-800 dark:text-white">{p.playerName}</p>
                      <p className="text-xs text-apple-gray-500">{p.team} · Agregado por <span className="font-medium text-brand-green">{p.addedByName}</span></p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${(p.ggScore ?? 0) >= 60 ? 'text-emerald-500' : (p.ggScore ?? 0) >= 40 ? 'text-amber-500' : 'text-red-500'}`}>
                      {p.ggScore?.toFixed(1)}
                    </span>
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

        {/* Available players */}
        <div className="p-4 max-h-[50vh] overflow-y-auto">
          {!canAddMore ? (
            <p className="text-center text-apple-gray-500 py-4 text-sm">Máximo 3 jugadores por posición</p>
          ) : candidates.length === 0 ? (
            <p className="text-center text-apple-gray-500 py-8">No hay más jugadores disponibles</p>
          ) : (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-apple-gray-500 uppercase tracking-wider mb-2">Agregar jugador</p>
              {candidates.map((p, i) => (
                <button
                  key={`${p.Jugador}-${i}`}
                  onClick={() => onAddPlayer(p)}
                  className="w-full flex items-center gap-3 p-3 rounded-apple transition-all text-left hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 border border-transparent hover:border-apple-gray-200 dark:hover:border-apple-gray-600"
                >
                  <div className="w-8 h-8 rounded-lg bg-apple-gray-200 dark:bg-apple-gray-600 flex items-center justify-center text-sm font-bold text-apple-gray-600 dark:text-apple-gray-300">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-apple-gray-800 dark:text-white text-sm truncate">{p.Jugador}</p>
                    <p className="text-xs text-apple-gray-500 truncate">{p.Equipo} · {p.Edad} años</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${(p.ggScore ?? 0) >= 60 ? 'text-emerald-500' : (p.ggScore ?? 0) >= 40 ? 'text-amber-500' : 'text-red-500'}`}>
                      {p.ggScore?.toFixed(1)}
                    </p>
                    <p className="text-2xs text-apple-gray-400">{p.marketValueFormatted}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function FormationPage() {
  const { external, internal, loading: dataLoading } = useData()
  const { user, userDisplayName } = useAuth()
  const allPlayers = useMemo(() => [...external, ...internal], [external, internal])

  const [formation, setFormation] = useState('4-3-3')
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>([])
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

  // Load formations from Supabase
  useEffect(() => {
    async function load() {
      setLoadingFormations(true)
      const data = await fetchFormations(user?.id)
      setSavedFormations(data)
      setLoadingFormations(false)
    }
    load()
  }, [user?.id])

  const leagues = useMemo(() => {
    const set = new Set<string>()
    allPlayers.forEach(p => { if (p.Liga) set.add(p.Liga) })
    return sortLeaguesByPriority([...set])
  }, [allPlayers])

  const nationalities = useMemo(() => {
    const set = new Set<string>()
    allPlayers.forEach(p => {
      const nat = String(p['País de nacimiento'] || '')
      if (nat) set.add(nat)
    })
    return [...set].sort()
  }, [allPlayers])

  const currentFormation = FORMATIONS[formation]

  // Get all selected player IDs across all positions
  const allSelectedPlayerIds = useMemo(() => {
    const ids = new Set<string>()
    Object.values(positions).forEach(players => {
      players.forEach(p => ids.add(p.playerId))
    })
    return ids
  }, [positions])

  const handleAddPlayer = useCallback((posKey: string, player: EnrichedPlayer) => {
    if (!user) {
      setShowAuthModal(true)
      return
    }

    const newPlayer: PositionPlayer = {
      playerName: player.Jugador,
      playerId: player.Jugador,
      team: player.Equipo,
      ggScore: player.ggScore,
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

  if (dataLoading) return <LoadingSpinner fullScreen message="Cargando datos..." />

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-apple-gray-800 dark:text-white tracking-tight">
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

            <div>
              <label className="block text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mb-2">
                Ligas {selectedLeagues.length > 0 && <span className="text-brand-green">({selectedLeagues.length})</span>}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {leagues.map(l => (
                  <button
                    key={l}
                    onClick={() => setSelectedLeagues(prev =>
                      prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l]
                    )}
                    className={`px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                      selectedLeagues.includes(l)
                        ? 'bg-brand-green text-black font-medium'
                        : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
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
          <div className="bg-gradient-to-b from-emerald-600 to-emerald-700 rounded-2xl p-6 relative aspect-[3/4] w-full max-w-xl shadow-2xl">
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
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition-all ${
                      hasPlayers
                        ? 'bg-white text-apple-gray-900 ring-2 ring-white/50'
                        : 'bg-white/15 border-2 border-dashed border-white/50 text-white/80 hover:bg-white/25 hover:border-white/70'
                    }`}>
                      {hasPlayers ? (
                        <span className="text-xl font-bold">{playersInPos.length}</span>
                      ) : (
                        <span className="text-sm font-semibold">{pos.key}</span>
                      )}
                    </div>

                    {/* Player badges */}
                    {hasPlayers && (
                      <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-0.5">
                        {playersInPos.slice(0, 3).map((p, i) => (
                          <div
                            key={p.playerId}
                            className="whitespace-nowrap bg-white dark:bg-apple-gray-800 rounded-md px-2 py-0.5 shadow-md text-xs"
                          >
                            <span className="font-semibold text-apple-gray-800 dark:text-white">
                              {p.playerName.split(' ').slice(-1)[0]}
                            </span>
                            <span className={`ml-1.5 font-bold ${(p.ggScore ?? 0) >= 60 ? 'text-brand-green' : (p.ggScore ?? 0) >= 40 ? 'text-amber-500' : 'text-red-500'}`}>
                              {p.ggScore?.toFixed(0)}
                            </span>
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
          selectedLeagues={selectedLeagues}
          nationality={nationality}
          minAge={minAge}
          maxAge={maxAge}
          allPlayers={allPlayers}
          currentPlayers={positions[selectedPos] || []}
          allSelectedPlayerIds={allSelectedPlayerIds}
          onAddPlayer={(p) => handleAddPlayer(selectedPos, p)}
          onRemovePlayer={(id) => handleRemovePlayer(selectedPos, id)}
          onClose={() => setSelectedPos(null)}
          userName={userDisplayName}
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
