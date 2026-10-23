-- Mercado: "eliminar" una negociación la oculta, no la borra. Queda guardada
-- (quién la ocultó y cuándo) para poder consultarla y para los tableros futuros.
ALTER TABLE public.market_negotiations
  ADD COLUMN IF NOT EXISTS hidden_at timestamptz,
  ADD COLUMN IF NOT EXISTS hidden_by_name text;
