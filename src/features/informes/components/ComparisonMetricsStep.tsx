import { useMemo, useState } from 'react'
import type { MetricDef } from '@/features/informes/types'
import { formatComparisonValue } from '@/features/informes/comparisonInsight'
import { normalizeForSearch } from '@/lib/search'

interface Props {
  defs: MetricDef[]
  matrix: Record<string, (number | null)[]>
  idxA: number
  idxB: number
  nameA: string
  nameB: string
  selected: string[]
  onChangeSelected: (keys: string[]) => void
  onBack: () => void
  onNext: () => void
}

/**
 * Elegir métricas para el informe de Comparación 1v1: una sola lista (alimenta
 * a la vez el radar y la tabla de barras, no hay que armar cada gráfico por
 * separado como en el informe general).
 */
export default function ComparisonMetricsStep({
  defs, matrix, idxA, idxB, nameA, nameB, selected, onChangeSelected, onBack, onNext,
}: Props) {
  const [query, setQuery] = useState('')

  const withData = useMemo(
    () => defs.filter(d => (matrix[d.key]?.[idxA] ?? null) != null && (matrix[d.key]?.[idxB] ?? null) != null),
    [defs, matrix, idxA, idxB],
  )

  const filtered = useMemo(() => {
    const q = normalizeForSearch(query.trim())
    if (!q) return withData
    return withData.filter(d => normalizeForSearch(d.label).includes(q))
  }, [withData, query])

  function toggle(key: string) {
    onChangeSelected(selected.includes(key) ? selected.filter(k => k !== key) : [...selected, key])
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="rounded-2xl border border-apple-gray-200 dark:border-apple-gray-800 bg-white dark:bg-apple-gray-900 p-5">
        <h2 className="text-sm font-semibold text-apple-gray-900 dark:text-white mb-1">Métricas a comparar</h2>
        <p className="text-xs text-apple-gray-400 dark:text-apple-gray-500 mb-3">
          Elegí las métricas para el radar y la tabla — recomendado 8 a 12. Sólo se listan las que tienen dato de los dos jugadores.
        </p>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar métrica..."
          className="w-full px-3 py-2.5 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50 dark:bg-apple-gray-800 text-apple-gray-900 dark:text-white placeholder-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green text-sm mb-3"
        />

        {selected.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {selected.map(key => {
              const d = defs.find(x => x.key === key)
              if (!d) return null
              return (
                <span key={key} className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1 rounded-full bg-brand-green/10 border border-brand-green/25 text-xs font-medium text-brand-green">
                  {d.label}
                  <button type="button" onClick={() => toggle(key)} className="text-brand-green/50 hover:text-brand-green transition-colors ml-0.5">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              )
            })}
          </div>
        )}

        <div className="max-h-[26rem] overflow-y-auto rounded-xl border border-apple-gray-100 dark:border-apple-gray-800 divide-y divide-apple-gray-100 dark:divide-apple-gray-800">
          {withData.length === 0 && (
            <p className="px-3 py-4 text-sm text-apple-gray-500 dark:text-apple-gray-400">
              No hay métricas con datos de los dos jugadores en el archivo.
            </p>
          )}
          {filtered.map(d => {
            const isSel = selected.includes(d.key)
            const valA = formatComparisonValue(matrix[d.key]?.[idxA] ?? null, d.unit)
            const valB = formatComparisonValue(matrix[d.key]?.[idxB] ?? null, d.unit)
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => toggle(d.key)}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors ${
                  isSel ? 'bg-brand-green/10' : 'hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/60'
                }`}
              >
                <span className={`text-sm truncate ${isSel ? 'text-brand-green font-medium' : 'text-apple-gray-900 dark:text-white'}`}>
                  {d.label}
                </span>
                <span className="flex items-center gap-2 flex-shrink-0 text-xs tabular-nums text-apple-gray-500 dark:text-apple-gray-400">
                  <span title={nameA}>{valA}</span>
                  <span className="text-apple-gray-300 dark:text-apple-gray-600">·</span>
                  <span title={nameB}>{valB}</span>
                  {isSel ? (
                    <svg className="w-4 h-4 text-brand-green flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                      <path fillRule="evenodd" d="M12 2a10 10 0 100 20 10 10 0 000-20zm4.7 7.7a1 1 0 00-1.4-1.4L11 12.6l-1.8-1.8a1 1 0 10-1.4 1.4l2.5 2.5a1 1 0 001.4 0l5-5z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-apple-gray-300 dark:text-apple-gray-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <circle cx="12" cy="12" r="9" />
                    </svg>
                  )}
                </span>
              </button>
            )
          })}
          {withData.length > 0 && filtered.length === 0 && (
            <p className="px-3 py-4 text-sm text-apple-gray-500 dark:text-apple-gray-400">Sin resultados.</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 px-4 py-3 rounded-xl bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-700 dark:text-apple-gray-200 text-sm font-semibold hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 transition-colors"
        >
          ← Volver
        </button>
        <button
          type="button"
          disabled={selected.length < 3}
          onClick={onNext}
          className="flex-1 px-4 py-3 rounded-xl bg-brand-green text-white text-sm font-semibold hover:bg-brand-green/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Ver informe →
        </button>
      </div>
      {selected.length > 0 && selected.length < 3 && (
        <p className="text-xs text-center text-apple-gray-400 dark:text-apple-gray-500">Elegí al menos 3 métricas para el radar.</p>
      )}
    </div>
  )
}
