-- 1. Add supabase_player_id column to scout_players
ALTER TABLE scout_players
  ADD COLUMN IF NOT EXISTS supabase_player_id INTEGER REFERENCES players(id);

CREATE INDEX IF NOT EXISTS idx_scout_players_supabase_id
  ON scout_players(supabase_player_id);

-- 2. Remap GG 9-status values → 4 unified statuses in scout_players_status
UPDATE scout_players_status
  SET status = 'en_seguimiento'
  WHERE status IN ('en_seguimiento_gg', 'pre_seleccionado');

UPDATE scout_players_status
  SET status = 'contactado'
  WHERE status = 'reunion_pactada';

UPDATE scout_players_status
  SET status = 'en_negociacion'
  WHERE status = 'oferta_enviada';

UPDATE scout_players_status
  SET status = 'descartado'
  WHERE status IN ('contratado', 'no_disponible');

-- 3. Auto-match existing scout_players to players table by normalized name
UPDATE scout_players sp
  SET supabase_player_id = p.id
  FROM players p
  WHERE sp.supabase_player_id IS NULL
    AND lower(trim(
      regexp_replace(
        normalize(sp.full_name, NFD),
        '[̀-ͯ]', '', 'g'
      )
    )) = lower(trim(
      regexp_replace(
        normalize(p.name, NFD),
        '[̀-ͯ]', '', 'g'
      )
    ));

-- 4. Clear non-descartado players from both lists
WITH descartados AS (
  SELECT DISTINCT player_id
  FROM scout_players_status
  WHERE status = 'descartado'
)
UPDATE scout_players
  SET in_datos_list = CASE
        WHEN id IN (SELECT player_id FROM descartados) THEN in_datos_list
        ELSE false
      END,
      in_scouts_gg_list = CASE
        WHEN id IN (SELECT player_id FROM descartados) THEN in_scouts_gg_list
        ELSE false
      END;
