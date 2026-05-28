/**
 * Backfill market_value_history in Supabase from Transfermarkt API.
 * Only for Doble G agency players.
 *
 * Usage: SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/backfill-market-value-history.mjs
 */

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const TM_API_BASE = 'https://tmapi-alpha.transfermarkt.technology'
const DELAY_MS = 800

const API_HEADERS = {
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://www.transfermarkt.es',
  'Referer': 'https://www.transfermarkt.es/',
}

const SB_HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'resolution=merge-duplicates',
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function sbQuery(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { ...SB_HEADERS, 'Prefer': 'return=representation' },
  })
  if (!res.ok) throw new Error(`Supabase GET ${path}: ${res.status}`)
  return res.json()
}

async function sbUpsert(table, rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: SB_HEADERS,
    body: JSON.stringify(rows),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Supabase POST ${table}: ${res.status} ${text.slice(0, 200)}`)
  }
}

async function getMarketValueHistory(tmId) {
  const res = await fetch(`${TM_API_BASE}/player/${tmId}/market-value-history`, {
    headers: API_HEADERS,
  })
  if (!res.ok) throw new Error(`TM API: ${res.status}`)
  const data = await res.json()
  return data?.data?.history || []
}

const clubCache = {}
async function getClubName(clubId) {
  if (!clubId) return null
  if (clubCache[clubId]) return clubCache[clubId]
  try {
    const res = await fetch(`${TM_API_BASE}/club/${clubId}`, { headers: API_HEADERS })
    if (!res.ok) return null
    const data = await res.json()
    const name = data?.data?.name || null
    clubCache[clubId] = name
    return name
  } catch { return null }
}

async function main() {
  const players = await sbQuery(
    'players?select=id,name,transfermarkt_id&transfermarkt_id=not.is.null'
  )

  const DG_TM_IDS = new Set([
    639152, 621370, 697408, 636784, 1046802, 992527, 728262, 1101427,
    249794, 843537, 1221014, 579977, 535028, 538538, 1000674, 1029299,
    1322847, 625203, 1110143, 1377439, 1069809, 441408, 437962, 1027280,
    742512, 1341520, 890130, 642757, 983999, 1001697, 1198161,
  ])

  const dgPlayers = players.filter(p => DG_TM_IDS.has(p.transfermarkt_id))
  console.log(`\nFound ${dgPlayers.length} Doble G players with TM IDs\n`)

  let totalRows = 0
  const results = { success: [], failed: [], noData: [] }

  for (let i = 0; i < dgPlayers.length; i++) {
    const player = dgPlayers[i]
    process.stdout.write(`[${i + 1}/${dgPlayers.length}] ${player.name} (TM#${player.transfermarkt_id}) ... `)

    try {
      const history = await getMarketValueHistory(player.transfermarkt_id)

      if (history.length === 0) {
        console.log('no data')
        results.noData.push(player.name)
        await sleep(DELAY_MS)
        continue
      }

      const clubIds = [...new Set(history.map(h => h.clubId).filter(Boolean))]
      for (const cid of clubIds) {
        await getClubName(cid)
        await sleep(100)
      }

      const rows = history
        .filter(entry => entry.marketValue?.value > 0 && entry.marketValue?.determined)
        .map(entry => ({
          player_id: player.id,
          recorded_at: entry.marketValue.determined,
          value_eur: entry.marketValue.value,
          club_name: clubCache[entry.clubId] || null,
        }))

      if (rows.length > 0) {
        for (let j = 0; j < rows.length; j += 100) {
          await sbUpsert('market_value_history', rows.slice(j, j + 100))
        }
        totalRows += rows.length
        console.log(`${rows.length} entries`)
        results.success.push(`${player.name} (${rows.length})`)
      } else {
        console.log('no valid entries')
        results.noData.push(player.name)
      }
    } catch (err) {
      console.log(`ERROR: ${err.message}`)
      results.failed.push(player.name)
    }

    await sleep(DELAY_MS)
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`Done! ${totalRows} total rows inserted/updated`)
  console.log(`Success: ${results.success.length} | No data: ${results.noData.length} | Failed: ${results.failed.length}`)
  if (results.failed.length > 0) console.log(`Failed: ${results.failed.join(', ')}`)
}

main().catch(console.error)
