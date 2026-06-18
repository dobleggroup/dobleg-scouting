-- Métricas p90 por jugador en player_season_scores (para radar/scatter/similares
-- sobre el pool, sin recalcular desde player_match_stats en el cliente).
ALTER TABLE public.player_season_scores
  ADD COLUMN IF NOT EXISTS tackles_p90          NUMERIC,
  ADD COLUMN IF NOT EXISTS interceptions_p90    NUMERIC,
  ADD COLUMN IF NOT EXISTS blocks_p90           NUMERIC,
  ADD COLUMN IF NOT EXISTS duels_won_pct        NUMERIC,
  ADD COLUMN IF NOT EXISTS passes_accuracy      NUMERIC,
  ADD COLUMN IF NOT EXISTS passes_key_p90       NUMERIC,
  ADD COLUMN IF NOT EXISTS passes_total_p90     NUMERIC,
  ADD COLUMN IF NOT EXISTS dribbles_success_p90 NUMERIC,
  ADD COLUMN IF NOT EXISTS dribbles_pct         NUMERIC,
  ADD COLUMN IF NOT EXISTS shots_on_p90         NUMERIC,
  ADD COLUMN IF NOT EXISTS shots_pct            NUMERIC,
  ADD COLUMN IF NOT EXISTS goals_p90            NUMERIC,
  ADD COLUMN IF NOT EXISTS assists_p90          NUMERIC,
  ADD COLUMN IF NOT EXISTS fouls_drawn_p90      NUMERIC,
  ADD COLUMN IF NOT EXISTS saves_p90            NUMERIC,
  ADD COLUMN IF NOT EXISTS goals_conceded_p90   NUMERIC,
  ADD COLUMN IF NOT EXISTS penalty_saved_avg    NUMERIC,
  ADD COLUMN IF NOT EXISTS clean_sheet_pct      NUMERIC;
