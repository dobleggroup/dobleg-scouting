-- fetch_recent_form (Inicio: "Oportunidades de mercado" y "Mejores del Scouting
-- Externo") tardaba ~10 s por llamada: para quedarse con los partidos de los
-- últimos 6 meses leía la tabla player_match_stats entera (~145 MB, más que
-- toda la memoria de la base: shared_buffers 128 MB), siempre desde disco.
-- Este índice tiene sólo lo que usa ese cálculo (partido, jugador, rating) y
-- es chico, así que queda en memoria y la consulta no toca la tabla.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pms_fixture_rating
  ON public.player_match_stats (fixture_id) INCLUDE (player_id, rating)
  WHERE rating IS NOT NULL;
