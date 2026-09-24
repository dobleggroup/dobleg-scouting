-- Rating 0 = sin rating (2026-09-24).
--
-- Los proveedores mandan rating 0 para el convocado que no entró. Guardado como número,
-- el recálculo y la forma reciente lo contaban como un partido jugado con nota 0: bajaba
-- el promedio y sumaba partidos que no existieron (caso real: Luciano Minniti, Tigre,
-- figuraba con 0.0 en 1 partido). La escala va de 1 a 10, así que un 0 nunca es una nota
-- real: si no jugó, ese día no tiene puntaje. Se normaliza en la base para que valga para
-- cualquier sincronización (Sofascore o API-Football), actual o futura.

CREATE OR REPLACE FUNCTION public.player_match_stats_rating_zero_is_null()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.rating IS NOT NULL AND NEW.rating <= 0 THEN
    NEW.rating := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_player_match_stats_rating_zero_is_null ON public.player_match_stats;
CREATE TRIGGER trg_player_match_stats_rating_zero_is_null
  BEFORE INSERT OR UPDATE OF rating ON public.player_match_stats
  FOR EACH ROW EXECUTE FUNCTION public.player_match_stats_rating_zero_is_null();

UPDATE public.player_match_stats SET rating = NULL WHERE rating <= 0;
