// supabase/functions/_shared/api-football.ts

const API_KEY = Deno.env.get('API_FOOTBALL_KEY')!;
const BASE_URL = Deno.env.get('API_FOOTBALL_BASE_URL') || 'https://v3.football.api-sports.io';

async function apiFetch<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  const url = new URL(endpoint, BASE_URL);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: { 'x-apisports-key': API_KEY },
  });

  if (res.status === 429) {
    throw new Error('RATE_LIMITED');
  }

  if (!res.ok) {
    throw new Error(`API-Football ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();
  return json.response as T;
}

export async function fetchFinishedFixtures(
  leagueId: number,
  season: number,
  fromDate: string,
  toDate: string
) {
  return apiFetch<Array<{ fixture: { id: number; date: string; status: { short: string } }; league: { id: number; season: number }; teams: { home: { id: number; name: string; logo: string }; away: { id: number; name: string; logo: string } }; goals: { home: number | null; away: number | null } }>>('/fixtures', {
    league: String(leagueId),
    season: String(season),
    from: fromDate,
    to: toDate,
    status: 'FT-AET-PEN',
  });
}

export async function fetchLineups(fixtureId: number) {
  return apiFetch<Array<{ team: { id: number; name: string }; formation: string | null; startXI: Array<{ player: { id: number; name: string; number: number; pos: string; grid: string | null } }>; substitutes: Array<{ player: { id: number; name: string; number: number; pos: string; grid: string | null } }> }>>('/fixtures/lineups', {
    fixture: String(fixtureId),
  });
}

export async function fetchFixturePlayers(fixtureId: number) {
  return apiFetch<Array<{ team: { id: number }; players: Array<{ player: { id: number; name: string; photo: string }; statistics: Array<{ games: { minutes: number | null; number: number | null; position: string | null; rating: string | null; captain: boolean; substitute: boolean }; offsides: number | null; shots: { total: number | null; on: number | null }; goals: { total: number | null; conceded: number | null; assists: number | null; saves: number | null }; passes: { total: number | null; key: number | null; accuracy: string | null }; tackles: { total: number | null; blocks: number | null; interceptions: number | null }; duels: { total: number | null; won: number | null }; dribbles: { attempts: number | null; success: number | null; past: number | null }; fouls: { drawn: number | null; committed: number | null }; cards: { yellow: number; yellowred: number; red: number }; penalty: { won: number | null; committed: number | null; scored: number | null; missed: number | null; saved: number | null } }> }> }>>('/fixtures/players', {
    fixture: String(fixtureId),
  });
}

export async function fetchLeagueInfo(leagueId: number, season: number) {
  return apiFetch<Array<{ league: { id: number; name: string }; country: { name: string }; seasons: Array<{ year: number; coverage: { fixtures: { statistics_players: boolean } } }> }>>('/leagues', {
    id: String(leagueId),
    season: String(season),
  });
}
