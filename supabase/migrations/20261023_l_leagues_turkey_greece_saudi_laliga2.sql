-- Ligas fuera de Latinoamérica con muchos latinoamericanos (pedido 2026-10-23):
-- Turquía, Grecia, Arabia Saudita y la Segunda de España. El cron de partidos
-- (sync-fixtures-hourly) toma cualquier liga con has_player_stats y el de
-- estadísticas las va completando de a tandas.
INSERT INTO public.leagues (id, name, country, tier, season, has_player_stats, source) VALUES
  (203, 'Süper Lig', 'Turkey', 3, 2026, true, 'api-football'),
  (197, 'Super League 1', 'Greece', 3, 2026, true, 'api-football'),
  (307, 'Pro League', 'Saudi-Arabia', 3, 2026, true, 'api-football'),
  (141, 'Segunda División', 'Spain', 3, 2026, true, 'api-football')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, country = EXCLUDED.country, season = EXCLUDED.season,
  has_player_stats = EXCLUDED.has_player_stats, source = EXCLUDED.source;
