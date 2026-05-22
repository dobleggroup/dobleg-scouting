// supabase/functions/_shared/sofascore.ts

const BASE_URL = 'https://api.sofascore.com/api/v1';

export const SOFASCORE_TOURNAMENTS: Record<number, number> = {
  131: 703, // Argentina Primera Nacional
  268: 278, // Uruguay Primera División
};

const ID_OFFSET = 20_000_000;
export function sofascoreTeamId(id: number): number { return id + ID_OFFSET; }
export function sofascorePlayerId(id: number): number { return id + ID_OFFSET; }
export function sofascoreFixtureId(id: number): number { return id + ID_OFFSET; }

const HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  'Referer': 'https://www.sofascore.com/',
};

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let lastRequestTime = 0;
const MIN_INTERVAL = 3000;

async function sofascoreFetch<T>(path: string): Promise<T> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL) {
    await delay(MIN_INTERVAL - elapsed);
  }

  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, { headers: HEADERS });
  lastRequestTime = Date.now();

  if (res.status === 403) throw new Error('SOFASCORE_BLOCKED');
  if (res.status === 404) throw new Error('SOFASCORE_NOT_FOUND');

  if (!res.ok) {
    throw new Error(`Sofascore ${res.status}: ${await res.text()}`);
  }

  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('json')) throw new Error('SOFASCORE_BLOCKED');

  return await res.json();
}

// ─── Types ───────────────────────────────────────────────────────

export interface SofascoreSeason {
  id: number;
  name: string;
  year: string;
}

export interface SofascoreEvent {
  id: number;
  tournament: { uniqueTournament: { id: number } };
  season: { id: number };
  homeTeam: { id: number; name: string; slug: string };
  awayTeam: { id: number; name: string; slug: string };
  homeScore: { current: number };
  awayScore: { current: number };
  status: { code: number; type: string };
  startTimestamp: number;
}

export interface SofascorePlayerStats {
  minutesPlayed?: number;
  goals?: number;
  goalAssist?: number;
  totalPass?: number;
  accuratePass?: number;
  keyPass?: number;
  totalTackle?: number;
  interceptionWon?: number;
  blockedScoringAttempt?: number;
  duelWon?: number;
  duelLost?: number;
  totalContest?: number;
  wonContest?: number;
  onTargetScoringAttempt?: number;
  shotOffTarget?: number;
  wasFouled?: number;
  fouls?: number;
  rating?: number;
  saves?: number;
  goalsConceded?: number;
  expectedGoals?: number;
  expectedAssists?: number;
  [key: string]: number | undefined;
}

export interface SofascoreLineupPlayer {
  player: { id: number; name: string; slug?: string; shortName?: string; position: string };
  shirtNumber: number;
  position: string;
  substitute: boolean;
  statistics: SofascorePlayerStats;
  captain?: boolean;
}

export interface SofascoreLineups {
  confirmed: boolean;
  home: { players: SofascoreLineupPlayer[]; formation: string };
  away: { players: SofascoreLineupPlayer[]; formation: string };
}

export interface SofascoreIncident {
  incidentType: string;
  incidentClass?: string;
  player?: { id: number; name?: string };
  time: number;
  isHome?: boolean;
}

// ─── API calls ───────────────────────────────────────────────────

export async function fetchCurrentSeason(tournamentId: number, year = 2026): Promise<SofascoreSeason> {
  const data = await sofascoreFetch<{ seasons: SofascoreSeason[] }>(
    `/unique-tournament/${tournamentId}/seasons`,
  );
  const season = data.seasons.find(s => s.year === String(year));
  if (!season) throw new Error(`No ${year} season for tournament ${tournamentId}`);
  return season;
}

export async function fetchPastEvents(
  tournamentId: number,
  seasonId: number,
  pages = 3,
): Promise<SofascoreEvent[]> {
  const events: SofascoreEvent[] = [];

  for (let page = 0; page < pages; page++) {
    try {
      const data = await sofascoreFetch<{ events: SofascoreEvent[]; hasNextPage?: boolean }>(
        `/unique-tournament/${tournamentId}/season/${seasonId}/events/last/${page}`,
      );
      events.push(...data.events.filter(e => e.status.type === 'finished'));
      if (!data.hasNextPage) break;
    } catch (err) {
      if ((err as Error).message === 'SOFASCORE_NOT_FOUND') break;
      throw err;
    }
  }

  return events;
}

export async function fetchEventLineups(eventId: number): Promise<SofascoreLineups> {
  return sofascoreFetch<SofascoreLineups>(`/event/${eventId}/lineups`);
}

export async function fetchEventIncidents(eventId: number): Promise<SofascoreIncident[]> {
  const data = await sofascoreFetch<{ incidents: SofascoreIncident[] }>(`/event/${eventId}/incidents`);
  return data.incidents;
}

export function sofascoreTeamLogo(rawId: number): string {
  return `https://api.sofascore.com/api/v1/team/${rawId}/image`;
}

export function sofascorePlayerPhoto(rawId: number): string {
  return `https://api.sofascore.com/api/v1/player/${rawId}/image`;
}
