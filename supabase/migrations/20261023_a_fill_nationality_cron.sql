-- Nacionalidad de los jugadores nuevos (dato clave para la agencia).
-- Los syncs de partidos crean jugadores sin nacionalidad; enrich-player en modo
-- 'nationality' la completa de a tandas chicas cada hora (ver fillNationalities).

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS nationality_checked_at timestamptz;

-- Jugadores de API-Football (id < 20M) sin nacionalidad, primero los que
-- jugaron más recientemente, salteando los consultados hace poco sin resultado.
CREATE OR REPLACE FUNCTION public.players_missing_nationality(p_limit integer, p_recheck_before timestamptz)
RETURNS TABLE (id bigint, birth_date date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id::bigint, p.birth_date
  FROM public.players p
  JOIN LATERAL (
    SELECT max(f.date) AS last_played
    FROM public.player_match_stats s
    JOIN public.fixtures f ON f.id = s.fixture_id
    WHERE s.player_id = p.id
  ) lp ON lp.last_played IS NOT NULL
  WHERE p.nationality IS NULL
    AND p.id > 0 AND p.id < 20000000
    AND (p.nationality_checked_at IS NULL OR p.nationality_checked_at < p_recheck_before)
  ORDER BY lp.last_played DESC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.players_missing_nationality(integer, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.players_missing_nationality(integer, timestamptz) TO service_role;

-- Cron cada hora (:35). Reusa el comando del refresh de Transfermarkt (misma
-- función y credenciales) cambiando solo el modo.
SELECT cron.unschedule('fill-nationality-hourly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fill-nationality-hourly');

SELECT cron.schedule(
  'fill-nationality-hourly',
  '35 * * * *',
  replace(
    (SELECT command FROM cron.job WHERE jobname = 'refresh-transfermarkt-weekly'),
    '"mode": "refresh"',
    '"mode": "nationality"'
  )
);
