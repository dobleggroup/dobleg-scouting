-- Add missing leagues where Doble G players compete
-- UAE Pro League (Al Ain: M. Palacios, T. Valdecantos)
-- Bolivia Primera División (Bolívar: S. Echeverría)
-- Honduras Liga Nacional (Olimpia: A. Mulet)

INSERT INTO public.leagues (id, name, country, tier, season, has_player_stats, source) VALUES
  (301, 'Pro League',           'United-Arab-Emirates', 4, 2025, true, 'api-football'),
  (344, 'Primera División',     'Bolivia',              5, 2026, true, 'api-football'),
  (234, 'Liga Nacional',        'Honduras',             5, 2025, true, 'api-football')
ON CONFLICT (id) DO UPDATE SET
  has_player_stats = EXCLUDED.has_player_stats,
  season = EXCLUDED.season,
  source = EXCLUDED.source;
