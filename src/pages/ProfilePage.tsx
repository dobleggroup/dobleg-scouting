import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'

export default function ProfilePage() {
  const { user, userDisplayName, signOut, deleteAccount } = useAuth()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const handleDelete = async () => {
    setDeleting(true)
    setError('')
    const { error } = await deleteAccount()
    if (error) {
      setError(error.message || 'No se pudo eliminar la cuenta. Intentá de nuevo.')
      setDeleting(false)
      setConfirming(false)
    }
    // En éxito, el estado de auth cambia (queda deslogueado) y el Layout muestra login.
  }

  const initial = (userDisplayName || user?.email || '?').charAt(0).toUpperCase()

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <h1 className="text-2xl font-bold text-apple-gray-800 dark:text-white tracking-tight mb-6">
        Perfil
      </h1>

      {/* Datos de la cuenta */}
      <div className="card-apple p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-brand-green to-emerald-600 flex items-center justify-center text-white text-xl font-semibold flex-shrink-0">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="text-lg font-semibold text-apple-gray-800 dark:text-white truncate">
              {userDisplayName || 'Usuario'}
            </p>
            <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 truncate">
              {user?.email}
            </p>
          </div>
        </div>

        <button
          onClick={() => signOut()}
          className="mt-5 w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-medium text-apple-gray-700 dark:text-apple-gray-300 bg-apple-gray-100 dark:bg-apple-gray-700 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 transition-colors"
        >
          Cerrar sesión
        </button>
      </div>

      {/* Zona de peligro — eliminar cuenta */}
      <div className="mt-6 rounded-2xl border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-900/10 p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-red-700 dark:text-red-400 uppercase tracking-wider mb-2">
          Eliminar cuenta
        </h2>
        <p className="text-sm text-apple-gray-600 dark:text-apple-gray-400 mb-4">
          Esto elimina tu cuenta de forma permanente. No se puede deshacer.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors"
          >
            Eliminar mi cuenta
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-medium text-apple-gray-800 dark:text-white">
              ¿Seguro? Esta acción es permanente.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {deleting && (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                Sí, eliminar definitivamente
              </button>
              <button
                onClick={() => { setConfirming(false); setError('') }}
                disabled={deleting}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-apple-gray-700 dark:text-apple-gray-300 bg-apple-gray-100 dark:bg-apple-gray-700 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="mt-6 text-center text-xs text-apple-gray-400">
        <a href="/privacidad.html" target="_blank" rel="noreferrer" className="hover:text-brand-green transition-colors">Política de privacidad</a>
      </p>
    </div>
  )
}
