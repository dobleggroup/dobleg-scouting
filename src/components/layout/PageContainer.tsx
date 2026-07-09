import type { ReactNode } from 'react'

/**
 * Contenedor estándar de página: padding mobile cómodo, ancho máximo en desktop.
 * Se aplica a cada página en la Parte B para consistencia.
 */
export default function PageContainer({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`w-full max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6 ${className}`}>
      {children}
    </div>
  )
}
