/**
 * Enrich Supabase players with Transfermarkt data.
 * Step 1: Search TM website for player name -> get TM ID
 * Step 2: Fetch /player/{tmId} from TM internal API -> get market value, contract, agent
 * Step 3: Patch Supabase players table
 *
 * Usage: node enrich-node.mjs
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import https from 'https'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '2', 10)
const DELAY_MS = parseInt(process.env.DELAY_MS || '1200', 10)

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const REST_URL = `${SUPABASE_URL}/rest/v1`
const SB_HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
}

const TM_HEADERS = {
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  Origin: 'https://www.transfermarkt.es',
  Referer: 'https://www.transfermarkt.es/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ─── HTTP helpers ───────────────────────────────────────────

function fetchJSON(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 15000,
    }, res => {
      let body = ''
      res.on('data', d => body += d)
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) })
        } catch {
          resolve({ status: res.statusCode, data: null })
        }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
    if (options.body) req.write(options.body)
    req.end()
  })
}

async function sbSelectAll(table, params = '', orderCol = 'id') {
  const all = []
  let offset = 0
  const pageSize = 1000
  while (true) {
    const sep = params ? '&' : ''
    const { data } = await fetchJSON(
      `${REST_URL}/${table}?${params}${sep}order=${orderCol}&offset=${offset}&limit=${pageSize}`,
      { headers: SB_HEADERS }
    )
    const rows = data || []
    all.push(...rows)
    if (rows.length < pageSize) break
    offset += pageSize
  }
  return all
}

async function sbPatch(table, id, update) {
  const { status } = await fetchJSON(`${REST_URL}/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: SB_HEADERS,
    body: JSON.stringify(update),
  })
  return status >= 200 && status < 300
}

// ─── Transfermarkt helpers ──────────────────────────────────

function norm(s) {
  return s.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

async function tmSearch(name) {
  try {
    const encoded = encodeURIComponent(name)
    const { status, data } = await fetchJSON(
      `https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query=${encoded}`,
      { headers: TM_HEADERS }
    )
    if (status !== 200 || !data) return []
    return data.players || []
  } catch {
    return []
  }
}

async function tmPlayerDetail(tmId) {
  try {
    const { status, data } = await fetchJSON(
      `https://tmapi-alpha.transfermarkt.technology/player/${tmId}`,
      { headers: TM_HEADERS }
    )
    if (status !== 200 || !data?.data) return null
    return data.data
  } catch {
    return null
  }
}

function matchPlayer(results, name, teamName, birthDate) {
  const target = norm(name)
  const targetParts = target.split(' ')
  const targetLast = targetParts[targetParts.length - 1] || ''
  const teamNorm = teamName ? norm(teamName) : ''
  let birthYear = null
  if (birthDate) try { birthYear = parseInt(birthDate.slice(0, 4), 10) } catch {}

  let best = null, bestScore = -1

  for (const r of results) {
    const rName = r.playerName || r.name || ''
    const rNorm = norm(rName)
    const rParts = rNorm.split(' ')
    const rLast = rParts[rParts.length - 1] || ''

    let score = 0
    if (rNorm === target) score += 10
    else if (rLast === targetLast) {
      score += 5
      if (rParts[0]?.[0] === targetParts[0]?.[0]) score += 2
    }
    if (score === 0) continue

    if (teamNorm) {
      const rTeam = norm(r.club || '')
      if (teamNorm.includes(rTeam) || rTeam.includes(teamNorm)) score += 3
    }
    if (score > bestScore) { bestScore = score; best = r }
  }
  return best
}

// ─── Main ───────────────────────────────────────────────────

async function enrichPlayer(player, teamMap) {
  const { id, name, birth_date, current_team_id } = player
  const teamName = teamMap.get(current_team_id) || null

  // Step 1: Search
  let results = await tmSearch(name)
  if (!results.length) {
    const parts = name.split(' ')
    if (parts.length > 1) {
      await sleep(400)
      results = await tmSearch(parts[parts.length - 1])
    }
  }
  if (!results.length) return null

  const match = matchPlayer(results, name, teamName, birth_date)
  if (!match) return null

  const tmId = match.id
  if (!tmId) return null

  // Step 2: Get full profile
  await sleep(400)
  const profile = await tmPlayerDetail(tmId)
  if (!profile) return { transfermarkt_id: parseInt(tmId, 10) }

  // Extract fields
  const update = { transfermarkt_id: parseInt(tmId, 10) }

  const mv = profile.marketValueDetails?.current?.value
  if (mv) update.market_value_eur = mv

  const contractUntil = profile.attributes?.contractUntil
  if (contractUntil && /^\d{4}-\d{2}-\d{2}/.test(contractUntil)) {
    update.contract_end_date = contractUntil
  }

  const agency = profile.attributes?.consultantAgency?.name
  if (agency) update.agent = agency

  if (profile.relativeUrl) {
    update.transfermarkt_url = `https://www.transfermarkt.com${profile.relativeUrl}`
  }

  return update
}

async function main() {
  console.log('='.repeat(60))
  console.log('Transfermarkt enrichment')
  console.log('='.repeat(60))

  console.log('\nLoading players...')
  const players = await sbSelectAll(
    'players',
    'select=id,name,birth_date,current_team_id&transfermarkt_id=is.null'
  )
  console.log(`  ${players.length} players to enrich`)

  console.log('Loading teams...')
  const teams = await sbSelectAll('teams', 'select=id,name')
  const teamMap = new Map(teams.map(t => [t.id, t.name]))
  console.log(`  ${teamMap.size} teams\n`)

  const stats = { found: 0, notFound: 0, updated: 0, errors: 0 }
  let processed = 0

  for (let i = 0; i < players.length; i += CONCURRENCY) {
    const batch = players.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      batch.map(async (player) => {
        try {
          return { player, update: await enrichPlayer(player, teamMap) }
        } catch (err) {
          return { player, update: null, error: err.message }
        }
      })
    )

    for (const { player, update, error } of results) {
      processed++
      const pct = ((processed / players.length) * 100).toFixed(1)

      if (error) {
        stats.errors++
        continue
      }
      if (!update) {
        stats.notFound++
        if (processed % 100 === 0) {
          process.stdout.write(`[${processed}/${players.length} ${pct}%] ${stats.found} found, ${stats.notFound} not found\n`)
        }
        continue
      }

      stats.found++
      const ok = await sbPatch('players', player.id, update)
      if (ok) {
        stats.updated++
        const parts = []
        if (update.market_value_eur) parts.push(`€${(update.market_value_eur >= 1000000 ? (update.market_value_eur/1000000).toFixed(1)+'M' : (update.market_value_eur/1000).toFixed(0)+'K')}`)
        if (update.contract_end_date) parts.push(update.contract_end_date)
        if (update.agent) parts.push(update.agent.slice(0, 30))
        process.stdout.write(`[${processed}/${players.length} ${pct}%] ${player.name} -> ${parts.join(' | ')}\n`)
      } else {
        stats.errors++
      }
    }

    await sleep(DELAY_MS)
  }

  console.log('\n' + '='.repeat(60))
  console.log(`Done! Found: ${stats.found}, Not found: ${stats.notFound}, Updated: ${stats.updated}, Errors: ${stats.errors}`)
  console.log('='.repeat(60))
}

main().catch(console.error)
