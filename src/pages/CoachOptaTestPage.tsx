import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { ErrorBox } from '@/features/opta/components/ui'
import { useCoachData, COACH_NAME, COACH_PHOTO } from '@/features/optaCoach/useCoachData'
import PanoramaTab from '@/features/optaCoach/components/PanoramaTab'
import PonzioTab from '@/features/optaCoach/components/PonzioTab'
import MatchesTab from '@/features/optaCoach/components/MatchesTab'
import LeagueTab from '@/features/optaCoach/components/LeagueTab'
import RivalTab from '@/features/optaCoach/components/RivalTab'
import SquadTab from '@/features/optaCoach/components/SquadTab'
import CoachTab from '@/features/optaClub/components/CoachTab'
import { longDate } from '@/features/optaClub/components/bits'
import PdfExportPanel from '@/features/coaches/components/summary/PdfExportPanel'
import { PDF_GROUP_TITLES, PDF_SECTIONS } from '@/features/optaCoach/pdf/sections'
import { TEAM_ID, type CoachData } from '@/features/optaCoach/useCoachData'

/** Arma el PDF elegido y lo descarga (todo se carga recién al tocar el botón). */
async function downloadPdf(d: CoachData, oppId: string, sections: string[]) {
  const [{ buildCoachOptaPdf, coachPdfFileName }, { loadImageDataUrl }, data] = await Promise.all([
    import('@/features/optaCoach/pdf/coachOptaPdf'),
    import('@/features/coaches/wyscoutSquad/exportTeamSummaryPdf'),
    import('@/features/opta/data'),
  ])
  const needShots = sections.includes('rivalRemates')
  const [logoDataUrl, photoDataUrl, shots, matchLog] = await Promise.all([
    loadImageDataUrl('/brand/logo-black.png'),
    loadImageDataUrl(COACH_PHOTO),
    needShots ? data.loadShots() : Promise.resolve(null),
    needShots ? data.loadMatchLog() : Promise.resolve(null),
  ])
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const pdf = await buildCoachOptaPdf({ d, oppId, sections, shots, matchLog, today, logoDataUrl, photoDataUrl })
  pdf.save(coachPdfFileName(today, d.league.teamById.get(oppId)?.short ?? 'rival'))
}

const TABS = [
  { id: 'panorama', label: 'Panorama' },
  { id: 'rival', label: 'Próximo rival' },
  { id: 'ciclo', label: 'Con Ponzio' },
  { id: 'partidos', label: 'Partido a partido' },
  { id: 'liga', label: 'River vs la liga' },
  { id: 'plantel', label: 'Plantel y surgidos' },
  { id: 'dt', label: 'El DT' },
] as const
type TabId = typeof TABS[number]['id']

/** Entrenadores → "Leonardo Ponzio · Test Opta": análisis colectivo de River con los datos de Opta. */
export default function CoachOptaTestPage() {
  const { data: d, loading, error } = useCoachData()
  const [params, setParams] = useSearchParams()
  const [showPdf, setShowPdf] = useState(false)
  const [pdfOpp, setPdfOpp] = useState<string | null>(null)
  const requested = params.get('tab')
  const tab: TabId = TABS.some(t => t.id === requested) ? (requested as TabId) : 'panorama'
  const setTab = (id: TabId) => {
    setParams(prev => { const n = new URLSearchParams(prev); n.set('tab', id); return n }, { replace: true })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const back = (
    <Link to="/entrenadores" className="inline-flex items-center gap-2 text-sm text-apple-gray-500 dark:text-apple-gray-400 hover:text-brand-green transition-colors mb-4">
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
      Volver a entrenadores
    </Link>
  )

  if (loading) return <LoadingSpinner message="Cargando datos de Opta…" />
  if (error || !d) {
    return <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">{back}<ErrorBox message={error ?? 'No se pudieron cargar los datos de Opta.'} /></div>
  }

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 animate-fade-in">
      {back}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <img src={COACH_PHOTO} alt="" className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover flex-shrink-0 ring-2 ring-offset-2 ring-brand-green/40 dark:ring-offset-apple-gray-900 bg-apple-gray-100 dark:bg-apple-gray-800" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-apple-gray-800 dark:text-white tracking-tight">{COACH_NAME}</h1>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold tracking-wide bg-apple-gray-900 text-white dark:bg-white dark:text-apple-gray-900">TEST OPTA</span>
          </div>
          <span className="inline-flex items-center gap-1.5 mt-1 text-sm font-medium text-brand-green">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-brand-green animate-pulse-soft" />
            {d.team.name}
          </span>
          <p className="text-xs text-apple-gray-400 mt-0.5">Datos de Opta (Stats Perform) de la {d.league.meta.competition} {d.league.meta.season}, al {longDate(d.league.meta.updatedAt)}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowPdf(v => !v)}
          className={`sm:ml-auto inline-flex items-center gap-2 min-h-[40px] px-4 rounded-full text-sm font-semibold transition-colors ${showPdf ? 'bg-apple-gray-200 dark:bg-apple-gray-700 text-apple-gray-700 dark:text-apple-gray-200' : 'bg-brand-green text-apple-gray-900 hover:-translate-y-0.5 transition-transform'}`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v12m0 0l-4-4m4 4l4-4M5 20h14" /></svg>
          {showPdf ? 'Cerrar' : 'Exportar PDF'}
        </button>
      </div>

      {showPdf && (() => {
        const nextOpp = d.next ? (d.next.home === TEAM_ID ? d.next.away : d.next.home) : null
        const oppId = pdfOpp ?? nextOpp ?? d.league.teams.find(t => t.id !== TEAM_ID)!.id
        const oppShort = d.league.teamById.get(oppId)?.short ?? ''
        return (
          <div className="mb-6">
            <PdfExportPanel
              options={PDF_SECTIONS}
              sectionTitles={{ ...PDF_GROUP_TITLES, rival: `Rival: ${oppShort}` }}
              available={new Set(PDF_SECTIONS.map(s => s.id))}
              onGenerate={ids => downloadPdf(d, oppId, ids)}
              onClose={() => setShowPdf(false)}
              extra={(
                <label className="flex flex-wrap items-center gap-2 text-sm text-apple-gray-700 dark:text-apple-gray-200">
                  Rival a analizar:
                  <select value={oppId} onChange={e => setPdfOpp(e.target.value)} className="input-apple text-sm py-1.5 px-3 w-auto">
                    {d.league.teams.filter(t => t.id !== TEAM_ID && t.games > 0).sort((a, b) => a.short.localeCompare(b.short)).map(t => (
                      <option key={t.id} value={t.id}>{t.short}{t.id === nextOpp ? ' (próximo rival)' : ''}</option>
                    ))}
                  </select>
                </label>
              )}
            />
          </div>
        )
      })()}

      <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-thin [-webkit-overflow-scrolling:touch]">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`min-h-[40px] px-4 rounded-full text-sm font-semibold whitespace-nowrap flex-shrink-0 transition-all duration-200 ease-apple ${
              t.id === tab
                ? 'bg-brand-green text-apple-gray-900'
                : 'bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-500 dark:text-apple-gray-400 hover:text-apple-gray-700 dark:hover:text-apple-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'panorama' && <PanoramaTab d={d} onRival={() => setTab('rival')} />}
      {tab === 'rival' && <RivalTab d={d} />}
      {tab === 'ciclo' && <PonzioTab d={d} />}
      {tab === 'partidos' && <MatchesTab d={d} />}
      {tab === 'liga' && <LeagueTab d={d} />}
      {tab === 'plantel' && <SquadTab d={d} />}
      {tab === 'dt' && d.club.coach && <CoachTab coach={d.club.coach} photo={COACH_PHOTO} clubName={d.team.name} />}
    </div>
  )
}
