import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchSquadCached, type SquadPlayer } from '@/services/footballApiService'
import { fetchSquadMinutes, fetchExistingPlayerIds, fetchSquadProfiles, type SquadPlayerProfile } from '@/services/coachService'
import { listSquadCareers, type SquadCareer } from '@/services/squadCareersService'
import { useData, identityKey } from '@/context/DataContext'
import { makeAgencyMatcher } from '@/utils/agencyFilter'
import { normalizeName } from '@/utils/scoring'
import { groupSquadByPosition, POSITION_LABEL_KEY } from '@/features/coaches/squadGrouping'
import { mapSquadPositionToSpanish } from '@/features/coaches/manualExternalPlayer'
import type { EnrichedPlayer } from '@/types'
import { PlayerPhoto } from '@/components/ui/PlayerPhoto'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useLanguage } from '@/context/LanguageContext'

// Claves de traduccion para la posición específica de Supabase (players.primary_position),
// mucho más precisa que el grupo genérico que trae el plantel crudo de la API (Defender/Midfielder/etc.).
const FULL_POSITION_LABEL_KEY: Record<string, string> = {
  ARQ: 'teamRoster.posArquero',
  LD: 'teamRoster.posLateralDerecho',
  CB: 'teamRoster.posDefensorCentral',
  LI: 'teamRoster.posLateralIzquierdo',
  VC: 'teamRoster.posVolanteCentral',
  VI: 'teamRoster.posVolanteInterno',
  EXT: 'teamRoster.posExtremo',
  DEL: 'teamRoster.posDelantero',
}

function formatContractBadge(contractEndDate: string, t: (key: string) => string): { label: string; colorClass: string } {
  const months = Math.round((new Date(contractEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30.44))
  const colorClass = months > 18
    ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
    : months > 6
      ? 'text-amber-600 dark:text-amber-400 bg-amber-500/10'
      : 'text-red-500 bg-red-500/10'
  const label = months <= 0
    ? t('teamRoster.contratoVencido')
    : t(months === 1 ? 'teamRoster.contratoUnMes' : 'teamRoster.contratoVariosMeses').replace('{count}', String(months))
  return { label, colorClass }
}

/** "275 mil €" / "1,2 M€": como lo muestra Transfermarkt en castellano. */
function formatMarketValue(eur: number): string {
  if (eur >= 1_000_000) return `${(eur / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M€`
  return `${Math.round(eur / 1000)} mil €`
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-16 px-4 text-center">
      <p className="text-sm text-apple-gray-400 max-w-xs">{message}</p>
    </div>
  )
}

/**
 * Resultado de resolver a dónde debe llevar el click en una tarjeta del plantel:
 * - `internal`/`external`: ficha derivada del CSV legacy (source=interno/externo).
 * - `supabase`: el jugador ya tiene fila real en `players` (Rating, historial,
 *   transfers) — se linkea con `apiId` para que la ficha se renderice 100% desde ahí.
 * - `create`: no hay match en ningún lado, último recurso, crea un stub al vuelo.
 * - `none`: tarjeta no interactiva (jugador de agencia sin match confiable, o datos
 *   todavía cargando) — nunca se ofrece crear un stub en estos casos.
 */
type PlayerLink =
  | { kind: 'internal' | 'external'; name: string }
  | { kind: 'supabase'; name: string; apiId: number }
  | { kind: 'create' }
  | { kind: 'none' }

const ROW_CLASSNAME = 'w-full flex items-center gap-3 px-3 py-2.5 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/60 transition-colors border-b border-apple-gray-100 dark:border-apple-gray-700/40 last:border-b-0'

function RosterPlayerRow({
  player,
  stats,
  profile,
  career,
  link,
  creating,
  onCreateClick,
}: {
  player: SquadPlayer
  stats?: { minutes: number; matches: number }
  profile?: SquadPlayerProfile
  /** Carrera enriquecida desde Transfermarkt (club_squad_careers): completa lo que falta en `players`. */
  career?: SquadCareer
  link: PlayerLink
  creating: boolean
  onCreateClick: () => void
}) {
  const { t } = useLanguage()
  const positionLabelKey = profile?.primary_position
    ? FULL_POSITION_LABEL_KEY[profile.primary_position]
    : player.position
      ? POSITION_LABEL_KEY[player.position]
      : null
  const positionLabel = profile?.primary_position
    ? (positionLabelKey ? t(positionLabelKey) : profile.primary_position)
    : career?.position ?? (positionLabelKey ? t(positionLabelKey) : player.position ?? null)
  const contractEnd = profile?.contract_end_date ?? career?.contractUntil ?? null
  const contractBadge = contractEnd ? formatContractBadge(contractEnd, t) : null
  const agent = profile?.agent ?? career?.agent ?? null
  const marketValue = profile?.market_value_eur ?? career?.marketValueEur ?? null
  const details = [
    agent ? t('teamRoster.agente').replace('{name}', agent) : null,
    marketValue ? formatMarketValue(marketValue) : null,
    career?.heightCm ? `${(career.heightCm / 100).toLocaleString('es-AR', { minimumFractionDigits: 2 })} m` : null,
    career?.foot ? t('teamRoster.pie').replace('{pie}', career.foot.toLowerCase()) : null,
  ].filter(Boolean)

  const content = (
    <>
      <div className="relative w-10 h-10 flex-shrink-0">
        <PlayerPhoto
          src={player.photo}
          name={player.name}
          size="md"
          rounded="full"
          className="ring-1 ring-apple-gray-200/60 dark:ring-apple-gray-700/40"
        />
        {creating && (
          <div className="absolute inset-0 rounded-full bg-white/70 dark:bg-apple-gray-900/70 flex items-center justify-center">
            <span className="w-3.5 h-3.5 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-apple-gray-800 dark:text-white truncate">{player.name}</p>
        <p className="text-2xs text-apple-gray-400 truncate">
          {positionLabel ?? '—'}
          {player.number != null && ` · #${player.number}`}
          {player.age != null && ` · ${player.age} ${t('externo.anios')}`}
          {career?.nationality && ` · ${career.nationality}`}
        </p>
        {details.length > 0 && (
          <p className="text-2xs text-apple-gray-400 truncate hidden sm:block">{details.join(' · ')}</p>
        )}
      </div>
      {career?.homegrown && (
        <span className="hidden sm:inline-flex flex-shrink-0 text-2xs font-semibold px-2 py-1 rounded-full whitespace-nowrap border border-brand-green/40 text-brand-green">
          {t('teamRoster.surgidoClub')}
        </span>
      )}
      {contractBadge && (
        <span className={`hidden md:inline-flex flex-shrink-0 text-2xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${contractBadge.colorClass}`}>
          {contractBadge.label}
        </span>
      )}
      {stats && (
        <span className="flex-shrink-0 text-2xs font-medium px-2 py-1 rounded-full bg-brand-green/10 text-brand-green whitespace-nowrap">
          {t('teamRoster.statsLine').replace('{minutes}', String(stats.minutes)).replace('{matches}', String(stats.matches))}
        </span>
      )}
      {(link.kind === 'internal' || link.kind === 'external' || link.kind === 'supabase' || link.kind === 'create') && (
        <svg className="w-4 h-4 flex-shrink-0 text-apple-gray-300 dark:text-apple-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      )}
    </>
  )

  if (link.kind === 'internal' || link.kind === 'external') {
    const source = link.kind === 'internal' ? 'interno' : 'externo'
    return (
      <Link to={`/jugador/${encodeURIComponent(link.name)}?source=${source}`} className={ROW_CLASSNAME}>
        {content}
      </Link>
    )
  }

  if (link.kind === 'supabase') {
    return (
      <Link to={`/jugador/${encodeURIComponent(link.name)}?source=externo&apiId=${link.apiId}`} className={ROW_CLASSNAME}>
        {content}
      </Link>
    )
  }

  if (link.kind === 'create') {
    return (
      <button type="button" onClick={onCreateClick} disabled={creating} className={`${ROW_CLASSNAME} disabled:cursor-wait text-left`}>
        {content}
      </button>
    )
  }

  // link.kind === 'none': jugador de agencia sin match confiable, o datos todavía
  // cargando — fila no interactiva, nunca se ofrece crear un stub.
  return <div className={ROW_CLASSNAME}>{content}</div>
}

/** Mapas por nombre exacto (normalizeName) y por identityKey, para tolerar formato
 * corto vs. completo ("A. Steimbach" vs "Alexis Steimbach") al buscar un jugador. */
function buildNameMaps(players: EnrichedPlayer[]): { byExact: Map<string, EnrichedPlayer>; byIdentity: Map<string, EnrichedPlayer> } {
  const byExact = new Map<string, EnrichedPlayer>()
  const byIdentity = new Map<string, EnrichedPlayer>()
  for (const p of players) {
    byExact.set(normalizeName(p.Jugador), p)
    const key = identityKey(p.Jugador)
    if (!byIdentity.has(key)) byIdentity.set(key, p)
  }
  return { byExact, byIdentity }
}

export default function TeamRosterPanel({ teamId, teamName }: { teamId: number; teamName: string }) {
  const { t } = useLanguage()
  const [squad, setSquad] = useState<SquadPlayer[] | null>(null)
  const [minutes, setMinutes] = useState<Record<number, { minutes: number; matches: number }>>({})
  const [profiles, setProfiles] = useState<Record<number, SquadPlayerProfile>>({})
  const [existingPlayerIds, setExistingPlayerIds] = useState<Set<number>>(new Set())
  const [creatingId, setCreatingId] = useState<number | null>(null)
  const [careers, setCareers] = useState<Map<number, SquadCareer>>(new Map())
  const { internal, external, agencyPlayers, createManualPlayerAndRefresh, loading } = useData()
  const navigate = useNavigate()

  useEffect(() => {
    let active = true
    setSquad(null)
    setMinutes({})
    setProfiles({})
    setExistingPlayerIds(new Set())
    setCareers(new Map())
    listSquadCareers(teamId).then(list => {
      if (!active || !list) return
      // Por id de API-Football, incluidos los alias (misma persona con otro id).
      const byId = new Map<number, SquadCareer>()
      for (const c of list) {
        for (const id of [c.apiPlayerId, ...c.apiPlayerAliasIds]) if (id !== null) byId.set(id, c)
      }
      setCareers(byId)
    })
    fetchSquadCached(teamId).then(async players => {
      if (!active) return
      setSquad(players)
      const ids = players.map(p => p.id)
      const [m, existing, prof] = await Promise.all([fetchSquadMinutes(ids), fetchExistingPlayerIds(ids), fetchSquadProfiles(ids)])
      if (active) {
        setMinutes(m)
        setExistingPlayerIds(existing)
        setProfiles(prof)
      }
    })
    return () => {
      active = false
    }
  }, [teamId])

  const isAgencyPlayer = useMemo(() => makeAgencyMatcher(agencyPlayers), [agencyPlayers])
  const internalMaps = useMemo(() => buildNameMaps(internal), [internal])
  const externalMaps = useMemo(() => buildNameMaps(external), [external])

  const resolveLink = useCallback((player: SquadPlayer): PlayerLink => {
    const exact = normalizeName(player.name)
    const idKey = identityKey(player.name)

    // 1. Jugador de Doble G: solo puede ir a Interno. Nunca se crea un stub para
    // alguien de la agencia, aunque no se encuentre match (regla del proyecto).
    if (isAgencyPlayer(player.name)) {
      const match = internalMaps.byExact.get(exact) ?? internalMaps.byIdentity.get(idKey)
      if (match) return { kind: 'internal', name: match.Jugador }
      return { kind: 'none' }
    }

    // 2. Ya tiene ficha real en Supabase (misma id que la API del plantel): usar la
    // ficha rica en vez de buscar en el CSV legacy.
    if (existingPlayerIds.has(player.id)) {
      return { kind: 'supabase', name: player.name, apiId: player.id }
    }

    // 3. CSV legacy de Externo.
    const extMatch = externalMaps.byExact.get(exact) ?? externalMaps.byIdentity.get(idKey)
    if (extMatch) return { kind: 'external', name: extMatch.Jugador }

    // 4. Mientras los datos todavía cargan, no ofrecer crear un stub (evita el
    // placeholder que tira excepción si se clickea en esa ventana).
    if (loading) return { kind: 'none' }

    // 5. Último recurso: crear ficha mínima al vuelo.
    return { kind: 'create' }
  }, [isAgencyPlayer, internalMaps, externalMaps, existingPlayerIds, loading])

  const handleCreate = async (player: SquadPlayer) => {
    if (creatingId !== null) return
    setCreatingId(player.id)
    try {
      const created = await createManualPlayerAndRefresh({
        api_player_id: player.id,
        full_name: player.name,
        team: teamName,
        position: mapSquadPositionToSpanish(player.position),
        age: player.age,
        photo: player.photo,
      })
      navigate(`/jugador/${encodeURIComponent(created.Jugador)}?source=externo`)
    } catch (err) {
      console.error('Error creando ficha manual:', err)
    } finally {
      setCreatingId(null)
    }
  }

  if (squad === null) return <LoadingSpinner message={t('teamRoster.cargandoPlantel')} />
  if (squad.length === 0) return <EmptyState message={t('teamRoster.errorCargarPlantel')} />

  const groups = groupSquadByPosition(squad)

  return (
    <div className="space-y-5 animate-fade-in">
      {groups.map(group => (
        <div key={group.positionKey}>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-apple-gray-400 mb-2 px-1">
            {t(group.labelKey)}
          </h3>
          <div className="bg-white dark:bg-apple-gray-800/60 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 overflow-hidden">
            {group.players.map(player => (
              <RosterPlayerRow
                key={player.id}
                player={player}
                stats={minutes[player.id]}
                profile={profiles[player.id]}
                career={careers.get(player.id)}
                link={resolveLink(player)}
                creating={creatingId === player.id}
                onCreateClick={() => void handleCreate(player)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
