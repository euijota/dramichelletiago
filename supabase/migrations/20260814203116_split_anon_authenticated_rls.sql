-- Keep anonymous requests away from authenticated-only authorization helpers.

DROP POLICY IF EXISTS "Anyone can view active services" ON public.services;
DROP POLICY IF EXISTS "Authenticated users can view services" ON public.services;
CREATE POLICY "Anyone can view active services" ON public.services
  FOR SELECT TO anon USING (is_active = true);
CREATE POLICY "Authenticated users can view services" ON public.services
  FOR SELECT TO authenticated
  USING (is_active = true OR private.has_role((SELECT auth.uid()), 'admin'));

DROP POLICY IF EXISTS "Allow public booking insert" ON public.appointments;
DROP POLICY IF EXISTS "Allow authenticated booking insert" ON public.appointments;
CREATE POLICY "Allow public booking insert" ON public.appointments
  FOR INSERT TO anon
  WITH CHECK (status = 'pending');
CREATE POLICY "Allow authenticated booking insert" ON public.appointments
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'pending'
    OR private.has_role((SELECT auth.uid()), 'admin')
  );
