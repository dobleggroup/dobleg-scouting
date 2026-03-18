import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { EnrichedPlayer, SortState } from '@/types'
import ContractBadge from '@/components/ui/ContractBadge'
import ScoreBar from '@/components/ui/ScoreBar'
import EmptyState from '@/components/ui/EmptyState'
import { SELECTABLE_METRICS } from '@/components/filters/FilterSidebar'
import { useData } from '@/context/DataContext'
import { FILTER_POSITION_MAP } from '@/constants/scoring'

interface PlayerTableProps {
  players: EnrichedPlayer[]
  source: 'externo' | 'interno'
  isLoading?: boolean
  selectedMetrics?: string[]  // Dynamic metric columns
}

interface Column {
  key: string
  label: string
  sortable: boolean
  align?: 'left' | 'right' | 'center'
  className?: string
  isMetric?: boolean  // Dynamic metric column
}

const BASE_COLUMNS: Column[] = [
  { key: 'Jugador', label: 'Jugador', sortable: true, align: 'left' },
  { key: 'Liga', label: 'Liga', sortable: true, align: 'left', className: 'hidden md:table-cell' },
  { key: 'Equipo', label: 'Equipo', sortable: true, align: 'left', className: 'hidden lg:table-cell' },
  { key: 'Posición', label: 'Pos', sortable: true, align: 'left', className: 'hidden sm:table-cell' },
  { key: 'ageNum', label: 'Edad', sortable: true, align: 'center' },
  { key: 'marketValueRaw', label: 'Valor', sortable: true, align: 'right', className: 'hidden sm:table-cell' },
]

const BASE_COLUMNS_INTERNAL: Column[] = [
  { key: 'Jugador', label: 'Jugador', sortable: true, align: 'left' },
  { key: 'Equipo', label: 'Equipo', sortable: true, align: 'left', className: 'hidden lg:table-cell' },
  { key: 'Posición', label: 'Pos', sortable: true, align: 'left', className: 'hidden sm:table-cell' },
  { key: 'ageNum', label: 'Edad', sortable: true, align: 'center' },
  { key: 'marketValueRaw', label: 'Valor', sortable: true, align: 'right', className: 'hidden sm:table-cell' },
]

const SCORE_COLUMN: Column = { key: 'ggScore', label: 'Score', sortable: true, align: 'center' }

const PAGE_SIZE = 50

function SortIcon({ direction }: { direction: 'asc' | 'desc' | null }) {
  if (!direction) {
    return (
      <svg className="w-3 h-3 text-apple-gray-300 dark:text-apple-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    )
  }
  return (
    <svg className="w-3 h-3 text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d={direction === 'asc' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
    </svg>
  )
}

// Format metric value for display
function formatMetricValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  const num = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'))
  if (isNaN(num)) return '—'
  // Show 1-2 decimals depending on magnitude
  if (num >= 10) return num.toFixed(1)
  if (num >= 1) return num.toFixed(2)
  return num.toFixed(2)
}

export default function PlayerTable({ players, source, isLoading, selectedMetrics = [] }: PlayerTableProps) {
  const navigate = useNavigate()
  const { positionAverages } = useData()
  const [sort, setSort] = useState<SortState>({ column: 'ggScore', direction: 'desc' })
  const [page, setPage] = useState(1)

  // Build columns with dynamic metrics
  const columns = useMemo(() => {
    const base = source === 'interno' ? BASE_COLUMNS_INTERNAL : BASE_COLUMNS

    // Add selected metric columns
    const metricColumns: Column[] = selectedMetrics.map(key => {
      const metricInfo = SELECTABLE_METRICS.find(m => m.key === key)
      return {
        key,
        label: metricInfo?.short || key.slice(0, 6),
        sortable: true,
        align: 'center' as const,
        isMetric: true,
      }
    })

    return [...base, ...metricColumns, SCORE_COLUMN]
  }, [source, selectedMetrics])

  const handleSort = (col: string) => {
    setSort(prev =>
      prev.column === col
        ? { column: col, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { column: col, direction: 'desc' }
    )
    setPage(1)
  }

  const sorted = useMemo(() => {
    const { column, direction } = sort
    return [...players].sort((a, b) => {
      let aVal = a[column]
      let bVal = b[column]

      // Parse string numbers for metrics
      if (typeof aVal === 'string') aVal = parseFloat(aVal.replace(',', '.')) || 0
      if (typeof bVal === 'string') bVal = parseFloat(bVal.replace(',', '.')) || 0

      if (aVal === null || aVal === undefined) return 1
      if (bVal === null || bVal === undefined) return -1

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return direction === 'asc' ? aVal - bVal : bVal - aVal
      }
      const aStr = String(aVal ?? '').toLowerCase()
      const bStr = String(bVal ?? '').toLowerCase()
      const cmp = aStr.localeCompare(bStr, 'es')
      return direction === 'asc' ? cmp : -cmp
    })
  }, [players, sort])

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleRowClick = (player: EnrichedPlayer) => {
    const id = source === 'interno' && player.id
      ? encodeURIComponent(player.id)
      : encodeURIComponent(player.Jugador)
    navigate(`/jugador/${id}?source=${source}`)
  }

  if (!isLoading && players.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="space-y-3">
      {/* Table */}
      <div className="card-apple overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" id="player-table-export">
            <thead>
              <tr className="border-b border-apple-gray-200/50 dark:border-apple-gray-700/50 bg-apple-gray-50/80 dark:bg-apple-gray-800/50">
                {columns.map(col => (
                  <th
                    key={col.key}
                    scope="col"
                    className={`px-3 py-2.5 text-${col.align ?? 'left'} text-2xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider whitespace-nowrap ${col.className ?? ''} ${col.sortable ? 'cursor-pointer hover:text-apple-gray-700 dark:hover:text-apple-gray-200 select-none transition-colors' : ''} ${col.isMetric ? 'bg-brand-green/5 dark:bg-brand-green/10' : ''}`}
                    onClick={() => col.sortable && handleSort(col.key)}
                    title={col.isMetric ? SELECTABLE_METRICS.find(m => m.key === col.key)?.label : undefined}
                  >
                    <div className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : ''}`}>
                      {col.label}
                      {col.sortable && (
                        <SortIcon direction={sort.column === col.key ? sort.direction : null} />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-apple-gray-100 dark:divide-apple-gray-800/50">
              {paginated.map((player, idx) => (
                <tr
                  key={`${player.Jugador}-${idx}`}
                  onClick={() => handleRowClick(player)}
                  className="hover:bg-brand-green/5 dark:hover:bg-brand-green/10 cursor-pointer transition-colors duration-150 group"
                >
                  {/* Jugador */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      {/* Avatar / Image */}
                      {player.Imagen ? (
                        <img
                          src={player.Imagen}
                          alt={player.Jugador}
                          className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
                          onError={(e) => {
                            const target = e.currentTarget
                            target.style.display = 'none'
                            const fallback = target.nextElementSibling as HTMLElement
                            if (fallback) fallback.style.display = 'flex'
                          }}
                        />
                      ) : null}
                      <div
                        className="w-8 h-8 bg-apple-gray-100 dark:bg-apple-gray-700 rounded-lg items-center justify-center flex-shrink-0 group-hover:bg-brand-green/10 transition-colors"
                        style={{ display: player.Imagen ? 'none' : 'flex' }}
                      >
                        <span className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 group-hover:text-brand-green transition-colors">
                          {player.Jugador.split(' ').map(w => w[0]).slice(0, 2).join('')}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-apple-gray-800 dark:text-white group-hover:text-brand-green transition-colors truncate">
                            {player.Jugador}
                          </span>
                          <ContractBadge
                            status={player.contractStatus}
                            monthsRemaining={player.monthsRemaining}
                          />
                        </div>
                      </div>
                    </div>
                  </td>
                  {/* Liga (external only) */}
                  {source === 'externo' && (
                    <td className="px-3 py-3 hidden md:table-cell">
                      <span className="text-apple-gray-500 dark:text-apple-gray-400 text-xs">{player.Liga || '—'}</span>
                    </td>
                  )}
                  {/* Equipo */}
                  <td className="px-3 py-3 hidden lg:table-cell">
                    <span className="text-apple-gray-500 dark:text-apple-gray-400 text-xs truncate block max-w-[120px]">{player.Equipo || '—'}</span>
                  </td>
                  {/* Posición */}
                  <td className="px-3 py-3 hidden sm:table-cell">
                    <span className="inline-flex px-2 py-0.5 bg-apple-gray-100 dark:bg-apple-gray-700 rounded text-xs text-apple-gray-600 dark:text-apple-gray-300">
                      {player['Posición'] || '—'}
                    </span>
                  </td>
                  {/* Edad */}
                  <td className="px-3 py-3 text-center">
                    <span className="text-apple-gray-700 dark:text-apple-gray-300 tabular-nums text-xs">{player.Edad || '—'}</span>
                  </td>
                  {/* Valor Mercado */}
                  <td className="px-3 py-3 text-right hidden sm:table-cell">
                    <span className="text-apple-gray-600 dark:text-apple-gray-300 text-xs font-medium tabular-nums">
                      {player.marketValueFormatted}
                    </span>
                  </td>
                  {/* Dynamic metric columns */}
                  {selectedMetrics.map(key => (
                    <td key={key} className="px-3 py-3 text-center bg-brand-green/5 dark:bg-brand-green/5">
                      <span className="text-apple-gray-700 dark:text-apple-gray-300 tabular-nums text-xs font-medium">
                        {formatMetricValue(player[key])}
                      </span>
                    </td>
                  ))}
                  {/* Score GG */}
                  <td className="px-3 py-3">
                    <div className="flex justify-center">
                      <ScoreBar
                        score={player.ggScore}
                        size="sm"
                        posAvg={positionAverages[FILTER_POSITION_MAP[player['Posición']] ?? ''] ?? null}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm px-1">
          <span className="text-apple-gray-500 dark:text-apple-gray-400">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sorted.length)} de {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg disabled:opacity-30 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800 transition-colors text-apple-gray-600 dark:text-apple-gray-400"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="px-3 text-apple-gray-600 dark:text-apple-gray-400 tabular-nums">
              {page} / {totalPages}
            </span>
            <button
              disabled={page === totalPages}
              onClick={() => setPage(p => p + 1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg disabled:opacity-30 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800 transition-colors text-apple-gray-600 dark:text-apple-gray-400"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
