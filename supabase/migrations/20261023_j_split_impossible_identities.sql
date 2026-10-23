-- Homónimos mal unidos (2026-10-23). recompute_player_canonical_ids une filas
-- por nombre + fecha de nacimiento; si la fecha está mal cargada, une a dos
-- personas distintas (Jhon Córdoba de Krasnodar con el J. Córdoba de Instituto:
-- 144 grupos así). Regla dura: dos filas que jugaron el MISMO día para equipos
-- distintos no pueden ser la misma persona → la fila se separa del grupo.
--
-- Además el club actual pasa a salir de los partidos de cada fila (no de todo
-- el grupo), así una unión mal hecha nunca contagia el club.

CREATE OR REPLACE FUNCTION public.split_impossible_identities()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  changed integer;
BEGIN
  WITH grouped AS (
    SELECT id, canonical_id AS gid FROM players
    WHERE canonical_id IS NOT NULL AND canonical_id <> id
  ),
  apps AS (
    SELECT s.player_id, f.date::date AS d, COALESCE(t.canonical_team_id, s.team_id) AS team
    FROM player_match_stats s
    JOIN fixtures f ON f.id = s.fixture_id
    JOIN teams t ON t.id = s.team_id
    WHERE s.player_id IN (SELECT id FROM grouped UNION SELECT gid FROM grouped)
  ),
  clashing AS (
    SELECT DISTINCT g.id
    FROM grouped g
    JOIN apps a ON a.player_id = g.id
    JOIN apps b ON b.player_id = g.gid AND b.d = a.d AND b.team <> a.team
  )
  UPDATE players p SET canonical_id = p.id
  FROM clashing c
  WHERE p.id = c.id;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_current_teams()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  changed integer;
BEGIN
  WITH latest AS (
    SELECT DISTINCT ON (pms.player_id) pms.player_id,
      COALESCE(tm.canonical_team_id, pms.team_id) AS team_id, f.date::date AS last_date
    FROM player_match_stats pms
    JOIN fixtures f ON f.id = pms.fixture_id
    JOIN teams tm ON tm.id = pms.team_id
    WHERE pms.team_id IS NOT NULL
    ORDER BY pms.player_id, f.date DESC, pms.minutes DESC NULLS LAST
  )
  UPDATE players p SET current_team_id = l.team_id, last_match_date = l.last_date
  FROM latest l
  WHERE p.id = l.player_id
    AND (p.current_team_id IS DISTINCT FROM l.team_id OR p.last_match_date IS DISTINCT FROM l.last_date);
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END;
$$;

REVOKE ALL ON FUNCTION public.split_impossible_identities() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.split_impossible_identities() TO service_role;

SELECT public.split_impossible_identities();
SELECT public.refresh_current_teams();

-- Cada vez que se recalculan las identidades, se separan las imposibles y se
-- recalcula el club actual.
SELECT cron.schedule(
  'recompute-player-canonical-ids',
  '55 */6 * * *',
  'SELECT public.recompute_player_canonical_ids(); SELECT public.split_impossible_identities(); SELECT public.refresh_current_teams();'
);
