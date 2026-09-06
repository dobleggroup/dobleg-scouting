import { Outlet } from 'react-router-dom'
import { Suspense } from 'react'
import Navbar from './Navbar'
import Footer from './Footer'
import LiquidGlassBottomNav from './LiquidGlassBottomNav'

import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import AuthModal from '@/components/auth/AuthModal'
import { useHideOnScrollDown } from '@/hooks/useHideOnScrollDown'

export default function Layout() {
  const { user, loading, clubId, signOut } = useAuth()
  const { t } = useLanguage()
  const bottomNavVisible = useHideOnScrollDown()

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-apple-gray-50 dark:bg-apple-gray-900">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-brand-green border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-apple-gray-500">Cargando...</p>
        </div>
      </div>
    )
  }

  // Require authentication
  if (!user) {
    return (
      <div className="min-h-screen flex">
        {/* Left side - Branding */}
        <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 relative overflow-hidden bg-[#0a0a0a]">
          {/* Subtle gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-brand-green/5 via-transparent to-emerald-500/5" />

          {/* Decorative lines */}
          <div className="absolute inset-0">
            <div className="absolute top-0 left-1/4 w-px h-full bg-gradient-to-b from-transparent via-white/5 to-transparent" />
            <div className="absolute top-0 left-2/4 w-px h-full bg-gradient-to-b from-transparent via-white/5 to-transparent" />
            <div className="absolute top-0 left-3/4 w-px h-full bg-gradient-to-b from-transparent via-white/5 to-transparent" />
            <div className="absolute top-1/3 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />
            <div className="absolute top-2/3 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />
          </div>

          {/* Glow effect */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-green/10 rounded-full blur-[150px]" />

          {/* Content */}
          <div className="relative z-10 flex flex-col justify-between h-full p-12 xl:p-20">
            {/* Top - Badge */}
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full">
                <div className="w-2 h-2 bg-brand-green rounded-full" />
                <span className="text-white/80 text-sm font-medium tracking-wide">Scout Platform</span>
              </div>
            </div>

            {/* Center - Logo and text */}
            <div className="flex flex-col items-start">
              {/* Logo */}
              <img
                src="/logo-light.png"
                alt="Doble G Sports"
                className="w-32 h-32 xl:w-40 xl:h-40 mb-8 object-contain"
              />

              {/* Title */}
              <h1 className="text-4xl xl:text-5xl font-bold text-white mb-4 tracking-tight">
                Doble G Sports
              </h1>

              {/* Subtitle */}
              <p className="text-lg xl:text-xl text-white/50 max-w-md leading-relaxed font-light">
                Plataforma profesional de scouting y analisis de jugadores de futbol.
              </p>

              {/* Features */}
              <div className="flex flex-wrap gap-3 mt-8">
                <span className="px-4 py-2 bg-white/5 border border-white/10 rounded-full text-sm text-white/70">
                  Analisis avanzado
                </span>
                <span className="px-4 py-2 bg-white/5 border border-white/10 rounded-full text-sm text-white/70">
                  Datos en tiempo real
                </span>
                <span className="px-4 py-2 bg-white/5 border border-white/10 rounded-full text-sm text-white/70">
                  Formaciones
                </span>
              </div>
            </div>

            {/* Bottom - Stats */}
            <div className="flex gap-12">
              <div>
                <div className="text-3xl font-bold text-white">500+</div>
                <div className="text-white/40 text-sm mt-1">Jugadores</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-white">50+</div>
                <div className="text-white/40 text-sm mt-1">Metricas</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-white">10+</div>
                <div className="text-white/40 text-sm mt-1">Ligas</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right side - Login form */}
        <div className="w-full lg:w-1/2 xl:w-2/5 flex items-center justify-center p-8 bg-white dark:bg-apple-gray-900">
          <div className="w-full max-w-md">
            {/* Mobile logo */}
            <div className="lg:hidden text-center mb-10">
              <img
                src="/logo-dark.png"
                alt="Doble G Sports"
                className="w-20 h-20 mx-auto mb-4 object-contain dark:hidden"
              />
              <img
                src="/logo-light.png"
                alt="Doble G Sports"
                className="w-20 h-20 mx-auto mb-4 object-contain hidden dark:block"
              />
              <h1 className="text-2xl font-bold text-apple-gray-900 dark:text-white">Doble G Sports</h1>
            </div>

            {/* Welcome text */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-apple-gray-900 dark:text-white mb-2">
                Bienvenido
              </h2>
              <p className="text-apple-gray-500 dark:text-apple-gray-400">
                Ingresa tus credenciales para continuar
              </p>
            </div>

            {/* Auth form */}
            <AuthModal
              isOpen={true}
              onClose={() => {}}
              forceOpen={true}
            />

            {/* Bottom decoration for mobile */}
            <div className="lg:hidden mt-12 pt-8 border-t border-apple-gray-200 dark:border-apple-gray-800">
              <p className="text-center text-apple-gray-400 text-sm">
                Plataforma de Scouting Profesional
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Sesión resuelta pero el club todavía no se resolvió — mismo spinner que el loading inicial.
  if (clubId === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-apple-gray-50 dark:bg-apple-gray-900">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-brand-green border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-apple-gray-500">Cargando...</p>
        </div>
      </div>
    )
  }

  // Usuario logueado sin fila en user_profiles: sin acceso a esta plataforma.
  if (clubId === null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4 text-center bg-apple-gray-50 dark:bg-apple-gray-900">
        <div className="w-24 h-24 bg-apple-gray-100 dark:bg-apple-gray-800 rounded-2xl flex items-center justify-center mb-6 shadow-apple dark:shadow-apple-dark">
          <svg className="w-12 h-12 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-apple-gray-800 dark:text-white mb-2">{t('unauthorized.titulo')}</h1>
        <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 max-w-sm leading-relaxed mb-6">
          {t('unauthorized.mensaje')}
        </p>
        <button
          onClick={() => signOut()}
          className="px-4 py-2.5 rounded-xl text-sm font-medium text-apple-gray-700 dark:text-apple-gray-300 bg-apple-gray-100 dark:bg-apple-gray-700 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 transition-colors"
        >
          {t('nav.cerrarSesion')}
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-apple-gray-50 dark:bg-apple-gray-900 text-apple-gray-800 dark:text-apple-gray-100 transition-colors duration-300 ease-apple">
      {/* Glow ambiente de fondo, solo en modo oscuro -- fixed para que quede
          anclado aunque la página scrollee, igual que el efecto de referencia
          (mismo verde de marca, no rojo). El Navbar es sticky z-50 con fondo
          90% opaco -- el centro de las manchas va DEBAJO de esa franja
          (top-20/top-40), no arriba del viewport, si no queda tapado casi
          entero y no se ve nada. */}
      <div className="hidden dark:block fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-20 -left-32 w-[560px] h-[560px] rounded-full bg-brand-green/[0.18] blur-[120px]" />
        <div className="absolute top-40 -right-40 w-[520px] h-[520px] rounded-full bg-brand-green/[0.12] blur-[120px]" />
      </div>
      <Navbar />
      <main className="flex-1 pb-bottomnav">
        <Suspense fallback={
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="w-6 h-6 border-2 border-brand-green border-t-transparent rounded-full animate-spin opacity-60" />
          </div>
        }>
          <div className="animate-fade-in">
            <Outlet />
          </div>
        </Suspense>
      </main>
      <Footer />
      <LiquidGlassBottomNav visible={bottomNavVisible} />
    </div>
  )
}
