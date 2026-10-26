// supabase/functions/_shared/api-football.ts

import { apiResponseError } from './api-response.ts';
import { getSupabaseAdmin } from './supabase-client.ts';

const API_KEY = Deno.env.get('API_FOOTBALL_KEY')!;
const BASE_URL = Deno.env.get('API_FOOTBALL_BASE_URL') || 'https://v3.football.api-sports.io';

// El cupo diario lo comparten otras plataformas. Cada proceso dice qué tan
// importante es: los partidos y las estadísticas (lo que se ve en el Inicio)
// siguen hasta el 95 %; lo que puede esperar (nacionalidades, revisiones,
// cargas de temporadas) se frena al 50 % y sigue cuando el cupo vuelve a cero
// (00:00 UTC, 21:00 en Argentina).
export type ApiTier = 'essential' | 'secondary';
const TIER_MAX: Record<ApiTier, number> = { essential: 0.95, secondary: 0.5 };
export const QUOTA_RESERVED = 'QUOTA_RESERVED';

let caller: { source: string; tier: ApiTier } = { source: 'sin-nombre', tier: 'essential' };
// Uso al empezar la corrida (undefined: todavía no se miró) + consultas hechas desde ahí.
let startUsage: { current: number; limit: number } | null | undefined;
let callsThisRun = 0;
let usageClient: ReturnType<typeof getSupabaseAdmin> | null = null;

/** Se llama al empezar cada corrida: nombre del proceso (para el conteo) y su prioridad. */
export function setApiCaller(source: string, tier: ApiTier) {
  caller = { source, tier };
  startUsage = undefined;
  callsThisRun = 0;
}

/** Lo que queda en sync_log (status 'paused') cuando una corrida se frena por cupo. */
export const QUOTA_PAUSE_MESSAGE = 'En pausa por el cupo de API-Football; sigue cuando vuelve a cero (21:00).';

/** true si el error es la pausa por cupo (no es una falla: se sigue en la próxima pasada). */
export function isQuotaStop(err: unknown): boolean {
  const msg = (err as Error)?.message;
  return msg === QUOTA_RESERVED || msg === 'RATE_LIMITED';
}

async function quotaNumbers(): Promise<{ current: number; limit: number } | null> {
  try {
    const res = await fetch(new URL('/status', BASE_URL).toString(), { headers: { 'x-apisports-key': API_KEY } });
    const json = await res.json();
    const req = json?.response?.requests;
    if (req?.limit_day) return { current: req.current, limit: req.limit_day };
    // Con el cupo agotado /status contesta con `errors` y sin números.
    if (JSON.stringify(json?.errors ?? '').includes('request limit')) return { current: 1, limit: 1 };
    return null;
  } catch {
    return null;
  }
}

async function guardedFetch(url: URL): Promise<any> {
  if (startUsage === undefined) startUsage = await quotaNumbers();
  if (startUsage && (startUsage.current + callsThisRun) / startUsage.limit >= TIER_MAX[caller.tier]) {
    throw new Error(QUOTA_RESERVED);
  }

  callsThisRun++;
  const res = await fetch(url.toString(), {
    headers: { 'x-apisports-key': API_KEY },
  });
  try {
    usageClient ??= getSupabaseAdmin();
    await usageClient.rpc('bump_api_football_usage', { p_source: caller.source, p_calls: 1 });
  } catch { /* el conteo nunca frena un sync */ }

  if (res.status === 429) {
    throw new Error('RATE_LIMITED');
  }

  if (!res.ok) {
    throw new Error(`API-Football ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();
  const apiError = apiResponseError(json);
  if (apiError) throw new Error(apiError);
  return json;
}

async function apiFetch<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  const url = new URL(endpoint, BASE_URL);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const json = await guardedFetch(url);
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

export type FinishedFixture = Awaited<ReturnType<typeof fetchFinishedFixtures>>[number];

/**
 * Todos los partidos terminados de un día (fecha UTC), de todas las ligas, en
 * una sola consulta. Reemplaza a pedir liga por liga en la pasada de cada hora
 * (33 consultas por hora → 2).
 */
export async function fetchFinishedFixturesByDate(date: string) {
  return apiFetch<FinishedFixture[]>('/fixtures', {
    date,
    status: 'FT-AET-PEN',
  });
}

/**
 * Temporada en curso de una liga según API-Football (año + fecha de inicio). null si la
 * API no marca ninguna como actual.
 */
export async function fetchCurrentSeason(leagueId: number): Promise<{ year: number; start: string } | null> {
  const res = await apiFetch<Array<{ seasons: Array<{ year: number; start: string; current: boolean }> }>>('/leagues', {
    id: String(leagueId),
    current: 'true',
  });
  const season = res[0]?.seasons?.find(s => s.current);
  return season ? { year: season.year, start: season.start } : null;
}

/** País de un equipo según API-Football (ej. "Uruguay"). null si no lo encuentra. */
export async function fetchTeamCountry(teamId: number): Promise<string | null> {
  const res = await apiFetch<Array<{ team: { country: string | null } }>>('/teams', { id: String(teamId) });
  return res[0]?.team?.country ?? null;
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

/**
 * Perfil completo de un jugador — a diferencia de `fetchFixturePlayers`
 * (liviano, solo lo que trae un partido), este endpoint sí incluye
 * `nationality`. Se usa para llenar ese campo desde la fuente propia del
 * jugador — nunca se infiere por nombre/club (ver saneamiento de datos).
 */
export async function fetchPlayerProfile(playerId: number, season: number) {
  const data = await apiFetch<Array<{ player: { nationality: string | null; birth: { date: string | null } } }>>('/players', {
    id: String(playerId),
    season: String(season),
  });
  const entry = data?.[0]?.player;
  if (!entry) return null;
  return { nationality: entry.nationality ?? null, birthDate: entry.birth?.date ?? null };
}

export async function fetchLeagueInfo(leagueId: number, season: number) {
  return apiFetch<Array<{ league: { id: number; name: string }; country: { name: string }; seasons: Array<{ year: number; coverage: { fixtures: { statistics_players: boolean } } }> }>>('/leagues', {
    id: String(leagueId),
    season: String(season),
  });
}

/**
 * Una página (20 jugadores) de los planteles de una liga, con nacionalidad y
 * fecha de nacimiento. Sirve para completar nacionalidades de a una liga entera
 * (20 por consulta) en vez de una consulta por jugador.
 */
export async function fetchLeaguePlayersPage(leagueId: number, season: number, page: number) {
  const url = new URL('/players', BASE_URL);
  url.searchParams.set('league', String(leagueId));
  url.searchParams.set('season', String(season));
  url.searchParams.set('page', String(page));
  const json = await guardedFetch(url);
  const players = (json.response ?? []).map((r: any) => ({
    id: r.player?.id as number,
    nationality: (r.player?.nationality ?? null) as string | null,
    birthDate: (r.player?.birth?.date ?? null) as string | null,
  }));
  return { players, totalPages: (json.paging?.total ?? 1) as number };
}

/** Parte usada del cupo diario (0 a 1). /status no descuenta del cupo. */
export async function fetchQuotaUsage(): Promise<number | null> {
  const q = await quotaNumbers();
  return q ? q.current / q.limit : null;
}
