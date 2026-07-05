# Auto-Scoring con API-Football — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace manual Wyscout CSV scoring with automatic match-by-match scoring using API-Football + Supabase, updating the entire platform.

**Architecture:** Supabase Edge Functions (Deno/TS) sync data from API-Football every hour via pg_cron. Player stats are stored in Supabase tables. A position-mapping algorithm converts formation grids into 8 detailed positions (ARQ/LD/CB/LI/VC/VI/EXT/DEL). Match scores (1.0-10.0 scale) are calculated per position with weighted metrics. The React frontend reads from Supabase instead of Google Sheets CSVs.

**Tech Stack:** React 18 + TypeScript + Vite 7 + Tailwind, Supabase (Edge Functions + pg_cron + PostgreSQL), API-Football v3 Pro plan, Recharts, Vitest

**Spec:** `docs/superpowers/specs/2025-05-21-auto-scoring-api-football-design.md`

---

## File Structure

### New files — Backend (Supabase Edge Functions)

```
supabase/
  migrations/
    001_scoring_schema.sql          -- All tables, indexes, RLS policies
  functions/
    _shared/
      types.ts                      -- Shared TypeScript types
      api-football.ts               -- API-Football HTTP client
      position-mapper.ts            -- Formation grid → 8 positions
      scoring.ts                    -- Weighted score calculation (1-10)
      supabase-client.ts            -- Supabase admin client
    sync-fixtures/
      index.ts                      -- Discover finished fixtures
    sync-player-stats/
      index.ts                      -- Fetch lineups + stats, map positions, score
    recalc-scores/
      index.ts                      -- Recalculate season averages + percentiles
    backfill-season/
      index.ts                      -- One-time backfill of full season
    verify-leagues/
      index.ts                      -- Test doubtful leagues for player stats
```

### New files — Frontend

```
src/
  types/scoring.ts                  -- New types for Supabase scoring data
  services/playerStatsService.ts    -- Supabase queries for player scoring data
  hooks/usePlayerStats.ts           -- React hooks with caching for scoring data
  components/charts/ScoreEvolutionChart.tsx  -- Weekly/monthly score evolution
  components/ui/PositionBar.tsx     -- Position distribution bar (clickable)
```

### Modified files — Frontend

```
src/
  types/index.ts                    -- Add new interfaces, update EnrichedPlayer
  context/DataContext.tsx            -- Add Supabase data source alongside CSV
  lib/supabase.ts                   -- No changes needed (client already exists)
  pages/PlayerDetailPage.tsx        -- Add PositionBar + ScoreEvolutionChart
  components/charts/GaugeScore.tsx  -- Support 1-10 scale
  components/charts/PlayerRadarChart.tsx -- New metrics from API-Football
  constants/scoring.ts              -- New SCORING_CONFIG for API-Football metrics
  pages/ExternalScoutingPage.tsx    -- Consume Supabase data
  pages/InternalScoutingPage.tsx    -- Consume Supabase data
  pages/OpportunitiesPage.tsx       -- Recalculated opportunity scores
  pages/ComparisonPage.tsx          -- New metrics
  pages/SimilarPlayersPage.tsx      -- New similarity algorithm
  pages/ScatterChartPage.tsx        -- New metric axes
  pages/RadarAnalysisPage.tsx       -- New radar metrics
  pages/BusquedaPage.tsx            -- Supabase search
  pages/DashboardPage.tsx           -- Aggregated stats from Supabase
  pages/MonitoringPage.tsx          -- Real score evolution
  pages/FormationPage.tsx           -- Updated player scores
```

---

## PHASE 1: BACKEND

---

### Task 1: Supabase Schema Migration

**Files:**
- Create: `supabase/migrations/001_scoring_schema.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase/migrations/001_scoring_schema.sql

-- ============================================================
-- LEAGUES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.leagues (
  id INTEGER PRIMARY KEY,  -- API-Football league ID
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  tier INTEGER NOT NULL DEFAULT 4 CHECK (tier BETWEEN 1 AND 6),
  season INTEGER NOT NULL DEFAULT 2025,
  has_player_stats BOOLEAN NOT NULL DEFAULT false,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TEAMS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.teams (
  id INTEGER PRIMARY KEY,  -- API-Football team ID
  name TEXT NOT NULL,
  logo TEXT,
  league_id INTEGER REFERENCES public.leagues(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_teams_league ON public.teams(league_id);

-- ============================================================
-- PLAYERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.players (
  id INTEGER PRIMARY KEY,  -- API-Football player ID
  name TEXT NOT NULL,
  photo TEXT,
  birth_date DATE,
  nationality TEXT,
  preferred_foot TEXT CHECK (preferred_foot IN ('left', 'right', 'both', NULL)),
  height_cm INTEGER,
  current_team_id INTEGER REFERENCES public.teams(id),
  primary_position TEXT CHECK (primary_position IN ('ARQ','LD','CB','LI','VC','VI','EXT','DEL')),
  position_distribution JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_players_team ON public.players(current_team_id);
CREATE INDEX idx_players_position ON public.players(primary_position);

-- ============================================================
-- FIXTURES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fixtures (
  id INTEGER PRIMARY KEY,  -- API-Football fixture ID
  league_id INTEGER NOT NULL REFERENCES public.leagues(id),
  season INTEGER NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  home_team_id INTEGER NOT NULL REFERENCES public.teams(id),
  away_team_id INTEGER NOT NULL REFERENCES public.teams(id),
  score_home INTEGER,
  score_away INTEGER,
  stats_synced BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fixtures_league_season ON public.fixtures(league_id, season);
CREATE INDEX idx_fixtures_unsynced ON public.fixtures(stats_synced) WHERE stats_synced = false;
CREATE INDEX idx_fixtures_date ON public.fixtures(date);

-- ============================================================
-- PLAYER MATCH STATS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.player_match_stats (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES public.players(id),
  fixture_id INTEGER NOT NULL REFERENCES public.fixtures(id),
  team_id INTEGER NOT NULL REFERENCES public.teams(id),
  detected_position TEXT CHECK (detected_position IN ('ARQ','LD','CB','LI','VC','VI','EXT','DEL')),
  formation TEXT,
  grid_position TEXT,
  minutes INTEGER NOT NULL DEFAULT 0,
  rating NUMERIC(3,1),
  is_substitute BOOLEAN NOT NULL DEFAULT false,
  goals INTEGER NOT NULL DEFAULT 0,
  assists INTEGER NOT NULL DEFAULT 0,
  shots_total INTEGER NOT NULL DEFAULT 0,
  shots_on INTEGER NOT NULL DEFAULT 0,
  passes_total INTEGER NOT NULL DEFAULT 0,
  passes_key INTEGER NOT NULL DEFAULT 0,
  passes_accuracy NUMERIC(5,2) NOT NULL DEFAULT 0,
  tackles INTEGER NOT NULL DEFAULT 0,
  blocks INTEGER NOT NULL DEFAULT 0,
  interceptions INTEGER NOT NULL DEFAULT 0,
  duels_total INTEGER NOT NULL DEFAULT 0,
  duels_won INTEGER NOT NULL DEFAULT 0,
  dribbles_attempted INTEGER NOT NULL DEFAULT 0,
  dribbles_success INTEGER NOT NULL DEFAULT 0,
  fouls_drawn INTEGER NOT NULL DEFAULT 0,
  fouls_committed INTEGER NOT NULL DEFAULT 0,
  yellow_cards INTEGER NOT NULL DEFAULT 0,
  red_cards INTEGER NOT NULL DEFAULT 0,
  penalty_won INTEGER NOT NULL DEFAULT 0,
  penalty_scored INTEGER NOT NULL DEFAULT 0,
  penalty_missed INTEGER NOT NULL DEFAULT 0,
  penalty_saved INTEGER NOT NULL DEFAULT 0,
  saves INTEGER NOT NULL DEFAULT 0,
  goals_conceded INTEGER NOT NULL DEFAULT 0,
  match_score NUMERIC(3,1),  -- 1.0-10.0, NULL if <10 min
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(player_id, fixture_id)
);

CREATE INDEX idx_pms_fixture ON public.player_match_stats(fixture_id);
CREATE INDEX idx_pms_position_team ON public.player_match_stats(detected_position, team_id);
CREATE INDEX idx_pms_player_score ON public.player_match_stats(player_id, match_score) WHERE match_score IS NOT NULL;

-- ============================================================
-- PLAYER SEASON SCORES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.player_season_scores (
  player_id INTEGER NOT NULL REFERENCES public.players(id),
  season INTEGER NOT NULL,
  position TEXT NOT NULL CHECK (position IN ('ARQ','LD','CB','LI','VC','VI','EXT','DEL')),
  league_id INTEGER NOT NULL REFERENCES public.leagues(id),
  matches_played INTEGER NOT NULL DEFAULT 0,
  avg_score NUMERIC(3,1),  -- 1.0-10.0
  avg_rating NUMERIC(3,1),
  total_goals INTEGER NOT NULL DEFAULT 0,
  total_assists INTEGER NOT NULL DEFAULT 0,
  percentile NUMERIC(5,2),      -- 0-100 within position in league
  global_percentile NUMERIC(5,2), -- 0-100 cross-league
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, season, position, league_id)
);

CREATE INDEX idx_pss_league_position ON public.player_season_scores(league_id, position);
CREATE INDEX idx_pss_score ON public.player_season_scores(position, avg_score);

-- ============================================================
-- SYNC LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sync_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  league_id INTEGER,
  fixture_id INTEGER,
  function_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','success','error','no_stats')),
  error_message TEXT,
  fixtures_processed INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_log_status ON public.sync_log(status, created_at);

-- ============================================================
-- RLS POLICIES (public read, service_role write)
-- ============================================================
ALTER TABLE public.leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixtures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_match_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_season_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;

-- Read access for authenticated users
CREATE POLICY "read_leagues" ON public.leagues FOR SELECT USING (true);
CREATE POLICY "read_teams" ON public.teams FOR SELECT USING (true);
CREATE POLICY "read_players" ON public.players FOR SELECT USING (true);
CREATE POLICY "read_fixtures" ON public.fixtures FOR SELECT USING (true);
CREATE POLICY "read_pms" ON public.player_match_stats FOR SELECT USING (true);
CREATE POLICY "read_pss" ON public.player_season_scores FOR SELECT USING (true);
CREATE POLICY "read_sync" ON public.sync_log FOR SELECT USING (true);

-- Write access for service_role only (Edge Functions use service_role)
CREATE POLICY "write_leagues" ON public.leagues FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "write_teams" ON public.teams FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "write_players" ON public.players FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "write_fixtures" ON public.fixtures FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "write_pms" ON public.player_match_stats FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "write_pss" ON public.player_season_scores FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "write_sync" ON public.sync_log FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- SEED: Initial leagues
-- ============================================================
INSERT INTO public.leagues (id, name, country, tier, season, has_player_stats) VALUES
  -- Confirmed leagues
  (39,  'Premier League',         'England',     1, 2025, true),
  (140, 'La Liga',                'Spain',       1, 2025, true),
  (135, 'Serie A',                'Italy',       1, 2025, true),
  (61,  'Ligue 1',               'France',      1, 2025, true),
  (78,  'Bundesliga',            'Germany',      1, 2025, true),
  (94,  'Primeira Liga',         'Portugal',     2, 2025, true),
  (88,  'Eredivisie',            'Netherlands',  2, 2025, true),
  (2,   'Champions League',      'Europe',       1, 2025, true),
  (3,   'Europa League',         'Europe',       2, 2025, true),
  (128, 'Liga Profesional',      'Argentina',    4, 2025, true),
  (71,  'Serie A',               'Brazil',       4, 2025, true),
  (253, 'MLS',                   'USA',          3, 2025, true),
  (262, 'Liga MX',               'Mexico',       3, 2025, true),
  (13,  'Copa Libertadores',     'South America',4, 2025, true),
  -- To verify
  (131, 'Primera Nacional',      'Argentina',    6, 2025, false),
  (268, 'Primera Division',      'Uruguay',      5, 2025, false),
  (279, 'Primera Division',      'Paraguay',     5, 2025, false),
  (265, 'Primera Division',      'Chile',        5, 2025, false),
  (239, 'Liga BetPlay',          'Colombia',     4, 2025, false),
  (242, 'Liga Pro',              'Ecuador',      5, 2025, false),
  (11,  'Copa Sudamericana',     'South America',4, 2025, false),
  (130, 'Copa Argentina',        'Argentina',    4, 2025, false),
  (143, 'Copa del Rey',          'Spain',        1, 2025, false)
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: Run migration in Supabase**

Go to Supabase Dashboard → SQL Editor → paste and run the migration.
Alternatively, if using Supabase CLI:

```bash
supabase db push
```

- [ ] **Step 3: Verify tables exist**

Run in Supabase SQL Editor:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('leagues','teams','players','fixtures','player_match_stats','player_season_scores','sync_log')
ORDER BY table_name;
```

Expected: 7 rows returned.

- [ ] **Step 4: Verify seed data**

```sql
SELECT id, name, country, has_player_stats FROM public.leagues ORDER BY id;
```

Expected: 23 leagues, 14 with `has_player_stats = true`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/001_scoring_schema.sql
git commit -m "feat: add scoring schema — leagues, players, fixtures, match stats tables"
```

---

### Task 2: Shared Types and API-Football Client

**Files:**
- Create: `supabase/functions/_shared/types.ts`
- Create: `supabase/functions/_shared/api-football.ts`
- Create: `supabase/functions/_shared/supabase-client.ts`

- [ ] **Step 1: Create shared types**

```typescript
// supabase/functions/_shared/types.ts

export type Position = 'ARQ' | 'LD' | 'CB' | 'LI' | 'VC' | 'VI' | 'EXT' | 'DEL';

export type LineRole = 'DEF' | 'MID' | 'MID_DEF' | 'MID_ATK' | 'ATK';

export interface ApiFixture {
  fixture: { id: number; date: string; status: { short: string } };
  league: { id: number; season: number };
  teams: {
    home: { id: number; name: string; logo: string };
    away: { id: number; name: string; logo: string };
  };
  goals: { home: number | null; away: number | null };
}

export interface ApiLineupPlayer {
  player: { id: number; name: string; number: number; pos: string; grid: string | null };
}

export interface ApiLineup {
  team: { id: number; name: string };
  formation: string | null;
  startXI: { player: ApiLineupPlayer['player'] }[];
  substitutes: { player: ApiLineupPlayer['player'] }[];
}

export interface ApiPlayerStats {
  player: { id: number; name: string; photo: string };
  statistics: Array<{
    games: {
      minutes: number | null;
      number: number | null;
      position: string | null;
      rating: string | null;
      captain: boolean;
      substitute: boolean;
    };
    offsides: number | null;
    shots: { total: number | null; on: number | null };
    goals: { total: number | null; conceded: number | null; assists: number | null; saves: number | null };
    passes: { total: number | null; key: number | null; accuracy: string | null };
    tackles: { total: number | null; blocks: number | null; interceptions: number | null };
    duels: { total: number | null; won: number | null };
    dribbles: { attempts: number | null; success: number | null; past: number | null };
    fouls: { drawn: number | null; committed: number | null };
    cards: { yellow: number; yellowred: number; red: number };
    penalty: {
      won: number | null; committed: number | null;
      scored: number | null; missed: number | null; saved: number | null;
    };
  }>;
}

export interface PlayerMatchRow {
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

export interface ScoringWeight {
  metric: string;
  weight: number;
  source: (row: PlayerMatchRow) => number;
  inverse?: boolean; // lower is better
  per90?: boolean;   // normalize to /90 min
  isPercentage?: boolean; // already 0-100, don't per90
}
```

- [ ] **Step 2: Create API-Football HTTP client**

```typescript
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
```

- [ ] **Step 3: Create Supabase admin client**

```typescript
// supabase/functions/_shared/supabase-client.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/
git commit -m "feat: add shared types, API-Football client, Supabase admin client"
```

---

### Task 3: Position Mapping Module

**Files:**
- Create: `supabase/functions/_shared/position-mapper.ts`
- Create: `supabase/functions/_shared/position-mapper.test.ts`

- [ ] **Step 1: Write tests for position mapping**

```typescript
// supabase/functions/_shared/position-mapper.test.ts

import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { mapGridToPosition, parseFormationLines, assignLineRoles } from './position-mapper.ts';

// --- parseFormationLines ---
Deno.test('parseFormationLines: 4-3-3', () => {
  assertEquals(parseFormationLines('4-3-3'), [4, 3, 3]);
});
Deno.test('parseFormationLines: 4-2-3-1', () => {
  assertEquals(parseFormationLines('4-2-3-1'), [4, 2, 3, 1]);
});
Deno.test('parseFormationLines: 3-5-2', () => {
  assertEquals(parseFormationLines('3-5-2'), [3, 5, 2]);
});

// --- assignLineRoles ---
Deno.test('assignLineRoles: 4-3-3 => DEF, MID, ATK', () => {
  assertEquals(assignLineRoles([4, 3, 3]), ['DEF', 'MID', 'ATK']);
});
Deno.test('assignLineRoles: 4-2-3-1 => DEF, MID_DEF, MID_ATK, ATK', () => {
  assertEquals(assignLineRoles([4, 2, 3, 1]), ['DEF', 'MID_DEF', 'MID_ATK', 'ATK']);
});
Deno.test('assignLineRoles: 3-5-2 => DEF, MID, ATK', () => {
  assertEquals(assignLineRoles([3, 5, 2]), ['DEF', 'MID', 'ATK']);
});
Deno.test('assignLineRoles: 4-1-4-1 => DEF, MID_DEF, MID_ATK, ATK', () => {
  assertEquals(assignLineRoles([4, 1, 4, 1]), ['DEF', 'MID_DEF', 'MID_ATK', 'ATK']);
});
Deno.test('assignLineRoles: 5-3-2 => DEF, MID, ATK', () => {
  assertEquals(assignLineRoles([5, 3, 2]), ['DEF', 'MID', 'ATK']);
});
Deno.test('assignLineRoles: 4-3-1-2 => DEF, MID, MID_ATK, ATK', () => {
  assertEquals(assignLineRoles([4, 3, 1, 2]), ['DEF', 'MID', 'MID_ATK', 'ATK']);
});
Deno.test('assignLineRoles: 5-4-1 => DEF, MID, ATK', () => {
  assertEquals(assignLineRoles([5, 4, 1]), ['DEF', 'MID', 'ATK']);
});

// --- mapGridToPosition: 4-3-3 ---
Deno.test('4-3-3: row 2 col 1 = LI', () => {
  assertEquals(mapGridToPosition('4-3-3', '2:1'), 'LI');
});
Deno.test('4-3-3: row 2 col 2 = CB', () => {
  assertEquals(mapGridToPosition('4-3-3', '2:2'), 'CB');
});
Deno.test('4-3-3: row 2 col 3 = CB', () => {
  assertEquals(mapGridToPosition('4-3-3', '2:3'), 'CB');
});
Deno.test('4-3-3: row 2 col 4 = LD', () => {
  assertEquals(mapGridToPosition('4-3-3', '2:4'), 'LD');
});
Deno.test('4-3-3: row 3 col 1 = VI', () => {
  assertEquals(mapGridToPosition('4-3-3', '3:1'), 'VI');
});
Deno.test('4-3-3: row 3 col 2 = VC', () => {
  assertEquals(mapGridToPosition('4-3-3', '3:2'), 'VC');
});
Deno.test('4-3-3: row 3 col 3 = VI', () => {
  assertEquals(mapGridToPosition('4-3-3', '3:3'), 'VI');
});
Deno.test('4-3-3: row 4 col 1 = EXT', () => {
  assertEquals(mapGridToPosition('4-3-3', '4:1'), 'EXT');
});
Deno.test('4-3-3: row 4 col 2 = DEL', () => {
  assertEquals(mapGridToPosition('4-3-3', '4:2'), 'DEL');
});
Deno.test('4-3-3: row 4 col 3 = EXT', () => {
  assertEquals(mapGridToPosition('4-3-3', '4:3'), 'EXT');
});

// --- mapGridToPosition: 4-2-3-1 ---
Deno.test('4-2-3-1: row 2 col 1 = LI', () => {
  assertEquals(mapGridToPosition('4-2-3-1', '2:1'), 'LI');
});
Deno.test('4-2-3-1: row 2 col 4 = LD', () => {
  assertEquals(mapGridToPosition('4-2-3-1', '2:4'), 'LD');
});
Deno.test('4-2-3-1: row 3 col 1 = VC', () => {
  assertEquals(mapGridToPosition('4-2-3-1', '3:1'), 'VC');
});
Deno.test('4-2-3-1: row 3 col 2 = VC', () => {
  assertEquals(mapGridToPosition('4-2-3-1', '3:2'), 'VC');
});
Deno.test('4-2-3-1: row 4 col 1 = EXT (left)', () => {
  assertEquals(mapGridToPosition('4-2-3-1', '4:1'), 'EXT');
});
Deno.test('4-2-3-1: row 4 col 2 = VI (enganche)', () => {
  assertEquals(mapGridToPosition('4-2-3-1', '4:2'), 'VI');
});
Deno.test('4-2-3-1: row 4 col 3 = EXT (right)', () => {
  assertEquals(mapGridToPosition('4-2-3-1', '4:3'), 'EXT');
});
Deno.test('4-2-3-1: row 5 col 1 = DEL', () => {
  assertEquals(mapGridToPosition('4-2-3-1', '5:1'), 'DEL');
});

// --- mapGridToPosition: 3-5-2 ---
Deno.test('3-5-2: row 2 col 1 = CB', () => {
  assertEquals(mapGridToPosition('3-5-2', '2:1'), 'CB');
});
Deno.test('3-5-2: row 2 col 3 = CB', () => {
  assertEquals(mapGridToPosition('3-5-2', '2:3'), 'CB');
});
Deno.test('3-5-2: row 3 col 1 = LI (carrilero)', () => {
  assertEquals(mapGridToPosition('3-5-2', '3:1'), 'LI');
});
Deno.test('3-5-2: row 3 col 5 = LD (carrilero)', () => {
  assertEquals(mapGridToPosition('3-5-2', '3:5'), 'LD');
});
Deno.test('3-5-2: row 3 col 3 = VC', () => {
  assertEquals(mapGridToPosition('3-5-2', '3:3'), 'VC');
});
Deno.test('3-5-2: row 3 col 2 = VI', () => {
  assertEquals(mapGridToPosition('3-5-2', '3:2'), 'VI');
});
Deno.test('3-5-2: row 3 col 4 = VI', () => {
  assertEquals(mapGridToPosition('3-5-2', '3:4'), 'VI');
});
Deno.test('3-5-2: row 4 col 1 = DEL', () => {
  assertEquals(mapGridToPosition('3-5-2', '4:1'), 'DEL');
});
Deno.test('3-5-2: row 4 col 2 = DEL', () => {
  assertEquals(mapGridToPosition('3-5-2', '4:2'), 'DEL');
});

// --- mapGridToPosition: 5-3-2 ---
Deno.test('5-3-2: row 2 col 1 = LI', () => {
  assertEquals(mapGridToPosition('5-3-2', '2:1'), 'LI');
});
Deno.test('5-3-2: row 2 col 5 = LD', () => {
  assertEquals(mapGridToPosition('5-3-2', '2:5'), 'LD');
});
Deno.test('5-3-2: row 2 col 3 = CB', () => {
  assertEquals(mapGridToPosition('5-3-2', '2:3'), 'CB');
});

// --- mapGridToPosition: 4-4-2 ---
Deno.test('4-4-2: row 3 col 1 = VI (not EXT, midfield line)', () => {
  assertEquals(mapGridToPosition('4-4-2', '3:1'), 'VI');
});
Deno.test('4-4-2: row 3 col 2 = VC', () => {
  assertEquals(mapGridToPosition('4-4-2', '3:2'), 'VC');
});
Deno.test('4-4-2: row 4 col 1 = DEL', () => {
  assertEquals(mapGridToPosition('4-4-2', '4:1'), 'DEL');
});
Deno.test('4-4-2: row 4 col 2 = DEL', () => {
  assertEquals(mapGridToPosition('4-4-2', '4:2'), 'DEL');
});

// --- GK always ARQ ---
Deno.test('row 1 = ARQ regardless of formation', () => {
  assertEquals(mapGridToPosition('4-3-3', '1:1'), 'ARQ');
  assertEquals(mapGridToPosition('3-5-2', '1:1'), 'ARQ');
  assertEquals(mapGridToPosition('4-2-3-1', '1:1'), 'ARQ');
});

// --- Fallback ---
Deno.test('null grid returns null', () => {
  assertEquals(mapGridToPosition('4-3-3', null), null);
});
Deno.test('null formation returns null', () => {
  assertEquals(mapGridToPosition(null, '2:1'), null);
});

// --- 4-1-4-1 ---
Deno.test('4-1-4-1: row 3 col 1 = VC (single pivot)', () => {
  assertEquals(mapGridToPosition('4-1-4-1', '3:1'), 'VC');
});
Deno.test('4-1-4-1: row 4 col 1 = EXT (wide MID_ATK)', () => {
  assertEquals(mapGridToPosition('4-1-4-1', '4:1'), 'EXT');
});
Deno.test('4-1-4-1: row 4 col 2 = VI', () => {
  assertEquals(mapGridToPosition('4-1-4-1', '4:2'), 'VI');
});
Deno.test('4-1-4-1: row 4 col 3 = VI', () => {
  assertEquals(mapGridToPosition('4-1-4-1', '4:3'), 'VI');
});
Deno.test('4-1-4-1: row 4 col 4 = EXT', () => {
  assertEquals(mapGridToPosition('4-1-4-1', '4:4'), 'EXT');
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd supabase/functions/_shared && deno test position-mapper.test.ts
```

Expected: Compilation errors — module not found.

- [ ] **Step 3: Implement position mapping**

```typescript
// supabase/functions/_shared/position-mapper.ts

import type { Position, LineRole } from './types.ts';

export function parseFormationLines(formation: string): number[] {
  return formation.split('-').map(Number);
}

export function assignLineRoles(lines: number[]): LineRole[] {
  if (lines.length === 3) {
    return ['DEF', 'MID', 'ATK'];
  }

  if (lines.length === 4) {
    const [l1, l2, l3, l4] = lines;

    // 4-2-3-1: DEF, MID_DEF(pivot), MID_ATK(enganche+wings), ATK
    if (l1 >= 4 && l2 <= 2 && l3 >= 3 && l4 <= 1) {
      return ['DEF', 'MID_DEF', 'MID_ATK', 'ATK'];
    }
    // 4-1-4-1: DEF, MID_DEF(single pivot), MID_ATK(4), ATK
    if (l1 >= 4 && l2 === 1 && l3 >= 4 && l4 <= 1) {
      return ['DEF', 'MID_DEF', 'MID_ATK', 'ATK'];
    }
    // 4-3-1-2: DEF, MID, MID_ATK(enganche), ATK
    if (l1 >= 3 && l2 >= 3 && l3 <= 2 && l4 >= 2) {
      return ['DEF', 'MID', 'MID_ATK', 'ATK'];
    }

    return ['DEF', 'MID_DEF', 'MID_ATK', 'ATK'];
  }

  // Fallback for 5+ segments (very rare): first = DEF, last = ATK, middle = MID
  const roles: LineRole[] = ['DEF'];
  for (let i = 1; i < lines.length - 1; i++) roles.push('MID');
  roles.push('ATK');
  return roles;
}

function mapDefLine(col: number, cols: number[]): Position {
  const sorted = [...cols].sort((a, b) => a - b);
  if (sorted.length === 3) return 'CB';
  if (col === sorted[0]) return 'LI';
  if (col === sorted[sorted.length - 1]) return 'LD';
  return 'CB';
}

function mapMidLine(col: number, cols: number[], defLineSize: number): Position {
  const sorted = [...cols].sort((a, b) => a - b);
  const n = sorted.length;

  // 5-man midfield with 3-back: wide players are wing-backs (LD/LI)
  if (n === 5 && defLineSize === 3) {
    if (col === sorted[0]) return 'LI';
    if (col === sorted[n - 1]) return 'LD';
    const mid = Math.floor(n / 2);
    if (col === sorted[mid]) return 'VC';
    return 'VI';
  }

  if (n <= 2) return 'VC';

  if (n === 3) {
    const mid = sorted[1];
    if (col === mid) return 'VC';
    return 'VI';
  }

  // 4-man midfield: 2 central = VC, 2 wide = VI
  if (n === 4) {
    if (col === sorted[0] || col === sorted[n - 1]) return 'VI';
    return 'VC';
  }

  // 5+ without 3-back: center = VC, rest = VI
  const mid = sorted[Math.floor(n / 2)];
  if (col === mid) return 'VC';
  return 'VI';
}

function mapMidDefLine(col: number, cols: number[]): Position {
  const sorted = [...cols].sort((a, b) => a - b);
  if (sorted.length <= 2) return 'VC';
  const mid = sorted[Math.floor(sorted.length / 2)];
  if (col === mid) return 'VC';
  return 'VI';
}

function mapMidAtkLine(col: number, cols: number[]): Position {
  const sorted = [...cols].sort((a, b) => a - b);
  const n = sorted.length;

  if (n === 1) return 'VI'; // enganche
  if (n === 2) return 'VI';

  if (n === 3) {
    // costados = EXT, centro = VI (enganche)
    if (col === sorted[0] || col === sorted[n - 1]) return 'EXT';
    return 'VI';
  }

  if (n === 4) {
    // extremos = EXT, centrales = VI
    if (col === sorted[0] || col === sorted[n - 1]) return 'EXT';
    return 'VI';
  }

  if (col === sorted[0] || col === sorted[n - 1]) return 'EXT';
  return 'VI';
}

function mapAtkLine(col: number, cols: number[]): Position {
  const sorted = [...cols].sort((a, b) => a - b);
  if (sorted.length <= 2) return 'DEL';

  // 3 attackers: wide = EXT, center = DEL
  if (col === sorted[0] || col === sorted[sorted.length - 1]) return 'EXT';
  return 'DEL';
}

export function mapGridToPosition(
  formation: string | null,
  grid: string | null,
): Position | null {
  if (!formation || !grid) return null;

  const [rowStr, colStr] = grid.split(':');
  const row = parseInt(rowStr, 10);
  const col = parseInt(colStr, 10);

  if (row === 1) return 'ARQ';

  const lines = parseFormationLines(formation);
  const roles = assignLineRoles(lines);

  const lineIndex = row - 2; // row 2 = first outfield line (index 0)
  if (lineIndex < 0 || lineIndex >= roles.length) return null;

  const role = roles[lineIndex];
  const lineSize = lines[lineIndex];

  // Build the column list for this row: 1..lineSize
  const cols = Array.from({ length: lineSize }, (_, i) => i + 1);

  const defLineSize = lines[0]; // first outfield line is always DEF

  switch (role) {
    case 'DEF': return mapDefLine(col, cols);
    case 'MID': return mapMidLine(col, cols, defLineSize);
    case 'MID_DEF': return mapMidDefLine(col, cols);
    case 'MID_ATK': return mapMidAtkLine(col, cols);
    case 'ATK': return mapAtkLine(col, cols);
  }
}

export function fallbackPosition(apiPosition: string | null): Position | null {
  switch (apiPosition) {
    case 'G': return 'ARQ';
    case 'D': return 'CB';
    case 'M': return 'VC';
    case 'F': return 'DEL';
    default: return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd supabase/functions/_shared && deno test position-mapper.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/position-mapper.ts supabase/functions/_shared/position-mapper.test.ts
git commit -m "feat: position mapping algorithm — formation grid to 8 positions with tests"
```

---

### Task 4: Scoring Calculation Module

**Files:**
- Create: `supabase/functions/_shared/scoring.ts`
- Create: `supabase/functions/_shared/scoring.test.ts`

- [ ] **Step 1: Write tests for scoring**

```typescript
// supabase/functions/_shared/scoring.test.ts

import { assertEquals, assertAlmostEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { calculateMatchScore, normalizeToScale, SCORING_WEIGHTS } from './scoring.ts';
import type { PlayerMatchRow } from './types.ts';

function makeRow(overrides: Partial<PlayerMatchRow>): PlayerMatchRow {
  return {
    player_id: 1, fixture_id: 1, team_id: 1,
    detected_position: 'DEL', formation: '4-3-3', grid_position: '4:2',
    minutes: 90, rating: 7.0, is_substitute: false,
    goals: 0, assists: 0, shots_total: 0, shots_on: 0,
    passes_total: 0, passes_key: 0, passes_accuracy: 0,
    tackles: 0, blocks: 0, interceptions: 0,
    duels_total: 0, duels_won: 0,
    dribbles_attempted: 0, dribbles_success: 0,
    fouls_drawn: 0, fouls_committed: 0,
    yellow_cards: 0, red_cards: 0,
    penalty_won: 0, penalty_scored: 0, penalty_missed: 0, penalty_saved: 0,
    saves: 0, goals_conceded: 0,
    match_score: null,
    ...overrides,
  };
}

Deno.test('SCORING_WEIGHTS: all positions sum to 100', () => {
  for (const [pos, weights] of Object.entries(SCORING_WEIGHTS)) {
    const total = weights.reduce((s, w) => s + w.weight, 0);
    assertEquals(total, 100, `${pos} weights sum to ${total}, expected 100`);
  }
});

Deno.test('SCORING_WEIGHTS: all 8 positions defined', () => {
  const positions = Object.keys(SCORING_WEIGHTS);
  assertEquals(positions.sort(), ['ARQ','CB','DEL','EXT','LD','LI','VC','VI']);
});

Deno.test('normalizeToScale: 0 -> 1.0, 100 -> 10.0, 50 -> 5.5', () => {
  assertAlmostEquals(normalizeToScale(0), 1.0, 0.01);
  assertAlmostEquals(normalizeToScale(100), 10.0, 0.01);
  assertAlmostEquals(normalizeToScale(50), 5.5, 0.01);
});

Deno.test('calculateMatchScore: DEL with 2 goals in 90 min scores high', () => {
  const delRow = makeRow({ detected_position: 'DEL', goals: 2, minutes: 90, shots_on: 3, shots_total: 5, rating: 8.5 });
  const peers = [
    makeRow({ goals: 0, minutes: 90, rating: 6.5 }),
    makeRow({ goals: 0, minutes: 90, rating: 6.0 }),
    makeRow({ goals: 1, minutes: 90, rating: 7.0 }),
  ];
  const score = calculateMatchScore(delRow, peers);
  // Should be well above average (>5.5) given 2 goals vs peers with 0-1
  assertEquals(score !== null, true);
  assertEquals(score! > 7.0, true);
});

Deno.test('calculateMatchScore: returns null if minutes < 10', () => {
  const row = makeRow({ minutes: 5 });
  const score = calculateMatchScore(row, []);
  assertEquals(score, null);
});

Deno.test('calculateMatchScore: ARQ with clean sheet and saves', () => {
  const arqRow = makeRow({
    detected_position: 'ARQ', goals_conceded: 0, saves: 5,
    minutes: 90, rating: 7.5, duels_total: 2, duels_won: 1,
  });
  const peers = [
    makeRow({ detected_position: 'ARQ', goals_conceded: 2, saves: 3, minutes: 90, rating: 6.0, duels_total: 3, duels_won: 1 }),
    makeRow({ detected_position: 'ARQ', goals_conceded: 1, saves: 4, minutes: 90, rating: 6.5, duels_total: 2, duels_won: 1 }),
  ];
  const score = calculateMatchScore(arqRow, peers);
  assertEquals(score !== null, true);
  assertEquals(score! > 6.0, true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd supabase/functions/_shared && deno test scoring.test.ts
```

Expected: Compilation error — module not found.

- [ ] **Step 3: Implement scoring calculation**

```typescript
// supabase/functions/_shared/scoring.ts

import type { Position, PlayerMatchRow, ScoringWeight } from './types.ts';

const MIN_MINUTES = 10;

function per90(value: number, minutes: number): number {
  if (minutes <= 0) return 0;
  return (value / minutes) * 90;
}

function pct(num: number, den: number): number {
  if (den <= 0) return 0;
  return (num / den) * 100;
}

export const SCORING_WEIGHTS: Record<Position, ScoringWeight[]> = {
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

  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  const below = lo;

  lo = 0;
  hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  const belowOrEqual = lo;
  const equal = belowOrEqual - below;

  const rank = below + (equal - 1) / 2;
  return Math.min(100, Math.max(0, (rank / (n - 1)) * 100));
}

export function normalizeToScale(raw: number): number {
  return Math.round((1 + (raw * 9) / 100) * 10) / 10;
}

export function calculateMatchScore(
  row: PlayerMatchRow,
  peers: PlayerMatchRow[],
): number | null {
  if (row.minutes < MIN_MINUTES) return null;

  const position = row.detected_position;
  if (!position || !(position in SCORING_WEIGHTS)) return null;

  const weights = SCORING_WEIGHTS[position];
  const allRows = [row, ...peers.filter(p =>
    p.detected_position === position && p.minutes >= MIN_MINUTES
  )];

  if (allRows.length <= 1) {
    // Not enough peers to rank — use rating as proxy
    const rating = row.rating ?? 5.0;
    return Math.round(Math.min(10, Math.max(1, rating)) * 10) / 10;
  }

  let scoreRaw = 0;

  for (const w of weights) {
    const values = allRows.map(r => w.source(r));
    if (w.inverse) {
      for (let i = 0; i < values.length; i++) values[i] = -values[i];
    }
    const sorted = [...values].sort((a, b) => a - b);
    const playerValue = w.inverse ? -w.source(row) : w.source(row);
    const normalized = rankNormalize(playerValue, sorted);
    scoreRaw += normalized * (w.weight / 100);
  }

  return normalizeToScale(scoreRaw);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd supabase/functions/_shared && deno test scoring.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/scoring.ts supabase/functions/_shared/scoring.test.ts
git commit -m "feat: scoring calculation — weighted metrics per position, 1-10 scale"
```

---

### Task 5: Edge Function — sync-fixtures

**Files:**
- Create: `supabase/functions/sync-fixtures/index.ts`

- [ ] **Step 1: Implement sync-fixtures**

```typescript
// supabase/functions/sync-fixtures/index.ts

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { getSupabaseAdmin } from '../_shared/supabase-client.ts';
import { fetchFinishedFixtures } from '../_shared/api-football.ts';

serve(async () => {
  const supabase = getSupabaseAdmin();
  const results = { processed: 0, inserted: 0, errors: [] as string[] };

  try {
    const { data: leagues } = await supabase
      .from('leagues')
      .select('id, season, last_synced_at')
      .order('id');

    if (!leagues || leagues.length === 0) {
      return new Response(JSON.stringify({ message: 'No leagues configured' }), { status: 200 });
    }

    const today = new Date().toISOString().split('T')[0];

    for (const league of leagues) {
      try {
        const fromDate = league.last_synced_at
          ? new Date(league.last_synced_at).toISOString().split('T')[0]
          : new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0]; // 2 weeks back

        const fixtures = await fetchFinishedFixtures(league.id, league.season, fromDate, today);

        for (const f of fixtures) {
          const { error } = await supabase.from('fixtures').upsert({
            id: f.fixture.id,
            league_id: league.id,
            season: league.season,
            date: f.fixture.date,
            home_team_id: f.teams.home.id,
            away_team_id: f.teams.away.id,
            score_home: f.goals.home,
            score_away: f.goals.away,
            stats_synced: false,
          }, { onConflict: 'id', ignoreDuplicates: false });

          if (!error) results.inserted++;

          // Upsert teams
          await supabase.from('teams').upsert([
            { id: f.teams.home.id, name: f.teams.home.name, logo: f.teams.home.logo, league_id: league.id },
            { id: f.teams.away.id, name: f.teams.away.name, logo: f.teams.away.logo, league_id: league.id },
          ], { onConflict: 'id' });
        }

        await supabase.from('leagues').update({ last_synced_at: new Date().toISOString() })
          .eq('id', league.id);

        results.processed++;
      } catch (err) {
        const msg = `League ${league.id}: ${(err as Error).message}`;
        results.errors.push(msg);
        if ((err as Error).message === 'RATE_LIMITED') break;
      }
    }

    await supabase.from('sync_log').insert({
      function_name: 'sync-fixtures',
      status: results.errors.length > 0 ? 'error' : 'success',
      error_message: results.errors.length > 0 ? results.errors.join('; ') : null,
      fixtures_processed: results.inserted,
    });

    return new Response(JSON.stringify(results), { status: 200 });
  } catch (err) {
    await supabase.from('sync_log').insert({
      function_name: 'sync-fixtures',
      status: 'error',
      error_message: (err as Error).message,
    });
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/sync-fixtures/
git commit -m "feat: sync-fixtures edge function — discovers finished matches"
```

---

### Task 6: Edge Function — sync-player-stats

**Files:**
- Create: `supabase/functions/sync-player-stats/index.ts`

- [ ] **Step 1: Implement sync-player-stats**

```typescript
// supabase/functions/sync-player-stats/index.ts

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { getSupabaseAdmin } from '../_shared/supabase-client.ts';
import { fetchLineups, fetchFixturePlayers } from '../_shared/api-football.ts';
import { mapGridToPosition, fallbackPosition } from '../_shared/position-mapper.ts';
import { calculateMatchScore } from '../_shared/scoring.ts';
import type { PlayerMatchRow } from '../_shared/types.ts';

const BATCH_SIZE = 15;

serve(async () => {
  const supabase = getSupabaseAdmin();
  const results = { fixtures_processed: 0, players_inserted: 0, errors: [] as string[] };

  try {
    // Get unsynced fixtures
    const { data: fixtures } = await supabase
      .from('fixtures')
      .select('id, league_id, season')
      .eq('stats_synced', false)
      .order('date', { ascending: true })
      .limit(BATCH_SIZE);

    if (!fixtures || fixtures.length === 0) {
      return new Response(JSON.stringify({ message: 'No fixtures to sync' }), { status: 200 });
    }

    for (const fixture of fixtures) {
      try {
        const [lineups, playerStats] = await Promise.all([
          fetchLineups(fixture.id),
          fetchFixturePlayers(fixture.id),
        ]);

        // Build grid map from lineups: playerId -> { grid, formation, teamId }
        const gridMap = new Map<number, { grid: string | null; formation: string | null; teamId: number; isSub: boolean }>();

        for (const lineup of lineups) {
          const formation = lineup.formation;
          for (const entry of lineup.startXI) {
            gridMap.set(entry.player.id, {
              grid: entry.player.grid,
              formation,
              teamId: lineup.team.id,
              isSub: false,
            });
          }
          for (const entry of lineup.substitutes) {
            gridMap.set(entry.player.id, {
              grid: entry.player.grid,
              formation,
              teamId: lineup.team.id,
              isSub: true,
            });
          }
        }

        // Build all player rows for this fixture
        const allRows: PlayerMatchRow[] = [];

        for (const teamData of playerStats) {
          for (const p of teamData.players) {
            const stats = p.statistics[0];
            if (!stats) continue;

            const minutes = stats.games.minutes ?? 0;
            const gridInfo = gridMap.get(p.player.id);
            const formation = gridInfo?.formation ?? null;
            const grid = gridInfo?.grid ?? null;
            const isSub = gridInfo?.isSub ?? stats.games.substitute;

            // Map position from grid, fallback to API generic position
            let position = mapGridToPosition(formation, grid);
            if (!position) {
              position = fallbackPosition(stats.games.position);
            }

            // Upsert player
            await supabase.from('players').upsert({
              id: p.player.id,
              name: p.player.name,
              photo: p.player.photo,
              current_team_id: teamData.team.id,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'id' });

            const row: PlayerMatchRow = {
              player_id: p.player.id,
              fixture_id: fixture.id,
              team_id: teamData.team.id,
              detected_position: position,
              formation,
              grid_position: grid,
              minutes,
              rating: stats.games.rating ? parseFloat(stats.games.rating) : null,
              is_substitute: isSub,
              goals: stats.goals.total ?? 0,
              assists: stats.goals.assists ?? 0,
              shots_total: stats.shots.total ?? 0,
              shots_on: stats.shots.on ?? 0,
              passes_total: stats.passes.total ?? 0,
              passes_key: stats.passes.key ?? 0,
              passes_accuracy: stats.passes.accuracy ? parseFloat(stats.passes.accuracy) : 0,
              tackles: stats.tackles.total ?? 0,
              blocks: stats.tackles.blocks ?? 0,
              interceptions: stats.tackles.interceptions ?? 0,
              duels_total: stats.duels.total ?? 0,
              duels_won: stats.duels.won ?? 0,
              dribbles_attempted: stats.dribbles.attempts ?? 0,
              dribbles_success: stats.dribbles.success ?? 0,
              fouls_drawn: stats.fouls.drawn ?? 0,
              fouls_committed: stats.fouls.committed ?? 0,
              yellow_cards: stats.cards.yellow ?? 0,
              red_cards: stats.cards.red ?? 0,
              penalty_won: stats.penalty.won ?? 0,
              penalty_scored: stats.penalty.scored ?? 0,
              penalty_missed: stats.penalty.missed ?? 0,
              penalty_saved: stats.penalty.saved ?? 0,
              saves: stats.goals.saves ?? 0,
              goals_conceded: stats.goals.conceded ?? 0,
              match_score: null, // calculated below
            };

            allRows.push(row);
          }
        }

        // Calculate match scores using all players in this fixture as peers
        for (const row of allRows) {
          const peers = allRows.filter(r => r.player_id !== row.player_id);
          row.match_score = calculateMatchScore(row, peers);
        }

        // Batch insert
        if (allRows.length > 0) {
          const { error } = await supabase.from('player_match_stats').upsert(
            allRows.map(r => ({
              player_id: r.player_id,
              fixture_id: r.fixture_id,
              team_id: r.team_id,
              detected_position: r.detected_position,
              formation: r.formation,
              grid_position: r.grid_position,
              minutes: r.minutes,
              rating: r.rating,
              is_substitute: r.is_substitute,
              goals: r.goals,
              assists: r.assists,
              shots_total: r.shots_total,
              shots_on: r.shots_on,
              passes_total: r.passes_total,
              passes_key: r.passes_key,
              passes_accuracy: r.passes_accuracy,
              tackles: r.tackles,
              blocks: r.blocks,
              interceptions: r.interceptions,
              duels_total: r.duels_total,
              duels_won: r.duels_won,
              dribbles_attempted: r.dribbles_attempted,
              dribbles_success: r.dribbles_success,
              fouls_drawn: r.fouls_drawn,
              fouls_committed: r.fouls_committed,
              yellow_cards: r.yellow_cards,
              red_cards: r.red_cards,
              penalty_won: r.penalty_won,
              penalty_scored: r.penalty_scored,
              penalty_missed: r.penalty_missed,
              penalty_saved: r.penalty_saved,
              saves: r.saves,
              goals_conceded: r.goals_conceded,
              match_score: r.match_score,
            })),
            { onConflict: 'player_id,fixture_id' }
          );

          if (error) throw error;
          results.players_inserted += allRows.length;
        }

        // Mark fixture as synced
        await supabase.from('fixtures')
          .update({ stats_synced: true })
          .eq('id', fixture.id);

        results.fixtures_processed++;
      } catch (err) {
        const msg = `Fixture ${fixture.id}: ${(err as Error).message}`;
        results.errors.push(msg);

        await supabase.from('sync_log').insert({
          function_name: 'sync-player-stats',
          fixture_id: fixture.id,
          league_id: fixture.league_id,
          status: (err as Error).message === 'RATE_LIMITED' ? 'error' : 'error',
          error_message: (err as Error).message,
        });

        if ((err as Error).message === 'RATE_LIMITED') break;
      }
    }

    await supabase.from('sync_log').insert({
      function_name: 'sync-player-stats',
      status: results.errors.length > 0 ? 'error' : 'success',
      fixtures_processed: results.fixtures_processed,
      error_message: results.errors.length > 0 ? results.errors.join('; ') : null,
    });

    return new Response(JSON.stringify(results), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/sync-player-stats/
git commit -m "feat: sync-player-stats edge function — fetches lineups, maps positions, scores"
```

---

### Task 7: Edge Function — recalc-scores

**Files:**
- Create: `supabase/functions/recalc-scores/index.ts`

- [ ] **Step 1: Implement recalc-scores**

```typescript
// supabase/functions/recalc-scores/index.ts

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { getSupabaseAdmin } from '../_shared/supabase-client.ts';

serve(async () => {
  const supabase = getSupabaseAdmin();

  try {
    // Step 1: Recalculate player_season_scores using SQL for efficiency
    const { error: recalcError } = await supabase.rpc('recalc_season_scores');

    if (recalcError) {
      // If the RPC doesn't exist yet, do it manually
      // Aggregate match stats into season scores
      const { data: aggregated } = await supabase.rpc('aggregate_season_scores');

      if (!aggregated) {
        // Fallback: raw SQL via REST
        const season = new Date().getFullYear();

        // Get all unique player/position/league combos with scores
        const { data: stats } = await supabase
          .from('player_match_stats')
          .select(`
            player_id,
            detected_position,
            team_id,
            match_score,
            rating,
            goals,
            assists,
            fixtures!inner(league_id, season)
          `)
          .not('match_score', 'is', null)
          .eq('fixtures.season', season);

        if (!stats || stats.length === 0) {
          return new Response(JSON.stringify({ message: 'No stats to recalculate' }), { status: 200 });
        }

        // Group by player_id + position + league_id
        const groups = new Map<string, typeof stats>();
        for (const s of stats) {
          const leagueId = (s as any).fixtures?.league_id;
          const key = `${s.player_id}|${s.detected_position}|${leagueId}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(s);
        }

        const upsertRows = [];
        for (const [key, rows] of groups) {
          const [playerId, position, leagueId] = key.split('|');
          const scores = rows.map(r => r.match_score!).filter(s => s !== null);
          const ratings = rows.map(r => r.rating).filter(r => r !== null);

          upsertRows.push({
            player_id: parseInt(playerId),
            season,
            position,
            league_id: parseInt(leagueId),
            matches_played: scores.length,
            avg_score: scores.length > 0
              ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
              : null,
            avg_rating: ratings.length > 0
              ? Math.round(((ratings as number[]).reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
              : null,
            total_goals: rows.reduce((s, r) => s + (r.goals ?? 0), 0),
            total_assists: rows.reduce((s, r) => s + (r.assists ?? 0), 0),
            updated_at: new Date().toISOString(),
          });
        }

        // Upsert season scores
        if (upsertRows.length > 0) {
          await supabase.from('player_season_scores').upsert(upsertRows, {
            onConflict: 'player_id,season,position,league_id',
          });
        }

        // Calculate percentiles within league+position
        for (const position of ['ARQ','LD','CB','LI','VC','VI','EXT','DEL']) {
          const { data: posScores } = await supabase
            .from('player_season_scores')
            .select('player_id, league_id, avg_score')
            .eq('position', position)
            .eq('season', season)
            .not('avg_score', 'is', null)
            .order('avg_score', { ascending: true });

          if (!posScores || posScores.length === 0) continue;

          // Group by league for league percentile
          const byLeague = new Map<number, typeof posScores>();
          for (const s of posScores) {
            if (!byLeague.has(s.league_id)) byLeague.set(s.league_id, []);
            byLeague.get(s.league_id)!.push(s);
          }

          for (const [leagueId, leagueScores] of byLeague) {
            const sorted = leagueScores.sort((a, b) => (a.avg_score ?? 0) - (b.avg_score ?? 0));
            const n = sorted.length;
            for (let i = 0; i < n; i++) {
              const pct = n > 1 ? Math.round((i / (n - 1)) * 10000) / 100 : 50;
              await supabase.from('player_season_scores')
                .update({ percentile: pct })
                .eq('player_id', sorted[i].player_id)
                .eq('season', season)
                .eq('position', position)
                .eq('league_id', leagueId);
            }
          }

          // Global percentile across all leagues
          const allSorted = posScores.sort((a, b) => (a.avg_score ?? 0) - (b.avg_score ?? 0));
          const total = allSorted.length;
          for (let i = 0; i < total; i++) {
            const pct = total > 1 ? Math.round((i / (total - 1)) * 10000) / 100 : 50;
            await supabase.from('player_season_scores')
              .update({ global_percentile: pct })
              .eq('player_id', allSorted[i].player_id)
              .eq('season', season)
              .eq('position', position)
              .eq('league_id', allSorted[i].league_id);
          }
        }

        // Update position_distribution on players
        const { data: allMatches } = await supabase
          .from('player_match_stats')
          .select('player_id, detected_position')
          .not('detected_position', 'is', null);

        if (allMatches) {
          const playerPositions = new Map<number, Map<string, number>>();
          for (const m of allMatches) {
            if (!playerPositions.has(m.player_id)) playerPositions.set(m.player_id, new Map());
            const posMap = playerPositions.get(m.player_id)!;
            posMap.set(m.detected_position!, (posMap.get(m.detected_position!) ?? 0) + 1);
          }

          for (const [playerId, posMap] of playerPositions) {
            const total = Array.from(posMap.values()).reduce((a, b) => a + b, 0);
            const distribution: Record<string, number> = {};
            let maxPos = '';
            let maxCount = 0;

            for (const [pos, count] of posMap) {
              distribution[pos] = Math.round((count / total) * 100);
              if (count > maxCount) {
                maxCount = count;
                maxPos = pos;
              }
            }

            await supabase.from('players').update({
              position_distribution: distribution,
              primary_position: maxPos,
              updated_at: new Date().toISOString(),
            }).eq('id', playerId);
          }
        }
      }
    }

    await supabase.from('sync_log').insert({
      function_name: 'recalc-scores',
      status: 'success',
    });

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    await supabase.from('sync_log').insert({
      function_name: 'recalc-scores',
      status: 'error',
      error_message: (err as Error).message,
    });
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/recalc-scores/
git commit -m "feat: recalc-scores edge function — season averages, percentiles, position distribution"
```

---

### Task 8: Edge Function — verify-leagues

**Files:**
- Create: `supabase/functions/verify-leagues/index.ts`

- [ ] **Step 1: Implement verify-leagues**

```typescript
// supabase/functions/verify-leagues/index.ts

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { getSupabaseAdmin } from '../_shared/supabase-client.ts';
import { fetchLeagueInfo, fetchFinishedFixtures, fetchFixturePlayers } from '../_shared/api-football.ts';

serve(async () => {
  const supabase = getSupabaseAdmin();
  const results: Array<{ league_id: number; name: string; has_stats: boolean; sample_fixture?: number }> = [];

  const { data: leagues } = await supabase
    .from('leagues')
    .select('id, name, season')
    .eq('has_player_stats', false);

  if (!leagues) {
    return new Response(JSON.stringify({ message: 'No leagues to verify' }), { status: 200 });
  }

  const today = new Date().toISOString().split('T')[0];
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0];

  for (const league of leagues) {
    try {
      // Check API coverage flag
      const info = await fetchLeagueInfo(league.id, league.season);
      const seasonInfo = info[0]?.seasons?.find((s: any) => s.year === league.season);
      const apiSaysYes = seasonInfo?.coverage?.fixtures?.statistics_players === true;

      // Also try fetching actual fixture stats from last 2 weeks
      let hasActualStats = false;
      let sampleFixture: number | undefined;

      if (apiSaysYes || true) { // Try regardless, some leagues report false but have delayed stats
        const fixtures = await fetchFinishedFixtures(league.id, league.season, twoWeeksAgo, today);
        if (fixtures.length > 0) {
          const testFixture = fixtures[0];
          sampleFixture = testFixture.fixture.id;
          try {
            const playerData = await fetchFixturePlayers(testFixture.fixture.id);
            // Check if any player has actual stats (not all nulls)
            for (const team of playerData) {
              for (const p of team.players) {
                const s = p.statistics[0];
                if (s && s.games.minutes !== null && s.games.minutes > 0) {
                  hasActualStats = true;
                  break;
                }
              }
              if (hasActualStats) break;
            }
          } catch {
            hasActualStats = false;
          }
        }
      }

      const confirmed = apiSaysYes || hasActualStats;

      await supabase.from('leagues')
        .update({ has_player_stats: confirmed })
        .eq('id', league.id);

      results.push({ league_id: league.id, name: league.name, has_stats: confirmed, sample_fixture: sampleFixture });
    } catch (err) {
      results.push({ league_id: league.id, name: league.name, has_stats: false });
    }
  }

  return new Response(JSON.stringify(results), { status: 200 });
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/verify-leagues/
git commit -m "feat: verify-leagues edge function — tests doubtful leagues for player stats"
```

---

### Task 9: Edge Function — backfill-season

**Files:**
- Create: `supabase/functions/backfill-season/index.ts`

- [ ] **Step 1: Implement backfill**

```typescript
// supabase/functions/backfill-season/index.ts

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { getSupabaseAdmin } from '../_shared/supabase-client.ts';
import { fetchFinishedFixtures } from '../_shared/api-football.ts';

serve(async (req) => {
  const supabase = getSupabaseAdmin();
  const { league_id, season } = await req.json().catch(() => ({ league_id: null, season: 2025 }));

  try {
    const leagues = league_id
      ? [{ id: league_id, season }]
      : (await supabase.from('leagues').select('id, season').eq('has_player_stats', true)).data ?? [];

    let totalInserted = 0;

    for (const league of leagues) {
      const fromDate = `${league.season}-01-01`;
      const toDate = new Date().toISOString().split('T')[0];

      const fixtures = await fetchFinishedFixtures(league.id, league.season, fromDate, toDate);

      for (const f of fixtures) {
        await supabase.from('teams').upsert([
          { id: f.teams.home.id, name: f.teams.home.name, logo: f.teams.home.logo, league_id: league.id },
          { id: f.teams.away.id, name: f.teams.away.name, logo: f.teams.away.logo, league_id: league.id },
        ], { onConflict: 'id' });

        const { error } = await supabase.from('fixtures').upsert({
          id: f.fixture.id,
          league_id: league.id,
          season: league.season,
          date: f.fixture.date,
          home_team_id: f.teams.home.id,
          away_team_id: f.teams.away.id,
          score_home: f.goals.home,
          score_away: f.goals.away,
          stats_synced: false,
        }, { onConflict: 'id', ignoreDuplicates: true });

        if (!error) totalInserted++;
      }
    }

    return new Response(JSON.stringify({
      message: `Backfilled ${totalInserted} fixtures. sync-player-stats will process them in batches.`,
      total: totalInserted,
    }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/backfill-season/
git commit -m "feat: backfill-season edge function — loads full season fixtures for batch processing"
```

---

### Task 10: Position Validation Script

**Files:**
- Create: `supabase/functions/_shared/validate-positions.ts`

- [ ] **Step 1: Create validation script**

This is a one-time script to run after backfill to confirm the grid convention is correct.

```typescript
// supabase/functions/_shared/validate-positions.ts
// Run with: deno run --allow-net --allow-env validate-positions.ts

import { getSupabaseAdmin } from './supabase-client.ts';

const KNOWN_POSITIONS: Array<{ name: string; expected: string; team: string }> = [
  { name: 'Carvajal', expected: 'LD', team: 'Real Madrid' },
  { name: 'Mendy', expected: 'LI', team: 'Real Madrid' },
  { name: 'Koundé', expected: 'LD', team: 'Barcelona' },
  { name: 'Baldé', expected: 'LI', team: 'Barcelona' },
];

async function validate() {
  const supabase = getSupabaseAdmin();

  console.log('=== Position Mapping Validation ===\n');

  for (const { name, expected, team } of KNOWN_POSITIONS) {
    const { data } = await supabase
      .from('player_match_stats')
      .select('detected_position, player_id, players!inner(name)')
      .ilike('players.name', `%${name}%`)
      .limit(5);

    if (!data || data.length === 0) {
      console.log(`❌ ${name} (${team}): No data found`);
      continue;
    }

    const positions = data.map(d => d.detected_position);
    const mostCommon = positions.sort((a, b) =>
      positions.filter(v => v === b).length - positions.filter(v => v === a).length
    )[0];

    const match = mostCommon === expected;
    console.log(`${match ? '✅' : '❌'} ${name} (${team}): expected ${expected}, got ${mostCommon} (${data.length} matches)`);

    if (!match) {
      console.log('   ⚠️  GRID CONVENTION MAY BE INVERTED — check col_min/col_max mapping');
    }
  }
}

validate();
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/_shared/validate-positions.ts
git commit -m "feat: position validation script — verifies grid convention with known players"
```

---

## PHASE 2: FRONTEND SERVICE LAYER

---

### Task 11: New TypeScript Types

**Files:**
- Create: `src/types/scoring.ts`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Create scoring types**

```typescript
// src/types/scoring.ts

export type Position = 'ARQ' | 'LD' | 'CB' | 'LI' | 'VC' | 'VI' | 'EXT' | 'DEL';

export interface PlayerProfile {
  id: number;
  name: string;
  photo: string | null;
  birth_date: string | null;
  nationality: string | null;
  preferred_foot: string | null;
  height_cm: number | null;
  current_team_id: number | null;
  primary_position: Position | null;
  position_distribution: Record<string, number>;
  team?: { id: number; name: string; logo: string | null; league_id: number | null };
}

export interface PlayerSeasonScore {
  player_id: number;
  season: number;
  position: Position;
  league_id: number;
  matches_played: number;
  avg_score: number | null;
  avg_rating: number | null;
  total_goals: number;
  total_assists: number;
  percentile: number | null;
  global_percentile: number | null;
}

export interface PlayerMatchStat {
  id: number;
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
  fixture?: {
    id: number;
    date: string;
    home_team_id: number;
    away_team_id: number;
    score_home: number | null;
    score_away: number | null;
    league_id: number;
    home_team?: { name: string };
    away_team?: { name: string };
  };
}

export interface LeagueInfo {
  id: number;
  name: string;
  country: string;
  tier: number;
  season: number;
  has_player_stats: boolean;
}

export interface PlayerWithScore extends PlayerProfile {
  season_scores: PlayerSeasonScore[];
  primary_score: number | null;      // avg_score in primary_position
  primary_percentile: number | null;  // percentile in primary_position in league
  league?: LeagueInfo;
}

export interface PositionAverage {
  position: Position;
  league_id: number;
  avg_score: number;
  player_count: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/scoring.ts
git commit -m "feat: add TypeScript types for Supabase scoring data"
```

---

### Task 12: Player Stats Service

**Files:**
- Create: `src/services/playerStatsService.ts`

- [ ] **Step 1: Create the service**

```typescript
// src/services/playerStatsService.ts

import { supabase } from '@/lib/supabase';
import type {
  PlayerWithScore,
  PlayerMatchStat,
  PlayerSeasonScore,
  PositionAverage,
  Position,
  LeagueInfo,
} from '@/types/scoring';

export async function fetchPlayersList(filters: {
  position?: Position;
  league_id?: number;
  min_score?: number;
  max_age?: number;
  min_matches?: number;
  search?: string;
  season?: number;
  page?: number;
  pageSize?: number;
}): Promise<{ players: PlayerWithScore[]; count: number }> {
  const season = filters.season ?? new Date().getFullYear();
  const page = filters.page ?? 0;
  const pageSize = filters.pageSize ?? 50;

  let query = supabase
    .from('player_season_scores')
    .select(`
      *,
      player:players!inner(
        id, name, photo, birth_date, nationality, preferred_foot, height_cm,
        primary_position, position_distribution, current_team_id,
        team:teams(id, name, logo, league_id)
      )
    `, { count: 'exact' })
    .eq('season', season)
    .not('avg_score', 'is', null);

  if (filters.position) query = query.eq('position', filters.position);
  if (filters.league_id) query = query.eq('league_id', filters.league_id);
  if (filters.min_score) query = query.gte('avg_score', filters.min_score);
  if (filters.min_matches) query = query.gte('matches_played', filters.min_matches);
  if (filters.search) query = query.ilike('player.name', `%${filters.search}%`);

  query = query
    .order('avg_score', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1);

  const { data, count, error } = await query;
  if (error) throw error;

  const players: PlayerWithScore[] = (data ?? []).map((row: any) => ({
    ...row.player,
    team: row.player.team,
    season_scores: [row],
    primary_score: row.avg_score,
    primary_percentile: row.percentile,
  }));

  return { players, count: count ?? 0 };
}

export async function fetchPlayerDetail(playerId: number, season?: number): Promise<{
  player: PlayerWithScore;
  matches: PlayerMatchStat[];
  allSeasonScores: PlayerSeasonScore[];
} | null> {
  const s = season ?? new Date().getFullYear();

  const [playerRes, scoresRes, matchesRes] = await Promise.all([
    supabase.from('players').select(`
      *, team:teams(id, name, logo, league_id)
    `).eq('id', playerId).single(),

    supabase.from('player_season_scores').select('*')
      .eq('player_id', playerId).eq('season', s),

    supabase.from('player_match_stats').select(`
      *,
      fixture:fixtures(
        id, date, home_team_id, away_team_id, score_home, score_away, league_id,
        home_team:teams!fixtures_home_team_id_fkey(name),
        away_team:teams!fixtures_away_team_id_fkey(name)
      )
    `)
      .eq('player_id', playerId)
      .order('fixture(date)', { ascending: true }),
  ]);

  if (playerRes.error || !playerRes.data) return null;

  const seasonScores = scoresRes.data ?? [];
  const primaryScore = seasonScores.find(
    (s: any) => s.position === playerRes.data.primary_position
  );

  return {
    player: {
      ...playerRes.data,
      season_scores: seasonScores,
      primary_score: primaryScore?.avg_score ?? null,
      primary_percentile: primaryScore?.percentile ?? null,
    },
    matches: matchesRes.data ?? [],
    allSeasonScores: seasonScores,
  };
}

export async function fetchPositionAverages(
  season?: number
): Promise<PositionAverage[]> {
  const s = season ?? new Date().getFullYear();

  const { data, error } = await supabase
    .from('player_season_scores')
    .select('position, league_id, avg_score')
    .eq('season', s)
    .not('avg_score', 'is', null);

  if (error) throw error;

  const groups = new Map<string, { scores: number[]; league_id: number; position: string }>();
  for (const row of data ?? []) {
    const key = `${row.position}|${row.league_id}`;
    if (!groups.has(key)) groups.set(key, { scores: [], league_id: row.league_id, position: row.position });
    groups.get(key)!.scores.push(row.avg_score);
  }

  return Array.from(groups.values()).map(g => ({
    position: g.position as Position,
    league_id: g.league_id,
    avg_score: Math.round((g.scores.reduce((a, b) => a + b, 0) / g.scores.length) * 10) / 10,
    player_count: g.scores.length,
  }));
}

export async function fetchLeagues(): Promise<LeagueInfo[]> {
  const { data, error } = await supabase
    .from('leagues')
    .select('*')
    .eq('has_player_stats', true)
    .order('tier', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function fetchPlayerMatchHistory(
  playerId: number,
  position?: Position,
): Promise<PlayerMatchStat[]> {
  let query = supabase
    .from('player_match_stats')
    .select(`
      *,
      fixture:fixtures(
        id, date, home_team_id, away_team_id, score_home, score_away, league_id,
        home_team:teams!fixtures_home_team_id_fkey(name),
        away_team:teams!fixtures_away_team_id_fkey(name)
      )
    `)
    .eq('player_id', playerId)
    .not('match_score', 'is', null);

  if (position) query = query.eq('detected_position', position);

  query = query.order('fixture(date)', { ascending: true });

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/playerStatsService.ts
git commit -m "feat: playerStatsService — Supabase queries for scoring data"
```

---

### Task 13: React Hooks for Scoring Data

**Files:**
- Create: `src/hooks/usePlayerStats.ts`

- [ ] **Step 1: Create hooks with caching**

```typescript
// src/hooks/usePlayerStats.ts

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchPlayersList,
  fetchPlayerDetail,
  fetchPositionAverages,
  fetchLeagues,
  fetchPlayerMatchHistory,
} from '@/services/playerStatsService';
import type { PlayerWithScore, PlayerMatchStat, PositionAverage, LeagueInfo, Position } from '@/types/scoring';

const cache = new Map<string, { data: any; timestamp: number }>();

function getCached<T>(key: string, staleMins: number): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > staleMins * 60 * 1000) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(key: string, data: any) {
  cache.set(key, { data, timestamp: Date.now() });
}

export function usePlayersList(filters: Parameters<typeof fetchPlayersList>[0]) {
  const [players, setPlayers] = useState<PlayerWithScore[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filtersKey = JSON.stringify(filters);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const cached = getCached<{ players: PlayerWithScore[]; count: number }>(
      `list:${filtersKey}`, 60
    );
    if (cached) {
      setPlayers(cached.players);
      setCount(cached.count);
      setLoading(false);
      return;
    }

    fetchPlayersList(filters)
      .then(result => {
        if (cancelled) return;
        setPlayers(result.players);
        setCount(result.count);
        setCache(`list:${filtersKey}`, result);
      })
      .catch(err => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [filtersKey]);

  return { players, count, loading, error };
}

export function usePlayerDetail(playerId: number | null) {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchPlayerDetail>>>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!playerId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    const cached = getCached<typeof data>(`detail:${playerId}`, 30);
    if (cached) {
      setData(cached);
      setLoading(false);
      return;
    }

    fetchPlayerDetail(playerId)
      .then(result => {
        if (cancelled) return;
        setData(result);
        setCache(`detail:${playerId}`, result);
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [playerId]);

  return { data, loading };
}

export function usePositionAverages() {
  const [averages, setAverages] = useState<PositionAverage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cached = getCached<PositionAverage[]>('posAvg', 240);
    if (cached) { setAverages(cached); setLoading(false); return; }

    fetchPositionAverages()
      .then(data => { setAverages(data); setCache('posAvg', data); })
      .finally(() => setLoading(false));
  }, []);

  return { averages, loading };
}

export function useLeagues() {
  const [leagues, setLeagues] = useState<LeagueInfo[]>([]);

  useEffect(() => {
    const cached = getCached<LeagueInfo[]>('leagues', 240);
    if (cached) { setLeagues(cached); return; }

    fetchLeagues().then(data => { setLeagues(data); setCache('leagues', data); });
  }, []);

  return leagues;
}

export function usePlayerMatchHistory(playerId: number | null, position?: Position) {
  const [matches, setMatches] = useState<PlayerMatchStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!playerId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    fetchPlayerMatchHistory(playerId, position)
      .then(data => { if (!cancelled) setMatches(data); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [playerId, position]);

  return { matches, loading };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/usePlayerStats.ts
git commit -m "feat: React hooks for scoring data with in-memory caching"
```

---

## PHASE 3: FRONTEND UI

---

### Task 14: PositionBar Component

**Files:**
- Create: `src/components/ui/PositionBar.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/ui/PositionBar.tsx

import type { Position } from '@/types/scoring';

interface PositionBarProps {
  distribution: Record<string, number>;
  selectedPosition: Position | null;
  onSelectPosition: (position: Position) => void;
}

const POSITION_COLORS: Record<string, string> = {
  ARQ: 'bg-yellow-500',
  LD: 'bg-blue-500',
  CB: 'bg-blue-700',
  LI: 'bg-blue-500',
  VC: 'bg-green-600',
  VI: 'bg-green-500',
  EXT: 'bg-orange-500',
  DEL: 'bg-red-500',
};

const POSITION_LABELS: Record<string, string> = {
  ARQ: 'Arquero',
  LD: 'Lateral Der.',
  CB: 'Defensor Central',
  LI: 'Lateral Izq.',
  VC: 'Volante Central',
  VI: 'Volante Interno',
  EXT: 'Extremo',
  DEL: 'Delantero',
};

export default function PositionBar({ distribution, selectedPosition, onSelectPosition }: PositionBarProps) {
  const sorted = Object.entries(distribution)
    .sort(([, a], [, b]) => b - a)
    .filter(([, pct]) => pct > 0);

  if (sorted.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Posiciones</h4>
      {sorted.map(([pos, pct]) => {
        const isSelected = selectedPosition === pos;
        return (
          <button
            key={pos}
            onClick={() => onSelectPosition(pos as Position)}
            className={`w-full group flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all cursor-pointer ${
              isSelected
                ? 'bg-white/10 ring-1 ring-white/20'
                : 'hover:bg-white/5'
            }`}
          >
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-medium ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                  {pos}
                </span>
                <span className="text-xs text-gray-500">{pct}%</span>
              </div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${POSITION_COLORS[pos] || 'bg-gray-500'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </button>
        );
      })}
      {selectedPosition && (
        <p className="text-[10px] text-gray-500 text-center mt-1">
          Viendo stats como {POSITION_LABELS[selectedPosition] || selectedPosition}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/PositionBar.tsx
git commit -m "feat: PositionBar component — clickable position distribution display"
```

---

### Task 15: ScoreEvolutionChart Component

**Files:**
- Create: `src/components/charts/ScoreEvolutionChart.tsx`

- [ ] **Step 1: Create the chart component**

```tsx
// src/components/charts/ScoreEvolutionChart.tsx

import { useState, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { PlayerMatchStat } from '@/types/scoring';

interface ScoreEvolutionChartProps {
  matches: PlayerMatchStat[];
  avgScore: number | null;
}

type ViewMode = 'weekly' | 'monthly';

function getWeekLabel(date: string): string {
  const d = new Date(date);
  const start = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
  return `S${weekNum}`;
}

function getMonthLabel(date: string): string {
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return months[new Date(date).getMonth()];
}

interface ChartPoint {
  label: string;
  score: number;
  tooltipData?: {
    date: string;
    rival: string;
    result: string;
    minutes: number;
    matchCount?: number;
    best?: number;
    worst?: number;
  };
}

export default function ScoreEvolutionChart({ matches, avgScore }: ScoreEvolutionChartProps) {
  const [mode, setMode] = useState<ViewMode>('weekly');

  const chartData = useMemo(() => {
    if (matches.length === 0) return [];

    if (mode === 'weekly') {
      return matches
        .filter(m => m.match_score !== null)
        .map(m => {
          const fixture = m.fixture;
          const isHome = m.team_id === fixture?.home_team_id;
          const rival = isHome ? fixture?.away_team?.name : fixture?.home_team?.name;
          const result = fixture ? `${fixture.score_home ?? '?'}-${fixture.score_away ?? '?'}` : '';

          return {
            label: getWeekLabel(fixture?.date ?? ''),
            score: m.match_score!,
            tooltipData: {
              date: fixture?.date ? new Date(fixture.date).toLocaleDateString('es-AR') : '',
              rival: rival ?? 'Desconocido',
              result,
              minutes: m.minutes,
            },
          } as ChartPoint;
        });
    }

    // Monthly: group by month
    const byMonth = new Map<string, number[]>();
    for (const m of matches) {
      if (m.match_score === null || !m.fixture?.date) continue;
      const key = getMonthLabel(m.fixture.date);
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key)!.push(m.match_score);
    }

    return Array.from(byMonth.entries()).map(([label, scores]) => ({
      label,
      score: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
      tooltipData: {
        date: '',
        rival: '',
        result: '',
        minutes: 0,
        matchCount: scores.length,
        best: Math.max(...scores),
        worst: Math.min(...scores),
      },
    } as ChartPoint));
  }, [matches, mode]);

  if (matches.length === 0) {
    return (
      <div className="text-center text-gray-500 text-sm py-8">
        Sin datos de partidos para mostrar
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-300">Evolucion de Rendimiento</h3>
        <div className="flex bg-white/5 rounded-lg p-0.5">
          {(['weekly', 'monthly'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 text-xs rounded-md transition-all ${
                mode === m ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              {m === 'weekly' ? 'Semanal' : 'Mensual'}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
          <defs>
            <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            tick={{ fill: '#6b7280', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[1, 10]}
            tick={{ fill: '#6b7280', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            ticks={[2, 4, 6, 8, 10]}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null;
              const d = payload[0].payload as ChartPoint;
              const t = d.tooltipData;
              return (
                <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-xl">
                  <p className="font-bold text-white">{d.score.toFixed(1)}</p>
                  {t?.rival && <p className="text-gray-300">vs {t.rival} ({t.result})</p>}
                  {t?.date && <p className="text-gray-400">{t.date} — {t.minutes} min</p>}
                  {t?.matchCount && (
                    <>
                      <p className="text-gray-400">{t.matchCount} partidos</p>
                      <p className="text-gray-400">Mejor: {t.best?.toFixed(1)} / Peor: {t.worst?.toFixed(1)}</p>
                    </>
                  )}
                </div>
              );
            }}
          />
          {avgScore && (
            <ReferenceLine
              y={avgScore}
              stroke="#6b7280"
              strokeDasharray="4 4"
              label={{ value: `Prom: ${avgScore.toFixed(1)}`, fill: '#6b7280', fontSize: 10, position: 'right' }}
            />
          )}
          <Area
            type="monotone"
            dataKey="score"
            stroke="#22c55e"
            strokeWidth={2}
            fill="url(#scoreGradient)"
            dot={false}
            activeDot={{ r: 4, fill: '#22c55e', stroke: '#fff', strokeWidth: 1 }}
            animationDuration={800}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/charts/ScoreEvolutionChart.tsx
git commit -m "feat: ScoreEvolutionChart — weekly/monthly toggle with tooltips"
```

---

### Task 16: Update GaugeScore for 1-10 Scale

**Files:**
- Modify: `src/components/charts/GaugeScore.tsx`

- [ ] **Step 1: Read current GaugeScore**

```bash
# Read the component to understand current implementation
```

Read `src/components/charts/GaugeScore.tsx` and identify:
- Where the score value is rendered
- Where color thresholds are set (currently 0-100)
- Where the comparison score is shown

- [ ] **Step 2: Update color thresholds and display**

The current GaugeScore uses 0-100 scale. Update to support both scales with a prop:

Add a `scale` prop (`'100' | '10'`, default `'100'`). When scale is `'10'`:
- Color thresholds: red < 4.0, orange 4.0-5.5, yellow 5.5-7.0, green > 7.0
- Display format: `7.4` instead of `74`
- Arc calculation: normalize to 0-1 using `(score - 1) / 9` for 1-10 scale

Key changes:
- Add `scale?: '100' | '10'` prop
- Adjust `getColor()` function for 1-10 thresholds
- Adjust arc calculation for 1-10 range
- Display `score.toFixed(1)` for 1-10 scale

- [ ] **Step 3: Commit**

```bash
git add src/components/charts/GaugeScore.tsx
git commit -m "feat: GaugeScore supports 1-10 scale with new color thresholds"
```

---

### Task 17: Integrate into PlayerDetailPage

**Files:**
- Modify: `src/pages/PlayerDetailPage.tsx`

This is the largest modification. The page needs to:

- [ ] **Step 1: Add imports and state**

At the top of `PlayerDetailPage.tsx`, add:

```typescript
import PositionBar from '@/components/ui/PositionBar';
import ScoreEvolutionChart from '@/components/charts/ScoreEvolutionChart';
import { usePlayerDetail, usePlayerMatchHistory, usePositionAverages } from '@/hooks/usePlayerStats';
import type { Position } from '@/types/scoring';
```

Add state for selected position:

```typescript
const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
```

- [ ] **Step 2: Add PositionBar in sidebar (after GaugeScore section)**

Find the GaugeScore card (around line 1133-1207). After the closing div of the Score GG card, add the PositionBar:

```tsx
{/* Position Distribution */}
{player.position_distribution && Object.keys(player.position_distribution).length > 0 && (
  <div className="bg-[#1a1d23] rounded-2xl p-4 border border-white/5">
    <PositionBar
      distribution={player.position_distribution}
      selectedPosition={selectedPosition ?? player.primary_position}
      onSelectPosition={setSelectedPosition}
    />
  </div>
)}
```

- [ ] **Step 3: Add ScoreEvolutionChart in General tab (after canchita)**

Find the "Posicion en el Campo" section (around line 1438-1520). After it, add:

```tsx
{/* Score Evolution */}
<div className="mt-6">
  <ScoreEvolutionChart
    matches={playerMatches}
    avgScore={currentAvgScore}
  />
</div>
```

Where `playerMatches` comes from the `usePlayerMatchHistory` hook and `currentAvgScore` is the avg_score for the selected position.

- [ ] **Step 4: Wire up position selection to GaugeScore**

Update the GaugeScore to use the selected position's score:

```tsx
<GaugeScore
  score={currentAvgScore ?? player.ggScore}
  scale="10"
  size="lg"
  comparisonScore={positionAverage}
  comparisonLabel={`Promedio ${selectedPosition ?? player.primary_position}`}
/>
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/PlayerDetailPage.tsx
git commit -m "feat: PlayerDetailPage — add PositionBar + ScoreEvolutionChart integration"
```

---

### Task 18: Update Scoring Constants for API-Football Metrics

**Files:**
- Modify: `src/constants/scoring.ts`

- [ ] **Step 1: Add new RADAR_METRICS for API-Football**

Add a new `API_RADAR_METRICS` config that maps to the actual fields available from API-Football. These replace the Wyscout metric names in radar charts.

```typescript
export const API_RADAR_METRICS: Record<string, Array<{ key: string; label: string }>> = {
  ARQ: [
    { key: 'saves', label: 'Atajadas' },
    { key: 'goals_conceded', label: 'Goles Rec. (inv)' },
    { key: 'rating', label: 'Rating' },
    { key: 'passes_accuracy', label: 'Prec. Pases' },
    { key: 'duels_won_pct', label: 'Duelos %' },
  ],
  CB: [
    { key: 'duels_won_pct', label: 'Duelos %' },
    { key: 'tackles', label: 'Entradas' },
    { key: 'interceptions', label: 'Intercepciones' },
    { key: 'blocks', label: 'Bloqueos' },
    { key: 'passes_accuracy', label: 'Prec. Pases' },
    { key: 'rating', label: 'Rating' },
    { key: 'passes_total', label: 'Pases' },
  ],
  LD: [
    { key: 'duels_won_pct', label: 'Duelos %' },
    { key: 'passes_key', label: 'Pases Clave' },
    { key: 'dribbles_success', label: 'Regates' },
    { key: 'assists', label: 'Asistencias' },
    { key: 'tackles', label: 'Entradas' },
    { key: 'passes_accuracy', label: 'Prec. Pases' },
    { key: 'interceptions', label: 'Intercepciones' },
    { key: 'rating', label: 'Rating' },
  ],
  LI: [
    { key: 'duels_won_pct', label: 'Duelos %' },
    { key: 'passes_key', label: 'Pases Clave' },
    { key: 'dribbles_success', label: 'Regates' },
    { key: 'assists', label: 'Asistencias' },
    { key: 'tackles', label: 'Entradas' },
    { key: 'passes_accuracy', label: 'Prec. Pases' },
    { key: 'interceptions', label: 'Intercepciones' },
    { key: 'rating', label: 'Rating' },
  ],
  VC: [
    { key: 'tackles', label: 'Entradas' },
    { key: 'duels_won_pct', label: 'Duelos %' },
    { key: 'interceptions', label: 'Intercepciones' },
    { key: 'passes_accuracy', label: 'Prec. Pases' },
    { key: 'passes_total', label: 'Pases' },
    { key: 'blocks', label: 'Bloqueos' },
    { key: 'rating', label: 'Rating' },
    { key: 'passes_key', label: 'Pases Clave' },
  ],
  VI: [
    { key: 'duels_won_pct', label: 'Duelos %' },
    { key: 'passes_key', label: 'Pases Clave' },
    { key: 'dribbles_success', label: 'Regates' },
    { key: 'assists', label: 'Asistencias' },
    { key: 'goals', label: 'Goles' },
    { key: 'passes_accuracy', label: 'Prec. Pases' },
    { key: 'shots_on', label: 'Tiros al Arco' },
    { key: 'rating', label: 'Rating' },
  ],
  EXT: [
    { key: 'dribbles_success', label: 'Regates' },
    { key: 'goals', label: 'Goles' },
    { key: 'assists', label: 'Asistencias' },
    { key: 'passes_key', label: 'Pases Clave' },
    { key: 'shots_on', label: 'Tiros al Arco' },
    { key: 'duels_won_pct', label: 'Duelos %' },
    { key: 'rating', label: 'Rating' },
  ],
  DEL: [
    { key: 'goals', label: 'Goles' },
    { key: 'shots_on', label: 'Tiros al Arco' },
    { key: 'assists', label: 'Asistencias' },
    { key: 'passes_key', label: 'Pases Clave' },
    { key: 'duels_won_pct', label: 'Duelos %' },
    { key: 'dribbles_success', label: 'Regates' },
    { key: 'rating', label: 'Rating' },
  ],
};
```

- [ ] **Step 2: Commit**

```bash
git add src/constants/scoring.ts
git commit -m "feat: API_RADAR_METRICS — radar chart metrics per position for API-Football"
```

---

### Task 19: Update Scouting Pages to Consume Supabase

**Files:**
- Modify: `src/pages/ExternalScoutingPage.tsx`
- Modify: `src/pages/InternalScoutingPage.tsx`
- Modify: `src/pages/OpportunitiesPage.tsx`

These pages currently consume `data.external` / `data.internal` from `useData()` which loads CSVs.

- [ ] **Step 1: Update ExternalScoutingPage**

Replace or augment the `useData()` call with `usePlayersList()` from the new hooks. The page already has filtering/sorting UI — wire it to the new Supabase filters.

Key changes:
- Import `usePlayersList` and `useLeagues`
- Add filter state for position, league, search, min_score
- Replace `data.external` with `players` from `usePlayersList(filters)`
- Map `PlayerWithScore` to the format the existing table component expects
- Update column references: `ggScore` → `primary_score`, etc.

- [ ] **Step 2: Update InternalScoutingPage**

Same approach as ExternalScoutingPage but filtering by DG players' teams/leagues.

- [ ] **Step 3: Update OpportunitiesPage**

The opportunity score calculation changes:
- Currently: `ggScore / marketValue`
- New: `primary_score / marketValue` (using 1-10 scale score)
- Market value still comes from existing enrichment (Transfermarkt data)

- [ ] **Step 4: Commit**

```bash
git add src/pages/ExternalScoutingPage.tsx src/pages/InternalScoutingPage.tsx src/pages/OpportunitiesPage.tsx
git commit -m "feat: scouting & opportunities pages consume Supabase scoring data"
```

---

### Task 20: Update Radar, Scatter, Similar, Comparison Pages

**Files:**
- Modify: `src/pages/RadarAnalysisPage.tsx`
- Modify: `src/pages/ScatterChartPage.tsx`
- Modify: `src/pages/SimilarPlayersPage.tsx`
- Modify: `src/pages/ComparisonPage.tsx`

- [ ] **Step 1: Update RadarAnalysisPage**

Replace Wyscout metric references with API-Football metrics from `API_RADAR_METRICS`. The radar chart gets its data from `player_match_stats` averages instead of CSV columns.

- [ ] **Step 2: Update ScatterChartPage**

Replace metric axis options with API-Football metrics. The scatter plot data comes from `player_season_scores` aggregated stats.

- [ ] **Step 3: Update SimilarPlayersPage**

The similarity algorithm currently compares Wyscout metrics. Replace with comparison of API-Football match averages (goals/90, assists/90, duels_won_pct, etc.) per position.

- [ ] **Step 4: Update ComparisonPage**

Side-by-side comparison pulls stats from `player_match_stats` averages instead of CSV columns.

- [ ] **Step 5: Commit**

```bash
git add src/pages/RadarAnalysisPage.tsx src/pages/ScatterChartPage.tsx src/pages/SimilarPlayersPage.tsx src/pages/ComparisonPage.tsx
git commit -m "feat: radar, scatter, similar, comparison pages use API-Football metrics"
```

---

### Task 21: Update Remaining Pages

**Files:**
- Modify: `src/pages/BusquedaPage.tsx`
- Modify: `src/pages/DashboardPage.tsx`
- Modify: `src/pages/MonitoringPage.tsx`
- Modify: `src/pages/FormationPage.tsx`

- [ ] **Step 1: Update BusquedaPage (Analisis Completo)**

Search and ranking now queries `player_season_scores` via Supabase full-text search on player names.

- [ ] **Step 2: Update DashboardPage**

Aggregated stats (portfolio analysis, league breakdowns) pull from `player_season_scores`.

- [ ] **Step 3: Update MonitoringPage**

The monitoring page shows tracked players with their scores. Wire to live Supabase data instead of CSV snapshots.

- [ ] **Step 4: Update FormationPage**

Formation builder shows player scores — pull from `player_season_scores` for each assigned player.

- [ ] **Step 5: Commit**

```bash
git add src/pages/BusquedaPage.tsx src/pages/DashboardPage.tsx src/pages/MonitoringPage.tsx src/pages/FormationPage.tsx
git commit -m "feat: busqueda, dashboard, monitoring, formation pages use Supabase scoring"
```

---

## PHASE 4: CLEANUP

---

### Task 22: Remove CSV Scoring System

**Files:**
- Delete or gut: `src/services/csvService.ts` (if not used for non-scoring data)
- Modify: `src/context/DataContext.tsx` (remove CSV loading for scoring)
- Modify: `src/utils/scoring.ts` (remove `computeGGScores`, keep utility functions like `parseMarketValue`)
- Modify: `vite.config.ts` (remove `/sheets-proxy` if unused)

- [ ] **Step 1: Audit remaining CSV usage**

Search the codebase for remaining references to:
- `loadAllData()`
- `csvService`
- `sheets-proxy`
- Google Sheets URLs in `scoring.ts`

Identify which CSV sheets are still needed (if any — e.g., Transfermarkt enrichment, GPS data, subjective metrics).

- [ ] **Step 2: Remove scoring-related CSV loading**

In `DataContext.tsx`, remove the loading of scoring CSVs and `computeGGScores()` calls. Keep any non-scoring data loading (GPS, Transfermarkt, subjective metrics if still CSV-based).

- [ ] **Step 3: Clean up scoring.ts constants**

Remove the `SCORING_CONFIG` (Wyscout weights) and `SHEET_URLS` for scoring CSVs from `src/constants/scoring.ts`. Keep `POSITION_MAP`, `DISPLAY_POSITION_MAP`, league tiers (for reference), and `API_RADAR_METRICS`.

- [ ] **Step 4: Remove proxy if unused**

If `/sheets-proxy` in `vite.config.ts` is no longer needed (all CSV data replaced), remove it.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove CSV scoring system — all scoring now via Supabase + API-Football"
```

---

## Deployment Sequence

After all tasks are implemented:

1. **Deploy Supabase migration** (Task 1) — creates tables
2. **Deploy Edge Functions** (Tasks 5-9) — `supabase functions deploy`
3. **Run verify-leagues** — confirms which doubtful leagues have stats
4. **Run backfill-season** — loads full season of fixtures
5. **Wait for sync-player-stats** to process all fixtures (takes ~2 days)
6. **Run validate-positions** — confirms grid convention is correct
7. **Run recalc-scores** — calculates season averages
8. **Set up pg_cron** in Supabase Dashboard:
   ```sql
   SELECT cron.schedule('sync-fixtures', '0 * * * *', $$ SELECT net.http_post(url:='<SUPABASE_URL>/functions/v1/sync-fixtures', headers:='{"Authorization": "Bearer <ANON_KEY>"}') $$);
   SELECT cron.schedule('sync-player-stats', '5 * * * *', $$ SELECT net.http_post(url:='<SUPABASE_URL>/functions/v1/sync-player-stats', headers:='{"Authorization": "Bearer <ANON_KEY>"}') $$);
   SELECT cron.schedule('recalc-scores', '15 * * * *', $$ SELECT net.http_post(url:='<SUPABASE_URL>/functions/v1/recalc-scores', headers:='{"Authorization": "Bearer <ANON_KEY>"}') $$);
   ```
9. **Deploy frontend** — push to Netlify
10. **Monitor sync_log** for errors in the first 24 hours
