CREATE OR REPLACE FUNCTION recalc_percentiles(p_season int)
RETURNS void AS $$
BEGIN
  UPDATE player_season_scores pss
  SET percentile = sub.pct
  FROM (
    SELECT player_id, season, position, league_id,
      ROUND(percent_rank() OVER (
        PARTITION BY position, league_id
        ORDER BY avg_score
      )::numeric * 100, 2) AS pct
    FROM player_season_scores
    WHERE season = p_season AND avg_score IS NOT NULL
  ) sub
  WHERE pss.player_id = sub.player_id
    AND pss.season = sub.season
    AND pss.position = sub.position
    AND pss.league_id = sub.league_id;

  UPDATE player_season_scores pss
  SET global_percentile = sub.pct
  FROM (
    SELECT player_id, season, position, league_id,
      ROUND(percent_rank() OVER (
        PARTITION BY position
        ORDER BY avg_score
      )::numeric * 100, 2) AS pct
    FROM player_season_scores
    WHERE season = p_season AND avg_score IS NOT NULL
  ) sub
  WHERE pss.player_id = sub.player_id
    AND pss.season = sub.season
    AND pss.position = sub.position
    AND pss.league_id = sub.league_id;
END;
$$ LANGUAGE plpgsql;
