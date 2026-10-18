import { useSearchParams } from 'react-router-dom'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import { useAgencyInOpta, useOptaLeague, usePercentiles } from '@/features/opta/hooks'
import SearchTab from '@/features/opta/tabs/SearchTab'
import LeagueTab from '@/features/opta/tabs/LeagueTab'
import { AgencyTab, InsightsTab, MarketTab, MatchesListTab } from '@/features/opta/tabs/MoreTabs'
import TeamsTab from '@/features/opta/tabs/TeamsTab'
import ChartsTab from '@/features/opta/tabs/ChartsTab'
import { fmtDate } from '@/features/opta/components/ui'

const TABS = [
  { id: 'buscador', label: 'Buscador' },
  { id: 'graficos', label: 'Gráficos' },
  { id: 'hallazgos', label: 'Hallazgos' },
  { id: 'equipos', label: 'Equipos' },
  { id: 'liga', label: 'Liga' },
  { id: 'partidos', label: 'Partidos' },
  { id: 'mercado', label: 'Contratos' },
  { id: 'doble-g', label: 'Doble G' },
] as const
type TabId = typeof TABS[number]['id']

export default function OptaHubPage() {
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find(t => t.id === params.get('tab'))?.id ?? 'buscador') as TabId
  const { data: league, error, loading } = useOptaLeague()
  const idx = usePercentiles(league)
  const dg = useAgencyInOpta(league)

  if (loading) return <LoadingSpinner fullScreen message="Cargando datos de Opta..." />
  if (error || !league || !idx) {
    return <div className="max-w-screen-2xl mx-auto px-4 py-8"><EmptyState title="No se pudieron cargar los datos de Opta" description={error ?? ''} icon="error" /></div>
  }


  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 pb-28 sm:pb-10 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-apple-gray-800 dark:text-white tracking-tight">Test Opta</h1>
            <span className="text-2xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">Prueba</span>
          </div>
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
            {league.meta.competition} {league.meta.season} · datos de Opta (Stats Perform) · actualizado {fmtDate(league.meta.updatedAt)}
          </p>
        </div>
      </div>

      <div className="mb-5 -mx-4 sm:mx-0 px-4 sm:px-0">
        <div className="flex gap-1.5 overflow-x-auto [-webkit-overflow-scrolling:touch]">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setParams(t.id === 'buscador' ? {} : { tab: t.id }, { replace: true })}
              className={`flex-shrink-0 px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                tab === t.id ? 'bg-brand-green text-white shadow-sm' : 'bg-white dark:bg-apple-gray-800 text-apple-gray-500 dark:text-apple-gray-400 hover:text-apple-gray-700 dark:hover:text-apple-gray-200'
              }`}
            >
              {t.label}{t.id === 'doble-g' && dg.size > 0 ? ` (${dg.size})` : ''}
            </button>
          ))}
        </div>
      </div>

      {tab === 'buscador' && <SearchTab league={league} idx={idx} dg={dg} />}
      {tab === 'graficos' && <ChartsTab league={league} idx={idx} dg={dg} />}
      {tab === 'hallazgos' && <InsightsTab league={league} idx={idx} dg={dg} />}
      {tab === 'liga' && <LeagueTab league={league} dg={dg} />}
      {tab === 'equipos' && <TeamsTab league={league} />}
      {tab === 'partidos' && <MatchesListTab league={league} />}
      {tab === 'mercado' && <MarketTab league={league} idx={idx} dg={dg} />}
      {tab === 'doble-g' && <AgencyTab league={league} idx={idx} dg={dg} />}
    </div>
  )
}
