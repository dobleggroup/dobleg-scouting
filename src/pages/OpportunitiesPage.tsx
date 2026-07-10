import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRecentForm } from '@/hooks/usePlayerStats'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import MobileFilterPanel, { MobileFilterButton } from '@/components/filters/MobileFilterPanel'
import { getScoreColorClass, getScoreBgClass } from '@/components/ui/ScoreBar'
import Sparkline from '@/components/ui/Sparkline'
import { displayPosition } from '@/types/scoring'
import {
  marketTagsFor,
  ageFromBirthDate,
  monthsToContractEnd,
  type MarketTag,
} from '@/utils/opportunities'
import type { RecentFormPlayer } from '@/types/scoring'

const CHEAP_MAX = 5_000_000
const CONTRACT_MAX = 12

const TAG_LABELS: Record<MarketTag, string> = {
  contract: 'Fin de contrato',
  cheap: 'Precio bajo',
}

function formatValue(value: number): string {
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `€${Math.round(value / 1_000)}K`
  return `€${value}`
}

type FilterType = 'all' | 'contract' | 'cheap'

export default function OpportunitiesPage() {
  const navigate = useNavigate()

  const [windowMonths, setWindowMonths] = useState<number>(3)
  const { players, loading } = useRecentForm({
    windowMonths,
    cheapMaxValue: CHEAP_MAX,
    contractMaxMonths: CONTRACT_MAX,
    limit: 200,
  })

  const [typeFilter, setTypeFilter] = useState<FilterType>('all')
  const [positionFilter, setPositionFilter] = useState<string>('all')
  const [minAge, setMinAge] = useState<number>(15)
  const [maxAge, setMaxAge] = useState<number>(35)
  const [minValue, setMinValue] = useState<number>(0)
  const [maxValue, setMaxValue] = useState<number>(10_000_000)
  const [maxContract, setMaxContract] = useState<number | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  // Tags de mercado precalculados por jugador (el RPC ya los garantiza; acá se
  // usan para chips, filtro por tipo y conteos).
  const tagsById = useMemo(() => {
    const map = new Map<number, MarketTag[]>()
    players.forEach(p =>
      map.set(p.id, marketTagsFor(p, { cheapMaxValue: CHEAP_MAX, contractMaxMonths: CONTRACT_MAX })),
    )
    return map
  }, [players])

  const positions = useMemo(() => {
    const posSet = new Set<string>()
    players.forEach(p => {
      if (p.primary_position) posSet.add(p.primary_position)
    })
    return Array.from(posSet).sort()
  }, [players])

  const filteredPlayers = useMemo(() => {
    let result = players

    if (typeFilter !== 'all') {
      result = result.filter(p => (tagsById.get(p.id) ?? []).includes(typeFilter))
    }

    if (positionFilter !== 'all') {
      result = result.filter(p => p.primary_position === positionFilter)
    }

    // Edad
    result = result.filter(p => {
      const age = ageFromBirthDate(p.birth_date)
      if (age == null) return true
      return age >= minAge && age <= maxAge
    })

    // Valor de mercado
    result = result.filter(p => {
      const val = p.market_value_eur ?? 0
      return val >= minValue && val <= maxValue
    })

    // Contrato
    if (maxContract !== null) {
      result = result.filter(p => {
        const months = monthsToContractEnd(p.contract_end_date)
        return months !== null && months >= 0 && months <= maxContract
      })
    }

    return result
  }, [players, tagsById, typeFilter, positionFilter, minAge, maxAge, minValue, maxValue, maxContract])

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
      all: players.length,
      contract: players.filter(p => (tagsById.get(p.id) ?? []).includes('contract')).length,
      cheap: players.filter(p => (tagsById.get(p.id) ?? []).includes('cheap')).length,
    }),
    [players, tagsById],
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
      {/* Ventana de forma reciente */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mr-2">
          Forma:
        </span>
        {[1, 3, 6, 12].map(w => (
          <button
            key={w}
            onClick={() => setWindowMonths(w)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              windowMonths === w
                ? 'bg-apple-gray-800 dark:bg-white text-white dark:text-apple-gray-800'
                : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600'
            }`}
          >
            {w === 1 ? '1 mes' : `${w} meses`}
          </button>
        ))}
      </div>

      {/* Tipo (tag de mercado) */}
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
        {(['contract', 'cheap'] as const).map(type => (
          <button
            key={type}
            onClick={() => setTypeFilter(type)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              typeFilter === type
                ? 'bg-apple-gray-800 dark:bg-white text-white dark:text-apple-gray-800'
                : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600'
            }`}
          >
            {TAG_LABELS[type]} ({counts[type]})
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
          {filteredPlayers.length} jugadores en alza · ranking por Score GG reciente
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
          Ver {filteredPlayers.length} resultados
        </button>
      </MobileFilterPanel>

      {/* Opportunities grid */}
      {filteredPlayers.length === 0 ? (
        <div className="text-center py-12 text-apple-gray-500">
          No se encontraron oportunidades con estos filtros
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPlayers.map((p: RecentFormPlayer) => {
            const score = p.recent_avg
            const scoreColor = getScoreColorClass(score, '10')
            const scoreBg = getScoreBgClass(score, '10')
            const age = ageFromBirthDate(p.birth_date)
            const contractMonths = monthsToContractEnd(p.contract_end_date)
            const teamName = p.team?.name ?? ''
            const teamLogo = p.team?.logo ?? null
            const tags = tagsById.get(p.id) ?? []
            const initials = p.name
              .split(' ')
              .map(n => n[0])
              .join('')
              .slice(0, 2)

            return (
              <div
                key={p.id}
                onClick={() => navigate(`/jugador/${encodeURIComponent(p.name)}?source=externo&apiId=${p.id}`)}
                className="bg-white dark:bg-apple-gray-800 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 p-4 cursor-pointer hover:shadow-lg transition-all hover:-translate-y-0.5"
              >
                {/* Header */}
                <div className="flex items-start gap-3 mb-3">
                  {p.photo ? (
                    <img
                      src={p.photo}
                      alt=""
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-apple-gray-200 dark:bg-apple-gray-700 flex items-center justify-center text-lg font-bold text-apple-gray-500">
                      {initials}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-semibold text-apple-gray-800 dark:text-white truncate">
                        {p.name}
                      </h3>
                      {p.on_the_rise && (
                        <span className="text-brand-green text-sm font-semibold flex-shrink-0">▲</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {teamLogo && (
                        <img src={teamLogo} alt="" className="w-4 h-4 object-contain" />
                      )}
                      <p className="text-sm text-apple-gray-500 truncate">{teamName}</p>
                    </div>
                    {p.league_name && (
                      <p className="text-xs text-apple-gray-400 truncate">
                        {p.league_name}
                      </p>
                    )}
                  </div>
                  {/* Score GG reciente */}
                  <div className="text-right flex-shrink-0">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full font-semibold text-sm ${scoreBg} ${scoreColor}`}
                    >
                      {score.toFixed(1)}
                    </span>
                    <p className="text-2xs text-apple-gray-400 mt-1">Score GG · {p.recent_matches} PJ</p>
                  </div>
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-3 mb-3 text-sm">
                  {age != null && (
                    <span className="text-apple-gray-600 dark:text-apple-gray-400">
                      {age} años
                    </span>
                  )}
                  {p.primary_position && (
                    <span className="text-apple-gray-600 dark:text-apple-gray-400">
                      {displayPosition(p.primary_position)}
                    </span>
                  )}
                  <div className="ml-auto">
                    <Sparkline values={p.recent_scores} />
                  </div>
                </div>

                {/* Value and contract */}
                <div className="flex items-center justify-between mb-3 text-sm">
                  <div>
                    <span className="text-apple-gray-400">Valor: </span>
                    <span className="font-medium text-apple-gray-700 dark:text-apple-gray-200">
                      {p.market_value_eur ? formatValue(p.market_value_eur) : '—'}
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

                {/* Market tags */}
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700">
                    {tags.map(t => (
                      <span
                        key={t}
                        className="text-xs font-medium px-2.5 py-1 rounded-full bg-brand-green/10 text-brand-green"
                      >
                        {TAG_LABELS[t]}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
