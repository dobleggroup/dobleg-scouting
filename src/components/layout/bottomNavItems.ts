export interface BottomNavItem {
  key: string
  label: string
  to: string
}

export const BOTTOM_NAV_ITEMS: BottomNavItem[] = [
  { key: 'inicio', label: 'Inicio', to: '/' },
  { key: 'calendario', label: 'Calendario', to: '/calendario' },
  { key: 'jugadores', label: 'Jugadores', to: '/interno' },
  { key: 'seguimiento', label: 'Seguimiento', to: '/seguimiento-gg' },
  { key: 'reporte', label: 'Reporte', to: '/evaluar' },
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
        : pathname === item.to || pathname.startsWith(item.to + '/')
    if (matches && (!best || item.to.length > best.len)) {
      best = { key: item.key, len: item.to.length }
    }
  }
  return best?.key ?? null
}
