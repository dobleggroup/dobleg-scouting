-- "Cargar actividad" (2026-11-03, pedido de Marcos): reporte, reunión y viaje.
--
-- • Reporte: cómo vio el partido (presencial o TV, obligatorio) y, si fue presencial, el
--   lugar (obligatorio). Los partidos de la página Scouts salen de acá.
-- • Reunión: presencial u online; si fue presencial, la ciudad.
-- • Viaje: a dónde, desde y hasta.
-- • Viajes que se suman solos: cada lugar distinto de un partido presencial o de una
--   reunión presencial (uno por día y lugar), salvo que ese día ya esté dentro de un viaje
--   cargado a mano.
-- • Los jugadores escritos en una reunión (separados por coma) se cruzan con las listas de
--   Seguimiento: 'tracked' trae los que ya están en seguimiento.

-- Scouts: se suman Gastón Fernández y Gerardo Pereyra. Matías Roberti sigue viendo la página
-- pero, por ahora, no aparece como scout.
INSERT INTO public.scouts_panel_scouts (user_id, display_name, photo_url, sort_order) VALUES
  ('1c271ff1-4de0-433c-9d2f-1fc0d58627b3', U&'Gast\00F3n Fern\00E1ndez', NULL, 6),
  ('8261285f-f7f6-4820-8d98-5ef222e7aa1d', 'Gerardo Pereyra', NULL, 7)
ON CONFLICT (user_id) DO UPDATE SET display_name = excluded.display_name, active = true;
UPDATE public.scouts_panel_scouts SET active = false
WHERE user_id = '0ec04cba-b671-4d19-8b58-5e9360248e04';

ALTER TABLE public.scout_evaluations ADD COLUMN IF NOT EXISTS watch_mode text;
ALTER TABLE public.scout_evaluations ADD COLUMN IF NOT EXISTS place text;
ALTER TABLE public.scout_evaluations DROP CONSTRAINT IF EXISTS scout_evaluations_watch_mode_check;
ALTER TABLE public.scout_evaluations ADD CONSTRAINT scout_evaluations_watch_mode_check
  CHECK (watch_mode IS NULL OR watch_mode IN ('presencial', 'tv'));

ALTER TABLE public.scout_activities ADD COLUMN IF NOT EXISTS place text;
ALTER TABLE public.scout_activities ADD COLUMN IF NOT EXISTS mode text;
ALTER TABLE public.scout_activities DROP CONSTRAINT IF EXISTS scout_activities_mode_check;
ALTER TABLE public.scout_activities ADD CONSTRAINT scout_activities_mode_check
  CHECK (mode IS NULL OR mode IN ('presencial', 'online'));

-- Texto sin mayúsculas, tildes ni espacios de más, para comparar nombres y lugares.
CREATE OR REPLACE FUNCTION public.scouts_norm(t text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  select regexp_replace(trim(translate(lower(coalesce(t, '')),
    U&'\00E1\00E9\00ED\00F3\00FA\00FC\00F1\00E0\00E8\00EC\00F2\00F9', 'aeiouunaeiou')), '\s+', ' ', 'g')
$$;

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
  -- Conversaciones: comentarios de jugadores + notas en negociaciones / búsquedas.
  convs as (
    select c.author_id as user_id, c.player_name as about, c.created_at
    from player_comments c
    union all
    select n.author_id,
           coalesce(neg.player_name, U&'B\00FAsqueda: ' || coalesce(need.team_name, 'club')),
           n.created_at
    from market_negotiation_notes n
    left join market_negotiations neg on neg.id = n.negotiation_id
    left join market_club_needs need on need.id = n.need_id
    where not coalesce(n.is_system, false)
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
    from scout_activities a where a.kind = 'viaje'
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
        where a.kind = 'reunion' and a.mode = 'presencial' and nullif(trim(a.place), '') is not null
      ) x
      order by x.user_id, x.day, public.scouts_norm(x.place), x.source
    ) q
    where not exists (select 1 from scout_activities v
                      where v.scout_id = q.user_id and v.kind = 'viaje'
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
                     and a.activity_date between v_from and v_to)
                + (select count(*) from market_negotiation_notes n where n.author_id = s.user_id and n.is_meeting
                     and (n.created_at at time zone 'America/Argentina/Buenos_Aires')::date between v_from and v_to),
      'trips', (select count(*) from trips t where t.user_id = s.user_id and t.day between v_from and v_to),
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
                 'tracked', (select coalesce(jsonb_agg(distinct trim(n)), '[]'::jsonb)
                               from unnest(string_to_array(coalesce(a.player_name, ''), ',')) n
                               where trim(n) <> '' and exists (
                                 select 1 from scout_players sp
                                 where public.scouts_norm(sp.full_name) = public.scouts_norm(n)))
                 ) order by a.activity_date desc, a.id desc), '[]'::jsonb)
        from scout_activities a where a.scout_id = s.user_id and a.activity_date between v_from and v_to)
    ) as row
    from s
  ) t;

  return v_out;
end
$$;
GRANT EXECUTE ON FUNCTION public.scouts_panel(date, date) TO authenticated;
