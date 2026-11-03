export interface BottomNavItem {
  key: string
  label: string
  to: string
  /** Otras rutas que también marcan este destino como activo. */
  also?: string[]
}

export const BOTTOM_NAV_ITEMS: BottomNavItem[] = [
  { key: 'inicio', label: 'Inicio', to: '/' },
  { key: 'calendario', label: 'Calendario', to: '/calendario' },
  { key: 'jugadores', label: 'Jugadores', to: '/interno' },
  { key: 'seguimiento', label: 'Seguimiento', to: '/seguimiento-gg' },
  { key: 'reporte', label: 'Cargar', to: '/cargar-reporte', also: ['/cargar-reunion', '/cargar-viaje'] },
]

/**
 * Devuelve la key del destino activo según la ruta. '/' matchea sólo exacto;
 * el resto matchea por prefijo (para subrutas). Gana el prefijo más largo.
 */
export function activeNavKey(pathname: string, items: BottomNavItem[]): string | null {
  let best: { key: string; len: number } | null = null
  for (const item of items) {
    const matches =
      item.to === '/'
        ? pathname === '/'
        : pathname === item.to || pathname.startsWith(item.to + '/') || (item.also ?? []).includes(pathname)
    if (matches && (!best || item.to.length > best.len)) {
      best = { key: item.key, len: item.to.length }
    }
  }
  return best?.key ?? null
}
