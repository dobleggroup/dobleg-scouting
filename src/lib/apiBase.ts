import { Capacitor } from '@capacitor/core'

// Origen de producción (Netlify) donde viven las funciones serverless.
const PROD_ORIGIN = 'https://dobleg-scouting.netlify.app'

/**
 * Base para las Netlify Functions.
 * - App nativa (Capacitor): URL absoluta al sitio deployado (las rutas relativas
 *   no existen dentro de la app).
 * - Web (dev/prod): ruta relativa del mismo dominio.
 */
export const FUNCTIONS_BASE = Capacitor.isNativePlatform()
  ? `${PROD_ORIGIN}/.netlify/functions`
  : '/.netlify/functions'
