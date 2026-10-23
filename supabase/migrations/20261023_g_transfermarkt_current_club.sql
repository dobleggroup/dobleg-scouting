-- Transferencias a ligas que no seguimos (2026-10-23).
-- Si un jugador se va a un club de una liga que no sincronizamos, no tiene
-- partidos nuevos y su club quedaría en el anterior para siempre. Transfermarkt
-- dice su club actual y desde cuándo: si llegó DESPUÉS de su último partido que
-- tenemos, la lista muestra ese club (y deja de aparecer en el club viejo).

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS tm_club_id integer,
  ADD COLUMN IF NOT EXISTS tm_club_name text,
  ADD COLUMN IF NOT EXISTS tm_club_since date,
  ADD COLUMN IF NOT EXISTS last_match_date date;

-- Nombres de clubes de Transfermarkt (se consultan una vez y quedan guardados).
CREATE TABLE IF NOT EXISTS public.tm_clubs (
  id integer PRIMARY KEY,
  name text NOT NULL,
  country_id integer,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tm_clubs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS read_tm_clubs ON public.tm_clubs;
CREATE POLICY read_tm_clubs ON public.tm_clubs FOR SELECT TO authenticated USING (true);

-- El club actual y la fecha del último partido salen juntos del último partido.
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
    SELECT DISTINCT ON (i.gid) i.gid, COALESCE(tm.canonical_team_id, pms.team_id) AS team_id, f.date::date AS last_date
    FROM player_match_stats pms
    JOIN fixtures f ON f.id = pms.fixture_id
    JOIN ident i ON i.id = pms.player_id
    JOIN teams tm ON tm.id = pms.team_id
    WHERE pms.team_id IS NOT NULL
    ORDER BY i.gid, f.date DESC, pms.minutes DESC NULLS LAST
  )
  UPDATE players p SET current_team_id = l.team_id, last_match_date = l.last_date
  FROM ident i JOIN latest l ON l.gid = i.gid
  WHERE p.id = i.id
    AND (p.current_team_id IS DISTINCT FROM l.team_id OR p.last_match_date IS DISTINCT FROM l.last_date);
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END;
$$;

SELECT public.refresh_current_teams();
