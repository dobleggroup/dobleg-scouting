import { useState, useMemo } from 'react'
import { useData } from '@/context/DataContext'
import { linkScoutPlayerToDb } from '@/services/scoutPlayersService'
import { fuzzyMatch } from '@/lib/search'
import type { ScoutPlayer } from '@/types'

interface Props {
  player: ScoutPlayer
  onClose: () => void
  onLinked: (updated: Pick<ScoutPlayer, 'id' | 'player_db_id' | 'player_db_source'>) => void
}

export default function LinkPlayerModal({ player, onClose, onLinked }: Props) {
  const { external, internal } = useData()
  const [query, setQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState<'todos' | 'externo' | 'interno'>('todos')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const results = useMemo(() => {
    const q = query.trim()
    if (!q) return []

    const candidates = [
      ...(sourceFilter !== 'interno' ? external.map(p => ({ ...p, source: 'externo' as const })) : []),
      ...(sourceFilter !== 'externo' ? internal.map(p => ({ ...p, source: 'interno' as const })) : []),
    ]

    return candidates
      .filter(p =>
        fuzzyMatch(q, p.Jugador) ||
        fuzzyMatch(q, p.Equipo || '')
      )
      .slice(0, 30)
  }, [query, sourceFilter, external, internal])

  const handleLink = async (jugador: string, source: 'externo' | 'interno') => {
    setSaving(true)
    setError(null)
    const ok = await linkScoutPlayerToDb(player.id, jugador, source)
    setSaving(false)
    if (!ok) {
      setError('Error al guardar el vínculo. Intentá de nuevo.')
      return
    }
    onLinked({ id: player.id, player_db_id: jugador, player_db_source: source })
    onClose()
  }

  const handleUnlink = async () => {
    setSaving(true)
    setError(null)
    const ok = await linkScoutPlayerToDb(player.id, null, null)
    setSaving(false)
    if (!ok) {
      setError('Error al desvincular. Intentá de nuevo.')
      return
    }
    onLinked({ id: player.id, player_db_id: null, player_db_source: null })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white dark:bg-apple-gray-900 rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-apple-gray-100 dark:border-apple-gray-700 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-apple-gray-900 dark:text-white">
              Vincular jugador a la base de datos
            </h2>
            <p className="text-xs text-apple-gray-500 mt-0.5">
              <span className="font-medium text-brand-green">{player.full_name}</span>
              {player.player_db_id && (
                <span className="ml-2 text-xs text-amber-500">
                  · Vinculado a: {player.player_db_id} ({player.player_db_source})
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-apple-gray-400 hover:text-apple-gray-600 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 flex-shrink-0 space-y-2">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar por nombre o equipo..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-apple-gray-50 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-600 rounded-xl text-apple-gray-900 dark:text-white placeholder:text-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green"
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            {(['todos', 'externo', 'interno'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSourceFilter(s)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  sourceFilter === s
                    ? 'bg-brand-green text-white'
                    : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600'
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-5 pb-3">
          {query.trim().length === 0 ? (
            <p className="text-sm text-apple-gray-400 text-center py-8">
              Escribí el nombre o equipo del jugador
            </p>
          ) : results.length === 0 ? (
            <p className="text-sm text-apple-gray-400 text-center py-8">
              Sin resultados para "{query}"
            </p>
          ) : (
            <div className="space-y-1">
              {results.map((p, i) => (
                <button
                  key={`${p.source}-${p.Jugador}-${i}`}
                  onClick={() => !saving && handleLink(p.Jugador, p.source)}
                  disabled={saving}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-brand-green/5 dark:hover:bg-brand-green/10 transition-colors text-left group"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-apple-gray-900 dark:text-white truncate group-hover:text-brand-green transition-colors">
                      {p.Jugador}
                    </p>
                    <p className="text-xs text-apple-gray-500 truncate">
                      {[p.Equipo, p.Liga, p['Posición'], p.Edad ? `${p.Edad}a` : null].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    {p.ggScore !== null && p.ggScore !== undefined && (
                      <span className={`text-xs font-bold tabular-nums ${
                        p.ggScore >= 70 ? 'text-brand-green' :
                        p.ggScore >= 50 ? 'text-emerald-500' :
                        p.ggScore >= 30 ? 'text-amber-500' : 'text-apple-gray-400'
                      }`}>
                        {p.ggScore.toFixed(0)}
                      </span>
                    )}
                    <span className={`px-1.5 py-0.5 rounded-md text-2xs font-medium ${
                      p.source === 'externo'
                        ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                        : 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                    }`}>
                      {p.source}
                    </span>
                    <svg className="w-4 h-4 text-apple-gray-300 group-hover:text-brand-green transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-apple-gray-100 dark:border-apple-gray-700 flex-shrink-0 flex items-center justify-between">
          {player.player_db_id ? (
            <button
              onClick={handleUnlink}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
            >
              Desvincular
            </button>
          ) : (
            <div />
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
