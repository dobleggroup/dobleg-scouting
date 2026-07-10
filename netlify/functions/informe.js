// Sirve un informe compartido (HTML autocontenido) desde Supabase Storage con los
// headers correctos. Necesario porque Storage sirve los objetos con
// `Content-Type: text/plain` + `Content-Security-Policy: default-src 'none'; sandbox`,
// lo que hace que el navegador NO renderice el HTML (se ve en blanco / como texto).
// Esta función baja el objeto y lo re-emite como text/html con un CSP permisivo.
const https = require('https')

const SUPABASE = 'https://qgwmxjjumauortbwvivu.supabase.co'
const BUCKET = 'informes-compartidos'

// Permite lo que usa el informe: estilos/JS inline, imágenes data:/https,
// fuentes data:, y el embed de YouTube. Bloquea el resto.
const CSP = [
  "default-src 'none'",
  "img-src data: https:",
  "style-src 'unsafe-inline'",
  "font-src data: https:",
  "script-src 'unsafe-inline'",
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
  "media-src https:",
  "base-uri 'none'",
].join('; ')

exports.handler = async function (event) {
  const key = event.queryStringParameters && event.queryStringParameters.key
  if (!key || /[\r\n]/.test(key)) {
    return { statusCode: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: 'Falta el identificador del informe.' }
  }

  const url = `${SUPABASE}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(key).replace(/%2F/g, '/')}`

  return new Promise((resolve) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          res.resume()
          resolve({
            statusCode: res.statusCode === 404 ? 404 : 502,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
            body: '<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;background:#08090B;color:#F5F7FA;text-align:center;padding:3rem">Informe no encontrado o expirado.</body>',
          })
          return
        }
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          resolve({
            statusCode: 200,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Content-Security-Policy': CSP,
              'X-Content-Type-Options': 'nosniff',
              'Cache-Control': 'public, max-age=300',
            },
            body: Buffer.concat(chunks).toString('utf8'),
          })
        })
      })
      .on('error', () => {
        resolve({ statusCode: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: 'Error al cargar el informe.' })
      })
  })
}
