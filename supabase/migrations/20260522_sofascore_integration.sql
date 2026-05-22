-- Add source column to leagues to distinguish API-Football from Sofascore
ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'api-football';

-- Update Primera Nacional and Uruguay Primera to use Sofascore as data source
UPDATE public.leagues SET
  source = 'sofascore',
  has_player_stats = true,
  season = 2026
WHERE id = 131;

UPDATE public.leagues SET
  source = 'sofascore',
  has_player_stats = true,
  season = 2026
WHERE id = 268;

-- Clean up old API-Football data for these leagues (will be replaced by Sofascore)
DELETE FROM public.player_season_scores WHERE league_id IN (131, 268);
DELETE FROM public.player_match_stats WHERE fixture_id IN (
  SELECT id FROM public.fixtures WHERE league_id IN (131, 268)
);
DELETE FROM public.fixtures WHERE league_id IN (131, 268);

-- Schedule sync-sofascore: every hour at minute 30
select cron.schedule(
  'sync-sofascore-hourly',
  '30 * * * *',
  $$
  select net.http_post(
    url := 'https://qgwmxjjumauortbwvivu.supabase.co/functions/v1/sync-sofascore',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnd214amp1bWF1b3J0Ynd2aXZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwODI4ODAsImV4cCI6MjA4ODY1ODg4MH0.sDJ6P9bOa-VrjpxZgD_umuIPFiGsonVs0bQtzdYw37E"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
