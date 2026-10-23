import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './context/ThemeContext.tsx'
import { LanguageProvider } from './context/LanguageContext.tsx'
import { CurrencyProvider } from './context/CurrencyContext.tsx'
import { DataProvider } from './context/DataContext.tsx'
import { AuthProvider } from './context/AuthContext.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { ScoutsGGProvider } from './context/ScoutsGGContext.tsx'
import { initNative } from './lib/nativeInit'
import NewPasswordModal from '@/components/auth/NewPasswordModal'

// Init nativo (Capacitor): oculta el splash y ajusta status bar. No-op en web.
initNative()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <LanguageProvider>
          <CurrencyProvider>
            <AuthProvider>
              <DataProvider>
                <ScoutsGGProvider>
                  <App />
                  <NewPasswordModal />
                </ScoutsGGProvider>
              </DataProvider>
            </AuthProvider>
          </CurrencyProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>
)
