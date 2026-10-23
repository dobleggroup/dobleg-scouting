import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRecentForm } from '@/hooks/usePlayerStats'
import { useData } from '@/context/DataContext'
import { excludeAgencyPlayers } from '@/utils/agencyFilter'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import MobileFilterPanel, { MobileFilterButton } from '@/components/filters/MobileFilterPanel'
import { getScoreColorClass, getScoreBgClass } from '@/components/ui/ScoreBar'
import Sparkline from '@/components/ui/Sparkline'
import MultiSelect from '@/components/filters/MultiSelect'
import { AgentBadge, agentKind } from '@/components/ui/AgentBadge'
import { groupNationalities, nationalityEs } from '@/utils/nationalities'
import Slider from 'rc-slider'
import 'rc-slider/assets/index.css'
import { displayPosition } from '@/types/scoring'
import {
  marketTagsFor,
  ageFromBirthDate,
  monthsToContractEnd,
  opportunityScoreFor,
  type MarketTag,
} from '@/utils/opportunities'
import type { RecentFormPlayer } from '@/types/scoring'
import { useCurrency } from '@/context/CurrencyContext'
import { formatMarketValueInCurrency } from '@/utils/scoring'
import { useLanguage } from '@/context/LanguageContext'

const CHEAP_MAX = 5_000_000
const CONTRACT_MAX = 12

const TAG_LABEL_KEY: Record<MarketTag, string> = {
  contract: 'oportunidades.finDeContrato',
  cheap: 'oportunidades.precioBajo',
}

type FilterType = 'all' | 'contract' | 'cheap'
type SortBy = 'oportunidad' | 'rating' | 'valor' | 'edad' | 'contrato'

export default function OpportunitiesPage() {
  const navigate = useNavigate()
  const { t } = useLanguage()
  const { currency, rate } = useCurrency()

  const [windowMonths, setWindowMonths] = useState<number>(3)
  const { players: allPlayers, loading } = useRecentForm({
    windowMonths,
    cheapMaxValue: CHEAP_MAX,
    contractMaxMonths: CONTRACT_MAX,
    limit: 200,
  })

  // Los jugadores que ya representamos no son una oportunidad de mercado: están en
  // Scout Interno. Se ocultan acá.
  const { agencyPlayers } = useData()
  const players = useMemo(
    () => excludeAgencyPlayers(allPlayers, agencyPlayers),
    [allPlayers, agencyPlayers],
  )

  const [typeFilter, setTypeFilter] = useState<FilterType>('all')
  const [positionFilter, setPositionFilter] = useState<string[]>([])
  const [ageRange, setAgeRange] = useState<[number, number]>([15, 35])
  const [valueRange, setValueRange] = useState<[number, number]>([0, 10_000_000])
  const [maxContract, setMaxContract] = useState<number | null>(null)
  const [nationalities, setNationalities] = useState<string[]>([])
  const [agents, setAgents] = useState<string[]>([])
  const [sortBy, setSortBy] = useState<SortBy>('oportunidad')
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

  // Nacionalidades en castellano (las variantes del proveedor juntas) y agentes,
  // con "Sin dato" y "Sin representante" arriba: buscar jugadores sin
  // representante es justamente una oportunidad.
  const nationalityOptions = useMemo(() => {
    const freq = new Map<string, number>()
    players.forEach(p => { if (p.nationality) freq.set(p.nationality, (freq.get(p.nationality) ?? 0) + 1) })
    return groupNationalities([...freq.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n))
  }, [players])
  const agentOptions = useMemo(() => {
    const set = new Set<string>()
    players.forEach(p => { if (p.agent && agentKind(p.agent) === 'agent') set.add(p.agent) })
    return [t('agente.sinDato'), t('agente.sinRepresentante'), t('agente.familiar'), ...[...set].sort((a, b) => a.localeCompare(b, 'es'))]
  }, [players, t])

  const matchesAgent = useCallback((agent: string | null) => {
    if (agents.length === 0) return true
    const kind = agentKind(agent)
    return agents.some(a =>
      (a === t('agente.sinDato') && kind === 'unknown') ||
      (a === t('agente.sinRepresentante') && kind === 'none') ||
      (a === t('agente.familiar') && kind === 'family') ||
      a === agent,
    )
  }, [agents, t])

  const filteredPlayers = useMemo(() => {
    const natValues = new Set(nationalityOptions.filter(o => nationalities.includes(o.label)).flatMap(o => o.values))
    const result = players.filter(p => {
      if (typeFilter !== 'all' && !(tagsById.get(p.id) ?? []).includes(typeFilter)) return false
      if (positionFilter.length > 0 && (!p.primary_position || !positionFilter.includes(p.primary_position))) return false
      const age = ageFromBirthDate(p.birth_date)
      if (age != null && (age < ageRange[0] || age > ageRange[1])) return false
      const val = p.market_value_eur ?? 0
      if (val < valueRange[0] || val > valueRange[1]) return false
      if (maxContract !== null) {
        const months = monthsToContractEnd(p.contract_end_date)
        if (months === null || months < 0 || months > maxContract) return false
      }
      if (nationalities.length > 0 && (!p.nationality || !natValues.has(p.nationality))) return false
      if (!matchesAgent(p.agent ?? null)) return false
      return true
    })
    const byNullsLast = (a: number | null, b: number | null) => (a ?? Infinity) - (b ?? Infinity)
    const sorters: Record<SortBy, (a: RecentFormPlayer, b: RecentFormPlayer) => number> = {
      oportunidad: (a, b) => opportunityScoreFor(b) - opportunityScoreFor(a),
      rating: (a, b) => b.recent_avg - a.recent_avg,
      valor: (a, b) => byNullsLast(a.market_value_eur, b.market_value_eur),
      edad: (a, b) => byNullsLast(ageFromBirthDate(a.birth_date), ageFromBirthDate(b.birth_date)),
      contrato: (a, b) => byNullsLast(monthsToContractEnd(a.contract_end_date), monthsToContractEnd(b.contract_end_date)),
    }
    return [...result].sort(sorters[sortBy])
  }, [players, tagsById, typeFilter, positionFilter, ageRange, valueRange, maxContract, nationalities, nationalityOptions, matchesAgent, sortBy])

  const clearAllFilters = () => {
    setTypeFilter('all')
    setPositionFilter([])
    setAgeRange([15, 35])
    setValueRange([0, 10_000_000])
    setMaxContract(null)
    setNationalities([])
    setAgents([])
  }

  const counts = useMemo(
    () => ({
      all: players.length,
      contract: players.filter(p => (tagsById.get(p.id) ?? []).includes('contract')).length,
      cheap: players.filter(p => (tagsById.get(p.id) ?? []).includes('cheap')).length,
    }),
    [players, tagsById],
  )

  // Filtros activos como chips (se sacan con la ×) — mismo criterio que Scout Externo
  const chips: { key: string; label: string; clear: () => void }[] = []
  if (typeFilter !== 'all') chips.push({ key: 'type', label: t(TAG_LABEL_KEY[typeFilter]), clear: () => setTypeFilter('all') })
  positionFilter.forEach(pos => chips.push({ key: `pos-${pos}`, label: displayPosition(pos), clear: () => setPositionFilter(f => f.filter(x => x !== pos)) }))
  nationalities.forEach(n => chips.push({ key: `nat-${n}`, label: n, clear: () => setNationalities(f => f.filter(x => x !== n)) }))
  agents.forEach(a => chips.push({ key: `ag-${a}`, label: a, clear: () => setAgents(f => f.filter(x => x !== a)) }))
  if (ageRange[0] !== 15 || ageRange[1] !== 35) chips.push({ key: 'age', label: `${ageRange[0]}–${ageRange[1]} ${t('externo.anios')}`, clear: () => setAgeRange([15, 35]) })
  if (valueRange[0] !== 0 || valueRange[1] !== 10_000_000) {
    chips.push({ key: 'val', label: `${formatMarketValueInCurrency(valueRange[0], currency, rate)} – ${formatMarketValueInCurrency(valueRange[1], currency, rate)}`, clear: () => setValueRange([0, 10_000_000]) })
  }
  if (maxContract !== null) chips.push({ key: 'contract', label: t('oportunidades.mesesMenorIgual').replace('{n}', String(maxContract)), clear: () => setMaxContract(null) })
  const activeCount = chips.length

  const pill = (active: boolean) => `px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
    active
      ? 'bg-brand-green text-white shadow-sm'
      : 'bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700'
  }`
  const selectCls = (active: boolean) =>
    `input-apple text-xs py-2 lg:py-1.5 px-3 w-full lg:w-auto lg:min-w-0 ${active ? '!border-brand-green/50 !text-brand-green font-semibold' : ''}`
  const sliderStyles = { track: { backgroundColor: '#22c55e', height: 4 }, rail: { backgroundColor: '#e5e7eb', height: 4 }, handle: { backgroundColor: '#fff', borderColor: '#22c55e', borderWidth: 2, width: 16, height: 16, marginTop: -6, opacity: 1, boxShadow: '0 1px 3px rgba(0,0,0,0.15)' } }

  // Filtros — mobile-first; desde `lg:` quedan en filas como en Scout Externo.
  const renderFilters = (inline: boolean) => (
    <div className="space-y-5 lg:space-y-4">
      {/* Fila 1: forma reciente + tipo + posiciones */}
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:gap-2">
        <div className="flex items-center gap-1 bg-apple-gray-100 dark:bg-apple-gray-800 rounded-xl p-1 self-start">
          {[1, 3, 6, 12].map(w => (
            <button
              key={w}
              onClick={() => setWindowMonths(w)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${windowMonths === w ? 'bg-white dark:bg-apple-gray-700 text-apple-gray-800 dark:text-white shadow-sm' : 'text-apple-gray-500 dark:text-apple-gray-400'}`}
            >
              {w === 1 ? t('oportunidades.mes1') : t('oportunidades.mesesN').replace('{n}', String(w))}
            </button>
          ))}
        </div>
        <div className="w-px h-6 bg-apple-gray-200 dark:bg-apple-gray-700 hidden lg:block" />
        <div className="flex flex-wrap gap-1.5">
          {(['contract', 'cheap'] as const).map(type => (
            <button key={type} onClick={() => setTypeFilter(typeFilter === type ? 'all' : type)} className={pill(typeFilter === type)}>
              {t(TAG_LABEL_KEY[type])} <span className="opacity-70">{counts[type]}</span>
            </button>
          ))}
        </div>
        <div className="w-px h-6 bg-apple-gray-200 dark:bg-apple-gray-700 hidden lg:block" />
        <div className="flex flex-wrap gap-1.5">
          {positions.map(pos => (
            <button key={pos} onClick={() => setPositionFilter(f => f.includes(pos) ? f.filter(x => x !== pos) : [...f, pos])} className={pill(positionFilter.includes(pos))}>
              {displayPosition(pos)}
            </button>
          ))}
        </div>
      </div>

      {/* Fila 2: edad, valor, contrato, nacionalidad, agente, orden */}
      <div className="flex flex-col gap-5 lg:flex-row lg:flex-wrap lg:items-end lg:gap-x-6 lg:gap-y-3">
        <div className="w-full lg:w-[190px]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400">{t('oportunidades.edad')}</span>
            <span className="text-xs font-semibold text-apple-gray-700 dark:text-apple-gray-200 tabular-nums">{ageRange[0]} – {ageRange[1]}</span>
          </div>
          <Slider range min={15} max={35} value={ageRange} onChange={v => setAgeRange(v as [number, number])} styles={sliderStyles} />
        </div>
        <div className="w-full lg:w-[210px]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400">{t('oportunidades.valor')}</span>
            <span className="text-xs font-semibold text-apple-gray-700 dark:text-apple-gray-200 tabular-nums">
              {formatMarketValueInCurrency(valueRange[0], currency, rate)} – {formatMarketValueInCurrency(valueRange[1], currency, rate)}
            </span>
          </div>
          <Slider range min={0} max={10_000_000} step={100_000} value={valueRange} onChange={v => setValueRange(v as [number, number])} styles={sliderStyles} />
        </div>
        <select value={maxContract ?? 'all'} onChange={e => setMaxContract(e.target.value === 'all' ? null : Number(e.target.value))} className={selectCls(maxContract !== null)}>
          <option value="all">{t('oportunidades.contratoCualquiera')}</option>
          {[6, 12, 18, 24].map(n => <option key={n} value={n}>{t('oportunidades.mesesMenorIgual').replace('{n}', String(n))}</option>)}
        </select>
        {nationalityOptions.length > 0 && (
          <MultiSelect
            options={nationalityOptions.map(o => o.label)}
            selected={nationalities}
            onChange={setNationalities}
            allLabel={t('externo.todasLasNacionalidades')}
            pluralLabel={t('externo.nacionalidadesLabel')}
            searchPlaceholder={t('externo.buscarNacionalidad')}
            clearLabel={t('externo.limpiarSeleccion')}
            inline={inline}
          />
        )}
        <MultiSelect
          options={agentOptions}
          selected={agents}
          onChange={setAgents}
          allLabel={t('externo.todosLosAgentes')}
          pluralLabel={t('externo.agentesLabel')}
          searchPlaceholder={t('externo.buscarAgente')}
          clearLabel={t('externo.limpiarSeleccionAgentes')}
          inline={inline}
        />
        <label className="flex items-center gap-2 text-xs text-apple-gray-500 dark:text-apple-gray-400 whitespace-nowrap lg:ml-auto">
          {t('externo.ordenarPor')}
          <select value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)} className="input-apple text-xs py-2 lg:py-1.5 px-3 flex-1 lg:flex-initial">
            <option value="oportunidad">{t('oportunidades.ordenOportunidad')}</option>
            <option value="rating">{t('oportunidades.ordenRating')}</option>
            <option value="valor">{t('oportunidades.ordenValor')}</option>
            <option value="edad">{t('oportunidades.ordenEdad')}</option>
            <option value="contrato">{t('oportunidades.ordenContrato')}</option>
          </select>
        </label>
      </div>
    </div>
  )

  const activeBar = (
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
            <button type="button" onClick={clearAllFilters} className="text-xs text-apple-gray-400 hover:text-red-500 transition-colors ml-1">{t('externo.limpiarTodo')}</button>
          )}
        </div>
      )}
      <span className="ml-auto text-xs text-apple-gray-500 dark:text-apple-gray-400 tabular-nums whitespace-nowrap">
        <span className="font-semibold text-apple-gray-700 dark:text-apple-gray-200">{filteredPlayers.length}</span> {t('oportunidades.oportunidadesLabel')}
      </span>
    </div>
  )

  if (loading) return <LoadingSpinner fullScreen message={t('oportunidades.analizando')} />

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-apple-gray-800 dark:text-white tracking-tight">
          {t('oportunidades.titulo')}
        </h1>
        <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
          {t('oportunidades.subtituloLista')}
        </p>
      </div>

      {/* Filtros — desktop (en mobile van al bottom-sheet) */}
      <div className="hidden lg:block mb-5">
        {renderFilters(false)}
      </div>

      {/* Filtros — mobile: FAB + bottom-sheet */}
      <MobileFilterButton onClick={() => setShowFilters(true)} activeCount={activeCount} />
      <MobileFilterPanel isOpen={showFilters} onClose={() => setShowFilters(false)} activeCount={activeCount}>
        {renderFilters(true)}
        <button
          onClick={() => setShowFilters(false)}
          className="mt-6 w-full py-3 rounded-xl text-sm font-semibold text-gray-900 bg-brand-green hover:bg-emerald-500 transition-colors"
        >
          {t('oportunidades.verResultados').replace('{count}', String(filteredPlayers.length))}
        </button>
      </MobileFilterPanel>

      {activeBar}

      {/* Opportunities grid */}
      {filteredPlayers.length === 0 ? (
        <div className="text-center py-12 text-apple-gray-500">
          {t('oportunidades.sinOportunidades')}
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
                  {/* Rating reciente */}
                  <div className="text-right flex-shrink-0">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full font-semibold text-sm ${scoreBg} ${scoreColor}`}
                    >
                      {score.toFixed(1)}
                    </span>
                    <p className="text-2xs text-apple-gray-400 mt-1">{t('oportunidades.scoreGGpj').replace('{count}', String(p.recent_matches))}</p>
                  </div>
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-3 mb-3 text-sm">
                  {age != null && (
                    <span className="text-apple-gray-600 dark:text-apple-gray-400">
                      {age} {t('externo.anios')}
                    </span>
                  )}
                  {p.primary_position && (
                    <span className="text-apple-gray-600 dark:text-apple-gray-400">
                      {displayPosition(p.primary_position)}
                    </span>
                  )}
                  {p.nationality && (
                    <span className="text-apple-gray-500 dark:text-apple-gray-400 truncate">{nationalityEs(p.nationality)}</span>
                  )}
                  <div className="ml-auto">
                    <Sparkline values={p.recent_scores} />
                  </div>
                </div>

                {/* Value and contract */}
                <div className="flex items-center justify-between mb-3 text-sm">
                  <div>
                    <span className="text-apple-gray-400">{t('oportunidades.valor')} </span>
                    <span className="font-medium text-apple-gray-700 dark:text-apple-gray-200">
                      {p.market_value_eur ? formatMarketValueInCurrency(p.market_value_eur, currency, rate) : '—'}
                    </span>
                  </div>
                  {contractMonths != null && contractMonths >= 0 && (
                    <div>
                      <span className="text-apple-gray-400">{t('oportunidades.contratoLabel')}</span>
                      <span className="font-medium text-apple-gray-700 dark:text-apple-gray-200">
                        {t('oportunidades.mesesN').replace('{n}', String(contractMonths))}
                      </span>
                    </div>
                  )}
                </div>

                <div className="mb-3 flex items-center gap-2 text-sm min-w-0">
                  <span className="text-apple-gray-400 flex-shrink-0">{t('agente.columna')}</span>
                  <AgentBadge agent={p.agent} className="min-w-0 truncate" />
                </div>

                {/* Market tags */}
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700">
                    {tags.map(tag => (
                      <span
                        key={tag}
                        className="text-xs font-medium px-2.5 py-1 rounded-full bg-brand-green/10 text-brand-green"
                      >
                        {t(TAG_LABEL_KEY[tag])}
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
