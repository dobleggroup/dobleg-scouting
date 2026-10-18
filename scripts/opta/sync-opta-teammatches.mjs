#!/usr/bin/env node
/**
 * Test Opta: estadísticas de EQUIPO partido por partido y alineaciones, para el
 * análisis colectivo (Entrenadores → "Leonardo Ponzio · Test Opta"). No llama a
 * Opta: lee lo que ya bajó scripts/opta/sync-opta.mjs en scripts/opta/.cache, así
 * que hay que correrlo después de ese.
 *
 * Uso (desde la raíz del repo):
 *   scripts\secrets.bat && node scripts/opta/sync-opta.mjs && node scripts/opta/sync-opta-teammatches.mjs
 *   Flags: --no-upload
 *
 * Guarda una fila en `opta_snapshot` con key 'teammatch'.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const CACHE = join(HERE, '.cache')
const OUT = join(CACHE, 'out')
const KEY = 'teammatch'
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
const SUPABASE_URL = env('SUPABASE_URL') || env('VITE_SUPABASE_URL')
const SUPABASE_KEY = env('SUPABASE_SERVICE_KEY')
if (!NO_UPLOAD && (!SUPABASE_URL || !SUPABASE_KEY)) throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY (o usá --no-upload)')

/** Estadísticas de equipo por partido que usa la app (las que no vienen en un partido valen 0). */
const COLS = [
  'goals', 'goalsConceded', 'possessionPercentage', 'ppda',
  'totalScoringAtt', 'ontargetScoringAtt', 'attemptsIbox', 'attemptsObox', 'attOpenplay', 'attSetpiece', 'shotFastbreak',
  'bigChanceCreated', 'bigChanceMissed', 'bigChanceScored',
  'totalPass', 'accuratePass', 'fwdPass', 'totalFinalThirdPasses', 'successfulFinalThirdPasses',
  'totalLongBalls', 'accurateLongBalls', 'totalCrossNocorner', 'accurateCrossNocorner', 'totalThroughBall',
  'penAreaEntries', 'touchesInOppBox', 'progressiveCarries', 'wonContest', 'totalContest', 'wonCorners', 'totalOffside',
  'possWonAtt3rd', 'possWonMid3rd', 'possWonDef3rd', 'ballRecovery', 'totalTackle', 'wonTackle', 'interception',
  'totalClearance', 'aerialWon', 'aerialLost', 'duelWon', 'duelLost', 'fkFoulLost', 'totalYellowCard', 'totalRedCard', 'saves',
  'possLostAll',
]

/**
 * Estilo de juego por partido, de los eventos de cada jugador (grilla 12×8 de toques y de
 * acciones defensivas; x 0-100 hacia el arco rival, y 0-100 de banda derecha a izquierda):
 *   blockX   altura media de todas sus acciones defensivas (dónde recupera / defiende)
 *   lineX    altura media de las acciones defensivas de sus defensores (línea defensiva)
 *   highDef  % de acciones defensivas en campo rival (presión alta)
 *   tilt     % de los toques en el último tercio del partido que son suyos (dominio territorial)
 *   ftL/ftC/ftR  toques en el último tercio por la izquierda / el medio / la derecha
 */
const STYLE_COLS = ['blockX', 'lineX', 'highDef', 'tilt', 'ftL', 'ftC', 'ftR']
const GX = 12, GY = 8

function styleOf(c, teamId, oppId) {
  const lu = new Map((c.lineUp ?? []).map(l => [l.contestantId, l]))
  const ev = c.ev ?? {}
  const sum = (tid) => {
    const out = { dn: 0, dsx: 0, ldn: 0, ldsx: 0, high: 0, ft: 0, L: 0, C: 0, R: 0 }
    for (const p of lu.get(tid)?.player ?? []) {
      const e = ev[p.id]
      if (!e) continue
      out.dn += e.dn; out.dsx += e.dsx
      if (/Defender|Wing Back/.test(p.position ?? '')) { out.ldn += e.dn; out.ldsx += e.dsx }
      e.d.forEach((v, i) => { if (Math.floor(i / GY) >= GX / 2) out.high += v })
      e.t.forEach((v, i) => {
        if (Math.floor(i / GY) < 8) return // último tercio = columnas 8-11
        out.ft += v
        const row = i % GY
        if (row <= 2) out.R += v; else if (row >= 5) out.L += v; else out.C += v
      })
    }
    return out
  }
  const a = sum(teamId), b = sum(oppId)
  const r1 = v => Math.round(v * 10) / 10
  return [
    a.dn ? r1(a.dsx / a.dn) : 0,
    a.ldn ? r1(a.ldsx / a.ldn) : 0,
    a.dn ? r1((a.high / a.dn) * 100) : 0,
    a.ft + b.ft ? r1((a.ft / (a.ft + b.ft)) * 100) : 0,
    a.L, a.C, a.R,
  ]
}

const matches = JSON.parse(readFileSync(join(OUT, 'matches.json'), 'utf8')).filter(m => m.status === 'Played')
const rows = []
const lineups = {}
let missing = 0
for (const m of matches) {
  const file = join(CACHE, 'match', `${m.id}.json`)
  if (!existsSync(file)) { missing++; continue }
  const c = JSON.parse(readFileSync(file, 'utf8'))
  const xgTeam = c.xg?.team ?? {}
  lineups[m.id] = {}
  const ids = (c.lineUp ?? []).map(l => l.contestantId)
  for (const l of c.lineUp ?? []) {
    const r2 = v => Math.round(v * 100) / 100
    const opp = ids.find(id => id !== l.contestantId)
    const style = c.ev ? styleOf(c, l.contestantId, opp) : STYLE_COLS.map(() => 0)
    rows.push([m.id, l.contestantId, l.formation ?? null, r2(xgTeam[l.contestantId]?.expectedGoals ?? 0), ...COLS.map(k => r2(l.stat?.[k] ?? 0)), ...style])
    // [jugador, lugar en la formación (1-11, 0 = suplente), minutos, titular 1/0, x media, y media]
    lineups[m.id][l.contestantId] = (l.player ?? [])
      .filter(p => (p.stat?.minsPlayed ?? 0) > 0)
      .map(p => {
        const e = c.ev?.[p.id]
        const pos = e?.n ? [Math.round(e.sx / e.n), Math.round(e.sy / e.n)] : [null, null]
        return [p.id, p.stat?.formationPlace ?? 0, p.stat?.minsPlayed ?? 0, p.position === 'Substitute' ? 0 : 1, ...pos]
      })
  }
}

const data = { updatedAt: new Date().toISOString(), cols: ['xg', ...COLS, ...STYLE_COLS], rows, lineups }
const json = JSON.stringify(data)
writeFileSync(join(OUT, `${KEY}.json`), json)
console.log(`${KEY}: ${(json.length / 1024).toFixed(0)} KB · ${rows.length} filas de equipo en ${matches.length - missing} partidos${missing ? ` (${missing} sin caché)` : ''}`)

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
  console.log('  ✓ subido a Supabase')
}
