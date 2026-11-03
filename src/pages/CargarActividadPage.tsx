import { useState } from 'react'
import { ActivityForm } from '@/components/scouts/ActivityForm'
import { useCanApproveActivities } from '@/hooks/useCanApproveActivities'
import CargarTabs from '@/components/scouts/CargarTabs'
import type { ActivityKind } from '@/services/scoutsPanelService'

// Páginas "Cargar reunión" y "Cargar viaje" (menú Cargar actividad).

const ICON: Record<ActivityKind, string> = {
  reunion: 'M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a2 2 0 01-2-2v-1m10-7V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l4-4h4',
  viaje: 'M12 19l9 2-9-18-9 18 9-2zm0 0v-8',
}

export default function CargarActividadPage({ kind }: { kind: ActivityKind }) {
  const [saved, setSaved] = useState(false)
  const canApprove = useCanApproveActivities()
  const title = kind === 'reunion' ? 'Cargar reunión' : 'Cargar viaje'

  return (
    <div className="min-h-screen bg-apple-gray-50 dark:bg-apple-gray-900">
      <div className="sticky top-14 z-30 bg-white/80 dark:bg-apple-gray-900/80 backdrop-blur-xl border-b border-apple-gray-200/50 dark:border-apple-gray-800/50">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-green to-emerald-600 flex items-center justify-center shadow-lg shadow-brand-green/20">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ICON[kind]} />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-apple-gray-900 dark:text-white">{title}</h1>
          </div>
          <div className="mt-3"><CargarTabs /></div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 pb-32">
        {saved && (
          <div className="mb-4 flex items-center gap-2 text-base font-medium text-emerald-800 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 rounded-xl">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
            <span>
              {kind === 'reunion' ? 'Reunión guardada.' : 'Viaje guardado.'}
              {!canApprove && ` Suma cuando Marcos o Matías ${kind === 'reunion' ? 'la' : 'lo'} acepten.`}
            </span>
          </div>
        )}
        <div className="bg-white dark:bg-apple-gray-800 rounded-2xl p-5 shadow-sm border border-apple-gray-100 dark:border-apple-gray-700">
          <ActivityForm
            key={kind}
            kind={kind}
            onSaved={() => { setSaved(true); window.scrollTo({ top: 0, behavior: 'smooth' }); setTimeout(() => setSaved(false), 5000) }}
          />
        </div>
      </div>
    </div>
  )
}
