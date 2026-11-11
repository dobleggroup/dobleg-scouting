import { supabase } from '@/lib/supabase'
import { matchRosterName } from './parser/matchPlayers'
import { stripAccents } from './parser/normalize'
import { KNOWN_COMPETITIONS } from './competitions'
import type { AgencyPlayer } from '@/constants/agencyPlayers'

export interface FixtureSuggestion {
  matchDate: string
  competencia: string | null
  minutos: number | null
}

const norm = (s: string) => stripAccents(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

/** Palabras que no distinguen a un club de otro ("Universidad de Chile" ≠ "Universidad de Concepción"). */
const GENERIC = new Set(['universidad', 'deportes', 'deportivo', 'club', 'de', 'la', 'el', 'del', 'cd', 'ca', 'fc', 'sc', 'unido', 'u', 'atletico'])
const tokens = (s: string) => norm(s).split(' ').filter(t => t.length >= 3 && !GENERIC.has(t))

function sameClub(a: string, b: string): boolean {
  const ta = tokens(a)
  const tb = new Set(tokens(b))
  return ta.length > 0 && ta.some(t => tb.has(t) || [...tb].some(x => x.startsWith(t) || t.startsWith(x)))
}

/** Liga de la base → nombre de competencia como se carga en GPS ("Primera División Chile"). */
export function competitionName(league: { name: string; country: string | null }): string {
  const name = norm(league.name)
  const country = norm(league.country ?? '')
  const international = !country || ['world', 'south america', 'europe'].includes(country)
  const known = international
    ? KNOWN_COMPETITIONS.find(c => norm(c).includes(name) || name.includes(norm(c)))
    : KNOWN_COMPETITIONS.find(c => norm(c) === `${name} ${country}`)
  return known ?? (international ? league.name : `${league.name} ${league.country}`)
}

/**
 * Los informes de club no traen fecha: se busca el partido en el fixture del equipo
 * por resultado y rival (el más reciente que coincida) y, si está, los minutos que
 * jugó el jugador. Sin coincidencia segura devuelve null y la fecha se carga a mano.
 */
export async function suggestFixture(opts: {
  teamId: number
  rival: string
  resultado: string
  player: AgencyPlayer
  today?: Date
}): Promise<FixtureSuggestion | null> {
  const score = /^(\d+)\s*-\s*(\d+)$/.exec(opts.resultado.trim())
  if (!score) return null
  const [own, other] = [Number(score[1]), Number(score[2])]
  const today = opts.today ?? new Date()
  const from = new Date(today.getTime() - 200 * 86400000).toISOString()

  const { data, error } = await supabase
    .from('fixtures')
    .select('id, date, home_team_id, away_team_id, score_home, score_away, home:home_team_id(name), away:away_team_id(name), league:league_id(name, country)')
    .or(`home_team_id.eq.${opts.teamId},away_team_id.eq.${opts.teamId}`)
    .gte('date', from)
    .lte('date', today.toISOString())
    .order('date', { ascending: false })
  if (error || !data) return null

  type Row = {
    id: number; date: string; home_team_id: number; away_team_id: number; score_home: number | null; score_away: number | null
    home: { name: string } | null; away: { name: string } | null; league: { name: string; country: string | null } | null
  }
  const candidates = (data as unknown as Row[]).filter(f => {
    const home = f.home_team_id === opts.teamId
    const [g, r] = home ? [f.score_home, f.score_away] : [f.score_away, f.score_home]
    return g === own && r === other
  })
  const withRival = candidates.filter(f => sameClub(opts.rival, (f.home_team_id === opts.teamId ? f.away : f.home)?.name ?? ''))
  const fixture = withRival[0] ?? (tokens(opts.rival).length === 0 ? candidates[0] : undefined)
  if (!fixture) return null

  let minutos: number | null = null
  const { data: stats } = await supabase
    .from('player_match_stats')
    .select('minutes, players:player_id(name)')
    .eq('fixture_id', fixture.id)
    .eq('team_id', opts.teamId)
  for (const s of (stats ?? []) as unknown as { minutes: number | null; players: { name: string } | null }[]) {
    if (s.players && s.minutes && matchRosterName(s.players.name, [opts.player]).length > 0) { minutos = s.minutes; break }
  }

  return {
    // Fecha local (la base guarda UTC: un partido de las 22 h quedaría al día siguiente).
    matchDate: new Date(fixture.date).toLocaleDateString('en-CA'),
    competencia: fixture.league ? competitionName(fixture.league) : null,
    minutos,
  }
}
