-- Pausa por cupo (2026-10-24): cuando el cupo compartido de API-Football llega
-- al tope de un proceso (_shared/api-football.ts), la corrida queda en sync_log
-- con status 'paused' en vez de 'error', y el control de salud no avisa "no se
-- actualiza" mientras siga en pausa (el aviso de cupo ya lo explica).

ALTER TABLE public.sync_log DROP CONSTRAINT sync_log_status_check;
ALTER TABLE public.sync_log ADD CONSTRAINT sync_log_status_check
  CHECK (status = ANY (ARRAY['pending', 'success', 'error', 'no_stats', 'paused']));

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
      ('sync-sofascore-py',   'Sincronización de Sofascore (Primera Nacional, Liga Profesional, Uruguay, México, 2° Colombia)', interval '6 hours'),
      ('refresh-transfermarkt', 'Valores de mercado de Transfermarkt', interval '3 hours'),
      ('recalc-scores',       'Recálculo de ratings', interval '13 hours')
    ) AS t(function_name, label, max_age)
  LOOP
    SELECT max(created_at) INTO last_ok
    FROM sync_log
    WHERE function_name = p.function_name AND status = 'success';

    -- Frenado a propósito por el cupo de API-Football (status 'paused'): ya lo explica
    -- el aviso de cupo y sigue solo cuando el cupo vuelve a cero, no es una falla.
    IF last_ok IS NULL OR last_ok < now() - p.max_age THEN
      IF EXISTS (
        SELECT 1 FROM sync_log
        WHERE function_name = p.function_name AND status = 'paused'
          AND created_at > COALESCE(last_ok, '-infinity') AND created_at > now() - interval '2 hours'
      ) THEN
        CONTINUE;
      END IF;

      msg := format('Datos: "%s" no se actualiza desde %s. Revisar la tarea automática.',
                    p.label,
                    COALESCE(to_char(last_ok AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI'), 'hace más de 10 días'));
      FOR admin IN SELECT user_id FROM data_health_recipients LOOP
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
