DO $$
DECLARE
  target text;
  policy record;
BEGIN
  FOREACH target IN ARRAY ARRAY['odontograms', 'odontogram_procedures'] LOOP
    IF to_regclass(format('public.%I', target)) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target);
    FOR policy IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = target
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', policy.policyname, target);
    END LOOP;
    EXECUTE format(
      'CREATE POLICY clinical_staff_admin_only ON public.%I FOR ALL TO authenticated
       USING (public.has_role(auth.uid(), ''admin''::public.app_role))
       WITH CHECK (public.has_role(auth.uid(), ''admin''::public.app_role))', target
    );
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon', target);
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
