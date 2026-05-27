import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '@/context/DataContext'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { getRelativeScoreColorClass, getRelativeScoreBgClass } from '@/components/ui/ScoreBar'
import type { ScoreScale } from '@/components/ui/ScoreBar'
import { FILTER_POSITION_MAP } from '@/constants/scoring'
import { displayPosition } from '@/types/scoring'
import { normalizeName } from '@/utils/scoring'
import { useScoreLookup } from '@/hooks/usePlayerStats'
import type { EnrichedPlayer } from '@/types'

interface Opportunity {
  player: EnrichedPlayer
  type: 'contract' | 'undervalued' | 'young_talent' | 'bargain'
  score: number
  reasons: string[]
  playerScore: number
  playerScoreScale: ScoreScale
}

/** Normalize a raw score to the 0-100 range for comparison logic, regardless of original scale. */
function toScale100(score: number, scale: ScoreScale): number {
  return scale === '10' ? score * 10 : score
}

function calculateOpportunities(
  players: EnrichedPlayer[],
  getPlayerScore: (player: EnrichedPlayer) => { score: number | null; scale: ScoreScale },
): Opportunity[] {
  const opportunities: Opportunity[] = []

  for (const player of players) {
    const { score: rawScore, scale } = getPlayerScore(player)
    if (rawScore === null) continue
    const score = toScale100(rawScore, scale)

    const minScore = 45
    if (score < minScore) continue
    if (player.minutesPlayed < 400) continue

    const age = player.ageNum
    const value = player.marketValueRaw
    const monthsRemaining = player.monthsRemaining
    const league = player.Liga || ''
    const isArgentina = league.toLowerCase().includes('argentina')
    const reasons: string[] = []
    let oppScore = 0

    // 1. Contract expiring soon (< 6 months) + good player
    if (monthsRemaining !== null && monthsRemaining <= 6 && monthsRemaining >= 0 && score >= 50) {
      oppScore += 50
      reasons.push(`Contrato vence en ${monthsRemaining} meses`)
    }

    // 2. Undervalued: HIGH score with LOW value
    // Argentina has higher values, so adjust thresholds
    const lowValueThresholdElite = isArgentina ? 1_500_000 : 500_000
    const lowValueThresholdGood = isArgentina ? 800_000 : 250_000

    if (score >= 65 && value > 0 && value <= lowValueThresholdElite) {
      oppScore += 50
      reasons.push(`Score ${rawScore.toFixed(1)} a solo ${formatValue(value)}`)
    } else if (score >= 55 && value > 0 && value <= lowValueThresholdGood) {
      oppScore += 40
      reasons.push(`Rendimiento alto, valor bajo (${formatValue(value)})`)
    }

    // 3. Young talent: must be exceptional for age
    if (age <= 18 && score >= 48) {
      oppScore += 55
      reasons.push(`${age} años con score ${rawScore.toFixed(1)}`)
    } else if (age <= 20 && score >= 50) {
      oppScore += 45
      reasons.push(`${age} años, rendimiento destacado`)
    } else if (age <= 21 && score >= 55) {
      oppScore += 40
      reasons.push(`Joven con nivel elite`)
    } else if (age <= 23 && score >= 60) {
      oppScore += 35
      reasons.push(`Sub-23 con score top`)
    }

    // 4. Exceptional value ratio (score per €100k)
    const maxValueForRatio = isArgentina ? 2_500_000 : 1_000_000
    if (value > 0 && value <= maxValueForRatio && score >= 55) {
      const valueRatio = score / (value / 100_000)
      const ratioThreshold = isArgentina ? 15 : 50 // Argentina has higher values
      if (valueRatio >= ratioThreshold) {
        oppScore += 35
        reasons.push(`Relación calidad/precio excepcional`)
      }
    }

    // 5. Young + Low value + Decent score = Hidden gem
    if (age <= 22 && score >= 48 && value > 0 && value <= 300_000) {
      oppScore += 30
      reasons.push(`Joya oculta: ${age} años, valor bajo`)
    }

    // Only include if meets threshold
    if (oppScore >= 35 && reasons.length >= 1) {
      let type: Opportunity['type'] = 'bargain'
      if (monthsRemaining !== null && monthsRemaining <= 6 && score >= 50) {
        type = 'contract'
      } else if (age <= 21 && score >= 48) {
        type = 'young_talent'
      } else if (score >= 55 && value > 0 && value <= lowValueThresholdElite) {
        type = 'undervalued'
      }

      opportunities.push({
        player,
        type,
        score: oppScore,
        reasons,
        playerScore: rawScore,
        playerScoreScale: scale,
      })
    }
  }

  return opportunities.sort((a, b) => b.score - a.score).slice(0, 60)
}

function formatValue(value: number): string {
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `€${Math.round(value / 1_000)}K`
  return `€${value}`
}

const TYPE_LABELS: Record<string, string> = {
  contract: 'Contrato',
  undervalued: 'Subvalorado',
  young_talent: 'Joven promesa',
  bargain: 'Oportunidad',
}

type FilterType = 'all' | 'contract' | 'undervalued' | 'young_talent' | 'bargain'

export default function OpportunitiesPage() {
  const navigate = useNavigate()
  const { external, internal, loading, positionAverages } = useData()
  const { lookup: scoreLookup } = useScoreLookup()
  const [typeFilter, setTypeFilter] = useState<FilterType>('all')
  const [leagueFilter, setLeagueFilter] = useState<string>('all')
  const [positionFilter, setPositionFilter] = useState<string>('all')
  const [minAge, setMinAge] = useState<number>(15)
  const [maxAge, setMaxAge] = useState<number>(35)
  const [minValue, setMinValue] = useState<number>(0)
  const [maxValue, setMaxValue] = useState<number>(10_000_000)
  const [maxContract, setMaxContract] = useState<number | null>(null)

  const getPlayerScore = useMemo(() => {
    return (player: EnrichedPlayer): { score: number | null; scale: ScoreScale } => {
      const key = normalizeName(player.Jugador)
      const entry = scoreLookup.get(key)
      if (entry != null) return { score: entry.score, scale: '10' }
      return { score: null, scale: '10' }
    }
  }, [scoreLookup])

  const allPlayers = useMemo(() => [...external, ...internal], [external, internal])
  const opportunities = useMemo(
    () => calculateOpportunities(allPlayers, getPlayerScore),
    [allPlayers, getPlayerScore],
  )

  // Get unique leagues from opportunities
  const leagues = useMemo(() => {
    const leagueSet = new Set<string>()
    opportunities.forEach(o => {
      if (o.player.Liga) leagueSet.add(o.player.Liga)
    })
    return Array.from(leagueSet).sort()
  }, [opportunities])

  // Get unique positions from opportunities
  const positions = useMemo(() => {
    const posSet = new Set<string>()
    opportunities.forEach(o => {
      const pos = o.player['Posición'] || o.player['Posición específica']
      if (pos) posSet.add(pos)
    })
    return Array.from(posSet).sort()
  }, [opportunities])

  const filteredOpportunities = useMemo(() => {
    let result = opportunities
    if (typeFilter !== 'all') {
      result = result.filter(o => o.type === typeFilter)
    }
    if (leagueFilter !== 'all') {
      result = result.filter(o => o.player.Liga === leagueFilter)
    }
    if (positionFilter !== 'all') {
      result = result.filter(o => {
        const pos = o.player['Posición'] || o.player['Posición específica'] || ''
        return pos === positionFilter
      })
    }
    // Age filter
    result = result.filter(o => {
      const age = o.player.ageNum
      return age >= minAge && age <= maxAge
    })
    // Market value filter
    result = result.filter(o => {
      const val = o.player.marketValueRaw || 0
      return val >= minValue && val <= maxValue
    })
    // Contract filter
    if (maxContract !== null) {
      result = result.filter(o => {
        const months = o.player.monthsRemaining
        return months !== null && months <= maxContract
      })
    }
    return result
  }, [opportunities, typeFilter, leagueFilter, positionFilter, minAge, maxAge, minValue, maxValue, maxContract])

  const hasActiveFilters = typeFilter !== 'all' || leagueFilter !== 'all' || positionFilter !== 'all' ||
    minAge !== 15 || maxAge !== 35 || minValue !== 0 || maxValue !== 10_000_000 || maxContract !== null

  const clearAllFilters = () => {
    setTypeFilter('all')
    setLeagueFilter('all')
    setPositionFilter('all')
    setMinAge(15)
    setMaxAge(35)
    setMinValue(0)
    setMaxValue(10_000_000)
    setMaxContract(null)
  }

  const counts = useMemo(() => ({
    all: opportunities.length,
    contract: opportunities.filter(o => o.type === 'contract').length,
    undervalued: opportunities.filter(o => o.type === 'undervalued').length,
    young_talent: opportunities.filter(o => o.type === 'young_talent').length,
    bargain: opportunities.filter(o => o.type === 'bargain').length,
  }), [opportunities])

  if (loading) return <LoadingSpinner fullScreen message="Analizando oportunidades..." />

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-apple-gray-800 dark:text-white tracking-tight">
          Oportunidades de Mercado
        </h1>
        <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
          {filteredOpportunities.length} oportunidades detectadas
        </p>
      </div>

      {/* Filters */}
      <div className="card-apple p-4 mb-6 space-y-4">
        {/* Presets row */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mr-2">Tipo:</span>
          <button
            onClick={() => setTypeFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              typeFilter === 'all'
                ? 'bg-apple-gray-800 dark:bg-white text-white dark:text-apple-gray-800'
                : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600'
            }`}
          >
            Todas ({counts.all})
          </button>
          {(['young_talent', 'undervalued', 'contract', 'bargain'] as const).map(type => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                typeFilter === type
                  ? 'bg-apple-gray-800 dark:bg-white text-white dark:text-apple-gray-800'
                  : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600'
              }`}
            >
              {TYPE_LABELS[type]} ({counts[type]})
            </button>
          ))}
        </div>

        {/* Main filters row */}
        <div className="flex flex-wrap items-end gap-6">
          {/* Age filter - slider */}
          <div className="min-w-[200px]">
            <label className="block text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400 mb-2">
              Edad: <span className="text-brand-green font-semibold">{minAge} - {maxAge} años</span>
            </label>
            <div className="space-y-2">
              <input
                type="range"
                min="15"
                max="35"
                value={minAge}
                onChange={e => setMinAge(Math.min(Number(e.target.value), maxAge - 1))}
                className="w-full h-1.5 bg-apple-gray-200 dark:bg-apple-gray-700 rounded-lg appearance-none cursor-pointer accent-brand-green"
              />
              <input
                type="range"
                min="15"
                max="35"
                value={maxAge}
                onChange={e => setMaxAge(Math.max(Number(e.target.value), minAge + 1))}
                className="w-full h-1.5 bg-apple-gray-200 dark:bg-apple-gray-700 rounded-lg appearance-none cursor-pointer accent-brand-green"
              />
            </div>
          </div>

          {/* Market value filter - slider */}
          <div className="min-w-[220px]">
            <label className="block text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400 mb-2">
              Valor: <span className="text-brand-green font-semibold">€{(minValue/1_000_000).toFixed(1)}M - €{(maxValue/1_000_000).toFixed(1)}M</span>
            </label>
            <div className="space-y-2">
              <input
                type="range"
                min="0"
                max="10000000"
                step="100000"
                value={minValue}
                onChange={e => setMinValue(Math.min(Number(e.target.value), maxValue - 100000))}
                className="w-full h-1.5 bg-apple-gray-200 dark:bg-apple-gray-700 rounded-lg appearance-none cursor-pointer accent-brand-green"
              />
              <input
                type="range"
                min="0"
                max="10000000"
                step="100000"
                value={maxValue}
                onChange={e => setMaxValue(Math.max(Number(e.target.value), minValue + 100000))}
                className="w-full h-1.5 bg-apple-gray-200 dark:bg-apple-gray-700 rounded-lg appearance-none cursor-pointer accent-brand-green"
              />
            </div>
          </div>

          {/* Contract filter */}
          <div className="min-w-[140px]">
            <label className="block text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400 mb-1">
              Contrato (meses)
            </label>
            <select
              value={maxContract ?? 'all'}
              onChange={e => setMaxContract(e.target.value === 'all' ? null : Number(e.target.value))}
              className="w-full px-3 py-1.5 rounded-lg text-sm bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-700 dark:text-apple-gray-200 border-0 focus:ring-2 focus:ring-brand-green"
            >
              <option value="all">Cualquiera</option>
              <option value="6">≤ 6 meses</option>
              <option value="12">≤ 12 meses</option>
              <option value="18">≤ 18 meses</option>
              <option value="24">≤ 24 meses</option>
            </select>
          </div>

          {/* League filter */}
          <div className="min-w-[160px]">
            <label className="block text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400 mb-1">
              Liga
            </label>
            <select
              value={leagueFilter}
              onChange={e => setLeagueFilter(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg text-sm bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-700 dark:text-apple-gray-200 border-0 focus:ring-2 focus:ring-brand-green"
            >
              <option value="all">Todas las ligas</option>
              {leagues.map(league => (
                <option key={league} value={league}>{league}</option>
              ))}
            </select>
          </div>

          {/* Position filter */}
          <div className="min-w-[160px]">
            <label className="block text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400 mb-1">
              Posición
            </label>
            <select
              value={positionFilter}
              onChange={e => setPositionFilter(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg text-sm bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-700 dark:text-apple-gray-200 border-0 focus:ring-2 focus:ring-brand-green"
            >
              <option value="all">Todas</option>
              {positions.map(pos => (
                <option key={pos} value={pos}>{displayPosition(pos)}</option>
              ))}
            </select>
          </div>

          {/* Clear filters button */}
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-apple-gray-500 dark:text-apple-gray-400 hover:text-red-500 dark:hover:text-red-400 bg-apple-gray-100 dark:bg-apple-gray-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Opportunities grid */}
      {filteredOpportunities.length === 0 ? (
        <div className="text-center py-12 text-apple-gray-500">
          No se encontraron oportunidades con estos filtros
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredOpportunities.map((opp, idx) => {
            const normPos = FILTER_POSITION_MAP[opp.player['Posición']] ?? ''
            const posAvg = normPos ? (positionAverages[normPos] ?? null) : null
            // Use the resolved score and scale stored on the opportunity
            const displayScore = opp.playerScore
            const scale = opp.playerScoreScale
            // posAvg is always on the 0-100 scale; convert for relative comparison when needed
            const posAvgForScale = scale === '10' && posAvg != null ? posAvg / 10 : posAvg
            const scoreColor = getRelativeScoreColorClass(displayScore, posAvgForScale, scale)
            const scoreBg = getRelativeScoreBgClass(displayScore, posAvgForScale, scale)

            return (
              <div
                key={`${opp.player.Jugador}-${idx}`}
                onClick={() => {
                  const encoded = encodeURIComponent(opp.player.Jugador)
                  navigate(`/jugador/${encoded}?source=${opp.player.source}`)
                }}
                className="bg-white dark:bg-apple-gray-800 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 p-4 cursor-pointer hover:shadow-lg transition-all hover:-translate-y-0.5"
              >
                {/* Header */}
                <div className="flex items-start gap-3 mb-3">
                  {opp.player.Imagen ? (
                    <img
                      src={opp.player.Imagen}
                      alt=""
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-apple-gray-200 dark:bg-apple-gray-700 flex items-center justify-center text-lg font-bold text-apple-gray-500">
                      {opp.player.Jugador.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-apple-gray-800 dark:text-white truncate">
                      {opp.player.Jugador}
                    </h3>
                    <p className="text-sm text-apple-gray-500 truncate">
                      {opp.player.Equipo}
                    </p>
                    <p className="text-xs text-apple-gray-400 truncate">
                      {opp.player.Liga}
                    </p>
                  </div>
                  <span className="text-xs font-medium px-2 py-1 rounded bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300">
                    {TYPE_LABELS[opp.type]}
                  </span>
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-3 mb-3 text-sm">
                  <span className={`px-2 py-0.5 rounded-full font-semibold ${scoreBg} ${scoreColor}`}>
                    {displayScore.toFixed(1)}
                  </span>
                  <span className="text-apple-gray-600 dark:text-apple-gray-400">
                    {opp.player.ageNum} años
                  </span>
                  <span className="text-apple-gray-600 dark:text-apple-gray-400">
                    {opp.player['Posición']}
                  </span>
                </div>

                {/* Value and contract */}
                <div className="flex items-center justify-between mb-3 text-sm">
                  <div>
                    <span className="text-apple-gray-400">Valor: </span>
                    <span className="font-medium text-apple-gray-700 dark:text-apple-gray-200">
                      {opp.player.marketValueFormatted || '—'}
                    </span>
                  </div>
                  {opp.player.monthsRemaining !== null && (
                    <div>
                      <span className="text-apple-gray-400">Contrato: </span>
                      <span className="font-medium text-apple-gray-700 dark:text-apple-gray-200">
                        {opp.player.monthsRemaining} meses
                      </span>
                    </div>
                  )}
                </div>

                {/* Reasons */}
                <div className="space-y-1 mb-3">
                  {opp.reasons.map((reason, i) => (
                    <div
                      key={i}
                      className="text-xs text-apple-gray-600 dark:text-apple-gray-400 bg-apple-gray-50 dark:bg-apple-gray-700/50 px-2 py-1 rounded"
                    >
                      {reason}
                    </div>
                  ))}
                </div>

                {/* Opportunity score bar */}
                <div className="pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-apple-gray-400">Nivel de oportunidad</span>
                    <span className="font-semibold text-brand-green">{opp.score} pts</span>
                  </div>
                  <div className="h-1.5 bg-apple-gray-200 dark:bg-apple-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-brand-green to-green-400 rounded-full transition-all"
                      style={{ width: `${Math.min(100, opp.score)}%` }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
