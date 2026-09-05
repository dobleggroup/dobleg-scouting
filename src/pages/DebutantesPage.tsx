import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchDebutAlerts, type DebutAlert } from '@/services/debutAlertsService'

export default function DebutantesPage() {
  const [alerts, setAlerts] = useState<DebutAlert[] | null>(null)
  const navigate = useNavigate()

  useEffect(() => { fetchDebutAlerts().then(setAlerts) }, [])

  const goToPlayer = (a: DebutAlert) => {
    navigate(`/jugador/${encodeURIComponent(a.playerName)}?source=externo&apiId=${a.playerId}`)
  }

  return (
    <div className="max-w-screen-lg mx-auto px-4 sm:px-6 py-6 space-y-5 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-apple-gray-900 dark:text-white">Debutantes</h1>
        <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
          Jugadores de 20 años o menos que jugaron su primer partido en una primera de LATAM.
        </p>
      </div>

      {alerts === null ? (
        <p className="text-sm text-apple-gray-400">Cargando...</p>
      ) : alerts.length === 0 ? (
        <p className="text-sm text-apple-gray-400">Todavía no hay debutantes detectados.</p>
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
                <span>{a.position ?? '—'} · {a.ageAtDebut} años</span>
                <span>{a.minutes}' · {new Date(a.debutDate).toLocaleDateString('es-AR')}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
