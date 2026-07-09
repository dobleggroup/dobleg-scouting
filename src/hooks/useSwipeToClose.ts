import { useRef } from 'react'

/**
 * Handlers para cerrar un panel deslizándolo hacia la derecha (el drawer entra
 * desde la derecha). Si el gesto horizontal supera 60px hacia la derecha, cierra.
 */
export function useSwipeToClose(onClose: () => void) {
  const startX = useRef<number | null>(null)
  const startY = useRef<number | null>(null)

  return {
    onTouchStart: (e: React.TouchEvent) => {
      startX.current = e.touches[0].clientX
      startY.current = e.touches[0].clientY
    },
    onTouchMove: (_e: React.TouchEvent) => {
      /* no-op: la decisión se toma al soltar */
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (startX.current === null || startY.current === null) return
      const dx = e.changedTouches[0].clientX - startX.current
      const dy = e.changedTouches[0].clientY - startY.current
      if (dx > 60 && Math.abs(dx) > Math.abs(dy)) onClose()
      startX.current = null
      startY.current = null
    },
  }
}
