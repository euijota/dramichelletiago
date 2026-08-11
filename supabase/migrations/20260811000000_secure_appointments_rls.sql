-- Migration: Secure appointments table RLS and revoke anon privileges
-- Fixes LGPD security findings 2.1 and 2.2

-- Enable Row Level Security
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Revoke dangerous privileges from anon role
-- NOTE: We GRANT INSERT to anon to allow the public booking flow.
-- We REVOKE SELECT to prevent data leakage.
REVOKE SELECT, UPDATE, DELETE ON TABLE public.appointments FROM anon;
REVOKE SELECT ON TABLE public.profiles FROM anon;
GRANT INSERT ON TABLE public.appointments TO anon;

-- Policy 1: Allow public booking creation (INSERT only)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'appointments' AND policyname = 'Allow public booking insert'
  ) THEN
    CREATE POLICY "Allow public booking insert" ON public.appointments
      FOR INSERT TO anon
      WITH CHECK (true);
  END IF;
END $$;

-- Policy 2: Allow authenticated admins to view and manage all appointments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'appointments' AND policyname = 'Allow admin manage appointments'
  ) THEN
    CREATE POLICY "Allow admin manage appointments" ON public.appointments
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_roles.user_id = auth.uid()
          AND user_roles.role = 'admin'
        )
      );
  END IF;
END $$;
