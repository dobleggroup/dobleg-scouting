import { useState, useMemo } from 'react'
import type { FilterState, EnrichedPlayer } from '@/types'
import type { VideoFreshness } from '@/types/videos'
import { FILTER_POSITION_MAP, sortLeaguesByPriority } from '@/constants/scoring'
import { displayPosition } from '@/types/scoring'
import { fuzzyMatch } from '@/lib/search'
import type { Currency } from '@/context/CurrencyContext'
import { useCurrency } from '@/context/CurrencyContext'
import { formatMarketValueInCurrency } from '@/utils/scoring'
import { CLASS_BADGE_COLOR } from '@/constants/agencyClassification'
import type { AgencyClass } from '@/services/agencyClassificationService'

const VIDEO_FRESHNESS_OPTIONS: { value: VideoFreshness; label: string; dot: string }[] = [
  { value: 'green', label: 'Actualizado (<4m)', dot: 'bg-green-500' },
  { value: 'amber', label: 'Necesita atención (4–7m)', dot: 'bg-amber-500' },
  { value: 'red', label: 'Desactualizado (>7m)', dot: 'bg-red-500' },
  { value: 'none', label: 'Sin video', dot: 'bg-apple-gray-300' },
]

interface FilterSidebarProps {
  players: EnrichedPlayer[]
  filters: FilterState
  onChange: (filters: FilterState) => void
  onReset: () => void
  showVideoFreshness?: boolean
  /** Filtro por Clasificación Interna (Clase A/B/C) — solo tiene sentido en Scout Interno. */
  showAgencyClass?: boolean
  /** En el bottom-sheet de mobile: ocupa todo el ancho, sin card/sticky ni header
   *  propio (el panel ya aporta título y cierre). Desktop no pasa este prop. */
  inPanel?: boolean
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-apple-gray-200/50 dark:border-apple-gray-800/50 last:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-3.5 text-sm font-medium text-apple-gray-700 dark:text-apple-gray-300 hover:text-apple-gray-900 dark:hover:text-white transition-colors duration-150"
      >
        {title}
        <svg
          className={`w-4 h-4 text-apple-gray-400 transition-transform duration-200 ease-apple ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ease-apple ${
          open ? 'max-h-96 opacity-100 pb-4' : 'max-h-0 opacity-0'
        }`}
      >
        {children}
      </div>
    </div>
  )
}

function SliderInput({ label, value, min, max, step = 1, onChange, formatFn }: {
  label: string; value: number; min: number; max: number; step?: number
  onChange: (v: number) => void; formatFn?: (v: number) => string
}) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0
  const display = formatFn ? formatFn(value) : String(value)
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs">
        <span className="text-apple-gray-500 dark:text-apple-gray-400">{label}</span>
        <span className="font-medium text-apple-gray-700 dark:text-apple-gray-200 tabular-nums">{display}</span>
      </div>
      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full h-1.5 bg-apple-gray-200 dark:bg-apple-gray-700 rounded-full appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, #22C55E 0%, #22C55E ${pct}%, transparent ${pct}%)`
          }}
        />
      </div>
    </div>
  )
}

function formatMV(v: number, currency: Currency, rate: number): string {
  if (v === 0) return 'Todos'
  return formatMarketValueInCurrency(v, currency, rate)
}

export default function FilterSidebar({ players, filters, onChange, onReset, showVideoFreshness = false, showAgencyClass = false, inPanel = false }: FilterSidebarProps) {
  const { currency, rate } = useCurrency()
  const update = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    onChange({ ...filters, [key]: value })
  }

  const toggleArrayItem = (key: 'positions' | 'leagues', item: string) => {
    const current = filters[key]
    const next = current.includes(item) ? current.filter(x => x !== item) : [...current, item]
    // Al quitar la última liga, limpiar el equipo seleccionado
    if (key === 'leagues' && next.length === 0 && filters.teamSearch) {
      onChange({ ...filters, [key]: next, teamSearch: '' })
    } else {
      onChange({ ...filters, [key]: next })
    }
  }

  const toggleVideoFreshness = (value: VideoFreshness) => {
    const current = filters.videoFreshness || []
    const next = current.includes(value)
      ? current.filter(x => x !== value)
      : [...current, value]
    onChange({ ...filters, videoFreshness: next })
  }

  const toggleAgencyClass = (value: AgencyClass) => {
    const current = filters.agencyClass || []
    const next = current.includes(value)
      ? current.filter(x => x !== value)
      : [...current, value]
    onChange({ ...filters, agencyClass: next })
  }

  // Derive available options from data
  const { leagues, positions, maxMinutes, maxMarketValue, minAge, maxAge, representantes, minHeight, maxHeight, pies } = useMemo(() => {
    const leagueSet = new Set<string>()
    const posSet = new Set<string>()
    const repreSet = new Set<string>()
    const pieSet = new Set<string>()
    let maxMin = 0
    let maxMV = 0
    let minA = 99
    let maxA = 0
    let minH = 999
    let maxH = 0

    for (const p of players) {
      if (p.Liga) leagueSet.add(p.Liga)
      const rawPos = (p['Posición específica'] || p['Posición'])?.trim() ?? ''
      const posKey = FILTER_POSITION_MAP[rawPos]
      if (posKey) posSet.add(posKey)
      if (p.minutesPlayed > maxMin) maxMin = p.minutesPlayed
      if (p.marketValueRaw > maxMV) maxMV = p.marketValueRaw
      if (p.ageNum > 0 && p.ageNum < minA) minA = p.ageNum
      if (p.ageNum > maxA) maxA = p.ageNum
      if (p.Representante) repreSet.add(p.Representante)
      // Pie
      const pie = (p.Pie ?? '').toLowerCase().trim()
      if (pie && pie !== '-') pieSet.add(pie)
      // Altura
      const alturaStr = String(p.Altura ?? '').replace(/[^\d]/g, '')
      const altura = parseInt(alturaStr, 10)
      if (altura > 100 && altura < 220) {
        if (altura < minH) minH = altura
        if (altura > maxH) maxH = altura
      }
    }

    const mvCeil = Math.ceil(maxMV / 1_000_000) * 1_000_000

    return {
      leagues: sortLeaguesByPriority([...leagueSet]),
      positions: [...posSet].sort(),
      maxMinutes: Math.ceil(maxMin / 100) * 100,
      maxMarketValue: mvCeil || 50_000_000,
      minAge: minA === 99 ? 15 : minA,
      maxAge: maxA || 45,
      representantes: [...repreSet].filter(r => r && r !== '-').sort(),
      minHeight: minH === 999 ? 160 : minH,
      maxHeight: maxH === 0 ? 200 : maxH,
      pies: [...pieSet].sort(),
    }
  }, [players])

  // Equipos disponibles según las ligas seleccionadas
  const teamsForLeagues = useMemo(() => {
    if (filters.leagues.length === 0) return []
    const teamSet = new Set<string>()
    for (const p of players) {
      if (filters.leagues.includes(p.Liga) && p.Equipo) {
        teamSet.add(p.Equipo)
      }
    }
    return [...teamSet].sort()
  }, [players, filters.leagues])

  const activeFiltersCount = [
    filters.search,
    filters.positions.length > 0,
    filters.leagues.length > 0,
    filters.teamSearch,
    filters.minAge > 0 && filters.minAge > minAge,
    filters.maxAge > 0 && filters.maxAge < maxAge,
    filters.minMinutes > 0,
    filters.minMarketValue > 0,
    filters.maxMarketValue > 0 && filters.maxMarketValue < maxMarketValue,
    filters.contractFrom,
    filters.contractTo,
    filters.maxContractMonths > 0,
    filters.representante,
    filters.pie,
    filters.minHeight > 0 && filters.minHeight > minHeight,
    filters.maxHeight > 0 && filters.maxHeight < maxHeight,
    showVideoFreshness && (filters.videoFreshness || []).length > 0,
    (filters.agencyClass || []).length > 0,
  ].filter(Boolean).length

  return (
    <aside className={inPanel ? 'w-full' : 'w-60 flex-shrink-0'}>
      <div className={inPanel ? '' : 'sticky top-[4rem] card-apple overflow-hidden'}>
        {/* Header (en panel mobile lo aporta el propio panel) */}
        {!inPanel && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-apple-gray-200/50 dark:border-apple-gray-700/50 bg-apple-gray-50 dark:bg-apple-gray-800/50">
            <span className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider flex items-center gap-2">
              Filtros
              {activeFiltersCount > 0 && (
                <span className="px-1.5 py-0.5 bg-brand-green text-black rounded-full text-2xs font-bold">
                  {activeFiltersCount}
                </span>
              )}
            </span>
            {activeFiltersCount > 0 && (
              <button
                onClick={onReset}
                className="text-xs font-medium text-brand-green hover:text-green-400 transition-colors"
              >
                Limpiar
              </button>
            )}
          </div>
        )}

        <div className={inPanel ? 'divide-y divide-apple-gray-200/50 dark:divide-apple-gray-800/50' : 'px-4 divide-y divide-apple-gray-200/50 dark:divide-apple-gray-800/50'}>
          {/* Position */}
          <Section title="Posición">
            <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin pr-1">
              {positions.map(pos => (
                <label key={pos} className="flex items-center gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={filters.positions.includes(pos)}
                    onChange={() => toggleArrayItem('positions', pos)}
                    className="w-4 h-4 rounded border-apple-gray-300 dark:border-apple-gray-600 text-brand-green focus:ring-brand-green"
                  />
                  <span className="text-sm text-apple-gray-700 dark:text-apple-gray-300 truncate group-hover:text-apple-gray-900 dark:group-hover:text-white transition-colors">
                    {displayPosition(pos)}
                  </span>
                </label>
              ))}
            </div>
          </Section>

          {/* Clasificación Interna (internal only) */}
          {showAgencyClass && (
            <Section title="Clasificación Interna" defaultOpen={false}>
              <div className="space-y-2">
                {(['A', 'B', 'C'] as AgencyClass[]).map(cls => (
                  <label key={cls} className="flex items-center gap-2.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={(filters.agencyClass || []).includes(cls)}
                      onChange={() => toggleAgencyClass(cls)}
                      className="w-4 h-4 rounded border-apple-gray-300 dark:border-apple-gray-600 text-brand-green focus:ring-brand-green"
                    />
                    <span className={`px-1.5 py-0.5 rounded text-2xs font-semibold ${CLASS_BADGE_COLOR[cls]}`}>{cls}</span>
                    <span className="text-sm text-apple-gray-700 dark:text-apple-gray-300 group-hover:text-apple-gray-900 dark:group-hover:text-white transition-colors">
                      Clase {cls}
                    </span>
                  </label>
                ))}
              </div>
            </Section>
          )}

          {/* Frescura de video (internal only) */}
          {showVideoFreshness && (
            <Section title="Frescura de video" defaultOpen={false}>
              <div className="space-y-2">
                {VIDEO_FRESHNESS_OPTIONS.map(opt => (
                  <label key={opt.value} className="flex items-center gap-2.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={(filters.videoFreshness || []).includes(opt.value)}
                      onChange={() => toggleVideoFreshness(opt.value)}
                      className="w-4 h-4 rounded border-apple-gray-300 dark:border-apple-gray-600 text-brand-green focus:ring-brand-green"
                    />
                    <span className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${opt.dot}`} />
                    <span className="text-sm text-apple-gray-700 dark:text-apple-gray-300 truncate group-hover:text-apple-gray-900 dark:group-hover:text-white transition-colors">
                      {opt.label}
                    </span>
                  </label>
                ))}
              </div>
            </Section>
          )}

          {/* Liga */}
          {leagues.length > 0 && (
            <Section title="Liga">
              <div className="space-y-2 max-h-52 overflow-y-auto scrollbar-thin pr-1">
                {leagues.map(lg => (
                  <label key={lg} className="flex items-center gap-2.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={filters.leagues.includes(lg)}
                      onChange={() => toggleArrayItem('leagues', lg)}
                      className="w-4 h-4 rounded border-apple-gray-300 dark:border-apple-gray-600 text-brand-green focus:ring-brand-green"
                    />
                    <span className="text-xs text-apple-gray-700 dark:text-apple-gray-300 truncate group-hover:text-apple-gray-900 dark:group-hover:text-white transition-colors" title={lg}>
                      {lg}
                    </span>
                  </label>
                ))}
              </div>
            </Section>
          )}

          {/* Equipo search */}
          <Section title="Equipo" defaultOpen={teamsForLeagues.length > 0 || !!filters.teamSearch}>
            {teamsForLeagues.length > 0 ? (
              <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin pr-1">
                {teamsForLeagues.map(team => (
                  <button
                    key={team}
                    onClick={() => update('teamSearch', filters.teamSearch === team ? '' : team)}
                    className={`w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors truncate ${
                      filters.teamSearch === team
                        ? 'bg-brand-green text-black font-medium'
                        : 'text-apple-gray-600 dark:text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700'
                    }`}
                    title={team}
                  >
                    {team}
                  </button>
                ))}
              </div>
            ) : (
              <input
                type="text"
                placeholder="Buscar equipo..."
                value={filters.teamSearch}
                onChange={e => update('teamSearch', e.target.value)}
                className="input-apple text-sm"
              />
            )}
          </Section>

          {/* Edad */}
          <Section title="Edad" defaultOpen={false}>
            <div className="space-y-4">
              <SliderInput
                label="Mínima"
                value={filters.minAge || minAge}
                min={minAge}
                max={maxAge}
                step={1}
                onChange={v => update('minAge', v)}
                formatFn={v => v === minAge ? 'Sin mín' : `${v} años`}
              />
              <SliderInput
                label="Máxima"
                value={filters.maxAge || maxAge}
                min={minAge}
                max={maxAge}
                step={1}
                onChange={v => update('maxAge', v)}
                formatFn={v => v === maxAge ? 'Sin máx' : `${v} años`}
              />
            </div>
          </Section>

          {/* Pie */}
          {pies.length > 0 && (
            <Section title="Pie" defaultOpen={false}>
              <div className="flex flex-wrap gap-2">
                {['izquierdo', 'derecho', 'ambos'].filter(p => pies.includes(p) || p === 'ambos').map(pie => (
                  <button
                    key={pie}
                    onClick={() => update('pie', filters.pie === pie ? '' : pie)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                      filters.pie === pie
                        ? 'bg-brand-green text-black'
                        : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600'
                    }`}
                  >
                    {pie === 'izquierdo' ? '🦶 Zurdo' : pie === 'derecho' ? '🦶 Diestro' : '🦶 Ambos'}
                  </button>
                ))}
              </div>
            </Section>
          )}

          {/* Altura */}
          <Section title="Altura" defaultOpen={false}>
            <div className="space-y-4">
              <SliderInput
                label="Mínima"
                value={filters.minHeight || minHeight}
                min={minHeight}
                max={maxHeight}
                step={1}
                onChange={v => update('minHeight', v)}
                formatFn={v => v <= minHeight ? 'Sin mín' : `${v} cm`}
              />
              <SliderInput
                label="Máxima"
                value={filters.maxHeight || maxHeight}
                min={minHeight}
                max={maxHeight}
                step={1}
                onChange={v => update('maxHeight', v)}
                formatFn={v => v >= maxHeight ? 'Sin máx' : `${v} cm`}
              />
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => { update('minHeight', 185); update('maxHeight', maxHeight) }}
                className={`flex-1 text-xs px-2 py-1.5 rounded-lg transition-colors ${
                  filters.minHeight === 185 && (!filters.maxHeight || filters.maxHeight >= maxHeight)
                    ? 'bg-brand-green text-black'
                    : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200'
                }`}
              >
                +185cm
              </button>
              <button
                onClick={() => { update('minHeight', minHeight); update('maxHeight', 175) }}
                className={`flex-1 text-xs px-2 py-1.5 rounded-lg transition-colors ${
                  (!filters.minHeight || filters.minHeight <= minHeight) && filters.maxHeight === 175
                    ? 'bg-brand-green text-black'
                    : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200'
                }`}
              >
                -175cm
              </button>
            </div>
          </Section>

          {/* Minutos jugados */}
          <Section title="Minutos mín." defaultOpen={false}>
            <SliderInput
              label="Mínimo"
              value={filters.minMinutes}
              min={0}
              max={maxMinutes || 3000}
              step={90}
              onChange={v => update('minMinutes', v)}
              formatFn={v => v === 0 ? 'Todos' : `${v} min`}
            />
          </Section>

          {/* Valor de mercado */}
          <Section title="Valor mercado" defaultOpen={false}>
            <div className="space-y-4">
              <SliderInput
                label="Mínimo"
                value={filters.minMarketValue}
                min={0}
                max={maxMarketValue}
                step={250_000}
                onChange={v => update('minMarketValue', v)}
                formatFn={v => formatMV(v, currency, rate)}
              />
              <SliderInput
                label="Máximo"
                value={filters.maxMarketValue || maxMarketValue}
                min={0}
                max={maxMarketValue}
                step={250_000}
                onChange={v => update('maxMarketValue', v)}
                formatFn={v => v === 0 || v >= maxMarketValue ? 'Sin máx' : formatMV(v, currency, rate)}
              />
            </div>
          </Section>

          {/* Fin de contrato - slider por meses */}
          <Section title="Contrato por vencer" defaultOpen={false}>
            <SliderInput
              label="Máx. meses restantes"
              value={filters.maxContractMonths}
              min={0}
              max={36}
              step={1}
              onChange={v => update('maxContractMonths', v)}
              formatFn={v => {
                if (v === 0) return 'Todos'
                if (v < 7) return `${v} meses (crítico)`
                if (v < 13) return `${v} meses (alerta)`
                return `${v} meses`
              }}
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => update('maxContractMonths', 6)}
                className={`flex-1 text-xs px-2 py-1.5 rounded-lg transition-colors ${
                  filters.maxContractMonths === 6
                    ? 'bg-orange-500 text-white'
                    : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-orange-100 dark:hover:bg-orange-900/30'
                }`}
              >
                &lt; 6 meses
              </button>
              <button
                onClick={() => update('maxContractMonths', 12)}
                className={`flex-1 text-xs px-2 py-1.5 rounded-lg transition-colors ${
                  filters.maxContractMonths === 12
                    ? 'bg-amber-400 text-black'
                    : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-amber-100 dark:hover:bg-amber-900/30'
                }`}
              >
                &lt; 12 meses
              </button>
            </div>
          </Section>

          {/* Representante */}
          {representantes.length > 0 && (
            <Section title="Representante" defaultOpen={false}>
              <input
                type="text"
                placeholder="Buscar representante..."
                value={filters.representante}
                onChange={e => update('representante', e.target.value)}
                className="input-apple text-sm mb-2"
              />
              <div className="space-y-1.5 max-h-40 overflow-y-auto scrollbar-thin pr-1">
                {representantes
                  .filter(r => !filters.representante || fuzzyMatch(filters.representante, r))
                  .slice(0, 15)
                  .map(r => (
                    <button
                      key={r}
                      onClick={() => update('representante', r)}
                      className={`w-full text-left px-2 py-1 rounded text-xs transition-colors truncate ${
                        filters.representante === r
                          ? 'bg-brand-green text-black'
                          : 'text-apple-gray-600 dark:text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700'
                      }`}
                      title={r}
                    >
                      {r}
                    </button>
                  ))}
              </div>
            </Section>
          )}
        </div>
      </div>
    </aside>
  )
}
