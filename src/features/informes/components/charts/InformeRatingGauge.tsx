import { gaugeSvg } from '@/features/informes/chartSvg'
import { parseRating, ratingMax } from '@/features/informes/chartData'

interface InformeRatingGaugeProps {
  rating: string
  promedio?: string
  size?: number
}

/**
 * Velocímetro de rating para el rail del jugador. Escala automática (≤10 sobre 10,
 * si no sobre 100). No renderiza nada si el rating no es un número. La marca de
 * promedio (`promedio`) es opcional.
 */
export default function InformeRatingGauge({ rating, promedio, size = 200 }: InformeRatingGaugeProps) {
  const value = parseRating(rating)
  if (value == null) return null

  const max = ratingMax(value)
  const avg = parseRating(promedio ?? '')
  const svg = gaugeSvg({ value, max, avg: avg != null ? avg : undefined, size })

  return (
    <div className="w-full">
      <div className="mx-auto" style={{ maxWidth: size }} dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="text-[10px] uppercase tracking-wide text-center -mt-1" style={{ color: '#8A9099' }}>
        Rating{avg != null ? ' · línea = promedio' : ''}
      </p>
    </div>
  )
}
