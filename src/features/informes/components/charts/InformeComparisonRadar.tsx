import { radarSvg } from '@/features/informes/chartSvg'
import { radarComparisonData } from '@/features/informes/chartData'
import { translateMetric, type Lang } from '@/features/informes/i18n'
import type { Informe, MetricDef } from '@/features/informes/types'

interface InformeComparisonRadarProps {
  informe: Informe
  matrix: Record<string, (number | null)[]>
  defs: MetricDef[]
  lang: Lang
}

/**
 * Radar de "Comparaciones": protagonista + hasta 2 jugadores elegidos superpuestos.
 * Se renderiza más grande para que las métricas se lean cómodas.
 */
export default function InformeComparisonRadar({ informe, matrix, defs, lang }: InformeComparisonRadarProps) {
  const { axes, series } = radarComparisonData(informe, matrix, defs)

  if (axes.length < 3) {
    return (
      <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 italic py-6 text-center">
        Elegí métricas con datos para el radar en el paso 2 para comparar acá.
      </p>
    )
  }

  const svg = radarSvg({ axes: axes.map(a => translateMetric(a, lang)), series })

  return (
    <div>
      {/* Contenedor más ancho => el radar (y sus etiquetas) se ven más grandes. */}
      <div className="w-full max-w-[600px] mx-auto" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="flex items-center justify-center gap-5 mt-4 flex-wrap">
        {series.map(s => (
          <div key={s.name || s.color} className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-sm font-semibold text-apple-gray-200">{s.name || 'Sin nombre'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
