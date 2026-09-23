import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchSquadCached, type SquadPlayer } from '@/services/footballApiService'
import { fetchSquadMinutes, fetchExistingPlayerIds, fetchSquadProfiles, type SquadPlayerProfile } from '@/services/coachService'
import { listSquadCareers, type SquadCareer } from '@/services/squadCareersService'
import { useData, identityKey } from '@/context/DataContext'
import { makeAgencyMatcher } from '@/utils/agencyFilter'
import { normalizeName } from '@/utils/scoring'
import { mapSquadPositionToSpanish } from '@/features/coaches/manualExternalPlayer'
import type { EnrichedPlayer } from '@/types'
import RosterTable from './RosterTable'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useLanguage } from '@/context/LanguageContext'

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

  const openFor = (player: SquadPlayer): (() => void) | null => {
    const link = resolveLink(player)
    switch (link.kind) {
      case 'internal':
      case 'external':
        return () => navigate(`/jugador/${encodeURIComponent(link.name)}?source=${link.kind === 'internal' ? 'interno' : 'externo'}`)
      case 'supabase':
        return () => navigate(`/jugador/${encodeURIComponent(link.name)}?source=externo&apiId=${link.apiId}`)
      case 'create':
        return () => void handleCreate(player)
      default:
        return null
    }
  }

  return (
    <RosterTable
      rows={squad.map(player => ({
        player,
        stats: minutes[player.id],
        profile: profiles[player.id],
        career: careers.get(player.id),
        onOpen: openFor(player),
        busy: creatingId === player.id,
      }))}
    />
  )
}
