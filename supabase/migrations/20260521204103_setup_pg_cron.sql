-- Enable required extensions
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- sync-fixtures: hourly at minute 0
select cron.schedule(
  'sync-fixtures-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://qgwmxjjumauortbwvivu.supabase.co/functions/v1/sync-fixtures',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnd214amp1bWF1b3J0Ynd2aXZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwODI4ODAsImV4cCI6MjA4ODY1ODg4MH0.sDJ6P9bOa-VrjpxZgD_umuIPFiGsonVs0bQtzdYw37E"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- sync-player-stats: every 10 minutes (aggressive for backfill, change to hourly later)
select cron.schedule(
  'sync-player-stats-10min',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://qgwmxjjumauortbwvivu.supabase.co/functions/v1/sync-player-stats',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnd214amp1bWF1b3J0Ynd2aXZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwODI4ODAsImV4cCI6MjA4ODY1ODg4MH0.sDJ6P9bOa-VrjpxZgD_umuIPFiGsonVs0bQtzdYw37E"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- recalc-scores: every 6 hours
select cron.schedule(
  'recalc-scores-6h',
  '15 */6 * * *',
  $$
  select net.http_post(
    url := 'https://qgwmxjjumauortbwvivu.supabase.co/functions/v1/recalc-scores',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnd214amp1bWF1b3J0Ynd2aXZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwODI4ODAsImV4cCI6MjA4ODY1ODg4MH0.sDJ6P9bOa-VrjpxZgD_umuIPFiGsonVs0bQtzdYw37E"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
