-- ==============================================================================
-- Migração: Sistema de Notificações Clínicas - Núcleo, Tokens Revogáveis e Fila Durável
-- Design Spec: docs/designs/sistema-de-notificacoes-clinicas.md (Opção B Aprovada)
-- Versão: 20261109000001_clinical_notification_core.sql
-- ==============================================================================

-- 1. CAMPO DEDICADO DE CANCELAMENTO NA TABELA APPOINTMENTS
-- Preserva notes clínicos originais intactos e registra motivo do cancelamento separadamente.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'appointments' AND column_name = 'cancellation_reason'
  ) THEN
    ALTER TABLE public.appointments ADD COLUMN cancellation_reason text;
  END IF;
END $$;

-- 2. TABELA DE AUTORIZAÇÕES INDIVIDUAIS COM HASH (OPÇÃO B DO DESIGN)
-- Armazena apenas o hash SHA-256 (64 hex). O token em texto claro nunca reside no banco.
CREATE TABLE IF NOT EXISTS public.appointment_link_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  token_hash text UNIQUE NOT NULL,
  allowed_actions text[] NOT NULL DEFAULT ARRAY['confirm','cancel'],
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CONSTRAINT check_token_hash_hex64 CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT check_allowed_actions_valid CHECK (
    array_length(allowed_actions, 1) > 0 AND
    allowed_actions <@ ARRAY['confirm', 'cancel']
  ),
  CONSTRAINT check_expires_after_created CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_appointment_link_tokens_apt
  ON public.appointment_link_tokens(appointment_id);

ALTER TABLE public.appointment_link_tokens ENABLE ROW LEVEL SECURITY;
-- Sem políticas para anon ou authenticated: acesso exclusivo via service_role / RPCs internas

-- 3. TABELA DE EVENTOS PERSISTIDOS DE NOTIFICAÇÃO (FILA DURÁVEL)
CREATE TABLE IF NOT EXISTS public.clinical_notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('confirmed', 'cancelled')),
  origin text NOT NULL DEFAULT 'patient_link' CHECK (origin = 'patient_link'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'accepted', 'failed', 'superseded', 'uncertain')),
  created_at timestamptz NOT NULL DEFAULT now(),
  next_attempt_at timestamptz DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0 AND attempt_count <= 5),
  lease_id uuid,
  lease_expires_at timestamptz,
  attempt_lease_id uuid,
  last_request_intent_at timestamptz,
  first_request_intent_at timestamptz,
  attempt_finished_at timestamptz,
  accepted_at timestamptz,
  provider_email_id text,
  error_category text,
  patient_name text NOT NULL,
  patient_phone text,
  appointment_date date NOT NULL,
  appointment_time time NOT NULL,
  frozen_payload jsonb,
  reviewed_at timestamptz,
  reviewed_by uuid
);

CREATE INDEX IF NOT EXISTS idx_clinical_events_next_attempt
  ON public.clinical_notification_events(next_attempt_at)
  WHERE status IN ('pending', 'uncertain') AND next_attempt_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clinical_events_apt_created
  ON public.clinical_notification_events(appointment_id, created_at);

ALTER TABLE public.clinical_notification_events ENABLE ROW LEVEL SECURITY;

-- 4. TABELA DE RATE LIMIT PERSISTENTE PARA LINKS PÚBLICOS
CREATE TABLE IF NOT EXISTS public.clinical_link_rate_buckets (
  source_hash text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('read', 'action')),
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (source_hash, kind, window_start)
);

CREATE INDEX IF NOT EXISTS idx_clinical_link_rate_buckets_expires
  ON public.clinical_link_rate_buckets(expires_at);

ALTER TABLE public.clinical_link_rate_buckets ENABLE ROW LEVEL SECURITY;

-- 5. TABELA DE RUNTIME DO MONITOR E CICLOS
CREATE TABLE IF NOT EXISTS public.clinical_notification_runtime (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  cycle_slot timestamptz,
  check_in_id uuid,
  monitor_lease_id uuid,
  monitor_lease_expires_at timestamptz,
  last_cycle_completed_at timestamptz,
  last_health_code text CHECK (last_health_code IN ('healthy', 'delayed', 'failed'))
);

ALTER TABLE public.clinical_notification_runtime ENABLE ROW LEVEL SECURITY;

INSERT INTO public.clinical_notification_runtime (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- 6. RPC: EMISSÃO AUTORIZADA DE LINK (clinical_issue_appointment_link)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.clinical_issue_appointment_link(
  p_appointment_id uuid,
  p_token_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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

  -- Horário de Macapá (UTC-3)
  v_starts_at := (v_apt.appointment_date || 'T' || v_apt.appointment_time || '-03:00')::timestamptz;
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
$$;

-- ==============================================================================
-- 7. RPC: PRÉVIA PÚBLICA MÍNIMA (clinical_preview_appointment)
-- Leitura idempotente: não revela ID interno, prontuário, telefone ou notas.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.clinical_preview_appointment(
  p_token_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;

-- ==============================================================================
-- 8. RPC: AÇÃO TRANSACIONAL DO PACIENTE (clinical_apply_patient_action)
-- Confirma ou cancela com gravação atômica na consulta e inserção do evento na fila.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.clinical_apply_patient_action(
  p_token_hash text,
  p_action text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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

  -- 2. Bloqueio atômico na ordem: appointments -> appointment_link_tokens
  SELECT id, status, appointment_date, appointment_time, patient_name, patient_phone, notes, cancellation_reason
  INTO v_apt
  FROM public.appointments
  WHERE id = v_token.appointment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('code', 'invalid_link');
  END IF;

  PERFORM 1 FROM public.appointment_link_tokens
  WHERE id = v_token.id
  FOR UPDATE;

  -- 3. Verificação de consulta no passado
  v_starts_at := (v_apt.appointment_date || 'T' || v_apt.appointment_time || '-03:00')::timestamptz;
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
$$;

-- ==============================================================================
-- 9. RPC: RATE LIMIT PERSISTENTE (clinical_consume_link_limit)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.clinical_consume_link_limit(
  p_source_hash text,
  p_kind text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

-- ==============================================================================
-- 10. RPC: RESERVA DE EVENTOS DO EXECUTOR (clinical_claim_notification_events)
-- ==============================================================================
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
  v_lease_id uuid;
  v_claimed_events jsonb;
BEGIN
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 10);
  v_lease_id := gen_random_uuid();

  -- Recupera leases expiradas de volta para pending
  UPDATE public.clinical_notification_events
  SET status = 'pending',
      lease_id = NULL,
      lease_expires_at = NULL,
      next_attempt_at = now()
  WHERE status = 'processing'
    AND lease_expires_at < now()
    AND attempt_lease_id IS NULL;

  -- Reserva atômica com SKIP LOCKED
  WITH target_events AS (
    SELECT id
    FROM public.clinical_notification_events
    WHERE status IN ('pending', 'uncertain')
      AND (next_attempt_at IS NULL OR next_attempt_at <= now())
      AND attempt_count < 5
    ORDER BY next_attempt_at ASC, created_at ASC, id ASC
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  ),
  updated_events AS (
    UPDATE public.clinical_notification_events e
    SET status = 'processing',
        lease_id = v_lease_id,
        lease_expires_at = now() + interval '90 seconds'
    FROM target_events t
    WHERE e.id = t.id
    RETURNING
      e.id,
      v_lease_id AS lease_id,
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

-- ==============================================================================
-- 11. RPC: INÍCIO DE TENTATIVA E CONGELAMENTO DE PAYLOAD
-- ==============================================================================
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
BEGIN
  SELECT id, status, lease_id, attempt_count, frozen_payload
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
    'idempotency_key', 'clinical-status/' || p_event_id::text
  );
END;
$$;

-- ==============================================================================
-- 12. RPC: CONCLUSÃO DE TENTATIVA
-- ==============================================================================
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

  IF v_event.lease_id IS DISTINCT FROM p_lease_id THEN
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

  v_next_attempt := now() + (v_backoff_seconds || ' seconds')::interval;

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

-- ==============================================================================
-- 13. RPC: LIBERAÇÃO DE RESERVAS NÃO INICIADAS
-- ==============================================================================
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
  WHERE lease_id = ANY(p_lease_ids)
    AND attempt_lease_id IS DISTINCT FROM lease_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('released_count', v_count);
END;
$$;

-- ==============================================================================
-- 14. RPC: ESTADO E HISTÓRICO DE NOTIFICAÇÕES (PAINEL E MONITOR)
-- ==============================================================================
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
    SELECT id, status, kind, created_at, attempt_count, error_category, reviewed_at
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

CREATE OR REPLACE FUNCTION public.clinical_get_recent_patient_events()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

CREATE OR REPLACE FUNCTION public.clinical_acknowledge_notification(
  p_event_id uuid,
  p_reviewer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

-- ==============================================================================
-- 15. TRIGGER: REVOGAÇÃO DE TOKENS E SUPERAÇÃO DE EVENTOS EM REAGENDAMENTO
-- Quando a equipe altera data ou horário no painel, links antigos são revogados
-- e notificações de confirmação pendentes são marcadas como superadas.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.clinical_on_appointment_reschedule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

DROP TRIGGER IF EXISTS trg_clinical_on_appointment_reschedule ON public.appointments;
CREATE TRIGGER trg_clinical_on_appointment_reschedule
  AFTER UPDATE OF appointment_date, appointment_time ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.clinical_on_appointment_reschedule();

-- ==============================================================================
-- 16. PERMISSÕES E MENOR PRIVILÉGIO
-- Revoga execução pública das RPCs; concede apenas a service_role
-- ==============================================================================
REVOKE ALL ON FUNCTION public.clinical_issue_appointment_link(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clinical_issue_appointment_link(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.clinical_preview_appointment(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clinical_preview_appointment(text) TO service_role;

REVOKE ALL ON FUNCTION public.clinical_apply_patient_action(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clinical_apply_patient_action(text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.clinical_consume_link_limit(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clinical_consume_link_limit(text, text) TO service_role;

REVOKE ALL ON FUNCTION public.clinical_claim_notification_events(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clinical_claim_notification_events(integer) TO service_role;

REVOKE ALL ON FUNCTION public.clinical_begin_notification_attempt(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clinical_begin_notification_attempt(uuid, uuid, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.clinical_finish_notification_attempt(uuid, uuid, text, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clinical_finish_notification_attempt(uuid, uuid, text, text, text, integer) TO service_role;

REVOKE ALL ON FUNCTION public.clinical_release_unstarted_events(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clinical_release_unstarted_events(uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.clinical_get_notification_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clinical_get_notification_status() TO service_role;

REVOKE ALL ON FUNCTION public.clinical_get_recent_patient_events() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clinical_get_recent_patient_events() TO service_role;

REVOKE ALL ON FUNCTION public.clinical_acknowledge_notification(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clinical_acknowledge_notification(uuid, uuid) TO service_role;
