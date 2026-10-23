-- Francisco Abril (franciscoabril0418@gmail.com) no puede volver a entrar a
-- Doble G (pedido 2026-10-23). Se bloquea el mail (no puede crear otra cuenta,
-- tampoco con Google) y se suspende la cuenta actual. No se borra: se puede
-- revertir sacando el mail de blocked_emails y poniendo banned_until en NULL.
INSERT INTO public.blocked_emails (email, reason)
VALUES ('franciscoabril0418@gmail.com', 'Sin acceso a Doble G (pedido de Marcos, 2026-10-23)')
ON CONFLICT DO NOTHING;

UPDATE auth.users SET banned_until = 'infinity'
WHERE lower(email) = 'franciscoabril0418@gmail.com';

DELETE FROM auth.sessions s USING auth.users u
WHERE s.user_id = u.id AND lower(u.email) = 'franciscoabril0418@gmail.com';
