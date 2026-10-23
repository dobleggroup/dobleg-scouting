-- Estadísticas atrasadas (ligas nuevas, temporada anterior de Rusia): de noche,
-- con la cuota de API-Football recién renovada (se renueva a las 21 h AR), se
-- procesa una tanda extra cada 10 minutos. Se apaga sola: solo corre entre las
-- 21 y las 7 h, mientras queden más de 15 partidos pendientes y con el cupo
-- del día por debajo del 65 % (lo comparten otras plataformas). Reusa el
-- comando (y credenciales) del cron sync-player-stats-30min.
SELECT cron.unschedule('sync-player-stats-night-boost')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-player-stats-night-boost');

SELECT cron.schedule(
  'sync-player-stats-night-boost',
  '5,15,25,35,45,55 * * * *',
  'DO $boost$ BEGIN '
  || 'IF extract(hour FROM now() AT TIME ZONE ''America/Argentina/Buenos_Aires'') IN (21, 22, 23, 0, 1, 2, 3, 4, 5, 6) '
  || 'AND (SELECT count(*) FROM public.fixtures WHERE stats_synced = false AND date < now() - interval ''3 hours'') > 15 '
  -- y solo si el último control de cupo (check-api-quota, cada hora) dio menos de 65 %
  || 'AND COALESCE((SELECT substring(error_message FROM ''uso (\d+)%'')::int FROM public.sync_log WHERE function_name = ''check-api-quota'' AND status = ''success'' ORDER BY created_at DESC LIMIT 1), 100) < 65 THEN '
  || regexp_replace(
       rtrim(btrim((SELECT command FROM cron.job WHERE jobname = 'sync-player-stats-30min'), E' \n\t'), ';'),
       '^select', 'PERFORM', 'i')
  || '; END IF; END $boost$;'
);
