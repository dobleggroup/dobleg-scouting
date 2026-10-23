import { useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchTeamCompetitions,
  fetchTeamCompetitionFixtures,
  fetchLeagueStandings,
  toArDateKey,
  type TeamCompetition,
  type StandingRow,
} from '@/services/footballApiService'
import type { AgencyFixture } from '@/types/footballApi'
import type { AgencyPlayer } from '@/constants/agencyPlayers'
import { isMatchFinished } from '@/utils/coachCalendar'
import { useData } from '@/context/DataContext'
import { fuzzyMatch } from '@/lib/search'
import StandingsTable from '@/components/shared/StandingsTable'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

interface PlayerOption {
  fullName: string
  shortName: string
  image: string | null
  team: string
  apiTeamId: number
}

function buildPlayerOptions(agencyPlayers: AgencyPlayer[]): PlayerOption[] {
  return agencyPlayers
    .filter((p): p is AgencyPlayer & { apiTeamId: number } => !p.isReserve && p.apiTeamId != null && !!p.team)
    .map(p => ({ fullName: p.fullName, shortName: p.shortName, image: p.image, team: p.team, apiTeamId: p.apiTeamId }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
}

/** Formatea una fecha de fixture en hora de Argentina (dd/mm/yyyy), evitando
 *  el corrimiento de un día que da `new Date(isoString).toLocaleDateString()`
 *  en husos negativos (ver convención en CoachCalendarTab/toArDateKey). */
function formatFixtureDate(dateStr: string): string {
  const [y, m, d] = toArDateKey(dateStr).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR')
}

function CompetitionStandings({ teamId, leagueId, season }: { teamId: number; leagueId: number; season: number }) {
  const [groups, setGroups] = useState<StandingRow[][] | null>(null)

  useEffect(() => {
    let active = true
    setGroups(null)
    fetchLeagueStandings(leagueId, season)
      .then(g => {
        if (active) setGroups(g)
      })
      .catch(() => {
        if (active) setGroups([])
      })
    return () => {
      active = false
    }
  }, [leagueId, season])

  if (groups === null) return <LoadingSpinner message="Cargando tabla de posiciones..." />
  if (groups.length === 0) {
    return (
      <p className="text-sm text-apple-gray-500 text-center py-8">No se pudo cargar la tabla de posiciones.</p>
    )
  }
  return <StandingsTable groups={groups} highlightTeamId={teamId} />
}

function CompetitionFixtures({ teamId, leagueId, season }: { teamId: number; leagueId: number; season: number }) {
  const [fixtures, setFixtures] = useState<AgencyFixture[] | null>(null)

  useEffect(() => {
    let active = true
    setFixtures(null)
    fetchTeamCompetitionFixtures(teamId, leagueId, season)
      .then(f => {
        if (active) setFixtures(f)
      })
      .catch(() => {
        if (active) setFixtures([])
      })
    return () => {
      active = false
    }
  }, [teamId, leagueId, season])

  if (fixtures === null) return <LoadingSpinner message="Cargando partidos..." />
  if (fixtures.length === 0) {
    return (
      <p className="text-sm text-apple-gray-500 text-center py-8">
        No hay partidos disponibles para esta competencia.
      </p>
    )
  }

  const sorted = [...fixtures].sort((a, b) => b.timestamp - a.timestamp).slice(0, 10)

  return (
    <div className="space-y-1">
      {sorted.map(f => {
        const isFinished = isMatchFinished(f.statusShort)
        const opponent = f.isHome ? f.awayTeam : f.homeTeam
        return (
          <div
            key={f.fixtureId}
            className="flex items-center gap-3 p-3 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-700/30"
          >
            <img src={opponent.logo} alt="" className="w-6 h-6 object-contain flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-apple-gray-800 dark:text-white truncate">
                vs {opponent.name} {f.isHome ? '(L)' : '(V)'}
              </p>
              <p className="text-xs text-apple-gray-500 truncate">{f.round}</p>
            </div>
            <span className="text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-200 tabular-nums flex-shrink-0">
              {isFinished ? `${f.goalsHome ?? '-'}-${f.goalsAway ?? '-'}` : formatFixtureDate(f.date)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function ClubsAndCupsSection() {
  const { agencyPlayers } = useData()
  const options = useMemo(() => buildPlayerOptions(agencyPlayers), [agencyPlayers])
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerOption | null>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [competitions, setCompetitions] = useState<TeamCompetition[] | null>(null)
  const [activeCompetitionIdx, setActiveCompetitionIdx] = useState(0)
  const searchRef = useRef<HTMLDivElement>(null)

  // Primer jugador de la lista por defecto; si el roster cambia (alta/baja a
  // mitad de sesión) y el elegido ya no está, recae en el primero también.
  useEffect(() => {
    if (selectedPlayer && options.some(o => o.fullName === selectedPlayer.fullName)) return
    setSelectedPlayer(options[0] ?? null)
  }, [options, selectedPlayer])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const filteredOptions = useMemo(() => {
    if (!query.trim()) return options
    return options.filter(o => fuzzyMatch(query, o.fullName) || fuzzyMatch(query, o.team))
  }, [options, query])

  const selectedTeamId = selectedPlayer?.apiTeamId ?? null

  useEffect(() => {
    if (selectedTeamId == null) return
    let active = true
    setCompetitions(null)
    setActiveCompetitionIdx(0)
    fetchTeamCompetitions(selectedTeamId)
      .then(c => {
        if (active) setCompetitions(c)
      })
      .catch(() => {
        if (active) setCompetitions([])
      })
    return () => {
      active = false
    }
  }, [selectedTeamId])

  if (options.length === 0) return null

  const activeCompetition = competitions?.[activeCompetitionIdx] ?? null

  return (
    <div className="mt-8 mb-8">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold text-apple-gray-800 dark:text-white">Clubes y Copas</h2>
          <p className="text-sm text-apple-gray-500">
            Buscá un jugador para ver la posición en la liga y el progreso en copas de su club
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-apple-gray-800 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 p-5">
        <div className="relative mb-4 max-w-sm" ref={searchRef}>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-apple-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={open ? query : (selectedPlayer?.fullName ?? '')}
              onChange={e => { setQuery(e.target.value); setOpen(true) }}
              onFocus={() => { setQuery(''); setOpen(true) }}
              placeholder="Buscar jugador..."
              className="w-full min-h-[40px] text-sm font-medium rounded-lg border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 pl-9 pr-3 py-2 text-apple-gray-700 dark:text-apple-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green"
            />
          </div>
          {open && (
            <div className="absolute z-10 mt-1 w-full max-h-72 overflow-y-auto rounded-lg border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 shadow-lg">
              {filteredOptions.length === 0 ? (
                <p className="px-3 py-3 text-sm text-apple-gray-400">Sin resultados</p>
              ) : (
                filteredOptions.map(o => (
                  <button
                    key={o.fullName}
                    onClick={() => { setSelectedPlayer(o); setQuery(''); setOpen(false) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/50 transition-colors"
                  >
                    {o.image ? (
                      <img src={o.image} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-apple-gray-200 dark:bg-apple-gray-700 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-apple-gray-800 dark:text-white truncate">{o.fullName}</p>
                      <p className="text-xs text-apple-gray-500 truncate">{o.team}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {competitions === null ? (
          <LoadingSpinner message="Cargando competencias..." />
        ) : competitions.length === 0 ? (
          <p className="text-sm text-apple-gray-500 text-center py-8">
            No se encontraron competencias vigentes para este equipo.
          </p>
        ) : (
          <>
            <div className="flex gap-2 overflow-x-auto scrollbar-thin mb-4">
              {competitions.map((c, i) => (
                <button
                  key={c.leagueId}
                  onClick={() => setActiveCompetitionIdx(i)}
                  className={`min-h-[40px] px-3 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-all duration-200 ease-apple ${
                    i === activeCompetitionIdx
                      ? 'bg-brand-green text-apple-gray-900'
                      : 'bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-500 dark:text-apple-gray-400 hover:text-apple-gray-700 dark:hover:text-apple-gray-200'
                  }`}
                >
                  {c.leagueName}
                </button>
              ))}
            </div>

            {activeCompetition && selectedTeamId != null && (
              activeCompetition.hasStandings ? (
                <CompetitionStandings
                  key={`${selectedTeamId}-${activeCompetition.leagueId}`}
                  teamId={selectedTeamId}
                  leagueId={activeCompetition.leagueId}
                  season={activeCompetition.season}
                />
              ) : (
                <CompetitionFixtures
                  key={`${selectedTeamId}-${activeCompetition.leagueId}`}
                  teamId={selectedTeamId}
                  leagueId={activeCompetition.leagueId}
                  season={activeCompetition.season}
                />
              )
            )}
          </>
        )}
      </div>
    </div>
  )
}
