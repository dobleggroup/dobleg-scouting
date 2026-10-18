#!/usr/bin/env node
/**
 * Test Opta: baja la Liga Profesional Argentina 2026 de la API de Opta (Stats
 * Perform, prueba gratuita 16-30/10/2026) y guarda una versión compacta en
 * Supabase (tabla `opta_snapshot`) para la sección Scout Externo → Test Opta.
 *
 * Uso (desde la raíz del repo):
 *   scripts\secrets.bat && node scripts/opta/sync-opta.mjs
 *   (o con SUPABASE_URL / SUPABASE_SERVICE_KEY en el entorno)
 *
 * Credenciales de Opta: OPTA_CLIENT_ID, OPTA_CLIENT_SECRET, OPTA_API_KEY (se leen
 * de .env.local si no están en el entorno). Lo bajado por partido terminado queda
 * en scripts/opta/.cache (no se commitea): volver a correrlo solo baja lo nuevo.
 *
 * Flags: --no-upload (solo arma los archivos en .cache/out), --skip-events (no baja
 * los eventos de cada partido: sin mapas de calor ni pases progresivos).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const CACHE = join(HERE, '.cache')
const OUT = join(CACHE, 'out')
for (const d of [CACHE, OUT, join(CACHE, 'match'), join(CACHE, 'person')]) mkdirSync(d, { recursive: true })

const args = new Set(process.argv.slice(2))
const NO_UPLOAD = args.has('--no-upload')
const SKIP_EVENTS = args.has('--skip-events')

// ─── Entorno ────────────────────────────────────────────────────────────────

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

// ─── Cliente Opta ───────────────────────────────────────────────────────────

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

async function pool(items, size, fn, label) {
  let i = 0, done = 0
  const results = new Array(items.length)
  const worker = async () => {
    while (i < items.length) {
      const idx = i++
      results[idx] = await fn(items[idx], idx)
      done++
      if (label && (done % 25 === 0 || done === items.length)) process.stdout.write(`\r  ${label}: ${done}/${items.length}   `)
    }
  }
  await Promise.all(Array.from({ length: size }, worker))
  if (label) process.stdout.write('\n')
  return results
}

const cached = (file, maxAgeH) => existsSync(file) && (maxAgeH == null || Date.now() - statSync(file).mtimeMs < maxAgeH * 3600_000)
const readJson = f => JSON.parse(readFileSync(f, 'utf8'))
const num = v => (v === undefined || v === null || v === '' ? 0 : Number(v))
const r2 = v => Math.round(v * 100) / 100
const r3 = v => Math.round(v * 1000) / 1000

// ─── Posición real (de las alineaciones) ───────────────────────────────────

/** (position, positionSide) de una alineación de Opta → rol en castellano. */
function roleOf(position, side = '') {
  const s = side || ''
  const left = s === 'Left', right = s === 'Right'
  switch (position) {
    case 'Goalkeeper': return 'ARQ'
    case 'Defender': return left ? 'LI' : right ? 'LD' : 'DC'
    case 'Wing Back': return left ? 'LI' : right ? 'LD' : 'DC'
    case 'Defensive Midfielder': return 'MCD'
    case 'Midfielder': return left ? 'VI' : right ? 'VD' : 'MC'
    case 'Attacking Midfielder': return left ? 'EI' : right ? 'ED' : 'MCO'
    case 'Striker': return 'DEL'
    default: return null
  }
}
/** Rol → grupo de comparación (percentiles dentro del grupo). */
const GROUP_OF = { ARQ: 'GK', DC: 'CB', LI: 'FB', LD: 'FB', MCD: 'CM', MC: 'CM', VI: 'WM', VD: 'WM', EI: 'WM', ED: 'WM', MCO: 'AM', DEL: 'ST' }
const GROUP_FROM_SQUAD = { Goalkeeper: 'GK', Defender: 'CB', Midfielder: 'CM', Attacker: 'ST', Forward: 'ST' }

// ─── Eventos (mapa de calor, pases progresivos) ─────────────────────────────

const TOUCH_TYPES = new Set([1, 2, 3, 4, 7, 8, 10, 11, 12, 13, 14, 15, 16, 41, 42, 44, 45, 49, 50, 51, 52, 54, 61, 74])
const DEF_TYPES = new Set([7, 8, 12, 49, 74])
const SET_PIECE_Q = new Set([5, 6, 107, 123, 124])
const GX = 12, GY = 8
const cell = (x, y) => Math.min(GX - 1, Math.floor(x / (100 / GX))) * GY + Math.min(GY - 1, Math.floor(y / (100 / GY)))
const goalDist = (x, y) => Math.hypot((100 - x) * 1.05, (50 - y) * 0.68)
const inBox = (x, y) => x >= 83 && y >= 21.1 && y <= 78.9

/**
 * Eventos de un partido (ma3) → por jugador: grilla de toques y de acciones
 * defensivas, pases progresivos / al último tercio / al área, posición media, y
 * los trazos de sus pases progresivos, pases clave (terminan en remate) y centros
 * para dibujarlos en la cancha. Versión 2: agrega los trazos.
 */
const EV_VERSION = 2
function deriveEvents(events) {
  const byPlayer = {}
  const P = id => (byPlayer[id] ??= { t: new Array(GX * GY).fill(0), d: new Array(GX * GY).fill(0), prog: 0, f3: 0, box: 0, n: 0, sx: 0, sy: 0, dn: 0, dsx: 0, pp: [], kp: [], cr: [] })
  // Pase de cada remate (calificador 55 = evento relacionado, mismo equipo).
  const passByKey = new Map()
  for (const e of events) if (e.typeId === 1 && e.playerId) passByKey.set(`${e.contestantId}|${e.eventId}`, e)
  const keyPass = new Map() // pase → 'G' (asistencia) | 'S' (pase clave)
  for (const e of events) {
    if (![13, 14, 15, 16].includes(e.typeId)) continue
    const rel = (e.qualifier ?? []).find(q => q.qualifierId === 55)?.value
    const pass = rel ? passByKey.get(`${e.contestantId}|${rel}`) : null
    if (pass) keyPass.set(pass, e.typeId === 16 ? 'G' : 'S')
  }
  for (const e of events) {
    if (!e.playerId || !TOUCH_TYPES.has(e.typeId)) continue
    const x = num(e.x), y = num(e.y)
    if (x <= 0 && y <= 0) continue
    const p = P(e.playerId)
    p.t[cell(x, y)]++
    p.n++; p.sx += x; p.sy += y
    if (DEF_TYPES.has(e.typeId) || (e.typeId === 44 && e.outcome === 1)) {
      p.d[cell(x, y)]++; p.dn++; p.dsx += x
    }
    if (e.typeId !== 1) continue
    const q = new Map((e.qualifier ?? []).map(qq => [qq.qualifierId, qq.value]))
    const ex = num(q.get(140)), ey = num(q.get(141))
    if (!ex && !ey) continue
    const seg = [r2(x), r2(y), r2(ex), r2(ey)]
    const kp = keyPass.get(e)
    if (kp) p.kp.push([...seg, kp === 'G' ? 1 : 0])
    if (q.has(2) && !q.has(6)) p.cr.push([...seg, e.outcome === 1 ? 1 : 0])
    if (e.outcome !== 1 || [...q.keys()].some(k => SET_PIECE_Q.has(k)) || q.has(2)) continue
    const d0 = goalDist(x, y), d1 = goalDist(ex, ey)
    if (x >= 40 && d0 - d1 >= Math.max(10, 0.25 * d0)) { p.prog++; p.pp.push(seg) }
    if (x < 66.7 && ex >= 66.7) p.f3++
    if (!inBox(x, y) && inBox(ex, ey)) p.box++
  }
  return byPlayer
}

// ─── Main ───────────────────────────────────────────────────────────────────

const t0 = Date.now()
console.log('Opta → temporada activa…')
const ot2 = await opta('tournamentcalendar/active/authorized')
const comp = ot2.competition.find(c => /argentin/i.test(c.country ?? '') || c.competitionCode === 'LPA') ?? ot2.competition[0]
const tc = comp.tournamentCalendar.find(t => t.active === 'yes') ?? comp.tournamentCalendar[0]
const TMCL = tc.id
console.log(`  ${comp.name} ${tc.name} (${TMCL})`)

console.log('Fixture, posiciones, planteles, ranking…')
const [ma1, tm2, tm3, tm14] = await Promise.all([
  opta(`match/?tmcl=${TMCL}&live=yes&_pgSz=1000`),
  opta(`standings/?tmcl=${TMCL}`),
  // Sin _pgSz Opta devuelve de a 20 planteles (y la liga tiene 30).
  opta(`squads/?tmcl=${TMCL}&detailed=yes&_pgSz=100`),
  opta(`seasonpowerrankings/?tmcl=${TMCL}`, { allow404: true }),
])

const allMatches = ma1.match ?? []
const played = allMatches.filter(m => m.liveData?.matchDetails?.matchStatus === 'Played')
console.log(`  ${allMatches.length} partidos, ${played.length} jugados`)

// Equipos
const teams = new Map()
for (const sq of tm3.squad ?? []) {
  teams.set(sq.contestantId, {
    id: sq.contestantId, name: sq.contestantClubName || sq.contestantName, short: sq.contestantShortName || sq.contestantName,
    code: sq.contestantCode, venue: sq.venueName ?? null,
    kit: (sq.teamKits?.kit ?? []).find(k => /^home$/i.test(k.type))?.shirtColour1 ?? null,
    kit2: (sq.teamKits?.kit ?? []).find(k => /^home$/i.test(k.type))?.shirtColour2 ?? null,
  })
}

// Por las dudas: un equipo que juega pero no vino en planteles se toma del fixture.
for (const m of allMatches) for (const c of m.matchInfo.contestant ?? []) {
  if (!teams.has(c.id)) teams.set(c.id, { id: c.id, name: c.officialName || c.name, short: c.shortName || c.name, code: c.code, venue: null, kit: null, kit2: null })
}

// Personas (planteles): ficha básica
const persons = new Map()
for (const sq of tm3.squad ?? []) {
  for (const p of sq.person ?? []) {
    if (p.type !== 'player') continue
    persons.set(p.id, {
      id: p.id,
      name: p.knownName || [p.shortFirstName || p.firstName, p.shortLastName || p.lastName].filter(Boolean).join(' '),
      fullName: [p.firstName, p.lastName].filter(Boolean).join(' '),
      matchName: p.matchName,
      teamId: sq.contestantId,
      squadPos: p.position ?? null,
      shirt: p.shirtNumber ?? null,
      dob: p.dateOfBirth ?? null,
      nat: p.nationality ?? null,
      nat2: p.secondNationality ?? null,
      height: p.height || null,
      weight: p.weight || null,
      foot: p.foot ?? null,
      joined: p.startDate ? p.startDate.replace('Z', '') : null,
      active: p.active !== 'no',
    })
  }
}
console.log(`  ${teams.size} equipos, ${persons.size} jugadores en planteles`)

// ─── Por partido: estadísticas (ma2), valor de posesión (ma30), eventos (ma3), xG (ma12) ──

/** Remates y xG de un partido (ma12): totales por jugador y equipo + cada remate con coordenadas. */
function compactXg(ma12) {
  const players = {}, team = {}
  for (const l of ma12?.liveData?.lineUp ?? []) {
    team[l.contestantId] = Object.fromEntries((l.stat ?? []).filter(s => /^expected/.test(s.type)).map(s => [s.type, num(s.value)]))
    for (const p of l.player ?? []) {
      const st = Object.fromEntries((p.stat ?? []).filter(s => /^expected/.test(s.type)).map(s => [s.type, num(s.value)]))
      if (Object.keys(st).length) players[p.playerId] = st
    }
  }
  const shots = []
  for (const e of ma12?.liveData?.event ?? []) {
    if (![13, 14, 15, 16].includes(e.typeId) || !e.playerId) continue
    const q = new Map((e.qualifier ?? []).map(qq => [qq.qualifierId, qq.value]))
    if (q.has(28)) continue // gol en contra
    const res = e.typeId === 16 ? 'G' : e.typeId === 14 ? 'P' : e.typeId === 13 ? 'M' : q.has(82) ? 'B' : 'S'
    const body = q.has(15) ? 'H' : q.has(72) ? 'L' : q.has(20) ? 'R' : 'O'
    const sit = q.has(9) ? 'PEN' : q.has(26) ? 'FK' : q.has(25) ? 'CK' : q.has(24) ? 'SP' : q.has(23) ? 'FB' : 'OP'
    shots.push([e.playerId, e.contestantId, r2(num(e.x)), r2(num(e.y)), r3(num(q.get(321))), res, e.timeMin, body, sit])
  }
  return { players, team, shots }
}

console.log('Partidos jugados (estadísticas + valor de posesión + eventos + xG)…')
const matchData = await pool(played, 6, async m => {
  const id = m.matchInfo.id
  const file = join(CACHE, 'match', `${id}.json`)
  if (cached(file)) {
    const c = readJson(file)
    if (c.v >= 3 && (SKIP_EVENTS || c.ev)) {
      if (!SKIP_EVENTS && c.evv !== EV_VERSION) {
        const ma3 = await opta(`matchevent/?fx=${id}`, { allow404: true })
        c.ev = ma3 ? deriveEvents(ma3.liveData?.event ?? []) : null
        c.evv = EV_VERSION
        if (!c.xg) c.xg = compactXg(await opta(`matchexpectedgoals/?fx=${id}`, { allow404: true }))
        writeFileSync(file, JSON.stringify(c))
        return c
      }
      if (c.xg) return c
      // Caché de antes de sumar el xG por partido: solo falta ma12.
      c.xg = compactXg(await opta(`matchexpectedgoals/?fx=${id}`, { allow404: true }))
      c.v = 4
      writeFileSync(file, JSON.stringify(c))
      return c
    }
  }
  const [ma2, ma30, ma3, ma12] = await Promise.all([
    opta(`matchstats/?detailed=yes&fx=${id}`),
    opta(`matchpossessionvalues/?fx=${id}`, { allow404: true }),
    SKIP_EVENTS ? null : opta(`matchevent/?fx=${id}`, { allow404: true }),
    opta(`matchexpectedgoals/?fx=${id}`, { allow404: true }),
  ])
  const pv = {}
  for (const c of ma30?.possessionValue?.[0]?.contestant ?? []) {
    for (const p of c.lineUp?.player ?? []) {
      const cats = {}
      for (const [k, v] of Object.entries(p.pvCategories ?? {})) cats[k] = num(Object.values(v)[0])
      pv[p.playerId] = cats
    }
  }
  const out = {
    v: 4,
    id,
    lineUp: (ma2.liveData?.lineUp ?? []).map(l => ({
      contestantId: l.contestantId,
      formation: l.formationUsed ?? null,
      stat: Object.fromEntries((l.stat ?? []).map(s => [s.type, num(s.value)])),
      player: (l.player ?? []).map(p => ({
        id: p.playerId, position: p.position, side: p.positionSide ?? null, sub: p.subPosition ?? null,
        stat: Object.fromEntries((p.stat ?? []).map(s => [s.type, num(s.value)])),
      })),
    })),
    pv,
    ev: ma3 ? deriveEvents(ma3.liveData?.event ?? []) : null,
    evv: EV_VERSION,
    xg: compactXg(ma12),
  }
  writeFileSync(file, JSON.stringify(out))
  return out
}, 'partidos')

// ─── Agregados por jugador ──────────────────────────────────────────────────

const agg = new Map() // playerId → {stats, roles, log, pv, ev, xg}
const A = id => {
  if (!agg.has(id)) agg.set(id, { stats: {}, roles: {}, log: [], pv: {}, xg: {}, ev: { t: new Array(GX * GY).fill(0), d: new Array(GX * GY).fill(0), prog: 0, f3: 0, box: 0, n: 0, sx: 0, sy: 0, dn: 0, dsx: 0, pp: [], kp: [], cr: [] }, teamMins: {} })
  return agg.get(id)
}
const matchInfoById = new Map(played.map(m => [m.matchInfo.id, m]))
const shots = {}
const xgMatchTeam = {}

for (const md of matchData) {
  for (const l of md.lineUp) {
    for (const p of l.player) {
      const mins = p.stat.minsPlayed ?? 0
      if (!mins) continue
      const a = A(p.id)
      for (const [k, v] of Object.entries(p.stat)) {
        if (k === 'formationPlace') continue
        a.stats[k] = (a.stats[k] ?? 0) + v
      }
      a.stats.appearances = (a.stats.appearances ?? 0) + 1
      a.teamMins[l.contestantId] = (a.teamMins[l.contestantId] ?? 0) + mins
      const role = p.position === 'Substitute' ? null : roleOf(p.position, p.side)
      if (role) a.roles[role] = (a.roles[role] ?? 0) + mins
      const pv = md.pv[p.id]
      if (pv) for (const [k, v] of Object.entries(pv)) a.pv[k] = (a.pv[k] ?? 0) + v
      const xg = md.xg?.players?.[p.id]
      if (xg) for (const [k, v] of Object.entries(xg)) a.xg[k] = (a.xg[k] ?? 0) + v
      const ev = md.ev?.[p.id]
      if (ev) {
        for (let i = 0; i < GX * GY; i++) { a.ev.t[i] += ev.t[i]; a.ev.d[i] += ev.d[i] }
        for (const k of ['prog', 'f3', 'box', 'n', 'sx', 'sy', 'dn', 'dsx']) a.ev[k] += ev[k]
        for (const k of ['pp', 'kp', 'cr']) for (const seg of ev[k] ?? []) a.ev[k].push([...seg, md.id])
      }
      a.log.push([
        md.id, l.contestantId, mins, p.stat.gameStarted ? 1 : 0, role,
        p.stat.goals ?? 0, p.stat.goalAssist ?? 0, p.stat.totalScoringAtt ?? 0,
        p.stat.accuratePass ?? 0, p.stat.totalPass ?? 0, p.stat.touches ?? 0,
        (p.stat.ballRecovery ?? 0) + (p.stat.interception ?? 0) + (p.stat.wonTackle ?? 0),
        pv ? r3(pv.totalPossessionValue ?? 0) : null, ev?.prog ?? null,
        r2(xg?.expectedGoals ?? 0), r2(xg?.expectedAssists ?? 0),
      ])
    }
  }
  for (const [cid, t] of Object.entries(md.xg?.team ?? {})) (xgMatchTeam[md.id] ??= {})[cid] = r2(t.expectedGoals ?? 0)
  for (const s of md.xg?.shots ?? []) {
    const [pid, , x, y, xg, res, min, body, sit] = s
    ;(shots[pid] ??= []).push([x, y, xg, res, min, md.id, body, sit])
  }
}
const xgByPlayer = new Map([...agg].map(([pid, a]) => [pid, a.xg]))

// ─── Contratos y carrera (por persona, con caché de 3 días) ─────────────────

const withMinutes = [...agg.keys()]
console.log(`Contratos y carrera de ${withMinutes.length} jugadores con minutos…`)
const personExtra = await pool(withMinutes, 6, async pid => {
  const file = join(CACHE, 'person', `${pid}.json`)
  if (cached(file, 72)) return readJson(file)
  const [pe12, pe2] = await Promise.all([
    opta(`playercontract/?prsn=${pid}`, { allow404: true }),
    opta(`playercareer/?prsn=${pid}`, { allow404: true }),
  ])
  const person = pe2?.person?.[0] ?? null
  const contracts = (pe12?.person?.[0]?.membership ?? []).flatMap(mb => (mb.contract ?? []).map(c => ({
    team: mb.contestantName, teamId: mb.contestantId, start: c.startDate?.replace('Z', '') ?? null, end: c.endDate?.replace('Z', '') ?? null,
    type: c.transferType ?? null,
  })))
  const career = (person?.membership ?? []).map(mb => ({
    team: mb.contestantShortName || mb.contestantName, teamId: mb.contestantId, national: mb.contestantType === 'national',
    from: mb.startDate?.replace('Z', '') ?? null, to: mb.endDate?.replace('Z', '') ?? null, transfer: mb.transferType ?? null, loan: /loan/i.test(mb.transferType ?? ''),
    seasons: (mb.stat ?? []).filter(s => s.isFriendly !== 'yes').map(s => [s.tournamentCalendarName, s.competitionName, num(s.appearances), num(s.minutesPlayed), num(s.goals), num(s.assists)]),
  }))
  const extra = {
    contracts, career,
    bio: person ? { dob: person.dateOfBirth ?? null, nat: person.nationality ?? null, height: person.height || null, weight: person.weight || null, foot: person.foot ?? null, birthPlace: person.placeOfBirth ?? null } : null,
  }
  writeFileSync(file, JSON.stringify(extra))
  return extra
}, 'jugadores')
const extraById = new Map(withMinutes.map((pid, i) => [pid, personExtra[i]]))

// ─── Armado final ───────────────────────────────────────────────────────────

const ageAt = (dob, ref = new Date()) => {
  if (!dob) return null
  const d = new Date(dob)
  let a = ref.getFullYear() - d.getFullYear()
  if (ref < new Date(ref.getFullYear(), d.getMonth(), d.getDate())) a--
  return a
}

// Columnas de estadísticas: todas las que aparecen, ordenadas.
const statCols = [...new Set([...agg.values()].flatMap(a => Object.keys(a.stats)))].sort()
const xgCols = [...new Set([...xgByPlayer.values()].flatMap(s => Object.keys(s)))].sort()
const pvCols = [...new Set([...agg.values()].flatMap(a => Object.keys(a.pv)))].sort()

const players = []
const heatmaps = {}
const matchlog = {}
const careers = {}
for (const [pid, a] of agg) {
  const base = persons.get(pid)
  const extra = extraById.get(pid)
  const mainTeam = Object.entries(a.teamMins).sort((x, y) => y[1] - x[1])[0]?.[0]
  const roles = Object.entries(a.roles).sort((x, y) => y[1] - x[1])
  const role = roles[0]?.[0] ?? null
  const group = role ? GROUP_OF[role] : GROUP_FROM_SQUAD[base?.squadPos] ?? 'CM'
  const today = new Date().toISOString().slice(0, 10)
  const contract = (extra?.contracts ?? [])
    .filter(c => !c.end || c.end >= today)
    .sort((x, y) => (y.start ?? '').localeCompare(x.start ?? ''))[0] ?? null
  const dob = base?.dob ?? extra?.bio?.dob ?? null
  const lastLog = [...a.log].sort((x, y) => (matchInfoById.get(y[0])?.matchInfo.date ?? '').localeCompare(matchInfoById.get(x[0])?.matchInfo.date ?? ''))
  players.push({
    id: pid,
    name: base?.name ?? lastLog[0]?.[0] ?? pid,
    fullName: base?.fullName ?? null,
    matchName: base?.matchName ?? null,
    teamId: base?.teamId ?? mainTeam ?? null,
    teams: Object.keys(a.teamMins),
    role, roles: roles.map(([r, m]) => [r, m]), group,
    squadPos: base?.squadPos ?? null,
    shirt: base?.shirt ?? null,
    dob, age: ageAt(dob),
    nat: base?.nat ?? extra?.bio?.nat ?? null,
    nat2: base?.nat2 ?? null,
    height: base?.height ?? extra?.bio?.height ?? null,
    weight: base?.weight ?? extra?.bio?.weight ?? null,
    foot: base?.foot ?? extra?.bio?.foot ?? null,
    birthPlace: extra?.bio?.birthPlace ?? null,
    joined: base?.joined ?? null,
    contractEnd: contract?.end ?? null,
    contractType: contract?.type ?? null,
    inSquad: Boolean(base),
    s: statCols.map(k => a.stats[k] ?? 0),
    x: xgCols.map(k => r3(xgByPlayer.get(pid)?.[k] ?? 0)),
    pv: pvCols.map(k => r3(a.pv[k] ?? 0)),
    ev: [a.ev.prog, a.ev.f3, a.ev.box, a.ev.n ? r2(a.ev.sx / a.ev.n) : null, a.ev.n ? r2(a.ev.sy / a.ev.n) : null, a.ev.dn ? r2(a.ev.dsx / a.ev.dn) : null],
  })
  if (a.ev.n) heatmaps[pid] = { t: a.ev.t, d: a.ev.d, pp: a.ev.pp, kp: a.ev.kp, cr: a.ev.cr }
  matchlog[pid] = a.log.sort((x, y) => (matchInfoById.get(x[0])?.matchInfo.date ?? '').localeCompare(matchInfoById.get(y[0])?.matchInfo.date ?? ''))
  if (extra?.career?.length) careers[pid] = extra.career
}

// Equipos: estadísticas de temporada (suma de sus partidos) + xG + ranking
const teamAgg = {}
for (const md of matchData) for (const l of md.lineUp) {
  const t = (teamAgg[l.contestantId] ??= { games: 0, stat: {}, formations: {} })
  t.games++
  for (const [k, v] of Object.entries(l.stat)) if (k !== 'formationUsed') t.stat[k] = (t.stat[k] ?? 0) + v
  if (l.formation) t.formations[l.formation] = (t.formations[l.formation] ?? 0) + 1
}
const power = new Map((tm14?.division?.[0]?.ranking ?? []).map(r => [r.contestantId, { rank: num(r.rank), rating: r2(num(r.currentRating)) }]))
const teamStatCols = [...new Set(Object.values(teamAgg).flatMap(t => Object.keys(t.stat)))].sort()

// xG a favor / en contra por equipo (de los remates deduplicados)
const xgFor = {}, xgAgainst = {}, matchTeams = new Map(played.map(m => [m.matchInfo.id, m.matchInfo.contestant.map(c => c.id)]))
for (const [mid, byTeam] of Object.entries(xgMatchTeam)) {
  const [h, aw] = matchTeams.get(mid) ?? []
  for (const [tid, v] of Object.entries(byTeam)) {
    xgFor[tid] = (xgFor[tid] ?? 0) + v
    const opp = tid === h ? aw : h
    if (opp) xgAgainst[opp] = (xgAgainst[opp] ?? 0) + v
  }
}

const teamsOut = [...teams.values()].map(t => ({
  ...t,
  games: teamAgg[t.id]?.games ?? 0,
  formation: Object.entries(teamAgg[t.id]?.formations ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
  s: teamStatCols.map(k => teamAgg[t.id]?.stat[k] ?? 0),
  xgFor: r2(xgFor[t.id] ?? 0),
  xgAgainst: r2(xgAgainst[t.id] ?? 0),
  power: power.get(t.id) ?? null,
}))

// Posiciones: por fase (Apertura/Clausura, zonas) y tabla anual
const standings = (tm2.stage ?? []).map(st => ({
  name: st.name,
  tables: (st.division ?? []).filter(d => d.type === 'total' || d.type === 'championship' || d.type === 'relegation').map(d => ({
    type: d.type, group: d.groupName ?? d.groupId ?? null,
    rows: (d.ranking ?? []).map(r => ({
      rank: r.rank, teamId: r.contestantId, pts: num(r.points), pj: num(r.matchesPlayed), w: num(r.matchesWon), d: num(r.matchesDrawn), l: num(r.matchesLost),
      gf: num(r.goalsFor), ga: num(r.goalsAgainst), status: r.rankStatus ?? null, avg: r.average ?? null,
    })),
  })),
}))

const matchesOut = allMatches.map(m => {
  const mi = m.matchInfo, ld = m.liveData?.matchDetails ?? {}
  const [h, a] = mi.contestant
  const sc = ld.scores?.total ?? ld.scores?.ft ?? null
  return {
    id: mi.id, date: mi.date?.replace('Z', ''), time: mi.time?.replace('Z', '') || null, week: mi.week ?? null, stage: mi.stage?.name ?? null,
    status: ld.matchStatus ?? null, home: h?.id, away: a?.id,
    hs: sc ? num(sc.home) : null, as: sc ? num(sc.away) : null,
    hxg: xgMatchTeam[mi.id]?.[h?.id] ?? null, axg: xgMatchTeam[mi.id]?.[a?.id] ?? null,
    venue: mi.venue?.shortName ?? null,
  }
})

const meta = {
  competition: comp.name, competitionId: comp.id, season: tc.name, tmcl: TMCL,
  updatedAt: new Date().toISOString(), played: played.length, total: allMatches.length,
  players: players.length, teams: teamsOut.length,
  statCols, xgCols, pvCols, teamStatCols,
  evCols: ['prog', 'f3', 'box', 'avgX', 'avgY', 'defX'],
  logCols: ['match', 'team', 'min', 'start', 'role', 'goals', 'assists', 'shots', 'passOk', 'passes', 'touches', 'recoveries', 'pv', 'prog', 'xg', 'xa'],
  grid: [GX, GY],
  power: tm14?.tournamentCalendar ? { globalRank: tm14.tournamentCalendar.globalCompRank ?? null, confRank: tm14.tournamentCalendar.confederationCompRank ?? null } : null,
}

const blocks = { meta, teams: { teams: teamsOut, standings }, players, matches: matchesOut, shots, heatmaps, matchlog, careers }
for (const [k, v] of Object.entries(blocks)) {
  const json = JSON.stringify(v)
  writeFileSync(join(OUT, `${k}.json`), json)
  console.log(`  ${k}: ${(json.length / 1024).toFixed(0)} KB (${(gzipSync(json).length / 1024).toFixed(0)} KB gzip)`)
}

if (!NO_UPLOAD) {
  console.log('Subiendo a Supabase…')
  for (const [k, v] of Object.entries(blocks)) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/opta_snapshot?on_conflict=key`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ key: k, data: v, updated_at: new Date().toISOString() }),
    })
    if (!res.ok) throw new Error(`Supabase ${k}: ${res.status} ${await res.text()}`)
    console.log(`  ✓ ${k}`)
  }
}
console.log(`Listo en ${((Date.now() - t0) / 1000).toFixed(0)} s, ${calls} llamadas a Opta.`)
