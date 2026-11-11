-- Integration of revocable credentials and persisted notifications.
-- Additive follow-up: prior migrations may already be applied.
UPDATE public.clinical_notification_events
SET status = 'uncertain', next_attempt_at = NULL, lease_id = NULL, lease_expires_at = NULL,
    error_category = 'payload_requires_review'
WHERE frozen_payload IS NOT NULL AND NOT (frozen_payload ?& ARRAY['from','to','template_version'])
  AND status IN ('pending', 'uncertain', 'processing');

CREATE OR REPLACE FUNCTION public.clinical_claim_notification_events(
  p_limit integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer;
  v_claimed_events jsonb;
BEGIN
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 10);

  -- 1. Recupera leases expiradas sem tentativa iniciada de volta para pending
  UPDATE public.clinical_notification_events
  SET status = 'pending',
      lease_id = NULL,
      lease_expires_at = NULL,
      next_attempt_at = now()
  WHERE status = 'processing'
    AND lease_expires_at < now()
    AND attempt_lease_id IS NULL;

  -- 2. Recupera leases expiradas com tentativa iniciada (worker caiu durante envio) -> uncertain com backoff
  UPDATE public.clinical_notification_events
  SET status = 'uncertain',
      lease_id = NULL,
      lease_expires_at = NULL,
      next_attempt_at = CASE
        WHEN attempt_count >= 5 THEN NULL
        ELSE now() + interval '120 seconds'
      END
  WHERE status = 'processing'
    AND lease_expires_at < now()
    AND attempt_lease_id IS NOT NULL;

  UPDATE public.clinical_notification_events
  SET status = 'uncertain', next_attempt_at = NULL,
      error_category = 'idempotency_window_expired'
  WHERE status IN ('pending', 'uncertain')
    AND first_request_intent_at <= now() - interval '24 hours';

  -- 3. Reserva atômica com SKIP LOCKED (apenas eventos com next_attempt_at válido)
  WITH target_events AS (
    SELECT id
    FROM public.clinical_notification_events
    WHERE status IN ('pending', 'uncertain')
      AND next_attempt_at IS NOT NULL
      AND next_attempt_at <= now()
      AND attempt_count < 5
    ORDER BY next_attempt_at ASC, created_at ASC, id ASC
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  ),
  updated_events AS (
    UPDATE public.clinical_notification_events e
    SET status = 'processing',
        lease_id = gen_random_uuid(),
        attempt_lease_id = NULL,
        lease_expires_at = now() + interval '90 seconds'
    FROM target_events t
    WHERE e.id = t.id
    RETURNING
      e.id,
      e.lease_id AS lease_id,
      e.kind,
      e.patient_name,
      e.patient_phone,
      e.appointment_date,
      e.appointment_time,
      e.attempt_count,
      e.frozen_payload
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(u)), '[]'::jsonb)
  INTO v_claimed_events
  FROM updated_events u;

  RETURN v_claimed_events;
END;
$$;

CREATE OR REPLACE FUNCTION public.clinical_begin_notification_attempt(
  p_event_id uuid,
  p_lease_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event record;
  v_apt record;
  v_appointment_id uuid;
BEGIN
  SELECT appointment_id INTO v_appointment_id
  FROM public.clinical_notification_events WHERE id = p_event_id;
  -- Same lock order as patient action/reschedule: appointment, then event.
  SELECT status, appointment_date, appointment_time INTO v_apt
  FROM public.appointments WHERE id = v_appointment_id FOR UPDATE;

  SELECT id, status, lease_id, lease_expires_at, attempt_count, frozen_payload,
    first_request_intent_at, kind, appointment_date, appointment_time
  INTO v_event
  FROM public.clinical_notification_events
  WHERE id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('code', 'not_found');
  END IF;

  IF v_event.lease_id IS DISTINCT FROM p_lease_id OR v_event.status <> 'processing' OR v_event.lease_expires_at <= clock_timestamp() THEN
    RETURN jsonb_build_object('code', 'stale_lease');
  END IF;

  IF v_apt.status IS NULL OR v_apt.appointment_date <> v_event.appointment_date
     OR v_apt.appointment_time <> v_event.appointment_time
     OR v_apt.status::text <> v_event.kind THEN
    UPDATE public.clinical_notification_events SET status = 'superseded',
      lease_id = NULL, lease_expires_at = NULL, next_attempt_at = NULL WHERE id = p_event_id;
    RETURN jsonb_build_object('code', 'superseded');
  END IF;

  IF v_event.first_request_intent_at <= clock_timestamp() - interval '24 hours' THEN
    UPDATE public.clinical_notification_events SET status = 'uncertain',
      error_category = 'idempotency_window_expired', lease_id = NULL,
      lease_expires_at = NULL, next_attempt_at = NULL WHERE id = p_event_id;
    RETURN jsonb_build_object('code', 'exhausted');
  END IF;

  IF v_event.frozen_payload IS NOT NULL AND v_event.frozen_payload IS DISTINCT FROM p_payload THEN
    RETURN jsonb_build_object('code', 'invalid_payload');
  END IF;

  IF v_event.attempt_count >= 5 THEN
    RETURN jsonb_build_object('code', 'exhausted');
  END IF;

  -- Congela payload na primeira tentativa
  UPDATE public.clinical_notification_events
  SET attempt_count = attempt_count + 1,
      attempt_lease_id = p_lease_id,
      last_request_intent_at = now(),
      first_request_intent_at = COALESCE(first_request_intent_at, now()),
      frozen_payload = COALESCE(frozen_payload, p_payload)
  WHERE id = p_event_id;

  RETURN jsonb_build_object(
    'code', 'ok',
    'attempt_count', v_event.attempt_count + 1,
    'frozen_payload', COALESCE(v_event.frozen_payload, p_payload),
    'idempotency_key', 'clinical-status/' || p_event_id::text
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.clinical_finish_notification_attempt(
  p_event_id uuid,
  p_lease_id uuid,
  p_result text,
  p_provider_id text DEFAULT NULL,
  p_error_category text DEFAULT NULL,
  p_retry_after_seconds integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event record;
  v_backoff_seconds integer;
  v_next_attempt timestamptz;
  v_target_status text;
BEGIN
  SELECT id, status, lease_id, attempt_count, first_request_intent_at
  INTO v_event
  FROM public.clinical_notification_events
  WHERE id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('code', 'not_found');
  END IF;

  IF v_event.lease_id IS DISTINCT FROM p_lease_id OR v_event.status <> 'processing' THEN
    RETURN jsonb_build_object('code', 'stale_lease');
  END IF;

  -- 1. Sucesso aceito
  IF p_result = 'accepted' THEN
    UPDATE public.clinical_notification_events
    SET status = 'accepted',
        accepted_at = now(),
        provider_email_id = p_provider_id,
        lease_id = NULL,
        lease_expires_at = NULL,
        next_attempt_at = NULL,
        attempt_finished_at = now()
    WHERE id = p_event_id;

    RETURN jsonb_build_object('code', 'ok', 'status', 'accepted');
  END IF;

  -- 2. Falha permanente
  IF p_result = 'permanent' THEN
    UPDATE public.clinical_notification_events
    SET status = 'failed',
        error_category = p_error_category,
        lease_id = NULL,
        lease_expires_at = NULL,
        next_attempt_at = NULL,
        attempt_finished_at = now()
    WHERE id = p_event_id;

    RETURN jsonb_build_object('code', 'ok', 'status', 'failed');
  END IF;

  -- 3. Retryable ou Uncertain: calcula backoff (60, 120, 300, 900s)
  v_backoff_seconds := CASE v_event.attempt_count
    WHEN 1 THEN 60
    WHEN 2 THEN 120
    WHEN 3 THEN 300
    ELSE 900
  END;

  IF p_retry_after_seconds IS NOT NULL AND p_retry_after_seconds > v_backoff_seconds THEN
    v_backoff_seconds := p_retry_after_seconds;
  END IF;

  v_next_attempt := now() + (v_backoff_seconds * interval '1 second');

  IF v_next_attempt >= v_event.first_request_intent_at + interval '24 hours' THEN
    UPDATE public.clinical_notification_events SET status = 'uncertain',
      error_category = 'idempotency_window_expired', lease_id = NULL,
      lease_expires_at = NULL, next_attempt_at = NULL, attempt_finished_at = now() WHERE id = p_event_id;
    RETURN jsonb_build_object('code', 'ok', 'status', 'uncertain');
  END IF;

  -- Se atingiu 5 tentativas totais, encerra sem novo agendamento
  IF v_event.attempt_count >= 5 THEN
    v_target_status := CASE WHEN p_result = 'uncertain' THEN 'uncertain' ELSE 'failed' END;
    UPDATE public.clinical_notification_events
    SET status = v_target_status,
        error_category = p_error_category,
        lease_id = NULL,
        lease_expires_at = NULL,
        next_attempt_at = NULL,
        attempt_finished_at = now()
    WHERE id = p_event_id;

    RETURN jsonb_build_object('code', 'ok', 'status', v_target_status);
  END IF;

  v_target_status := CASE WHEN p_result = 'uncertain' THEN 'uncertain' ELSE 'pending' END;

  UPDATE public.clinical_notification_events
  SET status = v_target_status,
      error_category = p_error_category,
      lease_id = NULL,
      lease_expires_at = NULL,
      next_attempt_at = v_next_attempt,
      attempt_finished_at = now()
  WHERE id = p_event_id;

  RETURN jsonb_build_object(
    'code', 'ok',
    'status', v_target_status,
    'next_attempt_at', v_next_attempt
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.clinical_release_unstarted_events(
  p_lease_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.clinical_notification_events
  SET status = 'pending',
      lease_id = NULL,
      lease_expires_at = NULL,
      next_attempt_at = now()
  WHERE status = 'processing' AND lease_id = ANY(p_lease_ids)
    AND attempt_lease_id IS DISTINCT FROM lease_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('released_count', v_count);
END;
$$;
