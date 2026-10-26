import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { getSupabaseAdmin } from '../_shared/supabase-client.ts';
import {
  fetchPlayerProfile as fetchApiFootballProfile, fetchLeaguePlayersPage, fetchQuotaUsage, isQuotaStop, setApiCaller,
} from '../_shared/api-football.ts';

const TM_API_BASE = 'https://tmapi-alpha.transfermarkt.technology';
const TM_HEADERS = {
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://www.transfermarkt.es',
  'Referer': 'https://www.transfermarkt.es/',
};
const WEB_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
};

const DG_TM_IDS = new Set([
  639152, 621370, 697408, 636784, 1046802, 992527, 728262, 1101427,
  249794, 843537, 1221014, 579977, 535028, 538538, 1000674, 1029299,
  1322847, 625203, 1110143, 1377439, 1069809, 441408, 437962, 1027280,
  742512, 1341520, 890130, 1305360, 983999, 1001697, 1198161,
  578757, 697045, 654733, 683807, 882846, 1029486, 642757,
]);

function norm(s: string): string {
  return s.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function parseMarketValueText(text: string): number | null {
  if (!text) return null;
  const m = text.replace(/\xa0/g, ' ').trim().match(/€([\d,.]+)\s*(m|k|bn)?/i);
  if (!m) return null;
  const num = parseFloat(m[1].replace(',', '.'));
  if (isNaN(num)) return null;
  const suffix = (m[2] || '').toLowerCase();
  if (suffix === 'm') return Math.round(num * 1_000_000);
  if (suffix === 'k') return Math.round(num * 1_000);
  if (suffix === 'bn') return Math.round(num * 1_000_000_000);
  return Math.round(num);
}

async function fetchUrl(url: string, headers: Record<string, string>): Promise<string | null> {
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function searchTmHtml(name: string): Promise<Array<{
  tm_id: number; name: string; club: string; market_value_text: string;
}>> {
  const encoded = encodeURIComponent(name);
  const url = `https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query=${encoded}&Spieler_page=1`;
  const html = await fetchUrl(url, WEB_HEADERS);
  if (!html) return [];

  const results: Array<{ tm_id: number; name: string; club: string; market_value_text: string }> = [];
  const rowRegex = /<tr class="(?:odd|even)">\s*<td><table class="inline-table">([\s\S]*?)<\/table><\/td>([\s\S]*?)<\/tr>/g;
  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    const inlineTable = match[1];
    const restCols = match[2];

    const tmIdM = inlineTable.match(/profil\/spieler\/(\d+)/);
    const nameM = inlineTable.match(/class="hauptlink"><a[^>]*title="([^"]*)"/);
    if (!tmIdM || !nameM) continue;

    const clubMatches = [...inlineTable.matchAll(/<a[^>]*title="([^"]*)"[^>]*href="[^"]*startseite\/verein/g)];
    const mvM = restCols.match(/class="rechts hauptlink">([\s\S]*?)<\/td>/);
    const mvText = mvM ? mvM[1].replace(/<[^>]+>/g, '').trim() : '';

    results.push({
      tm_id: parseInt(tmIdM[1]),
      name: nameM[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"'),
      club: clubMatches.length > 0 ? clubMatches[0][1].replace(/&amp;/g, '&') : '',
      market_value_text: mvText,
    });
  }
  return results;
}

// Piso de confianza para aceptar un match automático SIN revisión humana.
// 10 = nombre exacto normalizado. 8 = apellido + inicial del nombre + club
// confirmado (5+2+3 nunca sin el bonus de club). Cualquier cosa por debajo
// —apellido solo, o apellido+inicial sin club— NO se acepta automático: mejor
// dejar `transfermarkt_id` sin poner que adivinar mal (ver auditoría de
// saneamiento de datos: 107 grupos con el mismo transfermarkt_id en nombres
// incompatibles, todos por debajo de este piso). Mismo criterio que
// scripts/enrich-transfermarkt/enrich.py — mantener ambos en sync.
const MIN_AUTO_MATCH_SCORE = 8;

function matchPlayer(
  results: Array<{ tm_id: number; name: string; club: string; market_value_text: string }>,
  playerName: string,
  teamName?: string | null,
): typeof results[0] | null {
  const target = norm(playerName);
  const targetParts = target.split(/\s+/);
  const targetLast = targetParts[targetParts.length - 1] || '';
  const teamNorm = teamName ? norm(teamName) : '';

  let best: typeof results[0] | null = null;
  let bestScore = -1;

  for (const r of results) {
    const rNorm = norm(r.name);
    const rParts = rNorm.split(/\s+/);
    const rLast = rParts[rParts.length - 1] || '';

    let score = 0;
    if (rNorm === target) score += 10;
    else if (rLast === targetLast) {
      score += 5;
      if (rParts[0]?.[0] === targetParts[0]?.[0]) score += 2;
    }
    if (score === 0) continue;

    if (teamNorm) {
      const rTeam = norm(r.club);
      if (teamNorm.includes(rTeam) || rTeam.includes(teamNorm)) score += 3;
    }

    if (score > bestScore) { bestScore = score; best = r; }
  }
  if (bestScore < MIN_AUTO_MATCH_SCORE) return null;
  return best;
}

interface TmProfile {
  [key: string]: any;
}

async function tmProfile(tmId: number): Promise<TmProfile | null> {
  const raw = await fetchUrl(`${TM_API_BASE}/player/${tmId}`, TM_HEADERS);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    return data.data ?? data;
  } catch { return null; }
}

function extractBirthDate(profile: TmProfile): string | null {
  const ld = profile.lifeDates ?? {};
  const dob = ld.dateOfBirth ?? profile.dateOfBirth ?? profile.birthDate;
  if (dob && typeof dob === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dob)) return dob.slice(0, 10);
  return null;
}

// Edad imposible para un jugador activo -> el match probablemente cayó en un
// homónimo (nombre común, primer resultado de búsqueda). Vio el saneamiento
// de datos: ~390 casos históricos de exactamente este patrón (ej. 4 "Juan
// García" distintos, los 4 matcheados al mismo Juan García de 1921). Un
// MIN_AUTO_MATCH_SCORE alto no alcanza para evitarlo solo -- el nombre puede
// scorear bien y aun así ser la persona equivocada.
function impliesImplausibleAge(birthDateStr: string): boolean {
  const dob = new Date(birthDateStr);
  if (isNaN(dob.getTime())) return false;
  const ageYears = (Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  return ageYears < 14 || ageYears > 45;
}

function extractContractEnd(profile: TmProfile): string | null {
  const attrs = profile.attributes ?? {};
  const val = attrs.contractUntil ?? profile.contractEndDate ?? profile.contractExpiryDate;
  if (val && typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) return val.slice(0, 10);
  return null;
}

function extractAgent(profile: TmProfile): string | null {
  const attrs = profile.attributes ?? {};
  const agency = attrs.consultantAgency;
  if (agency && typeof agency === 'object') return agency.name ?? null;
  const agent = profile.agent ?? profile.playerAgent;
  if (agent && typeof agent === 'object') return agent.name ?? agent.agentName ?? null;
  if (agent && typeof agent === 'string' && agent.trim()) return agent.trim();
  return null;
}

/** Club actual según Transfermarkt y desde cuándo está ahí. */
function extractCurrentClub(profile: TmProfile): { id: number; since: string | null } | null {
  const list = Array.isArray(profile.clubAssignments) ? profile.clubAssignments : [];
  const current = list.find((a: any) => a?.type === 'current') ?? null;
  const id = Number(current?.clubId);
  if (!current || !Number.isFinite(id) || id <= 0) return null;
  const since = typeof current.start === 'string' && /^\d{4}-\d{2}-\d{2}/.test(current.start) ? current.start.slice(0, 10) : null;
  return { id, since };
}

// Nombre de un club de Transfermarkt: se consulta una vez y queda en tm_clubs.
const tmClubNameCache = new Map<number, string | null>();
async function tmClubName(supabase: ReturnType<typeof getSupabaseAdmin>, clubId: number): Promise<string | null> {
  if (tmClubNameCache.has(clubId)) return tmClubNameCache.get(clubId) ?? null;
  const { data: cached } = await supabase.from('tm_clubs').select('name').eq('id', clubId).maybeSingle();
  if (cached?.name) { tmClubNameCache.set(clubId, cached.name); return cached.name; }
  const raw = await fetchUrl(`${TM_API_BASE}/club/${clubId}`, TM_HEADERS);
  let name: string | null = null;
  let countryId: number | null = null;
  try {
    const data = raw ? JSON.parse(raw)?.data : null;
    name = data?.name ?? null;
    countryId = data?.baseDetails?.countryId ?? null;
  } catch { /* sin nombre */ }
  if (name) await supabase.from('tm_clubs').upsert({ id: clubId, name, country_id: countryId }, { onConflict: 'id' });
  tmClubNameCache.set(clubId, name);
  return name;
}

/** Campos de club actual de Transfermarkt para guardar en players. */
async function tmClubPatch(supabase: ReturnType<typeof getSupabaseAdmin>, profile: TmProfile): Promise<Record<string, unknown>> {
  const club = extractCurrentClub(profile);
  if (!club) return {};
  const name = await tmClubName(supabase, club.id);
  return { tm_club_id: club.id, tm_club_name: name, tm_club_since: club.since };
}

function extractMarketValue(profile: TmProfile): number | null {
  const mv = profile.marketValueDetails;
  if (mv && typeof mv === 'object') {
    const current = mv.current;
    if (current && typeof current === 'object' && current.value) return Math.round(current.value);
  }
  const mv2 = profile.marketValue ?? profile.currentMarketValue;
  if (typeof mv2 === 'number') return Math.round(mv2);
  return null;
}

function buildTmUrl(profile: TmProfile, tmId: number): string {
  const rel = profile.relativeUrl ?? profile.url ?? profile.profileUrl;
  if (rel && typeof rel === 'string') {
    return rel.startsWith('http') ? rel : `https://www.transfermarkt.com${rel}`;
  }
  const slug = (profile.name ?? 'player').toLowerCase().replace(/\s+/g, '-');
  return `https://www.transfermarkt.com/${slug}/profil/spieler/${tmId}`;
}

/**
 * Nacionalidad y (si falta) fecha de nacimiento desde la fuente PROPIA del
 * jugador — nunca inferida por nombre/club (ver saneamiento de datos,
 * `nationality` vacío en el 100% de los jugadores porque ningún pipeline
 * llamaba al endpoint de perfil completo, solo a los livianos de
 * partidos/alineaciones que no la traen). Independiente del match de
 * Transfermarkt de abajo — corre siempre que falte el dato, aunque el match
 * a Transfermarkt no se encuentre.
 *
 * Solo API-Football acá (id<20M) — Sofascore bloquea cualquier fetch sin
 * impersonar el fingerprint TLS de un browser real (`curl_cffi`, Python),
 * algo que esta función edge (Deno, `fetch` nativo) no puede hacer; es el
 * mismo motivo por el que el sync de Sofascore corre local
 * (`scripts/sync-sofascore/sync.py`) y no acá. El backfill de nacionalidad
 * para jugadores de Sofascore vive en
 * `scripts/enrich-transfermarkt/backfill_nationality_sofascore.py`, local.
 */
async function backfillOwnSourceProfile(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  player: { id: number; nationality: string | null; birth_date: string | null },
) {
  if (player.id >= 20_000_000) return;
  const patch: Record<string, any> = {};
  try {
    const profile = await fetchApiFootballProfile(player.id, new Date().getFullYear());
    if (profile?.nationality && !player.nationality) patch.nationality = profile.nationality;
    if (profile?.birthDate && !player.birth_date) patch.birth_date = profile.birthDate;
  } catch {
    // Sin nacionalidad de origen no rompe el resto del enrichment (Transfermarkt
    // sigue corriendo abajo) — solo se pierde este dato puntual por ahora.
  }
  if (Object.keys(patch).length > 0) {
    await supabase.from('players').update(patch).eq('id', player.id);
  }
}

async function enrichSingle(supabase: ReturnType<typeof getSupabaseAdmin>, playerId: number) {
  const { data: player } = await supabase
    .from('players')
    .select('id, name, current_team_id, transfermarkt_id, market_value_eur, birth_date, nationality')
    .eq('id', playerId)
    .single();

  if (!player) return { error: 'Player not found' };

  if (!player.nationality || !player.birth_date) {
    await backfillOwnSourceProfile(supabase, player);
    if (!player.birth_date) {
      const { data: refreshed } = await supabase.from('players').select('birth_date').eq('id', playerId).single();
      if (refreshed?.birth_date) player.birth_date = refreshed.birth_date;
    }
  }

  let teamName: string | null = null;
  if (player.current_team_id) {
    const { data: team } = await supabase
      .from('teams')
      .select('name')
      .eq('id', player.current_team_id)
      .single();
    teamName = team?.name ?? null;
  }

  let tmId = player.transfermarkt_id;
  const isFreshMatch = !tmId;
  let mvFromSearch: number | null = null;

  if (!tmId) {
    // Antes reintentaba buscando solo por apellido si el nombre completo no
    // daba resultados — ensanchaba la red justo en los casos más difíciles
    // de confirmar (ver MIN_AUTO_MATCH_SCORE). Sin resultados por nombre
    // completo, mejor no encontrar nada que adivinar por apellido solo.
    const results = await searchTmHtml(player.name);
    const matched = results.length > 0 ? matchPlayer(results, player.name, teamName) : null;
    if (!matched) return { status: 'not_found', player: player.name };
    tmId = matched.tm_id;
    mvFromSearch = parseMarketValueText(matched.market_value_text);
  }

  const profile = await tmProfile(tmId);

  if (isFreshMatch) {
    const birthDate = profile ? extractBirthDate(profile) : null;
    if (birthDate && impliesImplausibleAge(birthDate)) {
      return { status: 'rejected_implausible_age', player: player.name, tm_id: tmId, birth_date: birthDate };
    }
    // Solo por nombre se emparejaba con homónimos (J. Córdoba de Instituto con el
    // Jhon Córdoba de Krasnodar) y se copiaban agente, valor y fecha de otra
    // persona. Un vínculo nuevo exige que la fecha de nacimiento de nuestra fuente
    // y la de Transfermarkt coincidan (±1 día).
    if (!player.birth_date || !birthDate) {
      return { status: 'skipped_no_birth_date', player: player.name, tm_id: tmId };
    }
    const diffDays = Math.abs(new Date(player.birth_date).getTime() - new Date(birthDate).getTime()) / 86400_000;
    if (diffDays > 1) {
      return { status: 'rejected_birth_mismatch', player: player.name, tm_id: tmId, ours: player.birth_date, tm: birthDate };
    }
  }

  const patch: Record<string, any> = { transfermarkt_id: tmId };

  if (profile) {
    const mv = extractMarketValue(profile);
    patch.market_value_eur = mv ?? mvFromSearch;
    const contractEnd = extractContractEnd(profile);
    if (contractEnd) patch.contract_end_date = contractEnd;
    const agent = extractAgent(profile);
    if (agent) patch.agent = agent;
    patch.transfermarkt_url = buildTmUrl(profile, tmId);
    Object.assign(patch, await tmClubPatch(supabase, profile));
  } else {
    if (mvFromSearch) patch.market_value_eur = mvFromSearch;
    patch.transfermarkt_url = `https://www.transfermarkt.com/x/profil/spieler/${tmId}`;
  }

  await supabase.from('players').update(patch).eq('id', playerId);

  return { status: 'enriched', player: player.name, fields: Object.keys(patch) };
}

// Tanda de refresco de Transfermarkt. Antes recorría los ~14.000 jugadores de una en una
// sola llamada: el servidor la cortaba a los pocos minutos y casi nadie se actualizaba (los
// de la agencia quedaban con valores de meses atrás). Ahora cada llamada procesa lo que
// entra en TIME_BUDGET_MS, primero la agencia (una vez por día) y después el resto por
// orden de antigüedad, así que el cron horario va rotando por todos. Un id de Transfermarkt
// se consulta una sola vez y el dato se escribe en TODAS sus filas (API-Football, Sofascore,
// agencia): antes cada fila tenía un valor distinto para la misma persona.
const TIME_BUDGET_MS = 100_000;
const AGENCY_REFRESH_HOURS = 20;

async function refreshAll(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const startedAt = Date.now();
  const results = { tm_ids: 0, rows_updated: 0, errors: 0, history_inserted: 0, agency_pending: 0 };
  const today = new Date().toISOString().split('T')[0];
  const agencyCutoff = new Date(Date.now() - AGENCY_REFRESH_HOURS * 3600_000).toISOString();

  // 1) Agencia: por agente o por la lista fija de ids, si no se refrescó en las últimas horas.
  const { data: agencyRows } = await supabase
    .from('players')
    .select('transfermarkt_id, tm_refreshed_at')
    .not('transfermarkt_id', 'is', null)
    .or(`agent.eq.Doble G Sports Group,transfermarkt_id.in.(${[...DG_TM_IDS].join(',')})`);
  // 2) Resto: los más viejos primero (sobra margen: la tanda corta por tiempo).
  const { data: staleRows } = await supabase
    .from('players')
    .select('transfermarkt_id')
    .not('transfermarkt_id', 'is', null)
    .order('tm_refreshed_at', { ascending: true, nullsFirst: true })
    .limit(1000);

  // Un id está pendiente si CUALQUIERA de sus filas no se refrescó en las últimas horas.
  const agencyIds = new Set(
    (agencyRows ?? [])
      .filter((r: any) => !r.tm_refreshed_at || r.tm_refreshed_at < agencyCutoff)
      .map((r: any) => r.transfermarkt_id as number),
  );
  const queue = [...new Set([
    ...agencyIds,
    ...(staleRows ?? []).map((r: any) => r.transfermarkt_id as number),
  ])];

  const visited = new Set<number>();
  for (const tmId of queue) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break;
    visited.add(tmId);
    try {
      const profile = await tmProfile(tmId);
      const patch: Record<string, any> = { tm_refreshed_at: new Date().toISOString() };
      let mv: number | null = null;
      if (profile) {
        mv = extractMarketValue(profile);
        const contractEnd = extractContractEnd(profile);
        const agent = extractAgent(profile);
        if (mv !== null) patch.market_value_eur = mv;
        if (contractEnd) patch.contract_end_date = contractEnd;
        if (agent) patch.agent = agent;
        Object.assign(patch, await tmClubPatch(supabase, profile));
      } else {
        results.errors++; // se marca igual como visitado para no trabar la rotación
      }

      const { data: updated } = await supabase
        .from('players').update(patch).eq('transfermarkt_id', tmId).select('id, current_team_id');
      results.tm_ids++;
      results.rows_updated += updated?.length ?? 0;

      if (mv !== null && agencyIds.has(tmId) && updated && updated.length > 0) {
        // Historial: una sola fila por jugador (la primera), como antes.
        const row = updated[0];
        let clubName: string | null = null;
        if (row.current_team_id) {
          const { data: team } = await supabase
            .from('teams').select('name').eq('id', row.current_team_id).single();
          clubName = team?.name ?? null;
        }
        await supabase.from('market_value_history').upsert({
          player_id: row.id,
          recorded_at: today,
          value_eur: mv,
          club_name: clubName,
        }, { onConflict: 'player_id,recorded_at' });
        results.history_inserted++;
      }

      await new Promise(r => setTimeout(r, 300));
    } catch {
      results.errors++;
    }
  }
  results.agency_pending = [...agencyIds].filter(id => !visited.has(id)).length;

  await supabase.from('sync_log').insert({
    function_name: 'refresh-transfermarkt',
    status: results.errors > results.tm_ids / 2 ? 'error' : 'success',
    error_message: results.errors > 0 ? `${results.errors} perfiles sin respuesta` : null,
    fixtures_processed: results.tm_ids,
  });

  return { status: 'done', ...results };
}

// Nacionalidad de los jugadores nuevos. Los syncs de partidos crean jugadores
// sin nacionalidad (los endpoints livianos no la traen) y para la agencia es un
// dato clave (filtros por país). Cada corrida toma los que jugaron hace poco,
// sin nacionalidad y sin consultar en el último mes, hasta NATIONALITY_BATCH
// consultas: con el atraso ya cargado son pocos por día, y el tope cuida la
// cuota compartida de API-Football. Los de Sofascore (id>=20M) quedan para el
// script local (ver backfillOwnSourceProfile).
const NATIONALITY_BATCH = 40;
const NATIONALITY_RECHECK_DAYS = 30;

// Hasta cuántas páginas de una liga se leen por corrida (20 jugadores cada una).
const LEAGUE_PAGES_PER_RUN = 10;

/**
 * Si una liga tiene muchos jugadores sin nacionalidad (ej. recién agregada), se
 * completan con sus planteles: 20 jugadores por consulta. Sigue donde quedó la
 * corrida anterior (nationality_league_progress).
 */
async function fillNationalitiesByLeague(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data } = await supabase.rpc('league_missing_nationality');
  const target = (data ?? [])[0] as { league_id: number; season: number; missing: number; next_page: number } | undefined;
  if (!target) return { league: null, pages: 0, filled: 0 };
  let page = target.next_page || 1;
  let total = page;
  let filled = 0;
  let pages = 0;
  for (; pages < LEAGUE_PAGES_PER_RUN && page <= total; pages++, page++) {
    let fetched: Awaited<ReturnType<typeof fetchLeaguePlayersPage>>;
    try {
      fetched = await fetchLeaguePlayersPage(target.league_id, target.season, page);
    } catch (e) {
      // Sin cupo: se guarda hasta dónde se llegó y se sigue en otra corrida.
      if (isQuotaStop(e)) break;
      throw e;
    }
    const { players, totalPages } = fetched;
    total = totalPages;
    for (const pl of players) {
      if (!pl.id || !pl.nationality) continue;
      const { data: updated } = await supabase
        .from('players')
        .update({ nationality: pl.nationality, nationality_checked_at: new Date().toISOString() })
        .eq('id', pl.id)
        .is('nationality', null)
        .select('id, birth_date');
      if (updated?.length) {
        filled++;
        if (pl.birthDate && !updated[0].birth_date) {
          await supabase.from('players').update({ birth_date: pl.birthDate }).eq('id', pl.id);
        }
      }
    }
    await new Promise(r => setTimeout(r, 400));
  }
  const done = page > total;
  await supabase.from('nationality_league_progress').upsert({
    league_id: target.league_id,
    season: target.season,
    next_page: done ? 1 : page,
    total_pages: total,
    done_at: done ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'league_id,season' });
  return { league: target.league_id, pages, filled };
}

// El cupo de API-Football lo comparten otras plataformas: con más del 50 % usado
// del día, la carga de nacionalidades espera a que el cupo vuelva a cero (mismo
// tope que todo lo secundario, ver _shared/api-football.ts).
const NATIONALITY_MAX_QUOTA = 0.5;

async function fillNationalities(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const usage = await fetchQuotaUsage();
  if (usage != null && usage > NATIONALITY_MAX_QUOTA) {
    return { status: 'skipped_quota', usage };
  }
  let byLeague: Record<string, unknown> = {};
  try { byLeague = await fillNationalitiesByLeague(supabase); } catch (e) { byLeague = { error: (e as Error).message }; }

  const recheckCutoff = new Date(Date.now() - NATIONALITY_RECHECK_DAYS * 86400_000).toISOString();
  const { data: pending, error } = await supabase.rpc('players_missing_nationality', {
    p_limit: NATIONALITY_BATCH,
    p_recheck_before: recheckCutoff,
  });
  if (error) return { status: 'error', error: error.message };

  const year = new Date().getFullYear();
  const results = { checked: 0, filled: 0, no_data: 0 };
  for (const p of (pending ?? []) as Array<{ id: number; birth_date: string | null; profile_recheck: boolean }>) {
    const patch: Record<string, any> = { nationality_checked_at: new Date().toISOString() };
    if (p.profile_recheck) patch.profile_recheck = false;
    try {
      // Temporada actual y, si no figura, la anterior (ligas europeas / jugador sin partidos este año)
      let profile = await fetchApiFootballProfile(p.id, year);
      if (!profile?.nationality) profile = await fetchApiFootballProfile(p.id, year - 1);
      if (profile?.nationality) {
        patch.nationality = profile.nationality;
        results.filled++;
      } else {
        results.no_data++;
      }
      // En una revisión (vínculo equivocado con Transfermarkt) la fecha se pisa con la de la fuente propia.
      if (profile?.birthDate && (!p.birth_date || p.profile_recheck)) patch.birth_date = profile.birthDate;
    } catch (e) {
      // Sin cupo no se marca como consultado (si no, quedaba un mes sin revisar).
      if (isQuotaStop(e)) break;
      results.no_data++;
    }
    results.checked++;
    if (p.profile_recheck) {
      await supabase.from('players').update(patch).eq('id', p.id);
    } else {
      await supabase.from('players').update(patch).eq('id', p.id).is('nationality', null);
    }
  }

  await supabase.from('sync_log').insert({
    function_name: 'fill-nationality',
    status: 'success',
    fixtures_processed: results.filled + Number((byLeague as any).filled ?? 0),
    error_message: JSON.stringify({ byLeague }),
  });
  return { status: 'done', ...results, byLeague };
}

// Jugadores desvinculados de un Transfermarkt equivocado: se vuelven a buscar
// (con la regla de fecha de nacimiento) de a tandas que entren en el tiempo.
const REMATCH_BUDGET_MS = 100_000;
async function rematchPending(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const startedAt = Date.now();
  const { data: pending } = await supabase
    .from('players')
    .select('id')
    .eq('tm_rematch_pending', true)
    .eq('profile_recheck', false)
    .limit(25);
  const results: Record<string, number> = {};
  for (const p of pending ?? []) {
    if (Date.now() - startedAt > REMATCH_BUDGET_MS) break;
    let status = 'error';
    try {
      const r = await enrichSingle(supabase, p.id);
      status = (r as any).status ?? 'error';
    } catch { /* se marca igual para no trabar la cola */ }
    results[status] = (results[status] ?? 0) + 1;
    await supabase.from('players').update({ tm_rematch_pending: false }).eq('id', p.id);
    await new Promise(r => setTimeout(r, 500));
  }
  await supabase.from('sync_log').insert({
    function_name: 'tm-rematch',
    status: 'success',
    fixtures_processed: results['enriched'] ?? 0,
    error_message: JSON.stringify(results),
  });
  return { status: 'done', ...results };
}

serve(async (req) => {
  const supabase = getSupabaseAdmin();
  let body: { mode?: string; player_id?: number } = {};
  try { body = await req.json(); } catch { /* empty body OK */ }

  const mode = body.mode ?? 'single';

  // Lo que pide alguien desde la app no espera; las revisiones de fondo sí.
  if (mode === 'single') setApiCaller('enrich-player', 'essential');
  else if (mode === 'rematch') setApiCaller('tm-rematch', 'secondary');
  else if (mode === 'refresh') setApiCaller('refresh-transfermarkt', 'secondary');
  else setApiCaller('fill-nationality', 'secondary');

  if (mode === 'single' && body.player_id) {
    const result = await enrichSingle(supabase, body.player_id);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (mode === 'refresh') {
    const result = await refreshAll(supabase);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (mode === 'rematch') {
    const result = await rematchPending(supabase);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (mode === 'nationality') {
    const result = await fillNationalities(supabase);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ error: 'Invalid mode or missing player_id' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
});
