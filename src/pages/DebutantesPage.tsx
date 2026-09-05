import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '@/context/LanguageContext'
import { fetchDebutAlerts, type DebutAlert } from '@/services/debutAlertsService'

const formatDebutDate = (iso: string, locale: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(locale)

export default function DebutantesPage() {
  const { t, language } = useLanguage()
  const [alerts, setAlerts] = useState<DebutAlert[] | null>(null)
  const [error, setError] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    fetchDebutAlerts()
      .then(setAlerts)
      .catch(() => setError(true))
  }, [])

  const goToPlayer = (a: DebutAlert) => {
    navigate(`/jugador/${encodeURIComponent(a.playerName)}?source=externo&apiId=${a.playerId}`)
  }

  return (
    <div className="max-w-screen-lg mx-auto px-4 sm:px-6 py-6 space-y-5 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-apple-gray-900 dark:text-white">{t('debutantes.titulo')}</h1>
        <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
          {t('debutantes.subtitulo')}
        </p>
      </div>

      {error ? (
        <p className="text-sm text-red-500">{t('debutantes.error')}</p>
      ) : alerts === null ? (
        <p className="text-sm text-apple-gray-400">{t('debutantes.cargando')}</p>
      ) : alerts.length === 0 ? (
        <p className="text-sm text-apple-gray-400">{t('debutantes.vacio')}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {alerts.map(a => (
            <button
              key={a.playerId}
              onClick={() => goToPlayer(a)}
              className="card-apple p-4 text-left hover:shadow-apple-lg transition-shadow"
            >
              <div className="flex items-center gap-3">
                {a.photo ? (
                  <img src={a.photo} alt={a.playerName} className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-apple-gray-100 dark:bg-apple-gray-800" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-apple-gray-900 dark:text-white truncate">{a.playerName}</p>
                  <p className="text-xs text-apple-gray-500 truncate">{a.teamName ?? '—'} · {a.leagueName ?? '—'}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-apple-gray-500">
                <span>{a.position ?? '—'} · {a.ageAtDebut} {t('debutantes.anos')}</span>
                <span>{a.minutes}' · {formatDebutDate(a.debutDate, language)}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
