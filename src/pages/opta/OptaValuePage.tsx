import { useSearchParams } from 'react-router-dom'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import { fmtDate } from '@/features/opta/components/ui'
import { useValueData } from '@/features/optaValue/useValueData'
import LeagueValueTab from '@/features/optaValue/components/LeagueValueTab'
import AgencyValueTab from '@/features/optaValue/components/AgencyValueTab'

const TABS = [
  { id: 'liga', label: 'Liga Profesional' },
  { id: 'doble-g', label: 'Nuestros jugadores' },
] as const
type TabId = typeof TABS[number]['id']

/** Test Opta → Detector de valor: quién está barato o caro según lo que rinde. */
export default function OptaValuePage() {
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find(t => t.id === params.get('tab'))?.id ?? 'liga') as TabId
  const { data: d, loading, error } = useValueData()

  if (loading) return <LoadingSpinner fullScreen message="Cruzando Opta con Transfermarkt..." />
  if (error || !d) {
    return <div className="max-w-screen-2xl mx-auto px-4 py-8"><EmptyState title="No se pudieron cargar los datos" description={error ?? ''} icon="error" /></div>
  }

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 pb-28 sm:pb-10 animate-fade-in">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-xl sm:text-2xl font-bold text-apple-gray-800 dark:text-white tracking-tight">Detector de valor</h1>
          <span className="text-2xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">Prueba Opta</span>
        </div>
        <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
          Quién está barato o caro según lo que rinde · {d.league.meta.competition} {d.league.meta.season} · rendimiento de Opta al {fmtDate(d.league.meta.updatedAt)} · valores y contratos de Transfermarkt
        </p>
      </div>

      <div className="mb-5 -mx-4 sm:mx-0 px-4 sm:px-0">
        <div className="flex gap-1.5 overflow-x-auto [-webkit-overflow-scrolling:touch]">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setParams(t.id === 'liga' ? {} : { tab: t.id }, { replace: true })}
              className={`flex-shrink-0 px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                tab === t.id ? 'bg-brand-green text-white shadow-sm' : 'bg-white dark:bg-apple-gray-800 text-apple-gray-500 dark:text-apple-gray-400 hover:text-apple-gray-700 dark:hover:text-apple-gray-200'
              }`}
            >
              {t.label}{t.id === 'doble-g' ? ` (${d.dg.size})` : ''}
            </button>
          ))}
        </div>
      </div>

      {tab === 'liga' && <LeagueValueTab d={d} />}
      {tab === 'doble-g' && <AgencyValueTab d={d} />}
    </div>
  )
}
