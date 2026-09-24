-- Primera de Paraguay completa (2026-09-24).
--
-- API-Football la parte en dos torneos: Apertura (250) y Clausura (252). Solo estaba el
-- Clausura, así que faltaba medio año de Paraguay. Un torneo con liga "madre" carga sus
-- partidos y estadísticas pero los equipos pertenecen a la madre: en el filtro y en los
-- ratings es una sola liga (el recálculo ya toma todos los partidos de los equipos de
-- cada liga, de cualquier torneo).

ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS parent_league_id integer REFERENCES public.leagues(id);

INSERT INTO public.leagues (id, name, country, tier, season, has_player_stats, source, track_debuts, parent_league_id)
SELECT 250, 'Division Profesional - Apertura', country, tier, 2026, true, 'api-football', track_debuts, 252
FROM public.leagues WHERE id = 252
ON CONFLICT (id) DO UPDATE SET parent_league_id = 252, has_player_stats = true;
