import { useEffect, useRef, useState } from 'react'
import type { PdfTheme } from '@/features/scouts/exportScoutsPdf'

const OPTIONS: { theme: PdfTheme; label: string; swatch: string }[] = [
  { theme: 'claro', label: 'Claro', swatch: 'bg-white border border-apple-gray-300' },
  { theme: 'oscuro', label: 'Oscuro', swatch: 'bg-[#111113] border border-apple-gray-400' },
]

/** Botón de exportar: al tocarlo se elige si el PDF sale claro u oscuro. */
export default function PdfExportButton({ label, busy, disabled, onExport }: {
  label: string
  busy: boolean
  disabled?: boolean
  onExport: (theme: PdfTheme) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={disabled || busy}
        aria-haspopup="menu"
        aria-expanded={open}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-apple-gray-900 dark:bg-white text-white dark:text-apple-gray-900 hover:opacity-90 disabled:opacity-50 transition-all"
      >
        {busy ? 'Armando PDF...' : label}
        {!busy && (
          <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>
      {open && (
        <div role="menu" className="absolute left-0 right-0 sm:left-auto sm:w-56 mt-2 z-30 p-1.5 rounded-xl bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 shadow-lg">
          <div className="px-3 pt-1.5 pb-1 text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400">¿Cómo querés el PDF?</div>
          {OPTIONS.map(o => (
            <button
              key={o.theme}
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onExport(o.theme) }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-apple-gray-900 dark:text-white hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors"
            >
              <span className={`w-5 h-5 rounded-md ${o.swatch}`} />
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
