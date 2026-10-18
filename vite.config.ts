import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { handleOpta } from './netlify/functions/_shared/optaCore.mjs'

/**
 * /api/opta en desarrollo: misma lógica que netlify/functions/opta.mjs (las
 * credenciales de Opta quedan en el servidor, nunca en el bundle).
 */
function optaDevProxy(env: Record<string, string>): Plugin {
  return {
    name: 'opta-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/opta', async (req, res) => {
        try {
          const q = new URL(req.url ?? '', 'http://localhost').searchParams
          const r = await handleOpta({ feed: q.get('feed'), fx: q.get('fx'), authHeader: req.headers.authorization, env })
          res.writeHead(r.status, r.headers)
          res.end(r.body)
        } catch (err) {
          res.writeHead(502, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: (err as Error).message }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // FOOTBALL_API_KEY (sin prefijo VITE_) para que Vite no la inyecte en el
  // bundle del browser. En prod, el mismo rol lo cumple netlify/functions/football.js.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), optaDevProxy(env)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/sheets-proxy': {
          target: 'https://docs.google.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/sheets-proxy/, ''),
          followRedirects: true,
        },
        // Mismo contrato que netlify/functions/football.js: el frontend pide
        // /api/football?endpoint=/fixtures&team=123 y acá se arma la request
        // real a api-sports.io con la key inyectada server-side.
        '/api/football': {
          target: 'https://v3.football.api-sports.io',
          changeOrigin: true,
          rewrite: (path) => {
            const [, qs = ''] = path.split('?')
            const params = new URLSearchParams(qs)
            const endpoint = params.get('endpoint') || '/'
            params.delete('endpoint')
            const rest = params.toString()
            return endpoint + (rest ? `?${rest}` : '')
          },
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('x-apisports-key', env.FOOTBALL_API_KEY || '')
            })
          },
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            // Vendor chunks - separate large dependencies
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-charts': ['recharts'],
            'vendor-pdf': ['jspdf', 'html2canvas'],
            'vendor-pdfjs': ['pdfjs-dist'],
            'vendor-react-pdf': ['@react-pdf/renderer'],
            'vendor-supabase': ['@supabase/supabase-js'],
          },
        },
      },
    },
  }
})
