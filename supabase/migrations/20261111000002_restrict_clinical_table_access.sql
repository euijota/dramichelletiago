-- Preserve the public calendar while removing direct access to clinical data.
DO $$
DECLARE
  target text;
  policy record;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'appointments', 'patients', 'clinical_records', 'inventory_products', 'inventory_transactions'
  ] LOOP
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

-- Compatibility for the previous public booking build. No patient columns are readable.
GRANT SELECT (appointment_date, appointment_time, status) ON public.appointments TO anon;
CREATE POLICY public_future_slots ON public.appointments FOR SELECT TO anon
  USING (appointment_date >= (now() AT TIME ZONE 'America/Belem')::date AND status <> 'cancelled');

CREATE OR REPLACE FUNCTION public.get_public_occupied_slots()
RETURNS TABLE(appointment_date date, appointment_time time)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.appointment_date, a.appointment_time
  FROM public.appointments AS a
  WHERE a.appointment_date BETWEEN (now() AT TIME ZONE 'America/Belem')::date
    AND (now() AT TIME ZONE 'America/Belem')::date + 90
    AND a.status <> 'cancelled'
  ORDER BY a.appointment_date, a.appointment_time;
$$;
REVOKE ALL ON FUNCTION public.get_public_occupied_slots() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_occupied_slots() TO anon, authenticated;
