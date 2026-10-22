import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLanguage } from '@/context/LanguageContext'
import { LANGUAGE_LOCALES } from '@/constants/translations'

/** "vie 23 oct" en vez de "2026-10-23" — fecha leída con componentes locales (ver marketAlerts.ts). */
function formatFollowup(iso: string, locale: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })
}

/**
 * Fecha de "volver a hablar", editable directo desde la fila colapsada de la
 * lista (mismo patrón de portal que `StatusPill`, por la misma razón: la
 * tarjeta tiene `overflow-hidden` y un popover normal quedaba recortado).
 *
 * Se sacó "volver a hablar" del alta para no complicar un formulario que
 * tiene que ser simple para gente que no es técnica — pero sin fecha el
 * calendario semanal queda vacío. En vez de devolver el campo al formulario,
 * la carga se hace acá: un click sobre "+ Agregar fecha" en la lista, sin
 * abrir la fila entera. Cero campos nuevos, cero fricción extra al crear.
 */
export default function FollowupDateField({
  value,
  overdue,
  onChange,
}: {
  value: string | null
  overdue: boolean
  onChange: (date: string | null) => void
}) {
  const { t, language } = useLanguage()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [pos, setPos] = useState({ top: 0, right: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    setDraft(value ?? '')
    const r = btnRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 4, right: window.innerWidth - r.right })
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handleSave = () => {
    onChange(draft || null)
    setOpen(false)
  }

  const handleClear = () => {
    onChange(null)
    setOpen(false)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title={t('mercado.volverAHablar')}
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className={`text-xs tabular-nums truncate transition-colors ${
          value
            ? overdue ? 'text-red-500 font-semibold hover:text-red-600' : 'text-apple-gray-500 dark:text-apple-gray-400 hover:text-apple-gray-800 dark:hover:text-white'
            : 'text-apple-gray-300 dark:text-apple-gray-600 border border-dashed border-apple-gray-300 dark:border-apple-gray-600 rounded px-1.5 hover:border-brand-green hover:text-brand-green'
        }`}
      >
        {value ? formatFollowup(value, LANGUAGE_LOCALES[language]) : `+ ${t('mercado.agregarFecha')}`}
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          onClick={e => e.stopPropagation()}
          style={{ position: 'fixed', top: pos.top, right: pos.right }}
          className="z-50 p-2.5 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 shadow-apple-lg dark:shadow-apple-dark-md space-y-2 w-52"
        >
          <p className="text-2xs font-medium text-apple-gray-400">{t('mercado.volverAHablar')}</p>
          <input
            type="date"
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            min="2020-01-01"
            max="2100-12-31"
            className="input-apple text-sm w-full"
          />
          <div className="flex items-center gap-2">
            {value && (
              <button type="button" onClick={handleClear} className="text-2xs font-medium text-red-500 hover:text-red-600">
                {t('mercado.quitar')}
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              className="ml-auto text-2xs font-semibold text-white bg-brand-green hover:bg-emerald-600 px-2.5 py-1 rounded-lg"
            >
              {t('mercado.guardar')}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
