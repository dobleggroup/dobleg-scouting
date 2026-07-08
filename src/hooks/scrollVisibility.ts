/**
 * Decide si la barra inferior debe estar visible según el scroll.
 * - Cerca del tope: siempre visible.
 * - Bajando más que el umbral: ocultar.
 * - Subiendo más que el umbral: mostrar.
 * - Movimiento chico: mantener el estado actual.
 */
export function nextNavVisibility(p: {
  lastY: number
  currentY: number
  visible: boolean
  threshold?: number
}): boolean {
  const threshold = p.threshold ?? 6
  if (p.currentY <= 8) return true
  if (p.currentY > p.lastY + threshold) return false
  if (p.currentY < p.lastY - threshold) return true
  return p.visible
}
