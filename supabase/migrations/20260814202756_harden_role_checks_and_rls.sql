-- Keep authorization helpers outside the exposed API schema and optimize RLS.

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;
REVOKE ALL ON FUNCTION private.has_role(UUID, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(UUID, public.app_role) TO authenticated;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Anyone can view active services" ON public.services;
DROP POLICY IF EXISTS "Authenticated users can view services" ON public.services;
DROP POLICY IF EXISTS "Admins can manage services" ON public.services;
DROP POLICY IF EXISTS "Admins can insert services" ON public.services;
DROP POLICY IF EXISTS "Admins can update services" ON public.services;
DROP POLICY IF EXISTS "Admins can delete services" ON public.services;
DROP POLICY IF EXISTS "Allow public booking insert" ON public.appointments;
DROP POLICY IF EXISTS "Allow authenticated booking insert" ON public.appointments;
DROP POLICY IF EXISTS "Allow admin manage appointments" ON public.appointments;
DROP POLICY IF EXISTS "Admins can view appointments" ON public.appointments;
DROP POLICY IF EXISTS "Admins can update appointments" ON public.appointments;
DROP POLICY IF EXISTS "Admins can delete appointments" ON public.appointments;
DROP POLICY IF EXISTS "Public read active templates" ON public.message_templates;
DROP POLICY IF EXISTS "Admins can manage message templates" ON public.message_templates;

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Anyone can view active services" ON public.services
  FOR SELECT TO anon, authenticated
  USING (is_active = true OR private.has_role((SELECT auth.uid()), 'admin'));
CREATE POLICY "Admins can insert services" ON public.services
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role((SELECT auth.uid()), 'admin'));
CREATE POLICY "Admins can update services" ON public.services
  FOR UPDATE TO authenticated
  USING (private.has_role((SELECT auth.uid()), 'admin'))
  WITH CHECK (private.has_role((SELECT auth.uid()), 'admin'));
CREATE POLICY "Admins can delete services" ON public.services
  FOR DELETE TO authenticated
  USING (private.has_role((SELECT auth.uid()), 'admin'));

CREATE POLICY "Allow public booking insert" ON public.appointments
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    status = 'pending'
    OR private.has_role((SELECT auth.uid()), 'admin')
  );
CREATE POLICY "Admins can view appointments" ON public.appointments
  FOR SELECT TO authenticated
  USING (private.has_role((SELECT auth.uid()), 'admin'));
CREATE POLICY "Admins can update appointments" ON public.appointments
  FOR UPDATE TO authenticated
  USING (private.has_role((SELECT auth.uid()), 'admin'))
  WITH CHECK (private.has_role((SELECT auth.uid()), 'admin'));
CREATE POLICY "Admins can delete appointments" ON public.appointments
  FOR DELETE TO authenticated
  USING (private.has_role((SELECT auth.uid()), 'admin'));

CREATE POLICY "Public read active templates" ON public.message_templates
  FOR SELECT TO anon USING (is_active = true);
CREATE POLICY "Admins can manage message templates" ON public.message_templates
  FOR ALL TO authenticated
  USING (private.has_role((SELECT auth.uid()), 'admin'))
  WITH CHECK (private.has_role((SELECT auth.uid()), 'admin'));

CREATE INDEX IF NOT EXISTS idx_appointments_service_id
  ON public.appointments (service_id);

DROP FUNCTION IF EXISTS public.has_role(UUID, public.app_role);
