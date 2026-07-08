-- Overrides de puesto dentro de recalc_position_distribution().
--
-- La grilla de API-Football detecta mal el puesto de algunos jugadores. El score
-- (player_season_scores) ya se corrige en la Edge Function recalc-scores, pero la
-- ETIQUETA de posición (players.primary_position / position_distribution) la
-- calculaba esta función SQL a partir de detected_position, ignorando el override.
-- Como el cron la re-ejecuta cada 6h, cualquier UPDATE manual se revertía.
--
-- Acá metemos el override en la propia función: para esos jugadores TODOS sus
-- partidos se cuentan en su puesto real, así primary_position y la distribución
-- quedan consistentes con el score y no se revierten nunca. Ampliable agregando
-- filas al VALUES (clave = nombre en minúsculas).

CREATE OR REPLACE FUNCTION recalc_position_distribution()
RETURNS void AS $$
BEGIN
  UPDATE players p
  SET
    position_distribution = sub.dist,
    primary_position = sub.primary_pos,
    updated_at = now()
  FROM (
    SELECT
      player_id,
      jsonb_object_agg(pos, pct) AS dist,
      (array_agg(pos ORDER BY cnt DESC))[1] AS primary_pos
    FROM (
      SELECT
        pms.player_id,
        COALESCE(ov.forced_pos, pms.detected_position) AS pos,
        COUNT(*) AS cnt,
        ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER (PARTITION BY pms.player_id) * 100) AS pct
      FROM player_match_stats pms
      JOIN players pl ON pl.id = pms.player_id
      LEFT JOIN (
        VALUES
          ('mauricio vera', 'VC'),
          ('mario sanabria', 'EXT'),
          ('julián lópez', 'VC'),
          ('julian lopez', 'VC')
      ) AS ov(name_key, forced_pos) ON lower(pl.name) = ov.name_key
      WHERE pms.detected_position IS NOT NULL
      GROUP BY pms.player_id, COALESCE(ov.forced_pos, pms.detected_position)
    ) pos_counts
    GROUP BY player_id
  ) sub
  WHERE p.id = sub.player_id;
END;
$$ LANGUAGE plpgsql;
