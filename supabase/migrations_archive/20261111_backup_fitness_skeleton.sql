


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."app_role" AS ENUM (
    'admin',
    'patient'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE TYPE "public"."appointment_status" AS ENUM (
    'pending',
    'confirmed',
    'cancelled',
    'completed'
);


ALTER TYPE "public"."appointment_status" OWNER TO "postgres";


CREATE TYPE "public"."template_type" AS ENUM (
    'booking_confirmation',
    'booking_confirmed',
    'booking_cancelled',
    'reminder_24h',
    'reminder_1h',
    'post_appointment',
    'custom'
);


ALTER TYPE "public"."template_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_imc"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.weight IS NOT NULL AND NEW.height IS NOT NULL AND NEW.height > 0 THEN
    NEW.imc = ROUND((NEW.weight / ((NEW.height / 100) * (NEW.height / 100)))::numeric, 1);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."calculate_imc"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_appointment_by_id"("p_appointment_id" "uuid", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_appt record;
BEGIN
  SELECT id, patient_name, appointment_date, appointment_time, status
  INTO v_appt
  FROM public.appointments
  WHERE id = p_appointment_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agendamento não encontrado.');
  END IF;

  UPDATE public.appointments
  SET status = 'cancelled',
      notes = COALESCE(notes || E'\n', '') || '[CANCELADO] Motivo: ' || COALESCE(p_reason, 'Cancelado pelo paciente via link'),
      updated_at = NOW()
  WHERE id = p_appointment_id;

  RETURN jsonb_build_object(
    'success', true,
    'appointment', jsonb_build_object(
      'id', v_appt.id,
      'name', v_appt.patient_name,
      'date', v_appt.appointment_date,
      'time', v_appt.appointment_time
    )
  );
END;
$$;


ALTER FUNCTION "public"."cancel_appointment_by_id"("p_appointment_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clinical_acknowledge_notification"("p_event_id" "uuid", "p_reviewer_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE public.clinical_notification_events
  SET reviewed_at = now(),
      reviewed_by = p_reviewer_id
  WHERE id = p_event_id
    AND status IN ('failed', 'uncertain')
    AND next_attempt_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('code', 'not_reviewable');
  END IF;

  RETURN jsonb_build_object('code', 'ok');
END;
$$;


ALTER FUNCTION "public"."clinical_acknowledge_notification"("p_event_id" "uuid", "p_reviewer_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clinical_apply_patient_action"("p_token_hash" "text", "p_action" "text", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_token record;
  v_apt record;
  v_starts_at timestamptz;
  v_clean_reason text;
  v_event_id uuid;
  v_snapshot jsonb;
BEGIN
  IF p_action NOT IN ('confirm', 'cancel') THEN
    RETURN jsonb_build_object('code', 'action_not_allowed');
  END IF;

  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('code', 'invalid_link');
  END IF;

  -- 1. Localiza token
  SELECT id, appointment_id, allowed_actions, expires_at, revoked_at
  INTO v_token
  FROM public.appointment_link_tokens
  WHERE token_hash = p_token_hash;

  IF NOT FOUND OR v_token.revoked_at IS NOT NULL OR now() > v_token.expires_at THEN
    RETURN jsonb_build_object('code', 'invalid_link');
  END IF;

  IF NOT (p_action = ANY(v_token.allowed_actions)) THEN
    RETURN jsonb_build_object('code', 'action_not_allowed');
  END IF;

  -- 2. Bloqueio atômico pessimista: appointments -> appointment_link_tokens
  SELECT id, status, appointment_date, appointment_time, patient_name, patient_phone, notes, cancellation_reason
  INTO v_apt
  FROM public.appointments
  WHERE id = v_token.appointment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('code', 'invalid_link');
  END IF;

  -- Re-seleciona e bloqueia o token para re-validar que não foi revogado enquanto aguardava o lock
  SELECT id, appointment_id, allowed_actions, expires_at, revoked_at
  INTO v_token
  FROM public.appointment_link_tokens
  WHERE id = v_token.id
  FOR UPDATE;

  IF v_token.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('code', 'token_revoked');
  END IF;

  IF v_token.expires_at <= now() THEN
    RETURN jsonb_build_object('code', 'token_expired');
  END IF;

  IF NOT (p_action = ANY(v_token.allowed_actions)) THEN
    RETURN jsonb_build_object('code', 'action_not_allowed');
  END IF;

  -- 3. Verificação de consulta no passado
  v_starts_at := ((v_apt.appointment_date + v_apt.appointment_time) AT TIME ZONE 'America/Belem');
  IF v_starts_at <= now() THEN
    RETURN jsonb_build_object('code', 'appointment_past');
  END IF;

  -- 4. Consulta concluída é imutável pelo paciente
  IF v_apt.status = 'completed' THEN
    RETURN jsonb_build_object('code', 'transition_not_allowed');
  END IF;

  v_snapshot := jsonb_build_object(
    'patient_name', v_apt.patient_name,
    'appointment_date', v_apt.appointment_date,
    'appointment_time', v_apt.appointment_time
  );

  -- 5. Tratamento de CONFIRMAÇÃO
  IF p_action = 'confirm' THEN
    IF v_apt.status = 'cancelled' THEN
      RETURN jsonb_build_object('code', 'transition_not_allowed');
    END IF;

    IF v_apt.status = 'confirmed' THEN
      RETURN jsonb_build_object(
        'code', 'already_applied',
        'changed', false,
        'status', 'confirmed',
        'appointment', v_snapshot
      );
    END IF;

    UPDATE public.appointments
    SET status = 'confirmed',
        confirmed_at = now(),
        updated_at = now()
    WHERE id = v_apt.id;

    INSERT INTO public.clinical_notification_events (
      appointment_id,
      kind,
      origin,
      status,
      patient_name,
      patient_phone,
      appointment_date,
      appointment_time
    ) VALUES (
      v_apt.id,
      'confirmed',
      'patient_link',
      'pending',
      v_apt.patient_name,
      v_apt.patient_phone,
      v_apt.appointment_date,
      v_apt.appointment_time
    )
    RETURNING id INTO v_event_id;

    RETURN jsonb_build_object(
      'code', 'ok',
      'changed', true,
      'status', 'confirmed',
      'event_id', v_event_id,
      'appointment', v_snapshot
    );
  END IF;

  -- 6. Tratamento de CANCELAMENTO
  IF p_action = 'cancel' THEN
    IF v_apt.status = 'cancelled' THEN
      RETURN jsonb_build_object(
        'code', 'already_applied',
        'changed', false,
        'status', 'cancelled',
        'appointment', v_snapshot
      );
    END IF;

    v_clean_reason := NULLIF(trim(p_reason), '');
    IF v_clean_reason IS NOT NULL AND length(v_clean_reason) > 500 THEN
      v_clean_reason := substring(v_clean_reason FROM 1 FOR 500);
    END IF;

    UPDATE public.appointments
    SET status = 'cancelled',
        cancellation_reason = COALESCE(v_clean_reason, 'Cancelado pelo paciente via link'),
        updated_at = now()
    WHERE id = v_apt.id;

    -- Marca confirmações pendentes anteriores como superadas
    UPDATE public.clinical_notification_events
    SET status = 'superseded'
    WHERE appointment_id = v_apt.id
      AND kind = 'confirmed'
      AND status IN ('pending', 'uncertain');

    INSERT INTO public.clinical_notification_events (
      appointment_id,
      kind,
      origin,
      status,
      patient_name,
      patient_phone,
      appointment_date,
      appointment_time
    ) VALUES (
      v_apt.id,
      'cancelled',
      'patient_link',
      'pending',
      v_apt.patient_name,
      v_apt.patient_phone,
      v_apt.appointment_date,
      v_apt.appointment_time
    )
    RETURNING id INTO v_event_id;

    RETURN jsonb_build_object(
      'code', 'ok',
      'changed', true,
      'status', 'cancelled',
      'event_id', v_event_id,
      'appointment', v_snapshot
    );
  END IF;

  RETURN jsonb_build_object('code', 'action_not_allowed');
END;
$_$;


ALTER FUNCTION "public"."clinical_apply_patient_action"("p_token_hash" "text", "p_action" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clinical_begin_notification_attempt"("p_event_id" "uuid", "p_lease_id" "uuid", "p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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


ALTER FUNCTION "public"."clinical_begin_notification_attempt"("p_event_id" "uuid", "p_lease_id" "uuid", "p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clinical_claim_monitor_cycle"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_current_slot timestamptz;
  v_runtime record;
  v_new_lease uuid;
  v_new_check_in uuid;
BEGIN
  -- Minuto truncado atual em UTC
  v_current_slot := date_trunc('minute', now() AT TIME ZONE 'UTC');

  SELECT * INTO v_runtime
  FROM public.clinical_notification_runtime
  WHERE id = true
  FOR UPDATE;

  -- Se o ciclo atual já foi concluído neste minuto, não inicia outro
  IF v_runtime.cycle_slot = v_current_slot AND v_runtime.last_cycle_completed_at >= v_current_slot THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'already_completed');
  END IF;

  -- Se há lease ativo para este minuto que ainda não expirou, respeita
  IF v_runtime.cycle_slot = v_current_slot 
     AND v_runtime.monitor_lease_expires_at IS NOT NULL 
     AND v_runtime.monitor_lease_expires_at > now() THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'lease_active');
  END IF;

  v_new_lease := gen_random_uuid();
  v_new_check_in := gen_random_uuid();

  UPDATE public.clinical_notification_runtime
  SET cycle_slot = v_current_slot,
      check_in_id = v_new_check_in,
      monitor_lease_id = v_new_lease,
      monitor_lease_expires_at = now() + interval '90 seconds'
  WHERE id = true;

  RETURN jsonb_build_object(
    'claimed', true,
    'lease_id', v_new_lease,
    'check_in_id', v_new_check_in,
    'cycle_slot', v_current_slot
  );
END;
$$;


ALTER FUNCTION "public"."clinical_claim_monitor_cycle"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clinical_claim_notification_events"("p_limit" integer DEFAULT 10) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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


ALTER FUNCTION "public"."clinical_claim_notification_events"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clinical_cleanup_expired_buckets"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  DELETE FROM public.clinical_link_rate_buckets
  WHERE expires_at < (now() - interval '24 hours');
END;
$$;


ALTER FUNCTION "public"."clinical_cleanup_expired_buckets"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clinical_consume_link_limit"("p_source_hash" "text", "p_kind" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_window_start timestamptz;
  v_expires_at timestamptz;
  v_count integer;
  v_limit integer;
  v_retry_after integer;
BEGIN
  IF p_kind NOT IN ('read', 'action') THEN
    RETURN jsonb_build_object('allowed', false, 'retry_after_seconds', 60);
  END IF;

  v_limit := CASE WHEN p_kind = 'read' THEN 30 ELSE 10 END;
  v_window_start := date_trunc('minute', now());
  v_expires_at := v_window_start + interval '6 minutes';
  v_retry_after := GREATEST(1, EXTRACT(epoch FROM ((v_window_start + interval '1 minute') - now()))::integer);

  INSERT INTO public.clinical_link_rate_buckets (
    source_hash,
    kind,
    window_start,
    request_count,
    expires_at
  ) VALUES (
    p_source_hash,
    p_kind,
    v_window_start,
    1,
    v_expires_at
  )
  ON CONFLICT (source_hash, kind, window_start)
  DO UPDATE SET request_count = public.clinical_link_rate_buckets.request_count + 1
  RETURNING request_count INTO v_count;

  IF v_count > v_limit THEN
    RETURN jsonb_build_object('allowed', false, 'retry_after_seconds', v_retry_after);
  END IF;

  RETURN jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
END;
$$;


ALTER FUNCTION "public"."clinical_consume_link_limit"("p_source_hash" "text", "p_kind" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clinical_finish_monitor_cycle"("p_lease_id" "uuid", "p_health_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_updated boolean := false;
BEGIN
  IF p_health_code NOT IN ('healthy', 'delayed', 'failed') THEN
    RAISE EXCEPTION 'Código de saúde inválido: %', p_health_code;
  END IF;

  UPDATE public.clinical_notification_runtime
  SET last_cycle_completed_at = now(),
      last_health_code = p_health_code,
      monitor_lease_id = NULL,
      monitor_lease_expires_at = NULL
  WHERE id = true AND monitor_lease_id = p_lease_id;

  v_updated := FOUND;

  RETURN jsonb_build_object('updated', v_updated);
END;
$$;


ALTER FUNCTION "public"."clinical_finish_monitor_cycle"("p_lease_id" "uuid", "p_health_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clinical_finish_notification_attempt"("p_event_id" "uuid", "p_lease_id" "uuid", "p_result" "text", "p_provider_id" "text" DEFAULT NULL::"text", "p_error_category" "text" DEFAULT NULL::"text", "p_retry_after_seconds" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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


ALTER FUNCTION "public"."clinical_finish_notification_attempt"("p_event_id" "uuid", "p_lease_id" "uuid", "p_result" "text", "p_provider_id" "text", "p_error_category" "text", "p_retry_after_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clinical_get_notification_status"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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


ALTER FUNCTION "public"."clinical_get_notification_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clinical_get_recent_patient_events"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_events jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
  INTO v_events
  FROM (
    SELECT
      id,
      appointment_id,
      kind,
      origin,
      created_at,
      patient_name,
      appointment_date,
      appointment_time
    FROM public.clinical_notification_events
    WHERE created_at >= (now() - interval '10 minutes')
    ORDER BY created_at DESC, id DESC
    LIMIT 100
  ) r;

  RETURN v_events;
END;
$$;


ALTER FUNCTION "public"."clinical_get_recent_patient_events"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clinical_issue_appointment_link"("p_appointment_id" "uuid", "p_token_hash" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_apt record;
  v_expires_at timestamptz;
  v_starts_at timestamptz;
BEGIN
  -- Validação de formato do hash SHA-256
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('code', 'invalid_hash');
  END IF;

  -- Bloqueio da consulta para consistência
  SELECT id, status, appointment_date, appointment_time, patient_name, patient_phone
  INTO v_apt
  FROM public.appointments
  WHERE id = p_appointment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('code', 'not_eligible');
  END IF;

  -- Somente consultas pendentes ou confirmadas são elegíveis
  IF v_apt.status NOT IN ('pending', 'confirmed') THEN
    RETURN jsonb_build_object('code', 'not_eligible');
  END IF;

  -- Horário de Macapá (UTC-3: America/Belem)
  v_starts_at := ((v_apt.appointment_date + v_apt.appointment_time) AT TIME ZONE 'America/Belem');
  IF v_starts_at <= now() THEN
    RETURN jsonb_build_object('code', 'not_eligible');
  END IF;

  -- Expiração definida: 48 horas após a data/hora programada da consulta
  v_expires_at := v_starts_at + interval '48 hours';

  -- Revogação transacional de tokens anteriores da mesma consulta
  UPDATE public.appointment_link_tokens
  SET revoked_at = now()
  WHERE appointment_id = p_appointment_id AND revoked_at IS NULL;

  -- Insere nova autorização com hash seguro
  INSERT INTO public.appointment_link_tokens (
    appointment_id,
    token_hash,
    allowed_actions,
    expires_at
  ) VALUES (
    p_appointment_id,
    p_token_hash,
    ARRAY['confirm', 'cancel'],
    v_expires_at
  );

  RETURN jsonb_build_object(
    'code', 'ok',
    'expires_at', v_expires_at,
    'snapshot', jsonb_build_object(
      'patient_name', v_apt.patient_name,
      'patient_phone', v_apt.patient_phone,
      'appointment_date', v_apt.appointment_date,
      'appointment_time', v_apt.appointment_time
    )
  );
END;
$_$;


ALTER FUNCTION "public"."clinical_issue_appointment_link"("p_appointment_id" "uuid", "p_token_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clinical_notification_health"() RETURNS "text"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
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


ALTER FUNCTION "public"."clinical_notification_health"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clinical_on_appointment_reschedule"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF (OLD.appointment_date IS DISTINCT FROM NEW.appointment_date) OR
     (OLD.appointment_time IS DISTINCT FROM NEW.appointment_time) THEN

    -- Revoga tokens ativos da consulta
    UPDATE public.appointment_link_tokens
    SET revoked_at = now()
    WHERE appointment_id = NEW.id AND revoked_at IS NULL;

    -- Supera eventos pendentes de confirmação
    UPDATE public.clinical_notification_events
    SET status = 'superseded'
    WHERE appointment_id = NEW.id
      AND kind = 'confirmed'
      AND status IN ('pending', 'uncertain');
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."clinical_on_appointment_reschedule"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clinical_preview_appointment"("p_token_hash" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_token record;
  v_apt record;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('code', 'invalid_link');
  END IF;

  SELECT appointment_id, allowed_actions, expires_at, revoked_at
  INTO v_token
  FROM public.appointment_link_tokens
  WHERE token_hash = p_token_hash;

  IF NOT FOUND OR v_token.revoked_at IS NOT NULL OR now() > v_token.expires_at THEN
    RETURN jsonb_build_object('code', 'invalid_link');
  END IF;

  SELECT status, appointment_date, appointment_time, patient_name
  INTO v_apt
  FROM public.appointments
  WHERE id = v_token.appointment_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('code', 'invalid_link');
  END IF;

  RETURN jsonb_build_object(
    'code', 'ok',
    'appointment', jsonb_build_object(
      'patient_name', v_apt.patient_name,
      'appointment_date', v_apt.appointment_date,
      'appointment_time', v_apt.appointment_time,
      'status', v_apt.status,
      'allowed_actions', v_token.allowed_actions
    )
  );
END;
$_$;


ALTER FUNCTION "public"."clinical_preview_appointment"("p_token_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clinical_purge_expired_notification_data"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
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


ALTER FUNCTION "public"."clinical_purge_expired_notification_data"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clinical_release_unstarted_events"("p_lease_ids" "uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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


ALTER FUNCTION "public"."clinical_release_unstarted_events"("p_lease_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_appointment_by_id"("p_appointment_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_appt record;
BEGIN
  SELECT id, patient_name, appointment_date, appointment_time, status
  INTO v_appt
  FROM public.appointments
  WHERE id = p_appointment_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agendamento não encontrado.');
  END IF;

  UPDATE public.appointments
  SET status = 'confirmed',
      confirmed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_appointment_id;

  RETURN jsonb_build_object(
    'success', true,
    'appointment', jsonb_build_object(
      'id', v_appt.id,
      'name', v_appt.patient_name,
      'date', v_appt.appointment_date,
      'time', v_appt.appointment_time
    )
  );
END;
$$;


ALTER FUNCTION "public"."confirm_appointment_by_id"("p_appointment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_occupied_slots"() RETURNS TABLE("appointment_date" "date", "appointment_time" time without time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT a.appointment_date, a.appointment_time
  FROM public.appointments AS a
  WHERE a.appointment_date BETWEEN (now() AT TIME ZONE 'America/Belem')::date
    AND (now() AT TIME ZONE 'America/Belem')::date + 90
    AND a.status <> 'cancelled'
  ORDER BY a.appointment_date, a.appointment_time;
$$;


ALTER FUNCTION "public"."get_public_occupied_slots"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;


ALTER FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_conversation_last_message"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE conversations
  SET last_message = NEW.content,
      last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_conversation_last_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."appointment_link_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "appointment_id" "uuid" NOT NULL,
    "token_hash" "text" NOT NULL,
    "allowed_actions" "text"[] DEFAULT ARRAY['confirm'::"text", 'cancel'::"text"] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "revoked_at" timestamp with time zone,
    CONSTRAINT "check_allowed_actions_valid" CHECK ((("array_length"("allowed_actions", 1) > 0) AND ("allowed_actions" <@ ARRAY['confirm'::"text", 'cancel'::"text"]))),
    CONSTRAINT "check_expires_after_created" CHECK (("expires_at" > "created_at")),
    CONSTRAINT "check_token_hash_hex64" CHECK (("token_hash" ~ '^[0-9a-f]{64}$'::"text"))
);


ALTER TABLE "public"."appointment_link_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."appointments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "patient_name" "text" NOT NULL,
    "patient_email" "text",
    "patient_phone" "text" NOT NULL,
    "service_id" "uuid",
    "service_name" "text" NOT NULL,
    "appointment_date" "date" NOT NULL,
    "appointment_time" time without time zone NOT NULL,
    "status" "public"."appointment_status" DEFAULT 'pending'::"public"."appointment_status" NOT NULL,
    "notes" "text",
    "reminder_sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "duration_minutes" integer DEFAULT 60 NOT NULL,
    "confirmed_at" timestamp with time zone,
    "patient_id" "uuid",
    "legacy_patient_id" integer,
    "cancellation_reason" "text",
    CONSTRAINT "check_cancellation_reason_length" CHECK ((("cancellation_reason" IS NULL) OR ("length"("cancellation_reason") <= 500)))
);


ALTER TABLE "public"."appointments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assessments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE,
    "type" "text" NOT NULL,
    "result" "text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."assessments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_workouts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "workout_id" "uuid" NOT NULL,
    "assigned_date" "date" DEFAULT CURRENT_DATE,
    "status" "text" DEFAULT 'active'::"text",
    "completed_sessions" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."client_workouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "trainer_id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "birth_date" "date",
    "objective" "text" DEFAULT 'emagrecimento'::"text",
    "plan" "text" DEFAULT 'Essencial'::"text",
    "status" "text" DEFAULT 'active'::"text",
    "weight" numeric(5,1),
    "height" numeric(5,1),
    "goal_weight" numeric(5,1),
    "imc" numeric(4,1),
    "age" integer,
    "notes" "text" DEFAULT '[]'::"text",
    "completion_rate" integer DEFAULT 0,
    "last_workout_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clinical_link_rate_buckets" (
    "source_hash" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "window_start" timestamp with time zone NOT NULL,
    "request_count" integer DEFAULT 0 NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    CONSTRAINT "clinical_link_rate_buckets_kind_check" CHECK (("kind" = ANY (ARRAY['read'::"text", 'action'::"text"]))),
    CONSTRAINT "clinical_link_rate_buckets_request_count_check" CHECK (("request_count" >= 0))
);


ALTER TABLE "public"."clinical_link_rate_buckets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clinical_notification_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "appointment_id" "uuid",
    "kind" "text" NOT NULL,
    "origin" "text" DEFAULT 'patient_link'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "next_attempt_at" timestamp with time zone DEFAULT "now"(),
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "lease_id" "uuid",
    "lease_expires_at" timestamp with time zone,
    "attempt_lease_id" "uuid",
    "last_request_intent_at" timestamp with time zone,
    "first_request_intent_at" timestamp with time zone,
    "attempt_finished_at" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "provider_email_id" "text",
    "error_category" "text",
    "patient_name" "text" NOT NULL,
    "patient_phone" "text",
    "appointment_date" "date" NOT NULL,
    "appointment_time" time without time zone NOT NULL,
    "frozen_payload" "jsonb",
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "uuid",
    CONSTRAINT "clinical_notification_events_attempt_count_check" CHECK ((("attempt_count" >= 0) AND ("attempt_count" <= 5))),
    CONSTRAINT "clinical_notification_events_kind_check" CHECK (("kind" = ANY (ARRAY['confirmed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "clinical_notification_events_origin_check" CHECK (("origin" = 'patient_link'::"text")),
    CONSTRAINT "clinical_notification_events_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'accepted'::"text", 'failed'::"text", 'superseded'::"text", 'uncertain'::"text"])))
);


ALTER TABLE "public"."clinical_notification_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clinical_notification_runtime" (
    "id" boolean DEFAULT true NOT NULL,
    "cycle_slot" timestamp with time zone,
    "check_in_id" "uuid",
    "monitor_lease_id" "uuid",
    "monitor_lease_expires_at" timestamp with time zone,
    "last_cycle_completed_at" timestamp with time zone,
    "last_health_code" "text",
    CONSTRAINT "clinical_notification_runtime_id_check" CHECK (("id" = true)),
    CONSTRAINT "clinical_notification_runtime_last_health_code_check" CHECK (("last_health_code" = ANY (ARRAY['healthy'::"text", 'delayed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."clinical_notification_runtime" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clinical_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "record_type" "text" DEFAULT 'evolucao'::"text" NOT NULL,
    "record_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "title" "text",
    "content" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."clinical_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "trainer_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "last_message" "text",
    "last_message_at" timestamp with time zone DEFAULT "now"(),
    "unread_trainer" integer DEFAULT 0,
    "unread_client" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exercise_logs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "exercise_name" "text" NOT NULL,
    "set_number" integer NOT NULL,
    "reps_done" "text",
    "weight_used" numeric(6,1),
    "completed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."exercise_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exercises" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "trainer_id" "uuid",
    "name" "text" NOT NULL,
    "muscle_group" "text" NOT NULL,
    "equipment" "text" NOT NULL,
    "video_url" "text",
    "instructions" "text",
    "is_public" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."exercises" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text",
    "name" "text" NOT NULL,
    "category" "text" DEFAULT 'Geral'::"text" NOT NULL,
    "unit" "text" DEFAULT 'Unidade'::"text" NOT NULL,
    "current_quantity" numeric DEFAULT 0 NOT NULL,
    "min_quantity" numeric DEFAULT 5 NOT NULL,
    "ideal_quantity" numeric DEFAULT 20 NOT NULL,
    "unit_cost" numeric DEFAULT 0,
    "supplier" "text",
    "batch_number" "text",
    "expiration_date" "date",
    "location" "text",
    "notes" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."inventory_products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "transaction_type" "text" NOT NULL,
    "quantity" numeric NOT NULL,
    "previous_quantity" numeric,
    "new_quantity" numeric,
    "unit_cost" numeric DEFAULT 0,
    "reason" "text" DEFAULT 'consumo_clinico'::"text" NOT NULL,
    "patient_id" "uuid",
    "responsible" "text" DEFAULT 'Dra. Michelle'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inventory_transactions_transaction_type_check" CHECK (("transaction_type" = ANY (ARRAY['entrada'::"text", 'saida'::"text", 'ajuste'::"text"])))
);


ALTER TABLE "public"."inventory_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."measurements" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE,
    "weight" numeric(5,1),
    "chest" numeric(5,1),
    "waist" numeric(5,1),
    "hips" numeric(5,1),
    "arms" numeric(5,1),
    "thighs" numeric(5,1),
    "shoulders" numeric(5,1),
    "body_fat" numeric(4,1),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."measurements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "public"."template_type" NOT NULL,
    "name" "text" NOT NULL,
    "channel" "text" NOT NULL,
    "subject" "text",
    "body" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "is_default" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "message_templates_channel_check" CHECK (("channel" = ANY (ARRAY['whatsapp'::"text", 'email'::"text", 'both'::"text"])))
);


ALTER TABLE "public"."message_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "text" NOT NULL,
    "sender_type" "text" DEFAULT 'trainer'::"text" NOT NULL,
    "content" "text" NOT NULL,
    "read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."odontogram_procedures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "odontogram_id" "uuid" NOT NULL,
    "tooth_number" integer NOT NULL,
    "surfaces" "text"[] DEFAULT '{}'::"text"[],
    "procedure_name" "text" NOT NULL,
    "status" "text" DEFAULT 'planned'::"text" NOT NULL,
    "cost" numeric(10,2),
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."odontogram_procedures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."odontograms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "dentition_type" "text" DEFAULT 'permanent'::"text" NOT NULL,
    "notes" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."odontograms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."patients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "legacy_patient_id" integer,
    "record_number" integer NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text",
    "phone2" "text",
    "email" "text",
    "cpf" "text",
    "rg" "text",
    "birth_date" "date",
    "gender" "text",
    "insurance" "text",
    "insurance_number" "text",
    "origin" "text",
    "profession" "text",
    "marital_status" "text",
    "medical_warning" "text",
    "postal_code" "text",
    "address" "text",
    "address_number" "text",
    "address_extra" "text",
    "neighborhood" "text",
    "city" "text" DEFAULT 'Macapá'::"text",
    "state" "text" DEFAULT 'AP'::"text",
    "is_inactive" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    "nickname" "text",
    "return_alert_date" "date",
    "return_alert_notes" "text",
    "funnel_stage" "text" DEFAULT 'triagem'::"text",
    "clinicorp_id" "text"
);


ALTER TABLE "public"."patients" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."patients_record_number_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."patients_record_number_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."patients_record_number_seq" OWNED BY "public"."patients"."record_number";



CREATE TABLE IF NOT EXISTS "public"."payment_plans" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "trainer_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "price" numeric(10,2) NOT NULL,
    "billing_cycle" "text" DEFAULT 'monthly'::"text",
    "description" "text",
    "features" "text"[] DEFAULT '{}'::"text"[],
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."payment_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "trainer_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "client_name" "text",
    "description" "text" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "due_date" "date",
    "paid_at" timestamp with time zone,
    "payment_method" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "full_name" "text",
    "phone" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."progress_photos" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE,
    "url" "text" NOT NULL,
    "label" "text" DEFAULT 'front'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."progress_photos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedules" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "trainer_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "workout_id" "uuid",
    "workout_name" "text",
    "scheduled_date" "date" NOT NULL,
    "scheduled_time" time without time zone NOT NULL,
    "duration_minutes" integer DEFAULT 60,
    "status" "text" DEFAULT 'scheduled'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "duration_minutes" integer DEFAULT 60 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "category" "text",
    "price" numeric(10,2)
);


ALTER TABLE "public"."services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trainers" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "full_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text",
    "cref" "text",
    "bio" "text",
    "avatar_url" "text",
    "business_name" "text",
    "business_address" "text",
    "business_phone" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."trainers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workout_exercises" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "workout_id" "uuid" NOT NULL,
    "exercise_id" "uuid" NOT NULL,
    "sets" integer DEFAULT 3 NOT NULL,
    "reps" "text" DEFAULT '10-12'::"text" NOT NULL,
    "rest_seconds" integer DEFAULT 60,
    "notes" "text",
    "order" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."workout_exercises" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workout_sessions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "client_workout_id" "uuid",
    "workout_name" "text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"(),
    "ended_at" timestamp with time zone,
    "duration_seconds" integer,
    "completed_exercises" integer DEFAULT 0,
    "total_exercises" integer DEFAULT 0,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."workout_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workouts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "trainer_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "muscle_groups" "text"[] DEFAULT '{}'::"text"[],
    "estimated_duration" integer DEFAULT 60,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."workouts" OWNER TO "postgres";


ALTER TABLE ONLY "public"."patients" ALTER COLUMN "record_number" SET DEFAULT "nextval"('"public"."patients_record_number_seq"'::"regclass");



ALTER TABLE ONLY "public"."appointment_link_tokens"
    ADD CONSTRAINT "appointment_link_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."appointment_link_tokens"
    ADD CONSTRAINT "appointment_link_tokens_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assessments"
    ADD CONSTRAINT "assessments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_workouts"
    ADD CONSTRAINT "client_workouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clinical_link_rate_buckets"
    ADD CONSTRAINT "clinical_link_rate_buckets_pkey" PRIMARY KEY ("source_hash", "kind", "window_start");



ALTER TABLE ONLY "public"."clinical_notification_events"
    ADD CONSTRAINT "clinical_notification_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clinical_notification_runtime"
    ADD CONSTRAINT "clinical_notification_runtime_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clinical_records"
    ADD CONSTRAINT "clinical_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_trainer_id_client_id_key" UNIQUE ("trainer_id", "client_id");



ALTER TABLE ONLY "public"."exercise_logs"
    ADD CONSTRAINT "exercise_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_products"
    ADD CONSTRAINT "inventory_products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_transactions"
    ADD CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."measurements"
    ADD CONSTRAINT "measurements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_templates"
    ADD CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."odontogram_procedures"
    ADD CONSTRAINT "odontogram_procedures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."odontograms"
    ADD CONSTRAINT "odontograms_patient_id_key" UNIQUE ("patient_id");



ALTER TABLE ONLY "public"."odontograms"
    ADD CONSTRAINT "odontograms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_legacy_patient_id_key" UNIQUE ("legacy_patient_id");



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_record_number_key" UNIQUE ("record_number");



ALTER TABLE ONLY "public"."payment_plans"
    ADD CONSTRAINT "payment_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."progress_photos"
    ADD CONSTRAINT "progress_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedules"
    ADD CONSTRAINT "schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trainers"
    ADD CONSTRAINT "trainers_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."trainers"
    ADD CONSTRAINT "trainers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE ("user_id", "role");



ALTER TABLE ONLY "public"."workout_exercises"
    ADD CONSTRAINT "workout_exercises_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workout_sessions"
    ADD CONSTRAINT "workout_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workouts"
    ADD CONSTRAINT "workouts_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_appointment_link_tokens_apt" ON "public"."appointment_link_tokens" USING "btree" ("appointment_id");



CREATE INDEX "idx_appointments_confirmation" ON "public"."appointments" USING "btree" ("confirmed_at", "status") WHERE ("status" = ANY (ARRAY['pending'::"public"."appointment_status", 'confirmed'::"public"."appointment_status"]));



CREATE INDEX "idx_appointments_date" ON "public"."appointments" USING "btree" ("appointment_date", "appointment_time");



CREATE INDEX "idx_appointments_patient_id" ON "public"."appointments" USING "btree" ("patient_id");



CREATE INDEX "idx_appointments_reminder_lookup" ON "public"."appointments" USING "btree" ("appointment_date", "reminder_sent_at", "status") WHERE ("status" = ANY (ARRAY['pending'::"public"."appointment_status", 'confirmed'::"public"."appointment_status"]));



CREATE INDEX "idx_appointments_service_id" ON "public"."appointments" USING "btree" ("service_id");



CREATE UNIQUE INDEX "idx_appointments_unique_active_slot" ON "public"."appointments" USING "btree" ("appointment_date", "appointment_time") WHERE ("status" = ANY (ARRAY['pending'::"public"."appointment_status", 'confirmed'::"public"."appointment_status"]));



CREATE INDEX "idx_clients_status" ON "public"."clients" USING "btree" ("status");



CREATE INDEX "idx_clients_trainer" ON "public"."clients" USING "btree" ("trainer_id");



CREATE INDEX "idx_clinical_events_apt_created" ON "public"."clinical_notification_events" USING "btree" ("appointment_id", "created_at");



CREATE INDEX "idx_clinical_events_next_attempt" ON "public"."clinical_notification_events" USING "btree" ("next_attempt_at") WHERE (("status" = ANY (ARRAY['pending'::"text", 'uncertain'::"text"])) AND ("next_attempt_at" IS NOT NULL));



CREATE INDEX "idx_clinical_link_rate_buckets_expires" ON "public"."clinical_link_rate_buckets" USING "btree" ("expires_at");



CREATE INDEX "idx_clinical_records_patient" ON "public"."clinical_records" USING "btree" ("patient_id");



CREATE INDEX "idx_conversations_trainer" ON "public"."conversations" USING "btree" ("trainer_id");



CREATE INDEX "idx_exercises_trainer" ON "public"."exercises" USING "btree" ("trainer_id");



CREATE INDEX "idx_inventory_products_category" ON "public"."inventory_products" USING "btree" ("category");



CREATE INDEX "idx_inventory_products_name" ON "public"."inventory_products" USING "btree" ("name");



CREATE INDEX "idx_inventory_transactions_created_at" ON "public"."inventory_transactions" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_inventory_transactions_product_id" ON "public"."inventory_transactions" USING "btree" ("product_id");



CREATE INDEX "idx_measurements_client" ON "public"."measurements" USING "btree" ("client_id");



CREATE INDEX "idx_messages_conv" ON "public"."messages" USING "btree" ("conversation_id");



CREATE INDEX "idx_odontogram_procedures_odontogram" ON "public"."odontogram_procedures" USING "btree" ("odontogram_id");



CREATE INDEX "idx_patients_clinicorp_id" ON "public"."patients" USING "btree" ("clinicorp_id");



CREATE INDEX "idx_patients_cpf" ON "public"."patients" USING "btree" ("cpf");



CREATE INDEX "idx_patients_legacy_id" ON "public"."patients" USING "btree" ("legacy_patient_id");



CREATE INDEX "idx_patients_name" ON "public"."patients" USING "btree" ("name");



CREATE INDEX "idx_patients_phone" ON "public"."patients" USING "btree" ("phone");



CREATE INDEX "idx_payments_trainer" ON "public"."payments" USING "btree" ("trainer_id");



CREATE INDEX "idx_schedules_client" ON "public"."schedules" USING "btree" ("client_id");



CREATE INDEX "idx_schedules_date" ON "public"."schedules" USING "btree" ("scheduled_date");



CREATE INDEX "idx_schedules_trainer" ON "public"."schedules" USING "btree" ("trainer_id");



CREATE INDEX "idx_sessions_client" ON "public"."workout_sessions" USING "btree" ("client_id");



CREATE INDEX "idx_workout_ex_workout" ON "public"."workout_exercises" USING "btree" ("workout_id");



CREATE INDEX "idx_workouts_trainer" ON "public"."workouts" USING "btree" ("trainer_id");



CREATE OR REPLACE TRIGGER "clients_calculate_imc" BEFORE INSERT OR UPDATE OF "weight", "height" ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."calculate_imc"();



CREATE OR REPLACE TRIGGER "clients_updated_at" BEFORE UPDATE ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "messages_update_conversation" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."update_conversation_last_message"();



CREATE OR REPLACE TRIGGER "trainers_updated_at" BEFORE UPDATE ON "public"."trainers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_clinical_on_appointment_reschedule" AFTER UPDATE OF "appointment_date", "appointment_time" ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."clinical_on_appointment_reschedule"();



CREATE OR REPLACE TRIGGER "update_appointments_updated_at" BEFORE UPDATE ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_inventory_products_updated_at" BEFORE UPDATE ON "public"."inventory_products" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_message_templates_updated_at" BEFORE UPDATE ON "public"."message_templates" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_odontograms_updated_at" BEFORE UPDATE ON "public"."odontograms" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_patients_updated_at" BEFORE UPDATE ON "public"."patients" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_services_updated_at" BEFORE UPDATE ON "public"."services" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "workouts_updated_at" BEFORE UPDATE ON "public"."workouts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."appointment_link_tokens"
    ADD CONSTRAINT "appointment_link_tokens_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."assessments"
    ADD CONSTRAINT "assessments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_workouts"
    ADD CONSTRAINT "client_workouts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_workouts"
    ADD CONSTRAINT "client_workouts_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clinical_notification_events"
    ADD CONSTRAINT "clinical_notification_events_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."clinical_records"
    ADD CONSTRAINT "clinical_records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_logs"
    ADD CONSTRAINT "exercise_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_transactions"
    ADD CONSTRAINT "inventory_transactions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_transactions"
    ADD CONSTRAINT "inventory_transactions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."inventory_products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."measurements"
    ADD CONSTRAINT "measurements_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."odontogram_procedures"
    ADD CONSTRAINT "odontogram_procedures_odontogram_id_fkey" FOREIGN KEY ("odontogram_id") REFERENCES "public"."odontograms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."odontograms"
    ADD CONSTRAINT "odontograms_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_plans"
    ADD CONSTRAINT "payment_plans_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."progress_photos"
    ADD CONSTRAINT "progress_photos_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedules"
    ADD CONSTRAINT "schedules_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedules"
    ADD CONSTRAINT "schedules_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedules"
    ADD CONSTRAINT "schedules_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id");



ALTER TABLE ONLY "public"."trainers"
    ADD CONSTRAINT "trainers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_exercises"
    ADD CONSTRAINT "workout_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_exercises"
    ADD CONSTRAINT "workout_exercises_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_sessions"
    ADD CONSTRAINT "workout_sessions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_sessions"
    ADD CONSTRAINT "workout_sessions_client_workout_id_fkey" FOREIGN KEY ("client_workout_id") REFERENCES "public"."client_workouts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workouts"
    ADD CONSTRAINT "workouts_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can manage message templates" ON "public"."message_templates" TO "authenticated" USING ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage services" ON "public"."services" TO "authenticated" USING ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role"));



CREATE POLICY "Anyone can view active services" ON "public"."services" FOR SELECT TO "anon" USING (("is_active" = true));



CREATE POLICY "Authenticated can view services" ON "public"."services" FOR SELECT TO "authenticated" USING ((("is_active" = true) OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role")));



CREATE POLICY "Trainers veem assessments" ON "public"."assessments" USING ((EXISTS ( SELECT 1
   FROM ("public"."clients"
     JOIN "public"."trainers" ON (("clients"."trainer_id" = "trainers"."id")))
  WHERE (("clients"."id" = "assessments"."client_id") AND ("trainers"."user_id" = "auth"."uid"())))));



CREATE POLICY "Trainers veem client_workouts" ON "public"."client_workouts" USING ((EXISTS ( SELECT 1
   FROM ("public"."clients"
     JOIN "public"."trainers" ON (("clients"."trainer_id" = "trainers"."id")))
  WHERE (("clients"."id" = "client_workouts"."client_id") AND ("trainers"."user_id" = "auth"."uid"())))));



CREATE POLICY "Trainers veem conversations" ON "public"."conversations" USING ((EXISTS ( SELECT 1
   FROM "public"."trainers"
  WHERE (("trainers"."id" = "conversations"."trainer_id") AND ("trainers"."user_id" = "auth"."uid"())))));



CREATE POLICY "Trainers veem exercise_logs" ON "public"."exercise_logs" USING ((EXISTS ( SELECT 1
   FROM (("public"."workout_sessions"
     JOIN "public"."clients" ON (("clients"."id" = "workout_sessions"."client_id")))
     JOIN "public"."trainers" ON (("trainers"."id" = "clients"."trainer_id")))
  WHERE (("workout_sessions"."id" = "exercise_logs"."session_id") AND ("trainers"."user_id" = "auth"."uid"())))));



CREATE POLICY "Trainers veem measurements" ON "public"."measurements" USING ((EXISTS ( SELECT 1
   FROM ("public"."clients"
     JOIN "public"."trainers" ON (("clients"."trainer_id" = "trainers"."id")))
  WHERE (("clients"."id" = "measurements"."client_id") AND ("trainers"."user_id" = "auth"."uid"())))));



CREATE POLICY "Trainers veem messages" ON "public"."messages" USING ((EXISTS ( SELECT 1
   FROM ("public"."conversations"
     JOIN "public"."trainers" ON (("trainers"."id" = "conversations"."trainer_id")))
  WHERE (("conversations"."id" = "messages"."conversation_id") AND ("trainers"."user_id" = "auth"."uid"())))));



CREATE POLICY "Trainers veem payment_plans" ON "public"."payment_plans" USING ((EXISTS ( SELECT 1
   FROM "public"."trainers"
  WHERE (("trainers"."id" = "payment_plans"."trainer_id") AND ("trainers"."user_id" = "auth"."uid"())))));



CREATE POLICY "Trainers veem payments" ON "public"."payments" USING ((EXISTS ( SELECT 1
   FROM "public"."trainers"
  WHERE (("trainers"."id" = "payments"."trainer_id") AND ("trainers"."user_id" = "auth"."uid"())))));



CREATE POLICY "Trainers veem photos" ON "public"."progress_photos" USING ((EXISTS ( SELECT 1
   FROM ("public"."clients"
     JOIN "public"."trainers" ON (("clients"."trainer_id" = "trainers"."id")))
  WHERE (("clients"."id" = "progress_photos"."client_id") AND ("trainers"."user_id" = "auth"."uid"())))));



CREATE POLICY "Trainers veem schedules" ON "public"."schedules" USING ((EXISTS ( SELECT 1
   FROM "public"."trainers"
  WHERE (("trainers"."id" = "schedules"."trainer_id") AND ("trainers"."user_id" = "auth"."uid"())))));



CREATE POLICY "Trainers veem sessions" ON "public"."workout_sessions" USING ((EXISTS ( SELECT 1
   FROM ("public"."clients"
     JOIN "public"."trainers" ON (("clients"."trainer_id" = "trainers"."id")))
  WHERE (("clients"."id" = "workout_sessions"."client_id") AND ("trainers"."user_id" = "auth"."uid"())))));



CREATE POLICY "Trainers veem seus alunos" ON "public"."clients" USING ((EXISTS ( SELECT 1
   FROM "public"."trainers"
  WHERE (("trainers"."id" = "clients"."trainer_id") AND ("trainers"."user_id" = "auth"."uid"())))));



CREATE POLICY "Trainers veem seus exercicios" ON "public"."exercises" USING ((("trainer_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."trainers"
  WHERE (("trainers"."id" = "exercises"."trainer_id") AND ("trainers"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Trainers veem seus proprios dados" ON "public"."trainers" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Trainers veem seus treinos" ON "public"."workouts" USING ((EXISTS ( SELECT 1
   FROM "public"."trainers"
  WHERE (("trainers"."id" = "workouts"."trainer_id") AND ("trainers"."user_id" = "auth"."uid"())))));



CREATE POLICY "Trainers veem workout_exercises" ON "public"."workout_exercises" USING ((EXISTS ( SELECT 1
   FROM ("public"."workouts"
     JOIN "public"."trainers" ON (("workouts"."trainer_id" = "trainers"."id")))
  WHERE (("workouts"."id" = "workout_exercises"."workout_id") AND ("trainers"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view own roles" ON "public"."user_roles" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."appointment_link_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assessments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_workouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clinical_link_rate_buckets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clinical_notification_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clinical_notification_runtime" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clinical_records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clinical_staff_admin_only" ON "public"."appointments" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "clinical_staff_admin_only" ON "public"."clinical_records" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "clinical_staff_admin_only" ON "public"."inventory_products" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "clinical_staff_admin_only" ON "public"."inventory_transactions" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "clinical_staff_admin_only" ON "public"."odontogram_procedures" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "clinical_staff_admin_only" ON "public"."odontograms" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "clinical_staff_admin_only" ON "public"."patients" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exercise_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exercises" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."measurements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."odontogram_procedures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."odontograms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."patients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."progress_photos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trainers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workout_exercises" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workout_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workouts" ENABLE ROW LEVEL SECURITY;


GRANT ALL ON SCHEMA "public" TO "postgres";
GRANT ALL ON SCHEMA "public" TO "anon";
GRANT ALL ON SCHEMA "public" TO "authenticated";
GRANT ALL ON SCHEMA "public" TO "service_role";
GRANT ALL ON SCHEMA "public" TO "supabase_admin";



GRANT ALL ON FUNCTION "public"."calculate_imc"() TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_imc"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_imc"() TO "service_role";
GRANT ALL ON FUNCTION "public"."calculate_imc"() TO "supabase_admin";



REVOKE ALL ON FUNCTION "public"."cancel_appointment_by_id"("p_appointment_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_appointment_by_id"("p_appointment_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."clinical_acknowledge_notification"("p_event_id" "uuid", "p_reviewer_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clinical_acknowledge_notification"("p_event_id" "uuid", "p_reviewer_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."clinical_apply_patient_action"("p_token_hash" "text", "p_action" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clinical_apply_patient_action"("p_token_hash" "text", "p_action" "text", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."clinical_begin_notification_attempt"("p_event_id" "uuid", "p_lease_id" "uuid", "p_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clinical_begin_notification_attempt"("p_event_id" "uuid", "p_lease_id" "uuid", "p_payload" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."clinical_claim_monitor_cycle"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clinical_claim_monitor_cycle"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."clinical_claim_notification_events"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clinical_claim_notification_events"("p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."clinical_cleanup_expired_buckets"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clinical_cleanup_expired_buckets"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."clinical_consume_link_limit"("p_source_hash" "text", "p_kind" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clinical_consume_link_limit"("p_source_hash" "text", "p_kind" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."clinical_finish_monitor_cycle"("p_lease_id" "uuid", "p_health_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clinical_finish_monitor_cycle"("p_lease_id" "uuid", "p_health_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."clinical_finish_notification_attempt"("p_event_id" "uuid", "p_lease_id" "uuid", "p_result" "text", "p_provider_id" "text", "p_error_category" "text", "p_retry_after_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clinical_finish_notification_attempt"("p_event_id" "uuid", "p_lease_id" "uuid", "p_result" "text", "p_provider_id" "text", "p_error_category" "text", "p_retry_after_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."clinical_get_notification_status"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clinical_get_notification_status"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."clinical_get_recent_patient_events"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clinical_get_recent_patient_events"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."clinical_issue_appointment_link"("p_appointment_id" "uuid", "p_token_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clinical_issue_appointment_link"("p_appointment_id" "uuid", "p_token_hash" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."clinical_notification_health"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clinical_notification_health"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."clinical_on_appointment_reschedule"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clinical_on_appointment_reschedule"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."clinical_preview_appointment"("p_token_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clinical_preview_appointment"("p_token_hash" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."clinical_purge_expired_notification_data"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clinical_purge_expired_notification_data"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."clinical_release_unstarted_events"("p_lease_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clinical_release_unstarted_events"("p_lease_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."confirm_appointment_by_id"("p_appointment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_appointment_by_id"("p_appointment_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_public_occupied_slots"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_occupied_slots"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_occupied_slots"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_occupied_slots"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "service_role";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "supabase_admin";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "supabase_admin";



GRANT ALL ON FUNCTION "public"."update_conversation_last_message"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_conversation_last_message"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_conversation_last_message"() TO "service_role";
GRANT ALL ON FUNCTION "public"."update_conversation_last_message"() TO "supabase_admin";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "supabase_admin";



GRANT ALL ON TABLE "public"."appointment_link_tokens" TO "anon";
GRANT ALL ON TABLE "public"."appointment_link_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."appointment_link_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."appointments" TO "authenticated";
GRANT ALL ON TABLE "public"."appointments" TO "service_role";
GRANT ALL ON TABLE "public"."appointments" TO "supabase_admin";



GRANT ALL ON TABLE "public"."assessments" TO "anon";
GRANT ALL ON TABLE "public"."assessments" TO "authenticated";
GRANT ALL ON TABLE "public"."assessments" TO "service_role";
GRANT ALL ON TABLE "public"."assessments" TO "supabase_admin";



GRANT ALL ON TABLE "public"."client_workouts" TO "anon";
GRANT ALL ON TABLE "public"."client_workouts" TO "authenticated";
GRANT ALL ON TABLE "public"."client_workouts" TO "service_role";
GRANT ALL ON TABLE "public"."client_workouts" TO "supabase_admin";



GRANT ALL ON TABLE "public"."clients" TO "anon";
GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";
GRANT ALL ON TABLE "public"."clients" TO "supabase_admin";



GRANT ALL ON TABLE "public"."clinical_link_rate_buckets" TO "anon";
GRANT ALL ON TABLE "public"."clinical_link_rate_buckets" TO "authenticated";
GRANT ALL ON TABLE "public"."clinical_link_rate_buckets" TO "service_role";



GRANT ALL ON TABLE "public"."clinical_notification_events" TO "anon";
GRANT ALL ON TABLE "public"."clinical_notification_events" TO "authenticated";
GRANT ALL ON TABLE "public"."clinical_notification_events" TO "service_role";



GRANT ALL ON TABLE "public"."clinical_notification_runtime" TO "anon";
GRANT ALL ON TABLE "public"."clinical_notification_runtime" TO "authenticated";
GRANT ALL ON TABLE "public"."clinical_notification_runtime" TO "service_role";



GRANT ALL ON TABLE "public"."clinical_records" TO "authenticated";
GRANT ALL ON TABLE "public"."clinical_records" TO "service_role";
GRANT ALL ON TABLE "public"."clinical_records" TO "supabase_admin";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";
GRANT ALL ON TABLE "public"."conversations" TO "supabase_admin";



GRANT ALL ON TABLE "public"."exercise_logs" TO "anon";
GRANT ALL ON TABLE "public"."exercise_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."exercise_logs" TO "service_role";
GRANT ALL ON TABLE "public"."exercise_logs" TO "supabase_admin";



GRANT ALL ON TABLE "public"."exercises" TO "anon";
GRANT ALL ON TABLE "public"."exercises" TO "authenticated";
GRANT ALL ON TABLE "public"."exercises" TO "service_role";
GRANT ALL ON TABLE "public"."exercises" TO "supabase_admin";



GRANT ALL ON TABLE "public"."inventory_products" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_products" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."measurements" TO "anon";
GRANT ALL ON TABLE "public"."measurements" TO "authenticated";
GRANT ALL ON TABLE "public"."measurements" TO "service_role";
GRANT ALL ON TABLE "public"."measurements" TO "supabase_admin";



GRANT ALL ON TABLE "public"."message_templates" TO "anon";
GRANT ALL ON TABLE "public"."message_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."message_templates" TO "service_role";
GRANT ALL ON TABLE "public"."message_templates" TO "supabase_admin";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";
GRANT ALL ON TABLE "public"."messages" TO "supabase_admin";



GRANT ALL ON TABLE "public"."odontogram_procedures" TO "authenticated";
GRANT ALL ON TABLE "public"."odontogram_procedures" TO "service_role";
GRANT ALL ON TABLE "public"."odontogram_procedures" TO "supabase_admin";



GRANT ALL ON TABLE "public"."odontograms" TO "authenticated";
GRANT ALL ON TABLE "public"."odontograms" TO "service_role";
GRANT ALL ON TABLE "public"."odontograms" TO "supabase_admin";



GRANT ALL ON TABLE "public"."patients" TO "authenticated";
GRANT ALL ON TABLE "public"."patients" TO "service_role";
GRANT ALL ON TABLE "public"."patients" TO "supabase_admin";



GRANT ALL ON SEQUENCE "public"."patients_record_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."patients_record_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."patients_record_number_seq" TO "service_role";
GRANT ALL ON SEQUENCE "public"."patients_record_number_seq" TO "supabase_admin";



GRANT ALL ON TABLE "public"."payment_plans" TO "anon";
GRANT ALL ON TABLE "public"."payment_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_plans" TO "service_role";
GRANT ALL ON TABLE "public"."payment_plans" TO "supabase_admin";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";
GRANT ALL ON TABLE "public"."payments" TO "supabase_admin";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";
GRANT ALL ON TABLE "public"."profiles" TO "supabase_admin";



GRANT ALL ON TABLE "public"."progress_photos" TO "anon";
GRANT ALL ON TABLE "public"."progress_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."progress_photos" TO "service_role";
GRANT ALL ON TABLE "public"."progress_photos" TO "supabase_admin";



GRANT ALL ON TABLE "public"."schedules" TO "anon";
GRANT ALL ON TABLE "public"."schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."schedules" TO "service_role";
GRANT ALL ON TABLE "public"."schedules" TO "supabase_admin";



GRANT ALL ON TABLE "public"."services" TO "anon";
GRANT ALL ON TABLE "public"."services" TO "authenticated";
GRANT ALL ON TABLE "public"."services" TO "service_role";
GRANT ALL ON TABLE "public"."services" TO "supabase_admin";



GRANT ALL ON TABLE "public"."trainers" TO "anon";
GRANT ALL ON TABLE "public"."trainers" TO "authenticated";
GRANT ALL ON TABLE "public"."trainers" TO "service_role";
GRANT ALL ON TABLE "public"."trainers" TO "supabase_admin";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";
GRANT ALL ON TABLE "public"."user_roles" TO "supabase_admin";



GRANT ALL ON TABLE "public"."workout_exercises" TO "anon";
GRANT ALL ON TABLE "public"."workout_exercises" TO "authenticated";
GRANT ALL ON TABLE "public"."workout_exercises" TO "service_role";
GRANT ALL ON TABLE "public"."workout_exercises" TO "supabase_admin";



GRANT ALL ON TABLE "public"."workout_sessions" TO "anon";
GRANT ALL ON TABLE "public"."workout_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."workout_sessions" TO "service_role";
GRANT ALL ON TABLE "public"."workout_sessions" TO "supabase_admin";



GRANT ALL ON TABLE "public"."workouts" TO "anon";
GRANT ALL ON TABLE "public"."workouts" TO "authenticated";
GRANT ALL ON TABLE "public"."workouts" TO "service_role";
GRANT ALL ON TABLE "public"."workouts" TO "supabase_admin";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







