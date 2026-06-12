import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useData } from '@/context/DataContext'
import { matchAgency, addAgencyPlayer, removeAgencyPlayer } from '@/services/agencyPlayersService'
import { resolvePlayerTeam } from '@/services/footballApiService'
import type { EnrichedPlayer } from '@/types'

interface DobleGWidgetProps {
  player: EnrichedPlayer
  apiPlayerId?: number | null
}

export default function DobleGWidget({ player, apiPlayerId }: DobleGWidgetProps) {
  const { user, userDisplayName } = useAuth()
  const { agencyPlayers, refreshAgencyPlayers } = useData()
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [error, setError] = useState('')

  const isDG = matchAgency(agencyPlayers, { name: player.Jugador, apiPlayerId })
  const name = userDisplayName || user?.email?.split('@')[0] || 'Scout'

  if (!user) return null

  const handleAdd = async () => {
    setBusy(true); setError('')
    // Best-effort: resolver el equipo (apiTeamId) para que aparezca en el calendario
    let apiTeamId: number | null = null
    let team = player.Equipo || ''
    if (apiPlayerId) {
      const resolved = await resolvePlayerTeam(apiPlayerId)
      if (resolved) { apiTeamId = resolved.teamId; team = resolved.teamName }
    }
    const ok = await addAgencyPlayer({
      fullName: player.Jugador,
      apiPlayerId: apiPlayerId ?? null,
      image: player.Imagen || null,
      contractEnd: player['Vencimiento contrato'] || null,
      marketValue: player['Valor de mercado (Transfermarkt)'] || null,
      team,
      apiTeamId,
    }, user.id, name)
    if (ok) { await refreshAgencyPlayers() } else { setError('No se pudo guardar. Intentá de nuevo.') }
    setBusy(false)
  }

  const handleRemove = async () => {
    setBusy(true); setError('')
    const ok = await removeAgencyPlayer(player.Jugador, user.id, name)
    if (ok) { await refreshAgencyPlayers(); setConfirmRemove(false) }
    else { setError('No se pudo eliminar. Intentá de nuevo.') }
    setBusy(false)
  }

  const Logo = () => (
    <>
      <img src="/logo-dark.png" alt="Doble G" className="w-4 h-4 object-contain dark:hidden" />
      <img src="/logo-light.png" alt="Doble G" className="w-4 h-4 object-contain hidden dark:block" />
    </>
  )

  if (isDG) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
          <span className="flex items-center gap-2 text-sm font-semibold text-amber-600 dark:text-amber-400">
            <Logo /> Incorporación de Doble G
          </span>
        </div>
        {confirmRemove ? (
          <div className="flex gap-2">
            <button onClick={() => setConfirmRemove(false)} disabled={busy}
              className="flex-1 py-2 rounded-lg text-sm text-apple-gray-600 dark:text-apple-gray-400 bg-apple-gray-100 dark:bg-apple-gray-700 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 transition-colors">
              Cancelar
            </button>
            <button onClick={handleRemove} disabled={busy}
              className="flex-1 py-2 rounded-lg text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-colors flex items-center justify-center">
              {busy ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Eliminar'}
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmRemove(true)}
            className="w-full text-xs text-red-500 hover:text-red-600 font-medium transition-colors text-left px-1">
            Eliminar de Doble G
          </button>
        )}
        {error && <p className="text-xs text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <button onClick={handleAdd} disabled={busy}
        className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 hover:border-amber-500/40 transition-all disabled:opacity-50">
        <span className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
          <Logo /> Nueva incorporación de Doble G
        </span>
        {busy
          ? <div className="w-4 h-4 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
          : <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>}
      </button>
      {error && <p className="text-xs text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>}
    </div>
  )
}
