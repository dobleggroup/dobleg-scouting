-- Cupo de API-Football (2026-10-19).
--
-- El 18/10 (14:10) y el 19/10 (19:00) se agotó el cupo diario: sync-player-stats corría
-- cada 10 minutos y cada partido terminado sin datos se volvía a pedir (2 consultas) en
-- cada pasada durante 3 días. Pasa a cada 30 minutos (3 veces menos consultas) y se suma
-- un control horario que avisa al pasar el 80 % del cupo.

SELECT cron.schedule('sync-player-stats-30min', '*/30 * * * *',
  (SELECT command FROM cron.job WHERE jobname = 'sync-player-stats-10min'))
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-player-stats-10min');

SELECT cron.unschedule('sync-player-stats-10min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-player-stats-10min');

SELECT cron.schedule('check-api-quota-hourly', '20 * * * *',
  replace((SELECT command FROM cron.job WHERE jobname = 'sync-player-stats-30min'),
          '/functions/v1/sync-player-stats', '/functions/v1/check-api-quota'));
