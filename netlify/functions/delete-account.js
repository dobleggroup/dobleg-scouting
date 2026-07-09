// Elimina la cuenta del usuario autenticado (requisito de App Store / Play Store).
// Verifica el JWT del que llama y borra su usuario de Supabase Auth usando el
// service role. NO expone el service role al cliente.
//
// Requiere env vars en Netlify:
//   SUPABASE_URL                 (ej: https://qgwmxjjumauortbwvivu.supabase.co)
//   SUPABASE_SERVICE_ROLE_KEY    (clave secreta service_role del proyecto Supabase)
const { createClient } = require('@supabase/supabase-js')

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' }
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Servidor sin configurar (faltan env vars)' }) }
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Falta el token de sesión' }) }
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Verificar el token → identificar al usuario que pide borrarse.
  const { data: userData, error: userErr } = await admin.auth.getUser(token)
  if (userErr || !userData || !userData.user) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Sesión inválida' }) }
  }

  const userId = userData.user.id

  // Borrar el usuario de Auth (elimina credenciales y datos personales de login).
  // Si hay tablas propias del usuario sin ON DELETE CASCADE, agregar acá su limpieza.
  const { error: delErr } = await admin.auth.admin.deleteUser(userId)
  if (delErr) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: delErr.message }) }
  }

  return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true }) }
}
