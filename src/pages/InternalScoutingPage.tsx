import { useState, useMemo, useCallback, useEffect } from 'react'
import { useData } from '@/context/DataContext'
import FilterSidebar from '@/components/filters/FilterSidebar'
import MobileFilterPanel, { MobileFilterButton } from '@/components/filters/MobileFilterPanel'
import PlayerTable from '@/components/players/PlayerTable'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import { FILTER_POSITION_MAP } from '@/constants/scoring'
import { parseContractDate } from '@/utils/scoring'
import { exportTableToPdf } from '@/utils/pdfExport'
import { fuzzyMatch } from '@/lib/search'
import type { FilterState, EnrichedPlayer } from '@/types'

const DEFAULT_FILTERS: FilterState = {
  search: '',
  positions: [],
  leagues: [],
  teamSearch: '',
  minMinutes: 0,
  maxMinutes: 0,
  minMarketValue: 0,
  maxMarketValue: 0,
  minAge: 0,
  maxAge: 0,
  contractFrom: '',
  contractTo: '',
  maxContractMonths: 0,
  representante: '',
  pie: '',
  minHeight: 0,
  maxHeight: 0,
  selectedMetrics: [],
}

const FILTERS_STORAGE_KEY = 'internal_scouting_filters'

function loadFiltersFromStorage(): FilterState {
  try {
    const stored = sessionStorage.getItem(FILTERS_STORAGE_KEY)
    if (stored) return { ...DEFAULT_FILTERS, ...JSON.parse(stored) }
  } catch {}
  return DEFAULT_FILTERS
}

function saveFiltersToStorage(filters: FilterState): void {
  try {
    sessionStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters))
  } catch {}
}

function applyFilters(players: EnrichedPlayer[], filters: FilterState): EnrichedPlayer[] {
  return players.filter(p => {
    // Smart search for player name (handles accents, case, partial matches)
    if (filters.search && !fuzzyMatch(filters.search, p.Jugador)) return false
    if (filters.positions.length > 0) {
      const rawPos = (p['Posición específica'] || p['Posición'])?.trim() ?? ''
      const posKey = FILTER_POSITION_MAP[rawPos] ?? ''
      if (!filters.positions.includes(posKey)) return false
    }
    // Smart search for team name
    if (filters.teamSearch && !fuzzyMatch(filters.teamSearch, p.Equipo)) return false
    if (filters.minAge > 0 && p.ageNum < filters.minAge) return false
    if (filters.maxAge > 0 && p.ageNum > filters.maxAge) return false
    if (filters.minMinutes > 0 && p.minutesPlayed < filters.minMinutes) return false
    if (filters.minMarketValue > 0 && p.marketValueRaw < filters.minMarketValue) return false
    if (filters.maxMarketValue > 0 && p.marketValueRaw > filters.maxMarketValue) return false
    if (filters.contractFrom || filters.contractTo) {
      const cd = parseContractDate(p['Vencimiento contrato'])
      if (cd) {
        if (filters.contractFrom && cd < new Date(filters.contractFrom)) return false
        if (filters.contractTo && cd > new Date(filters.contractTo)) return false
      }
    }
    // Filter by pie
    if (filters.pie) {
      const playerPie = (p.Pie || '').toLowerCase().trim()
      if (playerPie !== filters.pie.toLowerCase()) return false
    }
    // Filter by altura
    if (filters.minHeight > 0 || filters.maxHeight > 0) {
      const alturaStr = String(p.Altura ?? '').replace(/[^\d]/g, '')
      const altura = parseInt(alturaStr, 10)
      if (isNaN(altura) || altura < 100) return false
      if (filters.minHeight > 0 && altura < filters.minHeight) return false
      if (filters.maxHeight > 0 && altura > filters.maxHeight) return false
    }
    return true
  })
}

export default function InternalScoutingPage() {
  const { internal, loading, error } = useData()
  const [filters, setFilters] = useState<FilterState>(loadFiltersFromStorage)
  const [exporting, setExporting] = useState(false)
  const [showMobileFilters, setShowMobileFilters] = useState(false)

  // Count active filters
  const activeFiltersCount = [
    filters.positions.length > 0,
    filters.leagues.length > 0,
    filters.teamSearch,
    filters.minAge > 0,
    filters.maxAge > 0,
    filters.minMinutes > 0,
    filters.minMarketValue > 0,
    filters.maxMarketValue > 0,
    filters.maxContractMonths > 0,
    filters.representante,
    filters.pie,
    filters.minHeight > 0,
    filters.maxHeight > 0,
    filters.selectedMetrics.length > 0,
  ].filter(Boolean).length

  // Save filters to storage when they change
  useEffect(() => {
    saveFiltersToStorage(filters)
  }, [filters])

  const filtered = useMemo(() => applyFilters(internal, filters), [internal, filters])
  const handleReset = useCallback(() => {
    setFilters(DEFAULT_FILTERS)
    sessionStorage.removeItem(FILTERS_STORAGE_KEY)
  }, [])

  const handleExport = async () => {
    setExporting(true)
    try { await exportTableToPdf('interno') } finally { setExporting(false) }
  }

  if (loading) return <LoadingSpinner fullScreen message="Cargando scouting interno..." />
  if (error) return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-8">
      <EmptyState title="Error al cargar datos" description={error} icon="error" />
    </div>
  )

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-apple-gray-800 dark:text-white tracking-tight">
            Scouting Interno
          </h1>
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
            {filtered.length.toLocaleString('es')} de {internal.length.toLocaleString('es')} jugadores · Doble G Sports Group
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Buscar jugador..."
              value={filters.search}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
              className="input-apple pl-9 pr-4 w-56"
            />
          </div>
          {/* Export PDF */}
          <button
            onClick={handleExport}
            disabled={exporting || filtered.length === 0}
            className="btn-apple-primary disabled:opacity-50 disabled:cursor-not-allowed"
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
        </div>
      </div>

      {/* Layout */}
      <div className="flex gap-6">
        <FilterSidebar players={internal} filters={filters} onChange={setFilters} onReset={handleReset} />
        <div className="flex-1 min-w-0">
          <PlayerTable players={filtered} source="interno" selectedMetrics={filters.selectedMetrics} />
        </div>
      </div>
    </div>
  )
}
