-- fetch_recent_form tardaba 9-13 s por llamada (el Inicio la llama 4 veces): el CTE `scored`
-- leía todas las estadísticas por partido de la historia. Se filtra por fecha al principio.
-- Además pasa a PL/pgSQL: como función SQL se planificaba sin conocer los parámetros y los
-- filtros condicionales (p_cheap_max_value IS NOT NULL OR ...) daban un mal plan: la misma
-- consulta tardaba 0,8 s directa y 3,9 s como función. PL/pgSQL planifica con los valores reales.
-- Cuerpo copiado de 20260923_e_player_lists_canonical_only.sql con esos cambios.

CREATE OR REPLACE FUNCTION fetch_recent_form(
  p_window_months       int,
  p_min_matches         int    DEFAULT 3,
  p_fallback_months     int    DEFAULT 6,
  p_fallback_limit      int    DEFAULT 5,
  p_cheap_max_value     bigint DEFAULT NULL,
  p_contract_max_months int    DEFAULT NULL,
  p_positions           text[] DEFAULT NULL,
  p_limit               int    DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN (
WITH scored AS (
    SELECT pms.player_id, pms.rating, f.date::date AS d
    FROM player_match_stats pms
    JOIN fixtures f ON f.id = pms.fixture_id
    WHERE pms.rating IS NOT NULL
      -- Solo los partidos que puede usar alguna de las dos ventanas: antes se leían TODAS
      -- las estadísticas de la historia (232k filas, ~10 s por llamada en el Inicio) para
      -- después descartar las viejas en window_agg/fb_ranked. Mismo resultado.
      AND f.date >= (now() - make_interval(months => GREATEST(p_window_months, p_fallback_months)))::date
  ),
  window_agg AS (
    SELECT player_id, count(*) AS n, avg(rating) AS avg_rating,
           jsonb_agg(rating ORDER BY d) AS scores
    FROM scored
    WHERE d >= (now() - make_interval(months => p_window_months))::date
    GROUP BY player_id
  ),
  fb_ranked AS (
    SELECT player_id, rating, d,
           row_number() OVER (PARTITION BY player_id ORDER BY d DESC) AS rn
    FROM scored
    WHERE d >= (now() - make_interval(months => p_fallback_months))::date
  ),
  fb_agg AS (
    SELECT player_id, count(*) AS n, avg(rating) AS avg_rating,
           jsonb_agg(rating ORDER BY d) AS scores
    FROM fb_ranked
    WHERE rn <= p_fallback_limit
    GROUP BY player_id
  ),
  chosen AS (
    SELECT
      COALESCE(w.player_id, fb.player_id) AS player_id,
      CASE WHEN COALESCE(w.n,0) >= p_min_matches THEN w.n         ELSE fb.n END          AS n,
      CASE WHEN COALESCE(w.n,0) >= p_min_matches THEN w.avg_rating ELSE fb.avg_rating END AS avg_rating,
      CASE WHEN COALESCE(w.n,0) >= p_min_matches THEN w.scores    ELSE fb.scores END     AS scores,
      CASE WHEN COALESCE(w.n,0) >= p_min_matches THEN 'window'    ELSE 'fallback' END    AS window_used
    FROM window_agg w
    FULL OUTER JOIN fb_agg fb ON fb.player_id = w.player_id
  ),
  qualified AS (
    SELECT
      c.player_id, c.n, c.avg_rating, c.scores, c.window_used,
      pl.name, pl.photo, pl.birth_date, pl.primary_position,
      pl.market_value_eur, pl.contract_end_date, pl.current_team_id,
      tm.id AS team_id, tm.name AS team_name, tm.logo AS team_logo, tm.league_id AS team_league_id,
      lg.name AS league_name,
      pss.avg_rating AS primary_score
    FROM chosen c
    JOIN players pl ON pl.id = c.player_id
    LEFT JOIN teams tm ON tm.id = pl.current_team_id
    LEFT JOIN leagues lg ON lg.id = tm.league_id
    LEFT JOIN LATERAL (
      SELECT s.avg_rating
      FROM player_season_scores s
      WHERE s.player_id = c.player_id AND s.position = pl.primary_position
      ORDER BY s.season DESC, s.matches_played DESC
      LIMIT 1
    ) pss ON true
    WHERE c.n >= p_min_matches
      AND pl.id = COALESCE(pl.canonical_id, pl.id)  -- solo la fila oficial (20260923_d)
      AND (p_positions IS NULL OR pl.primary_position = ANY(p_positions))
      AND (
        (p_cheap_max_value IS NOT NULL AND pl.market_value_eur IS NOT NULL
           AND pl.market_value_eur <= p_cheap_max_value)
        OR
        (p_contract_max_months IS NOT NULL AND pl.contract_end_date IS NOT NULL
           AND pl.contract_end_date >= now()::date
           AND pl.contract_end_date <= (now() + make_interval(months => p_contract_max_months))::date)
      )
  )
  SELECT COALESCE(jsonb_agg(obj ORDER BY avg_rating DESC), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'id', player_id, 'name', name, 'photo', photo, 'birth_date', birth_date,
      'primary_position', primary_position, 'market_value_eur', market_value_eur,
      'contract_end_date', contract_end_date, 'primary_score', primary_score,
      'recent_avg', round(avg_rating::numeric, 2), 'recent_matches', n,
      'recent_scores', scores, 'window_used', window_used,
      'on_the_rise', (primary_score IS NOT NULL AND avg_rating > primary_score),
      'league_name', league_name,
      'team', CASE WHEN team_id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', team_id, 'name', team_name, 'logo', team_logo, 'league_id', team_league_id
      ) END
    ) AS obj, avg_rating
    FROM qualified
    ORDER BY avg_rating DESC
    LIMIT GREATEST(p_limit, 0)
  ) s
  );
END;
$$;
