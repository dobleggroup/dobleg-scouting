import { useEffect, useMemo, useState } from 'react'
import { fetchSeasonFixtures, fetchTeamFixtures } from '@/services/footballApiService'
import { isMatchFinished } from '@/utils/coachCalendar'
import CoachRivalPanel from './CoachRivalPanel'
import CoachSeasonStatsCard from './CoachSeasonStatsCard'
import type { AgencyFixture } from '@/types/footballApi'
import type { AgencyCoach } from '@/constants/agencyCoaches'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useLanguage } from '@/context/LanguageContext'
import { LANGUAGE_LOCALES } from '@/constants/translations'
import { listCoachMatchTeamStats, type CoachMatchTeamStats } from '@/services/coachService'
import { computeSeasonStats } from '@/features/coaches/seasonStats'
import { getLatestSquadStats, type SquadStatsRecord } from '@/services/wyscoutSquadService'
import { getLatestWyscoutReport } from '@/services/coachWyscoutReportService'
import type { WyscoutReportData } from '@/features/coaches/wyscoutReport/wyscoutReportTypes'
import { buildEnrichedMatchRows } from './CoachMatchMetricsEvolution'
import { filterByMinutes } from '@/features/coaches/wyscoutSquad/squadMetrics'
import { RANKING_WIDGETS } from '@/features/coaches/wyscoutSquad/widgetDefs'
import SummaryToolbar from './summary/SummaryToolbar'
import WyscoutSquadDropzone from './summary/WyscoutSquadDropzone'
import MinutesFilter from './summary/MinutesFilter'
import RankingWidget from './summary/RankingWidget'
import SquadProfileWidget from './summary/SquadProfileWidget'
import SquadTableWidget from './summary/SquadTableWidget'
import ScatterWidget from './summary/ScatterWidget'
import { SCATTER_DEFS } from '@/features/coaches/wyscoutSquad/scatterPlots'
import PdfExportPanel from './summary/PdfExportPanel'
import { SectionHeading } from './summary/WidgetCard'
import { LastMatchesWidget, StandingsWidget, UpcomingWidget, useStandings } from './summary/TeamWidgets'

const DEFAULT_MIN_MINUTES = 450

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-16 px-4 text-center">
      <p className="text-sm text-apple-gray-400 max-w-xs">{message}</p>
    </div>
  )
}

function todayIso(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function NextMatchCard({ next }: { next: AgencyFixture }) {
  const { t, language } = useLanguage()
  const locale = LANGUAGE_LOCALES[language]
  const [showRival, setShowRival] = useState(false)
  return (
    <div className="relative overflow-hidden bg-white dark:bg-apple-gray-800/60 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 shadow-apple dark:shadow-apple-dark p-5 sm:p-6">
      <div className="absolute inset-x-0 top-0 h-1 bg-brand-green" />

      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <span className="inline-flex items-center gap-1.5 text-2xs sm:text-xs font-bold uppercase tracking-wide text-brand-green">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse-soft flex-shrink-0" />
          {t('coachDetail.proximoPartido')}
        </span>
        {next.leagueName && (
          <span className="text-2xs sm:text-xs font-medium text-apple-gray-400 truncate max-w-[60%] text-right">
            {next.leagueName}
          </span>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
        <div className="flex flex-col items-center gap-2 min-w-0">
          <img src={next.homeTeam.logo} alt="" className="w-10 h-10 sm:w-14 sm:h-14 object-contain" />
          <span className="w-full block text-xs sm:text-sm font-semibold text-apple-gray-800 dark:text-white text-center truncate">
            {next.homeTeam.name}
          </span>
        </div>
        <span className="text-2xs sm:text-xs font-bold text-apple-gray-300 dark:text-apple-gray-600 uppercase flex-shrink-0">
          vs
        </span>
        <div className="flex flex-col items-center gap-2 min-w-0">
          <img src={next.awayTeam.logo} alt="" className="w-10 h-10 sm:w-14 sm:h-14 object-contain" />
          <span className="w-full block text-xs sm:text-sm font-semibold text-apple-gray-800 dark:text-white text-center truncate">
            {next.awayTeam.name}
          </span>
        </div>
      </div>

      <p className="text-xs sm:text-sm text-apple-gray-500 dark:text-apple-gray-400 text-center mt-4">
        {new Date(next.date).toLocaleDateString(locale, {
          day: 'numeric',
          month: 'long',
          hour: '2-digit',
          minute: '2-digit',
        })}
        {next.venue && <> · {next.venue}</>}
      </p>

      <div className="flex justify-center mt-4">
        <button
          onClick={() => setShowRival(v => !v)}
          className="inline-flex items-center gap-1.5 min-h-[40px] px-4 rounded-full bg-brand-green text-apple-gray-900 text-sm font-semibold transition-transform duration-200 ease-apple hover:-translate-y-0.5"
        >
          {showRival ? t('coachDetail.ocultarRival') : t('coachDetail.verRival')}
          <svg
            className={`w-4 h-4 transition-transform ${showRival ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
      {showRival && (
        <CoachRivalPanel
          teamId={next.isHome ? next.awayTeam.id : next.homeTeam.id}
          teamName={next.isHome ? next.awayTeam.name : next.homeTeam.name}
        />
      )}
    </div>
  )
}

export default function CoachSummaryTab({ coach }: { coach: AgencyCoach }) {
  const { t } = useLanguage()
  const season = coach.leagueSeason ?? new Date().getFullYear()
  const club = coach.club ?? ''
  const [fixtures, setFixtures] = useState<AgencyFixture[] | null>(null)
  const [seasonFixtures, setSeasonFixtures] = useState<AgencyFixture[]>([])
  const [statsRows, setStatsRows] = useState<CoachMatchTeamStats[]>([])
  const [squadRecord, setSquadRecord] = useState<SquadStatsRecord | null | undefined>(undefined)
  const [showUpload, setShowUpload] = useState(false)
  const [showTeamUpload, setShowTeamUpload] = useState(false)
  const [showPdf, setShowPdf] = useState(false)
  const [minMinutes, setMinMinutes] = useState(DEFAULT_MIN_MINUTES)
  const [wyscoutReport, setWyscoutReport] = useState<WyscoutReportData | null>(null)
  const standings = useStandings(coach.leagueApiId, coach.leagueSeason)

  useEffect(() => {
    if (!coach.apiTeamId) return
    let active = true
    fetchTeamFixtures(coach.apiTeamId).then(f => { if (active) setFixtures(f) })
    fetchSeasonFixtures(coach.apiTeamId, season).then(f => { if (active) setSeasonFixtures(f) })
    listCoachMatchTeamStats(coach.key).then(r => { if (active) setStatsRows(r) })
    getLatestSquadStats(coach.key).then(r => { if (active) setSquadRecord(r) })
    getLatestWyscoutReport(coach.key).then(r => { if (active) setWyscoutReport(r) })
    return () => { active = false }
  }, [coach.apiTeamId, coach.key, season])

  const squad = squadRecord?.data ?? null

  // Partidos del equipo en la temporada para el % de minutos posibles: los de la liga
  // (Wyscout cuenta los minutos de la liga, sin la Copa Argentina).
  const teamMatches = useMemo(
    () => seasonFixtures.filter(f => isMatchFinished(f.statusShort) && !/copa/i.test(f.leagueName)).length,
    [seasonFixtures],
  )
  const maxMinutes = useMemo(() => Math.max(0, ...(squad?.players.map(p => p.stats.minutes ?? 0) ?? [])), [squad])
  const includedCount = squad ? filterByMinutes(squad.players, minMinutes).length : 0
  const rankingWidgets = squad ? RANKING_WIDGETS.filter(w => w.requires.every(k => squad.columnsFound.includes(k))) : []

  if (!coach.apiTeamId) {
    return <EmptyState message={t('coachDetail.resumenSinEquipo')} />
  }

  if (fixtures === null || squadRecord === undefined) return <LoadingSpinner message={t('coachDetail.resumenCargando')} />

  const sorted = [...fixtures].sort((a, b) => a.timestamp - b.timestamp)
  const next = sorted.find(f => !isMatchFinished(f.statusShort)) ?? null
  const last = sorted.filter(f => isMatchFinished(f.statusShort)).reverse().slice(0, 5)
  const upcoming = sorted.filter(f => !isMatchFinished(f.statusShort)).slice(0, 5)
  const myGroup = standings.groups?.find(g => g.some(r => r.teamId === coach.apiTeamId)) ?? null
  const seasonStats = seasonFixtures.length ? computeSeasonStats(seasonFixtures, statsRows) : null
  const matchRows = buildEnrichedMatchRows(seasonFixtures, statsRows)

  const dataDate = squadRecord?.uploaded_at ?? null
  const dataLabel = dataDate
    ? `Datos de Wyscout del ${new Date(dataDate).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}`
    : 'Todavía no se cargó el archivo de Wyscout'

  const available = new Set<string>([
    ...(seasonStats && seasonStats.played > 0 ? ['temporada', 'eficacia'] : []),
    ...(coach.apiTeamId ? ['surgidos'] : []),
    ...(matchRows.length >= 2 ? ['vsRival', 'evolucion'] : []),
    ...(matchRows.length ? ['historial'] : []),
    ...(wyscoutReport?.formations.length ? ['formaciones'] : []),
    ...(wyscoutReport?.zoneGrids.length ? ['zonas'] : []),
    ...(next ? ['proximo'] : []),
    ...(myGroup ? ['tabla'] : []),
    'ultimos', 'proximos',
    ...(squad ? [...rankingWidgets.map(w => w.id), ...SCATTER_DEFS.map(d => d.id), 'perfil', 'tablaCompleta'] : []),
  ])

  async function generatePdf(widgetIds: string[]) {
    const { exportTeamSummaryPdf, loadImageDataUrl } = await import('@/features/coaches/wyscoutSquad/exportTeamSummaryPdf')
    const crestUrl = [...fixtures!].map(f => (f.homeTeam.id === coach.apiTeamId ? f.homeTeam.logo : f.awayTeam.logo))[0]
    const wantsHomegrown = widgetIds.includes('surgidos')
    const [logoDataUrl, crestDataUrl, homegrown] = await Promise.all([
      loadImageDataUrl('/brand/logo-black.png'),
      crestUrl ? loadImageDataUrl(crestUrl) : Promise.resolve(undefined),
      wantsHomegrown
        ? Promise.all([import('@/services/homegrownUsageService'), import('@/features/coaches/homegrown/homegrownReport')])
          .then(async ([svc, rep]) => {
            const data = await svc.loadHomegrownUsage(coach)
            return data ? rep.buildHomegrownReport(data, coach) : null
          })
          .catch(() => null)
        : Promise.resolve(null),
    ])
    await exportTeamSummaryPdf({
      coachName: coach.fullName,
      club,
      season,
      leagueName: coach.leagueName ?? null,
      today: todayIso(),
      dataDate,
      minMinutes,
      teamId: coach.apiTeamId!,
      standings: myGroup,
      next,
      last,
      upcoming,
      seasonStats,
      squad,
      teamMatches,
      widgetIds,
      matchRows,
      wyscoutReport,
      homegrown,
      logoDataUrl,
      crestDataUrl,
    })
  }

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-in">
      <SummaryToolbar
        title={`${club} ${season}`}
        subtitle={`Resumen del equipo · DT ${coach.fullName}`}
        dataLabel={dataLabel}
        onExportPdf={() => setShowPdf(v => !v)}
      />
      {showPdf && <PdfExportPanel available={available} onGenerate={generatePdf} onClose={() => setShowPdf(false)} />}

      {/* 1. Datos colectivos del equipo: archivo "Team Stats" de Wyscout (uno por partido). */}
      <SectionHeading
        step={1}
        title="Datos del equipo"
        subtitle="Estadísticas colectivas partido por partido, del archivo Team Stats de Wyscout"
        action={{
          label: showTeamUpload ? 'Cerrar' : 'Cargar o actualizar archivo del equipo',
          onClick: () => setShowTeamUpload(v => !v),
          active: showTeamUpload,
        }}
      />
      <CoachSeasonStatsCard
        coach={coach}
        uploadOpen={showTeamUpload}
        onUploadOpenChange={setShowTeamUpload}
        onSaved={() => listCoachMatchTeamStats(coach.key).then(setStatsRows)}
      />

      {/* 2. Tabla de posiciones y partidos. */}
      <SectionHeading step={2} title="Tabla y partidos" subtitle={coach.leagueName ?? undefined} />
      {next ? <NextMatchCard next={next} /> : <EmptyState message={t('coachDetail.resumenSinPartidos')} />}
      <StandingsWidget groups={standings.groups} failed={standings.failed} teamId={coach.apiTeamId} />
      <div className="grid gap-5 sm:gap-6 lg:grid-cols-2">
        <LastMatchesWidget fixtures={last} />
        <UpcomingWidget fixtures={upcoming} />
      </div>

      {/* 3. Jugadores: archivo "Search results" de Wyscout (uno por jugador). */}
      <SectionHeading
        step={3}
        title="Los jugadores"
        subtitle={squad ? `${dataLabel} · ${squad.players.length} jugadores` : 'Datos y rankings del archivo de jugadores de Wyscout'}
        action={squad ? {
          label: showUpload ? 'Cerrar' : 'Actualizar archivo de jugadores',
          onClick: () => setShowUpload(v => !v),
          active: showUpload,
        } : undefined}
      />
      {showUpload && squad && (
        <WyscoutSquadDropzone
          coachKey={coach.key}
          expectedTeam={club}
          firstTime={false}
          onSaved={rec => { setSquadRecord(rec); setShowUpload(false) }}
          onCancel={() => setShowUpload(false)}
        />
      )}
      {!squad ? (
        <WyscoutSquadDropzone coachKey={coach.key} expectedTeam={club} firstTime onSaved={setSquadRecord} />
      ) : (
        <>
          <MinutesFilter value={minMinutes} max={maxMinutes} onChange={setMinMinutes} included={includedCount} total={squad.players.length} />
          <div className="grid gap-5 sm:gap-6 lg:grid-cols-2">
            {rankingWidgets.map(def => (
              <RankingWidget key={def.id} def={def} players={squad.players} teamMatches={teamMatches} minMinutes={minMinutes} />
            ))}
            <SquadProfileWidget players={squad.players} />
          </div>
          <div className="pt-2">
            <h3 className="text-base font-semibold text-apple-gray-800 dark:text-white">Comparaciones por puesto</h3>
            <p className="text-xs text-apple-gray-400 dark:text-apple-gray-500 mt-0.5">
              Cada punto es un jugador. Los que quedan en el recuadro verde, arriba a la derecha, están por encima del resto de su puesto en las dos cosas.
            </p>
          </div>
          <div className="grid gap-5 sm:gap-6 lg:grid-cols-2">
            {SCATTER_DEFS.map(def => (
              <ScatterWidget key={def.id} def={def} players={squad.players} teamMatches={teamMatches} minMinutes={minMinutes} />
            ))}
          </div>
          <SquadTableWidget players={squad.players} teamMatches={teamMatches} minMinutes={minMinutes} />
        </>
      )}
    </div>
  )
}
