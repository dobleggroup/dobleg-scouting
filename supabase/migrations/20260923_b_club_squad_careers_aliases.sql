-- API-Football reasigna a veces a un jugador a otro id (Ávalos: 356282 hasta marzo, 647644 desde abril).
-- Los ids alias se suman al canónico para no perder partidos.
ALTER TABLE public.club_squad_careers ADD COLUMN IF NOT EXISTS api_player_alias_ids INT[] NOT NULL DEFAULT '{}';

-- Jugadores que jugaron en el ciclo del DT pero ya no están en el plantel (Esparza, Nardelli, Molina, Flores).
ALTER TABLE public.club_squad_careers DROP CONSTRAINT IF EXISTS club_squad_careers_squad_check;
ALTER TABLE public.club_squad_careers ADD CONSTRAINT club_squad_careers_squad_check
  CHECK (squad = ANY (ARRAY['primera', 'reserva', 'baja']));
