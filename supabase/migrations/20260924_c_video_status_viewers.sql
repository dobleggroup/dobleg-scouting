-- Quién ve el estado de los videos en Scouting Interno (2026-09-24).
--
-- El puntito "Video actualizado / necesita atención / desactualizado" es de uso interno:
-- solo lo ven Marcos y Matías Roberti. El resto de las cuentas no ve la columna, las
-- referencias ni el filtro.

CREATE TABLE IF NOT EXISTS public.video_status_viewers (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.video_status_viewers ENABLE ROW LEVEL SECURITY;

INSERT INTO public.video_status_viewers (user_id) VALUES
  ('ea9bc174-bb0d-450c-b480-722fe7cfeadb'),  -- Marcos Cuccioletta
  ('0ec04cba-b671-4d19-8b58-5e9360248e04')   -- Matías Roberti
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_see_video_status()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  select exists (select 1 from public.video_status_viewers where user_id = auth.uid())
$$;

GRANT EXECUTE ON FUNCTION public.can_see_video_status() TO authenticated;
