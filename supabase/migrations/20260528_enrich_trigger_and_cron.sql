-- Trigger: enrich new players via Edge Function
CREATE OR REPLACE FUNCTION enrich_new_player() RETURNS trigger AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://qgwmxjjumauortbwvivu.supabase.co/functions/v1/enrich-player',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnd214amp1bWF1b3J0Ynd2aXZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwODI4ODAsImV4cCI6MjA4ODY1ODg4MH0.sDJ6P9bOa-VrjpxZgD_umuIPFiGsonVs0bQtzdYw37E"}'::jsonb,
    body := jsonb_build_object('mode', 'single', 'player_id', NEW.id)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enrich_new_player
  AFTER INSERT ON players
  FOR EACH ROW
  EXECUTE FUNCTION enrich_new_player();

-- Cron: weekly refresh of TM data (Sundays 3am UTC)
SELECT cron.schedule(
  'refresh-transfermarkt-weekly',
  '0 3 * * 0',
  $$
  SELECT net.http_post(
    url := 'https://qgwmxjjumauortbwvivu.supabase.co/functions/v1/enrich-player',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnd214amp1bWF1b3J0Ynd2aXZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwODI4ODAsImV4cCI6MjA4ODY1ODg4MH0.sDJ6P9bOa-VrjpxZgD_umuIPFiGsonVs0bQtzdYw37E"}'::jsonb,
    body := '{"mode": "refresh"}'::jsonb
  );
  $$
);
