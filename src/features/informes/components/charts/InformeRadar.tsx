import { radarSvg } from '@/features/informes/chartSvg'
import { radarData } from '@/features/informes/chartData'
import { t, translateMetric, type Lang } from '@/features/informes/i18n'
import type { Informe, MetricDef, MetricStat } from '@/features/informes/types'

interface InformeRadarProps {
  informe: Informe
  stats: MetricStat[]
  matrix: Record<string, (number | null)[]>
  defs: MetricDef[]
  lang: Lang
}

/**
 * Radar del protagonista (relleno verde) contra el promedio del resto de su
 * posición (línea gris punteada, percentil 50), en 0-100 por métrica. La
 * explicación va en el recuadro "Cómo leerlo" (fuera de este componente).
 */
export default function InformeRadar({ informe, stats, matrix, defs, lang }: InformeRadarProps) {
  const { axes, series } = radarData(informe, stats, matrix, defs)

  if (axes.length < 3) {
    return (
      <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 italic py-8 text-center">
        {informe.charts.radar.length === 0
          ? 'Elegí al menos 3 métricas para el radar en el paso 2 para verlo acá.'
          : 'Las métricas elegidas no tienen datos suficientes para armar el radar. Elegí otras en el paso 2.'}
      </p>
    )
  }

  const svg = radarSvg({ axes: axes.map(a => translateMetric(a, lang)), series })

  return (
    <div>
      <div className="w-full max-w-[480px] mx-auto" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="flex items-center justify-center gap-5 mt-4 flex-wrap">
        {series.map(s => (
          <div key={s.name || s.color} className="flex items-center gap-2">
            <span
              className="w-3 h-3 flex-shrink-0"
              style={{
                backgroundColor: s.dashed ? 'transparent' : s.color,
                border: s.dashed ? `2px dashed ${s.color}` : undefined,
                borderRadius: s.dashed ? 3 : 999,
              }}
            />
            <span className="text-sm font-medium text-apple-gray-300">
              {s.dashed ? t(lang, 'l_avgPosition') : s.name || 'Sin nombre'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
