-- Recessos: só admin gerencia.
-- A policy original liberava tudo para qualquer usuário `authenticated` (USING true).
-- Como o cadastro público do Supabase Auth estava aberto, qualquer pessoa podia criar
-- conta e bloquear/editar a agenda inteira. O site público continua lendo os recessos
-- pela server function `getRecesses` (service_role), que não depende desta policy.

DROP POLICY IF EXISTS "Allow all to authenticated on clinic_recesses" ON public.clinic_recesses;
DROP POLICY IF EXISTS "Admin manages clinic_recesses" ON public.clinic_recesses;

CREATE POLICY "Admin manages clinic_recesses"
  ON public.clinic_recesses
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
