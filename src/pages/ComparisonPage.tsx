import { useState, useMemo } from 'react'
import { useData } from '@/context/DataContext'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import ComparisonView from '@/components/comparison/ComparisonView'
import { exportComparisonToPdf } from '@/utils/pdfExport'
import { smartSearch } from '@/lib/search'
import type { EnrichedPlayer } from '@/types'

const PLAYER_COLORS = ['#22C55E', '#3B82F6', '#F59E0B']

interface PlayerSearchProps {
  players: EnrichedPlayer[]
  selected: EnrichedPlayer | null
  onSelect: (p: EnrichedPlayer | null) => void
  color: string
  label: string
  leagues: string[]
}

function PlayerSearch({ players, selected, onSelect, color, label, leagues }: PlayerSearchProps) {
  const [searchMode, setSearchMode] = useState<'search' | 'filter'>('search')
  const [searchText, setSearchText] = useState('')
  const [leagueFilter, setLeagueFilter] = useState('')
  const [teamFilter, setTeamFilter] = useState('')
  const [posFilter, setPosFilter] = useState('')
  const [playerFilter, setPlayerFilter] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)

  // Search results (direct name search) - using smart search
  const searchResults = useMemo(() => {
    return smartSearch(players, searchText, p => `${p.Jugador} ${p.Equipo}`, 10)
  }, [players, searchText])

  // Filtered teams based on league selection
  const filteredTeams = useMemo(() => {
    if (!leagueFilter) return []
    const set = new Set<string>()
    players.filter(p => p.Liga === leagueFilter).forEach(p => { if (p.Equipo) set.add(p.Equipo) })
    return [...set].sort()
  }, [players, leagueFilter])

  // Filtered positions based on league and team
  const filteredPositions = useMemo(() => {
    const set = new Set<string>()
    players
      .filter(p => (!leagueFilter || p.Liga === leagueFilter) && (!teamFilter || p.Equipo === teamFilter))
      .forEach(p => { if (p['Posición']) set.add(p['Posición']) })
    return [...set].sort()
  }, [players, leagueFilter, teamFilter])

  // Filtered players based on all filters
  const filteredPlayers = useMemo(() => {
    return players.filter(p => {
      if (leagueFilter && p.Liga !== leagueFilter) return false
      if (teamFilter && p.Equipo !== teamFilter) return false
      if (posFilter && p['Posición'] !== posFilter) return false
      return true
    }).sort((a, b) => (b.ggScore ?? 0) - (a.ggScore ?? 0))
  }, [players, leagueFilter, teamFilter, posFilter])

  const handleSelectPlayer = (jugador: string) => {
    if (!jugador) { onSelect(null); setPlayerFilter(''); return }
    const player = filteredPlayers.find(p => p.Jugador === jugador)
    if (player) onSelect(player)
    setPlayerFilter(jugador)
  }

  const handleSearchSelect = (player: EnrichedPlayer) => {
    onSelect(player)
    setSearchText('')
    setShowDropdown(false)
  }

  const resetFilters = () => {
    setLeagueFilter('')
    setTeamFilter('')
    setPosFilter('')
    setPlayerFilter('')
    setSearchText('')
  }

  return (
    <div className="space-y-3">
      <label className="block text-xs font-semibold uppercase tracking-wider" style={{ color }}>{label}</label>

      {selected ? (
        <div
          className="flex items-center justify-between p-4 rounded-apple-lg border-2 bg-white dark:bg-apple-gray-800 shadow-apple dark:shadow-apple-dark transition-all"
          style={{ borderColor: color + '60' }}
        >
          <div className="flex items-center gap-3">
            {selected.Imagen ? (
              <img src={selected.Imagen} alt="" className="w-10 h-10 rounded-lg object-cover" />
            ) : (
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                style={{ backgroundColor: color }}
              >
                {selected.Jugador.split(' ').map(w => w[0]).slice(0, 2).join('')}
              </div>
            )}
            <div>
              <p className="font-semibold text-apple-gray-800 dark:text-white text-sm">{selected.Jugador}</p>
              <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400">{selected.Equipo} · {selected['Posición']}</p>
            </div>
          </div>
          <button
            onClick={() => { onSelect(null); resetFilters() }}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-apple-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {/* Mode toggle */}
          <div className="flex gap-1 bg-apple-gray-100 dark:bg-apple-gray-700 rounded-lg p-1">
            <button
              onClick={() => setSearchMode('search')}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                searchMode === 'search'
                  ? 'bg-white dark:bg-apple-gray-600 text-apple-gray-800 dark:text-white shadow-sm'
                  : 'text-apple-gray-500 dark:text-apple-gray-400'
              }`}
            >
              Buscar
            </button>
            <button
              onClick={() => setSearchMode('filter')}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                searchMode === 'filter'
                  ? 'bg-white dark:bg-apple-gray-600 text-apple-gray-800 dark:text-white shadow-sm'
                  : 'text-apple-gray-500 dark:text-apple-gray-400'
              }`}
            >
              Filtrar
            </button>
          </div>

          {searchMode === 'search' ? (
            /* Direct search mode */
            <div className="relative">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Escribir nombre del jugador..."
                  value={searchText}
                  onChange={e => { setSearchText(e.target.value); setShowDropdown(true) }}
                  onFocus={() => setShowDropdown(true)}
                  className="input-apple pl-9 pr-4 w-full"
                  style={{ borderColor: searchText ? color : undefined }}
                />
              </div>
              {/* Search results dropdown */}
              {showDropdown && searchResults.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 rounded-xl shadow-lg overflow-hidden">
                  {searchResults.map(p => (
                    <button
                      key={`${p.Jugador}-${p.Equipo}`}
                      onClick={() => handleSearchSelect(p)}
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
                        <div className="font-medium text-apple-gray-800 dark:text-white text-sm truncate">{p.Jugador}</div>
                        <div className="text-xs text-apple-gray-500 dark:text-apple-gray-400 truncate">
                          {p.Equipo} · {p['Posición']}
                        </div>
                      </div>
                      <div className="text-xs font-semibold" style={{ color }}>
                        {p.ggScore?.toFixed(1) ?? '—'}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Filter mode */
            <>
              <select
                value={leagueFilter}
                onChange={e => { setLeagueFilter(e.target.value); setTeamFilter(''); setPosFilter(''); setPlayerFilter('') }}
                className="input-apple text-sm"
              >
                <option value="">1. Seleccionar liga...</option>
                {leagues.map(l => <option key={l} value={l}>{l}</option>)}
              </select>

              {leagueFilter && (
                <select
                  value={teamFilter}
                  onChange={e => { setTeamFilter(e.target.value); setPosFilter(''); setPlayerFilter('') }}
                  className="input-apple text-sm"
                >
                  <option value="">2. Todos los equipos ({filteredTeams.length})</option>
                  {filteredTeams.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              )}

              {leagueFilter && (
                <select
                  value={posFilter}
                  onChange={e => { setPosFilter(e.target.value); setPlayerFilter('') }}
                  className="input-apple text-sm"
                >
                  <option value="">3. Todas las posiciones</option>
                  {filteredPositions.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              )}

              {leagueFilter && (
                <select
                  value={playerFilter}
                  onChange={e => handleSelectPlayer(e.target.value)}
                  className="w-full px-3.5 py-3 text-sm bg-white dark:bg-apple-gray-800 border-2 rounded-apple-lg font-medium dark:text-white transition-all focus:outline-none"
                  style={{ borderColor: color }}
                >
                  <option value="">4. Seleccionar jugador ({filteredPlayers.length})</option>
                  {filteredPlayers.slice(0, 50).map((p, i) => (
                    <option key={`${p.Jugador}-${i}`} value={p.Jugador}>
                      {p.Jugador} ({p.ggScore?.toFixed(1) ?? '—'}) - {p.Equipo}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function ComparisonPage() {
  const { external, internal, normalized, loading } = useData()
  const allPlayers = useMemo(() => [...external, ...internal], [external, internal])

  const leagues = useMemo(() => {
    const set = new Set<string>()
    allPlayers.forEach(p => { if (p.Liga) set.add(p.Liga) })
    return [...set].sort()
  }, [allPlayers])

  const [playerA, setPlayerA] = useState<EnrichedPlayer | null>(null)
  const [playerB, setPlayerB] = useState<EnrichedPlayer | null>(null)
  const [playerC, setPlayerC] = useState<EnrichedPlayer | null>(null)
  const [showC, setShowC] = useState(false)
  const [exporting, setExporting] = useState(false)

  const activePlayers = [playerA, playerB, ...(showC && playerC ? [playerC] : [])].filter(Boolean) as EnrichedPlayer[]
  const canCompare = activePlayers.length >= 2

  const handleExport = async () => {
    setExporting(true)
    try {
      await exportComparisonToPdf(activePlayers.map(p => p.Jugador))
    } finally {
      setExporting(false)
    }
  }

  if (loading) return <LoadingSpinner fullScreen message="Cargando datos para comparación..." />

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-apple-gray-800 dark:text-white tracking-tight">
            Comparación de Jugadores
          </h1>
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
            Selecciona 2 o 3 jugadores para comparar
          </p>
        </div>
        {canCompare && (
          <button
            onClick={handleExport}
            disabled={exporting}
            className="btn-apple-primary disabled:opacity-50"
          >
            {exporting ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            )}
            Exportar PDF
          </button>
        )}
      </div>

      {/* Player selectors */}
      <div className="card-apple p-6 mb-6">
        <div className="flex flex-wrap items-start gap-5">
          <div className="flex-1 min-w-[240px]">
            <PlayerSearch
              players={allPlayers}
              selected={playerA}
              onSelect={setPlayerA}
              color={PLAYER_COLORS[0]}
              label="Jugador A"
              leagues={leagues}
            />
          </div>
          <div className="flex-shrink-0 text-2xl font-bold text-apple-gray-300 dark:text-apple-gray-600 pt-8">VS</div>
          <div className="flex-1 min-w-[240px]">
            <PlayerSearch
              players={allPlayers}
              selected={playerB}
              onSelect={setPlayerB}
              color={PLAYER_COLORS[1]}
              label="Jugador B"
              leagues={leagues}
            />
          </div>
          {showC && (
            <>
              <div className="flex-shrink-0 text-2xl font-bold text-apple-gray-300 dark:text-apple-gray-600 pt-8">VS</div>
              <div className="flex-1 min-w-[240px]">
                <PlayerSearch
                  players={allPlayers}
                  selected={playerC}
                  onSelect={setPlayerC}
                  color={PLAYER_COLORS[2]}
                  label="Jugador C"
                  leagues={leagues}
                />
              </div>
            </>
          )}
          <div className="flex flex-col gap-2 pt-8">
            {!showC && (
              <button
                onClick={() => setShowC(true)}
                className="btn-apple-secondary text-brand-green border-brand-green hover:bg-brand-green/10"
              >
                + 3er jugador
              </button>
            )}
            {showC && !playerC && (
              <button
                onClick={() => { setShowC(false); setPlayerC(null) }}
                className="text-sm text-apple-gray-400 hover:text-red-500 transition-colors"
              >
                Quitar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Comparison content */}
      {canCompare ? (
        <div id="comparison-content" className="animate-fade-in">
          <ComparisonView
            players={activePlayers}
            allNormalized={normalized}
            allPlayers={allPlayers}
          />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
          <div className="w-20 h-20 bg-apple-gray-100 dark:bg-apple-gray-800 rounded-2xl flex items-center justify-center mb-5 shadow-apple dark:shadow-apple-dark">
            <svg className="w-10 h-10 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-apple-gray-800 dark:text-white mb-1.5">
            Selecciona al menos 2 jugadores
          </h3>
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 max-w-sm leading-relaxed">
            Busca y selecciona los jugadores que quieres comparar usando los campos de búsqueda de arriba.
          </p>
        </div>
      )}
    </div>
  )
}
