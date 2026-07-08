import { useEffect, useState } from 'react'

/** Suscribe a una media query y devuelve si matchea. SSR-safe. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false
  )

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/** Mobile = por debajo del breakpoint `lg` de Tailwind (1024px). */
export function useIsMobile(): boolean {
  return !useMediaQuery('(min-width: 1024px)')
}
