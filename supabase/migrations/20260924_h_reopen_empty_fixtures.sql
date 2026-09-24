-- Partidos marcados como sincronizados pero sin estadísticas de jugadores (2026-09-24).
--
-- Cuando API-Football limitaba por consultas por minuto respondía HTTP 200 con la lista
-- vacía; se tomaba como "partido sin datos" y quedaba cerrado para siempre (Premier 2025:
-- 10 de 380 partidos con jugadores). Ya corregido en sync-player-stats; acá se reabren para
-- que se vuelvan a pedir (cada uno tiene un reintento: si sigue vacío, se cierra solo).
-- La tanda pasa a correr cada 10 minutos (el job ya se llamaba así, pero corría cada hora).

UPDATE public.fixtures f
SET stats_synced = false
FROM public.leagues l
WHERE l.id = f.league_id
  AND l.has_player_stats
  AND l.source = 'api-football'
  AND f.id < 20000000
  AND f.stats_synced
  AND f.season >= 2025
  AND NOT EXISTS (SELECT 1 FROM public.player_match_stats m WHERE m.fixture_id = f.id);

SELECT cron.alter_job(jobid, schedule := '*/10 * * * *')
FROM cron.job WHERE jobname = 'sync-player-stats-10min';
