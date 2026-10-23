-- Búsquedas de club con un club escrito a mano (2026-10-22).
--
-- El selector de club de Mercado sale de `teams` (los clubes que sincronizamos).
-- Si el club no está, ahora se puede escribir tal cual: queda team_name sin
-- team_id ni escudo. Las negociaciones ya lo permitían (team_id nullable desde
-- 20260826_market_negotiations_free_agent); faltaba en las búsquedas.

ALTER TABLE public.market_club_needs ALTER COLUMN team_id DROP NOT NULL;
