import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlayersList, useLeagues, useAgents, useNationalities } from '@/hooks/usePlayerStats'
import { fetchTeamsByLeague, type TeamInfo, type PlayerListSort } from '@/services/playerStatsService'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import { getScoreColorClass, getScoreBgClass } from '@/components/ui/ScoreBar'
import { PlayerPhoto, TeamLogo } from '@/components/ui/PlayerPhoto'
import { AgentBadge, AgentColumnLabel, agentKind } from '@/components/ui/AgentBadge'
import MultiSelect from '@/components/filters/MultiSelect'
import type { Position, PlayerWithScore } from '@/types/scoring'
import { POSITION_DISPLAY, displayPosition } from '@/types/scoring'
import { useAuth } from '@/context/AuthContext'
import { useCurrency } from '@/context/CurrencyContext'
import { formatMarketValueInCurrency } from '@/utils/scoring'
import { addScoutPlayer } from '@/services/scoutPlayersService'
import MobileSheet from '@/components/ui/MobileSheet'
import MobileFilterPanel, { MobileFilterButton } from '@/components/filters/MobileFilterPanel'
import Slider from 'rc-slider'
import 'rc-slider/assets/index.css'
import { useLanguage } from '@/context/LanguageContext'
import { LANGUAGE_LOCALES } from '@/constants/translations'
import { leagueLabel } from '@/utils/leagueLabels'
import { groupNationalities, type NationalityOption } from '@/utils/nationalities'

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
  /** Nombres en castellano (ver groupNationalities). */
  nationalities: string[]
  sort: PlayerListSort
  sortDir: 'asc' | 'desc'
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
  nationalities: [],
  sort: 'rating',
  sortDir: 'desc',
}

/** Un filtro elegido se nota sin gritar: borde y texto verdes. */
const ACTIVE_SELECT = '!border-brand-green/50 !text-brand-green font-semibold'

/** Primer toque en una columna: de mayor a menor; en Edad, los más jóvenes primero. */
const FIRST_SORT_DIR: Record<PlayerListSort, 'asc' | 'desc'> = {
  rating: 'desc', goals: 'desc', assists: 'desc', matches: 'desc', value: 'desc', age: 'asc',
  // Agente: primero los "sin dato" (los que hay que averiguar), después sin representante y A-Z
  agent: 'asc',
}

const MARKET_VALUE_STEPS = [
  0, 50_000, 100_000, 200_000, 500_000, 1_000_000, 2_000_000,
  5_000_000, 10_000_000, 20_000_000, 50_000_000,
]

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

function NationalityAndAgentFilters({
  filters,
  setFilters,
  allAgents,
  nationalityOptions,
  inline = false,
}: {
  filters: Filters
  setFilters: React.Dispatch<React.SetStateAction<Filters>>
  allAgents: string[]
  nationalityOptions: NationalityOption[]
  inline?: boolean
}) {
  const { t } = useLanguage()
  return (
    <>
      {nationalityOptions.length > 0 && <MultiSelect
        options={nationalityOptions.map(o => o.label)}
        selected={filters.nationalities}
        onChange={nationalities => setFilters(f => ({ ...f, nationalities }))}
        allLabel={t('externo.todasLasNacionalidades')}
        pluralLabel={t('externo.nacionalidadesLabel')}
        searchPlaceholder={t('externo.buscarNacionalidad')}
        clearLabel={t('externo.limpiarSeleccion')}
        inline={inline}
      />}
      <MultiSelect
        options={[t('agente.sinDato'), t('agente.sinRepresentante'), ...allAgents.filter(a => agentKind(a) !== 'none')]}
        selected={filters.agents}
        onChange={agents => setFilters(f => ({ ...f, agents }))}
        allLabel={t('externo.todosLosAgentes')}
        pluralLabel={t('externo.agentesLabel')}
        searchPlaceholder={t('externo.buscarAgente')}
        clearLabel={t('externo.limpiarSeleccionAgentes')}
        inline={inline}
      />
    </>
  )
}

/** Encabezado de columna que ordena la lista: un toque elige la columna, otro invierte. */
function SortHeader({
  column,
  label,
  filters,
  setFilters,
  align = 'center',
}: {
  column: PlayerListSort
  label: React.ReactNode
  filters: Filters
  setFilters: React.Dispatch<React.SetStateAction<Filters>>
  align?: 'center' | 'right' | 'left'
}) {
  const active = filters.sort === column
  const onClick = () => setFilters(f => f.sort === column
    ? { ...f, sortDir: f.sortDir === 'desc' ? 'asc' : 'desc' }
    : { ...f, sort: column, sortDir: FIRST_SORT_DIR[column] })
  return (
    <th
      aria-sort={active ? (filters.sortDir === 'desc' ? 'descending' : 'ascending') : 'none'}
      className={`py-3 px-3 text-xs font-semibold uppercase tracking-wider ${align === 'right' ? 'text-right' : align === 'left' ? 'text-left' : 'text-center'}`}
    >
      <button
        type="button"
        onClick={onClick}
        className={`group inline-flex items-center gap-1 uppercase tracking-wider transition-colors ${
          active
            ? 'text-brand-green'
            : 'text-apple-gray-500 dark:text-apple-gray-400 hover:text-apple-gray-800 dark:hover:text-white'
        }`}
      >
        {label}
        <svg className={`w-3 h-3 transition-all ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'} ${active && filters.sortDir === 'asc' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    </th>
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
  const { t } = useLanguage()
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
    <MobileSheet open onClose={saving ? () => {} : onClose} title={t('externo.agregarSeguimiento')}>
      <div>
        <p className="text-sm text-apple-gray-500 -mt-1 mb-4">
          {players.length} {players.length > 1 ? t('externo.jugadores') : t('externo.jugadorSingular')} {players.length > 1 ? t('externo.seleccionadoPlural') : t('externo.seleccionadoSingular')}
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
                {option === 'datos' ? t('externo.listaDatos') : option === 'scouts_gg' ? 'Scouts GG' : t('externo.ambasListas')}
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
            <p className="text-xs text-apple-gray-400 mt-1">{progress} {t('externo.de')} {players.length}</p>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm text-apple-gray-600 dark:text-apple-gray-400 bg-apple-gray-100 dark:bg-apple-gray-700 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 disabled:opacity-50 transition-colors"
          >
            {t('externo.cancelar')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-green hover:bg-emerald-600 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : t('externo.confirmar')}
          </button>
        </div>
      </div>
    </MobileSheet>
  )
}

/**
 * Controles de filtro de Scouting Externo. Mobile-first (apilado); bajo `lg:`
 * reproduce exactamente las dos barras horizontales del desktop. Se renderiza
 * dos veces: una en la barra de desktop (`hidden lg:block`) y otra dentro del
 * bottom-sheet de mobile. `agentInline` hace que el multiselect de agentes se
 * despliegue en flujo (para el panel), en vez de como dropdown absoluto.
 */
function ScoutingFilters({
  filters,
  setFilters,
  leagues,
  teams,
  allAgents,
  nationalityOptions,
  activeCount,
  onReset,
  agentInline = false,
}: {
  filters: Filters
  setFilters: React.Dispatch<React.SetStateAction<Filters>>
  leagues: ReturnType<typeof useLeagues>
  teams: TeamInfo[]
  allAgents: string[]
  nationalityOptions: NationalityOption[]
  activeCount: number
  onReset: () => void
  agentInline?: boolean
}) {
  const { t } = useLanguage()
  const { currency, rate } = useCurrency()
  const selectCls = 'input-apple text-xs py-2 lg:py-1.5 px-3 w-full lg:w-auto lg:min-w-0'

  return (
    <div className="space-y-5 lg:space-y-0">
      {/* Fila 1: chips de posición + selects */}
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:gap-2 lg:mb-5">
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

        <div className="w-px h-6 bg-apple-gray-200 dark:bg-apple-gray-700 hidden lg:block" />

        {/* Liga */}
        <select
          value={filters.league_id ?? ''}
          onChange={e => setFilters(f => ({ ...f, league_id: e.target.value ? Number(e.target.value) : undefined, team_id: undefined }))}
          className={selectCls}
        >
          <option value="">{t('externo.todasLasLigas')}</option>
          {leagues.map(l => (
            <option key={l.id} value={l.id}>{leagueLabel(l)}</option>
          ))}
        </select>

        {/* Equipo (si hay liga elegida) */}
        {filters.league_id && teams.length > 0 && (
          <select
            value={filters.team_id ?? ''}
            onChange={e => setFilters(f => ({ ...f, team_id: e.target.value ? Number(e.target.value) : undefined }))}
            className={selectCls}
          >
            <option value="">{t('externo.todosLosEquipos')}</option>
            {teams.map(team => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
          </select>
        )}

        {/* Mín. partidos */}
        <select
          value={filters.min_matches}
          onChange={e => setFilters(f => ({ ...f, min_matches: Number(e.target.value) }))}
          className={selectCls}
        >
          <option value={0}>{t('externo.sinMinPartidos')}</option>
          <option value={3}>{t('externo.partidosMin3')}</option>
          <option value={5}>{t('externo.partidosMin5')}</option>
          <option value={10}>{t('externo.partidosMin10')}</option>
          <option value={15}>{t('externo.partidosMin15')}</option>
          <option value={20}>{t('externo.partidosMin20')}</option>
        </select>

        {/* Mín. score */}
        <select
          value={filters.min_score}
          onChange={e => setFilters(f => ({ ...f, min_score: Number(e.target.value) }))}
          className={selectCls}
        >
          <option value={0}>{t('externo.sinMinScore')}</option>
          <option value={6.0}>6.0+</option>
          <option value={6.4}>6.4+</option>
          <option value={6.8}>6.8+</option>
          <option value={7.3}>7.3+</option>
        </select>

        {activeCount > 0 && (
          <button
            onClick={onReset}
            className="text-xs text-apple-gray-500 hover:text-red-500 transition-colors underline text-left lg:ml-1"
          >
            {t('externo.limpiarFiltros')}
          </button>
        )}
      </div>

      {/* Fila 2: sliders de rango + contrato + agentes */}
      <div className="flex flex-col gap-5 lg:flex-row lg:flex-wrap lg:items-end lg:gap-x-6 lg:gap-y-3 lg:mb-5">
        {/* Edad */}
        <div className="w-full lg:w-[200px]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400">{t('externo.edad')}</span>
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

        {/* Valor de mercado */}
        <div className="w-full lg:w-[220px]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400">{t('externo.valorMercado')}</span>
            <span className="text-xs font-semibold text-apple-gray-700 dark:text-apple-gray-200 tabular-nums">
              {filters.min_market_value > 0 || filters.max_market_value < 50_000_000
                ? `${formatMarketValueInCurrency(filters.min_market_value, currency, rate)} – ${formatMarketValueInCurrency(filters.max_market_value, currency, rate)}`
                : t('externo.todos')}
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

        {/* Fin de contrato */}
        <select
          value={filters.max_contract_months}
          onChange={e => setFilters(f => ({ ...f, max_contract_months: Number(e.target.value) }))}
          className={selectCls}
        >
          <option value={0}>{t('externo.finDeContrato')}</option>
          <option value={6}>{t('externo.vence6Meses')}</option>
          <option value={12}>{t('externo.vence1Anio')}</option>
          <option value={18}>{t('externo.vence18Meses')}</option>
          <option value={24}>{t('externo.vence2Anios')}</option>
        </select>

        {/* Agentes */}
        <NationalityAndAgentFilters
          filters={filters}
          setFilters={setFilters}
          allAgents={allAgents}
          nationalityOptions={nationalityOptions}
          inline={agentInline}
        />
      </div>
    </div>
  )
}

/**
 * Lo que está filtrando la lista, siempre a la vista (sutil): cada filtro activo
 * es un chip que se saca con la ×, y a la derecha la cantidad de jugadores.
 * Antes uno se olvidaba de un filtro o de lo escrito en el buscador y creía que
 * faltaban jugadores.
 */
function ActiveFiltersBar({
  filters,
  setFilters,
  leagues,
  teams,
  count,
  loading,
  onReset,
}: {
  filters: Filters
  setFilters: React.Dispatch<React.SetStateAction<Filters>>
  leagues: ReturnType<typeof useLeagues>
  teams: TeamInfo[]
  count: number
  loading: boolean
  onReset: () => void
}) {
  const { t, language } = useLanguage()
  const { currency, rate } = useCurrency()
  const chips: { key: string; label: string; clear: () => void }[] = []
  const add = (key: string, label: string, clear: (f: Filters) => Filters) =>
    chips.push({ key, label, clear: () => setFilters(f => clear(f)) })

  if (filters.search.trim()) add('search', `“${filters.search.trim()}”`, f => ({ ...f, search: '' }))
  for (const pos of filters.positions) {
    add(`pos-${pos}`, POSITIONS.find(p => p.key === pos)?.label ?? pos, f => ({ ...f, positions: f.positions.filter(p => p !== pos) }))
  }
  if (filters.league_id) {
    const league = leagues.find(l => l.id === filters.league_id)
    add('league', league ? leagueLabel(league) : t('externo.liga'), f => ({ ...f, league_id: undefined, team_id: undefined }))
  }
  if (filters.team_id) add('team', teams.find(tm => tm.id === filters.team_id)?.name ?? t('externo.equipo'), f => ({ ...f, team_id: undefined }))
  for (const n of filters.nationalities) add(`nat-${n}`, n, f => ({ ...f, nationalities: f.nationalities.filter(x => x !== n) }))
  for (const a of filters.agents) add(`agent-${a}`, a, f => ({ ...f, agents: f.agents.filter(x => x !== a) }))
  if (filters.min_matches > 0) add('pj', `${filters.min_matches}+ ${t('externo.colPJ')}`, f => ({ ...f, min_matches: 0 }))
  if (filters.min_score > 0) add('score', `${t('externo.colScore')} ${filters.min_score}+`, f => ({ ...f, min_score: 0 }))
  if (filters.min_age > 15 || filters.max_age < 40) add('age', `${filters.min_age}–${filters.max_age} ${t('externo.anios')}`, f => ({ ...f, min_age: 15, max_age: 40 }))
  if (filters.min_market_value > 0 || filters.max_market_value < 50_000_000) {
    add('value', `${formatMarketValueInCurrency(filters.min_market_value, currency, rate)} – ${formatMarketValueInCurrency(filters.max_market_value, currency, rate)}`,
      f => ({ ...f, min_market_value: 0, max_market_value: 50_000_000 }))
  }
  if (filters.max_contract_months > 0) add('contract', t('externo.contratoHastaMeses').replace('{n}', String(filters.max_contract_months)), f => ({ ...f, max_contract_months: 0 }))

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-4 min-h-[28px]">
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-2xs font-semibold uppercase tracking-wider text-apple-gray-400 mr-0.5">{t('externo.filtrando')}</span>
          {chips.map(chip => (
            <span key={chip.key} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full text-xs font-medium bg-brand-green/10 text-brand-green ring-1 ring-brand-green/20">
              {chip.label}
              <button type="button" onClick={chip.clear} aria-label={t('externo.quitarFiltro')} className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-brand-green/20 transition-colors">
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </span>
          ))}
          {chips.length > 1 && (
            <button type="button" onClick={onReset} className="text-xs text-apple-gray-400 hover:text-red-500 transition-colors ml-1">
              {t('externo.limpiarTodo')}
            </button>
          )}
        </div>
      )}
      <span className={`ml-auto text-xs tabular-nums whitespace-nowrap ${loading ? 'text-apple-gray-300 dark:text-apple-gray-600' : 'text-apple-gray-500 dark:text-apple-gray-400'}`}>
        <span className="font-semibold text-apple-gray-700 dark:text-apple-gray-200">{count.toLocaleString(LANGUAGE_LOCALES[language])}</span> {count === 1 ? t('externo.jugadorSingular') : t('externo.jugadores')}
      </span>
    </div>
  )
}

export default function ExternalScoutingPage() {
  const { language, t } = useLanguage()
  const navigate = useNavigate()
  const leagues = useLeagues()
  const { currency, rate } = useCurrency()
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

  const rawNationalities = useNationalities()
  const nationalityOptions = useMemo(() => groupNationalities(rawNationalities), [rawNationalities])

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
    // "Sin dato" y "Sin representante" viajan como marcas especiales (ver fetch_players_list)
    agents: filters.agents.length
      ? filters.agents.map(a => a === t('agente.sinDato') ? '__sin_dato__' : a === t('agente.sinRepresentante') ? '__sin_representante__' : a)
      : undefined,
    nationalities: filters.nationalities.length
      ? nationalityOptions.filter(o => filters.nationalities.includes(o.label)).flatMap(o => o.values)
      : undefined,
    search: filters.search || undefined,
    sort: filters.sort !== 'rating' || filters.sortDir !== 'desc' ? filters.sort : undefined,
    sortDir: filters.sortDir,
    page,
    pageSize: PAGE_SIZE,
  }), [filters, page, nationalityOptions, t])

  const { players, count, loading, error } = usePlayersList(queryFilters)
  const allAgents = useAgents()

  const totalPages = Math.ceil(count / PAGE_SIZE)

  const { user, userDisplayName } = useAuth()
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [showTrackingModal, setShowTrackingModal] = useState(false)
  const [showFilters, setShowFilters] = useState(false)

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
    setFilters(f => ({ ...DEFAULT_FILTERS, sort: f.sort, sortDir: f.sortDir }))
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
    filters.nationalities.length > 0,
  ].filter(Boolean).length

  if (error) return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-8">
      <EmptyState title={t('externo.errorCargarDatos')} description={error} icon="error" />
    </div>
  )

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-apple-gray-800 dark:text-white tracking-tight">
            {t('externo.title')}
          </h1>
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
            {t('externo.subtituloLista')}
          </p>
        </div>
        <div className="relative flex-1 sm:flex-initial sm:max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder={t('externo.buscarJugador')}
            value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            className={`input-apple pl-9 pr-9 w-full ${filters.search.trim() ? 'ring-2 ring-brand-green/30 border-brand-green/50' : ''}`}
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => setFilters(f => ({ ...f, search: '' }))}
              aria-label={t('externo.borrarBusqueda')}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full text-apple-gray-400 hover:text-apple-gray-700 dark:hover:text-white hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* Filtros — desktop (en mobile van al bottom-sheet más abajo) */}
      <div className="hidden lg:block">
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
          className={`input-apple text-xs py-1.5 px-3 min-w-0 w-auto ${filters.league_id ? ACTIVE_SELECT : ''}`}
        >
          <option value="">{t('externo.todasLasLigas')}</option>
          {leagues.map(l => (
            <option key={l.id} value={l.id}>{leagueLabel(l)}</option>
          ))}
        </select>

        {/* Team select (visible when league is selected) */}
        {filters.league_id && teams.length > 0 && (
          <select
            value={filters.team_id ?? ''}
            onChange={e => setFilters(f => ({ ...f, team_id: e.target.value ? Number(e.target.value) : undefined }))}
            className={`input-apple text-xs py-1.5 px-3 min-w-0 w-auto ${filters.team_id ? ACTIVE_SELECT : ''}`}
          >
            <option value="">{t('externo.todosLosEquipos')}</option>
            {teams.map(team => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
          </select>
        )}

        {/* Min matches */}
        <select
          value={filters.min_matches}
          onChange={e => setFilters(f => ({ ...f, min_matches: Number(e.target.value) }))}
          className={`input-apple text-xs py-1.5 px-3 min-w-0 w-auto ${filters.min_matches > 0 ? ACTIVE_SELECT : ''}`}
        >
          <option value={0}>{t('externo.sinMinPartidos')}</option>
          <option value={3}>{t('externo.partidosMin3')}</option>
          <option value={5}>{t('externo.partidosMin5')}</option>
          <option value={10}>{t('externo.partidosMin10')}</option>
          <option value={15}>{t('externo.partidosMin15')}</option>
          <option value={20}>{t('externo.partidosMin20')}</option>
        </select>

        {/* Min score */}
        <select
          value={filters.min_score}
          onChange={e => setFilters(f => ({ ...f, min_score: Number(e.target.value) }))}
          className={`input-apple text-xs py-1.5 px-3 min-w-0 w-auto ${filters.min_score > 0 ? ACTIVE_SELECT : ''}`}
        >
          <option value={0}>{t('externo.sinMinScore')}</option>
          <option value={6.0}>6.0+</option>
          <option value={6.4}>6.4+</option>
          <option value={6.8}>6.8+</option>
          <option value={7.3}>7.3+</option>
        </select>

        {activeCount > 0 && (
          <button
            onClick={handleReset}
            className="text-xs text-apple-gray-500 hover:text-red-500 transition-colors underline ml-1"
          >
            {t('externo.limpiarFiltros')}
          </button>
        )}
      </div>

      {/* Range sliders + extra filters */}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 mb-5">
        {/* Age range */}
        <div className="w-[200px]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400">{t('externo.edad')}</span>
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
            <span className="text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400">{t('externo.valorMercado')}</span>
            <span className="text-xs font-semibold text-apple-gray-700 dark:text-apple-gray-200 tabular-nums">
              {filters.min_market_value > 0 || filters.max_market_value < 50_000_000
                ? `${formatMarketValueInCurrency(filters.min_market_value, currency, rate)} – ${formatMarketValueInCurrency(filters.max_market_value, currency, rate)}`
                : t('externo.todos')}
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
          className={`input-apple text-xs py-1.5 px-3 min-w-0 w-auto ${filters.max_contract_months > 0 ? ACTIVE_SELECT : ''}`}
        >
          <option value={0}>{t('externo.finDeContrato')}</option>
          <option value={6}>{t('externo.vence6Meses')}</option>
          <option value={12}>{t('externo.vence1Anio')}</option>
          <option value={18}>{t('externo.vence18Meses')}</option>
          <option value={24}>{t('externo.vence2Anios')}</option>
        </select>

        {/* Agent multi-select */}
        <NationalityAndAgentFilters
          filters={filters}
          setFilters={setFilters}
          allAgents={allAgents}
          nationalityOptions={nationalityOptions}
        />
      </div>
      </div>

      {/* Filtros — mobile: FAB + bottom-sheet */}
      {selectedIds.size === 0 && (
        <MobileFilterButton onClick={() => setShowFilters(true)} activeCount={activeCount} />
      )}
      <MobileFilterPanel isOpen={showFilters} onClose={() => setShowFilters(false)} activeCount={activeCount}>
        <ScoutingFilters
          filters={filters}
          setFilters={setFilters}
          leagues={leagues}
          teams={teams}
          allAgents={allAgents}
          nationalityOptions={nationalityOptions}
          activeCount={activeCount}
          onReset={handleReset}
          agentInline
        />
        <button
          onClick={() => setShowFilters(false)}
          className="mt-6 w-full py-3 rounded-xl text-sm font-semibold text-gray-900 bg-brand-green hover:bg-emerald-500 transition-colors"
        >
          {t('externo.ver')} {count.toLocaleString(LANGUAGE_LOCALES[language])} {t('externo.resultados')}
        </button>
      </MobileFilterPanel>

      <ActiveFiltersBar
        filters={filters}
        setFilters={setFilters}
        leagues={leagues}
        teams={teams}
        count={count}
        loading={loading}
        onReset={handleReset}
      />

      {/* Table */}
      {loading && page === 0 ? (
        <LoadingSpinner message={t('externo.cargandoJugadores')} />
      ) : players.length === 0 ? (
        <EmptyState title={t('externo.sinResultadosTitulo')} description={t('externo.sinResultadosDescripcion')} icon="filter" />
      ) : (
        <>
          {/* Mobile: orden (en desktop se toca el encabezado de la columna) */}
          <div className="flex lg:hidden items-center gap-2 mb-3">
            <span className="text-xs text-apple-gray-500 dark:text-apple-gray-400">{t('externo.ordenarPor')}</span>
            <select
              value={filters.sort}
              onChange={e => {
                const sort = e.target.value as PlayerListSort
                setFilters(f => ({ ...f, sort, sortDir: FIRST_SORT_DIR[sort] }))
              }}
              className="input-apple text-xs py-1.5 px-3 flex-1"
            >
              <option value="rating">{t('externo.colScore')}</option>
              <option value="goals">{t('externo.colGoles')}</option>
              <option value="assists">{t('externo.colAsist')}</option>
              <option value="matches">{t('externo.colPJ')}</option>
              <option value="age">{t('externo.edad')}</option>
              <option value="value">{t('externo.colValor')}</option>
              <option value="agent">{t('agente.columna')} ({t('agente.segunTmkt')})</option>
            </select>
            <button
              type="button"
              onClick={() => setFilters(f => ({ ...f, sortDir: f.sortDir === 'desc' ? 'asc' : 'desc' }))}
              aria-label={filters.sortDir === 'desc' ? 'Mayor a menor' : 'Menor a mayor'}
              className="input-apple py-1.5 px-2.5 text-brand-green"
            >
              <svg className={`w-4 h-4 transition-transform ${filters.sortDir === 'asc' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

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
                      {age !== null && <span> · {age} {t('externo.anios')}</span>}
                    </p>
                    <span className="mt-1 flex min-w-0">
                      <AgentBadge agent={player.agent} className="max-w-full" />
                    </span>
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
                    <th className="text-left py-3 px-4 text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">{t('externo.colJugador')}</th>
                    <th className="text-left py-3 px-3 text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">{t('externo.colEquipo')}</th>
                    <SortHeader column="agent" label={<AgentColumnLabel />} filters={filters} setFilters={setFilters} align="left" />
                    <th className="text-center py-3 px-3 text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">{t('externo.colPos')}</th>
                    <SortHeader column="age" label={t('externo.edad')} filters={filters} setFilters={setFilters} />
                    <SortHeader column="value" label={t('externo.colValor')} filters={filters} setFilters={setFilters} align="right" />
                    <SortHeader column="matches" label={t('externo.colPJ')} filters={filters} setFilters={setFilters} />
                    <SortHeader column="goals" label={t('externo.colGoles')} filters={filters} setFilters={setFilters} />
                    <SortHeader column="assists" label={t('externo.colAsist')} filters={filters} setFilters={setFilters} />
                    <SortHeader column="rating" label={t('externo.colScore')} filters={filters} setFilters={setFilters} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-apple-gray-100 dark:divide-apple-gray-800">
                  {players.map(player => {
                    const age = getAge(player.birth_date)
                    const ss = player.season_scores[0]
                    const score = ss?.avg_rating ?? null
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
                        <td className="py-2.5 px-3 max-w-[170px]">
                          <AgentBadge agent={player.agent} className="block max-w-full" />
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
                            ? formatMarketValueInCurrency(player.market_value_eur, currency, rate)
                            : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center text-sm text-apple-gray-600 dark:text-apple-gray-300 tabular-nums">
                          {ss?.matches_played ?? '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center text-sm text-apple-gray-600 dark:text-apple-gray-300 tabular-nums">
                          {ss?.total_goals ?? '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center text-sm text-apple-gray-600 dark:text-apple-gray-300 tabular-nums">
                          {ss?.total_assists ?? '—'}
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
                {t('externo.pagina')} {page + 1} {t('externo.de')} {totalPages} · {count.toLocaleString(LANGUAGE_LOCALES[language])} {t('externo.jugadores')}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {t('externo.anterior')}
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {t('externo.siguiente')}
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
            {t('externo.cargando')}
          </div>
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+6.25rem)] lg:bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-apple-gray-800 rounded-2xl shadow-2xl border border-apple-gray-200 dark:border-apple-gray-700 px-4 sm:px-5 py-3 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
          <span className="text-sm font-medium text-apple-gray-600 dark:text-apple-gray-300">
            {selectedIds.size} {selectedIds.size > 1 ? t('externo.seleccionadoPlural') : t('externo.seleccionadoSingular')}
          </span>
          <button
            onClick={() => setShowTrackingModal(true)}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-brand-green hover:bg-emerald-600 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t('externo.agregarSeguimiento')}
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
