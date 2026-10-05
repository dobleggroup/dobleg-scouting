-- supabase/migrations/20260925_b_recalc_steps_timeout.sql
-- El recalculo de fichas (edge function recalc-scores) llama a estas funciones por la API,
-- donde el rol authenticator corta cualquier consulta a los 8 s. Las tres tardan mas y el
-- recalculo quedaba cortado (backfill al principio, distribucion de puestos al final).
--
-- 1) recalc_position_distribution solo escribe a los jugadores cuyo puesto cambio (antes
--    reescribia a todos los jugadores en cada corrida, aunque no hubiera cambios).
-- 2) Las tres funciones tienen su propio limite de tiempo.

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
  WHERE p.id = sub.player_id
    AND (p.position_distribution IS DISTINCT FROM sub.dist OR p.primary_position IS DISTINCT FROM sub.primary_pos);
END;
$$ LANGUAGE plpgsql;

ALTER FUNCTION recalc_position_distribution() SET statement_timeout = '120s';
ALTER FUNCTION recalc_percentiles(int) SET statement_timeout = '120s';
ALTER FUNCTION backfill_ungridded_positions() SET statement_timeout = '120s';
