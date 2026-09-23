-- El recálculo de filas oficiales (20260923_d) corría cada hora, pero lo que decide la
-- elección (ratings de temporada, partidos nuevos) cambia recién cuando corre recalc-scores
-- (:15 y :45 cada 6 h, 20260923_f). Se pasa a :55 cada 6 h: mismo resultado, 6 veces menos
-- corridas. Medido: ~3,5 s en frío, ~0,2 s sin cambios.
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'recompute-player-canonical-ids';
  PERFORM cron.schedule('recompute-player-canonical-ids', '55 */6 * * *', 'SELECT public.recompute_player_canonical_ids()');
END $$;
