-- Dos comentarios de Fede Pereyra en Seguimiento que en realidad cuentan reuniones (2026-11-03):
-- se cargan como reuniones pendientes de aceptar, con la fecha y el texto del comentario.
INSERT INTO public.scout_activities
  (club_id, scout_id, scout_name, kind, activity_date, title, mode, place, player_name, notes, created_by, created_by_name)
SELECT c.club_id, c.author_id, 'Federico Pereyra', 'reunion',
       (c.created_at at time zone 'America/Argentina/Buenos_Aires')::date, NULL,
       CASE WHEN c.id = 'f0ccec0c-0d94-4dc6-b15e-2277a4842c3b' THEN 'online' ELSE 'presencial' END,
       CASE WHEN c.id = '3b740e10-e9c1-46cd-9df4-e4df4067638d' THEN U&'C\00F3rdoba' END,
       c.player_name, c.body, c.author_id, 'Federico Pereyra'
FROM public.player_comments c
WHERE c.id IN ('f0ccec0c-0d94-4dc6-b15e-2277a4842c3b', '3b740e10-e9c1-46cd-9df4-e4df4067638d')
  AND NOT EXISTS (SELECT 1 FROM public.scout_activities a
                  WHERE a.scout_id = c.author_id AND a.kind = 'reunion' AND a.notes = c.body);
