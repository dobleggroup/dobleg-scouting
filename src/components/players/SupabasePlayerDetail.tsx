import { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { usePlayerDetail, usePlayerMatchHistory, usePositionAverages } from '@/hooks/usePlayerStats'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import GaugeScore from '@/components/charts/GaugeScore'
import PositionBar from '@/components/ui/PositionBar'
import ScoreEvolutionChart from '@/components/charts/ScoreEvolutionChart'
import { getScoreColorClass, getScoreBgClass } from '@/components/ui/ScoreBar'
import type { Position, PlayerMatchStat } from '@/types/scoring'

function getAge(birthDate: string | null): number | null {
  if (!birthDate) return null
  const diff = Date.now() - new Date(birthDate).getTime()
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000))
}

export default function SupabasePlayerDetail() {
  const { id } = useParams<{ id: string }>()
  const playerId = id ? parseInt(id) : null
  const { data, loading } = usePlayerDetail(playerId)
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null)
  const { averages: positionAverages } = usePositionAverages()

  const activePosition = selectedPosition ?? data?.player?.primary_position ?? null
  const { matches } = usePlayerMatchHistory(playerId, activePosition ?? undefined)

  const activeScore = useMemo(() => {
    if (!data || !activePosition) return null
    return data.allSeasonScores.find(s => s.position === activePosition)
  }, [data, activePosition])

  const posAverage = useMemo(() => {
    if (!activeScore || !positionAverages.length) return null
    const avg = positionAverages.find(
      a => a.position === activeScore.position && a.league_id === activeScore.league_id
    )
    return avg?.avg_score ?? null
  }, [activeScore, positionAverages])

  if (loading) return <LoadingSpinner fullScreen message="Cargando ficha del jugador..." />

  if (!data) return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-8">
      <EmptyState title="Jugador no encontrado" description="No se encontró el jugador en la base de datos." icon="search" />
    </div>
  )

  const { player, allSeasonScores } = data
  const age = getAge(player.birth_date)

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 animate-fade-in">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-apple-gray-500 dark:text-apple-gray-400 mb-5">
        <Link to="/scouting" className="hover:text-brand-green transition-colors">
          Scout Externo
        </Link>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-apple-gray-800 dark:text-white font-medium">{player.name}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left sidebar */}
        <div className="lg:col-span-4 space-y-5">
          {/* Player card */}
          <div className="card-apple overflow-hidden">
            <div className="relative h-28 overflow-hidden rounded-t-apple-xl">
              <div className="absolute inset-0 bg-gradient-to-br from-brand-green/25 via-emerald-500/15 to-apple-gray-100/50 dark:to-apple-gray-800/50" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(34,197,94,0.2),transparent_60%)]" />
              {player.team?.logo && (
                <img src={player.team.logo} alt="" className="absolute right-4 top-4 w-16 h-16 object-contain opacity-20" />
              )}
            </div>
            <div className="relative px-5 pb-5">
              <div className="-mt-12 flex items-end gap-4 mb-4">
                {player.photo ? (
                  <img
                    src={player.photo}
                    alt={player.name}
                    className="w-20 h-20 rounded-2xl border-4 border-white dark:border-apple-gray-900 object-cover bg-apple-gray-100 dark:bg-apple-gray-800 shadow-lg"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-2xl border-4 border-white dark:border-apple-gray-900 bg-apple-gray-200 dark:bg-apple-gray-700 flex items-center justify-center shadow-lg">
                    <span className="text-2xl font-bold text-apple-gray-500">{player.name?.charAt(0)}</span>
                  </div>
                )}
                <div className="pb-1 min-w-0">
                  <h1 className="text-lg font-bold text-apple-gray-800 dark:text-white truncate">{player.name}</h1>
                  <div className="flex items-center gap-2 text-sm text-apple-gray-500">
                    {player.team?.logo && <img src={player.team.logo} alt="" className="w-4 h-4 object-contain" />}
                    <span className="truncate">{player.team?.name ?? 'Sin equipo'}</span>
                  </div>
                </div>
              </div>

              {/* Info pills */}
              <div className="flex flex-wrap gap-2 mb-4">
                {player.primary_position && (
                  <span className="px-2.5 py-1 rounded-lg bg-brand-green/10 text-brand-green text-xs font-semibold">
                    {player.primary_position}
                  </span>
                )}
                {age !== null && (
                  <span className="px-2.5 py-1 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-300 text-xs font-medium">
                    {age} años
                  </span>
                )}
                {player.nationality && (
                  <span className="px-2.5 py-1 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-300 text-xs font-medium">
                    {player.nationality}
                  </span>
                )}
                {player.height_cm && (
                  <span className="px-2.5 py-1 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-300 text-xs font-medium">
                    {player.height_cm} cm
                  </span>
                )}
              </div>

              {/* Score gauge */}
              <GaugeScore
                score={activeScore?.avg_score ?? null}
                scale="10"
                size="lg"
                comparisonScore={posAverage}
                comparisonLabel="Prom. posición"
              />
            </div>
          </div>

          {/* Position distribution */}
          {player.position_distribution && Object.keys(player.position_distribution).length > 0 && (
            <div className="card-apple p-5">
              <PositionBar
                distribution={player.position_distribution}
                selectedPosition={selectedPosition}
                onSelectPosition={setSelectedPosition}
              />
            </div>
          )}

          {/* Season stats summary */}
          {activeScore && (
            <div className="card-apple p-5">
              <h4 className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mb-3">
                Temporada {activeScore.season}
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <StatBox label="Partidos" value={activeScore.matches_played} />
                <StatBox label="Goles" value={activeScore.total_goals} />
                <StatBox label="Asistencias" value={activeScore.total_assists} />
                <StatBox label="Rating" value={activeScore.avg_rating?.toFixed(1) ?? '—'} />
                <StatBox label="Percentil Liga" value={activeScore.percentile !== null ? `${activeScore.percentile.toFixed(0)}%` : '—'} />
                <StatBox label="Percentil Global" value={activeScore.global_percentile !== null ? `${activeScore.global_percentile.toFixed(0)}%` : '—'} />
              </div>
            </div>
          )}

          {/* Other positions scores */}
          {allSeasonScores.length > 1 && (
            <div className="card-apple p-5">
              <h4 className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mb-3">
                Score por posición
              </h4>
              <div className="space-y-2">
                {allSeasonScores
                  .sort((a, b) => (b.avg_score ?? 0) - (a.avg_score ?? 0))
                  .map(s => (
                    <button
                      key={s.position}
                      onClick={() => setSelectedPosition(s.position)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all ${
                        activePosition === s.position
                          ? 'bg-brand-green/10 ring-1 ring-brand-green/30'
                          : 'hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-apple-gray-800 dark:text-white">{s.position}</span>
                        <span className="text-xs text-apple-gray-500">{s.matches_played} PJ</span>
                      </div>
                      {s.avg_score !== null && (
                        <span className={`text-sm font-bold tabular-nums ${getScoreColorClass(s.avg_score, '10')}`}>
                          {s.avg_score.toFixed(1)}
                        </span>
                      )}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Right content */}
        <div className="lg:col-span-8 space-y-5">
          {/* Score evolution chart */}
          {matches.length > 0 && (
            <div className="card-apple p-5">
              <ScoreEvolutionChart
                matches={matches}
                avgScore={activeScore?.avg_score ?? null}
              />
            </div>
          )}

          {/* Match history table */}
          <div className="card-apple overflow-hidden">
            <div className="px-5 py-3 border-b border-apple-gray-200 dark:border-apple-gray-700">
              <h3 className="text-sm font-semibold text-apple-gray-800 dark:text-white">
                Historial de partidos
                <span className="ml-2 text-xs font-normal text-apple-gray-500">
                  {matches.length} partidos
                </span>
              </h3>
            </div>
            {matches.length === 0 ? (
              <div className="p-8 text-center text-sm text-apple-gray-500">
                Sin partidos registrados para esta posición
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-apple-gray-100 dark:border-apple-gray-800">
                      <th className="text-left py-2.5 px-4 text-xs font-semibold text-apple-gray-500 uppercase tracking-wider">Fecha</th>
                      <th className="text-left py-2.5 px-3 text-xs font-semibold text-apple-gray-500 uppercase tracking-wider">Rival</th>
                      <th className="text-center py-2.5 px-3 text-xs font-semibold text-apple-gray-500 uppercase tracking-wider">Resultado</th>
                      <th className="text-center py-2.5 px-3 text-xs font-semibold text-apple-gray-500 uppercase tracking-wider">Min</th>
                      <th className="text-center py-2.5 px-3 text-xs font-semibold text-apple-gray-500 uppercase tracking-wider">Goles</th>
                      <th className="text-center py-2.5 px-3 text-xs font-semibold text-apple-gray-500 uppercase tracking-wider">Asist</th>
                      <th className="text-center py-2.5 px-3 text-xs font-semibold text-apple-gray-500 uppercase tracking-wider">Rating</th>
                      <th className="text-center py-2.5 px-3 text-xs font-semibold text-apple-gray-500 uppercase tracking-wider">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-apple-gray-100 dark:divide-apple-gray-800">
                    {[...matches].reverse().map(m => (
                      <MatchRow key={m.id} match={m} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-apple-gray-50 dark:bg-apple-gray-800/50 rounded-xl px-3 py-2.5 text-center">
      <p className="text-lg font-bold text-apple-gray-800 dark:text-white tabular-nums">{value}</p>
      <p className="text-[10px] text-apple-gray-500 uppercase tracking-wider">{label}</p>
    </div>
  )
}

function MatchRow({ match }: { match: PlayerMatchStat }) {
  const fixture = match.fixture
  if (!fixture) return null

  const isHome = match.team_id === fixture.home_team_id
  const rival = isHome ? fixture.away_team?.name : fixture.home_team?.name
  const result = `${fixture.score_home ?? '?'}-${fixture.score_away ?? '?'}`
  const date = new Date(fixture.date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
  const score = match.match_score

  return (
    <tr className="hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/30 transition-colors">
      <td className="py-2 px-4 text-xs text-apple-gray-600 dark:text-apple-gray-300">{date}</td>
      <td className="py-2 px-3 text-xs text-apple-gray-800 dark:text-white font-medium truncate max-w-[150px]">
        {isHome ? 'vs' : '@'} {rival ?? '—'}
      </td>
      <td className="py-2 px-3 text-center text-xs text-apple-gray-600 dark:text-apple-gray-300 tabular-nums">{result}</td>
      <td className="py-2 px-3 text-center text-xs text-apple-gray-600 dark:text-apple-gray-300 tabular-nums">{match.minutes}'</td>
      <td className="py-2 px-3 text-center text-xs text-apple-gray-600 dark:text-apple-gray-300 tabular-nums">{match.goals || '—'}</td>
      <td className="py-2 px-3 text-center text-xs text-apple-gray-600 dark:text-apple-gray-300 tabular-nums">{match.assists || '—'}</td>
      <td className="py-2 px-3 text-center text-xs text-apple-gray-600 dark:text-apple-gray-300 tabular-nums">{match.rating?.toFixed(1) ?? '—'}</td>
      <td className="py-2 px-3 text-center">
        {score !== null ? (
          <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold tabular-nums ${getScoreColorClass(score, '10')} ${getScoreBgClass(score, '10')}`}>
            {score.toFixed(1)}
          </span>
        ) : (
          <span className="text-apple-gray-400 text-xs">—</span>
        )}
      </td>
    </tr>
  )
}
