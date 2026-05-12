import { useState, useEffect, useMemo } from 'react'
import { useData } from '@/context/DataContext'
import {
  fetchRecentEvaluations,
  updateEvaluation,
  type ScoutEvaluation,
} from '@/services/scoutEvaluationService'
import { matchScore as sharedMatchScore } from '@/lib/search'

function findBestMatches(
  searchName: string,
  searchTeam: string | null,
  searchPosition: string | null,
  players: Array<{ id: string; name: string; team: string; position: string }>
): Array<{ player: typeof players[0]; score: number; reasons: string[] }> {
  const results: Array<{ player: typeof players[0]; score: number; reasons: string[] }> = []

  for (const player of players) {
    let score = sharedMatchScore(searchName, player.name)
    const reasons: string[] = []

    if (score < 10) continue

    if (score >= 50) reasons.push('Nombre similar')

    if (searchTeam && player.team) {
      const teamMatch = sharedMatchScore(searchTeam, player.team)
      if (teamMatch >= 50) {
        score += 20
        reasons.push('Mismo equipo')
      }
    }

    if (searchPosition && player.position) {
      const posMatch = sharedMatchScore(searchPosition, player.position)
      if (posMatch >= 50) {
        score += 10
        reasons.push('Misma posicion')
      }
    }

    if (reasons.length > 0 || score >= 30) {
      results.push({ player, score, reasons })
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 5)
}

export default function EvaluationsAdminPage() {
  const { external, internal } = useData()
  const [evaluations, setEvaluations] = useState<ScoutEvaluation[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedEval, setSelectedEval] = useState<ScoutEvaluation | null>(null)
  const [matchSearch, setMatchSearch] = useState('')
  const [matching, setMatching] = useState(false)
  const [filter, setFilter] = useState<'unmatched' | 'all'>('unmatched')

  // Load evaluations
  useEffect(() => {
    async function load() {
      setLoading(true)
      const data = await fetchRecentEvaluations(100)
      setEvaluations(data)
      setLoading(false)
    }
    load()
  }, [])

  // Combined player list
  const allPlayers = useMemo(() => {
    const players: Array<{ id: string; name: string; team: string; position: string }> = []

    external.forEach(p => {
      players.push({
        id: p.Jugador,
        name: p.Jugador,
        team: p.Equipo || '',
        position: String(p['Posicion'] || ''),
      })
    })

    internal.forEach(p => {
      if (!players.find(x => x.name === p.Jugador)) {
        players.push({
          id: p.Jugador,
          name: p.Jugador,
          team: p.Equipo || '',
          position: String(p['Posicion'] || ''),
        })
      }
    })

    return players
  }, [external, internal])

  // Filtered evaluations
  const filteredEvaluations = useMemo(() => {
    if (filter === 'unmatched') {
      return evaluations.filter(e => !e.player_id)
    }
    return evaluations
  }, [evaluations, filter])

  // Suggested matches for selected evaluation
  const suggestedMatches = useMemo(() => {
    if (!selectedEval) return []

    // First try with the search input, then with original name
    const searchTerm = matchSearch || selectedEval.player_name

    return findBestMatches(
      searchTerm,
      selectedEval.team,
      selectedEval.position,
      allPlayers
    )
  }, [selectedEval, matchSearch, allPlayers])

  // Handle match
  const handleMatch = async (playerId: string, playerName: string) => {
    if (!selectedEval) return

    setMatching(true)
    const success = await updateEvaluation(selectedEval.id, {
      player_id: playerId,
      player_name: playerName, // Update name to match DB
    })

    if (success) {
      setEvaluations(prev =>
        prev.map(e =>
          e.id === selectedEval.id
            ? { ...e, player_id: playerId, player_name: playerName }
            : e
        )
      )
      setSelectedEval(null)
      setMatchSearch('')
    }
    setMatching(false)
  }

  // Handle skip (mark as new player - keep unmatched)
  const handleSkip = () => {
    setSelectedEval(null)
    setMatchSearch('')
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-brand-green border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-apple-gray-900 dark:text-white mb-2">
            Evaluaciones de Scouts
          </h1>
          <p className="text-apple-gray-500 dark:text-apple-gray-400">
            Vincula las evaluaciones con los jugadores de la base de datos
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('unmatched')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              filter === 'unmatched'
                ? 'bg-amber-500 text-white'
                : 'bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-400'
            }`}
          >
            Sin vincular ({evaluations.filter(e => !e.player_id).length})
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              filter === 'all'
                ? 'bg-brand-green text-white'
                : 'bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-400'
            }`}
          >
            Todas ({evaluations.length})
          </button>
        </div>
      </div>

      {/* Evaluations list */}
      <div className="bg-white dark:bg-apple-gray-800 rounded-2xl shadow-sm overflow-hidden">
        {filteredEvaluations.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-apple-gray-500">
              {filter === 'unmatched'
                ? 'No hay evaluaciones sin vincular'
                : 'No hay evaluaciones'}
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-apple-gray-50 dark:bg-apple-gray-700/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase">
                  Jugador
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase">
                  Equipo / Partido
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-apple-gray-500 uppercase">
                  Scout
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-apple-gray-500 uppercase">
                  Score
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-apple-gray-500 uppercase">
                  Estado
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-apple-gray-500 uppercase">
                  Accion
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700">
              {filteredEvaluations.map(ev => (
                <tr
                  key={ev.id}
                  className="hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-apple-gray-900 dark:text-white">
                      {ev.player_name}
                    </div>
                    <div className="text-xs text-apple-gray-500">
                      {ev.position}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-apple-gray-700 dark:text-apple-gray-300">
                      {ev.team}
                    </div>
                    <div className="text-xs text-apple-gray-500">
                      vs {ev.rival} - {new Date(ev.match_date).toLocaleDateString('es-AR')}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-apple-gray-700 dark:text-apple-gray-300">
                      {ev.scout_name}
                    </div>
                    <div className="text-xs text-apple-gray-500">
                      {new Date(ev.created_at).toLocaleDateString('es-AR')}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {ev.technical_score && (
                      <span
                        className={`text-lg font-bold ${
                          ev.technical_score >= 8
                            ? 'text-brand-green'
                            : ev.technical_score >= 6
                            ? 'text-emerald-500'
                            : ev.technical_score >= 4
                            ? 'text-amber-500'
                            : 'text-red-500'
                        }`}
                      >
                        {ev.technical_score}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {ev.player_id ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-brand-green/10 text-brand-green text-xs font-medium">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Vinculado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/10 text-amber-500 text-xs font-medium">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Pendiente
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!ev.player_id && (
                      <button
                        onClick={() => {
                          setSelectedEval(ev)
                          setMatchSearch('')
                        }}
                        className="px-3 py-1.5 rounded-lg bg-brand-green text-white text-sm font-medium hover:bg-emerald-600 transition-colors"
                      >
                        Vincular
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Match modal */}
      {selectedEval && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleSkip}
          />

          <div className="relative bg-white dark:bg-apple-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden animate-scale-in">
            <div className="p-6 border-b border-apple-gray-200 dark:border-apple-gray-700">
              <h2 className="text-xl font-bold text-apple-gray-900 dark:text-white">
                Vincular evaluacion
              </h2>
              <p className="text-apple-gray-500 mt-1">
                Busca el jugador en la base de datos para vincular esta evaluacion
              </p>
            </div>

            <div className="p-6">
              {/* Evaluation info */}
              <div className="bg-apple-gray-50 dark:bg-apple-gray-700/50 rounded-xl p-4 mb-6">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-apple-gray-900 dark:text-white text-lg">
                      {selectedEval.player_name}
                    </div>
                    <div className="text-sm text-apple-gray-500 mt-1">
                      {selectedEval.team} - {selectedEval.position}
                    </div>
                    <div className="text-sm text-apple-gray-500">
                      Evaluado por {selectedEval.scout_name} el{' '}
                      {new Date(selectedEval.match_date).toLocaleDateString('es-AR')}
                    </div>
                  </div>
                  {selectedEval.technical_score && (
                    <div
                      className={`text-2xl font-bold ${
                        selectedEval.technical_score >= 8
                          ? 'text-brand-green'
                          : selectedEval.technical_score >= 6
                          ? 'text-emerald-500'
                          : selectedEval.technical_score >= 4
                          ? 'text-amber-500'
                          : 'text-red-500'
                      }`}
                    >
                      {selectedEval.technical_score}
                    </div>
                  )}
                </div>
              </div>

              {/* Search */}
              <div className="mb-4">
                <input
                  type="text"
                  value={matchSearch}
                  onChange={e => setMatchSearch(e.target.value)}
                  placeholder="Buscar jugador..."
                  className="w-full px-4 py-3 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-700 border border-apple-gray-200 dark:border-apple-gray-600 text-apple-gray-800 dark:text-white placeholder-apple-gray-400 focus:outline-none focus:border-brand-green"
                />
              </div>

              {/* Suggested matches */}
              <div className="space-y-2 max-h-64 overflow-auto">
                <p className="text-xs font-medium text-apple-gray-500 uppercase mb-2">
                  Sugerencias ({suggestedMatches.length})
                </p>

                {suggestedMatches.length === 0 ? (
                  <p className="text-sm text-apple-gray-500 py-4 text-center">
                    No se encontraron jugadores similares
                  </p>
                ) : (
                  suggestedMatches.map(({ player, score, reasons }) => (
                    <button
                      key={player.id}
                      onClick={() => handleMatch(player.id, player.name)}
                      disabled={matching}
                      className="w-full p-3 rounded-xl border border-apple-gray-200 dark:border-apple-gray-600 hover:border-brand-green hover:bg-brand-green/5 transition-colors text-left disabled:opacity-50"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-apple-gray-900 dark:text-white">
                            {player.name}
                          </div>
                          <div className="text-sm text-apple-gray-500">
                            {player.team} - {player.position}
                          </div>
                        </div>
                        <div className="text-right">
                          <div
                            className={`text-sm font-bold ${
                              score >= 70
                                ? 'text-brand-green'
                                : score >= 40
                                ? 'text-amber-500'
                                : 'text-apple-gray-400'
                            }`}
                          >
                            {score}% match
                          </div>
                          <div className="text-xs text-apple-gray-400">
                            {reasons.join(', ')}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="p-6 border-t border-apple-gray-200 dark:border-apple-gray-700 flex justify-between">
              <button
                onClick={handleSkip}
                className="px-4 py-2 rounded-xl text-apple-gray-600 dark:text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors"
              >
                Omitir (jugador nuevo)
              </button>
              <button
                onClick={handleSkip}
                className="px-4 py-2 rounded-xl bg-apple-gray-200 dark:bg-apple-gray-700 text-apple-gray-700 dark:text-apple-gray-300 hover:bg-apple-gray-300 dark:hover:bg-apple-gray-600 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
