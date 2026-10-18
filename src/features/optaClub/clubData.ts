/**
 * Test Opta de un club fuera de la prueba (Temperley, Primera Nacional): plantel,
 * carreras y los que pasaron por el club, como los guarda
 * scripts/opta/sync-opta-club.mjs en `opta_snapshot` (key 'club_temperley').
 * Acá solo hay funciones puras: qué jugó cada uno, quién surgió del club, altas y bajas.
 */

/** [temporada, competición, partidos, minutos, goles, asistencias, amarillas, rojas, entró de suplente, banco sin entrar] */
export type PlayerSeason = [string, string, number, number, number, number, number, number, number, number]
/** [temporada, competición, ganados, empatados, perdidos] */
export type CoachSeason = [string, string, number, number, number]

export interface CareerSpell {
  team: string
  teamId: string
  national: boolean
  role: string
  from: string | null
  to: string | null
  active: boolean
  transfer: string | null
  seasons: Array<PlayerSeason | CoachSeason>
}

export interface ClubPerson {
  id: string
  name: string
  fullName: string
  matchName: string | null
  position: string | null
  dob: string | null
  nat: string | null
  birthPlace: string | null
  height: number | null
  weight: number | null
  foot: string | null
  joined?: string | null
  career: CareerSpell[]
}

export interface ClubSnapshot {
  updatedAt: string
  team: { id: string; name: string; short: string; nickname: string | null; venue: string | null }
  coach: ClubPerson | null
  squad: ClubPerson[]
  alumni: ClubPerson[]
}

export const POSITION_LABEL: Record<string, string> = {
  Goalkeeper: 'Arquero', Defender: 'Defensor', Midfielder: 'Volante', Attacker: 'Delantero', Forward: 'Delantero',
}
export const POSITION_ORDER = ['Goalkeeper', 'Defender', 'Midfielder', 'Attacker']
export const positionLabel = (p: string | null) => (p ? POSITION_LABEL[p] ?? p : '—')
export const positionRank = (p: string | null) => {
  const i = POSITION_ORDER.indexOf(p === 'Forward' ? 'Attacker' : p ?? '')
  return i < 0 ? 9 : i
}

/** "2013/2014" → 2013, "2026" → 2026. */
export const seasonYear = (label: string) => Number(label.slice(0, 4)) || 0

const CUP_RE = /copa|cup|libertadores|sudamericana|super|trofeo|recopa|shield|play-off/i
export const isCup = (competition: string) => CUP_RE.test(competition)

const playerSpells = (p: ClubPerson) => p.career.filter(s => s.role === 'player' && !s.national)

export interface Debut { team: string; teamId: string; season: string; competition: string }

/**
 * Primer club donde jugó un partido oficial (la definición de la agencia de "surgido
 * del club": debutó en Primera en ese club). Se ordena por temporada y, dentro de la
 * misma temporada, por la fecha en que llegó al club.
 */
export function debutOf(p: ClubPerson): Debut | null {
  let best: { year: number; from: string; d: Debut } | null = null
  for (const s of playerSpells(p)) {
    for (const row of s.seasons as PlayerSeason[]) {
      if (row[2] <= 0) continue
      const year = seasonYear(row[0])
      const from = s.from ?? '9999'
      if (!best || year < best.year || (year === best.year && from < best.from)) {
        best = { year, from, d: { team: s.team, teamId: s.teamId, season: row[0], competition: row[1] } }
      }
    }
  }
  return best?.d ?? null
}

export const isHomegrown = (p: ClubPerson, teamId: string) => debutOf(p)?.teamId === teamId

export interface SeasonLine {
  apps: number; starts: number; minutes: number; goals: number; assists: number
  yellow: number; red: number; subIn: number; bench: number
}
const EMPTY: SeasonLine = { apps: 0, starts: 0, minutes: 0, goals: 0, assists: 0, yellow: 0, red: 0, subIn: 0, bench: 0 }

/** Suma de una temporada. `teamId` null = en cualquier club; `competition` puede ser un nombre o 'liga' (todo lo que no es copa). */
export function seasonLine(p: ClubPerson, season: string, opts: { teamId?: string | null; competition?: string } = {}): SeasonLine {
  const out = { ...EMPTY }
  for (const s of playerSpells(p)) {
    if (opts.teamId && s.teamId !== opts.teamId) continue
    for (const row of s.seasons as PlayerSeason[]) {
      if (row[0] !== season) continue
      if (opts.competition === 'liga' ? isCup(row[1]) : opts.competition && row[1] !== opts.competition) continue
      out.apps += row[2]; out.minutes += row[3]; out.goals += row[4]; out.assists += row[5]
      out.yellow += row[6]; out.red += row[7]; out.subIn += row[8]; out.bench += row[9]
    }
  }
  out.starts = Math.max(0, out.apps - out.subIn)
  return out
}

/** Club donde está hoy (el tramo activo más reciente) y la liga donde más jugó en su última temporada. */
export function currentClub(p: ClubPerson): { team: string; teamId: string; loan: boolean; league: string | null; season: string | null } | null {
  const active = playerSpells(p).filter(s => s.active).sort((a, b) => (b.from ?? '').localeCompare(a.from ?? ''))[0]
  if (!active) return null
  const rows = (active.seasons as PlayerSeason[]).filter(r => !isCup(r[1]))
  const lastYear = Math.max(0, ...rows.map(r => seasonYear(r[0])))
  const last = rows.filter(r => seasonYear(r[0]) === lastYear).sort((a, b) => b[3] - a[3])[0] ?? null
  return { team: active.team, teamId: active.teamId, loan: active.transfer === 'Loan', league: last?.[1] ?? null, season: last?.[0] ?? null }
}

export interface CoachRecord { competition: string; season: string; played: number; won: number; drawn: number; lost: number; points: number; efficiency: number }

/** Partidos dirigidos por temporada y competición en un club (o en todos si teamId es null). */
export function coachRecords(coach: ClubPerson, teamId: string | null): Array<CoachRecord & { team: string }> {
  const out: Array<CoachRecord & { team: string }> = []
  for (const s of coach.career) {
    if (s.role !== 'coach' || (teamId && s.teamId !== teamId)) continue
    for (const row of s.seasons as CoachSeason[]) {
      const [season, competition, won, drawn, lost] = row
      const played = won + drawn + lost
      if (!played) continue
      out.push({ team: s.team, season, competition, played, won, drawn, lost, points: won * 3 + drawn, efficiency: Math.round(((won * 3 + drawn) / (played * 3)) * 100) })
    }
  }
  return out.sort((a, b) => seasonYear(b.season) - seasonYear(a.season) || b.played - a.played)
}

export interface Move { person: ClubPerson; other: string | null; date: string | null; loan: boolean; back: boolean }

/**
 * Altas y bajas del año: los del plantel que llegaron desde el 1/12 del año anterior
 * (y de dónde venían) y los que se fueron en ese período (y a dónde).
 */
export function movesOfYear(snap: ClubSnapshot, year: number): { arrivals: Move[]; departures: Move[] } {
  const since = `${year - 1}-12-01`
  const teamId = snap.team.id
  const arrivals: Move[] = []
  for (const p of snap.squad) {
    const here = playerSpells(p).filter(s => s.teamId === teamId && s.active).sort((a, b) => (b.from ?? '').localeCompare(a.from ?? ''))[0]
    if (!here?.from || here.from < since) continue
    const prev = playerSpells(p)
      .filter(s => s !== here && (s.to ?? s.from ?? '') <= here.from! && s.from !== here.from)
      .sort((a, b) => (b.to ?? b.from ?? '').localeCompare(a.to ?? a.from ?? ''))[0]
    arrivals.push({ person: p, other: prev?.team ?? null, date: here.from, loan: here.transfer === 'Loan', back: here.transfer === 'Back from Loan' })
  }
  const departures: Move[] = []
  for (const p of snap.alumni) {
    const left = playerSpells(p).filter(s => s.teamId === teamId && s.to).sort((a, b) => b.to!.localeCompare(a.to!))[0]
    if (!left?.to || left.to < since || left.to > `${year}-12-31`) continue
    const next = playerSpells(p)
      .filter(s => s.teamId !== teamId && (s.from ?? '') >= addDays(left.to!, -45))
      .sort((a, b) => (a.from ?? '').localeCompare(b.from ?? ''))[0]
    departures.push({ person: p, other: next?.team ?? null, date: left.to, loan: next?.transfer === 'Loan', back: next?.transfer === 'Back from Loan' })
  }
  const byDate = (a: Move, b: Move) => (b.date ?? '').localeCompare(a.date ?? '')
  return { arrivals: arrivals.sort(byDate), departures: departures.sort(byDate) }
}

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Edad cumplida a una fecha (hoy por defecto). */
export function ageOn(dob: string | null, on = new Date()): number | null {
  if (!dob) return null
  const d = new Date(`${dob.slice(0, 10)}T00:00:00`)
  let a = on.getFullYear() - d.getFullYear()
  if (on < new Date(on.getFullYear(), d.getMonth(), d.getDate())) a--
  return a
}

/** Sin acentos ni mayúsculas, para cruzar nombres entre Opta y nuestra base. */
export const normName = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()
