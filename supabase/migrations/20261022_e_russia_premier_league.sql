-- Liga rusa (Premier League de Rusia, id 235 de API-Football) (2026-10-22).
--
-- Se pidió para Scout Externo. Calendario europeo: la 2026/27 es season = 2026.
-- Mismo nivel que la MLS y la Liga MX (tier 3).

INSERT INTO public.leagues (id, name, country, tier, season, has_player_stats, source)
VALUES (235, 'Premier League', 'Russia', 3, 2026, true, 'api-football')
ON CONFLICT (id) DO UPDATE
  SET season = EXCLUDED.season, has_player_stats = true, source = 'api-football';
