import type { MetricStat } from '@/features/informes/types'

function formatValue(stat: MetricStat): string {
  if (stat.value == null) return '—'
  const v = stat.def.unit === '%' ? stat.value.toFixed(0) : stat.value.toFixed(2)
  return stat.def.unit === '%' ? `${v}%` : v
}

interface InformeNumberCardProps {
  stat: MetricStat
}

/** Card compacta: valor grande + ranking + label de la métrica. Colores Doble G explícitos (siempre dark, sin variantes `dark:`). */
export default function InformeNumberCard({ stat }: InformeNumberCardProps) {
  return (
    <div
      className="p-4 flex flex-col items-center text-center gap-1"
      style={{ background: '#14171B', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px' }}
    >
      <span className="text-3xl font-black" style={{ color: '#F5F7FA', fontVariantNumeric: 'tabular-nums' }}>
        {formatValue(stat)}
      </span>
      <span
        className="text-xs font-semibold px-2 py-0.5 rounded-full"
        style={
          stat.rank != null
            ? { background: 'rgba(34,197,94,0.14)', color: '#4ADE80' }
            : { background: 'transparent', color: '#8A9099' }
        }
      >
        {stat.rank != null ? `N°${stat.rank} de ${stat.total}` : 'Sin datos'}
      </span>
      <span className="text-sm leading-tight" style={{ color: '#8A9099' }}>{stat.def.label}</span>
    </div>
  )
}
