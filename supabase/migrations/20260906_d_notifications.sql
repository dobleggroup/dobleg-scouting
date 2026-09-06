-- Notificaciones persistentes por usuario (la "campanita"). Arranca con un
-- solo caso de uso real: avisarle a alguien que le asignaron un jugador en
-- Seguimiento GG, pero la tabla es generica (type/message/link) para poder
-- sumar mas casos despues sin tocar el esquema.

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id TEXT NOT NULL DEFAULT public.current_club_id(),
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, read);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_own_notifications" ON public.notifications;
CREATE POLICY "read_own_notifications" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "update_own_notifications" ON public.notifications;
CREATE POLICY "update_own_notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Cualquier miembro del club puede crear una notificacion para OTRO miembro
-- del mismo club (ej: "te asignaron X") -- no para gente de otro club.
DROP POLICY IF EXISTS "insert_notifications_same_club" ON public.notifications;
CREATE POLICY "insert_notifications_same_club" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (club_id = public.current_club_id());

-- Bruno Ocaña faltaba en el roster de market_team_members (de ahi sale el
-- dropdown de "Asignado a" en Seguimiento GG) -- se agrega sin cuenta
-- vinculada por ahora (user_id null, como "Franco"); si tiene login, avisar
-- para vincularlo y que le lleguen notificaciones reales.
INSERT INTO public.market_team_members (name, active, user_id, club_id)
SELECT 'Bruno Ocaña', true, null, 'dobleg'
WHERE NOT EXISTS (SELECT 1 FROM public.market_team_members WHERE name = 'Bruno Ocaña');
