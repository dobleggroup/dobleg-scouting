-- "Visto por": quién del staff abrió cada comentario de un jugador. Se marca
-- solo, al abrir los comentarios (ficha o listas de seguimiento); el autor no
-- cuenta. Una fila por persona y comentario: se guarda la primera vez que lo vio.

CREATE TABLE IF NOT EXISTS public.player_comment_views (
  comment_id uuid NOT NULL REFERENCES public.player_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  user_name text NOT NULL,
  club_id text NOT NULL DEFAULT current_club_id(),
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

ALTER TABLE public.player_comment_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS read_player_comment_views ON public.player_comment_views;
CREATE POLICY read_player_comment_views ON public.player_comment_views
  FOR SELECT TO authenticated USING (club_id = current_club_id());

DROP POLICY IF EXISTS insert_own_player_comment_views ON public.player_comment_views;
CREATE POLICY insert_own_player_comment_views ON public.player_comment_views
  FOR INSERT TO authenticated WITH CHECK (club_id = current_club_id() AND user_id = auth.uid());

GRANT SELECT, INSERT ON public.player_comment_views TO authenticated;
