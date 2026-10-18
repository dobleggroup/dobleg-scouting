// Proxy a Opta para el centro de partido de Test Opta (ver _shared/optaCore.mjs).
//
// Requiere env vars en Netlify (sin prefijo VITE_):
//   OPTA_CLIENT_ID, OPTA_CLIENT_SECRET, OPTA_API_KEY
//   SUPABASE_URL + SUPABASE_ANON_KEY (o las VITE_ equivalentes) para validar la sesión
//
// Uso desde el frontend: /api/opta?feed=ma27&fx=<matchId>  (con Authorization: Bearer <token>)
import { handleOpta } from './_shared/optaCore.mjs'

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }
  const q = event.queryStringParameters || {}
  try {
    const r = await handleOpta({
      feed: q.feed,
      fx: q.fx,
      authHeader: event.headers.authorization || event.headers.Authorization,
      env: process.env,
    })
    return { statusCode: r.status, headers: r.headers, body: r.body }
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: err.message }) }
  }
}
