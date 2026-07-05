import { radarSvg } from '@/features/informes/chartSvg'
import { radarData } from '@/features/informes/chartData'
import type { Informe, MetricDef, MetricStat } from '@/features/informes/types'

interface InformeRadarProps {
  informe: Informe
  stats: MetricStat[]
  matrix: Record<string, (number | null)[]>
  defs: MetricDef[]
}

/**
 * Radar del jugador (protagonista) vs hasta 2 comparados, en percentil (0-100) por eje.
 * Renderiza el SVG puro de `chartSvg.ts` — no depende de Recharts ni del DOM para calcular.
 */
export default function InformeRadar({ informe, stats, matrix, defs }: InformeRadarProps) {
  const { axes, series } = radarData(informe, stats, matrix, defs)

  if (axes.length === 0) {
    return (
      <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 italic py-8 text-center">
        Asigná métricas al radar en el paso 2 para verlo acá.
      </p>
    )
  }

  const svg = radarSvg({ axes, series })

  return (
    <div>
      <div className="w-full max-w-[480px] mx-auto" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="flex items-center justify-center gap-5 mt-4 flex-wrap">
        {series.map(s => (
          <div key={s.name || s.color} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-sm text-apple-gray-300">{s.name || 'Sin nombre'}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-apple-gray-500 mt-2 text-center">
        Cada eje normalizado 0-100 (percentil vs. el pool).
      </p>
    </div>
  )
}
