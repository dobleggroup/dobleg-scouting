import { useEffect, useRef, useState } from 'react'
import { CATEGORY_LABEL, fmtMetric, type MetricCategory, type MetricDef } from '../metrics'
import type { PeriodTotals } from '../periods'

const MIN_MINUTES = 450

/** ¿Cambio claro contra la temporada anterior? +1 mejoró, −1 empeoró, 0 parecido. */
function change(m: MetricDef, now: number | null, before: number | null): -1 | 0 | 1 {
  if (now === null || before === null) return 0
  const diff = now - before
  const clear = m.unit === '%' ? Math.abs(diff) >= 3 : Math.abs(before) > 0.05 && Math.abs(diff / before) >= 0.1
  if (!clear) return 0
  return (m.lowerIsBetter ? diff < 0 : diff > 0) ? 1 : -1
}

/**
 * Temporada por temporada, para leer de un vistazo: una fila por métrica y una
 * columna por temporada (la más nueva a la derecha). La flecha compara con la
 * temporada anterior y la estrella marca su mejor temporada.
 */
export default function SeasonTable({ periods, metrics }: { periods: PeriodTotals[]; metrics: MetricDef[] }) {
  const [all, setAll] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  // En pantallas chicas la tabla se desliza de costado: arranca mostrando la temporada actual.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [all, periods.length])
  const enough = periods.filter(p => p.minutes >= MIN_MINUTES)
  if (!periods.length) return null
  const shown = all ? periods : enough.slice(-4)
  if (!shown.length) {
    return <p className="text-sm text-apple-gray-400">Todavía no tiene una temporada con {MIN_MINUTES} minutos o más.</p>
  }

  const cats = [...new Set(metrics.map(m => m.category))] as MetricCategory[]
  const best = new Map<string, number>()
  for (const m of metrics) {
    const vals = enough.map(p => m.compute(p)).filter((v): v is number => v !== null)
    if (vals.length >= 3) best.set(m.key, m.lowerIsBetter ? Math.min(...vals) : Math.max(...vals))
  }
  const last = shown[shown.length - 1]

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-2xs text-apple-gray-500 dark:text-apple-gray-400">
        <span><span className="text-emerald-600 dark:text-emerald-400 font-bold">▲</span> mejoró contra la temporada anterior</span>
        <span><span className="text-red-600 dark:text-red-400 font-bold">▼</span> empeoró</span>
        <span><span className="text-amber-500">★</span> su mejor temporada</span>
        <span>"por partido" = cada 90 minutos jugados</span>
      </div>

      <div ref={scrollRef} className="overflow-x-auto -mx-1 px-1 rounded-apple border border-apple-gray-100 dark:border-apple-gray-700/60">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-apple-gray-50 dark:bg-apple-gray-800/60">
              <th className="text-left px-3 py-2.5 sticky left-0 z-10 bg-apple-gray-50 dark:bg-apple-gray-800 min-w-[9rem] sm:min-w-[11rem]">
                <span className="text-2xs font-semibold uppercase tracking-wide text-apple-gray-400">Temporada</span>
              </th>
              {shown.map(p => {
                const few = p.minutes < MIN_MINUTES
                const current = p === last
                return (
                  <th key={p.key} className={`px-3 py-2.5 text-center min-w-[6.5rem] ${current ? 'bg-brand-green/10' : ''} ${few ? 'opacity-50' : ''}`}>
                    <div className={`text-sm font-bold ${current ? 'text-brand-green' : 'text-apple-gray-800 dark:text-white'}`}>{p.label}</div>
                    <div className="text-2xs font-normal text-apple-gray-500 dark:text-apple-gray-400 truncate max-w-[8rem] mx-auto" title={p.league ?? ''}>{p.league ?? '—'}</div>
                    <div className="text-2xs font-normal text-apple-gray-400 tabular-nums">{p.matches} PJ · {p.minutes.toLocaleString('es-AR')}'</div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {cats.map(c => (
              <CategoryRows key={c} title={CATEGORY_LABEL[c]} metrics={metrics.filter(m => m.category === c)}
                periods={shown} allPeriods={periods} best={best} last={last} cols={shown.length} />
            ))}
          </tbody>
        </table>
      </div>

      {(periods.length > shown.length || all) && (
        <button onClick={() => setAll(a => !a)} className="mt-2 text-xs font-medium text-brand-green hover:underline">
          {all ? 'Ver sólo las últimas temporadas' : `Ver todas las temporadas (${periods.length})`}
        </button>
      )}
    </div>
  )
}

function CategoryRows({ title, metrics, periods, allPeriods, best, last, cols }: {
  title: string
  metrics: MetricDef[]
  periods: PeriodTotals[]
  allPeriods: PeriodTotals[]
  best: Map<string, number>
  last: PeriodTotals
  cols: number
}) {
  return (
    <>
      <tr>
        <td className="px-3 pt-3 pb-1 text-2xs font-semibold uppercase tracking-wide text-apple-gray-400 sticky left-0 z-10 bg-white dark:bg-apple-gray-800">{title}</td>
        <td colSpan={cols} className="bg-white dark:bg-apple-gray-800" />
      </tr>
      {metrics.map(m => (
        <tr key={m.key} className="border-t border-apple-gray-100 dark:border-apple-gray-700/50">
          <td className="px-3 py-2 sticky left-0 z-10 bg-white dark:bg-apple-gray-800">
            <div className="text-xs font-semibold text-apple-gray-800 dark:text-white">
              {m.label}<span className="font-normal text-apple-gray-400">{m.unit === '%' ? '' : ' por partido'}</span>
            </div>
            <div className="text-2xs text-apple-gray-400 leading-snug max-w-[16rem]">{m.hint}</div>
          </td>
          {periods.map(p => {
            const v = m.compute(p)
            // Comparación con la temporada anterior con minutos suficientes (aunque no se muestre).
            const idx = allPeriods.indexOf(p)
            const prev = allPeriods.slice(0, idx).reverse().find(x => x.minutes >= MIN_MINUTES)
            const dir = p.minutes >= MIN_MINUTES && prev ? change(m, v, m.compute(prev)) : 0
            const isBest = p.minutes >= MIN_MINUTES && v !== null && best.get(m.key) === v
            return (
              <td key={p.key} className={`px-3 py-2 text-center tabular-nums whitespace-nowrap ${p === last ? 'bg-brand-green/5' : ''} ${p.minutes < MIN_MINUTES ? 'opacity-50' : ''}`}>
                <span className="text-sm font-semibold text-apple-gray-800 dark:text-white">{fmtMetric(m, v)}</span>
                {dir !== 0 && (
                  <span className={`ml-1 text-2xs font-bold ${dir > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{dir > 0 ? '▲' : '▼'}</span>
                )}
                {isBest && <span className="ml-0.5 text-2xs text-amber-500" title="Su mejor temporada">★</span>}
              </td>
            )
          })}
        </tr>
      ))}
    </>
  )
}
