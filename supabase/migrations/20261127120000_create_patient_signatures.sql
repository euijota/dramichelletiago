-- Assinatura eletrônica avançada de documentos pelo paciente (Lei 14.063/2020).
-- Spec: docs/ASSINATURA_DIGITAL.md
--
-- Segue o padrão de appointment_link_tokens: o token bruto nunca fica no banco,
-- só o SHA-256; tabelas sem acesso para anon e todo o fluxo do paciente via RPC
-- SECURITY DEFINER executada pelo servidor com service_role.
--
-- otp_hash é HMAC (segredo no servidor), não SHA-256 puro: um código de 6 dígitos
-- com hash simples seria revertido por força bruta em milissegundos.

-- ==============================================================================
-- 1. PEDIDOS DE ASSINATURA
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.signature_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RESTRICT: apagar paciente não pode apagar prova de assinatura (retenção de 20 anos)
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  document_type text NOT NULL CHECK (document_type IN ('tcle', 'plano_tratamento', 'orcamento')),
  document_path text NOT NULL,
  document_sha256 text NOT NULL CHECK (document_sha256 ~ '^[0-9a-f]{64}$'),
  -- Menor de idade / incapaz: quem assina é o responsável legal
  signer_name text NOT NULL CHECK (length(trim(signer_name)) > 0),
  signer_role text NOT NULL DEFAULT 'paciente' CHECK (signer_role IN ('paciente', 'responsavel_legal')),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  channel text NOT NULL CHECK (channel IN ('link', 'qr')),
  expires_at timestamptz NOT NULL,
  opened_at timestamptz,
  otp_hash text CHECK (otp_hash IS NULL OR otp_hash ~ '^[0-9a-f]{64}$'),
  otp_expires_at timestamptz,
  otp_sends integer NOT NULL DEFAULT 0 CHECK (otp_sends >= 0),
  otp_attempts integer NOT NULL DEFAULT 0 CHECK (otp_attempts >= 0),
  otp_verified_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'signed', 'revoked')),
  -- Código público curto do QR de verificação; não dá acesso a nada além do status
  verify_code text NOT NULL UNIQUE DEFAULT substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signature_requests_expires_after_created CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_signature_requests_patient
  ON public.signature_requests(patient_id, created_at DESC);

ALTER TABLE public.signature_requests ENABLE ROW LEVEL SECURITY;

-- Painel: admin só LÊ (necessário para o Realtime). Escrita apenas via RPC/service_role.
DROP POLICY IF EXISTS "Admin reads signature_requests" ON public.signature_requests;
CREATE POLICY "Admin reads signature_requests"
  ON public.signature_requests
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ==============================================================================
-- 2. EVIDÊNCIA (APPEND-ONLY)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.signature_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES public.signature_requests(id) ON DELETE RESTRICT,
  signed_at timestamptz NOT NULL DEFAULT now(),
  document_sha256 text NOT NULL CHECK (document_sha256 ~ '^[0-9a-f]{64}$'),
  signed_pdf_path text NOT NULL,
  signed_pdf_sha256 text NOT NULL CHECK (signed_pdf_sha256 ~ '^[0-9a-f]{64}$'),
  signer_name text NOT NULL,
  signer_role text NOT NULL,
  ip inet,
  user_agent text,
  verification_method text NOT NULL CHECK (verification_method IN ('otp_whatsapp', 'otp_email')),
  verified_contact_masked text NOT NULL,
  consent_text_version text NOT NULL,
  rubric_png_path text
);

ALTER TABLE public.signature_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin reads signature_evidence" ON public.signature_evidence;
CREATE POLICY "Admin reads signature_evidence"
  ON public.signature_evidence
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ==============================================================================
-- 3. IMUTABILIDADE (vale até para service_role e postgres)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.signature_block_evidence_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'signature_evidence é imutável (% bloqueado)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS trg_signature_evidence_immutable ON public.signature_evidence;
CREATE TRIGGER trg_signature_evidence_immutable
  BEFORE UPDATE OR DELETE ON public.signature_evidence
  FOR EACH ROW EXECUTE FUNCTION public.signature_block_evidence_change();

DROP TRIGGER IF EXISTS trg_signature_evidence_no_truncate ON public.signature_evidence;
CREATE TRIGGER trg_signature_evidence_no_truncate
  BEFORE TRUNCATE ON public.signature_evidence
  FOR EACH STATEMENT EXECUTE FUNCTION public.signature_block_evidence_change();

-- Pedido: documento congelado desde a criação; depois de assinado, nada muda.
CREATE OR REPLACE FUNCTION public.signature_guard_request_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'signed' THEN
      RAISE EXCEPTION 'pedido assinado não pode ser apagado' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'signed' THEN
    RAISE EXCEPTION 'pedido assinado é imutável' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.document_sha256 IS DISTINCT FROM OLD.document_sha256
     OR NEW.document_path IS DISTINCT FROM OLD.document_path
     OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
     OR NEW.document_type IS DISTINCT FROM OLD.document_type
     OR NEW.signer_name IS DISTINCT FROM OLD.signer_name
     OR NEW.signer_role IS DISTINCT FROM OLD.signer_role
     OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
     OR NEW.verify_code IS DISTINCT FROM OLD.verify_code THEN
    RAISE EXCEPTION 'documento do pedido é congelado' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_signature_requests_guard ON public.signature_requests;
CREATE TRIGGER trg_signature_requests_guard
  BEFORE UPDATE OR DELETE ON public.signature_requests
  FOR EACH ROW EXECUTE FUNCTION public.signature_guard_request_change();

-- ==============================================================================
-- 4. STORAGE PRIVADO (sem policies: só service_role lê/escreve; download por signed URL)
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('signatures', 'signatures', false)
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- 5. RPCs
-- Respostas sempre {code: ...}. Token inválido/expirado/revogado/assinado retorna
-- o mesmo 'invalid_link' para não vazar se o pedido existe.
-- ==============================================================================

-- 5.1 Emissão (servidor já fez upload do PDF e calculou o hash)
CREATE OR REPLACE FUNCTION public.signature_issue_request(
  p_patient_id uuid,
  p_document_type text,
  p_document_path text,
  p_document_sha256 text,
  p_signer_name text,
  p_signer_role text,
  p_token_hash text,
  p_channel text,
  p_created_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row record;
BEGIN
  IF p_channel NOT IN ('link', 'qr') THEN
    RETURN jsonb_build_object('code', 'invalid_channel');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.patients WHERE id = p_patient_id) THEN
    RETURN jsonb_build_object('code', 'patient_not_found');
  END IF;

  INSERT INTO public.signature_requests (
    patient_id, document_type, document_path, document_sha256,
    signer_name, signer_role, token_hash, channel, expires_at, created_by
  ) VALUES (
    p_patient_id, p_document_type, p_document_path, p_document_sha256,
    trim(p_signer_name), p_signer_role, p_token_hash, p_channel,
    now() + CASE p_channel WHEN 'qr' THEN interval '15 minutes' ELSE interval '72 hours' END,
    p_created_by
  )
  RETURNING id, expires_at, verify_code INTO v_row;

  RETURN jsonb_build_object(
    'code', 'ok',
    'request_id', v_row.id,
    'expires_at', v_row.expires_at,
    'verify_code', v_row.verify_code
  );
END;
$$;

-- 5.2 Abertura pelo paciente: marca opened_at (o QR some do painel via Realtime)
CREATE OR REPLACE FUNCTION public.signature_open_request(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_req record;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('code', 'invalid_link');
  END IF;

  SELECT * INTO v_req FROM public.signature_requests
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND OR v_req.status <> 'pending' OR now() > v_req.expires_at THEN
    RETURN jsonb_build_object('code', 'invalid_link');
  END IF;

  IF v_req.opened_at IS NULL THEN
    UPDATE public.signature_requests SET opened_at = now() WHERE id = v_req.id;
  END IF;

  -- O servidor busca o contato (paciente ou responsável) a partir de patient_id;
  -- nada disso vai para o browser.
  RETURN jsonb_build_object(
    'code', 'ok',
    'request_id', v_req.id,
    'patient_id', v_req.patient_id,
    'document_type', v_req.document_type,
    'document_path', v_req.document_path,
    'document_sha256', v_req.document_sha256,
    'signer_name', v_req.signer_name,
    'signer_role', v_req.signer_role,
    'otp_verified', v_req.otp_verified_at IS NOT NULL
  );
END;
$$;

-- 5.3 Grava um novo código. Máx. 3 envios por pedido; tentativas NÃO zeram no reenvio.
CREATE OR REPLACE FUNCTION public.signature_set_otp(p_token_hash text, p_otp_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_req record;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$'
     OR p_otp_hash IS NULL OR p_otp_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('code', 'invalid_link');
  END IF;

  SELECT id, status, expires_at, otp_sends, otp_attempts INTO v_req
  FROM public.signature_requests
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND OR v_req.status <> 'pending' OR now() > v_req.expires_at THEN
    RETURN jsonb_build_object('code', 'invalid_link');
  END IF;

  IF v_req.otp_sends >= 3 OR v_req.otp_attempts >= 5 THEN
    RETURN jsonb_build_object('code', 'locked');
  END IF;

  UPDATE public.signature_requests
  SET otp_hash = p_otp_hash,
      otp_expires_at = now() + interval '10 minutes',
      otp_sends = otp_sends + 1
  WHERE id = v_req.id;

  RETURN jsonb_build_object('code', 'ok', 'sends_left', 2 - v_req.otp_sends);
END;
$$;

-- 5.4 Confere o código. 5 erros = pedido bloqueado (a doutora emite outro).
CREATE OR REPLACE FUNCTION public.signature_verify_otp(p_token_hash text, p_otp_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_req record;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('code', 'invalid_link');
  END IF;

  SELECT id, status, expires_at, otp_hash, otp_expires_at, otp_attempts INTO v_req
  FROM public.signature_requests
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND OR v_req.status <> 'pending' OR now() > v_req.expires_at THEN
    RETURN jsonb_build_object('code', 'invalid_link');
  END IF;

  IF v_req.otp_attempts >= 5 THEN
    RETURN jsonb_build_object('code', 'locked');
  END IF;

  IF v_req.otp_hash IS NULL OR now() > v_req.otp_expires_at THEN
    RETURN jsonb_build_object('code', 'otp_expired');
  END IF;

  IF p_otp_hash IS DISTINCT FROM v_req.otp_hash THEN
    UPDATE public.signature_requests SET otp_attempts = otp_attempts + 1 WHERE id = v_req.id;
    RETURN jsonb_build_object(
      'code', CASE WHEN v_req.otp_attempts + 1 >= 5 THEN 'locked' ELSE 'otp_invalid' END,
      'attempts_left', greatest(0, 4 - v_req.otp_attempts)
    );
  END IF;

  UPDATE public.signature_requests
  SET otp_verified_at = now(), otp_hash = NULL, otp_expires_at = NULL
  WHERE id = v_req.id;

  RETURN jsonb_build_object('code', 'ok');
END;
$$;

-- 5.5 Assinatura. Exige código validado há no máx. 30 min e hash do documento igual ao congelado.
CREATE OR REPLACE FUNCTION public.signature_complete(
  p_token_hash text,
  p_document_sha256 text,
  p_signed_pdf_path text,
  p_signed_pdf_sha256 text,
  p_ip inet,
  p_user_agent text,
  p_verification_method text,
  p_verified_contact_masked text,
  p_consent_text_version text,
  p_rubric_png_path text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_req record;
  v_signed_at timestamptz := now();
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('code', 'invalid_link');
  END IF;

  SELECT * INTO v_req FROM public.signature_requests
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND OR v_req.status <> 'pending' OR now() > v_req.expires_at THEN
    RETURN jsonb_build_object('code', 'invalid_link');
  END IF;

  IF v_req.otp_verified_at IS NULL OR now() > v_req.otp_verified_at + interval '30 minutes' THEN
    RETURN jsonb_build_object('code', 'otp_required');
  END IF;

  IF p_document_sha256 IS DISTINCT FROM v_req.document_sha256 THEN
    RETURN jsonb_build_object('code', 'document_mismatch');
  END IF;

  INSERT INTO public.signature_evidence (
    request_id, signed_at, document_sha256, signed_pdf_path, signed_pdf_sha256,
    signer_name, signer_role, ip, user_agent, verification_method,
    verified_contact_masked, consent_text_version, rubric_png_path
  ) VALUES (
    v_req.id, v_signed_at, v_req.document_sha256, p_signed_pdf_path, p_signed_pdf_sha256,
    v_req.signer_name, v_req.signer_role, p_ip, left(p_user_agent, 512), p_verification_method,
    p_verified_contact_masked, p_consent_text_version, p_rubric_png_path
  );

  UPDATE public.signature_requests SET status = 'signed' WHERE id = v_req.id;

  RETURN jsonb_build_object('code', 'ok', 'signed_at', v_signed_at, 'verify_code', v_req.verify_code);
END;
$$;

-- 5.6 Revogação pela doutora (só pendentes)
CREATE OR REPLACE FUNCTION public.signature_revoke_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.signature_requests
  SET status = 'revoked'
  WHERE id = p_request_id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('code', 'not_revocable');
  END IF;
  RETURN jsonb_build_object('code', 'ok');
END;
$$;

-- 5.7 Verificação pública (/verificar/$code). Nada de conteúdo clínico; nome mascarado.
CREATE OR REPLACE FUNCTION public.signature_verify_public(p_verify_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v record;
BEGIN
  IF p_verify_code IS NULL OR p_verify_code !~ '^[0-9a-f]{16}$' THEN
    RETURN jsonb_build_object('code', 'not_found');
  END IF;

  SELECT r.document_type, r.status, e.signed_at, e.document_sha256, e.signed_pdf_sha256, e.signer_name, e.signer_role
  INTO v
  FROM public.signature_requests r
  JOIN public.signature_evidence e ON e.request_id = r.id
  WHERE r.verify_code = p_verify_code;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('code', 'not_found');
  END IF;

  RETURN jsonb_build_object(
    'code', 'ok',
    'document_type', v.document_type,
    'signed_at', v.signed_at,
    'document_sha256', v.document_sha256,
    'signed_pdf_sha256', v.signed_pdf_sha256,
    'signer_role', v.signer_role,
    -- "Maria Silva Souza" -> "M**** S**** S****"
    'signer_name_masked', (
      SELECT string_agg(left(w, 1) || repeat('*', 4), ' ')
      FROM regexp_split_to_table(trim(v.signer_name), '\s+') AS w
    )
  );
END;
$$;

-- ==============================================================================
-- 6. PERMISSÕES: só service_role executa
-- ==============================================================================
REVOKE ALL ON FUNCTION public.signature_issue_request(uuid, text, text, text, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.signature_issue_request(uuid, text, text, text, text, text, text, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.signature_open_request(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.signature_open_request(text) TO service_role;

REVOKE ALL ON FUNCTION public.signature_set_otp(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.signature_set_otp(text, text) TO service_role;

REVOKE ALL ON FUNCTION public.signature_verify_otp(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.signature_verify_otp(text, text) TO service_role;

REVOKE ALL ON FUNCTION public.signature_complete(text, text, text, text, inet, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.signature_complete(text, text, text, text, inet, text, text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.signature_revoke_request(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.signature_revoke_request(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.signature_verify_public(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.signature_verify_public(text) TO service_role;

REVOKE ALL ON FUNCTION public.signature_block_evidence_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.signature_guard_request_change() FROM PUBLIC, anon, authenticated;

-- ==============================================================================
-- 7. REALTIME (painel atualiza "✓ Assinado" sem recarregar; RLS acima filtra para admin)
-- ==============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'signature_requests'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.signature_requests;
  END IF;
END;
$$;
