import { chromium, type Page } from 'playwright';
import { createClient } from '@supabase/supabase-js';

// ─── Config ──────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const DISCOVER_PAGES = parseInt(process.env.DISCOVER_PAGES || '3');
const STATS_BATCH = parseInt(process.env.STATS_BATCH || '5');

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const TOURNAMENTS: Record<number, number> = {
  131: 703,  // Argentina Primera Nacional
  268: 278,  // Uruguay Primera División
};

const ID_OFFSET = 20_000_000;
const sofaId = (id: number) => id + ID_OFFSET;
const rawId = (id: number) => id - ID_OFFSET;

const FETCH_DELAY = 2000;
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── Types ───────────────────────────────────────────────────
type Position = 'ARQ' | 'LD' | 'CB' | 'LI' | 'VC' | 'VI' | 'EXT' | 'DEL';
type LineRole = 'DEF' | 'MID' | 'MID_DEF' | 'MID_ATK' | 'ATK';

interface PlayerMatchRow {
  player_id: number;
  fixture_id: number;
  team_id: number;
  detected_position: Position | null;
  formation: string | null;
  grid_position: string | null;
  minutes: number;
  rating: number | null;
  is_substitute: boolean;
  goals: number;
  assists: number;
  shots_total: number;
  shots_on: number;
  passes_total: number;
  passes_key: number;
  passes_accuracy: number;
  tackles: number;
  blocks: number;
  interceptions: number;
  duels_total: number;
  duels_won: number;
  dribbles_attempted: number;
  dribbles_success: number;
  fouls_drawn: number;
  fouls_committed: number;
  yellow_cards: number;
  red_cards: number;
  penalty_won: number;
  penalty_scored: number;
  penalty_missed: number;
  penalty_saved: number;
  saves: number;
  goals_conceded: number;
  match_score: number | null;
}

interface ScoringWeight {
  metric: string;
  weight: number;
  source: (row: PlayerMatchRow) => number;
  inverse?: boolean;
  isPercentage?: boolean;
}

// ─── Sofascore fetch via Playwright page navigation ─────────
let page: Page;
let lastFetch = 0;

async function sofaFetch<T>(path: string): Promise<T> {
  const elapsed = Date.now() - lastFetch;
  if (elapsed < FETCH_DELAY) await delay(FETCH_DELAY - elapsed);

  const url = `https://api.sofascore.com/api/v1${path}`;
  const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  lastFetch = Date.now();

  const status = response?.status() ?? 0;
  if (status === 403) throw new Error('SOFASCORE_BLOCKED');
  if (status === 404) throw new Error('SOFASCORE_NOT_FOUND');
  if (status !== 200) throw new Error(`Sofascore HTTP ${status}`);

  const text = await page.evaluate(() => document.body.innerText);
  try {
    return JSON.parse(text) as T;
  } catch {
    // Might be a Cloudflare challenge page — wait and retry once
    console.log(`  Retrying ${path} (got non-JSON response)`);
    await delay(5000);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    const retryText = await page.evaluate(() => document.body.innerText);
    return JSON.parse(retryText) as T;
  }
}

// ─── Position mapping ────────────────────────────────────────
function parseFormationLines(formation: string): number[] {
  return formation.split('-').map(Number);
}

function assignLineRoles(lines: number[]): LineRole[] {
  if (lines.length === 3) return ['DEF', 'MID', 'ATK'];
  if (lines.length === 4) {
    const [l1, l2, l3, l4] = lines;
    if (l1 >= 4 && l2 <= 2 && l3 >= 3 && l4 <= 1) return ['DEF', 'MID_DEF', 'MID_ATK', 'ATK'];
    if (l1 >= 4 && l2 === 1 && l3 >= 4 && l4 <= 1) return ['DEF', 'MID_DEF', 'MID_ATK', 'ATK'];
    if (l1 >= 3 && l2 >= 3 && l3 <= 2 && l4 >= 2) return ['DEF', 'MID', 'MID_ATK', 'ATK'];
    return ['DEF', 'MID_DEF', 'MID_ATK', 'ATK'];
  }
  const roles: LineRole[] = ['DEF'];
  for (let i = 1; i < lines.length - 1; i++) roles.push('MID');
  roles.push('ATK');
  return roles;
}

function mapGridToPosition(formation: string | null, grid: string | null): Position | null {
  if (!formation || !grid) return null;
  const [rowStr, colStr] = grid.split(':');
  const row = parseInt(rowStr, 10);
  const col = parseInt(colStr, 10);
  if (row === 1) return 'ARQ';

  const lines = parseFormationLines(formation);
  const roles = assignLineRoles(lines);
  const lineIndex = row - 2;
  if (lineIndex < 0 || lineIndex >= roles.length) return null;

  const role = roles[lineIndex];
  const lineSize = lines[lineIndex];
  const cols = Array.from({ length: lineSize }, (_, i) => i + 1);
  const sorted = [...cols].sort((a, b) => a - b);
  const n = sorted.length;
  const defLineSize = lines[0];

  switch (role) {
    case 'DEF':
      if (n === 3) return 'CB';
      if (col === sorted[0]) return 'LI';
      if (col === sorted[n - 1]) return 'LD';
      return 'CB';
    case 'MID':
      if (n === 5 && defLineSize === 3) {
        if (col === sorted[0]) return 'LI';
        if (col === sorted[n - 1]) return 'LD';
        if (col === sorted[Math.floor(n / 2)]) return 'VC';
        return 'VI';
      }
      if (n <= 2) return 'VC';
      if (n === 3) return col === sorted[1] ? 'VC' : 'VI';
      if (n === 4) return (col === sorted[0] || col === sorted[n - 1]) ? 'VI' : 'VC';
      return col === sorted[Math.floor(n / 2)] ? 'VC' : 'VI';
    case 'MID_DEF':
      if (n <= 2) return 'VC';
      return col === sorted[Math.floor(n / 2)] ? 'VC' : 'VI';
    case 'MID_ATK':
      if (n === 1) return 'VI';
      if (n === 2) return 'VI';
      if (col === sorted[0] || col === sorted[n - 1]) return 'EXT';
      return 'VI';
    case 'ATK':
      if (n <= 2) return 'DEL';
      if (col === sorted[0] || col === sorted[n - 1]) return 'EXT';
      return 'DEL';
  }
}

function buildSyntheticGrid(outfieldIndex: number, formation: string): string | null {
  const lines = parseFormationLines(formation);
  let cumulative = 0;
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const lineSize = lines[lineIdx];
    if (outfieldIndex < cumulative + lineSize) {
      return `${lineIdx + 2}:${outfieldIndex - cumulative + 1}`;
    }
    cumulative += lineSize;
  }
  return null;
}

function sofascoreFallbackPosition(pos: string): Position | null {
  switch (pos?.toUpperCase()) {
    case 'G': return 'ARQ';
    case 'D': return 'CB';
    case 'M': return 'VC';
    case 'F': return 'DEL';
    default: return null;
  }
}

// ─── Scoring ─────────────────────────────────────────────────
function per90(value: number, minutes: number): number {
  return minutes <= 0 ? 0 : (value / minutes) * 90;
}

function pct(num: number, den: number): number {
  return den <= 0 ? 0 : (num / den) * 100;
}

const SCORING_WEIGHTS: Record<Position, ScoringWeight[]> = {
  ARQ: [
    { metric: 'saves_p90', weight: 35, source: r => per90(r.saves, r.minutes) },
    { metric: 'goals_conceded_p90', weight: 25, source: r => per90(r.goals_conceded, r.minutes), inverse: true },
    { metric: 'rating', weight: 20, source: r => r.rating ?? 0 },
    { metric: 'penalty_saved', weight: 10, source: r => r.penalty_saved },
    { metric: 'clean_sheet', weight: 10, source: r => r.goals_conceded === 0 ? 100 : 0, isPercentage: true },
  ],
  CB: [
    { metric: 'duels_won_pct', weight: 28, source: r => pct(r.duels_won, r.duels_total), isPercentage: true },
    { metric: 'tackles_p90', weight: 15, source: r => per90(r.tackles, r.minutes) },
    { metric: 'interceptions_p90', weight: 15, source: r => per90(r.interceptions, r.minutes) },
    { metric: 'blocks_p90', weight: 12, source: r => per90(r.blocks, r.minutes) },
    { metric: 'passes_accuracy', weight: 12, source: r => r.passes_accuracy, isPercentage: true },
    { metric: 'rating', weight: 10, source: r => r.rating ?? 0 },
    { metric: 'passes_total_p90', weight: 8, source: r => per90(r.passes_total, r.minutes) },
  ],
  LD: [
    { metric: 'duels_won_pct', weight: 19, source: r => pct(r.duels_won, r.duels_total), isPercentage: true },
    { metric: 'key_passes_p90', weight: 14, source: r => per90(r.passes_key, r.minutes) },
    { metric: 'dribbles_success_p90', weight: 12, source: r => per90(r.dribbles_success, r.minutes) },
    { metric: 'assists_p90', weight: 12, source: r => per90(r.assists, r.minutes) },
    { metric: 'tackles_p90', weight: 10, source: r => per90(r.tackles, r.minutes) },
    { metric: 'passes_accuracy', weight: 10, source: r => r.passes_accuracy, isPercentage: true },
    { metric: 'interceptions_p90', weight: 8, source: r => per90(r.interceptions, r.minutes) },
    { metric: 'rating', weight: 8, source: r => r.rating ?? 0 },
    { metric: 'dribbles_success_pct', weight: 7, source: r => pct(r.dribbles_success, r.dribbles_attempted), isPercentage: true },
  ],
  LI: [
    { metric: 'duels_won_pct', weight: 19, source: r => pct(r.duels_won, r.duels_total), isPercentage: true },
    { metric: 'key_passes_p90', weight: 14, source: r => per90(r.passes_key, r.minutes) },
    { metric: 'dribbles_success_p90', weight: 12, source: r => per90(r.dribbles_success, r.minutes) },
    { metric: 'assists_p90', weight: 12, source: r => per90(r.assists, r.minutes) },
    { metric: 'tackles_p90', weight: 10, source: r => per90(r.tackles, r.minutes) },
    { metric: 'passes_accuracy', weight: 10, source: r => r.passes_accuracy, isPercentage: true },
    { metric: 'interceptions_p90', weight: 8, source: r => per90(r.interceptions, r.minutes) },
    { metric: 'rating', weight: 8, source: r => r.rating ?? 0 },
    { metric: 'dribbles_success_pct', weight: 7, source: r => pct(r.dribbles_success, r.dribbles_attempted), isPercentage: true },
  ],
  VC: [
    { metric: 'tackles_p90', weight: 19, source: r => per90(r.tackles, r.minutes) },
    { metric: 'duels_won_pct', weight: 16, source: r => pct(r.duels_won, r.duels_total), isPercentage: true },
    { metric: 'interceptions_p90', weight: 14, source: r => per90(r.interceptions, r.minutes) },
    { metric: 'passes_accuracy', weight: 14, source: r => r.passes_accuracy, isPercentage: true },
    { metric: 'passes_total_p90', weight: 10, source: r => per90(r.passes_total, r.minutes) },
    { metric: 'blocks_p90', weight: 8, source: r => per90(r.blocks, r.minutes) },
    { metric: 'rating', weight: 8, source: r => r.rating ?? 0 },
    { metric: 'key_passes_p90', weight: 6, source: r => per90(r.passes_key, r.minutes) },
    { metric: 'passes_accuracy_extra', weight: 5, source: r => r.passes_accuracy, isPercentage: true },
  ],
  VI: [
    { metric: 'duels_won_pct', weight: 16, source: r => pct(r.duels_won, r.duels_total), isPercentage: true },
    { metric: 'key_passes_p90', weight: 14, source: r => per90(r.passes_key, r.minutes) },
    { metric: 'dribbles_success_p90', weight: 12, source: r => per90(r.dribbles_success, r.minutes) },
    { metric: 'assists_p90', weight: 10, source: r => per90(r.assists, r.minutes) },
    { metric: 'goals_p90', weight: 10, source: r => per90(r.goals, r.minutes) },
    { metric: 'passes_accuracy', weight: 10, source: r => r.passes_accuracy, isPercentage: true },
    { metric: 'shots_on_p90', weight: 8, source: r => per90(r.shots_on, r.minutes) },
    { metric: 'rating', weight: 8, source: r => r.rating ?? 0 },
    { metric: 'tackles_p90', weight: 6, source: r => per90(r.tackles, r.minutes) },
    { metric: 'dribbles_success_pct', weight: 6, source: r => pct(r.dribbles_success, r.dribbles_attempted), isPercentage: true },
  ],
  EXT: [
    { metric: 'dribbles_success_p90', weight: 17, source: r => per90(r.dribbles_success, r.minutes) },
    { metric: 'goals_p90', weight: 15, source: r => per90(r.goals, r.minutes) },
    { metric: 'assists_p90', weight: 14, source: r => per90(r.assists, r.minutes) },
    { metric: 'key_passes_p90', weight: 12, source: r => per90(r.passes_key, r.minutes) },
    { metric: 'shots_on_p90', weight: 10, source: r => per90(r.shots_on, r.minutes) },
    { metric: 'duels_won_pct', weight: 10, source: r => pct(r.duels_won, r.duels_total), isPercentage: true },
    { metric: 'dribbles_success_pct', weight: 8, source: r => pct(r.dribbles_success, r.dribbles_attempted), isPercentage: true },
    { metric: 'rating', weight: 8, source: r => r.rating ?? 0 },
    { metric: 'fouls_drawn_p90', weight: 6, source: r => per90(r.fouls_drawn, r.minutes) },
  ],
  DEL: [
    { metric: 'goals_p90', weight: 30, source: r => per90(r.goals, r.minutes) },
    { metric: 'shots_on_p90', weight: 12, source: r => per90(r.shots_on, r.minutes) },
    { metric: 'assists_p90', weight: 10, source: r => per90(r.assists, r.minutes) },
    { metric: 'shots_on_pct', weight: 8, source: r => pct(r.shots_on, r.shots_total), isPercentage: true },
    { metric: 'key_passes_p90', weight: 8, source: r => per90(r.passes_key, r.minutes) },
    { metric: 'duels_won_pct', weight: 8, source: r => pct(r.duels_won, r.duels_total), isPercentage: true },
    { metric: 'rating', weight: 8, source: r => r.rating ?? 0 },
    { metric: 'dribbles_success_p90', weight: 6, source: r => per90(r.dribbles_success, r.minutes) },
    { metric: 'penalty_scored', weight: 5, source: r => r.penalty_scored },
    { metric: 'fouls_drawn_p90', weight: 5, source: r => per90(r.fouls_drawn, r.minutes) },
  ],
};

function rankNormalize(value: number, sortedAsc: number[]): number {
  const n = sortedAsc.length;
  if (n <= 1) return 50;
  let lo = 0, hi = n;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sortedAsc[mid] < value) lo = mid + 1; else hi = mid; }
  const below = lo;
  lo = 0; hi = n;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sortedAsc[mid] <= value) lo = mid + 1; else hi = mid; }
  const equal = lo - below;
  const rank = below + (equal - 1) / 2;
  return Math.min(100, Math.max(0, (rank / (n - 1)) * 100));
}

function calculateMatchScore(row: PlayerMatchRow, peers: PlayerMatchRow[]): number | null {
  if (row.minutes < 10) return null;
  const position = row.detected_position;
  if (!position || !(position in SCORING_WEIGHTS)) return null;

  const weights = SCORING_WEIGHTS[position];
  const allRows = [row, ...peers.filter(p => p.detected_position === position && p.minutes >= 10)];

  if (allRows.length <= 1) {
    const rating = row.rating ?? 5.0;
    return Math.round(Math.min(10, Math.max(1, rating)) * 10) / 10;
  }

  let scoreRaw = 0;
  for (const w of weights) {
    const values = allRows.map(r => w.source(r));
    if (w.inverse) for (let i = 0; i < values.length; i++) values[i] = -values[i];
    const sorted = [...values].sort((a, b) => a - b);
    const playerValue = w.inverse ? -w.source(row) : w.source(row);
    scoreRaw += rankNormalize(playerValue, sorted) * (w.weight / 100);
  }

  return Math.round((1 + (scoreRaw * 9) / 100) * 10) / 10;
}

// ─── Stats mapping ───────────────────────────────────────────
function mapPlayerStats(
  p: any, fixtureId: number, teamId: number,
  position: Position | null, formation: string | null,
  grid: string | null, cards: { yellow: number; red: number } | undefined,
): PlayerMatchRow {
  const s = p.statistics || {};
  return {
    player_id: sofaId(p.player.id),
    fixture_id: fixtureId,
    team_id: teamId,
    detected_position: position,
    formation,
    grid_position: grid,
    minutes: s.minutesPlayed ?? 0,
    rating: s.rating ?? null,
    is_substitute: p.substitute,
    goals: s.goals ?? 0,
    assists: s.goalAssist ?? 0,
    shots_total: (s.onTargetScoringAttempt ?? 0) + (s.shotOffTarget ?? 0),
    shots_on: s.onTargetScoringAttempt ?? 0,
    passes_total: s.totalPass ?? 0,
    passes_key: s.keyPass ?? 0,
    passes_accuracy: (s.totalPass ?? 0) > 0
      ? Math.round(((s.accuratePass ?? 0) / s.totalPass) * 100 * 100) / 100
      : 0,
    tackles: s.totalTackle ?? 0,
    blocks: s.blockedScoringAttempt ?? 0,
    interceptions: s.interceptionWon ?? 0,
    duels_total: (s.duelWon ?? 0) + (s.duelLost ?? 0),
    duels_won: s.duelWon ?? 0,
    dribbles_attempted: s.totalContest ?? 0,
    dribbles_success: s.wonContest ?? 0,
    fouls_drawn: s.wasFouled ?? 0,
    fouls_committed: s.fouls ?? 0,
    yellow_cards: cards?.yellow ?? 0,
    red_cards: cards?.red ?? 0,
    penalty_won: 0,
    penalty_scored: 0,
    penalty_missed: 0,
    penalty_saved: 0,
    saves: s.saves ?? 0,
    goals_conceded: 0,
    match_score: null,
  };
}

// ─── Main sync ───────────────────────────────────────────────
async function main() {
  console.log(`sync-sofascore starting (pages=${DISCOVER_PAGES}, batch=${STATS_BATCH})`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  });
  page = await context.newPage();

  // Navigate to Sofascore to pass Cloudflare challenge and get cookies
  console.log('Loading sofascore.com to pass Cloudflare challenge...');
  await page.goto('https://www.sofascore.com', { waitUntil: 'networkidle', timeout: 45000 });
  await delay(3000);
  console.log(`Page loaded: ${page.url()}`);

  const results = { fixtures_discovered: 0, fixtures_synced: 0, players_inserted: 0, errors: [] as string[] };

  try {
    const { data: leagues, error: leagueErr } = await supabase
      .from('leagues')
      .select('id, season')
      .eq('source', 'sofascore')
      .eq('has_player_stats', true);

    if (leagueErr) {
      console.error('League query error:', leagueErr.message, leagueErr.details, leagueErr.hint);
    }

    console.log(`Leagues found: ${leagues?.length ?? 0}`, leagues);

    if (!leagues || leagues.length === 0) {
      console.log('No Sofascore leagues configured');
      return;
    }

    // ── Phase 1: discover finished events ──
    for (const league of leagues) {
      const tournamentId = TOURNAMENTS[league.id];
      if (!tournamentId) continue;

      try {
        const seasonData = await sofaFetch<{ seasons: any[] }>(`/unique-tournament/${tournamentId}/seasons`);
        const season = seasonData.seasons.find((s: any) => s.year === String(league.season));
        if (!season) {
          results.errors.push(`No ${league.season} season for tournament ${tournamentId}`);
          continue;
        }

        for (let pg = 0; pg < DISCOVER_PAGES; pg++) {
          try {
            const data = await sofaFetch<{ events: any[]; hasNextPage?: boolean }>(
              `/unique-tournament/${tournamentId}/season/${season.id}/events/last/${pg}`,
            );

            const finished = data.events.filter((e: any) => e.status.type === 'finished');
            for (const event of finished) {
              const fxId = sofaId(event.id);
              const homeId = sofaId(event.homeTeam.id);
              const awayId = sofaId(event.awayTeam.id);

              await supabase.from('teams').upsert([
                { id: homeId, name: event.homeTeam.name, logo: `https://api.sofascore.com/api/v1/team/${event.homeTeam.id}/image`, league_id: league.id },
                { id: awayId, name: event.awayTeam.name, logo: `https://api.sofascore.com/api/v1/team/${event.awayTeam.id}/image`, league_id: league.id },
              ], { onConflict: 'id' });

              const { error } = await supabase.from('fixtures').upsert({
                id: fxId,
                league_id: league.id,
                season: league.season,
                date: new Date(event.startTimestamp * 1000).toISOString(),
                home_team_id: homeId,
                away_team_id: awayId,
                score_home: event.homeScore.current,
                score_away: event.awayScore.current,
                stats_synced: false,
              }, { onConflict: 'id', ignoreDuplicates: true });

              if (!error) results.fixtures_discovered++;
            }

            if (!data.hasNextPage) break;
          } catch (err: any) {
            if (err.message === 'SOFASCORE_NOT_FOUND') break;
            throw err;
          }
        }

        console.log(`League ${league.id}: discovered events`);
      } catch (err: any) {
        results.errors.push(`League ${league.id} discovery: ${err.message}`);
        if (err.message === 'SOFASCORE_BLOCKED') break;
      }
    }

    // ── Phase 2: sync stats for unsynced fixtures ──
    const leagueIds = leagues.map(l => l.id);
    const { data: unsyncedFixtures } = await supabase
      .from('fixtures')
      .select('id, league_id, season, home_team_id, away_team_id, score_home, score_away')
      .eq('stats_synced', false)
      .in('league_id', leagueIds)
      .order('date', { ascending: false })
      .limit(STATS_BATCH);

    if (!unsyncedFixtures || unsyncedFixtures.length === 0) {
      console.log('No unsynced fixtures');
    } else {
      console.log(`Processing ${unsyncedFixtures.length} unsynced fixtures...`);

      for (const fixture of unsyncedFixtures) {
        try {
          const eventId = rawId(fixture.id);

          let lineups: any;
          try {
            lineups = await sofaFetch<any>(`/event/${eventId}/lineups`);
          } catch {
            continue;
          }

          if (!lineups.confirmed) continue;

          const hasStats = (players: any[]) => {
            const starter = players.find((p: any) => !p.substitute && p.statistics);
            return (starter?.statistics?.minutesPlayed ?? 0) > 0;
          };
          if (!hasStats(lineups.home.players) && !hasStats(lineups.away.players)) continue;

          let cardMap = new Map<number, { yellow: number; red: number }>();
          try {
            const incData = await sofaFetch<{ incidents: any[] }>(`/event/${eventId}/incidents`);
            for (const inc of incData.incidents) {
              if (inc.incidentType === 'card' && inc.player?.id) {
                if (!cardMap.has(inc.player.id)) cardMap.set(inc.player.id, { yellow: 0, red: 0 });
                const entry = cardMap.get(inc.player.id)!;
                if (inc.incidentClass === 'yellow') entry.yellow++;
                else if (inc.incidentClass === 'red' || inc.incidentClass === 'yellowRed') entry.red++;
              }
            }
          } catch { /* non-critical */ }

          const allRows: PlayerMatchRow[] = [];

          for (const side of ['home', 'away'] as const) {
            const teamData = lineups[side];
            const formation = teamData.formation ?? null;
            const teamId = side === 'home' ? fixture.home_team_id : fixture.away_team_id;

            const posOrder: Record<string, number> = { G: 0, D: 1, M: 2, F: 3 };
            const starters = teamData.players.filter((p: any) => !p.substitute);
            const subs = teamData.players.filter((p: any) => p.substitute);

            const gk = starters.filter((p: any) => p.position === 'G');
            const outfield = starters
              .filter((p: any) => p.position !== 'G')
              .sort((a: any, b: any) => (posOrder[a.position] ?? 4) - (posOrder[b.position] ?? 4));

            for (const p of gk) {
              if (!p.statistics || (p.statistics.minutesPlayed ?? 0) === 0) continue;
              await upsertPlayer(p, teamId);
              const row = mapPlayerStats(p, fixture.id, teamId, 'ARQ', formation, '1:1', cardMap.get(p.player.id));
              row.goals_conceded = side === 'home' ? (fixture.score_away ?? 0) : (fixture.score_home ?? 0);
              allRows.push(row);
            }

            for (let i = 0; i < outfield.length; i++) {
              const p = outfield[i];
              if (!p.statistics || (p.statistics.minutesPlayed ?? 0) === 0) continue;

              let position: Position | null = null;
              let grid: string | null = null;
              if (formation) {
                grid = buildSyntheticGrid(i, formation);
                position = grid ? mapGridToPosition(formation, grid) : null;
              }
              if (!position) position = sofascoreFallbackPosition(p.position);

              await upsertPlayer(p, teamId);
              allRows.push(mapPlayerStats(p, fixture.id, teamId, position, formation, grid, cardMap.get(p.player.id)));
            }

            for (const p of subs) {
              if (!p.statistics || (p.statistics.minutesPlayed ?? 0) === 0) continue;
              const position = sofascoreFallbackPosition(p.position);
              await upsertPlayer(p, teamId);
              allRows.push(mapPlayerStats(p, fixture.id, teamId, position, formation, null, cardMap.get(p.player.id)));
            }
          }

          for (const row of allRows) {
            const peers = allRows.filter(r => r.player_id !== row.player_id);
            row.match_score = calculateMatchScore(row, peers);
          }

          if (allRows.length > 0) {
            const deduped = [...new Map(allRows.map(r => [`${r.player_id}_${r.fixture_id}`, r])).values()];
            const { error } = await supabase.from('player_match_stats').upsert(deduped, { onConflict: 'player_id,fixture_id' });
            if (error) throw error;
            results.players_inserted += deduped.length;
          }

          await supabase.from('fixtures').update({ stats_synced: true }).eq('id', fixture.id);
          results.fixtures_synced++;
          console.log(`  Fixture ${fixture.id}: ${allRows.length} players`);
        } catch (err: any) {
          results.errors.push(`Fixture ${fixture.id}: ${err.message}`);
          if (err.message === 'SOFASCORE_BLOCKED') break;
        }
      }
    }
  } catch (err: any) {
    results.errors.push(`Fatal: ${err.message}`);
  } finally {
    await browser.close();
  }

  await supabase.from('sync_log').insert({
    function_name: 'sync-sofascore-gh',
    status: results.errors.length > 0 ? 'error' : 'success',
    error_message: results.errors.length > 0 ? results.errors.join('; ') : null,
    fixtures_processed: results.fixtures_synced,
  });

  console.log(JSON.stringify(results, null, 2));
  if (results.errors.length > 0) process.exit(1);
}

async function upsertPlayer(p: any, teamId: number) {
  await supabase.from('players').upsert({
    id: sofaId(p.player.id),
    name: p.player.name,
    photo: `https://api.sofascore.com/api/v1/player/${p.player.id}/image`,
    current_team_id: teamId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
}

main();
