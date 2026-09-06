-- Tomas Valdecantos (jugador de la agencia, id manual 99000026, no sincronizado
-- por ningun pipeline automatico) paso a Universidad de Concepcion (Chile).
UPDATE public.players
SET current_team_id = 2324, updated_at = now()
WHERE id = 99000026;
