import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listAgencyCoaches } from '@/services/agencyCoachesService'
import type { AgencyCoach } from '@/constants/agencyCoaches'
import { useLanguage } from '@/context/LanguageContext'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import AddCoachModal from '@/features/coaches/components/AddCoachModal'

function initialsOf(fullName: string): string {
  return fullName
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

/** Prueba de la API de Opta con River: no es un entrenador de la base, es una vista aparte. */
function OptaTestCard() {
  return (
    <Link
      to="/entrenadores/ponzio-opta"
      className="group relative overflow-hidden flex items-center gap-4 min-h-[96px] bg-white dark:bg-apple-gray-800 rounded-apple-lg border border-dashed border-brand-green/50 shadow-apple dark:shadow-apple-dark p-5 transition-all duration-200 ease-apple hover:shadow-apple-md dark:hover:shadow-apple-dark-md hover:border-brand-green hover:-translate-y-0.5"
    >
      <img src="/coaches/ponzio.png" alt="" className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover flex-shrink-0 ring-2 ring-offset-2 dark:ring-offset-apple-gray-800 ring-brand-green/40" />
      <div className="flex-1 min-w-0">
        <h2 className="text-base sm:text-lg font-bold text-apple-gray-800 dark:text-white truncate">Leonardo Ponzio</h2>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold tracking-wide bg-apple-gray-900 text-white dark:bg-white dark:text-apple-gray-900">TEST OPTA</span>
          <span className="text-sm text-apple-gray-500 dark:text-apple-gray-400 truncate">River Plate</span>
        </div>
      </div>
      <svg className="w-5 h-5 flex-shrink-0 text-apple-gray-300 dark:text-apple-gray-600 transition-transform duration-200 ease-apple group-hover:translate-x-0.5 group-hover:text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  )
}

export default function CoachesListPage() {
  const { t } = useLanguage()
  // undefined = cargando, null = falló la carga, [] = cargó pero no hay entrenadores.
  const [coaches, setCoaches] = useState<AgencyCoach[] | null | undefined>(undefined)
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    let active = true
    listAgencyCoaches().then(list => { if (active) setCoaches(list) })
    return () => { active = false }
  }, [])

  if (coaches === undefined) return <LoadingSpinner message="Cargando entrenadores..." />

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-apple-gray-800 dark:text-white tracking-tight">
            {t('nav.entrenadores')}
          </h1>
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
            {t('coachesList.subtitulo')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex-shrink-0 px-4 py-2 rounded-full bg-brand-green text-apple-gray-900 text-sm font-semibold shadow-apple dark:shadow-apple-dark transition-transform duration-200 ease-apple hover:-translate-y-0.5"
        >
          + Agregar entrenador
        </button>
      </div>

      {showAdd && (
        <AddCoachModal
          onClose={() => setShowAdd(false)}
          onCreated={coach => {
            setCoaches(prev => prev ? [...prev, coach] : [coach])
            setShowAdd(false)
          }}
        />
      )}

      {coaches === null ? (
        <div className="max-w-md mx-auto py-12 text-center animate-fade-in">
          <div className="w-20 h-20 bg-apple-gray-100 dark:bg-apple-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-apple dark:shadow-apple-dark">
            <svg className="w-10 h-10 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-apple-gray-800 dark:text-white mb-1.5">
            No se pudieron cargar los entrenadores.
          </h1>
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">
            Probá de nuevo.
          </p>
        </div>
      ) : coaches.length === 0 ? (
        <div className="max-w-md mx-auto py-12 text-center animate-fade-in">
          <div className="w-20 h-20 bg-apple-gray-100 dark:bg-apple-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-apple dark:shadow-apple-dark">
            <svg className="w-10 h-10 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 100-8 4 4 0 000 8zm6 3c0-1.1-.9-2-2-2M7 13c-1.1 0-2 .9-2 2" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-apple-gray-800 dark:text-white mb-1.5">
            Todavía no hay entrenadores cargados.
          </h1>
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">
            Agregá el primero con el botón de arriba.
          </p>
        </div>
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
        {coaches.map(coach => {
          const isActive = coach.status === 'activo'
          return (
            <Link
              key={coach.key}
              to={`/entrenadores/${coach.key}`}
              className="group flex items-center gap-4 min-h-[96px] bg-white dark:bg-apple-gray-800 rounded-apple-lg border border-apple-gray-200 dark:border-apple-gray-700 shadow-apple dark:shadow-apple-dark p-5 transition-all duration-200 ease-apple hover:shadow-apple-md dark:hover:shadow-apple-dark-md hover:border-apple-gray-300 dark:hover:border-apple-gray-600 hover:-translate-y-0.5"
            >
              {coach.photo ? (
                <img
                  src={coach.photo}
                  alt=""
                  className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover flex-shrink-0 ring-2 ring-offset-2 dark:ring-offset-apple-gray-800 ${
                    isActive ? 'ring-brand-green/40' : 'ring-apple-gray-200 dark:ring-apple-gray-700'
                  }`}
                />
              ) : (
                <div
                  className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full flex-shrink-0 flex items-center justify-center text-lg sm:text-xl font-bold bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500 dark:text-apple-gray-400 ring-2 ring-offset-2 dark:ring-offset-apple-gray-800 ${
                    isActive ? 'ring-brand-green/40' : 'ring-apple-gray-200 dark:ring-apple-gray-700'
                  }`}
                >
                  {initialsOf(coach.fullName)}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <h2 className="text-base sm:text-lg font-bold text-apple-gray-800 dark:text-white truncate">
                  {coach.fullName}
                </h2>
                <span
                  className={`inline-flex items-center gap-1.5 mt-1 text-sm font-medium ${
                    isActive
                      ? 'text-brand-green'
                      : 'text-apple-gray-500 dark:text-apple-gray-400'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      isActive ? 'bg-brand-green animate-pulse-soft' : 'bg-apple-gray-300 dark:bg-apple-gray-600'
                    }`}
                  />
                  <span className="truncate">{isActive ? coach.club : t('coachesList.sinClub')}</span>
                </span>
              </div>

              <svg
                className="w-5 h-5 flex-shrink-0 text-apple-gray-300 dark:text-apple-gray-600 transition-transform duration-200 ease-apple group-hover:translate-x-0.5 group-hover:text-apple-gray-400 dark:group-hover:text-apple-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          )
        })}
        <OptaTestCard />
      </div>
      )}
    </div>
  )
}
