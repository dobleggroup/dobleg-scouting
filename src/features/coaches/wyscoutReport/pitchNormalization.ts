// src/features/coaches/wyscoutReport/pitchNormalization.ts
import type { PdfTextItem } from '@/lib/pdf/extractPdfItems'
import type { PitchPoint } from './wyscoutReportTypes'

/**
 * Normaliza un racimo de números de camiseta (posiciones promedio de
 * formación, jugadores de un tramo, o puntos de un mapa de eventos) a una
 * cancha 0-100, tomando el bounding box de los PROPIOS puntos del racimo --
 * nunca el origen de la página ni un valor fijo (ver Finding C1 de la
 * revisión final del branch: clampear el mínimo a 0 aplasta cualquier racimo
 * cuyas coordenadas reales no arranquen en el origen, que es siempre el caso
 * en un PDF real). "y" de PDF crece hacia arriba; la cancha 0-100 crece hacia
 * abajo, de ahí el `100 - ...`.
 *
 * `labelFor` resuelve la etiqueta de cada punto (p.ej. el apellido debajo del
 * número de camiseta, o el propio número si no hay apellido debajo) -- varía
 * por caller (parseAveragePositions/parseStintPlayers buscan un nombre cerca,
 * parseEventMaps usa directamente el número), así que se recibe como
 * callback en vez de asumir un único criterio acá.
 */
export function normalizeCluster(
  numbers: PdfTextItem[],
  labelFor: (n: PdfTextItem, allNumbers: PdfTextItem[]) => string | undefined,
): PitchPoint[] {
  if (numbers.length === 0) return []

  const xs = numbers.map(n => n.x)
  const ys = numbers.map(n => n.y)
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)]
  const [minY, maxY] = [Math.min(...ys), Math.max(...ys)]
  const spanX = maxX - minX || 1
  const spanY = maxY - minY || 1

  return numbers.map(n => ({
    x: ((n.x - minX) / spanX) * 100,
    y: 100 - ((n.y - minY) / spanY) * 100,
    label: labelFor(n, numbers),
  }))
}
