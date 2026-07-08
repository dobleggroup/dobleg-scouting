import { useCallback, useState } from 'react'
import { listInformes, deleteInforme } from '@/features/informes/informesStore'

interface InformesListProps {
  onOpen: (id: string) => void
  onNew: () => void
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const date = d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  return `${date} · ${time}`
}

export default function InformesList({ onOpen, onNew }: InformesListProps) {
  const [items, setItems] = useState(() => listInformes())

  const refresh = useCallback(() => setItems(listInformes()), [])

  function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!window.confirm('¿Borrar este informe? Esta acción no se puede deshacer.')) return
    deleteInforme(id)
    refresh()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-apple-gray-900 dark:text-white">Mis informes</h2>
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
            {items.length === 0
              ? 'Todavía no armaste ningún informe.'
              : `${items.length} informe${items.length === 1 ? '' : 's'} guardado${items.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onNew}
          className="px-4 py-2.5 rounded-xl bg-brand-green text-white text-sm font-semibold hover:bg-brand-green/90 transition-colors flex-shrink-0"
        >
          + Nuevo informe
        </button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-apple-gray-300 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-900 p-10 text-center">
          <svg className="w-10 h-10 mx-auto text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-3">
            Subí un archivo de métricas para armar tu primer informe.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(it => (
            <div
              key={it.id}
              className="rounded-2xl border border-apple-gray-200 dark:border-apple-gray-800 bg-white dark:bg-apple-gray-900 p-5 flex flex-col gap-3 hover:border-brand-green/40 transition-colors"
            >
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-apple-gray-900 dark:text-white truncate">
                  {it.nombre || 'Sin nombre'}
                </h3>
                <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 truncate mt-0.5">
                  {it.contextoComparacion || 'Sin contexto de comparación'}
                </p>
                <p className="text-xs text-apple-gray-400 dark:text-apple-gray-500 mt-1">
                  {formatDate(it.updatedAt)}
                </p>
              </div>
              <div className="flex items-center gap-2 mt-auto pt-1">
                <button
                  type="button"
                  onClick={() => onOpen(it.id)}
                  className="flex-1 px-3 py-2 rounded-xl bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-700 dark:text-apple-gray-200 text-xs font-semibold hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 transition-colors"
                >
                  Abrir
                </button>
                <button
                  type="button"
                  onClick={e => handleDelete(it.id, e)}
                  className="px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-100 dark:hover:bg-red-950/60 transition-colors"
                >
                  Borrar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
