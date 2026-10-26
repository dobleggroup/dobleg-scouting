-- Mercado: "eliminar" una búsqueda de club la oculta, no la borra. Queda guardada
-- (quién la ocultó y cuándo) para poder consultarla y para los tableros futuros.
-- Mismo criterio que market_negotiations (20261023_m).
ALTER TABLE public.market_club_needs
  ADD COLUMN IF NOT EXISTS hidden_at timestamptz,
  ADD COLUMN IF NOT EXISTS hidden_by_name text;
