import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  initialMode?: 'login' | 'signup'
  forceOpen?: boolean // When true, renders inline without backdrop/close button
}

export default function AuthModal({ isOpen, onClose, initialMode = 'login', forceOpen = false }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')

  const { signIn, signUp, signInWithGoogle } = useAuth()
  const [googleLoading, setGoogleLoading] = useState(false)

  if (!isOpen && !forceOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      if (mode === 'login') {
        const { error } = await signIn(email, password)
        if (error) {
          setError(error.message === 'Invalid login credentials'
            ? 'Email o contraseña incorrectos'
            : error.message)
        } else {
          onClose()
        }
      } else {
        if (!fullName.trim()) {
          setError('Ingresá tu nombre')
          setLoading(false)
          return
        }
        const { error } = await signUp(email, password, fullName)
        if (error) {
          setError(error.message)
        } else {
          setSuccess('Cuenta creada. Revisá tu email para confirmar.')
        }
      }
    } catch (err) {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  // Inline mode for forced login screen
  if (forceOpen) {
    return (
      <div className="w-full">
        {/* Mode tabs */}
        <div className="flex mb-8 p-1 bg-apple-gray-100 dark:bg-apple-gray-800 rounded-xl">
          <button
            type="button"
            onClick={() => { setMode('login'); setError(''); setSuccess('') }}
            className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${
              mode === 'login'
                ? 'bg-white dark:bg-apple-gray-700 text-apple-gray-900 dark:text-white shadow-sm'
                : 'text-apple-gray-500 hover:text-apple-gray-700 dark:hover:text-apple-gray-300'
            }`}
          >
            Iniciar sesion
          </button>
          <button
            type="button"
            onClick={() => { setMode('signup'); setError(''); setSuccess('') }}
            className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${
              mode === 'signup'
                ? 'bg-white dark:bg-apple-gray-700 text-apple-gray-900 dark:text-white shadow-sm'
                : 'text-apple-gray-500 hover:text-apple-gray-700 dark:hover:text-apple-gray-300'
            }`}
          >
            Crear cuenta
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {mode === 'signup' && (
            <div>
              <label className="block text-sm font-medium text-apple-gray-700 dark:text-apple-gray-300 mb-2">
                Nombre completo
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Tu nombre"
                  className="w-full pl-12 pr-4 py-3 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-800 border-2 border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-800 dark:text-white placeholder-apple-gray-400 focus:outline-none focus:border-brand-green dark:focus:border-brand-green transition-colors"
                  required
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-apple-gray-700 dark:text-apple-gray-300 mb-2">
              Email
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <svg className="w-5 h-5 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tu@email.com"
                className="w-full pl-12 pr-4 py-3 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-800 border-2 border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-800 dark:text-white placeholder-apple-gray-400 focus:outline-none focus:border-brand-green dark:focus:border-brand-green transition-colors"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-apple-gray-700 dark:text-apple-gray-300 mb-2">
              Contrasena
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <svg className="w-5 h-5 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Minimo 6 caracteres"
                minLength={6}
                className="w-full pl-12 pr-4 py-3 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-800 border-2 border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-800 dark:text-white placeholder-apple-gray-400 focus:outline-none focus:border-brand-green dark:focus:border-brand-green transition-colors"
                required
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
              <svg className="w-5 h-5 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-emerald-600 dark:text-emerald-400">{success}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-brand-green to-emerald-600 hover:from-emerald-600 hover:to-brand-green text-white font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-brand-green/25 hover:shadow-xl hover:shadow-brand-green/30 hover:-translate-y-0.5"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Procesando...
              </span>
            ) : mode === 'login' ? 'Ingresar' : 'Crear cuenta'}
          </button>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-apple-gray-200 dark:border-apple-gray-700" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white dark:bg-apple-gray-900 text-apple-gray-500">o continua con</span>
            </div>
          </div>

          {/* Google button */}
          <button
            type="button"
            onClick={async () => {
              setGoogleLoading(true)
              setError('')
              const { error } = await signInWithGoogle()
              if (error) {
                setError('Error al conectar con Google')
                setGoogleLoading(false)
              }
            }}
            disabled={googleLoading}
            className="w-full py-3.5 px-4 rounded-xl bg-white dark:bg-apple-gray-800 border-2 border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-800 dark:text-white font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:border-apple-gray-300 dark:hover:border-apple-gray-600 hover:shadow-md flex items-center justify-center gap-3"
          >
            {googleLoading ? (
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Google
              </>
            )}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-apple-gray-800 rounded-apple-xl shadow-apple-lg dark:shadow-apple-dark-md w-full max-w-md p-6 animate-scale-in">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors"
        >
          <svg className="w-5 h-5 text-apple-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gradient-to-br from-brand-green to-emerald-600 flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-apple-gray-800 dark:text-white">
            {mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
          </h2>
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-1">
            {mode === 'login'
              ? 'Ingresá con tu cuenta de Scout Platform'
              : 'Registrate para guardar tus formaciones'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="block text-sm font-medium text-apple-gray-700 dark:text-apple-gray-300 mb-1.5">
                Nombre completo
              </label>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Tu nombre"
                className="w-full px-4 py-2.5 rounded-apple bg-apple-gray-50 dark:bg-apple-gray-700 border border-apple-gray-200 dark:border-apple-gray-600 text-apple-gray-800 dark:text-white placeholder-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/50 focus:border-brand-green transition-colors"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-apple-gray-700 dark:text-apple-gray-300 mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@email.com"
              className="w-full px-4 py-2.5 rounded-apple bg-apple-gray-50 dark:bg-apple-gray-700 border border-apple-gray-200 dark:border-apple-gray-600 text-apple-gray-800 dark:text-white placeholder-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/50 focus:border-brand-green transition-colors"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-apple-gray-700 dark:text-apple-gray-300 mb-1.5">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={6}
              className="w-full px-4 py-2.5 rounded-apple bg-apple-gray-50 dark:bg-apple-gray-700 border border-apple-gray-200 dark:border-apple-gray-600 text-apple-gray-800 dark:text-white placeholder-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/50 focus:border-brand-green transition-colors"
              required
            />
          </div>

          {error && (
            <div className="p-3 rounded-apple bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {success && (
            <div className="p-3 rounded-apple bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
              <p className="text-sm text-emerald-600 dark:text-emerald-400">{success}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-apple bg-brand-green hover:bg-emerald-600 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Cargando...
              </span>
            ) : mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
          </button>

          {/* Divider */}
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-apple-gray-200 dark:border-apple-gray-700" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-white dark:bg-apple-gray-800 text-apple-gray-500">o</span>
            </div>
          </div>

          {/* Google button */}
          <button
            type="button"
            onClick={async () => {
              setGoogleLoading(true)
              setError('')
              const { error } = await signInWithGoogle()
              if (error) {
                setError('Error al conectar con Google')
                setGoogleLoading(false)
              }
            }}
            disabled={googleLoading}
            className="w-full py-2.5 px-4 rounded-apple bg-white dark:bg-apple-gray-700 border border-apple-gray-200 dark:border-apple-gray-600 text-apple-gray-800 dark:text-white font-medium transition-colors disabled:opacity-50 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-600 flex items-center justify-center gap-2"
          >
            {googleLoading ? (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continuar con Google
              </>
            )}
          </button>
        </form>

        {/* Toggle mode */}
        <div className="mt-5 text-center">
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">
            {mode === 'login' ? '¿No tenés cuenta?' : '¿Ya tenés cuenta?'}
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login')
                setError('')
                setSuccess('')
              }}
              className="ml-1.5 text-brand-green hover:text-emerald-600 font-medium transition-colors"
            >
              {mode === 'login' ? 'Registrate' : 'Iniciá sesión'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
