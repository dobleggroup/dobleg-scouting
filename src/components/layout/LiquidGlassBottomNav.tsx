import { NavLink, useLocation } from 'react-router-dom'
import { BOTTOM_NAV_ITEMS, activeNavKey } from './bottomNavItems'

const ICONS: Record<string, JSX.Element> = {
  inicio: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M3 11l9-8 9 8M5 10v10a1 1 0 001 1h3v-6h6v6h3a1 1 0 001-1V10" />
    </svg>
  ),
  calendario: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  jugadores: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M17 20h5v-1a4 4 0 00-4-4h-1m-6 5H2v-1a4 4 0 014-4h4a4 4 0 014 4v1zM9 11a3 3 0 100-6 3 3 0 000 6zm8-2a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
    </svg>
  ),
  seguimiento: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
    </svg>
  ),
  reporte: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
}

/**
 * Barra inferior flotante estilo "liquid glass". Sólo mobile (`lg:hidden`).
 * `visible=false` la desliza fuera de pantalla. Respeta safe-area y reduced-motion.
 */
export default function LiquidGlassBottomNav({ visible }: { visible: boolean }) {
  const { pathname } = useLocation()
  const active = activeNavKey(pathname, BOTTOM_NAV_ITEMS)

  return (
    <div
      className={`lg:hidden fixed inset-x-0 bottom-0 z-30 pointer-events-none pb-safe transition-transform duration-300 ease-out motion-reduce:transition-none ${
        visible ? 'translate-y-0' : 'translate-y-[160%]'
      }`}
    >
      <nav
        className="pointer-events-auto mx-3 mb-4 flex items-stretch justify-between gap-1 rounded-2xl border border-white/40 dark:border-white/10 bg-white/70 dark:bg-apple-gray-900/60 px-2 py-1.5 shadow-lg shadow-black/10 backdrop-blur-xl"
        aria-label="Navegación principal"
      >
        {BOTTOM_NAV_ITEMS.map(item => {
          const isActive = active === item.key
          return (
            <NavLink
              key={item.key}
              to={item.to}
              className={`flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[10px] font-medium transition-colors ${
                isActive
                  ? 'text-brand-green'
                  : 'text-apple-gray-500 dark:text-apple-gray-400 hover:text-apple-gray-700 dark:hover:text-apple-gray-200'
              }`}
            >
              <span className={`transition-transform ${isActive ? 'scale-110' : ''}`}>{ICONS[item.key]}</span>
              <span className="truncate max-w-full">{item.label}</span>
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
