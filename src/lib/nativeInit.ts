import { Capacitor } from '@capacitor/core'

/**
 * Inicialización específica de la app nativa (Capacitor). No hace nada en la web.
 * - Oculta el splash screen apenas la app está lista (arranque rapidísimo).
 * - Configura la status bar acorde al tema oscuro de la marca.
 * - Maneja el botón "atrás" de Android para que no cierre la app de una.
 */
export async function initNative(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  try {
    const { SplashScreen } = await import('@capacitor/splash-screen')
    // Ocultar el splash ya (el contenido web ya montó al llamar a esto).
    await SplashScreen.hide()
  } catch {
    /* plugin no disponible: ignorar */
  }

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    await StatusBar.setStyle({ style: Style.Dark })
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: '#0a0a0a' })
    }
  } catch {
    /* ignorar */
  }

  try {
    const { App } = await import('@capacitor/app')
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back()
      } else {
        App.exitApp()
      }
    })
  } catch {
    /* ignorar */
  }
}
