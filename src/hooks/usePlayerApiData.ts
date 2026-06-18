import { useState, useEffect } from 'react'
import {
  fetchPlayerInjuries,
  fetchPlayerTransfers,
  fetchAgencyTransfers,
  searchApiPlayerId,
  type PlayerSidelined,
  type PlayerTransfer,
  type AgencyTransfer,
} from '@/services/footballApiService'
import { AGENCY_PLAYERS } from '@/constants/agencyPlayers'

export function useApiFootballPlayerId(
  playerName: string | null,
  supabasePlayerId: number | null,
) {
  const [playerId, setPlayerId] = useState<number | null>(supabasePlayerId)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (supabasePlayerId) {
      setPlayerId(supabasePlayerId)
      return
    }
    if (!playerName) return

    let cancelled = false
    setLoading(true)

    const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    const target = normalize(playerName)

    const agencyPlayer = AGENCY_PLAYERS.find(p => {
      const full = normalize(p.fullName)
      const short = normalize(p.shortName)
      return full === target || short === target
        || target.includes(full.split(' ').pop()!) && target[0] === full[0]
    })

    if (!agencyPlayer?.apiTeamId) {
      setLoading(false)
      return
    }

    searchApiPlayerId(agencyPlayer.fullName, agencyPlayer.apiTeamId)
      .then(id => { if (!cancelled) setPlayerId(id) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [playerName, supabasePlayerId])

  return { apiPlayerId: playerId, loading }
}

export function usePlayerInjuries(playerId: number | null) {
  const [injuries, setInjuries] = useState<PlayerSidelined[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!playerId) return
    let cancelled = false
    setLoading(true)

    fetchPlayerInjuries(playerId)
      .then(data => { if (!cancelled) setInjuries(data) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [playerId])

  return { injuries, loading }
}

export function usePlayerTransfers(playerId: number | null) {
  const [transfers, setTransfers] = useState<PlayerTransfer[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!playerId) return
    let cancelled = false
    setLoading(true)

    fetchPlayerTransfers(playerId)
      .then(data => { if (!cancelled) setTransfers(data) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [playerId])

  return { transfers, loading }
}

export function useAgencyTransfers() {
  const [transfers, setTransfers] = useState<AgencyTransfer[]>([])
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    fetchAgencyTransfers((done, total) => {
      if (!cancelled) setProgress({ done, total })
    })
      .then(data => { if (!cancelled) setTransfers(data) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [])

  return { transfers, loading, progress }
}
