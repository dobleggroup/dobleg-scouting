-- Control de salud de los datos (2026-09-23).
--
-- detect_debut_alerts() estuvo rota 17 días (definición desplegada truncada: "where f3.leag")
-- y nadie se enteró: el cron corría, fallaba en 0,08 s y la página de Debutantes simplemente
-- dejó de sumar. Lo mismo pasó con la sincronización de Sofascore (tarea de Windows con ruta
-- vieja, sin datos desde el 1/9). Este chequeo corre cada hora y, si alguna tarea no terminó
-- bien dentro de su margen, le avisa a los super admins por la campanita (una vez por día y
-- por tarea, para no llenar de avisos).

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
      ('recalc-scores',       'Recálculo de ratings', interval '13 hours')
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

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'check-data-pipelines-health';
  PERFORM cron.schedule('check-data-pipelines-health', '50 * * * *', 'SELECT public.check_data_pipelines_health()');
END $$;
