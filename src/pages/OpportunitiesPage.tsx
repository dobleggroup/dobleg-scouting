import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlayersList } from '@/hooks/usePlayerStats'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import MobileFilterPanel, { MobileFilterButton } from '@/components/filters/MobileFilterPanel'
import { getScoreColorClass, getScoreBgClass } from '@/components/ui/ScoreBar'
import { displayPosition } from '@/types/scoring'
import {
  detectOpportunities,
  ageFromBirthDate,
  monthsToContractEnd,
} from '@/utils/opportunities'
import type { PlayerWithScore } from '@/types/scoring'

interface Opportunity {
  player: PlayerWithScore
  type: 'contract' | 'undervalued' | 'young_talent' | 'bargain'
  score: number
  reasons: string[]
  playerScore: number
}

function formatValue(value: number): string {
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `€${Math.round(value / 1_000)}K`
  return `€${value}`
}

function buildOpportunities(players: PlayerWithScore[]): Opportunity[] {
  const { undervalued, youngTalent, expiringContract, valueForMoney } =
    detectOpportunities(players)

  const seen = new Set<number>()
  const result: Opportunity[] = []

  // 1. Expiring contracts (highest priority)
  for (const p of expiringContract) {
    if (seen.has(p.id)) continue
    const m = monthsToContractEnd(p.contract_end_date) as number
    const reasons: string[] = [`Contrato vence en ${m} meses`]
    const score = p.primary_score ?? 0
    let oppScore = 50
    if (score >= 8.0) { oppScore += 20; reasons.push(`Score ${score.toFixed(1)} excepcional`) }
    else if (score >= 7.0) { oppScore += 10; reasons.push(`Score ${score.toFixed(1)} destacado`) }
    seen.add(p.id)
    result.push({ player: p, type: 'contract', score: oppScore, reasons, playerScore: score })
  }

  // 2. Young talent
  for (const p of youngTalent) {
    if (seen.has(p.id)) continue
    const age = ageFromBirthDate(p.birth_date) as number
    const score = p.primary_score as number
    const reasons: string[] = [`${age} años con score ${score.toFixed(1)}`]
    let oppScore = 40
    if (score >= 8.0) { oppScore += 20 }
    else if (score >= 7.0) { oppScore += 10 }
    if (p.market_value_eur && p.market_value_eur <= 1_000_000) {
      reasons.push(`Valor accesible: ${formatValue(p.market_value_eur)}`)
      oppScore += 10
    }
    seen.add(p.id)
    result.push({ player: p, type: 'young_talent', score: oppScore, reasons, playerScore: score })
  }

  // 3. Undervalued
  for (const p of undervalued) {
    if (seen.has(p.id)) continue
    const score = p.primary_score as number
    const val = p.market_value_eur as number
    const reasons: string[] = [`Score ${score.toFixed(1)} a solo ${formatValue(val)}`]
    let oppScore = 40
    if (score >= 8.0) { oppScore += 20 }
    else if (score >= 7.0) { oppScore += 10 }
    seen.add(p.id)
    result.push({ player: p, type: 'undervalued', score: oppScore, reasons, playerScore: score })
  }

  // 4. Value for money (top ratio, not yet included)
  for (const p of valueForMoney.slice(0, 30)) {
    if (seen.has(p.id)) continue
    const score = p.primary_score as number
    const val = p.market_value_eur as number
    const ratio = score / (val / 1_000_000)
    const reasons: string[] = [`Relación calidad/precio: ${ratio.toFixed(1)} pts/M€`]
    const oppScore = 35
    seen.add(p.id)
    result.push({ player: p, type: 'bargain', score: oppScore, reasons, playerScore: score })
  }

  return result.sort((a, b) => b.score - a.score).slice(0, 60)
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
  const { players, loading } = usePlayersList({ pageSize: 500 })

  const [typeFilter, setTypeFilter] = useState<FilterType>('all')
  const [positionFilter, setPositionFilter] = useState<string>('all')
  const [minAge, setMinAge] = useState<number>(15)
  const [maxAge, setMaxAge] = useState<number>(35)
  const [minValue, setMinValue] = useState<number>(0)
  const [maxValue, setMaxValue] = useState<number>(10_000_000)
  const [maxContract, setMaxContract] = useState<number | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  const opportunities = useMemo(() => buildOpportunities(players), [players])

  const positions = useMemo(() => {
    const posSet = new Set<string>()
    opportunities.forEach(o => {
      if (o.player.primary_position) posSet.add(o.player.primary_position)
    })
    return Array.from(posSet).sort()
  }, [opportunities])

  const filteredOpportunities = useMemo(() => {
    let result = opportunities

    if (typeFilter !== 'all') {
      result = result.filter(o => o.type === typeFilter)
    }

    if (positionFilter !== 'all') {
      result = result.filter(o => o.player.primary_position === positionFilter)
    }

    // Age filter
    result = result.filter(o => {
      const age = ageFromBirthDate(o.player.birth_date)
      if (age == null) return true
      return age >= minAge && age <= maxAge
    })

    // Market value filter
    result = result.filter(o => {
      const val = o.player.market_value_eur ?? 0
      return val >= minValue && val <= maxValue
    })

    // Contract filter
    if (maxContract !== null) {
      result = result.filter(o => {
        const months = monthsToContractEnd(o.player.contract_end_date)
        return months !== null && months >= 0 && months <= maxContract
      })
    }

    return result
  }, [opportunities, typeFilter, positionFilter, minAge, maxAge, minValue, maxValue, maxContract])

  const hasActiveFilters =
    typeFilter !== 'all' ||
    positionFilter !== 'all' ||
    minAge !== 15 ||
    maxAge !== 35 ||
    minValue !== 0 ||
    maxValue !== 10_000_000 ||
    maxContract !== null

  const clearAllFilters = () => {
    setTypeFilter('all')
    setPositionFilter('all')
    setMinAge(15)
    setMaxAge(35)
    setMinValue(0)
    setMaxValue(10_000_000)
    setMaxContract(null)
  }

  const counts = useMemo(
    () => ({
      all: opportunities.length,
      contract: opportunities.filter(o => o.type === 'contract').length,
      undervalued: opportunities.filter(o => o.type === 'undervalued').length,
      young_talent: opportunities.filter(o => o.type === 'young_talent').length,
      bargain: opportunities.filter(o => o.type === 'bargain').length,
    }),
    [opportunities],
  )

  const activeCount = [
    typeFilter !== 'all',
    positionFilter !== 'all',
    minAge !== 15 || maxAge !== 35,
    minValue !== 0 || maxValue !== 10_000_000,
    maxContract !== null,
  ].filter(Boolean).length

  // Contenido de filtros — mobile-first; bajo `lg:` reproduce la fila horizontal
  // del desktop. Se usa en la card de desktop y en el bottom-sheet de mobile.
  const renderFilters = () => (
    <div className="space-y-4">
      {/* Tipo (presets) */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mr-2">
          Tipo:
        </span>
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

      {/* Filtros principales */}
      <div className="flex flex-col gap-5 lg:flex-row lg:flex-wrap lg:items-end lg:gap-6">
        {/* Edad */}
        <div className="w-full lg:w-auto lg:min-w-[200px]">
          <label className="block text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400 mb-2">
            Edad:{' '}
            <span className="text-brand-green font-semibold">
              {minAge} - {maxAge} años
            </span>
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

        {/* Valor de mercado */}
        <div className="w-full lg:w-auto lg:min-w-[220px]">
          <label className="block text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400 mb-2">
            Valor:{' '}
            <span className="text-brand-green font-semibold">
              €{(minValue / 1_000_000).toFixed(1)}M - €{(maxValue / 1_000_000).toFixed(1)}M
            </span>
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

        {/* Contrato */}
        <div className="w-full lg:w-auto lg:min-w-[140px]">
          <label className="block text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400 mb-1">
            Contrato (meses)
          </label>
          <select
            value={maxContract ?? 'all'}
            onChange={e =>
              setMaxContract(e.target.value === 'all' ? null : Number(e.target.value))
            }
            className="w-full px-3 py-2 lg:py-1.5 rounded-lg text-sm bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-700 dark:text-apple-gray-200 border-0 focus:ring-2 focus:ring-brand-green"
          >
            <option value="all">Cualquiera</option>
            <option value="6">≤ 6 meses</option>
            <option value="12">≤ 12 meses</option>
            <option value="18">≤ 18 meses</option>
            <option value="24">≤ 24 meses</option>
          </select>
        </div>

        {/* Posición */}
        <div className="w-full lg:w-auto lg:min-w-[160px]">
          <label className="block text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400 mb-1">
            Posición
          </label>
          <select
            value={positionFilter}
            onChange={e => setPositionFilter(e.target.value)}
            className="w-full px-3 py-2 lg:py-1.5 rounded-lg text-sm bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-700 dark:text-apple-gray-200 border-0 focus:ring-2 focus:ring-brand-green"
          >
            <option value="all">Todas</option>
            {positions.map(pos => (
              <option key={pos} value={pos}>
                {displayPosition(pos)}
              </option>
            ))}
          </select>
        </div>

        {/* Limpiar */}
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="flex items-center justify-center gap-1.5 px-3 py-2 lg:py-1.5 text-sm font-medium text-apple-gray-500 dark:text-apple-gray-400 hover:text-red-500 dark:hover:text-red-400 bg-apple-gray-100 dark:bg-apple-gray-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Limpiar
          </button>
        )}
      </div>
    </div>
  )

  if (loading) return <LoadingSpinner fullScreen message="Analizando oportunidades..." />

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-apple-gray-800 dark:text-white tracking-tight">
          Oportunidades de Mercado
        </h1>
        <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
          {filteredOpportunities.length} oportunidades detectadas
        </p>
      </div>

      {/* Filtros — desktop (en mobile van al bottom-sheet) */}
      <div className="hidden lg:block card-apple p-4 mb-6">
        {renderFilters()}
      </div>

      {/* Filtros — mobile: FAB + bottom-sheet */}
      <MobileFilterButton onClick={() => setShowFilters(true)} activeCount={activeCount} />
      <MobileFilterPanel isOpen={showFilters} onClose={() => setShowFilters(false)} activeCount={activeCount}>
        {renderFilters()}
        <button
          onClick={() => setShowFilters(false)}
          className="mt-6 w-full py-3 rounded-xl text-sm font-semibold text-gray-900 bg-brand-green hover:bg-emerald-500 transition-colors"
        >
          Ver {filteredOpportunities.length} resultados
        </button>
      </MobileFilterPanel>

      {/* Opportunities grid */}
      {filteredOpportunities.length === 0 ? (
        <div className="text-center py-12 text-apple-gray-500">
          No se encontraron oportunidades con estos filtros
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredOpportunities.map((opp, idx) => {
            const score = opp.playerScore
            const scoreColor = getScoreColorClass(score, '10')
            const scoreBg = getScoreBgClass(score, '10')
            const age = ageFromBirthDate(opp.player.birth_date)
            const contractMonths = monthsToContractEnd(opp.player.contract_end_date)
            const teamName = opp.player.team?.name ?? ''
            const teamLogo = opp.player.team?.logo ?? null
            const initials = opp.player.name
              .split(' ')
              .map(n => n[0])
              .join('')
              .slice(0, 2)

            return (
              <div
                key={`${opp.player.id}-${idx}`}
                onClick={() => navigate(`/jugador/${encodeURIComponent(opp.player.name)}?source=externo&apiId=${opp.player.id}`)}
                className="bg-white dark:bg-apple-gray-800 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 p-4 cursor-pointer hover:shadow-lg transition-all hover:-translate-y-0.5"
              >
                {/* Header */}
                <div className="flex items-start gap-3 mb-3">
                  {opp.player.photo ? (
                    <img
                      src={opp.player.photo}
                      alt=""
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-apple-gray-200 dark:bg-apple-gray-700 flex items-center justify-center text-lg font-bold text-apple-gray-500">
                      {initials}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-apple-gray-800 dark:text-white truncate">
                      {opp.player.name}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {teamLogo && (
                        <img src={teamLogo} alt="" className="w-4 h-4 object-contain" />
                      )}
                      <p className="text-sm text-apple-gray-500 truncate">{teamName}</p>
                    </div>
                    {opp.player.league && (
                      <p className="text-xs text-apple-gray-400 truncate">
                        {opp.player.league.name}
                      </p>
                    )}
                  </div>
                  <span className="text-xs font-medium px-2 py-1 rounded bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 flex-shrink-0">
                    {TYPE_LABELS[opp.type]}
                  </span>
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-3 mb-3 text-sm">
                  <span
                    className={`px-2 py-0.5 rounded-full font-semibold ${scoreBg} ${scoreColor}`}
                  >
                    {score.toFixed(1)}
                  </span>
                  {age != null && (
                    <span className="text-apple-gray-600 dark:text-apple-gray-400">
                      {age} años
                    </span>
                  )}
                  {opp.player.primary_position && (
                    <span className="text-apple-gray-600 dark:text-apple-gray-400">
                      {displayPosition(opp.player.primary_position)}
                    </span>
                  )}
                </div>

                {/* Value and contract */}
                <div className="flex items-center justify-between mb-3 text-sm">
                  <div>
                    <span className="text-apple-gray-400">Valor: </span>
                    <span className="font-medium text-apple-gray-700 dark:text-apple-gray-200">
                      {opp.player.market_value_eur
                        ? formatValue(opp.player.market_value_eur)
                        : '—'}
                    </span>
                  </div>
                  {contractMonths != null && contractMonths >= 0 && (
                    <div>
                      <span className="text-apple-gray-400">Contrato: </span>
                      <span className="font-medium text-apple-gray-700 dark:text-apple-gray-200">
                        {contractMonths} meses
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
