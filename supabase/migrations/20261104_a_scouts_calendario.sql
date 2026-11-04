-- Calendario de cada scout en la página Scouts (2026-11-04, pedido de Marcos):
-- día por día, qué hizo y qué cargó. Una fila por cosa:
--   entro       · entró a la plataforma ese día
--   partido     · fue a ver un partido (día del partido; en cancha o por TV)
--   reporte     · cargó un reporte (día en que lo cargó)
--   reunion     · reunión (día de la reunión; status pendiente/aceptada) o nota de reunión en una negociación
--   viaje       · viaje cargado a mano (un renglón por cada día del viaje)
--   busqueda    · cargó una búsqueda de un club en Mercado
--   comentario  · comentario sobre un jugador (status comentario/contacto) o nota en una negociación (status negociacion)
--   agrego      · sumó un jugador a Seguimiento
--   negociacion · negociación nueva a su cargo
-- Solo responde a las cuentas de scouts_panel_viewers. p_scout null = todos los scouts.

CREATE OR REPLACE FUNCTION public.scout_calendar(p_from date, p_to date, p_scout uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_out jsonb;
begin
  if not public.can_see_scouts_panel() then
    raise exception 'sin permiso' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'rango invalido';
  end if;

  with s as (
    select sc.user_id,
           (select array_agg(m.id) from market_team_members m
             where m.user_id = sc.user_id or sc.user_id = any(m.alt_user_ids)) as member_ids
    from scouts_panel_scouts sc
    where sc.active and (p_scout is null or sc.user_id = p_scout)
  ),
  days as (
    select user_id, day from user_activity_days where user_id in (select user_id from s)
    union
    select r.user_id::uuid, (r.created_at at time zone 'America/Argentina/Buenos_Aires')::date
    from auth.refresh_tokens r
    where r.user_id ~ '^[0-9a-f-]{36}$' and r.user_id::uuid in (select user_id from s)
    union
    select x.user_id, ((x.refreshed_at at time zone 'UTC') at time zone 'America/Argentina/Buenos_Aires')::date
    from auth.sessions x
    where x.refreshed_at is not null and x.user_id in (select user_id from s)
  ),
  matches as (
    select distinct on (e.scout_id, e.match_date, public.scouts_norm(e.team), public.scouts_norm(e.rival))
           e.scout_id as user_id, e.match_date as day, e.watch_mode as mode, e.created_at,
           nullif(concat_ws(' vs ', nullif(trim(e.team), ''), nullif(trim(e.rival), '')), '') as label,
           e.competition, nullif(trim(e.place), '') as place,
           (select string_agg(distinct e2.player_name, ', ') from scout_evaluations e2
             where e2.scout_id = e.scout_id and e2.match_date = e.match_date
               and public.scouts_norm(e2.team) = public.scouts_norm(e.team)
               and public.scouts_norm(e2.rival) = public.scouts_norm(e.rival)) as players
    from scout_evaluations e
    where e.match_date between p_from and p_to and e.scout_id in (select user_id from s)
    order by e.scout_id, e.match_date, public.scouts_norm(e.team), public.scouts_norm(e.rival),
             (e.watch_mode = 'presencial') desc, e.created_at
  ),
  ev as (
    -- Entró
    select d.user_id, d.day, 'entro'::text as kind, null::text as title, null::text as detail,
           null::text as status, null::text as place, null::text as players, null::timestamptz as at
    from days d where d.day between p_from and p_to
    union all
    -- Partidos
    select m.user_id, m.day, 'partido', coalesce(m.label, 'Partido'), m.competition, m.mode, m.place, m.players, m.created_at
    from matches m
    union all
    -- Reportes
    select e.scout_id, (e.created_at at time zone 'America/Argentina/Buenos_Aires')::date, 'reporte',
           e.player_name, nullif(trim(e.team), ''), e.technical_score::text, null, null, e.created_at
    from scout_evaluations e
    where e.scout_id in (select user_id from s)
      and (e.created_at at time zone 'America/Argentina/Buenos_Aires')::date between p_from and p_to
    union all
    -- Reuniones cargadas (o salidas de un comentario)
    select a.scout_id, a.activity_date, 'reunion', nullif(trim(a.title), ''), a.notes,
           a.review_status, concat_ws('|', a.mode, nullif(trim(a.place), '')), a.player_name, a.created_at
    from scout_activities a
    where a.kind = 'reunion' and a.review_status <> 'rechazada'
      and a.scout_id in (select user_id from s) and a.activity_date between p_from and p_to
    union all
    -- Notas de reunión en una negociación
    select n.author_id, (n.created_at at time zone 'America/Argentina/Buenos_Aires')::date, 'reunion',
           null, n.body, 'aceptada', null, neg.player_name, n.created_at
    from market_negotiation_notes n
    join market_negotiations neg on neg.id = n.negotiation_id
    where n.is_meeting and n.author_id in (select user_id from s)
      and (n.created_at at time zone 'America/Argentina/Buenos_Aires')::date between p_from and p_to
    union all
    -- Viajes cargados: un renglón por día
    select a.scout_id, g.day::date, 'viaje', coalesce(nullif(trim(a.place), ''), a.title, 'Viaje'), a.notes,
           a.review_status, null, null, a.created_at
    from scout_activities a
    cross join lateral generate_series(
      greatest(a.activity_date, p_from),
      least(coalesce(a.end_date, a.activity_date), a.activity_date + 60, p_to),
      interval '1 day') g(day)
    where a.kind = 'viaje' and a.review_status <> 'rechazada' and a.scout_id in (select user_id from s)
    union all
    -- Búsquedas de clubes (una por club y día, con las posiciones)
    select nd.created_by_id, (nd.created_at at time zone 'America/Argentina/Buenos_Aires')::date, 'busqueda',
           min(nd.team_name),
           string_agg(distinct nd.position_label, ', ') filter (where nd.position_label is not null),
           null, null, null, min(nd.created_at)
    from market_club_needs nd
    where nd.created_by_id in (select user_id from s) and nd.team_name is not null
      and (nd.created_at at time zone 'America/Argentina/Buenos_Aires')::date between p_from and p_to
    group by nd.created_by_id, (nd.created_at at time zone 'America/Argentina/Buenos_Aires')::date, public.scouts_norm(nd.team_name)
    union all
    -- Comentarios sobre jugadores (las reuniones ya salen arriba)
    select c.author_id, (c.created_at at time zone 'America/Argentina/Buenos_Aires')::date, 'comentario',
           c.player_name, left(c.body, 220), c.kind, null, null, c.created_at
    from player_comments c
    where c.kind in ('comentario', 'contacto') and c.author_id in (select user_id from s)
      and (c.created_at at time zone 'America/Argentina/Buenos_Aires')::date between p_from and p_to
    union all
    -- Notas en negociaciones
    select n.author_id, (n.created_at at time zone 'America/Argentina/Buenos_Aires')::date, 'comentario',
           neg.player_name, left(n.body, 220), 'negociacion', null, null, n.created_at
    from market_negotiation_notes n
    join market_negotiations neg on neg.id = n.negotiation_id
    where not coalesce(n.is_system, false) and not coalesce(n.is_meeting, false) and neg.player_name is not null
      and n.author_id in (select user_id from s)
      and (n.created_at at time zone 'America/Argentina/Buenos_Aires')::date between p_from and p_to
    union all
    -- Jugadores que sumó a Seguimiento
    select s2.user_id, (p.created_at at time zone 'America/Argentina/Buenos_Aires')::date, 'agrego',
           p.full_name, nullif(trim(p.club), ''), null, null, null, p.created_at
    from scout_players p
    join s s2 on p.added_by_scouts = s2.user_id::text or p.added_by_datos = s2.user_id::text
    where (p.created_at at time zone 'America/Argentina/Buenos_Aires')::date between p_from and p_to
    union all
    -- Negociaciones nuevas a su cargo
    select s3.user_id, (n.created_at at time zone 'America/Argentina/Buenos_Aires')::date, 'negociacion',
           n.player_name, coalesce(n.team_name, n.current_team_name), null, null, null, n.created_at
    from market_negotiations n
    join s s3 on n.assigned_to_id = any(coalesce(s3.member_ids, '{}'))
    where n.player_name is not null
      and (n.created_at at time zone 'America/Argentina/Buenos_Aires')::date between p_from and p_to
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', user_id, 'day', day, 'kind', kind, 'title', title, 'detail', detail,
           'status', status, 'place', place, 'players', players, 'at', at)
         order by day, at nulls first), '[]'::jsonb)
  into v_out
  from ev where user_id is not null;

  return v_out;
end
$$;
GRANT EXECUTE ON FUNCTION public.scout_calendar(date, date, uuid) TO authenticated;
