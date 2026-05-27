-- Add Transfermarkt-sourced columns to players table
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS market_value_eur INTEGER,
  ADD COLUMN IF NOT EXISTS contract_end_date DATE,
  ADD COLUMN IF NOT EXISTS agent TEXT,
  ADD COLUMN IF NOT EXISTS transfermarkt_url TEXT,
  ADD COLUMN IF NOT EXISTS transfermarkt_id INTEGER;

-- Index for filtering by market value and contract end
CREATE INDEX IF NOT EXISTS idx_players_market_value ON players (market_value_eur) WHERE market_value_eur IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_players_contract_end ON players (contract_end_date) WHERE contract_end_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_players_agent ON players (agent) WHERE agent IS NOT NULL;
