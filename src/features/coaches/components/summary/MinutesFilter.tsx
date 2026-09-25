// src/features/coaches/components/summary/MinutesFilter.tsx
export default function MinutesFilter({ value, max, onChange, included, total }: {
  value: number
  max: number
  onChange: (v: number) => void
  included: number
  total: number
}) {
  return (
    <div className="bg-white dark:bg-apple-gray-800 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor="min-minutes" className="text-sm font-semibold text-apple-gray-800 dark:text-white">
          Mínimo de minutos jugados: <span className="tabular-nums text-brand-green">{value}</span>
        </label>
        <span className="text-xs text-apple-gray-500 dark:text-apple-gray-400">
          Entran <b className="tabular-nums text-apple-gray-800 dark:text-white">{included}</b> de {total} jugadores
        </span>
      </div>
      <input
        id="min-minutes"
        type="range"
        min={0}
        max={max}
        step={45}
        value={Math.min(value, max)}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full mt-3 accent-brand-green cursor-pointer"
      />
      <p className="text-xs text-apple-gray-400 mt-1">
        Afecta a los rankings cada 90 minutos y en porcentaje, así no gana alguien que jugó muy poco. Los goles y asistencias totales muestran a todos.
      </p>
    </div>
  )
}
