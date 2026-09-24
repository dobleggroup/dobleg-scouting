-- Destinatarios de los avisos de salud de datos (2026-09-24).
--
-- Antes le llegaban a todos los super admins. Ahora hay una lista propia: Marcos y Matías
-- Roberti reciben el aviso sin que Matías necesite permisos de super admin.

CREATE TABLE IF NOT EXISTS public.data_health_recipients (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.data_health_recipients ENABLE ROW LEVEL SECURITY;

INSERT INTO public.data_health_recipients (user_id) VALUES
  ('ea9bc174-bb0d-450c-b480-722fe7cfeadb'),  -- Marcos Cuccioletta
  ('0ec04cba-b671-4d19-8b58-5e9360248e04')   -- Matías Roberti
ON CONFLICT DO NOTHING;

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
