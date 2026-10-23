-- fetch_players_list: una sola regla de duplicados, la de players.canonical_id (2026-10-22).
--
-- Además del filtro por canonical_id, la lista re-agrupaba por transfermarkt_id (y si
-- faltaba, por nombre + club). Transfermarkt a veces le asigna el mismo id a homónimos, así
-- que esa segunda regla escondía jugadores distintos (5 "Lucas Rodríguez" de 5 clubes se
-- mostraban como uno). Con 20261022_a la fila oficial ya agrupa bien a los gemelos, así que
-- esta capa sobra: se saca para que lista y ficha usen exactamente la misma regla.
--
-- De paso, la búsqueda por nombre ignora acentos (antes "Espindola" no encontraba a Espíndola).
--
-- Va después de 20261022_d (orden por columna y nacionalidad): misma firma, mismos parámetros.

CREATE OR REPLACE FUNCTION public.fetch_players_list(p_seasons integer[], p_positions text[] DEFAULT NULL::text[], p_league_id integer DEFAULT NULL::integer, p_team_id integer DEFAULT NULL::integer, p_min_score numeric DEFAULT NULL::numeric, p_min_matches integer DEFAULT NULL::integer, p_min_age integer DEFAULT NULL::integer, p_max_age integer DEFAULT NULL::integer, p_min_market_value bigint DEFAULT NULL::bigint, p_max_market_value bigint DEFAULT NULL::bigint, p_max_contract_months integer DEFAULT NULL::integer, p_agents text[] DEFAULT NULL::text[], p_search text DEFAULT NULL::text, p_page integer DEFAULT 0, p_page_size integer DEFAULT 50, p_nationalities text[] DEFAULT NULL::text[], p_sort text DEFAULT NULL::text, p_sort_dir text DEFAULT 'desc'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH filtered AS (
    SELECT
      pss.player_id, pss.season, pss.position, pss.league_id,
      pss.matches_played, pss.avg_score, pss.avg_rating,
      pss.total_goals, pss.total_assists, pss.percentile, pss.global_percentile,
      pss.tackles_p90, pss.interceptions_p90, pss.blocks_p90, pss.duels_won_pct,
      pss.passes_accuracy, pss.passes_key_p90, pss.passes_total_p90,
      pss.dribbles_success_p90, pss.dribbles_pct, pss.shots_on_p90, pss.shots_pct,
      pss.goals_p90, pss.assists_p90, pss.fouls_drawn_p90, pss.saves_p90,
      pss.goals_conceded_p90, pss.penalty_saved_avg, pss.clean_sheet_pct,
      pl.name, pl.photo, pl.birth_date, pl.nationality, pl.preferred_foot,
      pl.height_cm, pl.primary_position, pl.position_distribution,
      pl.current_team_id, pl.market_value_eur, pl.contract_end_date,
      pl.agent, pl.transfermarkt_url, pl.transfermarkt_id,
      tm.id AS team_id, tm.name AS team_name, tm.logo AS team_logo,
      tm.league_id AS team_league_id,
      lg.id AS league_pk, lg.name AS league_name, lg.country AS league_country,
      lg.tier AS league_tier, lg.season AS league_season
    FROM player_season_scores pss
    JOIN players pl ON pl.id = pss.player_id
    LEFT JOIN teams tm ON tm.id = pl.current_team_id
    LEFT JOIN leagues lg ON lg.id = pss.league_id
    WHERE pss.season = ANY(p_seasons)
      -- Solo la fila oficial de cada futbolista (ver 20260923_d_player_canonical_row.sql):
      -- se elige ANTES de filtrar, así la lista y la ficha muestran siempre la misma fila.
      AND pl.id = COALESCE(pl.canonical_id, pl.id)
      AND pss.avg_rating IS NOT NULL
      AND (p_positions IS NULL OR pss.position = ANY(p_positions))
      AND (p_league_id IS NULL OR tm.league_id = p_league_id)
      AND (p_team_id  IS NULL OR pl.current_team_id = p_team_id)
      AND (p_min_score   IS NULL OR pss.avg_rating >= p_min_score)
      AND (p_min_matches IS NULL OR pss.matches_played >= p_min_matches)
      AND (p_min_age IS NULL OR pl.birth_date <= (now() - make_interval(years => p_min_age))::date)
      AND (p_max_age IS NULL OR pl.birth_date >= (now() - make_interval(years => p_max_age))::date)
      AND (p_min_market_value IS NULL OR pl.market_value_eur >= p_min_market_value)
      AND (p_max_market_value IS NULL OR pl.market_value_eur <= p_max_market_value)
      AND (p_max_contract_months IS NULL
           OR (pl.contract_end_date >= now()::date
               AND pl.contract_end_date <= (now() + make_interval(months => p_max_contract_months))::date))
      AND (p_agents IS NULL OR pl.agent = ANY(p_agents))
      AND (p_search IS NULL OR pl.name ILIKE '%' || p_search || '%'
           OR player_name_key(pl.name) LIKE '%' || player_name_key(p_search) || '%')
      AND (p_nationalities IS NULL OR pl.nationality = ANY(p_nationalities))
  ),
  by_player AS (
    SELECT DISTINCT ON (player_id) *
    FROM filtered
    ORDER BY player_id, (position = primary_position) DESC, matches_played DESC, season DESC, avg_rating DESC
  ),
  total AS (SELECT count(*)::int AS c FROM by_player),
  -- Orden elegido tocando la columna. Sin dato (sin valor de mercado, sin fecha
  -- de nacimiento) va siempre al final, en las dos direcciones.
  keyed AS (
    SELECT *,
      CASE p_sort
        WHEN 'goals'   THEN total_goals::numeric
        WHEN 'assists' THEN total_assists::numeric
        WHEN 'matches' THEN matches_played::numeric
        WHEN 'value'   THEN market_value_eur::numeric
        -- Una fecha de nacimiento imposible (menos de 13 años) cuenta como sin dato.
        WHEN 'age'     THEN CASE WHEN birth_date <= current_date - 4748 THEN (current_date - birth_date)::numeric END
        ELSE avg_rating::numeric
      END AS sort_key
    FROM by_player
  ),
  ranked AS (
    SELECT *,
      row_number() OVER (ORDER BY
        CASE WHEN p_sort_dir = 'asc' THEN sort_key END ASC NULLS LAST,
        CASE WHEN p_sort_dir = 'asc' THEN NULL ELSE sort_key END DESC NULLS LAST,
        avg_rating DESC NULLS LAST, matches_played DESC, player_id ASC) AS rn
    FROM keyed
  ),
  paged AS (
    SELECT *
    FROM ranked
    ORDER BY rn
    LIMIT GREATEST(p_page_size, 0)
    OFFSET GREATEST(p_page, 0) * GREATEST(p_page_size, 0)
  )
  SELECT jsonb_build_object(
    'count', (SELECT c FROM total),
    'players', COALESCE(
      (SELECT jsonb_agg(player_obj ORDER BY rn)
       FROM (
         SELECT
           rn,
           jsonb_build_object(
             'id', player_id,
             'name', name,
             'photo', photo,
             'birth_date', birth_date,
             'nationality', nationality,
             'preferred_foot', preferred_foot,
             'height_cm', height_cm,
             'primary_position', primary_position,
             'position_distribution', position_distribution,
             'current_team_id', current_team_id,
             'market_value_eur', market_value_eur,
             'contract_end_date', contract_end_date,
             'agent', agent,
             'transfermarkt_url', transfermarkt_url,
             'transfermarkt_id', transfermarkt_id,
             'team', CASE WHEN team_id IS NULL THEN NULL ELSE jsonb_build_object(
               'id', team_id, 'name', team_name, 'logo', team_logo, 'league_id', team_league_id
             ) END,
             'league', CASE WHEN league_pk IS NULL THEN NULL ELSE jsonb_build_object(
               'id', league_pk, 'name', league_name, 'country', league_country,
               'tier', league_tier, 'season', league_season
             ) END,
             'season_scores', jsonb_build_array(jsonb_build_object(
               'player_id', player_id, 'season', season, 'position', position,
               'league_id', league_id, 'matches_played', matches_played,
               'avg_score', avg_score, 'avg_rating', avg_rating,
               'total_goals', total_goals, 'total_assists', total_assists,
               'percentile', percentile, 'global_percentile', global_percentile,
               'tackles_p90', tackles_p90, 'interceptions_p90', interceptions_p90,
               'blocks_p90', blocks_p90, 'duels_won_pct', duels_won_pct,
               'passes_accuracy', passes_accuracy, 'passes_key_p90', passes_key_p90,
               'passes_total_p90', passes_total_p90, 'dribbles_success_p90', dribbles_success_p90,
               'dribbles_pct', dribbles_pct, 'shots_on_p90', shots_on_p90,
               'shots_pct', shots_pct, 'goals_p90', goals_p90, 'assists_p90', assists_p90,
               'fouls_drawn_p90', fouls_drawn_p90, 'saves_p90', saves_p90,
               'goals_conceded_p90', goals_conceded_p90, 'penalty_saved_avg', penalty_saved_avg,
               'clean_sheet_pct', clean_sheet_pct
             )),
             'primary_score', avg_rating,
             'primary_percentile', percentile
           ) AS player_obj
         FROM paged
       ) sub),
      '[]'::jsonb)
  );
$function$;
