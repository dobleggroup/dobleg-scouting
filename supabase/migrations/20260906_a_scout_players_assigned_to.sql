-- "Asignado a": ademas de quien AGREGO un jugador a Seguimiento GG (added_by_scouts),
-- se necesita poder asignarlo a un scout de Doble G puntual para que las negociaciones
-- no se pisen entre si. Mismo patron id+nombre que el resto de la tabla (added_by_scouts /
-- added_by_scouts_name), para no depender de un JOIN contra auth.users en cada lectura.

ALTER TABLE public.scout_players ADD COLUMN IF NOT EXISTS assigned_to UUID;
ALTER TABLE public.scout_players ADD COLUMN IF NOT EXISTS assigned_to_name TEXT;
