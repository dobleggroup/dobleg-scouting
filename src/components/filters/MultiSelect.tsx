import { useState } from 'react'
import { useLanguage } from '@/context/LanguageContext'

/** Selector de varias opciones con buscador (nacionalidades, agentes...). */
export default function MultiSelect({
  options,
  selected,
  onChange,
  allLabel,
  pluralLabel,
  searchPlaceholder,
  clearLabel,
  inline = false,
}: {
  options: string[]
  selected: string[]
  onChange: (selected: string[]) => void
  allLabel: string
  pluralLabel: string
  searchPlaceholder: string
  clearLabel: string
  /** En mobile (dentro del bottom-sheet) la lista se despliega en flujo, no absoluta,
   *  para que participe del scroll del panel y no quede recortada. */
  inline?: boolean
}) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const normalize = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const filtered = options.filter(o => normalize(o).includes(normalize(search)))

  const toggle = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter(o => o !== option))
    } else {
      onChange([...selected, option])
    }
  }

  const list = (
    <div
      className={
        inline
          ? 'relative mt-2 bg-apple-gray-50 dark:bg-apple-gray-800/60 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 w-full max-h-72 flex flex-col'
          : 'absolute top-full left-0 mt-1 z-[101] bg-white dark:bg-apple-gray-800 rounded-xl shadow-2xl border border-apple-gray-200 dark:border-apple-gray-700 w-64 max-h-72 flex flex-col'
      }
    >
      <div className="p-2 border-b border-apple-gray-100 dark:border-apple-gray-700">
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-apple-gray-700 border-0 focus:ring-1 focus:ring-brand-green/50 text-apple-gray-800 dark:text-white placeholder:text-apple-gray-400"
          autoFocus={!inline}
        />
      </div>
      <div className="overflow-y-auto flex-1 p-1.5">
        {filtered.length === 0 ? (
          <p className="text-xs text-apple-gray-400 px-2 py-3 text-center">{t('externo.sinResultadosTitulo')}</p>
        ) : (
          filtered.map(option => (
            <button
              key={option}
              type="button"
              onClick={() => toggle(option)}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700/50 transition-colors"
            >
              <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-all ${
                selected.includes(option)
                  ? 'bg-brand-green border-brand-green'
                  : 'border-apple-gray-300 dark:border-apple-gray-600'
              }`}>
                {selected.includes(option) && (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span className="text-apple-gray-700 dark:text-apple-gray-200 truncate">{option}</span>
            </button>
          ))
        )}
      </div>
      {selected.length > 0 && (
        <div className="p-2 border-t border-apple-gray-100 dark:border-apple-gray-700">
          <button
            type="button"
            onClick={() => onChange([])}
            className="w-full text-xs text-apple-gray-500 hover:text-red-500 transition-colors"
          >
            {clearLabel}
          </button>
        </div>
      )}
    </div>
  )

  return (
    <div className={inline ? 'w-full' : 'relative'}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`input-apple text-xs px-3 text-left flex items-center justify-between gap-2 ${inline ? 'py-2.5 w-full' : 'py-1.5 min-w-[160px]'} ${selected.length > 0 ? '!border-brand-green/50 !text-brand-green font-semibold' : ''}`}
      >
        <span className="truncate">
          {selected.length === 0
            ? allLabel
            : selected.length === 1
            ? selected[0]
            : `${selected.length} ${pluralLabel}`}
        </span>
        <svg className={`w-3 h-3 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (inline ? (
        list
      ) : (
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)} />
          {list}
        </>
      ))}
    </div>
  )
}
