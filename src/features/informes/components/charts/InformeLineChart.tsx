import { lineChartSvg } from '@/features/informes/chartSvg'
import type { LinePoint } from '@/features/informes/chartSvg'

interface InformeLineChartProps {
  points: LinePoint[]
  color?: string
  formatValue?: (v: number) => string
  emptyText?: string
  showValues?: boolean
}

/** Gráfico de línea (evolución temporal) — wrapper del SVG puro de chartSvg. */
export default function InformeLineChart({ points, color, formatValue, emptyText, showValues }: InformeLineChartProps) {
  if (points.length < 2) {
    return (
      <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 italic py-6 text-center">
        {emptyText ?? 'Sin datos suficientes para la evolución.'}
      </p>
    )
  }
  const svg = lineChartSvg({ points, color, formatValue, showValues })
  return <div dangerouslySetInnerHTML={{ __html: svg }} />
}
