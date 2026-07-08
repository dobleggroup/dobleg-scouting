import { barsSvg } from '@/features/informes/chartSvg'
import { barsData } from '@/features/informes/chartData'
import { t, translateMetric, type Lang } from '@/features/informes/i18n'
import type { MetricStat } from '@/features/informes/types'

interface InformeBarsProps {
  stats: MetricStat[]
  keys: string[]
  lang: Lang
}

/** Barras horizontales (una por métrica), largo = percentil, con rank + valor real a la derecha. */
export default function InformeBars({ stats, keys, lang }: InformeBarsProps) {
  if (keys.length === 0) {
    return (
      <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 italic py-8 text-center">
        Asigná métricas a Barras en el paso 2 para verlas acá.
      </p>
    )
  }

  const rows = barsData(stats, keys).map(r => ({ ...r, label: translateMetric(r.label, lang) }))
  // Ancho para desktop, apilado para mobile (nombres legibles en pantallas angostas).
  const svgWide = barsSvg({ rows })
  const svgNarrow = barsSvg({ rows, stacked: true })

  return (
    <div>
      <div className="hidden sm:block" dangerouslySetInnerHTML={{ __html: svgWide }} />
      <div className="block sm:hidden" dangerouslySetInnerHTML={{ __html: svgNarrow }} />
      <div className="flex items-center justify-center gap-5 mt-3 flex-wrap">
        <span className="inline-flex items-center gap-2 text-xs text-apple-gray-300">
          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: '#22C55E' }} />
          {t(lang, 'l_thisPlayer')}
        </span>
        <span className="inline-flex items-center gap-2 text-xs text-apple-gray-300">
          <span className="w-[2px] h-3.5 flex-shrink-0" style={{ backgroundColor: '#CBD2DB' }} />
          {t(lang, 'm_avg')}
        </span>
      </div>
    </div>
  )
}
