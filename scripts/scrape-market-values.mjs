/**
 * Scraper de historial de valor de mercado desde la API interna de Transfermarkt
 * No usa Firecrawl - accede directamente al endpoint interno que usan sus componentes Svelte
 *
 * Uso: node scripts/scrape-market-values.mjs
 * Output: scripts/output/market-value-history.csv
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const TM_API_BASE = 'https://tmapi-alpha.transfermarkt.technology'
const DELAY_MS = 800 // ms entre requests (API es rápida)

// Headers que simulan el navegador que hace la petición desde transfermarkt.es
const API_HEADERS = {
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://www.transfermarkt.es',
  'Referer': 'https://www.transfermarkt.es/',
}

// Lista completa de jugadores Doble G con nombre para el CSV y ID de Transfermarkt
const PLAYERS = [
  { csvName: 'J. Paradela',      tmId: '639152' },
  { csvName: 'M. Palacios',      tmId: '621370' },
  { csvName: 'M. Vera',          tmId: '697408' },
  { csvName: 'L. Orellano',      tmId: '636784' },
  { csvName: 'A. Steimbach',     tmId: '1046802' },
  { csvName: 'M. Espíndola',     tmId: '992527' },
  { csvName: 'J. Palacios',      tmId: '728262' },
  { csvName: 'J. Farías',        tmId: '1101427' },
  { csvName: 'S. Echeverría',    tmId: '249794' },
  { csvName: 'A. Mulet',         tmId: '843537' },
  { csvName: 'A. Massaccesi',    tmId: '1221014' },
  { csvName: 'I. Erquiaga',      tmId: '579977' },
  { csvName: 'J. Díaz',          tmId: '535028' },
  { csvName: 'M. Kabalin',       tmId: '538538' },
  { csvName: 'G. Prestianni',    tmId: '1000674' },
  { csvName: 'Gonzalo González', tmId: '1029299' },
  { csvName: 'L. Minniti',       tmId: '1322847' },
  { csvName: 'J. López',         tmId: '625203' },
  { csvName: 'D. Mastrángelo',   tmId: '1110143' },
  { csvName: 'A. Melano',        tmId: '1377439' },
  { csvName: 'J. Postigo',       tmId: '1069809' },
  { csvName: 'C. Bravo',         tmId: '441408' },
  { csvName: 'N. Leguizamón',    tmId: '437962' },
  { csvName: 'M. Sanabria',      tmId: '1027280' },
  { csvName: 'M. Enrique',       tmId: '742512' },
  { csvName: 'M. Isopi',         tmId: '1341520' },
  { csvName: 'F. Paradela',      tmId: '890130' },
  { csvName: 'F. Lo Celso',      tmId: '642757' },
  { csvName: 'T. Valdecantos',   tmId: '983999' },
  { csvName: 'B. Centeno',       tmId: '1001697' },
  { csvName: 'L. Klimowicz',     tmId: '1198161' },
]

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// Cache de nombres de club para evitar llamadas repetidas
const clubCache = {}

async function getClubName(clubId) {
  if (!clubId) return ''
  if (clubCache[clubId]) return clubCache[clubId]

  try {
    const res = await fetch(`${TM_API_BASE}/club/${clubId}`, { headers: API_HEADERS })
    if (!res.ok) return ''
    const data = await res.json()
    const name = data?.data?.name || ''
    clubCache[clubId] = name
    return name
  } catch {
    return ''
  }
}

// Formatea fecha ISO (YYYY-MM-DD) a DD/MM/YYYY
function formatDate(isoDate) {
  if (!isoDate) return ''
  const [year, month, day] = isoDate.split('-')
  return `${day}/${month}/${year}`
}

// Obtiene el historial completo de valor de mercado de un jugador
async function getMarketValueHistory(tmId) {
  const res = await fetch(`${TM_API_BASE}/player/${tmId}/market-value-history`, {
    headers: API_HEADERS,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data?.data?.history || []
}

// Escapa campos CSV si tienen comas
function csvField(val) {
  const s = String(val || '')
  return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
}

async function main() {
  const outputDir = path.join(__dirname, 'output')
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, 'market-value-history.csv')

  const allRows = []
  const results = { success: [], failed: [], noData: [] }

  console.log(`\n🔍 Obteniendo historial de valor de mercado de ${PLAYERS.length} jugadores...\n`)

  for (let i = 0; i < PLAYERS.length; i++) {
    const player = PLAYERS[i]
    process.stdout.write(`[${i + 1}/${PLAYERS.length}] ${player.csvName} (ID: ${player.tmId}) ... `)

    try {
      const history = await getMarketValueHistory(player.tmId)

      if (history.length === 0) {
        console.log('⚠️  sin datos')
        results.noData.push(player.csvName)
        continue
      }

      // Recopilar los clubIds únicos para resolver nombres en batch
      const clubIds = [...new Set(history.map(h => h.clubId).filter(Boolean))]

      // Resolver nombres de clubes en paralelo (con pequeño throttle)
      const clubChunks = []
      for (let j = 0; j < clubIds.length; j += 5) {
        clubChunks.push(clubIds.slice(j, j + 5))
      }
      for (const chunk of clubChunks) {
        await Promise.all(chunk.map(id => getClubName(id)))
        if (clubChunks.indexOf(chunk) < clubChunks.length - 1) await sleep(200)
      }

      // Construir filas del CSV
      for (const entry of history) {
        const club = clubCache[entry.clubId] || ''
        const fecha = formatDate(entry.marketValue?.determined)
        const valor = entry.marketValue?.value || 0
        const edad = entry.age || ''

        if (fecha && valor > 0) {
          allRows.push({
            Jugador: player.csvName,
            'ID TM': player.tmId,
            Fecha: fecha,
            'Valor (€)': valor,
            Equipo: club,
            Edad: edad,
          })
        }
      }

      console.log(`✅ ${history.length} entradas`)
      results.success.push(`${player.csvName} (${history.length})`)
    } catch (err) {
      console.log(`❌ ERROR: ${err.message}`)
      results.failed.push(player.csvName)
    }

    if (i < PLAYERS.length - 1) await sleep(DELAY_MS)
  }

  // Ordenar: primero por nombre de jugador, luego por fecha
  allRows.sort((a, b) => {
    if (a.Jugador !== b.Jugador) return a.Jugador.localeCompare(b.Jugador)
    const parseDate = d => {
      const [dd, mm, yyyy] = d.split('/')
      return new Date(+yyyy, +mm - 1, +dd)
    }
    return parseDate(a.Fecha) - parseDate(b.Fecha)
  })

  // Escribir CSV
  const header = 'Jugador,ID TM,Fecha,Valor (€),Equipo,Edad'
  const rows = allRows.map(r =>
    [csvField(r.Jugador), r['ID TM'], r.Fecha, r['Valor (€)'], csvField(r.Equipo), r.Edad].join(',')
  )
  fs.writeFileSync(outputPath, [header, ...rows].join('\n'), 'utf-8')

  // Resumen
  console.log('\n' + '='.repeat(60))
  console.log(`✅ CSV generado: ${outputPath}`)
  console.log(`   ${allRows.length} filas | ${results.success.length} jugadores OK`)

  if (results.noData.length > 0) {
    console.log(`\n⚠️  Sin datos (${results.noData.length}): ${results.noData.join(', ')}`)
  }
  if (results.failed.length > 0) {
    console.log(`\n❌ Fallidos (${results.failed.length}): ${results.failed.join(', ')}`)
  }

  console.log('\n📋 PRÓXIMOS PASOS:')
  console.log('   1. Abrí el Google Sheet:')
  console.log('      https://docs.google.com/spreadsheets/d/1gXhmqIc_joFkiQ1brie4-xHX43W8fqn2f6tqV04rx9s/edit?gid=1121324076')
  console.log('   2. Archivo → Importar → Subir → seleccioná market-value-history.csv')
  console.log('   3. Elegí "Reemplazar datos en la hoja actual"')
  console.log('   4. El app actualiza automáticamente al refrescar (lee el Sheet)')
}

main().catch(console.error)
