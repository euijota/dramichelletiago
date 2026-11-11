CREATE OR REPLACE FUNCTION public.clinical_notification_health()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.clinical_notification_events
      WHERE reviewed_at IS NULL AND next_attempt_at IS NULL
        AND status IN ('failed', 'uncertain')
    ) THEN 'failed'
    WHEN EXISTS (
      SELECT 1 FROM public.clinical_notification_events
      WHERE (status = 'processing' AND lease_expires_at < now())
         OR (status IN ('pending', 'uncertain') AND next_attempt_at IS NOT NULL
             AND (next_attempt_at < now() - interval '60 seconds'
                  OR (attempt_count = 0 AND created_at < now() - interval '60 seconds')))
    ) THEN 'delayed'
    ELSE 'healthy'
  END;
$$;

CREATE OR REPLACE FUNCTION public.clinical_purge_expired_notification_data()
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.appointment_link_tokens
  WHERE LEAST(expires_at, revoked_at) < now() - interval '30 days';

  DELETE FROM public.clinical_notification_events
  WHERE (status IN ('accepted', 'failed', 'superseded')
         OR (status = 'uncertain' AND next_attempt_at IS NULL))
    AND greatest(created_at, last_request_intent_at, accepted_at, attempt_finished_at)
      < now() - interval '30 days';

  PERFORM public.clinical_cleanup_expired_buckets();
END;
$$;

REVOKE ALL ON FUNCTION public.clinical_notification_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clinical_notification_health() TO service_role;
REVOKE ALL ON FUNCTION public.clinical_purge_expired_notification_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clinical_purge_expired_notification_data() TO service_role;

CREATE OR REPLACE FUNCTION public.clinical_get_notification_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pending integer;
  v_failed integer;
  v_uncertain integer;
  v_oldest timestamptz;
  v_runtime record;
  v_recent jsonb;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE status = 'pending'),
    COUNT(*) FILTER (WHERE status = 'failed'),
    COUNT(*) FILTER (WHERE status = 'uncertain'),
    MIN(created_at) FILTER (WHERE status IN ('pending', 'uncertain') AND attempt_count = 0)
  INTO v_pending, v_failed, v_uncertain, v_oldest
  FROM public.clinical_notification_events;

  SELECT last_cycle_completed_at, last_health_code
  INTO v_runtime
  FROM public.clinical_notification_runtime
  WHERE id = true;

  SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
  INTO v_recent
  FROM (
    SELECT id, status, kind, created_at, attempt_count, next_attempt_at, reviewed_at
    FROM public.clinical_notification_events
    ORDER BY created_at DESC
    LIMIT 20
  ) r;

  RETURN jsonb_build_object(
    'pending_count', v_pending,
    'failed_count', v_failed,
    'uncertain_count', v_uncertain,
    'oldest_unattempted_at', v_oldest,
    'last_cycle_completed_at', v_runtime.last_cycle_completed_at,
    'last_health_code', v_runtime.last_health_code,
    'recent_events', v_recent
  );
END;
$$;
