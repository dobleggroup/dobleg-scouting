import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './context/ThemeContext.tsx'
import { DataProvider } from './context/DataContext.tsx'
import { AuthProvider } from './context/AuthContext.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { ScoutsGGProvider } from './context/ScoutsGGContext.tsx'
import { initNative } from './lib/nativeInit'

// Init nativo (Capacitor): oculta el splash y ajusta status bar. No-op en web.
initNative()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <DataProvider>
            <ScoutsGGProvider>
              <App />
            </ScoutsGGProvider>
          </DataProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>
)
