// src/features/coaches/components/summary/WidgetCard.tsx
// Tarjeta comun de los widgets del Resumen (mismo estilo que los de Inicio).
import type { ReactNode } from 'react'

export default function WidgetCard({ title, description, action, children, className = '' }: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`bg-white dark:bg-apple-gray-800 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 p-4 sm:p-5 min-w-0 ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-apple-gray-800 dark:text-white">{title}</h3>
          {description && <p className="text-xs text-apple-gray-400 dark:text-apple-gray-500 mt-0.5">{description}</p>}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  )
}

export function WidgetMessage({ children }: { children: ReactNode }) {
  return <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 text-center py-6">{children}</p>
}

export function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-end gap-3 pt-2">
      <div>
        <h2 className="text-lg sm:text-xl font-bold tracking-tight text-apple-gray-800 dark:text-white">{title}</h2>
        {subtitle && <p className="text-xs sm:text-sm text-apple-gray-400 dark:text-apple-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex-1 h-px bg-apple-gray-200 dark:bg-apple-gray-700 mb-2" />
    </div>
  )
}
