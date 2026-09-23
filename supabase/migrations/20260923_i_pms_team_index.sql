-- El Inicio (rendimiento de la agencia) y el plantel de los DT filtran player_match_stats por
-- equipo (`.in('team_id', ...)` / `.eq('team_id', ...)`) ordenado por fixture_id, pero el único
-- índice con team_id empieza por detected_position: cada consulta recorría las ~232k filas
-- (2,8 s en frío, 12 s en el Inicio con otras consultas en paralelo).
CREATE INDEX IF NOT EXISTS idx_pms_team_fixture ON public.player_match_stats (team_id, fixture_id);
