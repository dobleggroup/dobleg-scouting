import { useCallback, useState } from 'react'
import { listInformes, deleteInforme } from '@/features/informes/informesStore'
import { useLanguage } from '@/context/LanguageContext'
import { LANGUAGE_LOCALES } from '@/constants/translations'

interface InformesListProps {
  onOpen: (id: string) => void
}

function formatDate(iso: string, locale: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const date = d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  return `${date} · ${time}`
}

export default function InformesList({ onOpen }: InformesListProps) {
  const { t, language } = useLanguage()
  const [items, setItems] = useState(() => listInformes())

  const refresh = useCallback(() => setItems(listInformes()), [])

  function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!window.confirm(t('informes.confirmBorrar'))) return
    deleteInforme(id)
    refresh()
  }

  return (
    <div className="space-y-5">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-apple-gray-900 dark:text-white">{t('informes.misInformes')}</h2>
        <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
          {items.length === 0
            ? t('informes.sinInformes')
            : t(items.length === 1 ? 'informes.contadorUno' : 'informes.contadorVarios').replace('{count}', String(items.length))}
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-apple-gray-300 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-900 p-10 text-center">
          <svg className="w-10 h-10 mx-auto text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-3">
            {t('informes.subeArchivoPrimer')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(it => (
            <div
              key={it.id}
              className="rounded-2xl border border-apple-gray-200 dark:border-apple-gray-800 bg-white dark:bg-apple-gray-900 p-5 flex flex-col gap-3 hover:border-brand-green/40 transition-colors"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <h3 className="text-sm font-semibold text-apple-gray-900 dark:text-white truncate">
                    {it.nombre || t('informes.sinNombre')}
                  </h3>
                  {it.modo === 'comparacion' && (
                    <span className="px-1.5 py-0.5 rounded-md bg-brand-green/10 text-brand-green text-2xs font-semibold uppercase tracking-wide flex-shrink-0">
                      1v1
                    </span>
                  )}
                </div>
                <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 truncate mt-0.5">
                  {it.contextoComparacion || t('informes.sinContextoComparacion')}
                </p>
                <p className="text-xs text-apple-gray-400 dark:text-apple-gray-500 mt-1">
                  {formatDate(it.updatedAt, LANGUAGE_LOCALES[language])}
                </p>
              </div>
              <div className="flex items-center gap-2 mt-auto pt-1">
                <button
                  type="button"
                  onClick={() => onOpen(it.id)}
                  className="flex-1 px-3 py-2 rounded-xl bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-700 dark:text-apple-gray-200 text-xs font-semibold hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 transition-colors"
                >
                  {t('informes.abrir')}
                </button>
                <button
                  type="button"
                  onClick={e => handleDelete(it.id, e)}
                  className="px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-100 dark:hover:bg-red-950/60 transition-colors"
                >
                  {t('informes.borrar')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
