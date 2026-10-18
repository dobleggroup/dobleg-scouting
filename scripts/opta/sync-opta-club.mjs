#!/usr/bin/env node
/**
 * Test Opta: plantel, carrera de cada jugador y del DT, y todos los que pasaron por
 * un club (sirve para cualquier club, también los que no están en la prueba). Con
 * eso se arman los surgidos del club y la ficha del DT en Entrenadores →
 * "Leonardo Ponzio · Test Opta".
 *
 * Uso (desde la raíz del repo):
 *   scripts\secrets.bat && node scripts/opta/sync-opta-club.mjs
 *   Flags: --team <id de Opta> --key <key en opta_snapshot> (por defecto River, 'club_river'),
 *          --no-upload (solo escribe scripts/opta/.cache/out/<key>.json)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const OUT = join(HERE, '.cache', 'out')
mkdirSync(OUT, { recursive: true })

const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null }
const TEAM_ID = arg('--team') ?? '115foion8jwrvp2e7xif675kx' // River Plate
const KEY = arg('--key') ?? 'club_river'
const NO_UPLOAD = process.argv.includes('--no-upload')

function readEnvFile(path) {
  if (!existsSync(path)) return {}
  const out = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:set\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, '')
  }
  return out
}
const fileEnv = { ...readEnvFile(join(ROOT, 'scripts', 'secrets.bat')), ...readEnvFile(join(ROOT, '.env.local')) }
const env = k => process.env[k] || fileEnv[k]

const OPTA = { id: env('OPTA_CLIENT_ID'), secret: env('OPTA_CLIENT_SECRET'), key: env('OPTA_API_KEY') }
if (!OPTA.id || !OPTA.secret || !OPTA.key) throw new Error('Faltan OPTA_CLIENT_ID / OPTA_CLIENT_SECRET / OPTA_API_KEY')
const SUPABASE_URL = env('SUPABASE_URL') || env('VITE_SUPABASE_URL')
const SUPABASE_KEY = env('SUPABASE_SERVICE_KEY')
if (!NO_UPLOAD && (!SUPABASE_URL || !SUPABASE_KEY)) throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY (o usá --no-upload)')

const API = 'https://api.statsperform.com/sdapi/v1/soccerdata'
let token = null
async function getToken() {
  if (token && token.exp > Date.now() + 60_000) return token.value
  const res = await fetch(`https://api.statsperform.com/realms/apigw/protocol/openid-connect/token?apikey=${encodeURIComponent(OPTA.key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: OPTA.id, client_secret: OPTA.secret }),
  })
  if (!res.ok) throw new Error(`OAuth Opta ${res.status}: ${await res.text()}`)
  const j = await res.json()
  token = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 }
  return token.value
}

let calls = 0
async function opta(path, { allow404 = false } = {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${API}/${path}${path.includes('?') ? '&' : '?'}_fmt=json`, {
      headers: { Authorization: `Bearer ${await getToken()}` },
    })
    calls++
    if (res.ok) return res.json()
    if (res.status === 404 && allow404) return null
    if (res.status === 401) { token = null; continue }
    if (res.status === 429 || res.status >= 500) {
      await new Promise(r => setTimeout(r, 1500 * (attempt + 1) ** 2))
      continue
    }
    throw new Error(`Opta ${res.status} en ${path}: ${(await res.text()).slice(0, 200)}`)
  }
  throw new Error(`Opta sin respuesta tras reintentos: ${path}`)
}

async function pool(items, size, fn) {
  let i = 0
  const results = new Array(items.length)
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) { const idx = i++; results[idx] = await fn(items[idx]) }
  }))
  return results
}

const num = v => (v === undefined || v === null || v === '' ? 0 : Number(v))
const day = d => (d ? String(d).replace('Z', '').slice(0, 10) : null)

/** Carrera compacta: un tramo por club con sus temporadas oficiales (sin amistosos). */
function compactCareer(person) {
  return (person?.membership ?? []).map(m => ({
    team: m.contestantShortName ?? m.contestantName,
    teamId: m.contestantId,
    national: m.contestantType === 'national',
    role: m.role ?? 'player',
    from: day(m.startDate),
    to: day(m.endDate),
    active: m.active === 'yes',
    transfer: m.transferType ?? null,
    // Jugador: [temporada, competición, partidos, minutos, goles, asistencias, amarillas, rojas, entró de suplente, banco sin entrar]
    // DT: [temporada, competición, ganados, empatados, perdidos]
    seasons: (m.stat ?? []).filter(s => s.isFriendly !== 'yes').map(s => (m.role === 'coach'
      ? [s.tournamentCalendarName, s.competitionName, num(s.win), num(s.draw), num(s.lost)]
      : [s.tournamentCalendarName, s.competitionName, num(s.appearances), num(s.minutesPlayed), num(s.goals), num(s.assists),
        num(s.yellowCards) + num(s.secondYellowCards), num(s.redCards), num(s.substituteIn), num(s.subsOnBench)])),
  }))
}

function bio(p) {
  return {
    id: p.id,
    name: p.knownName ?? `${p.shortFirstName ?? p.firstName ?? ''} ${p.shortLastName ?? p.lastName ?? ''}`.trim(),
    fullName: `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(),
    matchName: p.matchName ?? null,
    position: p.position ?? null,
    dob: p.dateOfBirth ?? null,
    nat: p.nationality ?? null,
    birthPlace: p.placeOfBirth ?? null,
    height: p.height ? num(p.height) : null,
    weight: p.weight ? num(p.weight) : null,
    foot: p.foot ?? null,
  }
}

const t0 = Date.now()
console.log('Plantel, carreras y pases del club…')
const [squadFeed, careerFeed, transfersFeed] = await Promise.all([
  opta(`squads/?ctst=${TEAM_ID}&detailed=yes&_pgSz=200`),
  opta(`playercareer/?ctst=${TEAM_ID}&_pgSz=1000`),
  opta(`transfers/?ctst=${TEAM_ID}&_pgSz=1000`),
])
const squadRaw = squadFeed.squad?.[0]
if (!squadRaw) throw new Error('Opta no devolvió el plantel')
const careerById = new Map((careerFeed.person ?? []).map(p => [p.id, p]))

// Todos los que pasaron por el club (jugadores y DT) que no están en el plantel actual.
const pastIds = (transfersFeed.person ?? []).map(p => p.id).filter(id => !careerById.has(id))
const coachRaw = squadRaw.person.find(p => p.type === 'coach')
if (coachRaw && !careerById.has(coachRaw.id)) pastIds.push(coachRaw.id)
console.log(`  plantel ${squadRaw.person.length}, ya pasaron ${pastIds.length}: bajando carreras…`)
const pastCareers = await pool([...new Set(pastIds)], 6, id => opta(`playercareer/?prsn=${id}`, { allow404: true }))
for (const c of pastCareers) { const p = c?.person?.[0]; if (p) careerById.set(p.id, p) }

const squad = squadRaw.person.filter(p => p.type === 'player').map(p => ({
  ...bio({ ...careerById.get(p.id), ...p }),
  joined: day(p.startDate),
  career: compactCareer(careerById.get(p.id)),
}))
const coach = coachRaw ? { ...bio(coachRaw), joined: day(coachRaw.startDate), career: compactCareer(careerById.get(coachRaw.id)) } : null

/** Club donde jugó su primer partido oficial (misma regla que debutOf en src/features/optaClub/clubData.ts). */
function debutTeam(career) {
  let best = null
  for (const s of career) {
    if (s.role !== 'player' || s.national) continue
    for (const r of s.seasons) {
      if (r[2] <= 0) continue
      const key = `${String(r[0]).slice(0, 4)}|${s.from ?? '9999'}`
      if (!best || key < best.key) best = { key, teamId: s.teamId }
    }
  }
  return best?.teamId ?? null
}

// De los que ya se fueron solo interesan los surgidos del club (dónde juegan hoy).
const squadIds = new Set(squad.map(p => p.id))
const alumni = (transfersFeed.person ?? [])
  .filter(p => p.type === 'player' && !squadIds.has(p.id) && careerById.has(p.id))
  .map(p => ({ ...bio({ ...careerById.get(p.id), ...p }), career: compactCareer(careerById.get(p.id)) }))
  .filter(p => debutTeam(p.career) === TEAM_ID)

const data = {
  updatedAt: new Date().toISOString(),
  team: {
    id: TEAM_ID,
    name: squadRaw.contestantName,
    short: squadRaw.contestantShortName,
    nickname: squadRaw.contestantNickname ?? null,
    venue: squadRaw.venueName ?? null,
  },
  coach,
  squad,
  alumni,
}
const json = JSON.stringify(data)
writeFileSync(join(OUT, `${KEY}.json`), json)
console.log(`  ${KEY}: ${(json.length / 1024).toFixed(0)} KB · ${squad.length} jugadores, ${alumni.length} que pasaron por el club`)

if (!NO_UPLOAD) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/opta_snapshot?on_conflict=key`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ key: KEY, data, updated_at: data.updatedAt }),
  })
  if (!res.ok) throw new Error(`Supabase ${KEY}: ${res.status} ${await res.text()}`)
  console.log(`  ✓ subido a Supabase`)
}
console.log(`Listo en ${((Date.now() - t0) / 1000).toFixed(0)} s, ${calls} llamadas a Opta.`)
