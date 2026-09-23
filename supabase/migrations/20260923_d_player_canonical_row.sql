-- Una sola fila "oficial" por futbolista (2026-09-23).
--
-- Problema: el mismo jugador existe dos veces en `players` (fila de API-Football, id <
-- 20.000.000, y fila de Sofascore, id + 20.000.000). Cada pantalla elegía entre las dos
-- con su propia regla: fetch_players_list deduplicaba DESPUÉS de filtrar (si el filtro de
-- posición dejaba afuera a una, ganaba la otra), la ficha saltaba siempre a API-Football
-- salvo que estuviera más vieja, el Inicio prefería API-Football. Resultado: la lista decía
-- "Alan Sosa, volante interno, Aldosivi, 7+" y la ficha "extremo, Gimnasia LP, 6 y pico".
-- 1.819 pares de gemelos; en 1.344 difería el club y en 702 la posición.
--
-- Solución: `players.canonical_id` = la fila que se muestra, decidida UNA vez acá, con una
-- sola regla, y usada por todas las listas y por la ficha. Los gemelos se agrupan por
-- transfermarkt_id + fecha de nacimiento (mismo criterio que confirma la capa
-- player_identities). Orden de preferencia dentro de cada grupo:
--   1. tiene rating en la temporada más reciente (si no, desaparecería de las listas)
--   2. partido más reciente
--   3. su club actual coincide con el equipo de ese partido (API-Football a veces no
--      actualiza el club después de un pase: Alan Sosa seguía en Gimnasia)
--   4. más partidos en esa temporada
--   5. API-Football (trae traspasos y lesiones)

ALTER TABLE public.players ADD COLUMN IF NOT EXISTS canonical_id integer;
CREATE INDEX IF NOT EXISTS players_canonical_id_idx ON public.players(canonical_id);

CREATE OR REPLACE FUNCTION public.recompute_player_canonical_ids()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed integer;
  latest_season integer;
BEGIN
  SELECT max(season) INTO latest_season FROM player_season_scores WHERE avg_rating IS NOT NULL;

  WITH grp AS (
    SELECT p.id AS player_id,
           CASE WHEN p.transfermarkt_id IS NOT NULL
                THEN 't' || p.transfermarkt_id || '|' || COALESCE(p.birth_date::text, '')
                ELSE 'p' || p.id END AS gkey,
           p.current_team_id
    FROM players p
  ),
  multi AS (
    SELECT gkey FROM grp GROUP BY gkey HAVING count(*) > 1
  ),
  last_match AS (
    SELECT DISTINCT ON (m.player_id) m.player_id, f.date AS last_date, m.team_id AS last_team
    FROM player_match_stats m
    JOIN fixtures f ON f.id = m.fixture_id
    WHERE m.player_id IN (SELECT player_id FROM grp WHERE gkey IN (SELECT gkey FROM multi))
    ORDER BY m.player_id, f.date DESC
  ),
  season_mp AS (
    SELECT player_id, sum(matches_played) AS mp, bool_or(avg_rating IS NOT NULL) AS has_rating
    FROM player_season_scores
    WHERE season = latest_season
    GROUP BY player_id
  ),
  ranked AS (
    SELECT g.player_id,
           CASE WHEN g.gkey IN (SELECT gkey FROM multi) THEN
             first_value(g.player_id) OVER (
               PARTITION BY g.gkey
               ORDER BY COALESCE(sm.has_rating, false) DESC,
                        lm.last_date DESC NULLS LAST,
                        (g.current_team_id IS NOT DISTINCT FROM lm.last_team) DESC,
                        COALESCE(sm.mp, 0) DESC,
                        (g.player_id < 20000000) DESC,
                        g.player_id
             )
           ELSE g.player_id END AS canonical
    FROM grp g
    LEFT JOIN last_match lm ON lm.player_id = g.player_id
    LEFT JOIN season_mp sm ON sm.player_id = g.player_id
  )
  UPDATE players p
  SET canonical_id = r.canonical
  FROM ranked r
  WHERE r.player_id = p.id
    AND p.canonical_id IS DISTINCT FROM r.canonical;

  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END;
$$;

-- Se mantiene sola: cada hora (las sincronizaciones agregan partidos y jugadores nuevos).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'recompute-player-canonical-ids';
    PERFORM cron.schedule('recompute-player-canonical-ids', '23 * * * *', 'SELECT public.recompute_player_canonical_ids()');
  END IF;
END $$;

SELECT public.recompute_player_canonical_ids();
