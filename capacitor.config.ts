import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'group.dobleg.scout',
  appName: 'Doble G Scout',
  webDir: 'dist',
  // Arranque rapidísimo: el splash se oculta apenas React monta (lo hace App.tsx
  // llamando a SplashScreen.hide()). launchShowDuration 0 = no bloquea.
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: false,
      backgroundColor: '#0a0a0a',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0a0a0a',
    },
  },
};

export default config;
