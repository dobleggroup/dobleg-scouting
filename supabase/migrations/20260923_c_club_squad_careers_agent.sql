-- Agente (agencia de representación) del jugador según Transfermarkt, para la pestaña Plantel.
ALTER TABLE public.club_squad_careers ADD COLUMN IF NOT EXISTS agent TEXT;
ALTER TABLE public.club_squad_careers ADD COLUMN IF NOT EXISTS agent_tm_id INT;
