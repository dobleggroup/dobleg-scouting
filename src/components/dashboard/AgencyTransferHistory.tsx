import { useState } from 'react'
import type { AgencyTransfer } from '@/services/footballApiService'

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function typeBadge(type: string) {
  const t = type.toLowerCase()
  if (t.includes('free')) return { label: 'Libre', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' }
  if (t.includes('loan') || t.includes('prést') || t.includes('prest')) return { label: 'Préstamo', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' }
  if (t === 'n/a' || t === '') return { label: 'N/A', cls: 'bg-apple-gray-100 text-apple-gray-600 dark:bg-apple-gray-700 dark:text-apple-gray-400' }
  return { label: 'Traspaso', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' }
}

export default function AgencyTransferHistory({
  transfers,
  loading,
  progress,
}: {
  transfers: AgencyTransfer[]
  loading: boolean
  progress?: { done: number; total: number }
}) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? transfers : transfers.slice(0, 15)

  if (loading) {
    return (
      <div className="bg-white dark:bg-apple-gray-800 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-apple-gray-800 dark:text-white">Historial de Traspasos</h2>
            <p className="text-xs text-apple-gray-500">
              {progress && progress.total > 0 ? `Cargando ${progress.done}/${progress.total} jugadores...` : 'Resolviendo jugadores...'}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (transfers.length === 0) return null

  return (
    <div className="bg-white dark:bg-apple-gray-800 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-bold text-apple-gray-800 dark:text-white">Historial de Traspasos</h2>
          <p className="text-xs text-apple-gray-500">{transfers.length} movimiento{transfers.length !== 1 ? 's' : ''} registrado{transfers.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className="space-y-2">
        {visible.map((t, i) => {
          const badge = typeBadge(t.type)
          return (
            <div
              key={`${t.playerName}-${t.date}-${i}`}
              className="flex items-center gap-3 p-3 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-700/40 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700/60 transition-colors"
            >
              {/* Player photo */}
              {t.playerImage ? (
                <img src={t.playerImage} alt="" className="w-9 h-9 rounded-full object-cover bg-apple-gray-100 dark:bg-apple-gray-700 flex-shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-apple-gray-200 dark:bg-apple-gray-600 flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 36 36" className="w-5 h-5 text-apple-gray-400">
                    <circle cx="18" cy="13" r="6" fill="currentColor" />
                    <path d="M6 34c0-7.732 5.373-14 12-14s12 6.268 12 14" fill="currentColor" />
                  </svg>
                </div>
              )}

              {/* Player name + date */}
              <div className="min-w-0 flex-shrink-0 w-24 sm:w-32">
                <p className="text-sm font-semibold text-apple-gray-800 dark:text-white truncate">{t.playerName}</p>
                <p className="text-2xs text-apple-gray-500">{formatDate(t.date)}</p>
              </div>

              {/* Team out → Team in */}
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <div className="flex items-center gap-1 min-w-0 flex-1 justify-end">
                  <span className="text-xs text-apple-gray-600 dark:text-apple-gray-300 truncate hidden sm:inline">{t.teams.out.name}</span>
                  <img src={t.teams.out.logo} alt="" className="w-5 h-5 object-contain flex-shrink-0" />
                </div>

                <svg className="w-4 h-4 text-apple-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>

                <div className="flex items-center gap-1 min-w-0 flex-1">
                  <img src={t.teams.in.logo} alt="" className="w-5 h-5 object-contain flex-shrink-0" />
                  <span className="text-xs text-apple-gray-600 dark:text-apple-gray-300 truncate hidden sm:inline">{t.teams.in.name}</span>
                </div>
              </div>

              {/* Type badge */}
              <span className={`px-2 py-0.5 rounded-full text-2xs font-semibold flex-shrink-0 ${badge.cls}`}>
                {badge.label}
              </span>

              {/* Fee */}
              {t.fee && t.fee !== 'Free' && (
                <span className="text-xs font-bold text-apple-gray-700 dark:text-apple-gray-200 tabular-nums flex-shrink-0 hidden sm:inline">
                  {t.fee}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {transfers.length > 15 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-3 w-full py-2 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors"
        >
          Ver todos ({transfers.length})
        </button>
      )}
    </div>
  )
}
