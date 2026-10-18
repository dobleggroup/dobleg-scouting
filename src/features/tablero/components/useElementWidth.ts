import { useEffect, useRef, useState } from 'react'

/**
 * Ancho real de un elemento. Los gráficos SVG lo usan como viewBox para que
 * el texto mida lo mismo en el celular y en la compu (con un viewBox fijo el
 * texto se agranda o se achica junto con el gráfico).
 */
export function useElementWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => { if (el.clientWidth > 0) setWidth(el.clientWidth) }
    update()
    const obs = new ResizeObserver(update)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return [ref, width] as const
}
