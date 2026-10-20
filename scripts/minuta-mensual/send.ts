/**
 * Manda por mail una minuta ya generada (ver run.ts) desde la cuenta de Gmail
 * de la agencia.
 *   npx vite-node scripts/minuta-mensual/send.ts -- minuta-2026-09.html mail@ejemplo.com [otro@ejemplo.com]
 * Necesita en .env.local:
 *   MINUTA_GMAIL_USER=dobleg.group@gmail.com
 *   MINUTA_GMAIL_APP_PASSWORD=<contraseña de aplicación de esa cuenta>
 */
import fs from 'fs'
import nodemailer from 'nodemailer'

const args = process.argv.slice(2).filter(a => a !== '--')
const [file, ...to] = args
if (!file || !to.length) throw new Error('Uso: send.ts -- <archivo.html> <mail> [mail…]')

// Vite no pasa a process.env las variables sin VITE_: se lee .env.local a mano.
const envLocal = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : ''
const env = (k: string) => process.env[k] ?? envLocal.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1]?.trim()
const user = env('MINUTA_GMAIL_USER')
const pass = env('MINUTA_GMAIL_APP_PASSWORD')?.replace(/\s+/g, '')
if (!user || !pass) throw new Error('Faltan MINUTA_GMAIL_USER / MINUTA_GMAIL_APP_PASSWORD en .env.local')

const html = fs.readFileSync(file, 'utf8')
const title = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? 'Minuta mensual'

const transport = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } })
const info = await transport.sendMail({
  from: `Doble G Sports Group <${user}>`,
  to,
  subject: `${title} · Doble G`,
  html,
  text: 'Minuta mensual de Doble G. Si no ves el contenido, abrí este mail en Gmail o en el navegador.',
})
console.log(`Enviada a ${to.join(', ')} (${info.messageId})`)
