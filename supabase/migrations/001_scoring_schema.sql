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
