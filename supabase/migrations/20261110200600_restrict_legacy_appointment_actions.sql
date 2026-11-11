-- Legacy by-ID actions bypass revocable patient links and the durable event transaction.
-- Keep existing functions for server compatibility, but remove direct client execution.
DO $$
DECLARE
  signature text;
  target regprocedure;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.confirm_appointment_by_id(uuid)',
    'public.cancel_appointment_by_id(uuid,text)',
    'public.clinical_on_appointment_reschedule()'
  ] LOOP
    target := to_regprocedure(signature);
    IF target IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', target);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', target);
    END IF;
  END LOOP;
END;
$$;
