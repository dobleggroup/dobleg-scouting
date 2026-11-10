import { createPortal } from 'react-dom'
import { useLanguage } from '@/context/LanguageContext'
import { useAnchoredMenu } from './useAnchoredMenu'
import type { TeamMember } from '@/types/market'

/**
 * Responsable editable inline en las listas de Mercado: mismo dropdown que la
 * píldora de estado, con todo el equipo (cada cuenta nueva entra sola al
 * equipo de Mercado, scouts incluidos).
 */
export default function AssigneePill({
  valueId,
  valueName,
  members,
  onChange,
}: {
  valueId: number | null
  valueName: string | null
  members: TeamMember[]
  onChange: (id: number, name: string) => void
}) {
  const { t } = useLanguage()
  const { open, setOpen, pos, btnRef, menuRef } = useAnchoredMenu()
  const current = valueName?.trim() || null

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title={t('mercado.elegirResponsable')}
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className={`inline-flex items-center whitespace-nowrap rounded-full gap-1.5 pl-2.5 pr-2 py-1 text-[13px] font-medium transition-[filter] hover:brightness-95 dark:hover:brightness-125 ${current
          ? 'bg-apple-gray-100 text-apple-gray-700 dark:bg-apple-gray-700/70 dark:text-apple-gray-100'
          : 'bg-apple-gray-50 text-apple-gray-400 dark:bg-apple-gray-700/40 dark:text-apple-gray-400'}`}
      >
        <span>{current ?? t('mercado.sinAsignar')}</span>
        <svg className={`w-3 h-3 flex-shrink-0 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          onClick={e => e.stopPropagation()}
          style={{ position: 'fixed', top: pos.top, left: Math.min(pos.left, window.innerWidth - 220), minWidth: Math.max(pos.width, 208) }}
          className="z-50 py-1 max-h-72 overflow-y-auto rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800 shadow-apple-lg dark:shadow-apple-dark-md"
        >
          {members.map(m => {
            const selected = m.id === valueId
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => { if (!selected) onChange(m.id, m.name); setOpen(false) }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors ${selected
                  ? 'bg-apple-gray-50 dark:bg-apple-gray-700/60 font-semibold text-apple-gray-900 dark:text-white'
                  : 'text-apple-gray-700 dark:text-apple-gray-200 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/40'}`}
              >
                <span className="flex-1 whitespace-nowrap">{m.name}</span>
                {selected && (
                  <svg className="w-3.5 h-3.5 flex-shrink-0 text-brand-green" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>,
        document.body,
      )}
    </>
  )
}
