// Proxy a la API de Opta (Stats Perform) para el centro de partido de Test Opta.
// Lo usan la función de Netlify (netlify/functions/opta.js) y el servidor de
// desarrollo de Vite (vite.config.ts), así se comportan igual.
//
// - Las credenciales viven solo en el servidor: OPTA_CLIENT_ID, OPTA_CLIENT_SECRET,
//   OPTA_API_KEY (sin prefijo VITE_).
// - Solo responde a usuarios logueados en la app (token de Supabase), porque los
//   datos de Opta son confidenciales por contrato.
// - Solo deja pedir los feeds de un partido de la lista (no es un proxy abierto).

const OAUTH_URL = 'https://api.statsperform.com/realms/apigw/protocol/openid-connect/token'
const API_URL = 'https://api.statsperform.com/sdapi/v1/soccerdata'

const FEEDS = {
  ma2: fx => `matchstats/?detailed=yes&fx=${fx}`,
  ma4: fx => `passmatrix/?fx=${fx}`,
  ma12: fx => `matchexpectedgoals/?fx=${fx}`,
  ma21: fx => `matchlivewinprobability/?fx=${fx}`,
  ma27: fx => `predictions/momentum/?fx=${fx}`,
  ma30: fx => `matchpossessionvalues/?fx=${fx}`,
}

let cachedToken = null

async function getToken(env) {
  if (cachedToken && cachedToken.exp > Date.now() + 60000) return cachedToken.value
  const res = await fetch(`${OAUTH_URL}?apikey=${encodeURIComponent(env.OPTA_API_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.OPTA_CLIENT_ID, client_secret: env.OPTA_CLIENT_SECRET }),
  })
  if (!res.ok) throw new Error(`Opta rechazó las credenciales (${res.status})`)
  const j = await res.json()
  cachedToken = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 }
  return cachedToken.value
}

async function isLoggedIn(authHeader, env) {
  const token = (authHeader || '').replace(/^Bearer\s+/i, '').trim()
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
  if (!token || !url || !anon) return false
  const res = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } })
  return res.ok
}

const json = (status, body, extra = {}) => ({
  status,
  headers: { 'Content-Type': 'application/json', ...extra },
  body: typeof body === 'string' ? body : JSON.stringify(body),
})

/** { feed, fx } + header Authorization → { status, headers, body } */
export async function handleOpta({ feed, fx, authHeader, env }) {
  if (!env.OPTA_CLIENT_ID || !env.OPTA_CLIENT_SECRET || !env.OPTA_API_KEY) {
    return json(500, { error: 'Servidor sin configurar (faltan las credenciales de Opta)' })
  }
  const build = FEEDS[feed]
  if (!build) return json(400, { error: 'Feed no permitido' })
  if (!/^[a-z0-9]{15,40}$/.test(fx || '')) return json(400, { error: 'Partido inválido' })
  if (!(await isLoggedIn(authHeader, env))) return json(401, { error: 'Iniciá sesión para ver datos de Opta' })

  let res = null
  for (let attempt = 0; attempt < 2; attempt++) {
    res = await fetch(`${API_URL}/${build(fx)}&_fmt=json`, { headers: { Authorization: `Bearer ${await getToken(env)}` } })
    if (res.status !== 401) break
    cachedToken = null
  }
  const body = await res.text()
  if (res.status === 404) return json(404, { error: 'Opta no tiene este dato para el partido' })
  if (!res.ok) return json(res.status, { error: `Opta respondió ${res.status}` })
  return json(200, body, { 'Cache-Control': 'private, max-age=300' })
}

