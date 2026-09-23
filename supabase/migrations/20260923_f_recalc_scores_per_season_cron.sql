-- recalc-scores se llamaba cada 6 h sin body, lo que procesa las dos últimas temporadas
-- juntas (año anterior para ligas europeas + año actual para las anuales). Con el volumen
-- actual eso falla por recursos (WORKER_RESOURCE_LIMIT) y NO se recalcula nada: los ratings
-- quedaban congelados (ej. Mastrolía con 26 partidos y rating armado con 17).
-- Verificado 2026-09-23: {"season":2026} sola termina bien (9.238 filas en ~90 s).
--
-- Se separa en dos jobs, uno por temporada, para que una falla no arrastre a la otra.
-- Se reutiliza la URL y el header del job existente (no se copia ninguna key acá).

DO $$
DECLARE
  base_command text;
BEGIN
  SELECT command INTO base_command FROM cron.job WHERE jobname = 'recalc-scores-6h';
  IF base_command IS NULL THEN
    RAISE NOTICE 'recalc-scores-6h no existe, nada que hacer';
    RETURN;
  END IF;

  -- Temporada actual (ligas de calendario anual: Argentina, Uruguay, México...).
  PERFORM cron.schedule(
    'recalc-scores-6h',
    '15 */6 * * *',
    replace(base_command, '''{}''::jsonb', 'jsonb_build_object(''season'', extract(year from now())::int)')
  );

  -- Temporada anterior (ligas europeas 2025/26), 30 minutos después para no pisarse.
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'recalc-scores-prev-season-6h';
  PERFORM cron.schedule(
    'recalc-scores-prev-season-6h',
    '45 */6 * * *',
    replace(base_command, '''{}''::jsonb', 'jsonb_build_object(''season'', extract(year from now())::int - 1)')
  );
END $$;
