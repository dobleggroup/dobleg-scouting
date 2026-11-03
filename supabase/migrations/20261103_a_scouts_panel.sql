-- Página "Scouts" (2026-11-03): cuánto usa la plataforma cada scout y qué trabajo hizo.
--
-- • scouts_panel_viewers: las únicas cuentas que ven la página (Marcos, Matías Roberti,
--   Gabriel Gómez y las dos cuentas de Guillermo Pereyra). El resto recibe "no encontrado"
--   y la base no le devuelve nada.
-- • scouts_panel_scouts: los scouts que se siguen (foto, nombre, orden).
-- • scout_activities: lo que cargan los scouts desde Reporte (partido, reunión, viaje,
--   jugador captado / en contacto / intermediario).
-- • user_activity_days: un registro por día que la cuenta usó la plataforma (aunque no haya
--   vuelto a iniciar sesión). Para el pasado se suman los días en que la sesión se renovó.
-- • scouts_panel(desde, hasta): todo lo que muestra la página, en una sola consulta.

-- ─── Quién ve la página ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.scouts_panel_viewers (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.scouts_panel_viewers ENABLE ROW LEVEL SECURITY;

INSERT INTO public.scouts_panel_viewers (user_id) VALUES
  ('ea9bc174-bb0d-450c-b480-722fe7cfeadb'),  -- Marcos Cuccioletta
  ('0ec04cba-b671-4d19-8b58-5e9360248e04'),  -- Matías Roberti
  ('5e77848f-5116-4276-8ab4-a908f6b7986b'),  -- Gabriel Gómez
  ('48f7999a-1723-4163-9ba0-7ca33247fb70'),  -- Guillermo Pereyra (guillermopereyradt)
  ('b7b69fc0-42ff-4add-a0c4-0de568bd54b9')   -- Guillermo Pereyra (guillermopereyra.dobleg)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_see_scouts_panel()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  select exists (select 1 from public.scouts_panel_viewers where user_id = auth.uid())
$$;
GRANT EXECUTE ON FUNCTION public.can_see_scouts_panel() TO authenticated;

-- ─── Scouts que se siguen ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.scouts_panel_scouts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  photo_url text,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.scouts_panel_scouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scouts_panel_scouts_read ON public.scouts_panel_scouts;
CREATE POLICY scouts_panel_scouts_read ON public.scouts_panel_scouts
  FOR SELECT TO authenticated USING (public.can_see_scouts_panel());

INSERT INTO public.scouts_panel_scouts (user_id, display_name, photo_url, sort_order) VALUES
  ('12cc1c9c-e2a4-43f1-9866-1980a6279e74', 'Fede Pereyra',     '/scouts/fede-pereyra.png',     1),
  ('b627e418-df5b-4b26-a24a-3ccd7d42d320', 'Bautista Cascini', '/scouts/bautista-cascini.png', 2),
  ('d0e3af4d-895b-46eb-b49a-d881aa80fa45', U&'Mart\00EDn Cort\00E9s', '/scouts/martin-cortes.png', 3),
  ('66d47438-2e15-49a9-bdee-33305e9c7e07', 'Manuel Taborda',   NULL,                           4),
  ('0ec04cba-b671-4d19-8b58-5e9360248e04', U&'Mat\00EDas Roberti', NULL,                        5)
ON CONFLICT (user_id) DO NOTHING;

-- ─── Lo que cargan los scouts ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.scout_activities (
  id bigserial PRIMARY KEY,
  club_id text NOT NULL DEFAULT public.current_club_id(),
  scout_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scout_name text,
  kind text NOT NULL CHECK (kind IN ('partido', 'reunion', 'viaje', 'jugador')),
  activity_date date NOT NULL,
  end_date date,
  title text,                 -- partido / con quién / destino
  competition text,
  player_name text,           -- jugador visto, captado o tema de la reunión
  player_role text CHECK (player_role IS NULL OR player_role IN ('captado', 'contacto', 'intermediario')),
  purpose text CHECK (purpose IS NULL OR purpose IN ('agencia', 'transferencia', 'otro')),
  notes text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scout_activities_scout_date ON public.scout_activities (scout_id, activity_date DESC);
ALTER TABLE public.scout_activities ENABLE ROW LEVEL SECURITY;

-- Cada uno carga lo suyo; las cuentas de la página Scouts pueden cargar por cualquier scout.
DROP POLICY IF EXISTS scout_activities_insert ON public.scout_activities;
CREATE POLICY scout_activities_insert ON public.scout_activities
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND club_id = public.current_club_id()
    AND (scout_id = auth.uid() OR public.can_see_scouts_panel())
  );

DROP POLICY IF EXISTS scout_activities_read ON public.scout_activities;
CREATE POLICY scout_activities_read ON public.scout_activities
  FOR SELECT TO authenticated
  USING (scout_id = auth.uid() OR created_by = auth.uid() OR public.can_see_scouts_panel());

DROP POLICY IF EXISTS scout_activities_delete ON public.scout_activities;
CREATE POLICY scout_activities_delete ON public.scout_activities
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.can_see_scouts_panel());

-- ─── Días de uso ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_activity_days (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  pings int NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, day)
);
ALTER TABLE public.user_activity_days ENABLE ROW LEVEL SECURITY;
-- Sin políticas: solo se escribe con touch_user_activity() y se lee con scouts_panel().

CREATE OR REPLACE FUNCTION public.touch_user_activity()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
begin
  if auth.uid() is null then return; end if;
  insert into public.user_activity_days (user_id, day)
  values (auth.uid(), (now() at time zone 'America/Argentina/Buenos_Aires')::date)
  on conflict (user_id, day) do update
    set last_seen = now(), pings = public.user_activity_days.pings + 1;
end
$$;
GRANT EXECUTE ON FUNCTION public.touch_user_activity() TO authenticated;

-- ─── Todo lo de la página en una consulta ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.scouts_panel(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_from date := coalesce(p_from, date '2000-01-01');
  v_to   date := coalesce(p_to, (now() at time zone 'America/Argentina/Buenos_Aires')::date);
  v_out  jsonb;
begin
  if not public.can_see_scouts_panel() then
    raise exception 'sin permiso' using errcode = '42501';
  end if;

  with s as (
    select sc.user_id, sc.display_name, sc.photo_url, sc.sort_order,
           u.raw_user_meta_data->>'avatar_url' as avatar_url,
           (select array_agg(m.id) from market_team_members m
             where m.user_id = sc.user_id or sc.user_id = any(m.alt_user_ids)) as member_ids
    from scouts_panel_scouts sc
    left join auth.users u on u.id = sc.user_id
    where sc.active
  ),
  -- Días de uso: lo registrado por la app + los días en que la sesión se renovó sola.
  days as (
    select user_id, day, last_seen as seen from user_activity_days
    union all
    select r.user_id::uuid, (r.created_at at time zone 'America/Argentina/Buenos_Aires')::date, r.created_at
    from auth.refresh_tokens r
    where r.user_id ~ '^[0-9a-f-]{36}$' and r.user_id::uuid in (select user_id from s)
    union all
    select x.user_id, ((x.refreshed_at at time zone 'UTC') at time zone 'America/Argentina/Buenos_Aires')::date, x.refreshed_at at time zone 'UTC'
    from auth.sessions x
    where x.refreshed_at is not null and x.user_id in (select user_id from s)
  ),
  -- Conversaciones: comentarios de jugadores + notas en negociaciones / búsquedas.
  convs as (
    select c.author_id as user_id, c.player_name as about, c.created_at
    from player_comments c
    union all
    select n.author_id,
           coalesce(neg.player_name, U&'B\00FAsqueda: ' ||coalesce(need.team_name, 'club')),
           n.created_at
    from market_negotiation_notes n
    left join market_negotiations neg on neg.id = n.negotiation_id
    left join market_club_needs need on need.id = n.need_id
    where not coalesce(n.is_system, false)
  ),
  -- Partidos vistos: los cargados a mano + los de los reportes (un partido por fecha y rival).
  matches as (
    select a.scout_id as user_id, a.activity_date as day, lower(coalesce(a.title, '')) as k,
           a.title as label, a.competition
    from scout_activities a where a.kind = 'partido'
    union all
    select e.scout_id, e.match_date, lower(coalesce(e.team, '') || ' - ' || coalesce(e.rival, '')),
           nullif(concat_ws(' vs ', nullif(e.team, ''), nullif(e.rival, '')), ''), e.competition
    from scout_evaluations e where e.match_date is not null
  )
  select coalesce(jsonb_agg(row order by sort_order), '[]'::jsonb) into v_out
  from (
    select s.sort_order, jsonb_build_object(
      'user_id', s.user_id,
      'name', s.display_name,
      'photo_url', coalesce(s.photo_url, s.avatar_url),
      'last_active', (select max(seen) from days d where d.user_id = s.user_id),
      'active_days', (select coalesce(jsonb_agg(distinct d.day order by d.day), '[]'::jsonb)
                        from days d where d.user_id = s.user_id and d.day between v_from and v_to),
      'recent_days', (select coalesce(jsonb_agg(distinct d.day order by d.day), '[]'::jsonb)
                        from days d where d.user_id = s.user_id
                          and d.day > (now() at time zone 'America/Argentina/Buenos_Aires')::date - 30),
      'tracking_now', (select count(*) from scout_players p where p.assigned_to = s.user_id),
      'added', (select count(*) from scout_players p
                 where (p.added_by_scouts = s.user_id::text or p.added_by_datos = s.user_id::text)
                   and (p.created_at at time zone 'America/Argentina/Buenos_Aires')::date between v_from and v_to),
      'reports', (select count(*) from scout_evaluations e where e.scout_id = s.user_id
                   and (e.created_at at time zone 'America/Argentina/Buenos_Aires')::date between v_from and v_to),
      'matches', (select count(*) from (select distinct m.day, m.k from matches m
                   where m.user_id = s.user_id and m.day between v_from and v_to) q),
      'meetings', (select count(*) from scout_activities a where a.scout_id = s.user_id and a.kind = 'reunion'
                     and a.activity_date between v_from and v_to)
                + (select count(*) from market_negotiation_notes n where n.author_id = s.user_id and n.is_meeting
                     and (n.created_at at time zone 'America/Argentina/Buenos_Aires')::date between v_from and v_to),
      'trips', (select count(*) from scout_activities a where a.scout_id = s.user_id and a.kind = 'viaje'
                  and a.activity_date between v_from and v_to),
      'captured', (select count(*) from scout_activities a where a.scout_id = s.user_id and a.kind = 'jugador'
                     and a.player_role = 'captado' and a.activity_date between v_from and v_to),
      'in_contact', (select count(*) from scout_activities a where a.scout_id = s.user_id and a.kind = 'jugador'
                       and a.player_role = 'contacto' and a.activity_date between v_from and v_to),
      'intermediary', (select count(*) from scout_activities a where a.scout_id = s.user_id and a.kind = 'jugador'
                         and a.player_role = 'intermediario' and a.activity_date between v_from and v_to),
      'negotiations', (select count(*) from market_negotiations n
                         where n.assigned_to_id = any(coalesce(s.member_ids, '{}'))
                           and (n.created_at at time zone 'America/Argentina/Buenos_Aires')::date between v_from and v_to),
      'conversations', (select count(*) from convs c where c.user_id = s.user_id
                          and (c.created_at at time zone 'America/Argentina/Buenos_Aires')::date between v_from and v_to),
      'conversations_by_player', (
        select coalesce(jsonb_agg(jsonb_build_object('about', about, 'count', n, 'last', last) order by n desc, last desc), '[]'::jsonb)
        from (select c.about, count(*) n, max(c.created_at) last from convs c
               where c.user_id = s.user_id and c.about is not null
                 and (c.created_at at time zone 'America/Argentina/Buenos_Aires')::date between v_from and v_to
               group by c.about) q),
      'match_list', (
        select coalesce(jsonb_agg(jsonb_build_object('day', day, 'label', label, 'competition', competition) order by day desc), '[]'::jsonb)
        from (select distinct on (m.day, m.k) m.day, m.label, m.competition from matches m
               where m.user_id = s.user_id and m.day between v_from and v_to
               order by m.day, m.k, m.label nulls last) q),
      'report_list', (
        select coalesce(jsonb_agg(jsonb_build_object('player', e.player_name, 'day', e.match_date,
                 'score', e.technical_score, 'team', e.team) order by e.created_at desc), '[]'::jsonb)
        from scout_evaluations e where e.scout_id = s.user_id
          and (e.created_at at time zone 'America/Argentina/Buenos_Aires')::date between v_from and v_to),
      'activities', (
        select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'day', a.activity_date,
                 'end_day', a.end_date, 'title', a.title, 'competition', a.competition,
                 'player', a.player_name, 'role', a.player_role, 'purpose', a.purpose, 'notes', a.notes,
                 'created_by_name', a.created_by_name) order by a.activity_date desc, a.id desc), '[]'::jsonb)
        from scout_activities a where a.scout_id = s.user_id and a.activity_date between v_from and v_to)
    ) as row
    from s
  ) t;

  return v_out;
end
$$;
GRANT EXECUTE ON FUNCTION public.scouts_panel(date, date) TO authenticated;
