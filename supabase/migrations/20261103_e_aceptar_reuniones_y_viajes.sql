-- Reuniones y viajes se aceptan (2026-11-03, pedido de Marcos): lo que carga un scout queda
-- pendiente hasta que Marcos o Matías Roberti lo aceptan. Solo lo aceptado suma en la página
-- Scouts. Lo que cargan ellos dos queda aceptado directamente.

ALTER TABLE public.scout_activities ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'pendiente';
ALTER TABLE public.scout_activities DROP CONSTRAINT IF EXISTS scout_activities_review_status_check;
ALTER TABLE public.scout_activities ADD CONSTRAINT scout_activities_review_status_check
  CHECK (review_status IN ('pendiente', 'aceptada', 'rechazada'));
ALTER TABLE public.scout_activities ADD COLUMN IF NOT EXISTS reviewed_by uuid;
ALTER TABLE public.scout_activities ADD COLUMN IF NOT EXISTS reviewed_by_name text;
ALTER TABLE public.scout_activities ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- Quién acepta: Marcos y Matías Roberti.
CREATE TABLE IF NOT EXISTS public.scout_activity_approvers (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.scout_activity_approvers ENABLE ROW LEVEL SECURITY;
INSERT INTO public.scout_activity_approvers (user_id) VALUES
  ('ea9bc174-bb0d-450c-b480-722fe7cfeadb'),  -- Marcos Cuccioletta
  ('0ec04cba-b671-4d19-8b58-5e9360248e04')   -- Matías Roberti
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_approve_scout_activities()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  select exists (select 1 from public.scout_activity_approvers where user_id = auth.uid())
$$;
GRANT EXECUTE ON FUNCTION public.can_approve_scout_activities() TO authenticated;

-- Al cargar: si lo carga Marcos o Matías queda aceptado; si no, pendiente (aunque mande otra cosa).
CREATE OR REPLACE FUNCTION public.scout_activities_set_review()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
begin
  if public.can_approve_scout_activities() then
    new.review_status := 'aceptada';
    new.reviewed_by := auth.uid();
    new.reviewed_by_name := new.created_by_name;
    new.reviewed_at := now();
  else
    new.review_status := 'pendiente';
    new.reviewed_by := null;
    new.reviewed_by_name := null;
    new.reviewed_at := null;
  end if;
  return new;
end
$$;
DROP TRIGGER IF EXISTS scout_activities_set_review ON public.scout_activities;
CREATE TRIGGER scout_activities_set_review BEFORE INSERT ON public.scout_activities
  FOR EACH ROW EXECUTE FUNCTION public.scout_activities_set_review();

-- Aceptar o rechazar (solo Marcos y Matías).
CREATE OR REPLACE FUNCTION public.review_scout_activity(p_id bigint, p_status text, p_reviewer_name text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
begin
  if not public.can_approve_scout_activities() then
    raise exception 'sin permiso' using errcode = '42501';
  end if;
  if p_status not in ('aceptada', 'rechazada') then
    raise exception 'estado invalido';
  end if;
  update public.scout_activities
     set review_status = p_status, reviewed_by = auth.uid(), reviewed_by_name = p_reviewer_name, reviewed_at = now()
   where id = p_id;
end
$$;
GRANT EXECUTE ON FUNCTION public.review_scout_activity(bigint, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.scouts_panel(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
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
  -- Comentarios sobre jugadores: los de la ficha / Seguimiento + las notas en negociaciones.
  convs as (
    select c.author_id as user_id, c.player_name as about, c.created_at, 'comentario'::text as kind
    from player_comments c
    union all
    select n.author_id, neg.player_name, n.created_at, 'negociacion'
    from market_negotiation_notes n
    join market_negotiations neg on neg.id = n.negotiation_id
    where not coalesce(n.is_system, false) and neg.player_name is not null
  ),
  -- Búsquedas de clubes que cargó en Mercado: una por club, con las posiciones que busca.
  searches as (
    select nd.created_by_id as user_id, public.scouts_norm(nd.team_name) as k,
           min(nd.team_name) as club,
           min((nd.created_at at time zone 'America/Argentina/Buenos_Aires')::date) as day,
           array_agg(distinct nd.position_label) filter (where nd.position_label is not null) as positions,
           (select count(*) from market_negotiation_notes n
             where n.need_id = any(array_agg(nd.id)) and n.author_id = nd.created_by_id
               and not coalesce(n.is_system, false)) as notes
    from market_club_needs nd
    where nd.created_by_id in (select user_id from s) and nd.team_name is not null
    group by nd.created_by_id, public.scouts_norm(nd.team_name)
  ),
  -- Partidos: uno por fecha y partido (varios reportes del mismo partido cuentan una vez).
  matches as (
    select distinct on (e.scout_id, e.match_date, public.scouts_norm(e.team), public.scouts_norm(e.rival))
           e.scout_id as user_id, e.match_date as day, e.watch_mode as mode,
           nullif(concat_ws(' vs ', nullif(trim(e.team), ''), nullif(trim(e.rival), '')), '') as label,
           e.competition, nullif(trim(e.place), '') as place,
           (select string_agg(distinct e2.player_name, ', ') from scout_evaluations e2
             where e2.scout_id = e.scout_id and e2.match_date = e.match_date
               and public.scouts_norm(e2.team) = public.scouts_norm(e.team)
               and public.scouts_norm(e2.rival) = public.scouts_norm(e.rival)) as players
    from scout_evaluations e
    where e.match_date is not null and e.scout_id in (select user_id from s)
    order by e.scout_id, e.match_date, public.scouts_norm(e.team), public.scouts_norm(e.rival),
             (e.watch_mode = 'presencial') desc, e.created_at
  ),
  -- Viajes: los cargados + los lugares de partidos y reuniones presenciales.
  trips as (
    select a.scout_id as user_id, a.activity_date as day, a.end_date as end_day,
           coalesce(nullif(trim(a.place), ''), a.title) as place, a.notes as detail, 'viaje'::text as source, a.id
    from scout_activities a where a.kind = 'viaje' and a.review_status = 'aceptada'
    union all
    select q.user_id, q.day, null, q.place, q.detail, q.source, null
    from (
      select distinct on (x.user_id, x.day, public.scouts_norm(x.place)) x.*
      from (
        select m.user_id, m.day, m.place, 'Fue a ver ' || coalesce(m.label, 'un partido') as detail, 'partido' as source
        from matches m where m.mode = 'presencial' and m.place is not null
        union all
        select a.scout_id, a.activity_date, trim(a.place), U&'Reuni\00F3n con ' || coalesce(a.title, ''), 'reunion'
        from scout_activities a
        where a.kind = 'reunion' and a.review_status = 'aceptada' and a.mode = 'presencial' and nullif(trim(a.place), '') is not null
      ) x
      order by x.user_id, x.day, public.scouts_norm(x.place), x.source
    ) q
    where not exists (select 1 from scout_activities v
                      where v.scout_id = q.user_id and v.kind = 'viaje' and v.review_status = 'aceptada'
                        and q.day between v.activity_date and coalesce(v.end_date, v.activity_date))
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
                        from days d where d.user_id = s.user_id and d.day > v_today - 30),
      'tracking_now', (select count(*) from scout_players p where p.assigned_to = s.user_id),
      'added', (select count(*) from scout_players p
                 where (p.added_by_scouts = s.user_id::text or p.added_by_datos = s.user_id::text)
                   and (p.created_at at time zone 'America/Argentina/Buenos_Aires')::date between v_from and v_to),
      'reports', (select count(*) from scout_evaluations e where e.scout_id = s.user_id
                   and (e.created_at at time zone 'America/Argentina/Buenos_Aires')::date between v_from and v_to),
      'matches', (select count(*) from matches m where m.user_id = s.user_id and m.mode = 'presencial'
                   and m.day between v_from and v_to),
      'matches_tv', (select count(*) from matches m where m.user_id = s.user_id and m.mode = 'tv'
                      and m.day between v_from and v_to),
      'meetings', (select count(*) from scout_activities a where a.scout_id = s.user_id and a.kind = 'reunion'
                     and a.review_status = 'aceptada' and a.activity_date between v_from and v_to)
                + (select count(*) from market_negotiation_notes n where n.author_id = s.user_id and n.is_meeting
                     and (n.created_at at time zone 'America/Argentina/Buenos_Aires')::date between v_from and v_to),
      'trips', (select count(*) from trips t where t.user_id = s.user_id and t.day between v_from and v_to),
      'negotiations', (select count(*) from market_negotiations n
                         where n.assigned_to_id = any(coalesce(s.member_ids, '{}'))
                           and (n.created_at at time zone 'America/Argentina/Buenos_Aires')::date between v_from and v_to),
      'comments', (select count(*) from convs c where c.user_id = s.user_id
                     and (c.created_at at time zone 'America/Argentina/Buenos_Aires')::date between v_from and v_to),
      'comments_by_player', (
        select coalesce(jsonb_agg(jsonb_build_object('player', about, 'comments', nc, 'negotiation_notes', nn, 'last', last)
                 order by nc + nn desc, last desc), '[]'::jsonb)
        from (select c.about,
                     count(*) filter (where c.kind = 'comentario') nc,
                     count(*) filter (where c.kind = 'negociacion') nn,
                     max(c.created_at) last
              from convs c
              where c.user_id = s.user_id and c.about is not null
                and (c.created_at at time zone 'America/Argentina/Buenos_Aires')::date between v_from and v_to
              group by c.about) q),
      'searches', (select count(*) from searches x where x.user_id = s.user_id and x.day between v_from and v_to),
      'search_list', (
        select coalesce(jsonb_agg(jsonb_build_object('club', x.club, 'day', x.day, 'positions', coalesce(to_jsonb(x.positions), '[]'::jsonb),
                 'notes', x.notes) order by x.day desc, x.club), '[]'::jsonb)
        from searches x where x.user_id = s.user_id and x.day between v_from and v_to),
      'match_list', (
        select coalesce(jsonb_agg(jsonb_build_object('day', m.day, 'label', m.label, 'competition', m.competition,
                 'mode', m.mode, 'place', m.place, 'players', m.players) order by m.day desc), '[]'::jsonb)
        from matches m where m.user_id = s.user_id and m.day between v_from and v_to),
      'trip_list', (
        select coalesce(jsonb_agg(jsonb_build_object('day', t.day, 'end_day', t.end_day, 'place', t.place,
                 'detail', t.detail, 'source', t.source, 'id', t.id) order by t.day desc), '[]'::jsonb)
        from trips t where t.user_id = s.user_id and t.day between v_from and v_to),
      'report_list', (
        select coalesce(jsonb_agg(jsonb_build_object('player', e.player_name, 'day', e.match_date,
                 'score', e.technical_score, 'team', e.team) order by e.created_at desc), '[]'::jsonb)
        from scout_evaluations e where e.scout_id = s.user_id
          and (e.created_at at time zone 'America/Argentina/Buenos_Aires')::date between v_from and v_to),
      'activities', (
        select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'day', a.activity_date,
                 'end_day', a.end_date, 'title', a.title, 'place', a.place, 'mode', a.mode,
                 'player', a.player_name, 'notes', a.notes, 'created_by_name', a.created_by_name,
                 'created_at', a.created_at, 'review_status', a.review_status,
                 'tracked', (select coalesce(jsonb_agg(distinct trim(n)), '[]'::jsonb)
                               from unnest(string_to_array(coalesce(a.player_name, ''), ',')) n
                               where trim(n) <> '' and exists (
                                 select 1 from scout_players sp
                                 where public.scouts_norm(sp.full_name) = public.scouts_norm(n)))
                 ) order by a.activity_date desc, a.id desc), '[]'::jsonb)
        from scout_activities a where a.scout_id = s.user_id and a.review_status <> 'rechazada'
          and (a.activity_date between v_from and v_to or a.review_status = 'pendiente'))
    ) as row
    from s
  ) t;

  return v_out;
end
$$;
GRANT EXECUTE ON FUNCTION public.scouts_panel(date, date) TO authenticated;
