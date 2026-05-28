import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { getSupabaseAdmin } from '../_shared/supabase-client.ts';

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

async function enrichSingle(supabase: ReturnType<typeof getSupabaseAdmin>, playerId: number) {
  const { data: player } = await supabase
    .from('players')
    .select('id, name, current_team_id, transfermarkt_id, market_value_eur, birth_date')
    .eq('id', playerId)
    .single();

  if (!player) return { error: 'Player not found' };

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
  let mvFromSearch: number | null = null;

  if (!tmId) {
    let results = await searchTmHtml(player.name);
    if (results.length === 0) {
      const parts = player.name.split(' ');
      if (parts.length > 1) results = await searchTmHtml(parts[parts.length - 1]);
    }
    const matched = results.length > 0 ? matchPlayer(results, player.name, teamName) : null;
    if (!matched) return { status: 'not_found', player: player.name };
    tmId = matched.tm_id;
    mvFromSearch = parseMarketValueText(matched.market_value_text);
  }

  const profile = await tmProfile(tmId);
  const patch: Record<string, any> = { transfermarkt_id: tmId };

  if (profile) {
    const mv = extractMarketValue(profile);
    patch.market_value_eur = mv ?? mvFromSearch;
    const contractEnd = extractContractEnd(profile);
    if (contractEnd) patch.contract_end_date = contractEnd;
    const agent = extractAgent(profile);
    if (agent) patch.agent = agent;
    const birthDate = extractBirthDate(profile);
    if (birthDate && !player.birth_date) patch.birth_date = birthDate;
    patch.transfermarkt_url = buildTmUrl(profile, tmId);
  } else {
    if (mvFromSearch) patch.market_value_eur = mvFromSearch;
    patch.transfermarkt_url = `https://www.transfermarkt.com/x/profil/spieler/${tmId}`;
  }

  await supabase.from('players').update(patch).eq('id', playerId);

  return { status: 'enriched', player: player.name, fields: Object.keys(patch) };
}

async function refreshAll(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data: players } = await supabase
    .from('players')
    .select('id, name, transfermarkt_id, current_team_id')
    .not('transfermarkt_id', 'is', null);

  if (!players || players.length === 0) return { status: 'no_players' };

  const results = { updated: 0, errors: 0, history_inserted: 0 };
  const today = new Date().toISOString().split('T')[0];

  for (const player of players) {
    try {
      const profile = await tmProfile(player.transfermarkt_id);
      if (!profile) { results.errors++; continue; }

      const mv = extractMarketValue(profile);
      const contractEnd = extractContractEnd(profile);
      const agent = extractAgent(profile);

      const patch: Record<string, any> = {};
      if (mv !== null) patch.market_value_eur = mv;
      if (contractEnd) patch.contract_end_date = contractEnd;
      if (agent) patch.agent = agent;

      if (Object.keys(patch).length > 0) {
        await supabase.from('players').update(patch).eq('id', player.id);
        results.updated++;
      }

      if (mv !== null && DG_TM_IDS.has(player.transfermarkt_id)) {
        let clubName: string | null = null;
        if (player.current_team_id) {
          const { data: team } = await supabase
            .from('teams').select('name').eq('id', player.current_team_id).single();
          clubName = team?.name ?? null;
        }
        await supabase.from('market_value_history').upsert({
          player_id: player.id,
          recorded_at: today,
          value_eur: mv,
          club_name: clubName,
        }, { onConflict: 'player_id,recorded_at' });
        results.history_inserted++;
      }

      await new Promise(r => setTimeout(r, 500));
    } catch {
      results.errors++;
    }
  }

  return { status: 'done', ...results };
}

serve(async (req) => {
  const supabase = getSupabaseAdmin();
  let body: { mode?: string; player_id?: number } = {};
  try { body = await req.json(); } catch { /* empty body OK */ }

  const mode = body.mode ?? 'single';

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

  return new Response(JSON.stringify({ error: 'Invalid mode or missing player_id' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
});
