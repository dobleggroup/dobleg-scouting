import { Outlet } from 'react-router-dom'
import { Suspense } from 'react'
import Navbar from './Navbar'
import Footer from './Footer'
import LiquidGlassBottomNav from './LiquidGlassBottomNav'

import { useAuth } from '@/context/AuthContext'
import AuthModal from '@/components/auth/AuthModal'
import { useHideOnScrollDown } from '@/hooks/useHideOnScrollDown'

export default function Layout() {
  const { user, loading } = useAuth()
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

  return (
    <div className="min-h-screen flex flex-col bg-apple-gray-50 dark:bg-apple-gray-900 text-apple-gray-800 dark:text-apple-gray-100 transition-colors duration-300 ease-apple">
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
