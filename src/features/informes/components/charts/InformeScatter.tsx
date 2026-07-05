import { scatterSvg } from '@/features/informes/chartSvg'
import { scatterData } from '@/features/informes/chartData'
import type { MetricDef, ScatterAssignment } from '@/features/informes/types'

interface InformeScatterProps {
  scatter: ScatterAssignment
  matrix: Record<string, (number | null)[]>
  defs: MetricDef[]
  protagonistIndex: number
}

/** Scatter de dos métricas: pool + protagonista resaltado, líneas de referencia en ambos promedios. */
export default function InformeScatter({ scatter, matrix, defs, protagonistIndex }: InformeScatterProps) {
  const data = scatterData(scatter, matrix, defs, protagonistIndex)

  if (data.points.length === 0) {
    return (
      <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 italic py-6 text-center">
        Sin datos disponibles para este scatter.
      </p>
    )
  }

  const svg = scatterSvg(data)

  return (
    <div>
      <div className="flex items-center gap-5 mb-3">
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: '#22C55E' }} />
          <span className="text-sm font-medium text-apple-gray-300">Jugador</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: 'rgba(148,163,184,0.5)' }} />
          <span className="text-sm text-apple-gray-300">Resto del pool</span>
        </div>
      </div>
      <div dangerouslySetInnerHTML={{ __html: svg }} />
      {scatter.caption && (
        <p className="text-xs text-apple-gray-300 mt-2 text-center italic">{scatter.caption}</p>
      )}
    </div>
  )
}
