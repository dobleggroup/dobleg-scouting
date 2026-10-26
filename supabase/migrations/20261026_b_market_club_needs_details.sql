-- Mercado: cada posición de una búsqueda puede tener un detalle corto escrito
-- a mano ("móvil, de área", "zurdo", "con experiencia en Libertadores").
ALTER TABLE public.market_club_needs
  ADD COLUMN IF NOT EXISTS details text;
