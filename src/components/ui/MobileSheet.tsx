import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { useIsMobile } from '@/hooks/useMediaQuery'

/**
 * Envoltorio de modal responsive:
 * - Mobile: hoja a pantalla completa que sube desde abajo, con manija y safe-area.
 * - Desktop: modal centrado clásico.
 * No decide el contenido; sólo el "contenedor". `open=false` no renderiza nada.
 */
export default function MobileSheet({
  open,
  onClose,
  children,
  title,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  title?: string
}) {
  const isMobile = useIsMobile()

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        className={
          isMobile
            ? 'relative w-full max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white dark:bg-apple-gray-900 pb-safe shadow-2xl'
            : 'relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-white dark:bg-apple-gray-900 shadow-2xl'
        }
      >
        {isMobile && (
          <div className="sticky top-0 flex justify-center pt-2 pb-1 bg-white dark:bg-apple-gray-900">
            <span className="h-1.5 w-10 rounded-full bg-apple-gray-300 dark:bg-apple-gray-700" />
          </div>
        )}
        {title && (
          <div className="px-5 pt-2 pb-3 text-base font-semibold text-apple-gray-900 dark:text-white">
            {title}
          </div>
        )}
        <div className="px-5 pb-5">{children}</div>
      </div>
    </div>
  )
}
