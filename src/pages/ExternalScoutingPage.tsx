import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlayersList, useLeagues } from '@/hooks/usePlayerStats'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import { getScoreColorClass, getScoreBgClass } from '@/components/ui/ScoreBar'
import type { Position, PlayerWithScore } from '@/types/scoring'

const POSITIONS: { key: Position; label: string }[] = [
  { key: 'ARQ', label: 'ARQ' },
  { key: 'LD', label: 'LD' },
  { key: 'CB', label: 'CB' },
  { key: 'LI', label: 'LI' },
  { key: 'VC', label: 'VC' },
  { key: 'VI', label: 'VI' },
  { key: 'EXT', label: 'EXT' },
  { key: 'DEL', label: 'DEL' },
]

const PAGE_SIZE = 50

interface Filters {
  search: string
  position: Position | ''
  league_id: number | undefined
  min_matches: number
  min_score: number
  max_age: number
}

const DEFAULT_FILTERS: Filters = {
  search: '',
  position: '',
  league_id: undefined,
  min_matches: 0,
  min_score: 0,
  max_age: 0,
}

const STORAGE_KEY = 'external_scouting_supabase_filters'

function loadFilters(): Filters {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (stored) return { ...DEFAULT_FILTERS, ...JSON.parse(stored) }
  } catch {}
  return DEFAULT_FILTERS
}

function getAge(birthDate: string | null): number | null {
  if (!birthDate) return null
  const diff = Date.now() - new Date(birthDate).getTime()
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000))
}

export default function ExternalScoutingPage() {
  const navigate = useNavigate()
  const leagues = useLeagues()
  const [filters, setFilters] = useState<Filters>(loadFilters)
  const [page, setPage] = useState(0)

  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters)) } catch {}
  }, [filters])

  useEffect(() => { setPage(0) }, [filters])

  const queryFilters = useMemo(() => ({
    position: filters.position || undefined,
    league_id: filters.league_id,
    min_score: filters.min_score || undefined,
    min_matches: filters.min_matches || undefined,
    max_age: filters.max_age || undefined,
    search: filters.search || undefined,
    page,
    pageSize: PAGE_SIZE,
  }), [filters, page])

  const { players, count, loading, error } = usePlayersList(queryFilters)

  const totalPages = Math.ceil(count / PAGE_SIZE)

  const handleReset = useCallback(() => {
    setFilters(DEFAULT_FILTERS)
    sessionStorage.removeItem(STORAGE_KEY)
  }, [])

  const handlePlayerClick = (player: PlayerWithScore) => {
    navigate(`/jugador/${encodeURIComponent(player.name)}?source=externo&apiId=${player.id}`)
  }

  const activeCount = [
    filters.position,
    filters.league_id,
    filters.min_matches > 0,
    filters.min_score > 0,
    filters.max_age > 0,
  ].filter(Boolean).length

  if (error) return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-8">
      <EmptyState title="Error al cargar datos" description={error} icon="error" />
    </div>
  )

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-apple-gray-800 dark:text-white tracking-tight">
            Scouting Externo
          </h1>
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
            {count.toLocaleString('es')} jugadores
            {filters.position && <span className="ml-1">· {filters.position}</span>}
          </p>
        </div>
        <div className="relative flex-1 sm:flex-initial sm:max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar jugador..."
            value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            className="input-apple pl-9 pr-4 w-full"
          />
        </div>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {/* Position chips */}
        <div className="flex flex-wrap gap-1.5">
          {POSITIONS.map(pos => (
            <button
              key={pos.key}
              onClick={() => setFilters(f => ({ ...f, position: f.position === pos.key ? '' : pos.key }))}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                filters.position === pos.key
                  ? 'bg-brand-green text-white shadow-sm'
                  : 'bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700'
              }`}
            >
              {pos.label}
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-apple-gray-200 dark:bg-apple-gray-700 hidden sm:block" />

        {/* League select */}
        <select
          value={filters.league_id ?? ''}
          onChange={e => setFilters(f => ({ ...f, league_id: e.target.value ? Number(e.target.value) : undefined }))}
          className="input-apple text-xs py-1.5 px-3 min-w-0 w-auto"
        >
          <option value="">Todas las ligas</option>
          {leagues.map(l => (
            <option key={l.id} value={l.id}>{l.name} ({l.country})</option>
          ))}
        </select>

        {/* Min matches */}
        <select
          value={filters.min_matches}
          onChange={e => setFilters(f => ({ ...f, min_matches: Number(e.target.value) }))}
          className="input-apple text-xs py-1.5 px-3 min-w-0 w-auto"
        >
          <option value={0}>Sin mín. partidos</option>
          <option value={3}>3+ partidos</option>
          <option value={5}>5+ partidos</option>
          <option value={10}>10+ partidos</option>
          <option value={15}>15+ partidos</option>
          <option value={20}>20+ partidos</option>
        </select>

        {/* Min score */}
        <select
          value={filters.min_score}
          onChange={e => setFilters(f => ({ ...f, min_score: Number(e.target.value) }))}
          className="input-apple text-xs py-1.5 px-3 min-w-0 w-auto"
        >
          <option value={0}>Sin mín. score</option>
          <option value={5}>5.0+</option>
          <option value={6}>6.0+</option>
          <option value={7}>7.0+</option>
          <option value={8}>8.0+</option>
        </select>

        {/* Max age */}
        <select
          value={filters.max_age}
          onChange={e => setFilters(f => ({ ...f, max_age: Number(e.target.value) }))}
          className="input-apple text-xs py-1.5 px-3 min-w-0 w-auto"
        >
          <option value={0}>Sin máx. edad</option>
          <option value={20}>Sub 20</option>
          <option value={23}>Sub 23</option>
          <option value={25}>Sub 25</option>
          <option value={30}>Sub 30</option>
        </select>

        {activeCount > 0 && (
          <button
            onClick={handleReset}
            className="text-xs text-apple-gray-500 hover:text-red-500 transition-colors underline ml-1"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Table */}
      {loading && page === 0 ? (
        <LoadingSpinner message="Cargando jugadores..." />
      ) : players.length === 0 ? (
        <EmptyState title="Sin resultados" description="No se encontraron jugadores con los filtros aplicados." icon="filter" />
      ) : (
        <>
          {/* Mobile cards */}
          <div className="block lg:hidden space-y-2">
            {players.map(player => {
              const age = getAge(player.birth_date)
              const score = player.primary_score
              return (
                <button
                  key={`${player.id}-${player.season_scores[0]?.position}`}
                  onClick={() => handlePlayerClick(player)}
                  className="w-full text-left card-apple p-3 flex items-center gap-3 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/50 transition-colors"
                >
                  {player.photo ? (
                    <img src={player.photo} alt="" className="w-10 h-10 rounded-full object-cover bg-apple-gray-100 dark:bg-apple-gray-800 flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-apple-gray-200 dark:bg-apple-gray-700 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-medium text-apple-gray-500">{player.name?.charAt(0)}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-apple-gray-800 dark:text-white truncate">{player.name}</p>
                    <p className="text-xs text-apple-gray-500 truncate">
                      {player.team?.name ?? '—'} · {player.primary_position ?? '—'}
                      {age !== null && <span> · {age} años</span>}
                    </p>
                  </div>
                  {score !== null && (
                    <div className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-sm font-bold tabular-nums ${getScoreColorClass(score, '10')} ${getScoreBgClass(score, '10')}`}>
                      {score.toFixed(1)}
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden lg:block">
            <div className="card-apple overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-apple-gray-200 dark:border-apple-gray-700">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">Jugador</th>
                    <th className="text-left py-3 px-3 text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">Equipo</th>
                    <th className="text-center py-3 px-3 text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">Pos</th>
                    <th className="text-center py-3 px-3 text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">Edad</th>
                    <th className="text-center py-3 px-3 text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">PJ</th>
                    <th className="text-center py-3 px-3 text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">Goles</th>
                    <th className="text-center py-3 px-3 text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">Asist</th>
                    <th className="text-center py-3 px-3 text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">Rating</th>
                    <th className="text-center py-3 px-3 text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-apple-gray-100 dark:divide-apple-gray-800">
                  {players.map(player => {
                    const age = getAge(player.birth_date)
                    const ss = player.season_scores[0]
                    const score = ss?.avg_score ?? null
                    return (
                      <tr
                        key={`${player.id}-${ss?.position}`}
                        onClick={() => handlePlayerClick(player)}
                        className="cursor-pointer hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/50 transition-colors"
                      >
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-3">
                            {player.photo ? (
                              <img src={player.photo} alt="" className="w-8 h-8 rounded-full object-cover bg-apple-gray-100 dark:bg-apple-gray-800" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-apple-gray-200 dark:bg-apple-gray-700 flex items-center justify-center">
                                <span className="text-xs font-medium text-apple-gray-500">{player.name?.charAt(0)}</span>
                              </div>
                            )}
                            <span className="text-sm font-medium text-apple-gray-800 dark:text-white truncate max-w-[200px]">
                              {player.name}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            {player.team?.logo && (
                              <img src={player.team.logo} alt="" className="w-5 h-5 object-contain" />
                            )}
                            <span className="text-sm text-apple-gray-600 dark:text-apple-gray-300 truncate max-w-[150px]">
                              {player.team?.name ?? '—'}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="inline-block px-2 py-0.5 rounded-md bg-apple-gray-100 dark:bg-apple-gray-800 text-xs font-semibold text-apple-gray-600 dark:text-apple-gray-300">
                            {ss?.position ?? player.primary_position ?? '—'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center text-sm text-apple-gray-600 dark:text-apple-gray-300 tabular-nums">
                          {age ?? '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center text-sm text-apple-gray-600 dark:text-apple-gray-300 tabular-nums">
                          {ss?.matches_played ?? 0}
                        </td>
                        <td className="py-2.5 px-3 text-center text-sm text-apple-gray-600 dark:text-apple-gray-300 tabular-nums">
                          {ss?.total_goals ?? 0}
                        </td>
                        <td className="py-2.5 px-3 text-center text-sm text-apple-gray-600 dark:text-apple-gray-300 tabular-nums">
                          {ss?.total_assists ?? 0}
                        </td>
                        <td className="py-2.5 px-3 text-center text-sm text-apple-gray-600 dark:text-apple-gray-300 tabular-nums">
                          {ss?.avg_rating?.toFixed(1) ?? '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {score !== null ? (
                            <span className={`inline-block px-2.5 py-1 rounded-lg text-sm font-bold tabular-nums ${getScoreColorClass(score, '10')} ${getScoreBgClass(score, '10')}`}>
                              {score.toFixed(1)}
                            </span>
                          ) : (
                            <span className="text-apple-gray-400 text-sm">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 px-1">
              <p className="text-xs text-apple-gray-500">
                Página {page + 1} de {totalPages} · {count.toLocaleString('es')} jugadores
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {loading && page > 0 && (
        <div className="flex justify-center py-4">
          <div className="flex items-center gap-2 text-sm text-apple-gray-500">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Cargando...
          </div>
        </div>
      )}
    </div>
  )
}
