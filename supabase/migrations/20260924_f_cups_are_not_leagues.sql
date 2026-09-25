-- Las copas no son ligas (2026-09-24).
--
-- Libertadores y Sudamericana estaban cargadas como ligas con estadísticas: cada partido de
-- copa le pisaba la liga al equipo (teams.league_id = 11/13) y el recálculo armaba ratings
-- "de la Libertadores" como si fuera un torneo aparte, que además aparecía en el filtro de
-- ligas de Scout Externo. Los partidos de copa siguen contando para las estadísticas y el
-- rating del jugador (el recálculo toma todos los partidos de los equipos de cada liga,
-- de cualquier competencia), pero cada equipo pertenece a su liga real.

ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS is_cup boolean NOT NULL DEFAULT false;

UPDATE public.leagues SET is_cup = true
WHERE id IN (2, 3, 11, 13, 130, 143);  -- Champions, Europa League, Sudamericana, Libertadores, Copa Argentina, Copa del Rey

-- Equipos que quedaron "en" una copa: vuelven a la liga donde más partidos jugaron.
UPDATE public.teams t
SET league_id = d.league_id
FROM (
  SELECT DISTINCT ON (team_id) team_id, league_id
  FROM (
    SELECT f.home_team_id AS team_id, f.league_id FROM public.fixtures f
    UNION ALL
    SELECT f.away_team_id, f.league_id FROM public.fixtures f
  ) x
  JOIN public.leagues l ON l.id = x.league_id AND NOT l.is_cup
  GROUP BY team_id, x.league_id
  ORDER BY team_id, count(*) DESC
) d
WHERE t.id = d.team_id
  AND t.league_id IN (SELECT id FROM public.leagues WHERE is_cup);

-- Uruguayos de API-Football: su liga se carga desde Sofascore (otros ids de equipo), así
-- que no tienen partidos de liga propios. País confirmado en API-Football.
UPDATE public.teams SET league_id = 268
WHERE id IN (2348, 2350, 2353, 2356, 2358, 2359, 2361, 2365)
  AND league_id IN (SELECT id FROM public.leagues WHERE is_cup);

-- Cualquier otro que siga en una copa queda sin liga (no inventarle una).
UPDATE public.teams SET league_id = NULL
WHERE league_id IN (SELECT id FROM public.leagues WHERE is_cup);
