import { useEffect, useMemo, useState } from 'react'
import {
  getFutureSquad,
  saveFutureSquad,
  type FutureSquadSlot,
  type FutureSquadBaja,
} from '@/services/futureSquadService'
import { mapLineupToSlots, type LineupPlayerForPrefill } from '@/features/coaches/futureSquadPrefill'
import { groupSquadByPosition, POSITION_LABEL_KEY } from '@/features/coaches/squadGrouping'
import FutureSquadPitch from './FutureSquadPitch'
import FutureSquadPlayerPicker from './FutureSquadPlayerPicker'
import { FORMATIONS } from '@/constants/formations'
import { fetchSquadCached, fetchSeasonFixtures, fetchFixtureLineups, type SquadPlayer } from '@/services/footballApiService'
import { fetchCandidateVisuals, type CandidateVisuals } from '@/services/coachService'
import type { PlayerWithScore } from '@/types/scoring'
import type { AgencyCoach } from '@/constants/agencyCoaches'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { PlayerPhoto } from '@/components/ui/PlayerPhoto'
import { isMatchFinished } from '@/utils/coachCalendar'
import { useLanguage } from '@/context/LanguageContext'

function uid(): string {
  return crypto.randomUUID()
}

function initialsOf(name: string): string {
  return name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

function emptySlots(formationType: string): FutureSquadSlot[] {
  return (FORMATIONS[formationType] ?? FORMATIONS['4-3-3']).positions.map(pos => ({
    slotKey: pos.key,
    source: null,
    playerId: null,
    playerName: null,
    playerNumber: null,
    rating: null,
  }))
}

async function buildPrefill(coach: AgencyCoach): Promise<{ formationType: string; slots: FutureSquadSlot[] }> {
  if (!coach.apiTeamId || !coach.leagueSeason) return { formationType: '4-3-3', slots: emptySlots('4-3-3') }

  const fixtures = await fetchSeasonFixtures(coach.apiTeamId, coach.leagueSeason)
  const lastPlayed = fixtures
    .filter(f => isMatchFinished(f.statusShort))
    .sort((a, b) => b.timestamp - a.timestamp)[0]
  if (!lastPlayed) return { formationType: '4-3-3', slots: emptySlots('4-3-3') }

  const lineups = await fetchFixtureLineups(lastPlayed.fixtureId)
  const ownLineup = lineups.find(l => l.team.id === coach.apiTeamId)
  if (!ownLineup) return { formationType: '4-3-3', slots: emptySlots('4-3-3') }

  const startXI: LineupPlayerForPrefill[] = ownLineup.startXI.map(({ player }) => ({
    id: player.id,
    name: player.name,
    number: player.number,
  }))
  return mapLineupToSlots(startXI, ownLineup.formation ?? '4-3-3')
}

/** Fila de jugador del plantel, arrastrable hacia la cancha (izquierda) o hacia Bajas
 *  planificadas (abajo). Una sola forma de moverla -- arrastrar -- para no mezclar
 *  gestos distintos con el mismo significado. */
function DraggableSquadRow({
  player,
  placed,
}: {
  player: SquadPlayer
  placed: boolean
}) {
  const { t } = useLanguage()
  return (
    <div
      draggable
      onDragStart={e => {
        e.dataTransfer.setData('text/plain', String(player.id))
        e.dataTransfer.effectAllowed = 'move'
      }}
      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-grab active:cursor-grabbing transition-colors border ${
        placed
          ? 'border-brand-green/30 bg-brand-green/5'
          : 'border-transparent hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/60'
      }`}
    >
      <PlayerPhoto src={player.photo} name={player.name} size="sm" rounded="full" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-apple-gray-800 dark:text-white truncate">{player.name}</p>
        <p className="text-2xs text-apple-gray-400">
          {player.position ? (POSITION_LABEL_KEY[player.position] ? t(POSITION_LABEL_KEY[player.position]) : player.position) : '—'}
          {player.number != null && ` · #${player.number}`}
        </p>
      </div>
      {placed && (
        <span className="flex-shrink-0 text-2xs font-semibold text-brand-green">{t('coachFutureSquad.enCancha')}</span>
      )}
    </div>
  )
}

/** Cómo va quedando el equipo armado: titulares definidos, refuerzos (con su rating
 *  promedio de Scout Externo) y bajas planificadas. */
function FutureSquadSummary({ slots, bajasCount }: { slots: FutureSquadSlot[]; bajasCount: number }) {
  const { t } = useLanguage()
  const filled = slots.filter(s => s.source !== null).length
  const altas = slots.filter(s => s.source === 'candidate')
  const rated = altas.filter(s => s.rating !== null)
  const avgRating = rated.length ? rated.reduce((sum, s) => sum + (s.rating as number), 0) / rated.length : null
  const tiles = [
    { label: t('coachFutureSquad.resumenTitulares'), value: `${filled}/${slots.length}` },
    { label: t('coachFutureSquad.resumenAltas'), value: String(altas.length), accent: altas.length > 0 },
    { label: t('coachFutureSquad.resumenBajas'), value: String(bajasCount) },
    { label: t('coachFutureSquad.resumenRating'), value: avgRating !== null ? avgRating.toFixed(1) : '—' },
  ]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
      {tiles.map(tile => (
        <div key={tile.label} className="bg-white dark:bg-apple-gray-800/60 border border-apple-gray-200/60 dark:border-apple-gray-700/40 rounded-apple-lg px-3 py-3 text-center">
          <p className={`text-lg sm:text-xl font-bold tabular-nums ${tile.accent ? 'text-brand-green' : 'text-apple-gray-800 dark:text-white'}`}>{tile.value}</p>
          <p className="text-[10px] font-semibold text-apple-gray-400 uppercase tracking-wide mt-0.5">{tile.label}</p>
        </div>
      ))}
    </div>
  )
}

export default function CoachFutureSquadTab({ coach }: { coach: AgencyCoach }) {
  const { t } = useLanguage()
  const [squad, setSquad] = useState<SquadPlayer[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [formationType, setFormationType] = useState('4-3-3')
  const [slots, setSlots] = useState<FutureSquadSlot[]>(emptySlots('4-3-3'))
  const [bajas, setBajas] = useState<FutureSquadBaja[]>([])
  const [savedSnapshot, setSavedSnapshot] = useState<string>('')
  const [pickerSlotKey, setPickerSlotKey] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [candidateVisuals, setCandidateVisuals] = useState<Record<number, CandidateVisuals>>({})
  const [isDragOverBajas, setIsDragOverBajas] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setLoadError(null)
      try {
        const [squadData, plan] = await Promise.all([
          coach.apiTeamId ? fetchSquadCached(coach.apiTeamId) : Promise.resolve([]),
          getFutureSquad(coach.key),
        ])
        if (!active) return
        setSquad(squadData)

        if (plan) {
          setFormationType(plan.formation_type)
          setSlots(plan.slots)
          setBajas(plan.bajas)
          setSavedSnapshot(JSON.stringify({ formationType: plan.formation_type, slots: plan.slots, bajas: plan.bajas }))
        } else {
          const prefill = await buildPrefill(coach)
          if (!active) return
          setFormationType(prefill.formationType)
          setSlots(prefill.slots)
          setBajas([])
          setSavedSnapshot('')
        }
      } catch (err) {
        if (!active) return
        const msg = err instanceof Error ? err.message : t('coachFutureSquad.errorDesconocido')
        setLoadError(msg)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [coach.key, coach.apiTeamId, coach.leagueSeason])

  // Foto y escudo de los candidatos de scouting puestos en la cancha (no vienen en el
  // plantel crudo del equipo -- se resuelven aparte, una vez por cada id nuevo que aparezca).
  const candidateIds = useMemo(
    () => [...new Set(slots.filter(s => s.source === 'candidate').map(s => Number(s.playerId)))],
    [slots],
  )
  useEffect(() => {
    const missing = candidateIds.filter(id => !(id in candidateVisuals))
    if (missing.length === 0) return
    let active = true
    fetchCandidateVisuals(missing).then(visuals => {
      if (active) setCandidateVisuals(prev => ({ ...prev, ...visuals }))
    })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateIds])

  const ownTeamCrest = coach.apiTeamId ? `https://media.api-sports.io/football/teams/${coach.apiTeamId}.png` : null

  const hasUnsavedChanges = JSON.stringify({ formationType, slots, bajas }) !== savedSnapshot

  function handleFormationChange(next: string) {
    setFormationType(next)
    setSlots(emptySlots(next))
  }

  // Defensive dedup: don't push a second baja row for a player who already has one
  // (e.g. removed/displaced once, re-added, then removed/displaced again).
  function pushBaja(playerId: number, playerName: string) {
    setBajas(prev => (
      prev.some(b => b.playerId === playerId) ? prev : [...prev, { id: uid(), playerId, playerName, reason: '' }]
    ))
  }

  function assignSquadPlayer(targetSlotKey: string, player: SquadPlayer) {
    // If the target slot is currently held by a different squad player, that incumbent is being
    // bumped out of the plan entirely (not just relocated) — he needs a baja so he doesn't
    // silently vanish from both the pitch and the bajas list.
    const targetSlot = slots.find(s => s.slotKey === targetSlotKey)
    if (targetSlot?.source === 'squad' && targetSlot.playerId !== player.id) {
      pushBaja(targetSlot.playerId as number, targetSlot.playerName as string)
    }
    setSlots(prev => prev.map(s => {
      if (s.slotKey === targetSlotKey) {
        return { slotKey: s.slotKey, source: 'squad', playerId: player.id, playerName: player.name, playerNumber: player.number, rating: null }
      }
      // Repositioning: if this player already occupies another slot, vacate it instead of
      // leaving a stale duplicate placement (no baja is created — this is a move, not a release).
      if (s.source === 'squad' && s.playerId === player.id) {
        return { slotKey: s.slotKey, source: null, playerId: null, playerName: null, playerNumber: null, rating: null }
      }
      return s
    }))
    // Si el jugador estaba en Bajas y se lo reincorpora a la cancha (arrastrado de vuelta), sacarlo de ahi.
    setBajas(prev => prev.filter(b => b.playerId !== player.id))
  }

  function handleSelectSquad(player: SquadPlayer) {
    if (!pickerSlotKey) return
    assignSquadPlayer(pickerSlotKey, player)
    setPickerSlotKey(null)
  }

  function handleDropSquadPlayer(slotKey: string, playerId: number) {
    const player = squad.find(p => p.id === playerId)
    if (!player) return
    assignSquadPlayer(slotKey, player)
  }

  function handleDropToBaja(playerId: number) {
    const player = squad.find(p => p.id === playerId)
    if (!player) return
    const occupiedSlot = slots.find(s => s.source === 'squad' && s.playerId === player.id)
    if (occupiedSlot) {
      setSlots(prev => prev.map(s => (
        s.slotKey === occupiedSlot.slotKey
          ? { slotKey: s.slotKey, source: null, playerId: null, playerName: null, playerNumber: null, rating: null }
          : s
      )))
    }
    pushBaja(player.id, player.name)
  }

  function handleSelectCandidate(player: PlayerWithScore) {
    if (!pickerSlotKey) return
    // Same displacement rule as handleSelectSquad: a squad player sitting in the target slot
    // must get a baja before being overwritten by a scouting candidate. A candidate incumbent
    // has no baja concept, so replacing one silently is fine.
    const targetSlot = slots.find(s => s.slotKey === pickerSlotKey)
    if (targetSlot?.source === 'squad') {
      pushBaja(targetSlot.playerId as number, targetSlot.playerName as string)
    }
    setSlots(prev => prev.map(s => (
      s.slotKey === pickerSlotKey
        ? { slotKey: s.slotKey, source: 'candidate', playerId: String(player.id), playerName: player.name, playerNumber: null, rating: player.primary_score }
        : s
    )))
    setCandidateVisuals(prev => ({ ...prev, [player.id]: { photo: player.photo, teamLogo: player.team?.logo ?? null } }))
    setPickerSlotKey(null)
  }

  function handleRemoveSlot(slotKey: string) {
    const slot = slots.find(s => s.slotKey === slotKey)
    if (!slot || slot.source === null) return

    if (slot.source === 'squad') {
      pushBaja(slot.playerId as number, slot.playerName as string)
    }
    setSlots(prev => prev.map(s => (
      s.slotKey === slotKey ? { slotKey: s.slotKey, source: null, playerId: null, playerName: null, playerNumber: null, rating: null } : s
    )))
  }

  function handleRemoveBaja(id: string) {
    setBajas(prev => prev.filter(b => b.id !== id))
  }

  async function handleSave() {
    setSaveStatus('saving')
    const res = await saveFutureSquad(coach.key, formationType, slots, bajas)
    if (!res.success) {
      setSaveStatus('error')
      return
    }
    setSavedSnapshot(JSON.stringify({ formationType, slots, bajas }))
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus('idle'), 1500)
  }

  const usedSquadIds = new Set(slots.filter(s => s.source === 'squad').map(s => s.playerId as number))
  const usedCandidateIds = new Set(slots.filter(s => s.source === 'candidate').map(s => s.playerId as string))
  const bajaPlayerIds = new Set(bajas.map(b => b.playerId))
  const pickerSlot = pickerSlotKey ? slots.find(s => s.slotKey === pickerSlotKey) : null
  const rosterGroups = useMemo(
    () => groupSquadByPosition(squad.filter(p => !bajaPlayerIds.has(p.id))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [squad, bajas],
  )

  if (loading) return <LoadingSpinner message={t('coachFutureSquad.cargando')} />

  if (loadError) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-apple-lg p-4">
          <p className="text-sm font-semibold text-brand-red mb-1">{t('coachFutureSquad.errorCargando')}</p>
          <p className="text-xs text-apple-gray-600 dark:text-apple-gray-400">{loadError}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <label className="block text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mb-1">
            {t('coachFutureSquad.formacion')}
          </label>
          <select
            value={formationType}
            onChange={e => handleFormationChange(e.target.value)}
            className="input-apple"
          >
            {Object.keys(FORMATIONS).map(f => (
              <option key={f} value={f}>{FORMATIONS[f].name}</option>
            ))}
          </select>
        </div>
        <p className="hidden lg:block text-2xs text-apple-gray-400 max-w-xs">
          {t('coachFutureSquad.arrastraHint')}
        </p>
        <div className="flex-1" />
        {saveStatus === 'error' && <span className="text-xs text-brand-red">{t('coachFutureSquad.errorGuardar')}</span>}
        {hasUnsavedChanges && saveStatus === 'idle' && <span className="text-xs text-amber-500">{t('coachFutureSquad.cambiosSinGuardar')}</span>}
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saveStatus === 'saving' || loadError !== null}
          className="min-h-[40px] px-4 rounded-full bg-brand-green text-apple-gray-900 text-sm font-semibold disabled:opacity-50"
        >
          {saveStatus === 'saving' ? t('coachFutureSquad.guardando') : saveStatus === 'saved' ? t('coachFutureSquad.guardado') : t('coachFutureSquad.guardar')}
        </button>
      </div>

      <FutureSquadSummary slots={slots} bajasCount={bajas.length} />

      {/* Cancha a la izquierda (ancho fijo, cómoda), plantel + bajas a la derecha usando el
          espacio que sobra en desktop. En mobile se apila: cancha arriba, plantel abajo. */}
      <div className="lg:flex lg:items-start lg:gap-6">
        <div className="lg:flex-1 lg:max-w-2xl mx-auto lg:mx-0">
          <FutureSquadPitch
            formationType={formationType}
            slots={slots}
            squad={squad}
            ownTeamCrest={ownTeamCrest}
            candidateVisuals={candidateVisuals}
            onSlotClick={setPickerSlotKey}
            onRemoveSlot={handleRemoveSlot}
            onDropSquadPlayer={handleDropSquadPlayer}
          />
        </div>

        <div className="mt-4 lg:mt-0 lg:flex-1 lg:min-w-[20rem] space-y-4">
          <div className="bg-white dark:bg-apple-gray-800/60 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 p-3 max-h-[28rem] overflow-y-auto">
            <h3 className="text-sm font-semibold text-apple-gray-800 dark:text-white px-1.5 mb-2">{t('coachFutureSquad.plantel')}</h3>
            {rosterGroups.length === 0 ? (
              <p className="text-sm text-apple-gray-400 px-1.5 py-4">{t('coachFutureSquad.sinPlantel')}</p>
            ) : (
              <div className="space-y-3">
                {rosterGroups.map(group => (
                  <div key={group.positionKey}>
                    <h4 className="text-2xs font-semibold uppercase tracking-wide text-apple-gray-400 px-1.5 mb-1">
                      {t(group.labelKey)}
                    </h4>
                    <div className="space-y-0.5">
                      {group.players.map(player => (
                        <DraggableSquadRow
                          key={player.id}
                          player={player}
                          placed={usedSquadIds.has(player.id)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div
            onDragOver={e => {
              e.preventDefault()
              setIsDragOverBajas(true)
            }}
            onDragLeave={() => setIsDragOverBajas(false)}
            onDrop={e => {
              e.preventDefault()
              setIsDragOverBajas(false)
              const raw = e.dataTransfer.getData('text/plain')
              const playerId = raw ? Number(raw) : NaN
              if (!Number.isNaN(playerId)) handleDropToBaja(playerId)
            }}
            className={`bg-white dark:bg-apple-gray-800/60 rounded-apple-lg border p-4 transition-colors ${
              isDragOverBajas ? 'border-red-400 bg-red-50/60 dark:bg-red-900/10' : 'border-apple-gray-200/60 dark:border-apple-gray-700/40'
            }`}
          >
            <h3 className="text-sm font-semibold text-apple-gray-800 dark:text-white mb-1">{t('coachFutureSquad.bajasPlanificadas')}</h3>
            <p className="text-2xs text-apple-gray-400 mb-3">
              {t('coachFutureSquad.bajasHint')}
            </p>
            {bajas.length === 0 ? (
              <p className="text-sm text-apple-gray-400">{t('coachFutureSquad.sinBajas')}</p>
            ) : (
              <div className="space-y-1">
                {bajas.map(b => (
                  <div key={b.id} className="flex items-center justify-between gap-2 px-1">
                    <span className="text-sm font-medium text-apple-gray-800 dark:text-white truncate">
                      {b.playerName}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveBaja(b.id)}
                      className="text-xs font-semibold text-red-500 flex-shrink-0"
                    >
                      {t('coachFutureSquad.quitar')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {pickerSlotKey && (
        <FutureSquadPlayerPicker
          slotKey={pickerSlotKey}
          formationType={formationType}
          squad={squad}
          apiTeamId={coach.apiTeamId}
          usedSquadIds={pickerSlot?.source === 'squad' ? new Set([...usedSquadIds].filter(id => id !== pickerSlot.playerId)) : usedSquadIds}
          bajaPlayerIds={bajaPlayerIds}
          usedCandidateIds={pickerSlot?.source === 'candidate' ? new Set([...usedCandidateIds].filter(id => id !== pickerSlot.playerId)) : usedCandidateIds}
          onSelectSquad={handleSelectSquad}
          onSelectCandidate={handleSelectCandidate}
          onClose={() => setPickerSlotKey(null)}
        />
      )}
    </div>
  )
}
