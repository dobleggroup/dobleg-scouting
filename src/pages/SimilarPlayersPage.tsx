import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '@/context/DataContext'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import ScoreBar from '@/components/ui/ScoreBar'
import CopyChartButton from '@/components/ui/CopyChartButton'
import { POSITION_MAP, SCORING_CONFIG } from '@/constants/scoring'
import { smartSearch } from '@/lib/search'
import type { EnrichedPlayer } from '@/types'

const STORAGE_KEY = 'similar-players-state'

function getPlayerPosition(p: EnrichedPlayer): string {
  const rawPos = (p['Posición específica'] || p['Posición'])?.trim() ?? ''
  return POSITION_MAP[rawPos] ?? ''
}

function getMetricValue(player: EnrichedPlayer, metric: string): number {
  const val = player[metric]
  if (typeof val === 'number') return val
  if (typeof val === 'string') {
    const num = parseFloat(val.replace(',', '.').replace('%', ''))
    return isNaN(num) ? 0 : num
  }
  return 0
}

function computeSimilarity(
  target: EnrichedPlayer,
  candidate: EnrichedPlayer,
  metrics: { column: string; weight: number }[]
): number {
  // Calculate weighted Euclidean distance, then convert to similarity
  let sumWeightedSquares = 0
  let totalWeight = 0

  for (const m of metrics) {
    const targetVal = getMetricValue(target, m.column)
    const candidateVal = getMetricValue(candidate, m.column)

    // Normalize by max of the two values to get relative difference
    const maxVal = Math.max(Math.abs(targetVal), Math.abs(candidateVal), 1)
    const normalizedDiff = (targetVal - candidateVal) / maxVal

    sumWeightedSquares += m.weight * normalizedDiff * normalizedDiff
    totalWeight += m.weight
  }

  const distance = Math.sqrt(sumWeightedSquares / totalWeight)
  // Convert distance to similarity (0-100 scale)
  const similarity = Math.max(0, 100 - distance * 100)
  return similarity
}

function findSimilarPlayers(
  target: EnrichedPlayer,
  allPlayers: EnrichedPlayer[],
  count: number = 10
): { player: EnrichedPlayer; similarity: number }[] {
  const targetPos = getPlayerPosition(target)
  const metrics = SCORING_CONFIG[targetPos] || []

  if (metrics.length === 0) {
    // Fallback: use a generic set of metrics
    return []
  }

  // Filter players with same position, excluding the target
  const candidates = allPlayers.filter(p => {
    if (p.Jugador === target.Jugador && p.Equipo === target.Equipo) return false
    const pos = getPlayerPosition(p)
    return pos === targetPos
  })

  // Calculate similarity for each candidate
  const withSimilarity = candidates.map(candidate => ({
    player: candidate,
    similarity: computeSimilarity(target, candidate, metrics),
  }))

  // Sort by similarity (highest first)
  withSimilarity.sort((a, b) => b.similarity - a.similarity)

  return withSimilarity.slice(0, count)
}

export default function SimilarPlayersPage() {
  const { external, internal, loading, error } = useData()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState<EnrichedPlayer | null>(null)
  const [restored, setRestored] = useState(false)

  // Combine all players for search
  const allPlayers = useMemo(() => [...external, ...internal], [external, internal])

  // Restore state from sessionStorage on mount
  useEffect(() => {
    if (restored || allPlayers.length === 0) return

    try {
      const saved = sessionStorage.getItem(STORAGE_KEY)
      if (saved) {
        const { searchText, playerName, playerTeam } = JSON.parse(saved)
        if (searchText) setSearch(searchText)
        if (playerName && playerTeam) {
          const player = allPlayers.find(p => p.Jugador === playerName && p.Equipo === playerTeam)
          if (player) setSelectedPlayer(player)
        }
      }
    } catch (e) {
      // Ignore errors
    }
    setRestored(true)
  }, [allPlayers, restored])

  // Save state to sessionStorage when it changes
  useEffect(() => {
    if (!restored) return

    const state = {
      searchText: search,
      playerName: selectedPlayer?.Jugador || null,
      playerTeam: selectedPlayer?.Equipo || null,
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [search, selectedPlayer, restored])

  // Filter players for dropdown
  const searchResults = useMemo(() => {
    if (!search.trim()) return []
    return smartSearch(allPlayers, search, p => `${p.Jugador} ${p.Equipo || ''}`, 10)
  }, [allPlayers, search])

  // Find similar players when one is selected
  const similarPlayers = useMemo(() => {
    if (!selectedPlayer) return []
    return findSimilarPlayers(selectedPlayer, allPlayers, 10)
  }, [selectedPlayer, allPlayers])

  const selectedPosition = selectedPlayer ? getPlayerPosition(selectedPlayer) : ''

  if (loading) return <LoadingSpinner fullScreen message="Cargando jugadores..." />
  if (error) return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-8">
      <EmptyState title="Error al cargar datos" description={error} icon="error" />
    </div>
  )

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-apple-gray-800 dark:text-white tracking-tight">
          Jugadores Similares
        </h1>
        <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-1">
          Busca un jugador para encontrar los 10 más similares según su posición y métricas futbolísticas
        </p>
      </div>

      {/* Search */}
      <div className="card-apple p-6 mb-6">
        <label className="block text-sm font-medium text-apple-gray-700 dark:text-apple-gray-300 mb-2">
          Seleccionar jugador
        </label>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar jugador por nombre..."
            value={search}
            onChange={e => {
              setSearch(e.target.value)
              if (!e.target.value.trim()) setSelectedPlayer(null)
            }}
            className="input-apple pl-10 pr-4 w-full max-w-md"
          />
          {/* Dropdown results */}
          {searchResults.length > 0 && !selectedPlayer && (
            <div className="absolute z-20 mt-1 w-full max-w-md bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 rounded-xl shadow-lg overflow-hidden">
              {searchResults.map(p => (
                <button
                  key={`${p.Jugador}-${p.Equipo}`}
                  onClick={() => {
                    setSelectedPlayer(p)
                    setSearch(p.Jugador)
                  }}
                  className="w-full px-4 py-3 text-left hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700 transition-colors flex items-center gap-3"
                >
                  {p.Imagen ? (
                    <img src={p.Imagen} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-apple-gray-200 dark:bg-apple-gray-600 flex items-center justify-center text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300">
                      {p.Jugador.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-apple-gray-800 dark:text-white truncate">{p.Jugador}</div>
                    <div className="text-xs text-apple-gray-500 dark:text-apple-gray-400 truncate">
                      {p.Equipo} · {p['Posición']} · {p.Liga}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Selected player card */}
      {selectedPlayer && (
        <div className="card-apple p-6 mb-6">
          <div className="flex items-center gap-4">
            {selectedPlayer.Imagen ? (
              <img src={selectedPlayer.Imagen} alt="" className="w-16 h-16 rounded-full object-cover" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-brand-green/20 flex items-center justify-center text-xl font-semibold text-brand-green">
                {selectedPlayer.Jugador.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="flex-1">
              <h2 className="text-xl font-bold text-apple-gray-800 dark:text-white">{selectedPlayer.Jugador}</h2>
              <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">
                {selectedPlayer.Equipo} · {selectedPosition || selectedPlayer['Posición']} · {selectedPlayer.Liga}
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-apple-gray-500 dark:text-apple-gray-400 mb-1">Score GG</div>
              <ScoreBar score={selectedPlayer.ggScore} size="sm" />
            </div>
            <button
              onClick={() => {
                setSelectedPlayer(null)
                setSearch('')
              }}
              className="p-2 text-apple-gray-400 hover:text-apple-gray-600 dark:hover:text-apple-gray-200 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Similar players results */}
      {selectedPlayer && (
        <div id="similar-players-container" className="card-apple overflow-hidden">
          <div className="px-6 py-4 border-b border-apple-gray-200/50 dark:border-apple-gray-700/50 bg-apple-gray-50 dark:bg-apple-gray-800/50 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-apple-gray-800 dark:text-white">
                10 Jugadores más similares
              </h3>
              <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
                Basado en métricas de rendimiento para {selectedPosition || 'la posición'}
              </p>
            </div>
            <CopyChartButton targetId="similar-players-container" filename={`similares_${selectedPlayer.Jugador.replace(/\s+/g,'_')}`} />
          </div>

          {similarPlayers.length === 0 ? (
            <div className="p-8 text-center text-apple-gray-500 dark:text-apple-gray-400">
              No se encontraron jugadores similares para esta posición.
            </div>
          ) : (
            <div className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700/50">
              {similarPlayers.map(({ player, similarity }, index) => (
                <button
                  key={`${player.Jugador}-${player.Equipo}`}
                  onClick={() => {
                    const encoded = encodeURIComponent(player.Jugador)
                    navigate(`/jugador/${encoded}?source=${player.source}`)
                  }}
                  className="w-full px-6 py-4 flex items-center gap-4 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/50 transition-colors text-left"
                >
                  {/* Rank */}
                  <div className="w-8 h-8 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700 flex items-center justify-center text-sm font-semibold text-apple-gray-600 dark:text-apple-gray-300">
                    {index + 1}
                  </div>

                  {/* Player image */}
                  {player.Imagen ? (
                    <img src={player.Imagen} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-apple-gray-200 dark:bg-apple-gray-600 flex items-center justify-center text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300">
                      {player.Jugador.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                  )}

                  {/* Player info */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-apple-gray-800 dark:text-white truncate">{player.Jugador}</div>
                    <div className="text-xs text-apple-gray-500 dark:text-apple-gray-400 truncate">
                      {player.Equipo} · {player.Liga}
                    </div>
                  </div>

                  {/* Market value */}
                  <div className="text-right hidden sm:block">
                    <div className="text-xs text-apple-gray-400 dark:text-apple-gray-500">Valor</div>
                    <div className="text-sm font-medium text-apple-gray-700 dark:text-apple-gray-200">
                      {player.marketValueFormatted || '—'}
                    </div>
                  </div>

                  {/* Score */}
                  <div className="w-24">
                    <ScoreBar score={player.ggScore} size="md" />
                  </div>

                  {/* Similarity */}
                  <div className="w-20 text-right">
                    <div className="text-xs text-apple-gray-400 dark:text-apple-gray-500">Similitud</div>
                    <div className={`text-sm font-bold ${
                      similarity >= 80 ? 'text-emerald-500' :
                      similarity >= 60 ? 'text-amber-500' :
                      'text-orange-500'
                    }`}>
                      {similarity.toFixed(0)}%
                    </div>
                  </div>

                  {/* Arrow */}
                  <svg className="w-4 h-4 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!selectedPlayer && (
        <div className="card-apple p-12 text-center">
          <svg className="w-16 h-16 mx-auto text-apple-gray-300 dark:text-apple-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <h3 className="text-lg font-semibold text-apple-gray-700 dark:text-apple-gray-300 mb-2">
            Busca un jugador
          </h3>
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 max-w-md mx-auto">
            Escribe el nombre de un jugador para encontrar otros con características similares basándose en sus métricas de rendimiento.
          </p>
        </div>
      )}
    </div>
  )
}
