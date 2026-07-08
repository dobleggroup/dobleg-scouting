import { useEffect, useRef, useState } from 'react'
import { nextNavVisibility } from './scrollVisibility'

/**
 * Devuelve si la barra inferior debe mostrarse. Se oculta mientras se scrollea
 * hacia abajo; reaparece al scrollear hacia arriba o al frenar (idle ~160ms).
 * Escucha el scroll de la ventana (el body scrollea a nivel documento).
 */
export function useHideOnScrollDown(): boolean {
  const [visible, setVisible] = useState(true)
  const lastY = useRef(0)
  const idle = useRef<number | undefined>(undefined)

  useEffect(() => {
    lastY.current = window.scrollY
    let ticking = false

    const onScroll = () => {
      if (!ticking) {
        ticking = true
        requestAnimationFrame(() => {
          const currentY = window.scrollY
          setVisible(v => nextNavVisibility({ lastY: lastY.current, currentY, visible: v }))
          lastY.current = currentY
          ticking = false
        })
      }
      window.clearTimeout(idle.current)
      idle.current = window.setTimeout(() => setVisible(true), 160)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.clearTimeout(idle.current)
    }
  }, [])

  return visible
}
