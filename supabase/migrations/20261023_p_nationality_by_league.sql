-- Nacionalidades por liga (2026-10-23): cuando una liga tiene muchos jugadores
-- sin nacionalidad (una liga recién agregada), enrich-player mode=nationality
-- las completa con los planteles de la liga (20 jugadores por consulta) en vez
-- de una consulta por jugador. El avance se guarda para seguir donde quedó.

CREATE TABLE IF NOT EXISTS public.nationality_league_progress (
  league_id integer NOT NULL,
  season integer NOT NULL,
  next_page integer NOT NULL DEFAULT 1,
  total_pages integer,
  done_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, season)
);
ALTER TABLE public.nationality_league_progress ENABLE ROW LEVEL SECURITY;

-- Liga de API-Football con más jugadores sin nacionalidad (mínimo 25), que no
-- se haya recorrido entera en la última semana.
CREATE OR REPLACE FUNCTION public.league_missing_nationality()
RETURNS TABLE (league_id integer, season integer, missing bigint, next_page integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT l.id, l.season, count(*) AS missing, COALESCE(pr.next_page, 1)
  FROM players p
  JOIN teams t ON t.id = p.current_team_id
  JOIN leagues l ON l.id = t.league_id AND l.source = 'api-football'
  LEFT JOIN nationality_league_progress pr ON pr.league_id = l.id AND pr.season = l.season
  WHERE p.nationality IS NULL AND p.id > 0 AND p.id < 20000000
    AND (pr.done_at IS NULL OR pr.done_at < now() - interval '7 days')
  GROUP BY l.id, l.season, pr.next_page
  HAVING count(*) >= 25
  ORDER BY count(*) DESC
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.league_missing_nationality() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.league_missing_nationality() TO service_role;
