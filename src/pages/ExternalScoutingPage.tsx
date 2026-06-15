import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlayersList, useLeagues, useAgents } from '@/hooks/usePlayerStats'
import { fetchTeamsByLeague, type TeamInfo } from '@/services/playerStatsService'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import { getScoreColorClass, getScoreBgClass } from '@/components/ui/ScoreBar'
import { PlayerPhoto, TeamLogo } from '@/components/ui/PlayerPhoto'
import type { Position, PlayerWithScore } from '@/types/scoring'
import { POSITION_DISPLAY, displayPosition } from '@/types/scoring'
import { useAuth } from '@/context/AuthContext'
import { addScoutPlayer } from '@/services/scoutPlayersService'
import Slider from 'rc-slider'
import 'rc-slider/assets/index.css'

const POSITIONS: { key: Position; label: string }[] = (
  Object.entries(POSITION_DISPLAY) as [Position, string][]
).map(([key, label]) => ({ key, label }))

const PAGE_SIZE = 50

interface Filters {
  search: string
  positions: Position[]
  league_id: number | undefined
  team_id: number | undefined
  min_matches: number
  min_score: number
  min_age: number
  max_age: number
  min_market_value: number
  max_market_value: number
  max_contract_months: number
  agents: string[]
}

const DEFAULT_FILTERS: Filters = {
  search: '',
  positions: [],
  league_id: undefined,
  team_id: undefined,
  min_matches: 0,
  min_score: 0,
  min_age: 15,
  max_age: 40,
  min_market_value: 0,
  max_market_value: 50_000_000,
  max_contract_months: 0,
  agents: [],
}

const MARKET_VALUE_STEPS = [
  0, 50_000, 100_000, 200_000, 500_000, 1_000_000, 2_000_000,
  5_000_000, 10_000_000, 20_000_000, 50_000_000,
]

function formatValue(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`
  return String(v)
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

function AgentMultiSelect({
  agents,
  selected,
  onChange,
}: {
  agents: string[]
  selected: string[]
  onChange: (agents: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = agents.filter(a =>
    a.toLowerCase().includes(search.toLowerCase())
  )

  const toggle = (agent: string) => {
    if (selected.includes(agent)) {
      onChange(selected.filter(a => a !== agent))
    } else {
      onChange([...selected, agent])
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="input-apple text-xs py-1.5 px-3 min-w-[160px] text-left flex items-center justify-between gap-2"
      >
        <span className="truncate">
          {selected.length === 0
            ? 'Todos los agentes'
            : selected.length === 1
            ? selected[0]
            : `${selected.length} agentes`}
        </span>
        <svg className={`w-3 h-3 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-[101] bg-white dark:bg-apple-gray-800 rounded-xl shadow-2xl border border-apple-gray-200 dark:border-apple-gray-700 w-64 max-h-72 flex flex-col">
            <div className="p-2 border-b border-apple-gray-100 dark:border-apple-gray-700">
              <input
                type="text"
                placeholder="Buscar agente..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-700 border-0 focus:ring-1 focus:ring-brand-green/50 text-apple-gray-800 dark:text-white placeholder:text-apple-gray-400"
                autoFocus
              />
            </div>
            <div className="overflow-y-auto flex-1 p-1.5">
              {filtered.length === 0 ? (
                <p className="text-xs text-apple-gray-400 px-2 py-3 text-center">Sin resultados</p>
              ) : (
                filtered.map(agent => (
                  <button
                    key={agent}
                    type="button"
                    onClick={() => toggle(agent)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/50 transition-colors"
                  >
                    <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-all ${
                      selected.includes(agent)
                        ? 'bg-brand-green border-brand-green'
                        : 'border-apple-gray-300 dark:border-apple-gray-600'
                    }`}>
                      {selected.includes(agent) && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className="text-apple-gray-700 dark:text-apple-gray-200 truncate">{agent}</span>
                  </button>
                ))
              )}
            </div>
            {selected.length > 0 && (
              <div className="p-2 border-t border-apple-gray-100 dark:border-apple-gray-700">
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="w-full text-xs text-apple-gray-500 hover:text-red-500 transition-colors"
                >
                  Limpiar seleccion
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function BulkTrackingModal({
  players,
  onClose,
  onSuccess,
}: {
  players: PlayerWithScore[]
  onClose: () => void
  onSuccess: () => void
}) {
  const { user, userDisplayName } = useAuth()
  const [list, setList] = useState<'datos' | 'scouts_gg' | 'both'>('datos')
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState(0)

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    const name = userDisplayName || user.email?.split('@')[0] || 'Scout'

    for (let i = 0; i < players.length; i++) {
      const p = players[i]
      await addScoutPlayer(
        {
          full_name: p.name,
          supabase_player_id: p.id,
          club: p.team?.name,
          posicion: p.season_scores[0]?.position || p.primary_position || undefined,
          nacionalidad: p.nationality || undefined,
        },
        list,
        user.id,
        name
      )
      setProgress(i + 1)
    }

    onSuccess()
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-apple-gray-800 rounded-2xl shadow-2xl border border-apple-gray-200 dark:border-apple-gray-700 w-full max-w-sm mx-4 p-5">
        <h3 className="text-lg font-bold text-apple-gray-800 dark:text-white mb-1">
          Agregar a seguimiento
        </h3>
        <p className="text-sm text-apple-gray-500 mb-4">
          {players.length} jugador{players.length > 1 ? 'es' : ''} seleccionado{players.length > 1 ? 's' : ''}
        </p>

        <div className="space-y-2 mb-5">
          {(['datos', 'scouts_gg', 'both'] as const).map(option => (
            <button
              key={option}
              onClick={() => setList(option)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${
                list === option
                  ? 'border-brand-green bg-brand-green/5'
                  : 'border-apple-gray-200 dark:border-apple-gray-700 hover:border-apple-gray-300 dark:hover:border-apple-gray-600'
              }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                list === option ? 'border-brand-green' : 'border-apple-gray-300 dark:border-apple-gray-600'
              }`}>
                {list === option && <div className="w-2 h-2 rounded-full bg-brand-green" />}
              </div>
              <span className="text-sm font-medium text-apple-gray-800 dark:text-white">
                {option === 'datos' ? 'Lista de Datos' : option === 'scouts_gg' ? 'Scouts GG' : 'Ambas listas'}
              </span>
            </button>
          ))}
        </div>

        {saving && (
          <div className="mb-4">
            <div className="h-1.5 bg-apple-gray-100 dark:bg-apple-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-green rounded-full transition-all duration-300"
                style={{ width: `${(progress / players.length) * 100}%` }}
              />
            </div>
            <p className="text-xs text-apple-gray-400 mt-1">{progress} de {players.length}</p>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm text-apple-gray-600 dark:text-apple-gray-400 bg-apple-gray-100 dark:bg-apple-gray-700 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-green hover:bg-emerald-600 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ExternalScoutingPage() {
  const navigate = useNavigate()
  const leagues = useLeagues()
  const [filters, setFilters] = useState<Filters>(loadFilters)
  const [page, setPage] = useState(0)
  const [teams, setTeams] = useState<TeamInfo[]>([])

  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters)) } catch {}
  }, [filters])

  useEffect(() => { setPage(0) }, [filters])

  useEffect(() => {
    if (filters.league_id) {
      fetchTeamsByLeague(filters.league_id).then(setTeams).catch(() => setTeams([]))
    } else {
      setTeams([])
    }
  }, [filters.league_id])

  const queryFilters = useMemo(() => ({
    positions: filters.positions.length ? filters.positions : undefined,
    league_id: filters.league_id,
    team_id: filters.team_id,
    min_score: filters.min_score || undefined,
    min_matches: filters.min_matches || undefined,
    min_age: filters.min_age > 15 ? filters.min_age : undefined,
    max_age: filters.max_age < 40 ? filters.max_age : undefined,
    min_market_value: filters.min_market_value > 0 ? filters.min_market_value : undefined,
    max_market_value: filters.max_market_value < 50_000_000 ? filters.max_market_value : undefined,
    max_contract_months: filters.max_contract_months || undefined,
    agents: filters.agents.length ? filters.agents : undefined,
    search: filters.search || undefined,
    page,
    pageSize: PAGE_SIZE,
  }), [filters, page])

  const { players, count, loading, error } = usePlayersList(queryFilters)
  const allAgents = useAgents()

  const totalPages = Math.ceil(count / PAGE_SIZE)

  const { user, userDisplayName } = useAuth()
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [showTrackingModal, setShowTrackingModal] = useState(false)

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === players.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(players.map(p => p.id)))
    }
  }

  const selectedPlayers = players.filter(p => selectedIds.has(p.id))

  useEffect(() => { setSelectedIds(new Set()) }, [page, filters])

  const handleReset = useCallback(() => {
    setFilters(DEFAULT_FILTERS)
    sessionStorage.removeItem(STORAGE_KEY)
  }, [])

  const handlePlayerClick = (player: PlayerWithScore) => {
    navigate(`/jugador/${encodeURIComponent(player.name)}?source=externo&apiId=${player.id}`)
  }

  const activeCount = [
    filters.positions.length > 0,
    filters.league_id,
    filters.team_id,
    filters.min_matches > 0,
    filters.min_score > 0,
    filters.min_age > 15 || filters.max_age < 40,
    filters.min_market_value > 0 || filters.max_market_value < 50_000_000,
    filters.max_contract_months > 0,
    filters.agents.length > 0,
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
            {filters.positions.length > 0 && <span className="ml-1">· {filters.positions.join(', ')}</span>}
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
              onClick={() => setFilters(f => ({
                ...f,
                positions: f.positions.includes(pos.key)
                  ? f.positions.filter(p => p !== pos.key)
                  : [...f.positions, pos.key],
              }))}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                filters.positions.includes(pos.key)
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
          onChange={e => setFilters(f => ({ ...f, league_id: e.target.value ? Number(e.target.value) : undefined, team_id: undefined }))}
          className="input-apple text-xs py-1.5 px-3 min-w-0 w-auto"
        >
          <option value="">Todas las ligas</option>
          {leagues.map(l => (
            <option key={l.id} value={l.id}>{l.name} ({l.country})</option>
          ))}
        </select>

        {/* Team select (visible when league is selected) */}
        {filters.league_id && teams.length > 0 && (
          <select
            value={filters.team_id ?? ''}
            onChange={e => setFilters(f => ({ ...f, team_id: e.target.value ? Number(e.target.value) : undefined }))}
            className="input-apple text-xs py-1.5 px-3 min-w-0 w-auto"
          >
            <option value="">Todos los equipos</option>
            {teams.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}

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

        {activeCount > 0 && (
          <button
            onClick={handleReset}
            className="text-xs text-apple-gray-500 hover:text-red-500 transition-colors underline ml-1"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Range sliders + extra filters */}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 mb-5">
        {/* Age range */}
        <div className="w-[200px]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400">Edad</span>
            <span className="text-xs font-semibold text-apple-gray-700 dark:text-apple-gray-200 tabular-nums">
              {filters.min_age} – {filters.max_age}
            </span>
          </div>
          <Slider
            range
            min={15}
            max={40}
            value={[filters.min_age, filters.max_age]}
            onChange={(v) => { const [lo, hi] = v as number[]; setFilters(f => ({ ...f, min_age: lo, max_age: hi })) }}
            styles={{ track: { backgroundColor: '#22c55e', height: 4 }, rail: { backgroundColor: '#e5e7eb', height: 4 }, handle: { backgroundColor: '#fff', borderColor: '#22c55e', borderWidth: 2, width: 16, height: 16, marginTop: -6, opacity: 1, boxShadow: '0 1px 3px rgba(0,0,0,0.15)' } }}
          />
        </div>

        {/* Market value range */}
        <div className="w-[220px]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400">Valor de mercado</span>
            <span className="text-xs font-semibold text-apple-gray-700 dark:text-apple-gray-200 tabular-nums">
              {filters.min_market_value > 0 || filters.max_market_value < 50_000_000
                ? `€${formatValue(filters.min_market_value)} – €${formatValue(filters.max_market_value)}`
                : 'Todos'}
            </span>
          </div>
          <Slider
            range
            min={0}
            max={MARKET_VALUE_STEPS.length - 1}
            value={[MARKET_VALUE_STEPS.indexOf(filters.min_market_value), MARKET_VALUE_STEPS.indexOf(filters.max_market_value)]}
            onChange={(v) => { const [lo, hi] = v as number[]; setFilters(f => ({ ...f, min_market_value: MARKET_VALUE_STEPS[lo], max_market_value: MARKET_VALUE_STEPS[hi] })) }}
            styles={{ track: { backgroundColor: '#22c55e', height: 4 }, rail: { backgroundColor: '#e5e7eb', height: 4 }, handle: { backgroundColor: '#fff', borderColor: '#22c55e', borderWidth: 2, width: 16, height: 16, marginTop: -6, opacity: 1, boxShadow: '0 1px 3px rgba(0,0,0,0.15)' } }}
          />
        </div>

        {/* Contract end dropdown */}
        <select
          value={filters.max_contract_months}
          onChange={e => setFilters(f => ({ ...f, max_contract_months: Number(e.target.value) }))}
          className="input-apple text-xs py-1.5 px-3 min-w-0 w-auto"
        >
          <option value={0}>Fin de contrato</option>
          <option value={6}>Vence en 6 meses</option>
          <option value={12}>Vence en 1 año</option>
          <option value={18}>Vence en 18 meses</option>
          <option value={24}>Vence en 2 años</option>
        </select>

        {/* Agent multi-select */}
        <AgentMultiSelect
          agents={allAgents}
          selected={filters.agents}
          onChange={agents => setFilters(f => ({ ...f, agents }))}
        />
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
                  <PlayerPhoto src={player.photo} name={player.name} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-apple-gray-800 dark:text-white truncate">{player.name}</p>
                    <p className="text-xs text-apple-gray-500 truncate">
                      {player.team?.name ?? '—'} · {displayPosition(player.primary_position) || '—'}
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
                    <th className="w-10 py-3 px-2">
                      <input
                        type="checkbox"
                        checked={players.length > 0 && selectedIds.size === players.length}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-apple-gray-300 dark:border-apple-gray-600 text-brand-green focus:ring-brand-green/50"
                      />
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">Jugador</th>
                    <th className="text-left py-3 px-3 text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">Equipo</th>
                    <th className="text-center py-3 px-3 text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">Pos</th>
                    <th className="text-center py-3 px-3 text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">Edad</th>
                    <th className="text-right py-3 px-3 text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">Valor</th>
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
                        <td className="py-2.5 px-2" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(player.id)}
                            onChange={() => toggleSelect(player.id)}
                            className="w-4 h-4 rounded border-apple-gray-300 dark:border-apple-gray-600 text-brand-green focus:ring-brand-green/50"
                          />
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-3">
                            <PlayerPhoto src={player.photo} name={player.name} size="sm" />
                            <span className="text-sm font-medium text-apple-gray-800 dark:text-white truncate max-w-[200px]">
                              {player.name}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <TeamLogo src={player.team?.logo} />
                            <span className="text-sm text-apple-gray-600 dark:text-apple-gray-300 truncate max-w-[150px]">
                              {player.team?.name ?? '—'}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="inline-block px-2 py-0.5 rounded-md bg-apple-gray-100 dark:bg-apple-gray-800 text-xs font-semibold text-apple-gray-600 dark:text-apple-gray-300">
                            {displayPosition(ss?.position ?? player.primary_position) || '—'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center text-sm text-apple-gray-600 dark:text-apple-gray-300 tabular-nums">
                          {age ?? '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right text-sm text-apple-gray-600 dark:text-apple-gray-300 tabular-nums">
                          {player.market_value_eur
                            ? `€${formatValue(player.market_value_eur)}`
                            : '—'}
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

      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white dark:bg-apple-gray-800 rounded-2xl shadow-2xl border border-apple-gray-200 dark:border-apple-gray-700 px-5 py-3 flex flex-wrap items-center gap-4">
          <span className="text-sm font-medium text-apple-gray-600 dark:text-apple-gray-300">
            {selectedIds.size} seleccionado{selectedIds.size > 1 ? 's' : ''}
          </span>
          <button
            onClick={() => setShowTrackingModal(true)}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-brand-green hover:bg-emerald-600 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Agregar a seguimiento
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="p-2 rounded-lg text-apple-gray-400 hover:text-apple-gray-600 dark:hover:text-apple-gray-300 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {showTrackingModal && (
        <BulkTrackingModal
          players={selectedPlayers}
          onClose={() => setShowTrackingModal(false)}
          onSuccess={() => {
            setSelectedIds(new Set())
            setShowTrackingModal(false)
          }}
        />
      )}
    </div>
  )
}
