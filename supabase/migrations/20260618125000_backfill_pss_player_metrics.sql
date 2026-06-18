-- Backfill de las métricas p90 por jugador en player_season_scores, calculadas
-- desde player_match_stats. Mismo criterio que recalc-scores (por player_id +
-- posición detectada + liga del equipo + temporada del partido).
-- Idempotente: re-ejecutable sin efectos colaterales.
UPDATE player_season_scores pss
SET
  tackles_p90          = agg.tackles_p90,
  interceptions_p90    = agg.interceptions_p90,
  blocks_p90           = agg.blocks_p90,
  duels_won_pct        = agg.duels_won_pct,
  passes_accuracy      = agg.passes_accuracy,
  passes_key_p90       = agg.passes_key_p90,
  passes_total_p90     = agg.passes_total_p90,
  dribbles_success_p90 = agg.dribbles_success_p90,
  dribbles_pct         = agg.dribbles_pct,
  shots_on_p90         = agg.shots_on_p90,
  shots_pct            = agg.shots_pct,
  goals_p90            = agg.goals_p90,
  assists_p90          = agg.assists_p90,
  fouls_drawn_p90      = agg.fouls_drawn_p90,
  saves_p90            = agg.saves_p90,
  goals_conceded_p90   = agg.goals_conceded_p90,
  penalty_saved_avg    = agg.penalty_saved_avg,
  clean_sheet_pct      = agg.clean_sheet_pct
FROM (
  SELECT
    pms.player_id,
    pms.detected_position AS position,
    t.league_id,
    f.season,
    round(avg(CASE WHEN pms.minutes > 0 THEN pms.tackles::numeric       / pms.minutes * 90 END)::numeric, 2) AS tackles_p90,
    round(avg(CASE WHEN pms.minutes > 0 THEN pms.interceptions::numeric / pms.minutes * 90 END)::numeric, 2) AS interceptions_p90,
    round(avg(CASE WHEN pms.minutes > 0 THEN pms.blocks::numeric        / pms.minutes * 90 END)::numeric, 2) AS blocks_p90,
    round((sum(pms.duels_won)::numeric    / nullif(sum(pms.duels_total), 0)        * 100)::numeric, 2) AS duels_won_pct,
    round(avg(nullif(pms.passes_accuracy, 0))::numeric, 2) AS passes_accuracy,
    round(avg(CASE WHEN pms.minutes > 0 THEN pms.passes_key::numeric    / pms.minutes * 90 END)::numeric, 2) AS passes_key_p90,
    round(avg(CASE WHEN pms.minutes > 0 THEN pms.passes_total::numeric  / pms.minutes * 90 END)::numeric, 2) AS passes_total_p90,
    round(avg(CASE WHEN pms.minutes > 0 THEN pms.dribbles_success::numeric / pms.minutes * 90 END)::numeric, 2) AS dribbles_success_p90,
    round((sum(pms.dribbles_success)::numeric / nullif(sum(pms.dribbles_attempted), 0) * 100)::numeric, 2) AS dribbles_pct,
    round(avg(CASE WHEN pms.minutes > 0 THEN pms.shots_on::numeric      / pms.minutes * 90 END)::numeric, 2) AS shots_on_p90,
    round((sum(pms.shots_on)::numeric     / nullif(sum(pms.shots_total), 0)       * 100)::numeric, 2) AS shots_pct,
    round(avg(CASE WHEN pms.minutes > 0 THEN pms.goals::numeric         / pms.minutes * 90 END)::numeric, 2) AS goals_p90,
    round(avg(CASE WHEN pms.minutes > 0 THEN pms.assists::numeric       / pms.minutes * 90 END)::numeric, 2) AS assists_p90,
    round(avg(CASE WHEN pms.minutes > 0 THEN pms.fouls_drawn::numeric   / pms.minutes * 90 END)::numeric, 2) AS fouls_drawn_p90,
    round(avg(CASE WHEN pms.minutes > 0 THEN pms.saves::numeric         / pms.minutes * 90 END)::numeric, 2) AS saves_p90,
    round(avg(CASE WHEN pms.minutes > 0 THEN pms.goals_conceded::numeric / pms.minutes * 90 END)::numeric, 2) AS goals_conceded_p90,
    round(avg(nullif(pms.penalty_saved, 0))::numeric, 2) AS penalty_saved_avg,
    round((count(*) FILTER (WHERE pms.goals_conceded = 0)::numeric / count(*) * 100)::numeric, 2) AS clean_sheet_pct
  FROM player_match_stats pms
  JOIN fixtures f ON f.id = pms.fixture_id
  JOIN teams t    ON t.id = pms.team_id
  WHERE pms.match_score IS NOT NULL
    AND pms.detected_position IS NOT NULL
  GROUP BY pms.player_id, pms.detected_position, t.league_id, f.season
) agg
WHERE pss.player_id = agg.player_id
  AND pss.position  = agg.position
  AND pss.league_id = agg.league_id
  AND pss.season    = agg.season;
