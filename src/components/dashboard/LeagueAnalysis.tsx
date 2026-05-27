import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LEAGUES,
  TIER_INFO,
  getLeagueInfo,
  getLeagueJumpOpportunities,
  analyzeContractOpportunity,
} from '@/constants/leagues'
import { getRelativeScoreColorClass, getRelativeScoreBgClass } from '@/components/ui/ScoreBar'
import { FILTER_POSITION_MAP } from '@/constants/scoring'
import { useData } from '@/context/DataContext'
import { useScoreLookup } from '@/hooks/usePlayerStats'
import { normalizeName } from '@/utils/scoring'
import type { EnrichedPlayer } from '@/types'

interface LeagueAnalysisProps {
  players: EnrichedPlayer[]
}

export default function LeagueAnalysis({ players }: LeagueAnalysisProps) {
  const navigate = useNavigate()
  const { positionAverages } = useData()
  const { lookup: scoreLookup } = useScoreLookup()

  function getScore(player: EnrichedPlayer): number | null {
    const entry = scoreLookup.get(normalizeName(player.Jugador))
    if (entry) return entry.score * 10
    return null
  }

  function getDisplayScore(player: EnrichedPlayer): number | null {
    const entry = scoreLookup.get(normalizeName(player.Jugador))
    return entry?.score ?? null
  }

  function getPosAvg(posicion: string): number | null {
    const normPos = FILTER_POSITION_MAP[posicion] ?? ''
    return normPos ? (positionAverages[normPos] ?? null) : null
  }

  // Analyze league distribution
  const leagueDistribution = useMemo(() => {
    const distribution: Record<number, { count: number; players: EnrichedPlayer[] }> = {
      1: { count: 0, players: [] },
      2: { count: 0, players: [] },
      3: { count: 0, players: [] },
      4: { count: 0, players: [] },
      5: { count: 0, players: [] },
      6: { count: 0, players: [] },
    }

    for (const player of players) {
      const leagueInfo = getLeagueInfo(player.Liga || '')
      const tier = leagueInfo?.tier || 6
      distribution[tier].count++
      distribution[tier].players.push(player)
    }

    return distribution
  }, [players])

  // Find best leap opportunities - only HIGH likelihood players
  const leapOpportunities = useMemo(() => {
    const opportunities: {
      player: EnrichedPlayer
      currentLeague: string
      currentTier: number
      targetLeague: string
      targetTier: number
      likelihood: 'high' | 'medium' | 'low'
      reason: string
      contractStatus: 'critical' | 'opportunity' | 'stable'
    }[] = []

    for (const player of players) {
      const score100 = getScore(player)
      if (!score100 || score100 < 50) continue

      const currentLeague = getLeagueInfo(player.Liga || '')
      if (!currentLeague || currentLeague.tier <= 2) continue

      const jumps = getLeagueJumpOpportunities(
        player.Liga || '',
        player.ageNum,
        score100
      )

      const contractAnalysis = analyzeContractOpportunity(
        player.monthsRemaining ?? null,
        currentLeague.tier,
        score100
      )

      for (const jump of jumps) {
        const isReady = jump.likelihood === 'high' ||
          (jump.likelihood === 'medium' && score100 >= 55)

        if (isReady) {
          opportunities.push({
            player,
            currentLeague: player.Liga || '',
            currentTier: currentLeague.tier,
            targetLeague: jump.league,
            targetTier: jump.info.tier,
            likelihood: jump.likelihood,
            reason: jump.reason,
            contractStatus: contractAnalysis.status,
          })
          break // Only one opportunity per player
        }
      }
    }

    // Sort by likelihood and tier improvement
    return opportunities
      .sort((a, b) => {
        const likelihoodOrder = { high: 0, medium: 1, low: 2 }
        const tierImproveA = a.currentTier - a.targetTier
        const tierImproveB = b.currentTier - b.targetTier
        if (likelihoodOrder[a.likelihood] !== likelihoodOrder[b.likelihood]) {
          return likelihoodOrder[a.likelihood] - likelihoodOrder[b.likelihood]
        }
        return tierImproveB - tierImproveA
      })
      .slice(0, 5)
  }, [players, scoreLookup])

  // Players ready for Europe - strict criteria
  // Must be in Sudamerica (tier 4-5), high score, good age
  const readyForEurope = useMemo(() => {
    return players
      .filter(p => {
        const league = getLeagueInfo(p.Liga || '')
        const s = getScore(p)
        return league &&
          league.tier >= 4 &&
          league.tier <= 5 &&
          s !== null &&
          s >= 55 &&
          p.ageNum <= 25
      })
      .sort((a, b) => (getScore(b) ?? 0) - (getScore(a) ?? 0))
      .slice(0, 4)
  }, [players, scoreLookup])

  const navigateToPlayer = (player: EnrichedPlayer) => {
    navigate(`/jugador/${encodeURIComponent(player.Jugador)}?source=interno`)
  }

  return (
    <div className="space-y-6">
      {/* League Tier Distribution */}
      <div className="bg-white dark:bg-apple-gray-800 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 p-5">
        <h3 className="font-semibold text-apple-gray-800 dark:text-white mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Distribucion por Nivel de Liga
        </h3>

        <div className="space-y-3">
          {Object.entries(TIER_INFO).map(([tier, info]) => {
            const tierNum = parseInt(tier)
            const data = leagueDistribution[tierNum]
            const percentage = players.length > 0 ? (data.count / players.length) * 100 : 0

            return (
              <div key={tier} className="group">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${info.bgColor} ${info.color}`}>
                      Tier {tier}
                    </span>
                    <span className="text-sm text-apple-gray-600 dark:text-apple-gray-400">
                      {info.name}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-apple-gray-800 dark:text-white">
                    {data.count}
                  </span>
                </div>
                <div className="h-2 bg-apple-gray-100 dark:bg-apple-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      tierNum === 1 ? 'bg-purple-500' :
                      tierNum === 2 ? 'bg-blue-500' :
                      tierNum === 3 ? 'bg-emerald-500' :
                      tierNum === 4 ? 'bg-amber-500' :
                      tierNum === 5 ? 'bg-orange-500' :
                      'bg-gray-400'
                    }`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <p className="text-2xs text-apple-gray-400 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {info.description}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Leap Opportunities */}
      {leapOpportunities.length > 0 && (
        <div className="bg-white dark:bg-apple-gray-800 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-apple-gray-100 dark:border-apple-gray-700 flex items-center justify-between">
            <h3 className="font-semibold text-apple-gray-800 dark:text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              Oportunidades de Salto
            </h3>
            <span className="text-xs text-apple-gray-500">Jugadores listos para subir de liga</span>
          </div>
          <div className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700">
            {leapOpportunities.map((opp, i) => {
              const targetLeague = LEAGUES[opp.targetLeague]
              return (
                <button
                  key={i}
                  onClick={() => navigateToPlayer(opp.player)}
                  className="w-full p-4 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    {opp.player.Imagen ? (
                      <img src={opp.player.Imagen} alt="" className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-apple-gray-200 dark:bg-apple-gray-700 flex items-center justify-center text-sm font-bold text-apple-gray-500">
                        {opp.player.Jugador.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-apple-gray-800 dark:text-white text-sm truncate">
                          {opp.player.Jugador}
                        </p>
                        {(() => {
                          const ds = getDisplayScore(opp.player)
                          return ds !== null ? (
                            <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${getRelativeScoreBgClass(ds, getPosAvg(opp.player['Posición']), '10')} ${getRelativeScoreColorClass(ds, getPosAvg(opp.player['Posición']), '10')}`}>
                              {ds.toFixed(1)}
                            </span>
                          ) : null
                        })()}
                      </div>
                      <p className="text-xs text-apple-gray-500 truncate">
                        {opp.player.ageNum} años · {opp.player.Equipo}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className={`px-1.5 py-0.5 rounded text-2xs font-medium ${TIER_INFO[opp.currentTier].bgColor} ${TIER_INFO[opp.currentTier].color}`}>
                          T{opp.currentTier}
                        </span>
                        <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                        <span className={`px-1.5 py-0.5 rounded text-2xs font-medium ${TIER_INFO[opp.targetTier].bgColor} ${TIER_INFO[opp.targetTier].color}`}>
                          T{opp.targetTier}
                        </span>
                      </div>
                      <p className="text-2xs text-apple-gray-500 mt-0.5">
                        {targetLeague?.flag} {opp.targetLeague}
                      </p>
                      <div className="flex items-center gap-1 mt-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          opp.likelihood === 'high' ? 'bg-emerald-500' :
                          opp.likelihood === 'medium' ? 'bg-amber-500' :
                          'bg-gray-400'
                        }`} />
                        <span className="text-2xs text-apple-gray-400">{opp.reason}</span>
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Ready for Europe */}
      {readyForEurope.length > 0 && (
        <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-xl border border-purple-200 dark:border-purple-800 p-5">
          <h3 className="font-semibold text-purple-800 dark:text-purple-200 mb-3 flex items-center gap-2">
            <span className="text-lg">🌍</span>
            Listos para Europa
          </h3>
          <p className="text-xs text-purple-600 dark:text-purple-400 mb-4">
            Jugadores en Sudamérica con perfil para dar el salto a Europa
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {readyForEurope.map((player, i) => {
              const league = getLeagueInfo(player.Liga || '')
              const jumps = getLeagueJumpOpportunities(
                player.Liga || '',
                player.ageNum,
                getScore(player) ?? 0
              )
              const bestJump = jumps[0]

              return (
                <button
                  key={i}
                  onClick={() => navigateToPlayer(player)}
                  className="flex items-center gap-3 p-3 bg-white/80 dark:bg-apple-gray-800/80 rounded-lg hover:bg-white dark:hover:bg-apple-gray-800 transition-colors text-left"
                >
                  {player.Imagen ? (
                    <img src={player.Imagen} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center text-sm font-bold text-purple-600 dark:text-purple-400">
                      {player.Jugador.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-apple-gray-800 dark:text-white text-sm truncate">
                      {player.Jugador}
                    </p>
                    <p className="text-xs text-apple-gray-500">
                      {player.ageNum} años · Score {getDisplayScore(player)?.toFixed(1) ?? '—'}
                    </p>
                    {bestJump && (
                      <p className="text-2xs text-purple-600 dark:text-purple-400 mt-0.5">
                        → {bestJump.info.flag} {bestJump.league}
                      </p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
