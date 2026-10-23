-- Club actual siempre correcto (2026-10-23).
--
-- 1) Clubes duplicados: el mismo club existe una vez por fuente (API-Football y
--    Sofascore), ej. "Union Santa Fe" (441) y "Club Atlético Unión de Santa Fe"
--    (20003204). Peresutti quedaba en el de Sofascore y no aparecía filtrando
--    por Unión. teams.canonical_team_id apunta al club "oficial" (el de
--    API-Football); se calcula por partidos en común (misma liga, misma hora ±3h
--    y mismo resultado), nunca por nombre.
-- 2) Transferencias: recalc-scores recalculaba el club actual temporada por
--    temporada y la de la temporada anterior pisaba la vigente (Del Blanco: 2
--    partidos en Ligue 1 con Strasbourg pero seguía en Unión). Ahora el club
--    actual sale SIEMPRE del último partido jugado, en cualquier temporada, de
--    cualquiera de las filas del mismo futbolista (canonical_id), y en su
--    versión oficial (canonical_team_id).

ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS canonical_team_id integer REFERENCES public.teams(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS teams_canonical_idx ON public.teams (canonical_team_id);

CREATE OR REPLACE FUNCTION public.recompute_team_canonical_ids()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  changed integer;
BEGIN
  WITH pairs AS (
    SELECT s.home_team_id AS sofa, a.home_team_id AS api
    FROM fixtures s
    JOIN fixtures a ON a.league_id = s.league_id AND a.id < 20000000
      AND abs(extract(epoch FROM a.date - s.date)) <= 3 * 3600
      AND a.score_home IS NOT DISTINCT FROM s.score_home AND a.score_away IS NOT DISTINCT FROM s.score_away
    WHERE s.id >= 20000000 AND s.score_home IS NOT NULL
      AND s.home_team_id >= 20000000 AND a.home_team_id < 20000000
    UNION ALL
    SELECT s.away_team_id, a.away_team_id
    FROM fixtures s
    JOIN fixtures a ON a.league_id = s.league_id AND a.id < 20000000
      AND abs(extract(epoch FROM a.date - s.date)) <= 3 * 3600
      AND a.score_home IS NOT DISTINCT FROM s.score_home AND a.score_away IS NOT DISTINCT FROM s.score_away
    WHERE s.id >= 20000000 AND s.score_home IS NOT NULL
      AND s.away_team_id >= 20000000 AND a.away_team_id < 20000000
  ),
  votes AS (SELECT sofa, api, count(*) AS n FROM pairs GROUP BY 1, 2),
  tot AS (SELECT sofa, sum(n) AS total FROM votes GROUP BY 1),
  best AS (
    SELECT DISTINCT ON (v.sofa) v.sofa, v.api, v.n, t.total
    FROM votes v JOIN tot t USING (sofa)
    ORDER BY v.sofa, v.n DESC
  ),
  confident AS (SELECT sofa, api FROM best WHERE n >= 3 AND n::numeric / total >= 0.5)
  UPDATE teams t SET canonical_team_id = c.api
  FROM confident c
  WHERE t.id = c.sofa AND t.canonical_team_id IS DISTINCT FROM c.api;
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
  WITH ident AS (
    SELECT id, COALESCE(canonical_id, id) AS gid FROM players
  ),
  latest AS (
    SELECT DISTINCT ON (i.gid) i.gid, COALESCE(tm.canonical_team_id, pms.team_id) AS team_id
    FROM player_match_stats pms
    JOIN fixtures f ON f.id = pms.fixture_id
    JOIN ident i ON i.id = pms.player_id
    JOIN teams tm ON tm.id = pms.team_id
    WHERE pms.team_id IS NOT NULL
    ORDER BY i.gid, f.date DESC, pms.minutes DESC NULLS LAST
  )
  UPDATE players p SET current_team_id = l.team_id
  FROM ident i JOIN latest l ON l.gid = i.gid
  WHERE p.id = i.id AND p.current_team_id IS DISTINCT FROM l.team_id;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_team_canonical_ids() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_current_teams() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_team_canonical_ids() TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_current_teams() TO service_role;

SELECT public.recompute_team_canonical_ids();
SELECT public.refresh_current_teams();

-- Después de cada tanda de estadísticas (sync-player-stats corre a :00 y :30):
-- el club actual se recalcula a :10 y :40. Los clubes duplicados, cada 6 horas.
SELECT cron.unschedule('refresh-current-teams')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-current-teams');
SELECT cron.schedule('refresh-current-teams', '10,40 * * * *', 'SELECT public.refresh_current_teams()');
SELECT cron.unschedule('recompute-team-canonical-ids')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'recompute-team-canonical-ids');
SELECT cron.schedule('recompute-team-canonical-ids', '50 */6 * * *', 'SELECT public.recompute_team_canonical_ids()');
