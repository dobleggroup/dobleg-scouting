-- Mercado: notas/recordatorios en el calendario y agenda de contactos de clubes.
-- Las dos tablas van por club (current_club_id()), igual que el resto de Mercado.

-- ── Notas del calendario ────────────────────────────────────────────────────
-- Se tocan desde un día del calendario. Avisan a quien está asignado o, si no
-- se asignó a nadie, a quien la escribió (recordatorio propio): al crearla y
-- desde el día anterior a la fecha hasta que se marque como hecha.
CREATE TABLE IF NOT EXISTS public.market_calendar_notes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  club_id text NOT NULL DEFAULT current_club_id(),
  note_date date NOT NULL,
  body text NOT NULL CHECK (length(trim(body)) > 0),
  assigned_to_id bigint REFERENCES public.market_team_members(id) ON DELETE SET NULL,
  assigned_to_name text,
  assigned_user_id uuid,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_by_name text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS market_calendar_notes_club_date_idx ON public.market_calendar_notes (club_id, note_date);

ALTER TABLE public.market_calendar_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS read_market_calendar_notes ON public.market_calendar_notes;
CREATE POLICY read_market_calendar_notes ON public.market_calendar_notes
  FOR SELECT TO authenticated USING (club_id = current_club_id());
DROP POLICY IF EXISTS write_market_calendar_notes ON public.market_calendar_notes;
CREATE POLICY write_market_calendar_notes ON public.market_calendar_notes
  FOR ALL TO authenticated USING (club_id = current_club_id()) WITH CHECK (club_id = current_club_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.market_calendar_notes TO authenticated;

-- ── Contactos (directores deportivos, mánagers, presidentes...) ─────────────
-- Para saber con quién hablar cuando hay que llegar a un club.
CREATE TABLE IF NOT EXISTS public.market_contacts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  club_id text NOT NULL DEFAULT current_club_id(),
  full_name text NOT NULL CHECK (length(trim(full_name)) > 0),
  role text NOT NULL DEFAULT 'director_deportivo'
    CHECK (role IN ('director_deportivo', 'manager', 'presidente', 'secretario_tecnico', 'entrenador', 'scout', 'agente', 'otro')),
  team_id integer REFERENCES public.teams(id) ON DELETE SET NULL,
  team_name text,
  country text,
  phone text,
  email text,
  notes text,
  last_contact_date date,
  created_by uuid DEFAULT auth.uid(),
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS market_contacts_club_idx ON public.market_contacts (club_id, team_name);

ALTER TABLE public.market_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS read_market_contacts ON public.market_contacts;
CREATE POLICY read_market_contacts ON public.market_contacts
  FOR SELECT TO authenticated USING (club_id = current_club_id());
DROP POLICY IF EXISTS write_market_contacts ON public.market_contacts;
CREATE POLICY write_market_contacts ON public.market_contacts
  FOR ALL TO authenticated USING (club_id = current_club_id()) WITH CHECK (club_id = current_club_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.market_contacts TO authenticated;
