import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { fetchScoutPlayerRecord, addScoutPlayer } from '@/services/scoutPlayersService'
import type { ScoutPlayer } from '@/types'

interface TrackingWidgetProps {
  playerName: string
  playerDbId?: string | null
  playerClub?: string
  playerPosition?: string
  supabasePlayerId?: number | null
}

export default function TrackingWidget({ playerName, playerDbId, playerClub, playerPosition, supabasePlayerId }: TrackingWidgetProps) {
  const { user, userDisplayName } = useAuth()
  const [record, setRecord] = useState<ScoutPlayer | null | undefined>(undefined) // undefined = loading
  const [showPopover, setShowPopover] = useState(false)
  const [addToDatos, setAddToDatos] = useState(false)
  const [addToGG, setAddToGG] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    fetchScoutPlayerRecord(playerName, playerDbId, supabasePlayerId).then(setRecord)
  }, [playerName, playerDbId, supabasePlayerId])

  const inDatos = record?.in_datos_list ?? false
  const inGG = record?.in_scouts_gg_list ?? false
  const isTracked = inDatos || inGG

  const handleOpenPopover = () => {
    // Pre-select lists the player is NOT already in
    setAddToDatos(!inDatos)
    setAddToGG(!inGG)
    setError('')
    setShowPopover(true)
  }

  const handleSave = async () => {
    if (!user) { setError('Debés iniciar sesión'); return }
    if (!addToDatos && !addToGG) { setError('Seleccioná al menos una lista'); return }

    setSaving(true)
    setError('')

    const list: 'datos' | 'scouts_gg' | 'both' =
      addToDatos && addToGG ? 'both' : addToDatos ? 'datos' : 'scouts_gg'

    // Ensure we have a display name — fallback to email prefix or generic
    const name = userDisplayName || user.email?.split('@')[0] || 'Scout'

    const result = await addScoutPlayer(
      {
        full_name: playerName,
        ...(supabasePlayerId && { supabase_player_id: supabasePlayerId }),
        ...(playerDbId && { player_db_id: playerDbId, player_db_source: 'externo' as const }),
        ...(playerClub && { club: playerClub }),
        ...(playerPosition && { posicion: playerPosition }),
      },
      list,
      user.id,
      name
    )

    setSaving(false)

    if (result) {
      setRecord(result)
      setShowPopover(false)
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 3000)
    } else {
      setError('No se pudo guardar. Verificá tu conexión e intentá de nuevo.')
    }
  }

  // Still loading
  if (record === undefined) {
    return <div className="animate-pulse h-10 bg-apple-gray-100 dark:bg-apple-gray-700 rounded-xl" />
  }

  return (
    <div className="relative">
      {/* Success flash */}
      {justSaved && (
        <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-brand-green/10 border border-brand-green/20 rounded-xl text-xs font-semibold text-brand-green animate-pulse-once">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          Agregado a seguimiento
        </div>
      )}

      {isTracked ? (
        // ── Already tracked ───────────────────────────────────────────────────
        <div className="bg-brand-green/5 border border-brand-green/20 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-brand-green flex-shrink-0" />
            <span className="text-xs font-semibold text-brand-green">En seguimiento</span>
          </div>
          <div className="space-y-1.5">
            {inDatos && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-apple-gray-600 dark:text-apple-gray-400">Lista de Datos</span>
                {record?.added_by_datos_name && (
                  <span className="text-2xs text-apple-gray-400 truncate max-w-[110px]">
                    por {record.added_by_datos_name}
                  </span>
                )}
              </div>
            )}
            {inGG && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-apple-gray-600 dark:text-apple-gray-400">Scouts GG</span>
                {record?.added_by_scouts_name && (
                  <span className="text-2xs text-apple-gray-400 truncate max-w-[110px]">
                    por {record.added_by_scouts_name}
                  </span>
                )}
              </div>
            )}
          </div>
          {/* Show "add to other list" link if not in both */}
          {user && (!inDatos || !inGG) && (
            <button
              onClick={handleOpenPopover}
              className="mt-0.5 w-full text-xs text-brand-green hover:text-emerald-600 font-medium transition-colors text-left"
            >
              + Agregar a {!inDatos ? 'Lista de Datos' : 'Scouts GG'}
            </button>
          )}
        </div>
      ) : (
        // ── Not tracked ───────────────────────────────────────────────────────
        user && (
          <button
            onClick={handleOpenPopover}
            className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl bg-brand-green/10 hover:bg-brand-green/20 border border-brand-green/20 hover:border-brand-green/40 transition-all"
          >
            <span className="text-sm font-medium text-brand-green">Agregar a seguimiento</span>
            <svg className="w-4 h-4 text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        )
      )}

      {/* ── Popover ─────────────────────────────────────────────────────────── */}
      {showPopover && (
        <>
          {/* Backdrop — high z-index but below popover */}
          <div
            className="fixed inset-0 z-[200]"
            onClick={() => setShowPopover(false)}
          />
          {/* Popover panel — above backdrop */}
          <div className="absolute left-0 right-0 mt-2 z-[201] bg-white dark:bg-apple-gray-800 rounded-xl shadow-2xl border border-apple-gray-200 dark:border-apple-gray-700 p-4">
            <p className="text-xs font-semibold text-apple-gray-500 uppercase tracking-wider mb-3">
              Seleccioná lista
            </p>

            <div className="space-y-1.5 mb-4">
              {/* Lista de Datos row */}
              <div
                onClick={() => !inDatos && setAddToDatos(v => !v)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                  inDatos
                    ? 'bg-brand-green/5 cursor-default'
                    : 'cursor-pointer hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/50'
                }`}
              >
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                  inDatos
                    ? 'bg-brand-green/50 border-brand-green/50'
                    : addToDatos
                    ? 'bg-brand-green border-brand-green'
                    : 'border-apple-gray-300 dark:border-apple-gray-600'
                }`}>
                  {(inDatos || addToDatos) && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-medium ${inDatos ? 'text-apple-gray-400 dark:text-apple-gray-500' : 'text-apple-gray-800 dark:text-white'}`}>
                      Lista de Datos
                    </p>
                    {inDatos && (
                      <span className="text-2xs px-1.5 py-0.5 bg-brand-green/10 text-brand-green rounded font-medium">
                        Ya agregado
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-apple-gray-400">Equipo de análisis</p>
                </div>
              </div>

              {/* Scouts GG row */}
              <div
                onClick={() => !inGG && setAddToGG(v => !v)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                  inGG
                    ? 'bg-brand-green/5 cursor-default'
                    : 'cursor-pointer hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/50'
                }`}
              >
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                  inGG
                    ? 'bg-brand-green/50 border-brand-green/50'
                    : addToGG
                    ? 'bg-brand-green border-brand-green'
                    : 'border-apple-gray-300 dark:border-apple-gray-600'
                }`}>
                  {(inGG || addToGG) && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-medium ${inGG ? 'text-apple-gray-400 dark:text-apple-gray-500' : 'text-apple-gray-800 dark:text-white'}`}>
                      Scouts GG
                    </p>
                    {inGG && (
                      <span className="text-2xs px-1.5 py-0.5 bg-brand-green/10 text-brand-green rounded font-medium">
                        Ya agregado
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-apple-gray-400">Lista de scouts</p>
                </div>
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-500 bg-red-500/10 px-3 py-2 rounded-lg mb-3">{error}</p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowPopover(false)}
                className="flex-1 py-2 rounded-lg text-sm text-apple-gray-600 dark:text-apple-gray-400 bg-apple-gray-100 dark:bg-apple-gray-700 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || (!addToDatos && !addToGG)}
                className="flex-1 py-2 rounded-lg text-sm font-semibold text-white bg-brand-green hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : 'Confirmar'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
