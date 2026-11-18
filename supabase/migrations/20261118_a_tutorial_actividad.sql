-- Tutorial "cargar actividad": le aparece a todas las cuentas una sola vez, la próxima vez que
-- entran. Cuando tocan "Entendido" se guarda acá y no vuelve a salir en ningún dispositivo.

CREATE TABLE IF NOT EXISTS public.activity_tutorial_done (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  done_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_tutorial_done ENABLE ROW LEVEL SECURITY;
-- Sin políticas: solo se lee y escribe con las dos funciones de abajo.

-- ¿Le falta ver el tutorial a la cuenta que entra?
CREATE OR REPLACE FUNCTION public.activity_tutorial_pending()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  select auth.uid() is not null
     and not exists (select 1 from public.activity_tutorial_done where user_id = auth.uid());
$$;

-- Lo terminó: no vuelve a aparecer.
CREATE OR REPLACE FUNCTION public.activity_tutorial_finish()
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  insert into public.activity_tutorial_done (user_id) values (auth.uid())
  on conflict (user_id) do nothing;
$$;

REVOKE ALL ON FUNCTION public.activity_tutorial_pending() FROM public, anon;
REVOKE ALL ON FUNCTION public.activity_tutorial_finish() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.activity_tutorial_pending() TO authenticated;
GRANT EXECUTE ON FUNCTION public.activity_tutorial_finish() TO authenticated;
