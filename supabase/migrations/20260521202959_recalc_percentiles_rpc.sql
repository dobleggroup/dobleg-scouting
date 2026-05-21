CREATE OR REPLACE FUNCTION recalc_percentiles(p_season int)
RETURNS void AS $$
BEGIN
  UPDATE player_season_scores pss
  SET percentile = sub.pct
  FROM (
    SELECT id,
      ROUND(percent_rank() OVER (
        PARTITION BY position, league_id
        ORDER BY avg_score
      )::numeric * 100, 2) AS pct
    FROM player_season_scores
    WHERE season = p_season AND avg_score IS NOT NULL
  ) sub
  WHERE pss.id = sub.id;

  UPDATE player_season_scores pss
  SET global_percentile = sub.pct
  FROM (
    SELECT id,
      ROUND(percent_rank() OVER (
        PARTITION BY position
        ORDER BY avg_score
      )::numeric * 100, 2) AS pct
    FROM player_season_scores
    WHERE season = p_season AND avg_score IS NOT NULL
  ) sub
  WHERE pss.id = sub.id;
END;
$$ LANGUAGE plpgsql;

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
      jsonb_object_agg(detected_position, pct) AS dist,
      (array_agg(detected_position ORDER BY cnt DESC))[1] AS primary_pos
    FROM (
      SELECT
        player_id,
        detected_position,
        COUNT(*) AS cnt,
        ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER (PARTITION BY player_id) * 100) AS pct
      FROM player_match_stats
      WHERE detected_position IS NOT NULL
      GROUP BY player_id, detected_position
    ) pos_counts
    GROUP BY player_id
  ) sub
  WHERE p.id = sub.player_id;
END;
$$ LANGUAGE plpgsql;
