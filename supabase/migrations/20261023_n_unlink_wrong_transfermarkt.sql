-- Vínculos equivocados con Transfermarkt (2026-10-23).
-- La búsqueda por nombre emparejó jugadores con homónimos (J. Córdoba de
-- Instituto con Jhon Córdoba de Krasnodar) y copió de ahí agente, valor,
-- contrato y fecha de nacimiento. Señal segura de error: el jugador sigue
-- jugando pero Transfermarkt dice que esa persona está retirada o sin club
-- desde ANTES de su último partido.
--
-- 1) Se guarda lo que tenían (tm_unlink_audit) para poder revertir.
-- 2) Se desvinculan y se borran solo los datos que vinieron de ese vínculo.
-- 3) Quedan marcados: profile_recheck (volver a leer fecha de nacimiento y
--    nacionalidad de su propia fuente) y tm_rematch_pending (volver a buscarlos
--    en Transfermarkt, ahora exigiendo que coincida la fecha de nacimiento).

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS profile_recheck boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tm_rematch_pending boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.tm_unlink_audit (
  player_id integer NOT NULL,
  transfermarkt_id integer,
  transfermarkt_url text,
  agent text,
  market_value_eur bigint,
  contract_end_date date,
  birth_date date,
  tm_club_name text,
  tm_club_since date,
  reason text NOT NULL,
  unlinked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tm_unlink_audit ENABLE ROW LEVEL SECURITY;

WITH wrong AS (
  SELECT id FROM players
  WHERE transfermarkt_id IS NOT NULL
    AND tm_club_name IN ('Retired', 'Without Club')
    AND tm_club_since IS NOT NULL
    AND last_match_date > tm_club_since + 30
    AND last_match_date > current_date - 180
),
audit AS (
  INSERT INTO tm_unlink_audit (player_id, transfermarkt_id, transfermarkt_url, agent, market_value_eur, contract_end_date, birth_date, tm_club_name, tm_club_since, reason)
  SELECT p.id, p.transfermarkt_id, p.transfermarkt_url, p.agent, p.market_value_eur, p.contract_end_date, p.birth_date, p.tm_club_name, p.tm_club_since,
         'TM dice ' || p.tm_club_name || ' desde ' || p.tm_club_since || ' pero jugó el ' || p.last_match_date
  FROM players p JOIN wrong w ON w.id = p.id
  RETURNING player_id
)
UPDATE players p SET
  transfermarkt_id = NULL, transfermarkt_url = NULL, agent = NULL, market_value_eur = NULL,
  contract_end_date = NULL, tm_club_id = NULL, tm_club_name = NULL, tm_club_since = NULL,
  tm_refreshed_at = NULL, profile_recheck = true, tm_rematch_pending = true
FROM audit a WHERE p.id = a.player_id;

-- Cola del cron de nacionalidad: primero los que hay que volver a revisar.
DROP FUNCTION IF EXISTS public.players_missing_nationality(integer, timestamptz);
CREATE FUNCTION public.players_missing_nationality(p_limit integer, p_recheck_before timestamptz)
RETURNS TABLE (id bigint, birth_date date, profile_recheck boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id::bigint, p.birth_date, p.profile_recheck
  FROM public.players p
  JOIN LATERAL (
    SELECT max(f.date) AS last_played
    FROM public.player_match_stats s
    JOIN public.fixtures f ON f.id = s.fixture_id
    WHERE s.player_id = p.id
  ) lp ON lp.last_played IS NOT NULL
  WHERE p.id > 0 AND p.id < 20000000
    AND (
      p.profile_recheck
      OR (p.nationality IS NULL AND (p.nationality_checked_at IS NULL OR p.nationality_checked_at < p_recheck_before))
    )
  ORDER BY p.profile_recheck DESC, lp.last_played DESC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.players_missing_nationality(integer, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.players_missing_nationality(integer, timestamptz) TO service_role;

-- Re-búsqueda en Transfermarkt: cada 30 minutos una tanda chica (enrich-player mode=rematch).
SELECT cron.unschedule('tm-rematch-30min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tm-rematch-30min');
SELECT cron.schedule(
  'tm-rematch-30min',
  '15,45 * * * *',
  replace(
    (SELECT command FROM cron.job WHERE jobname = 'refresh-transfermarkt-weekly'),
    '"mode": "refresh"',
    '"mode": "rematch"'
  )
);
