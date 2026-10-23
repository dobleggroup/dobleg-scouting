-- Personas del equipo con más de una cuenta (Gerardo y Guillermo Pereyra entran
-- con dos mails distintos): los avisos tienen que llegarle a todas. La cuenta
-- principal es la que usan hoy; las otras quedan en alt_user_ids.
ALTER TABLE public.market_team_members ADD COLUMN IF NOT EXISTS alt_user_ids uuid[] NOT NULL DEFAULT '{}';

-- Gerardo: hoy entra con gerardop.dobleg; la vieja (gpereyra.agente) queda como alternativa.
UPDATE public.market_team_members m
SET user_id = (SELECT id FROM auth.users WHERE email = 'gerardop.dobleg@gmail.com'),
    alt_user_ids = ARRAY(SELECT id FROM auth.users WHERE email = 'gpereyra.agente@gmail.com')
WHERE m.id = 8 AND m.name = 'Gerardo Pereyra';

-- Guillermo: principal guillermopereyra.dobleg; alternativa guillermopereyradt.
UPDATE public.market_team_members m
SET alt_user_ids = ARRAY(SELECT id FROM auth.users WHERE email = 'guillermopereyradt@gmail.com')
WHERE m.id = 7 AND m.name = 'Guillermo Pereyra';
