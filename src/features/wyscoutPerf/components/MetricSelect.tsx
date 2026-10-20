import { CATEGORY_LABEL, type MetricCategory, type MetricDef } from '../metrics'

/** Desplegable de métricas agrupado por tema (Ataque, Creación, …). */
export default function MetricSelect({ value, metrics, onChange, label }: {
  value: string
  metrics: MetricDef[]
  onChange: (key: string) => void
  label: string
}) {
  const cats = [...new Set(metrics.map(m => m.category))] as MetricCategory[]
  return (
    <select
      aria-label={label}
      value={value}
      onChange={e => onChange(e.target.value)}
      className="max-w-[16rem] px-3 py-1.5 rounded-lg text-xs font-medium bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-700 dark:text-apple-gray-200 border-0 focus:ring-2 focus:ring-brand-green"
    >
      {cats.map(c => (
        <optgroup key={c} label={CATEGORY_LABEL[c]}>
          {metrics.filter(m => m.category === c).map(m => (
            <option key={m.key} value={m.key}>{m.label}{(m.unit === 'pp' ? ' (por partido)' : '')}</option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
