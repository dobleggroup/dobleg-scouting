import { useState, useMemo, useCallback } from 'react'
import { useData } from '@/context/DataContext'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { FILTER_POSITION_MAP } from '@/constants/scoring'
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
  '4-1-4-1': {
    name: '4-1-4-1',
    positions: [
      { key: 'GK', x: 50, y: 92 },
      { key: 'LB', x: 15, y: 72 },
      { key: 'CB1', x: 35, y: 75 },
      { key: 'CB2', x: 65, y: 75 },
      { key: 'RB', x: 85, y: 72 },
      { key: 'CDM', x: 50, y: 60 },
      { key: 'LM', x: 15, y: 40 },
      { key: 'CM1', x: 38, y: 42 },
      { key: 'CM2', x: 62, y: 42 },
      { key: 'RM', x: 85, y: 40 },
      { key: 'ST', x: 50, y: 18 },
    ],
  },
}

// Maps formation position keys to specific position filters (respects left/right)
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

// For display in the modal header
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

interface SavedFormation {
  id: string
  name: string
  formation: string
  players: Record<string, EnrichedPlayer | null>
  createdAt: string
}

interface PlayerSelectorProps {
  positionKey: string
  league: string
  minAge: number
  maxAge: number
  allPlayers: EnrichedPlayer[]
  onSelect: (player: EnrichedPlayer) => void
  onClose: () => void
  currentPlayer: EnrichedPlayer | null
}

// Preferred foot for central defenders
const CB_FOOT_PREFERENCE: Record<string, string> = {
  'CB1': 'Izquierdo',  // Left CB prefers left-footed
  'CB2': 'Derecho',    // Right CB prefers right-footed
  'CB3': 'Derecho',    // Center/Right CB prefers right-footed
}

// Position type preference for midfielders
const MID_POSITION_PREFERENCE: Record<string, string[]> = {
  'CDM': ['Volante central', 'Pivote', 'Mediocentro defensivo'],
  'CDM1': ['Volante central', 'Pivote', 'Mediocentro defensivo'],
  'CDM2': ['Volante central', 'Pivote', 'Mediocentro defensivo'],
  'CM1': ['Volante interno', 'Mediapunta', 'Interior', 'Volante central'],
  'CM2': ['Volante central', 'Volante interno'],  // Central one can be either
  'CM3': ['Volante interno', 'Mediapunta', 'Interior', 'Volante central'],
  'CAM': ['Mediapunta', 'Volante interno', 'Interior'],
}

function PlayerSelector({ positionKey, league, minAge, maxAge, allPlayers, onSelect, onClose, currentPlayer }: PlayerSelectorProps) {
  const allowedPositions = POSITION_KEY_MAP[positionKey] || []
  const displayName = POSITION_DISPLAY_NAME[positionKey] || positionKey

  const candidates = useMemo(() => {
    const preferredFoot = CB_FOOT_PREFERENCE[positionKey]
    const preferredPositions = MID_POSITION_PREFERENCE[positionKey]

    return allPlayers
      .filter(p => {
        if (league && p.Liga !== league) return false
        // Age filter
        if (p.ageNum < minAge || p.ageNum > maxAge) return false
        const rawPos = (p['Posición específica'] || p['Posición'])?.trim() ?? ''
        const playerPosKey = FILTER_POSITION_MAP[rawPos] ?? ''
        return allowedPositions.includes(playerPosKey)
      })
      .filter(p => p.ggScore !== null)
      .map(p => {
        // Calculate priority bonus
        let priority = 0
        const foot = p.Pie?.trim() || ''
        const specificPos = (p['Posición específica'] || p['Posición'])?.trim() || ''

        // Foot preference for central defenders
        if (preferredFoot && foot.toLowerCase().includes(preferredFoot.toLowerCase())) {
          priority += 10
        }

        // Position preference for midfielders
        if (preferredPositions) {
          const posIndex = preferredPositions.findIndex(pref =>
            specificPos.toLowerCase().includes(pref.toLowerCase())
          )
          if (posIndex !== -1) {
            priority += (preferredPositions.length - posIndex) * 3
          }
        }

        return { ...p, _priority: priority }
      })
      .sort((a, b) => {
        // First sort by priority, then by score
        const priorityDiff = (b._priority || 0) - (a._priority || 0)
        if (priorityDiff !== 0) return priorityDiff
        return (b.ggScore ?? 0) - (a.ggScore ?? 0)
      })
      .slice(0, 10)
  }, [allPlayers, league, minAge, maxAge, allowedPositions, positionKey])

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in" onClick={onClose}>
      <div
        className="bg-white dark:bg-apple-gray-800 rounded-apple-xl shadow-apple-lg dark:shadow-apple-dark-md max-w-md w-full max-h-[80vh] overflow-hidden animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b border-apple-gray-200 dark:border-apple-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-apple-gray-800 dark:text-white">Seleccionar {displayName}</h3>
              <p className="text-xs text-apple-gray-500 mt-0.5">Top 10 por Score GG {league && `· ${league}`}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-apple-gray-400 hover:text-apple-gray-600 dark:hover:text-apple-gray-200 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="p-3 max-h-[60vh] overflow-y-auto">
          {candidates.length === 0 ? (
            <p className="text-center text-apple-gray-500 py-8">No hay jugadores para esta posición</p>
          ) : (
            <div className="space-y-1.5">
              {candidates.map((p, i) => {
                const foot = p.Pie?.trim() || ''
                const specificPos = (p['Posición específica'] || p['Posición'])?.trim() || ''
                const preferredFoot = CB_FOOT_PREFERENCE[positionKey]
                const isPreferredFoot = preferredFoot && foot.toLowerCase().includes(preferredFoot.toLowerCase())

                return (
                  <button
                    key={`${p.Jugador}-${i}`}
                    onClick={() => { onSelect(p); onClose() }}
                    className={`w-full flex items-center gap-3 p-3.5 rounded-apple transition-all text-left ${
                      currentPlayer?.Jugador === p.Jugador
                        ? 'bg-brand-green/15 border-2 border-brand-green'
                        : 'hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 border-2 border-transparent'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-lg bg-apple-gray-200 dark:bg-apple-gray-600 flex items-center justify-center text-sm font-bold text-apple-gray-600 dark:text-apple-gray-300">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-apple-gray-800 dark:text-white text-sm truncate">{p.Jugador}</p>
                      <p className="text-xs text-apple-gray-500 truncate">
                        {p.Equipo} · {p.Edad} años
                        {foot && <span className={isPreferredFoot ? ' font-medium text-brand-green' : ''}> · {
                          foot.toLowerCase() === 'derecho' || foot.toLowerCase() === 'right' ? 'Diestro' :
                          foot.toLowerCase() === 'izquierdo' || foot.toLowerCase() === 'left' ? 'Zurdo' :
                          foot.toLowerCase() === 'ambos' || foot.toLowerCase() === 'both' ? 'Ambos' : foot
                        }</span>}
                      </p>
                      {specificPos && <p className="text-2xs text-apple-gray-400 truncate">{specificPos}</p>}
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${(p.ggScore ?? 0) >= 60 ? 'text-emerald-500' : (p.ggScore ?? 0) >= 40 ? 'text-amber-500' : 'text-red-500'}`}>
                        {p.ggScore?.toFixed(1)}
                      </p>
                      <p className="text-2xs text-apple-gray-400">{p.marketValueFormatted}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        {currentPlayer && (
          <div className="p-3 border-t border-apple-gray-200 dark:border-apple-gray-700">
            <button
              onClick={() => { onSelect(null as any); onClose() }}
              className="w-full py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-apple font-medium transition-colors"
            >
              Quitar jugador
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function FormationPage() {
  const { external, internal, loading } = useData()
  const allPlayers = useMemo(() => [...external, ...internal], [external, internal])

  const [formation, setFormation] = useState('4-3-3')
  const [league, setLeague] = useState('')
  const [minAge, setMinAge] = useState(16)
  const [maxAge, setMaxAge] = useState(40)
  const [players, setPlayers] = useState<Record<string, EnrichedPlayer | null>>({})
  const [selectedPos, setSelectedPos] = useState<string | null>(null)
  const [savedFormations, setSavedFormations] = useState<SavedFormation[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('savedFormations') || '[]')
    } catch { return [] }
  })
  const [formationName, setFormationName] = useState('')
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [showLoadModal, setShowLoadModal] = useState(false)

  const leagues = useMemo(() => {
    const set = new Set<string>()
    allPlayers.forEach(p => { if (p.Liga) set.add(p.Liga) })
    return [...set].sort()
  }, [allPlayers])

  const currentFormation = FORMATIONS[formation]

  const handleSelectPlayer = useCallback((posKey: string, player: EnrichedPlayer | null) => {
    setPlayers(prev => ({ ...prev, [posKey]: player }))
  }, [])

  const clearFormation = () => {
    setPlayers({})
  }

  const saveFormation = () => {
    if (!formationName.trim()) return
    const newFormation: SavedFormation = {
      id: Date.now().toString(),
      name: formationName.trim(),
      formation,
      players: { ...players },
      createdAt: new Date().toISOString(),
    }
    const updated = [...savedFormations, newFormation]
    setSavedFormations(updated)
    localStorage.setItem('savedFormations', JSON.stringify(updated))
    setFormationName('')
    setShowSaveModal(false)
  }

  const loadFormation = (saved: SavedFormation) => {
    setFormation(saved.formation)
    setPlayers(saved.players)
    setShowLoadModal(false)
  }

  const deleteFormation = (id: string) => {
    const updated = savedFormations.filter(f => f.id !== id)
    setSavedFormations(updated)
    localStorage.setItem('savedFormations', JSON.stringify(updated))
  }

  const filledCount = Object.values(players).filter(Boolean).length

  if (loading) return <LoadingSpinner fullScreen message="Cargando datos..." />

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-apple-gray-800 dark:text-white tracking-tight">
            Constructor de Formaciones
          </h1>
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
            {filledCount}/11 posiciones · Toca una camiseta para ver opciones
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
            onClick={() => setShowSaveModal(true)}
            disabled={filledCount === 0}
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
        {/* Sidebar filters */}
        <aside className="w-full lg:w-60 flex-shrink-0">
          <div className="card-apple p-5 space-y-5 sticky top-[4rem]">
            <div>
              <label className="block text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mb-2">Formación</label>
              <select
                value={formation}
                onChange={e => { setFormation(e.target.value); setPlayers({}) }}
                className="input-apple"
              >
                {Object.keys(FORMATIONS).map(f => (
                  <option key={f} value={f}>{FORMATIONS[f].name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mb-2">Filtrar por Liga</label>
              <select
                value={league}
                onChange={e => setLeague(e.target.value)}
                className="input-apple"
              >
                <option value="">Todas las ligas</option>
                {leagues.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>

            {/* Age filter */}
            <div>
              <label className="block text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mb-2">
                Edad: {minAge} - {maxAge} años
              </label>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between text-xs text-apple-gray-500 mb-1">
                    <span>Mínima</span>
                    <span className="font-medium text-apple-gray-700 dark:text-apple-gray-200">{minAge}</span>
                  </div>
                  <input
                    type="range"
                    min="16"
                    max="40"
                    value={minAge}
                    onChange={e => {
                      const val = parseInt(e.target.value)
                      setMinAge(Math.min(val, maxAge - 1))
                    }}
                    className="w-full h-2 bg-apple-gray-200 dark:bg-apple-gray-700 rounded-lg appearance-none cursor-pointer accent-brand-green"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs text-apple-gray-500 mb-1">
                    <span>Máxima</span>
                    <span className="font-medium text-apple-gray-700 dark:text-apple-gray-200">{maxAge}</span>
                  </div>
                  <input
                    type="range"
                    min="16"
                    max="40"
                    value={maxAge}
                    onChange={e => {
                      const val = parseInt(e.target.value)
                      setMaxAge(Math.max(val, minAge + 1))
                    }}
                    className="w-full h-2 bg-apple-gray-200 dark:bg-apple-gray-700 rounded-lg appearance-none cursor-pointer accent-brand-green"
                  />
                </div>
                {/* Quick presets */}
                <div className="flex gap-1.5">
                  <button
                    onClick={() => { setMinAge(16); setMaxAge(21) }}
                    className={`flex-1 py-1.5 text-xs rounded-lg transition-all ${
                      minAge === 16 && maxAge === 21
                        ? 'bg-brand-green text-black font-medium'
                        : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600'
                    }`}
                  >
                    Sub-21
                  </button>
                  <button
                    onClick={() => { setMinAge(16); setMaxAge(23) }}
                    className={`flex-1 py-1.5 text-xs rounded-lg transition-all ${
                      minAge === 16 && maxAge === 23
                        ? 'bg-brand-green text-black font-medium'
                        : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600'
                    }`}
                  >
                    Sub-23
                  </button>
                  <button
                    onClick={() => { setMinAge(16); setMaxAge(40) }}
                    className={`flex-1 py-1.5 text-xs rounded-lg transition-all ${
                      minAge === 16 && maxAge === 40
                        ? 'bg-brand-green text-black font-medium'
                        : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600'
                    }`}
                  >
                    Todos
                  </button>
                </div>
              </div>
            </div>

            {/* Selected players list */}
            <div>
              <label className="block text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mb-2">Equipo ({filledCount}/11)</label>
              <div className="space-y-1 max-h-64 overflow-y-auto scrollbar-thin">
                {currentFormation.positions.map(pos => {
                  const player = players[pos.key]
                  return (
                    <div key={pos.key} className="flex items-center gap-2 text-xs py-1.5">
                      <span className="w-10 text-apple-gray-400 font-medium">{pos.key}</span>
                      {player ? (
                        <span className="text-apple-gray-800 dark:text-white truncate flex-1">{player.Jugador}</span>
                      ) : (
                        <span className="text-apple-gray-400 italic">Vacío</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </aside>

        {/* Field */}
        <div className="flex-1">
          <div className="bg-gradient-to-b from-emerald-600 to-emerald-700 rounded-apple-xl p-4 relative aspect-[3/4] max-w-lg mx-auto shadow-apple-lg">
            {/* Field markings */}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 130" preserveAspectRatio="none">
              <rect x="2" y="2" width="96" height="126" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" />
              <circle cx="50" cy="65" r="12" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.3" />
              <line x1="2" y1="65" x2="98" y2="65" stroke="rgba(255,255,255,0.4)" strokeWidth="0.3" />
              <rect x="20" y="2" width="60" height="20" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.3" />
              <rect x="30" y="2" width="40" height="8" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.3" />
              <rect x="20" y="108" width="60" height="20" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.3" />
              <rect x="30" y="120" width="40" height="8" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.3" />
              <circle cx="50" cy="15" r="0.8" fill="rgba(255,255,255,0.4)" />
              <circle cx="50" cy="115" r="0.8" fill="rgba(255,255,255,0.4)" />
            </svg>

            {/* Players */}
            {currentFormation.positions.map(pos => {
              const player = players[pos.key]
              return (
                <button
                  key={pos.key}
                  onClick={() => setSelectedPos(pos.key)}
                  className="absolute transform -translate-x-1/2 -translate-y-1/2 group"
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                >
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg ${
                    player
                      ? 'bg-white text-apple-gray-900'
                      : 'bg-white/20 border-2 border-dashed border-white/60 text-white hover:bg-white/30'
                  }`}>
                    {player ? (
                      <span className="text-[10px] font-bold text-center leading-tight px-1 truncate">
                        {player.Jugador.split(' ').slice(-1)[0]}
                      </span>
                    ) : (
                      <span className="text-xs font-medium">{pos.key}</span>
                    )}
                  </div>
                  {player && (
                    <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shadow-sm ${
                        (player.ggScore ?? 0) >= 60 ? 'bg-emerald-500' : (player.ggScore ?? 0) >= 40 ? 'bg-amber-500' : 'bg-red-500'
                      } text-white`}>
                        {player.ggScore?.toFixed(0)}
                      </span>
                    </div>
                  )}
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
          league={league}
          minAge={minAge}
          maxAge={maxAge}
          allPlayers={allPlayers}
          currentPlayer={players[selectedPos] || null}
          onSelect={(p) => handleSelectPlayer(selectedPos, p)}
          onClose={() => setSelectedPos(null)}
        />
      )}

      {/* Save modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in" onClick={() => setShowSaveModal(false)}>
          <div className="bg-white dark:bg-apple-gray-800 rounded-apple-xl p-6 max-w-sm w-full shadow-apple-lg animate-scale-in" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-apple-gray-800 dark:text-white mb-4">Guardar formación</h3>
            <input
              type="text"
              value={formationName}
              onChange={e => setFormationName(e.target.value)}
              placeholder="Nombre de la formación..."
              className="input-apple mb-4"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowSaveModal(false)} className="btn-apple-secondary flex-1">
                Cancelar
              </button>
              <button onClick={saveFormation} disabled={!formationName.trim()} className="btn-apple-primary flex-1 disabled:opacity-50">
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Load modal */}
      {showLoadModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in" onClick={() => setShowLoadModal(false)}>
          <div className="bg-white dark:bg-apple-gray-800 rounded-apple-xl max-w-md w-full max-h-[70vh] overflow-hidden shadow-apple-lg animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-apple-gray-200 dark:border-apple-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-bold text-apple-gray-800 dark:text-white">Formaciones guardadas</h3>
              <button onClick={() => setShowLoadModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg text-apple-gray-400 hover:text-apple-gray-600 dark:hover:text-apple-gray-200 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 max-h-[50vh] overflow-y-auto">
              {savedFormations.length === 0 ? (
                <p className="text-center text-apple-gray-500 py-8">No hay formaciones guardadas</p>
              ) : (
                <div className="space-y-2">
                  {savedFormations.map(f => (
                    <div key={f.id} className="flex items-center justify-between p-4 bg-apple-gray-50 dark:bg-apple-gray-700 rounded-apple">
                      <div>
                        <p className="font-medium text-apple-gray-800 dark:text-white text-sm">{f.name}</p>
                        <p className="text-xs text-apple-gray-500">{f.formation} · {Object.values(f.players).filter(Boolean).length} jugadores</p>
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={() => loadFormation(f)} className="px-3 py-1.5 text-xs bg-brand-green text-black font-medium rounded-lg hover:bg-green-400 transition-colors">
                          Cargar
                        </button>
                        <button onClick={() => deleteFormation(f.id)} className="w-8 h-8 flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
