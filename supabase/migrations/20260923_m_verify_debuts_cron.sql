-- verify-debuts (2026-09-23): cada 30 minutos confirma contra Transfermarkt las alertas de
-- debutantes que están 'pending' (ver supabase/functions/verify-debuts). Se suma al control
-- de salud: si deja de correr, los debutantes nuevos quedan ocultos y hay que enterarse.
--
-- El header de autorización se toma del job existente de recalc-scores (no se copia ninguna
-- key acá).

DO $$
DECLARE
  base_command text;
  base_url text;
  auth_header text;
BEGIN
  SELECT command INTO base_command FROM cron.job WHERE jobname = 'recalc-scores-6h';
  IF base_command IS NULL THEN
    RAISE EXCEPTION 'recalc-scores-6h no existe: no hay de dónde tomar URL y header';
  END IF;
  base_url := substring(base_command from 'url := ''([^'']+)/recalc-scores''');
  auth_header := substring(base_command from 'headers := ''([^'']+)''::jsonb');

  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'verify-debuts-30m';
  PERFORM cron.schedule(
    'verify-debuts-30m',
    '5,35 * * * *',
    format($cmd$select net.http_post(url := %L, headers := %L::jsonb, body := '{"limit": 40}'::jsonb, timeout_milliseconds := 120000);$cmd$,
           base_url || '/verify-debuts', auth_header)
  );
END $$;

CREATE OR REPLACE FUNCTION public.check_data_pipelines_health()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p record;
  last_ok timestamptz;
  msg text;
  admin record;
  sent integer := 0;
BEGIN
  FOR p IN
    SELECT * FROM (VALUES
      ('detect_debut_alerts', 'Detección de debutantes', interval '26 hours'),
      ('sync-fixtures',       'Partidos de API-Football', interval '3 hours'),
      ('sync-player-stats',   'Estadísticas de partidos (API-Football)', interval '6 hours'),
      ('sync-sofascore-py',   'Sincronización de Sofascore (Primera Nacional, Liga Profesional, Uruguay, México)', interval '6 hours'),
      ('recalc-scores',       'Recálculo de ratings', interval '13 hours'),
      ('verify-debuts',       'Verificación de debutantes con Transfermarkt', interval '3 hours')
    ) AS t(function_name, label, max_age)
  LOOP
    SELECT max(created_at) INTO last_ok
    FROM sync_log
    WHERE function_name = p.function_name AND status = 'success';

    IF last_ok IS NULL OR last_ok < now() - p.max_age THEN
      msg := format('Datos: "%s" no se actualiza desde %s. Revisar la tarea automática.',
                    p.label,
                    COALESCE(to_char(last_ok AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI'), 'hace más de 10 días'));
      FOR admin IN SELECT user_id FROM super_admins LOOP
        IF NOT EXISTS (
          SELECT 1 FROM notifications n
          WHERE n.user_id = admin.user_id
            AND n.type = 'data_health:' || p.function_name
            AND n.created_at > now() - interval '24 hours'
        ) THEN
          INSERT INTO notifications (user_id, club_id, type, message, link)
          VALUES (admin.user_id, 'dobleg', 'data_health:' || p.function_name, msg, NULL);
          sent := sent + 1;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  RETURN sent;
END;
$$;
