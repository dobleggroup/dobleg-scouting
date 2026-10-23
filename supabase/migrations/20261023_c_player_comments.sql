-- Comentarios de jugadores, compartidos por todo el staff del club: quién lo
-- escribió, cuándo, y desde dónde (ficha o listas de seguimiento). Es historial:
-- no se editan, solo se agregan (y cada autor puede borrar los suyos). Sirve
-- para dar contexto y, más adelante, para los tableros de seguimiento/mercado.
-- Antes la ficha los guardaba en el navegador de cada uno (nadie más los veía).

-- Había una tabla player_comments vieja, sin club ni vínculo al jugador, que
-- nunca se usó (0 filas): se reemplaza solo si sigue vacía.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'player_comments' AND column_name = 'created_by')
     AND NOT EXISTS (SELECT 1 FROM public.player_comments) THEN
    DROP TABLE public.player_comments;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.player_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id text NOT NULL DEFAULT current_club_id(),
  -- Cómo se reconoce al jugador: id de la base (API-Football/Sofascore), fila de
  -- seguimiento, y nombre normalizado (player_name_key) para los que no tienen
  -- ninguno de los dos.
  supabase_player_id integer,
  scout_player_id uuid REFERENCES public.scout_players(id) ON DELETE SET NULL,
  player_key text NOT NULL,
  player_name text NOT NULL,
  body text NOT NULL CHECK (length(trim(body)) > 0),
  sentiment text CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  source text NOT NULL DEFAULT 'ficha' CHECK (source IN ('ficha', 'seguimiento_gg', 'seguimiento_datos')),
  author_id uuid DEFAULT auth.uid(),
  author_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS player_comments_supabase_idx ON public.player_comments (club_id, supabase_player_id);
CREATE INDEX IF NOT EXISTS player_comments_scout_idx ON public.player_comments (club_id, scout_player_id);
CREATE INDEX IF NOT EXISTS player_comments_key_idx ON public.player_comments (club_id, player_key);

ALTER TABLE public.player_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS read_player_comments ON public.player_comments;
CREATE POLICY read_player_comments ON public.player_comments
  FOR SELECT TO authenticated USING (club_id = current_club_id());

DROP POLICY IF EXISTS insert_player_comments ON public.player_comments;
CREATE POLICY insert_player_comments ON public.player_comments
  FOR INSERT TO authenticated WITH CHECK (club_id = current_club_id() AND author_id = auth.uid());

DROP POLICY IF EXISTS delete_own_player_comments ON public.player_comments;
CREATE POLICY delete_own_player_comments ON public.player_comments
  FOR DELETE TO authenticated USING (club_id = current_club_id() AND author_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.player_comments TO authenticated;

-- El comentario suelto que ya tenían las filas de seguimiento pasa a ser el
-- primer comentario del historial (se copia, la columna vieja no se toca).
INSERT INTO public.player_comments
  (club_id, supabase_player_id, scout_player_id, player_key, player_name, body, source, author_id, author_name, created_at)
SELECT sp.club_id, sp.supabase_player_id, sp.id,
       public.player_name_key(sp.full_name), sp.full_name, trim(sp.comentario),
       CASE WHEN sp.in_scouts_gg_list THEN 'seguimiento_gg' ELSE 'seguimiento_datos' END,
       (SELECT u FROM (VALUES (sp.added_by_scouts), (sp.added_by_datos)) v(u)
         WHERE u ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' LIMIT 1)::uuid,
       COALESCE(sp.added_by_scouts_name, sp.added_by_datos_name, 'Sistema'),
       sp.created_at
FROM public.scout_players sp
WHERE sp.comentario IS NOT NULL AND length(trim(sp.comentario)) > 0
  AND NOT EXISTS (SELECT 1 FROM public.player_comments pc WHERE pc.scout_player_id = sp.id);
