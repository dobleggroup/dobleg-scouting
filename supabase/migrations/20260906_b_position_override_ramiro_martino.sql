-- Ramiro Martino aparecia como "Defensor central" (CB) en Debutantes -- API-Football
-- etiqueto su unico partido sincronizado (su debut) con esa posicion de formacion, pero
-- es lateral izquierdo. Mismo mecanismo de override que ya existe para otros jugadores
-- (ver 20260708_position_overrides_in_distribution.sql) -- se agrega su fila al VALUES
-- y se re-ejecuta la funcion para que tome efecto ya, sin esperar al proximo cron.

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
          ('julian lopez', 'VC'),
          ('ramiro martino', 'LI')
      ) AS ov(name_key, forced_pos) ON lower(pl.name) = ov.name_key
      WHERE pms.detected_position IS NOT NULL
      GROUP BY pms.player_id, COALESCE(ov.forced_pos, pms.detected_position)
    ) pos_counts
    GROUP BY player_id
  ) sub
  WHERE p.id = sub.player_id;
END;
$$ LANGUAGE plpgsql;

SELECT recalc_position_distribution();
