// src/features/coaches/components/summary/PdfExportPanel.tsx
// Lista de widgets con casillas (todos marcados) para elegir que entra en el PDF.
import { useState } from 'react'
import { ALL_WIDGETS, SECTION_TITLES, type WidgetInfo, type WidgetSection } from '@/features/coaches/wyscoutSquad/widgetDefs'

export default function PdfExportPanel({ available, onGenerate, onClose }: {
  /** Widgets que hoy tienen datos (los demas no se ofrecen). */
  available: Set<string>
  onGenerate: (widgetIds: string[]) => Promise<void>
  onClose: () => void
}) {
  const widgets = ALL_WIDGETS.filter(w => available.has(w.id))
  const [checked, setChecked] = useState<Set<string>>(() => new Set(widgets.map(w => w.id)))
  const [status, setStatus] = useState<'idle' | 'working' | 'error'>('idle')

  const bySection = new Map<WidgetSection, WidgetInfo[]>()
  for (const w of widgets) bySection.set(w.section, [...(bySection.get(w.section) ?? []), w])

  const toggle = (id: string) => setChecked(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  async function generate() {
    setStatus('working')
    try {
      await onGenerate(widgets.filter(w => checked.has(w.id)).map(w => w.id))
      setStatus('idle')
      onClose()
    } catch (err) {
      console.error('[resumen-pdf]', err)
      setStatus('error')
    }
  }

  return (
    <div className="bg-white dark:bg-apple-gray-800 rounded-apple-lg border border-brand-green/40 p-4 sm:p-5 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <h3 className="text-base font-semibold text-apple-gray-800 dark:text-white">¿Qué querés que tenga el PDF?</h3>
          <p className="text-xs text-apple-gray-400 mt-0.5">Destildá lo que no quieras incluir.</p>
        </div>
        <div className="flex gap-3 text-xs font-medium">
          <button type="button" onClick={() => setChecked(new Set(widgets.map(w => w.id)))} className="text-brand-green hover:text-emerald-600 min-h-[32px]">Marcar todos</button>
          <button type="button" onClick={() => setChecked(new Set())} className="text-apple-gray-500 hover:text-apple-gray-800 dark:hover:text-white min-h-[32px]">Ninguno</button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {[...bySection.entries()].map(([section, list]) => (
          <fieldset key={section}>
            <legend className="text-[10px] font-semibold uppercase tracking-wide text-apple-gray-400 mb-2">{SECTION_TITLES[section]}</legend>
            <div className="space-y-1">
              {list.map(w => (
                <label key={w.id} className="flex items-center gap-2.5 min-h-[32px] cursor-pointer text-sm text-apple-gray-700 dark:text-apple-gray-200">
                  <input type="checkbox" checked={checked.has(w.id)} onChange={() => toggle(w.id)} className="w-4 h-4 accent-brand-green" />
                  {w.title}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-5">
        <button
          type="button"
          onClick={generate}
          disabled={status === 'working' || checked.size === 0}
          className="min-h-[40px] px-4 rounded-full bg-brand-green text-apple-gray-900 text-sm font-semibold disabled:opacity-50"
        >
          {status === 'working' ? 'Armando el PDF…' : `Generar PDF (${checked.size})`}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={status === 'working'}
          className="min-h-[40px] px-4 rounded-full border border-apple-gray-300 dark:border-apple-gray-600 text-sm font-medium text-apple-gray-600 dark:text-apple-gray-300"
        >
          Cancelar
        </button>
        {status === 'error' && <span role="alert" className="text-xs text-brand-red">No se pudo generar. Probá de nuevo.</span>}
      </div>
    </div>
  )
}
