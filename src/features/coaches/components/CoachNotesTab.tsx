import { useEffect, useState } from 'react'
import { fetchTeamFixtures } from '@/services/footballApiService'
import { listMatchNotePhases, upsertMatchNotePhases, type MatchNotePhases } from '@/services/coachService'
import { PHASE_META } from '@/features/coaches/matchNotesConstants'
import { isMatchFinished } from '@/utils/coachCalendar'
import type { AgencyFixture } from '@/types/footballApi'
import type { AgencyCoach } from '@/constants/agencyCoaches'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useLanguage } from '@/context/LanguageContext'
import { LANGUAGE_LOCALES } from '@/constants/translations'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const EMPTY_PHASES: MatchNotePhases = {
  defensiva: null,
  ofensiva: null,
  transiciones: null,
  abp: null,
  observaciones: null,
}

/** Etiqueta de fecha corta, evitando el corrimiento de huso horario de `new Date(iso)`
 *  (mismo criterio que CoachCalendarTab/CoachTrainingTab). */
function formatMatchDate(iso: string, locale: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'long' })
}

function phasesEqual(a: MatchNotePhases, b: MatchNotePhases): boolean {
  return PHASE_META.every(p => (a[p.key] ?? '') === (b[p.key] ?? ''))
}

function hasAnyContent(phases: MatchNotePhases): boolean {
  return PHASE_META.some(p => (phases[p.key] ?? '').trim().length > 0)
}

function ChevronIcon({ className, expanded }: { className?: string; expanded: boolean }) {
  return (
    <svg
      className={`${className} transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  )
}

function NoteRow({
  coach,
  fixture,
  initialPhases,
  defaultExpanded,
}: {
  coach: AgencyCoach
  fixture: AgencyFixture
  initialPhases: MatchNotePhases
  defaultExpanded: boolean
}) {
  const { t, language } = useLanguage()
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [phases, setPhases] = useState(initialPhases)
  const [savedPhases, setSavedPhases] = useState(initialPhases)
  const [status, setStatus] = useState<SaveStatus>('idle')

  const dirty = !phasesEqual(phases, savedPhases)
  const canSave = dirty && status !== 'saving'

  async function handleSave() {
    if (!canSave) return
    setStatus('saving')
    const res = await upsertMatchNotePhases(coach.key, fixture.fixtureId, phases)
    if (!res.success) {
      setStatus('error')
      return
    }
    setSavedPhases(phases)
    setStatus('saved')
    setTimeout(() => setStatus('idle'), 1500)
  }

  const opponent = fixture.isHome ? fixture.awayTeam : fixture.homeTeam
  const buttonLabel =
    status === 'saving' ? t('coachNotes.guardando') : status === 'saved' ? t('coachNotes.guardado') : status === 'error' ? t('coachNotes.reintentar') : t('coachNotes.guardar')

  return (
    <div className="bg-white dark:bg-apple-gray-800/60 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 overflow-hidden">
      <button type="button" onClick={() => setExpanded(v => !v)} className="w-full flex items-center gap-3 sm:gap-4 p-4 sm:p-5 text-left">
        <img src={opponent.logo} alt="" className="w-6 h-6 object-contain flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-apple-gray-800 dark:text-white truncate">
            vs {opponent.name} {fixture.isHome ? '(L)' : '(V)'}
          </p>
          <p className="text-xs text-apple-gray-400">
            {fixture.goalsHome} - {fixture.goalsAway} &middot; {formatMatchDate(fixture.date, LANGUAGE_LOCALES[language])}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {PHASE_META.map(p => (
            <span
              key={p.key}
              title={t(p.labelKey)}
              className={`w-1.5 h-1.5 rounded-full ${
                (savedPhases[p.key] ?? '').trim() ? 'bg-brand-green' : 'bg-apple-gray-200 dark:bg-apple-gray-700'
              }`}
            />
          ))}
        </div>
        <ChevronIcon className="w-4 h-4 text-apple-gray-400 flex-shrink-0" expanded={expanded} />
      </button>

      {expanded && (
        <div className="px-4 sm:px-5 pb-4 sm:pb-5 space-y-3 border-t border-apple-gray-200/60 dark:border-apple-gray-700/40 pt-4">
          {PHASE_META.map(phase => (
            <div key={phase.key}>
              <label className="block text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400 mb-1">{t(phase.labelKey)}</label>
              <textarea
                value={phases[phase.key] ?? ''}
                onChange={e => setPhases({ ...phases, [phase.key]: e.target.value })}
                placeholder={phase.placeholder}
                rows={2}
                className="w-full min-h-[56px] resize-y rounded-lg border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-900 px-3 py-2 text-sm text-apple-gray-800 dark:text-white placeholder:text-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition-colors"
              />
            </div>
          ))}
          <div className="flex items-center justify-end gap-2">
            {status === 'error' && <span className="text-xs text-brand-red">{t('coachNotes.errorGuardar')}</span>}
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!canSave}
              className="min-h-[40px] px-4 rounded-lg bg-brand-green text-apple-gray-900 text-xs font-semibold transition-all duration-200 ease-apple hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none disabled:hover:translate-y-0"
            >
              {buttonLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CoachNotesTab({ coach }: { coach: AgencyCoach }) {
  const { t } = useLanguage()
  const [fixtures, setFixtures] = useState<AgencyFixture[] | null>(null)
  const [notes, setNotes] = useState<Record<number, MatchNotePhases>>({})

  useEffect(() => {
    if (!coach.apiTeamId) return
    let active = true
    // Una sola consulta de notas para toda la pestaña en vez de una por fila
    // (evitaba un N+1 de ~20+ requests a Supabase cada vez que se abría Notas).
    Promise.all([fetchTeamFixtures(coach.apiTeamId), listMatchNotePhases(coach.key)]).then(([f, n]) => {
      if (!active) return
      setFixtures(f)
      setNotes(n)
    })
    return () => {
      active = false
    }
  }, [coach.apiTeamId, coach.key])

  if (!coach.apiTeamId) {
    return (
      <div className="flex items-center justify-center py-16 px-4 text-center">
        <p className="text-sm text-apple-gray-400 max-w-xs">{t('coachNotes.sinDatosEquipo')}</p>
      </div>
    )
  }

  if (fixtures === null) return <LoadingSpinner message={t('coachNotes.cargandoPartidos')} />

  const played = [...fixtures].filter(f => isMatchFinished(f.statusShort)).sort((a, b) => b.timestamp - a.timestamp)

  return (
    <div className="space-y-3 animate-fade-in">
      {played.map((f, i) => {
        const initialPhases = notes[f.fixtureId] ?? EMPTY_PHASES
        return (
          <NoteRow
            key={f.fixtureId}
            coach={coach}
            fixture={f}
            initialPhases={initialPhases}
            defaultExpanded={i === 0 && !hasAnyContent(initialPhases)}
          />
        )
      })}
      {played.length === 0 && (
        <div className="flex items-center justify-center py-16 px-4 text-center">
          <p className="text-sm text-apple-gray-400 max-w-xs">{t('coachNotes.sinPartidos')}</p>
        </div>
      )}
    </div>
  )
}
