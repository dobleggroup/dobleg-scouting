import { useEffect, useMemo, useRef, useState } from 'react'
import { usePlayersList, useLeagues } from '@/hooks/usePlayerStats'
import type { PlayerWithScore, Position } from '@/types/scoring'
import { getScoreColorClass } from '@/components/ui/ScoreBar'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import type { SquadPlayer } from '@/services/footballApiService'
import { POSITION_LABEL_KEY } from '@/features/coaches/squadGrouping'
import {
  POSITION_KEY_API_MAP,
  FORMATION_POSITION_API_OVERRIDES,
  POSITION_DISPLAY_NAME,
  FORMATION_DISPLAY_OVERRIDES,
} from '@/constants/formations'
import { useCurrency } from '@/context/CurrencyContext'
import { formatMarketValueInCurrency } from '@/utils/scoring'
import { useLanguage } from '@/context/LanguageContext'

type PickerTab = 'plantel' | 'sugeridos' | 'buscar'

/** Grupo genérico de API-Football (lo único que trae el plantel crudo) que sirve para cada
 *  una de nuestras posiciones: ordena primero a los que pueden jugar en el puesto elegido. */
const API_GROUPS_FOR_POSITION: Record<Position, string[]> = {
  ARQ: ['Goalkeeper'],
  LD: ['Defender'], CB: ['Defender'], LI: ['Defender'],
  VC: ['Midfielder'], VI: ['Midfielder'],
  EXT: ['Midfielder', 'Attacker'], DEL: ['Attacker'],
}

const POSITION_LABEL: Record<Position, string> = {
  ARQ: 'teamRoster.posArquero', LD: 'teamRoster.posLateralDerecho', CB: 'teamRoster.posDefensorCentral',
  LI: 'teamRoster.posLateralIzquierdo', VC: 'teamRoster.posVolanteCentral', VI: 'teamRoster.posVolanteInterno',
  EXT: 'teamRoster.posExtremo', DEL: 'teamRoster.posDelantero',
}

function ageFrom(birthDate: string | null): number | null {
  if (!birthDate) return null
  const b = new Date(birthDate)
  const now = new Date()
  let age = now.getFullYear() - b.getFullYear()
  if (now < new Date(now.getFullYear(), b.getMonth(), b.getDate())) age -= 1
  return age
}

export default function FutureSquadPlayerPicker({
  slotKey,
  formationType,
  squad,
  apiTeamId,
  usedSquadIds,
  bajaPlayerIds,
  usedCandidateIds,
  onSelectSquad,
  onSelectCandidate,
  onClose,
}: {
  slotKey: string
  formationType: string
  squad: SquadPlayer[]
  apiTeamId?: number | null
  usedSquadIds: Set<number>
  bajaPlayerIds: Set<number>
  usedCandidateIds: Set<string>
  onSelectSquad: (player: SquadPlayer) => void
  onSelectCandidate: (player: PlayerWithScore) => void
  onClose: () => void
}) {
  const { t } = useLanguage()
  const { currency, rate } = useCurrency()
  const [activeTab, setActiveTab] = useState<PickerTab>('plantel')
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [suggestedLeagueId, setSuggestedLeagueId] = useState<number | null>(null)
  const [leagueTouched, setLeagueTouched] = useState(false)
  const [suggestedMaxValue, setSuggestedMaxValue] = useState<number | null>(null)
  const [suggestedCountry, setSuggestedCountry] = useState<string | null>(null)
  const leagues = useLeagues()
  // Sugeridos arranca en la primera división argentina: con "todas las ligas" el ranking
  // global propone a figuras de Europa, que no sirven para armar un plantel de acá.
  useEffect(() => {
    if (leagueTouched || suggestedLeagueId !== null || leagues.length === 0) return
    const argentina = leagues.filter(l => l.country === 'Argentina').sort((a, b) => a.tier - b.tier)[0]
    if (argentina) setSuggestedLeagueId(argentina.id)
  }, [leagues, leagueTouched, suggestedLeagueId])

  const displayName =
    FORMATION_DISPLAY_OVERRIDES[formationType]?.[slotKey] ?? POSITION_DISPLAY_NAME[slotKey] ?? slotKey

  const allowedPositions: Position[] =
    FORMATION_POSITION_API_OVERRIDES[formationType]?.[slotKey] ?? POSITION_KEY_API_MAP[slotKey] ?? []

  // Players already on a baja can't be placed until removed from that list. Players already
  // occupying another slot ARE shown (so picking one moves them here instead of hiding them),
  // but sorted after the still-unplaced ones and flagged via usedSquadIds for the "ya en la
  // cancha" badge below.
  const fittingGroups = useMemo(
    () => new Set(allowedPositions.flatMap(pos => API_GROUPS_FOR_POSITION[pos] ?? [])),
    [allowedPositions],
  )
  const availableSquad = useMemo(() => {
    // Orden: los que sirven para el puesto y están libres, los que sirven pero ya están en
    // la cancha, y después el resto -- así "Delantero" no arranca mostrando al arquero.
    const rank = (p: SquadPlayer) => (fittingGroups.has(p.position ?? '') ? 0 : 2) + (usedSquadIds.has(p.id) ? 1 : 0)
    return squad.filter(p => !bajaPlayerIds.has(p.id)).sort((a, b) => rank(a) - rank(b))
  }, [squad, usedSquadIds, bajaPlayerIds, fittingGroups])

  // Rating del plantel actual -- consulta acotada por equipo, no bloquea el render de la
  // pestaña "Plantel" (arranca vacia, se completa cuando llega la respuesta).
  const { players: squadScored } = usePlayersList(
    activeTab === 'plantel' && apiTeamId ? { team_id: apiTeamId, pageSize: 60 } : { pageSize: 0 },
  )
  const squadScoreById = useMemo(() => new Map(squadScored.map(p => [p.id, p.primary_score])), [squadScored])

  const { players: suggestionPool, loading: suggestionsLoading } = usePlayersList(
    activeTab === 'sugeridos' && allowedPositions.length > 0
      ? {
          positions: allowedPositions,
          pageSize: 200,
          league_id: suggestedLeagueId ?? undefined,
          max_market_value: suggestedMaxValue ?? undefined,
        }
      : { pageSize: 0 },
  )
  const suggestedCountries = useMemo(
    () => [...new Set(suggestionPool.map(p => p.nationality).filter((n): n is string => !!n))].sort(),
    [suggestionPool],
  )
  const suggestions = useMemo(
    () =>
      suggestionPool
        .filter(
          p =>
            !usedCandidateIds.has(String(p.id)) &&
            p.primary_score !== null &&
            (!suggestedCountry || p.nationality === suggestedCountry),
        )
        .slice(0, 15),
    [suggestionPool, usedCandidateIds, suggestedCountry],
  )

  const debouncedSearch = useDebouncedValue(searchQuery.trim(), 250)
  const { players: searchPool, loading: searchLoading } = usePlayersList(
    activeTab === 'buscar' && debouncedSearch.length >= 2 ? { search: debouncedSearch, pageSize: 15 } : { pageSize: 0 },
  )
  const searchResults = useMemo(
    () => searchPool.filter(p => !usedCandidateIds.has(String(p.id))),
    [searchPool, usedCandidateIds],
  )

  useEffect(() => {
    if (activeTab === 'buscar' && searchInputRef.current) searchInputRef.current.focus()
  }, [activeTab])

  function renderCandidateCard(p: PlayerWithScore) {
    const score = p.primary_score
    const age = ageFrom(p.birth_date)
    const details = [
      p.primary_position ? t(POSITION_LABEL[p.primary_position]) : null,
      age != null ? `${age} ${t('externo.anios')}` : null,
      p.market_value_eur ? formatMarketValueInCurrency(p.market_value_eur, currency, rate) : null,
    ].filter(Boolean)
    return (
      <div key={p.id} className="flex items-stretch rounded-xl border border-apple-gray-100 dark:border-apple-gray-700 hover:border-brand-green/50 transition-colors">
        <button
          type="button"
          onClick={() => onSelectCandidate(p)}
          className="flex-1 min-w-0 flex items-center gap-3 p-3 rounded-l-xl text-left hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700/60 transition-colors"
        >
          {p.photo ? (
            <img src={p.photo} alt="" className="w-10 h-10 rounded-lg object-cover bg-apple-gray-200 flex-shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-apple-gray-200 dark:bg-apple-gray-600 flex items-center justify-center text-sm font-bold text-apple-gray-500 flex-shrink-0">
              {p.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-apple-gray-800 dark:text-white text-sm truncate">{p.name}</p>
            <p className="text-xs text-apple-gray-500 truncate flex items-center gap-1">
              {p.team?.logo && <img src={p.team.logo} alt="" className="w-3.5 h-3.5 object-contain flex-shrink-0" />}
              {p.team?.name ?? '—'}
            </p>
            {details.length > 0 && <p className="text-2xs text-apple-gray-400 truncate">{details.join(' · ')}</p>}
          </div>
          <div className="text-right flex-shrink-0">
            {score !== null ? (
              <>
                <p className={`text-base font-bold tabular-nums ${getScoreColorClass(score, '10')}`}>{score.toFixed(1)}</p>
                <p className="text-[10px] text-apple-gray-400">{t('futureSquadPicker.rating')}</p>
              </>
            ) : (
              <p className="text-sm font-bold text-apple-gray-400">—</p>
            )}
          </div>
        </button>
        <a
          href={`/jugador/${encodeURIComponent(p.name)}?source=externo&apiId=${p.id}`}
          target="_blank"
          rel="noreferrer"
          title={t('futureSquadPicker.verFicha')}
          aria-label={`${t('futureSquadPicker.verFicha')}: ${p.name}`}
          className="flex items-center px-3 rounded-r-xl text-apple-gray-400 hover:text-brand-green hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700/60 transition-colors border-l border-apple-gray-100 dark:border-apple-gray-700"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in" onClick={onClose}>
      <div
        className="bg-white dark:bg-apple-gray-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-hidden animate-scale-in flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b border-apple-gray-200 dark:border-apple-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-apple-gray-800 dark:text-white">{displayName}</h3>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-apple-gray-400 hover:text-apple-gray-600 dark:hover:text-apple-gray-200 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex gap-1 bg-apple-gray-100 dark:bg-apple-gray-700 rounded-xl p-1">
            {(['plantel', 'sugeridos', 'buscar'] as PickerTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab
                    ? 'bg-white dark:bg-apple-gray-600 text-apple-gray-800 dark:text-white shadow-sm'
                    : 'text-apple-gray-500 hover:text-apple-gray-700 dark:hover:text-apple-gray-300'
                }`}
              >
                {tab === 'plantel' ? t('futureSquadPicker.tabPlantel') : tab === 'sugeridos' ? t('futureSquadPicker.tabSugeridos') : t('futureSquadPicker.tabBuscar')}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 max-h-[60vh] overflow-y-auto flex-1">
          {activeTab === 'plantel' ? (
            availableSquad.length === 0 ? (
              <p className="text-center text-apple-gray-500 py-8 text-sm">{t('futureSquadPicker.sinPlantel')}</p>
            ) : (
              <div className="space-y-2">
                {availableSquad.map((p, i) => {
                  const isPlacedElsewhere = usedSquadIds.has(p.id)
                  const fits = fittingGroups.has(p.position ?? '')
                  const firstNonFitting = !fits && (i === 0 || fittingGroups.has(availableSquad[i - 1].position ?? ''))
                  const score = squadScoreById.get(p.id)
                  return (
                    <div key={p.id}>
                    {firstNonFitting && fittingGroups.size > 0 && (
                      <p className="text-2xs font-semibold uppercase tracking-wide text-apple-gray-400 pt-2 pb-1 px-1">{t('futureSquadPicker.otrasPosiciones')}</p>
                    )}
                    <button
                      type="button"
                      onClick={() => onSelectSquad(p)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left border hover:border-brand-green/50 ${
                        isPlacedElsewhere
                          ? 'border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-900/10 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                          : 'border-apple-gray-100 dark:border-apple-gray-700 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700'
                      }`}
                    >
                      {p.photo ? (
                        <img src={p.photo} alt="" className="w-10 h-10 rounded-lg object-cover bg-apple-gray-200" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-apple-gray-200 dark:bg-apple-gray-600 flex items-center justify-center text-sm font-bold text-apple-gray-500">
                          {p.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-apple-gray-800 dark:text-white text-sm truncate">{p.name}</p>
                          {isPlacedElsewhere && (
                            <span className="flex-shrink-0 px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                              {t('futureSquadPicker.yaEnLaCancha')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-apple-gray-500 truncate">
                          {p.position ? (POSITION_LABEL_KEY[p.position] ? t(POSITION_LABEL_KEY[p.position]) : p.position) : '—'}
                          {p.number != null ? ` · #${p.number}` : ''}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {score != null ? (
                          <p className={`text-sm font-bold ${getScoreColorClass(score, '10')}`}>{score.toFixed(1)}</p>
                        ) : (
                          <p className="text-sm font-bold text-apple-gray-400">—</p>
                        )}
                      </div>
                    </button>
                    </div>
                  )
                })}
              </div>
            )
          ) : activeTab === 'sugeridos' ? (
            <>
              <div className="flex flex-wrap gap-2 mb-3">
                <select
                  value={suggestedLeagueId ?? ''}
                  onChange={e => {
                    setLeagueTouched(true)
                    setSuggestedLeagueId(e.target.value ? Number(e.target.value) : null)
                  }}
                  className="min-h-[32px] rounded-lg border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-900 px-2 text-2xs text-apple-gray-700 dark:text-apple-gray-300"
                >
                  <option value="">{t('futureSquadPicker.todasLasLigas')}</option>
                  {leagues.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
                <select
                  value={suggestedMaxValue ?? ''}
                  onChange={e => setSuggestedMaxValue(e.target.value ? Number(e.target.value) : null)}
                  className="min-h-[32px] rounded-lg border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-900 px-2 text-2xs text-apple-gray-700 dark:text-apple-gray-300"
                >
                  <option value="">{t('futureSquadPicker.cualquierValor')}</option>
                  <option value="500000">{t('futureSquadPicker.hasta').replace('{value}', formatMarketValueInCurrency(500_000, currency, rate))}</option>
                  <option value="1000000">{t('futureSquadPicker.hasta').replace('{value}', formatMarketValueInCurrency(1_000_000, currency, rate))}</option>
                  <option value="5000000">{t('futureSquadPicker.hasta').replace('{value}', formatMarketValueInCurrency(5_000_000, currency, rate))}</option>
                </select>
                {suggestedCountries.length > 0 && (
                  <select
                    value={suggestedCountry ?? ''}
                    onChange={e => setSuggestedCountry(e.target.value || null)}
                    className="min-h-[32px] rounded-lg border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-900 px-2 text-2xs text-apple-gray-700 dark:text-apple-gray-300"
                  >
                    <option value="">{t('futureSquadPicker.cualquierNacionalidad')}</option>
                    {suggestedCountries.map(c => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {suggestionsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
                </div>
              ) : suggestions.length === 0 ? (
                <p className="text-center text-apple-gray-500 py-8 text-sm">{t('futureSquadPicker.sinSugeridos')}</p>
              ) : (
                <div className="space-y-2">{suggestions.map(renderCandidateCard)}</div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={t('futureSquadPicker.buscarPlaceholder')}
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-apple-gray-100 dark:bg-apple-gray-700 border border-apple-gray-200 dark:border-apple-gray-600 text-apple-gray-800 dark:text-white placeholder-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/50 text-sm"
                />
              </div>
              {searchLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
                </div>
              ) : debouncedSearch.length < 2 ? (
                <p className="text-center text-apple-gray-500 py-8 text-sm">{t('futureSquadPicker.minLetras')}</p>
              ) : searchResults.length === 0 ? (
                <p className="text-center text-apple-gray-500 py-8 text-sm">{t('futureSquadPicker.sinResultados')}</p>
              ) : (
                <div className="space-y-2">{searchResults.map(renderCandidateCard)}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
