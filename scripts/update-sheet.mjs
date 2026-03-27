/**
 * Actualiza la hoja "Valor de mercado evolucion" del Google Sheet
 * con los datos del CSV generado por scrape-market-values.mjs
 *
 * Primer uso: abre el navegador para autenticarte con Google (solo una vez)
 * Uso: node scripts/update-sheet.mjs
 *
 * Requiere:
 *   1. Credenciales OAuth en scripts/google-credentials.json
 *      (ver instrucciones abajo si no las tenés)
 */

import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { fileURLToPath } from 'url'
import { google } from 'googleapis'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── CONFIG ────────────────────────────────────────────────────────────────
const SPREADSHEET_ID = '1gXhmqIc_joFkiQ1brie4-xHX43W8fqn2f6tqV04rx9s'
const SHEET_GID      = 1121324076   // gid de la pestaña
const CSV_PATH       = path.join(__dirname, 'output', 'market-value-history.csv')
const CREDS_PATH     = path.join(__dirname, 'google-credentials.json')
const TOKEN_PATH     = path.join(__dirname, 'google-token.json')
const SCOPES         = ['https://www.googleapis.com/auth/spreadsheets']
// ───────────────────────────────────────────────────────────────────────────

function loadCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.trim().split('\n')
  return lines.map(line => {
    // Parse CSV respetando campos con comillas
    const cells = []
    let current = ''
    let inQuotes = false
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes }
      else if (ch === ',' && !inQuotes) { cells.push(current); current = '' }
      else { current += ch }
    }
    cells.push(current)
    return cells
  })
}

async function getAuthClient() {
  if (!fs.existsSync(CREDS_PATH)) {
    console.error(`\n❌ No se encontró: ${CREDS_PATH}`)
    console.error('\n📋 Para obtener las credenciales:')
    console.error('   1. Ir a https://console.cloud.google.com/apis/credentials')
    console.error('   2. Crear proyecto → Habilitar "Google Sheets API"')
    console.error('   3. Credenciales → Crear credenciales → ID de cliente OAuth 2.0')
    console.error('   4. Tipo: Aplicación de escritorio')
    console.error('   5. Descargar JSON → guardar como scripts/google-credentials.json')
    process.exit(1)
  }

  const credentials = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf-8'))
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])

  // Usar token guardado si existe
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'))
    oAuth2Client.setCredentials(token)
    // Refrescar si expiró
    if (token.expiry_date && Date.now() > token.expiry_date - 60000) {
      const { credentials: newCreds } = await oAuth2Client.refreshAccessToken()
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(newCreds))
      oAuth2Client.setCredentials(newCreds)
    }
    return oAuth2Client
  }

  // Primera vez: abrir navegador para auth
  const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES })
  console.log('\n🌐 Abrí este link en el navegador para autorizar:\n')
  console.log('   ' + authUrl)
  console.log()

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const code = await new Promise(resolve => {
    rl.question('📋 Pegá el código de autorización aquí: ', ans => {
      rl.close()
      resolve(ans.trim())
    })
  })

  const { tokens } = await oAuth2Client.getToken(code)
  oAuth2Client.setCredentials(tokens)
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens))
  console.log('✅ Token guardado. Próximas ejecuciones serán automáticas.\n')
  return oAuth2Client
}

async function getSheetName(sheetsApi, spreadsheetId, gid) {
  const meta = await sheetsApi.spreadsheets.get({ spreadsheetId })
  const sheet = meta.data.sheets.find(s => s.properties.sheetId === gid)
  return sheet?.properties?.title || null
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌ CSV no encontrado: ${CSV_PATH}`)
    console.error('   Primero ejecutá: node scripts/scrape-market-values.mjs')
    process.exit(1)
  }

  console.log('🔑 Autenticando con Google...')
  const auth = await getAuthClient()
  const sheets = google.sheets({ version: 'v4', auth })

  // Resolver el nombre de la hoja por GID
  const sheetName = await getSheetName(sheets, SPREADSHEET_ID, SHEET_GID)
  if (!sheetName) {
    console.error(`❌ No se encontró la hoja con GID ${SHEET_GID}`)
    process.exit(1)
  }
  console.log(`📄 Hoja encontrada: "${sheetName}"`)

  // Leer CSV
  const rows = loadCSV(CSV_PATH)
  console.log(`📊 ${rows.length} filas a escribir (incl. header)`)

  // Limpiar hoja completa primero
  console.log('🧹 Limpiando hoja...')
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: sheetName,
  })

  // Escribir todos los datos
  console.log('✍️  Escribiendo datos...')
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  })

  console.log(`\n✅ Hoja actualizada: ${rows.length - 1} filas de datos`)
  console.log(`   ${SPREADSHEET_ID} → "${sheetName}"`)
  console.log('\n🔄 El app se actualizará automáticamente al refrescar.')
}

main().catch(err => {
  console.error('❌ Error:', err.message)
  process.exit(1)
})
