import { useEffect, useState } from 'react'
import { listCoachMatchTeamStats, type CoachMatchTeamStats } from '@/services/coachService'
import { computeSeasonStats } from '@/features/coaches/seasonStats'
import { isMatchFinished } from '@/utils/coachCalendar'
import { fetchSeasonFixtures } from '@/services/footballApiService'
import CoachWyscoutUploadPanel from './CoachWyscoutUploadPanel'
import CoachWyscoutReportUploadPanel from './CoachWyscoutReportUploadPanel'
import CoachWyscoutReportPanel from './CoachWyscoutReportPanel'
import CoachMatchMetricsEvolution, { buildEnrichedMatchRows } from './CoachMatchMetricsEvolution'
import CoachTeamVsRivalCharts from './CoachTeamVsRivalCharts'
import CoachDtEfficiencyPanel from './CoachDtEfficiencyPanel'
import CoachMatchHistoryTable from './CoachMatchHistoryTable'
import { getLatestWyscoutReport } from '@/services/coachWyscoutReportService'
import type { AgencyCoach } from '@/constants/agencyCoaches'
import type { AgencyFixture } from '@/types/footballApi'
import type { WyscoutReportData } from '@/features/coaches/wyscoutReport/wyscoutReportTypes'
import { useLanguage } from '@/context/LanguageContext'

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-apple-gray-50 dark:bg-apple-gray-900/40 rounded-apple-lg px-3 py-3 text-center">
      <p className="text-lg sm:text-xl font-bold text-apple-gray-800 dark:text-white">{value}</p>
      <p className="text-[10px] font-semibold text-apple-gray-400 uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  )
}

function fmtPct(v: number | null): string {
  return v === null ? '–' : `${v.toFixed(0)}%`
}

function fmtDecimal(v: number | null): string {
  return v === null ? '–' : v.toFixed(2)
}

export default function CoachSeasonStatsCard({ coach }: { coach: AgencyCoach }) {
  const { t } = useLanguage()
  const [statsRows, setStatsRows] = useState<CoachMatchTeamStats[] | null>(null)
  const [fixtures, setFixtures] = useState<AgencyFixture[] | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [wyscoutReport, setWyscoutReport] = useState<WyscoutReportData | null>(null)
  const [showReportUpload, setShowReportUpload] = useState(false)

  const reload = () => {
    listCoachMatchTeamStats(coach.key).then(setStatsRows)
  }

  const reloadReport = () => {
    getLatestWyscoutReport(coach.key).then(setWyscoutReport)
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coach.key])

  useEffect(() => {
    reloadReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coach.key])

  useEffect(() => {
    if (!coach.apiTeamId || !coach.leagueSeason) return
    let active = true
    fetchSeasonFixtures(coach.apiTeamId, coach.leagueSeason).then(f => {
      if (active) setFixtures(f)
    })
    return () => {
      active = false
    }
  }, [coach.key])

  if (!coach.apiTeamId || !coach.leagueSeason) return null
  if (statsRows === null || fixtures === null) return null

  const stats = computeSeasonStats(fixtures, statsRows)
  const finishedFixtureIds = new Set(fixtures.filter(f => isMatchFinished(f.statusShort)).map(f => f.fixtureId))
  const loadedFixtureIds = new Set(statsRows.map(s => s.fixture_id))
  const missingCount = [...finishedFixtureIds].filter(id => !loadedFixtureIds.has(id)).length
  const enrichedRows = buildEnrichedMatchRows(fixtures, statsRows)

  return (
    <div className="bg-white dark:bg-apple-gray-800/60 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 shadow-apple dark:shadow-apple-dark p-5 sm:p-6 mb-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <p className="text-xs font-semibold text-apple-gray-400 uppercase tracking-wide">
          {t('coachDetail.temporadaCon').replace('{name}', coach.fullName.split(' ')[0])}
        </p>
        <button
          type="button"
          onClick={() => setShowUpload(v => !v)}
          className="text-2xs font-semibold text-brand-green hover:underline"
        >
          {showUpload ? t('coachDetail.cerrar') : t('coachDetail.cargarExcelWyscout')}
        </button>
        <button
          type="button"
          onClick={() => setShowReportUpload(v => !v)}
          className="text-2xs font-semibold text-brand-green hover:underline"
        >
          {showReportUpload ? t('coachDetail.cerrar') : 'Cargar informe PDF de Wyscout'}
        </button>
      </div>

      {missingCount > 0 && (
        <div className="flex items-center gap-2 bg-brand-red/10 text-brand-red rounded-apple-lg px-3 py-2 mb-4 text-xs font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-red flex-shrink-0" />
          {t(missingCount === 1 ? 'coachDetail.faltanCargarUno' : 'coachDetail.faltanCargarVarios').replace('{count}', String(missingCount))}
        </div>
      )}

      {showUpload && (
        <div className="mb-4">
          <CoachWyscoutUploadPanel coach={coach} fixtures={fixtures} onSaved={() => { reload(); setShowUpload(false) }} />
        </div>
      )}

      {showReportUpload && (
        <div className="mb-4">
          <CoachWyscoutReportUploadPanel coach={coach} onSaved={() => { reloadReport(); setShowReportUpload(false) }} />
        </div>
      )}

      {stats.played === 0 ? (
        <p className="text-sm text-apple-gray-400 text-center py-6">
          {t('coachDetail.temporadaSinPartidos')}
        </p>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <StatTile label={t('coachDetail.statPJ')} value={String(stats.played)} />
            <StatTile label={t('coachDetail.statPGPEPP')} value={`${stats.won}-${stats.drawn}-${stats.lost}`} />
            <StatTile label={t('coachDetail.statPuntos')} value={`${stats.points}/${stats.possiblePoints}`} />
            <StatTile label={t('coachDetail.statGFGC')} value={`${stats.goalsFor}-${stats.goalsAgainst}`} />
            <StatTile label={t('coachDetail.statPosesionProm')} value={fmtPct(stats.avgPossession)} />
            <StatTile label={t('coachDetail.statXgFavor')} value={fmtDecimal(stats.avgXgFor)} />
            <StatTile label={t('coachDetail.statXgContra')} value={fmtDecimal(stats.avgXgAgainst)} />
          </div>

          <CoachDtEfficiencyPanel rows={enrichedRows} stats={stats} />
          <CoachTeamVsRivalCharts rows={enrichedRows} />
          <CoachMatchMetricsEvolution rows={enrichedRows} />
          <CoachMatchHistoryTable rows={enrichedRows} />
          {wyscoutReport && <CoachWyscoutReportPanel report={wyscoutReport} />}
        </div>
      )}
    </div>
  )
}
