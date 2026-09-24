-- Primera B de Colombia (Torneo DIMAYOR) (2026-09-24).
--
-- Juan Farías (Unión Magdalena) juega ahí. API-Football tiene los partidos pero no las
-- estadísticas de jugadores de esta liga, así que se carga desde Sofascore (torneo 1238),
-- igual que la Primera Nacional (mismo nivel: tier 6, con debutantes). Se usa el id de
-- API-Football (240) como en el resto.

INSERT INTO public.leagues (id, name, country, tier, season, has_player_stats, source, track_debuts)
VALUES (240, 'Primera B', 'Colombia', 6, 2026, true, 'sofascore', true)
ON CONFLICT (id) DO UPDATE
  SET season = EXCLUDED.season, has_player_stats = true, source = 'sofascore';
