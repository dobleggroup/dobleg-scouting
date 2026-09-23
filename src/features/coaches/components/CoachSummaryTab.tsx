import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchTeamFixtures } from '@/services/footballApiService'
import { isMatchFinished } from '@/utils/coachCalendar'
import { matchOutcome, RESULT_STYLES, RECENT_MATCHES_COUNT } from '../matchResult'
import CoachStreakStrip from './CoachStreakStrip'
import CoachRivalPanel from './CoachRivalPanel'
import CoachSeasonStatsCard from './CoachSeasonStatsCard'
import type { AgencyFixture } from '@/types/footballApi'
import type { AgencyCoach } from '@/constants/agencyCoaches'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useLanguage } from '@/context/LanguageContext'
import { LANGUAGE_LOCALES } from '@/constants/translations'

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-16 px-4 text-center">
      <p className="text-sm text-apple-gray-400 max-w-xs">{message}</p>
    </div>
  )
}

export default function CoachSummaryTab({ coach }: { coach: AgencyCoach }) {
  const { t, language } = useLanguage()
  const locale = LANGUAGE_LOCALES[language]
  const [fixtures, setFixtures] = useState<AgencyFixture[] | null>(null)
  const [showRival, setShowRival] = useState(false)

  useEffect(() => {
    if (!coach.apiTeamId) return
    let active = true
    fetchTeamFixtures(coach.apiTeamId).then(f => {
      if (active) setFixtures(f)
    })
    return () => {
      active = false
    }
  }, [coach.apiTeamId])

  if (!coach.apiTeamId) {
    return <EmptyState message={t('coachDetail.resumenSinEquipo')} />
  }

  if (fixtures === null) return <LoadingSpinner message={t('coachDetail.resumenCargando')} />

  const sorted = [...fixtures].sort((a, b) => a.timestamp - b.timestamp)
  const next = sorted.find(f => !isMatchFinished(f.statusShort))
  const finished = [...sorted].filter(f => isMatchFinished(f.statusShort))
  const lastTen = [...finished].reverse().slice(0, RECENT_MATCHES_COUNT)

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in">
      <CoachSeasonStatsCard coach={coach} />
      {next ? (
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
      ) : (
        <EmptyState message={t('coachDetail.resumenSinPartidos')} />
      )}

      <div>
        {finished.length > 0 && (
          <div className="mb-3">
            <CoachStreakStrip fixtures={sorted} />
          </div>
        )}
        <p className="text-xs font-semibold text-apple-gray-400 uppercase tracking-wide mb-3">
          {t('coachDetail.ultimos10Resultados')}
        </p>
        {lastTen.length === 0 ? (
          <EmptyState message={t('coachDetail.resumenSinResultados')} />
        ) : (
          <div className="space-y-2">
            {lastTen.map(f => {
              const opponent = f.isHome ? f.awayTeam : f.homeTeam
              const { result, scoreLabel } = matchOutcome(f)
              const badgeStyle = result ? RESULT_STYLES[result] : RESULT_STYLES.E
              return (
                <Link
                  key={f.fixtureId}
                  to={`/entrenadores/${coach.key}/partido/${f.fixtureId}`}
                  className="flex items-center gap-3 bg-white dark:bg-apple-gray-800/60 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 hover:border-brand-green/30 transition-colors px-3 sm:px-4 py-3"
                >
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-2xs font-bold flex-shrink-0 ${badgeStyle}`}
                  >
                    {result ?? '–'}
                  </span>
                  <img src={opponent.logo} alt="" className="w-6 h-6 object-contain flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-apple-gray-800 dark:text-white truncate">
                      {opponent.name}
                    </p>
                    <p className="text-2xs text-apple-gray-400">{f.isHome ? t('coachDetail.local') : t('coachDetail.visitante')}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-apple-gray-800 dark:text-white">{scoreLabel}</p>
                    <p className="text-2xs text-apple-gray-400">
                      {new Date(f.date).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
