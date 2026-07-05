import { barsSvg } from '@/features/informes/chartSvg'
import { barsData } from '@/features/informes/chartData'
import type { MetricStat } from '@/features/informes/types'

interface InformeBarsProps {
  stats: MetricStat[]
  keys: string[]
}

/** Barras horizontales (una por métrica), largo = percentil, con rank + valor real a la derecha. */
export default function InformeBars({ stats, keys }: InformeBarsProps) {
  if (keys.length === 0) {
    return (
      <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 italic py-8 text-center">
        Asigná métricas a Barras en el paso 2 para verlas acá.
      </p>
    )
  }

  const rows = barsData(stats, keys)
  const svg = barsSvg({ rows })

  return (
    <div>
      <div dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="text-xs text-apple-gray-300 mt-3 text-center">
        Verde = jugador · punteado = promedio
      </p>
    </div>
  )
}
