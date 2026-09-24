-- Valores de Transfermarkt al día (2026-09-24).
--
-- El refresco semanal recorría los ~14.000 jugadores en una sola llamada y el servidor lo
-- cortaba enseguida: los valores de la agencia quedaban de meses atrás (Matías Espíndola
-- figuraba 500k/1M según la fila; en Transfermarkt, €1.50m desde el 23/09). Ahora
-- enrich-player (mode refresh) trabaja por tandas: agencia una vez por día y el resto
-- rotando por antigüedad. Esta migración agrega la marca de cuándo se refrescó cada fila,
-- pasa el cron de semanal a cada hora (mismo job, solo cambia el horario) y suma la tarea
-- al control de salud.

ALTER TABLE public.players ADD COLUMN IF NOT EXISTS tm_refreshed_at timestamptz;
CREATE INDEX IF NOT EXISTS players_tm_refresh_idx
  ON public.players (tm_refreshed_at NULLS FIRST) WHERE transfermarkt_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS players_transfermarkt_id_idx
  ON public.players (transfermarkt_id) WHERE transfermarkt_id IS NOT NULL;

SELECT cron.alter_job(jobid, schedule := '20 * * * *')
FROM cron.job WHERE jobname = 'refresh-transfermarkt-weekly';

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

    IF last_ok IS NULL OR last_ok < now() - p.max_age THEN
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
