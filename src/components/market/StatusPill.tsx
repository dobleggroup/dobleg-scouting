import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Píldora de estado editable inline, en las listas de Mercado. Reemplaza un
 * <select> nativo con appearance:none: en Windows/Chrome el navegador no
 * termina de respetar eso (queda un borde/esquina nativa asomando por más
 * CSS que se le ponga), así que este dropdown lo dibujamos entero nosotros.
 *
 * El menú se monta en un portal (document.body) en vez de vivir adentro de
 * la fila: la tarjeta de cada fila tiene `overflow-hidden` (para los bordes
 * redondeados), así que un menú absoluto normal quedaba recortado ahí adentro
 * y nunca se veía. Posicionado por coordenadas, no depende de eso.
 */
export default function StatusPill<S extends string>({
  value,
  options,
  labels,
  colors,
  onChange,
  title,
}: {
  value: S
  options: readonly S[]
  labels: Record<S, string>
  colors: Record<S, string>
  onChange: (status: S) => void
  title?: string
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: r.left, width: r.width })
  }, [open])

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (btnRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    function onScrollOrResize() { setOpen(false) }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onEscape)
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onEscape)
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title={title}
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className={`inline-flex items-center max-w-full rounded-full font-semibold truncate transition-[filter] hover:brightness-95 dark:hover:brightness-125 gap-1.5 pl-3 pr-2 py-1.5 text-sm ${colors[value]}`}
      >
        <span className="w-2 h-2 rounded-full bg-current flex-shrink-0" />
        <span className="truncate">{labels[value]}</span>
        <svg className={`w-3.5 h-3.5 flex-shrink-0 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          onClick={e => e.stopPropagation()}
          style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: Math.max(pos.width, 152) }}
          className="z-50 py-1 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 shadow-apple-lg dark:shadow-apple-dark-md"
        >
          {options.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => { onChange(opt); setOpen(false) }}
              className={`w-full flex items-center gap-2 px-2 py-1 text-left transition-colors ${opt === value ? 'bg-apple-gray-50 dark:bg-apple-gray-700/60' : 'hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/40'}`}
            >
              <span className={`flex-1 min-w-0 inline-flex items-center rounded-full font-semibold truncate gap-1.5 px-3 py-1.5 text-sm ${colors[opt]}`}>
                <span className="w-2 h-2 rounded-full bg-current flex-shrink-0" />
                <span className="truncate">{labels[opt]}</span>
              </span>
              {opt === value && (
                <svg className="w-3.5 h-3.5 flex-shrink-0 text-apple-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
