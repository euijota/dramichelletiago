-- Consolidates the three unapplied local migrations (archived) into one
-- idempotent alignment migration, matching the live production state.
--
-- Decisions recorded (see PLAN-MIGRACOES.md):
-- 1. Does NOT create private.has_role and does NOT drop public.has_role:
--    8 production policies + 1 GRANT EXECUTE depend on public.has_role(uuid, app_role).
--    The function body is hardened in place (search_path = '', qualified refs).
-- 2. NO anon read policy on message_templates: production has zero policies on it
--    on purpose; all reads go through service_role (src/lib/message-templates-server.ts).
-- 3. Does NOT include handle_new_user / on_auth_user_created: no code path calls
--    signUp and nothing reads public.profiles today. If signup auto-profile is
--    ever needed, copy the two blocks from
--    migrations_archive/20260814201748_baseline_own_supabase_schema.sql (lines 62-78).
-- 4. Recreates the era-Lovable policies that exist in production but were never
--    recorded in any migration file (profiles, user_roles, services) so that
--    `supabase db reset` reproduces production parity.
-- 5. The services SELECT policy is SPLIT by role: the anon branch never calls
--    public.has_role, because anon has no EXECUTE on it (by design, from
--    restrict_odontogram_access). Calling a function without EXECUTE should
--    raise "permission denied", but the Supabase PG 17.6 stack SEGFAULTS
--    (backend crash cascades and restarts the whole cluster - reproduced
--    locally on 2026-11-11). Production policies that call has_role are all
--    TO authenticated, which does have EXECUTE; only this one included anon.

-- ============================================================
-- (a) Harden public.has_role in place (same signature, safe body)
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
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

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- ============================================================
-- (b) Columns and indexes present in production, missing from migrations
-- ============================================================
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS patient_id uuid;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS legacy_patient_id integer;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS cancellation_reason text;

CREATE INDEX IF NOT EXISTS idx_appointments_patient_id
  ON public.appointments (patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date
  ON public.appointments (appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_service_id
  ON public.appointments (service_id);
CREATE INDEX IF NOT EXISTS idx_appointments_reminder_lookup
  ON public.appointments (appointment_date, reminder_sent_at, status)
  WHERE status IN ('pending', 'confirmed');
CREATE INDEX IF NOT EXISTS idx_appointments_confirmation
  ON public.appointments (confirmed_at, status)
  WHERE status IN ('pending', 'confirmed');
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_unique_active_slot
  ON public.appointments (appointment_date, appointment_time)
  WHERE status <> 'cancelled';

-- ============================================================
-- (c) updated_at triggers (function already exists from the baseline;
--     production has no triggers on clinical tables)
-- ============================================================
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles', 'services', 'appointments', 'message_templates',
    'patients', 'odontograms', 'inventory_products'
  ] LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN CONTINUE; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'updated_at'
    ) THEN CONTINUE; END IF;
    IF EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = format('update_%s_updated_at', t) AND NOT tgisinternal
    ) THEN CONTINUE; END IF;
    EXECUTE format(
      'CREATE TRIGGER update_%I_updated_at BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
      t, t
    );
  END LOOP;
END $$;

-- ============================================================
-- (d) Policies — mirror the production state, idempotently
-- ============================================================
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Anyone can view active services" ON public.services;
CREATE POLICY "Anyone can view active services" ON public.services
  FOR SELECT TO anon
  USING (is_active = true);
DROP POLICY IF EXISTS "Authenticated can view services" ON public.services;
CREATE POLICY "Authenticated can view services" ON public.services
  FOR SELECT TO authenticated
  USING (is_active = true OR public.has_role((SELECT auth.uid()), 'admin'));
DROP POLICY IF EXISTS "Admins can manage services" ON public.services;
CREATE POLICY "Admins can manage services" ON public.services
  FOR ALL TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'));

DROP POLICY IF EXISTS "Admins can manage message templates" ON public.message_templates;
CREATE POLICY "Admins can manage message templates" ON public.message_templates
  FOR ALL TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'));
-- Deliberately no anon read policy on message_templates (see header note 2).

-- ============================================================
-- (e) Seed services — fixed IDs and timestamps preserved from the
--     former Lovable project; ON CONFLICT makes it re-runnable
-- ============================================================
INSERT INTO public.services (
  id, name, description, duration_minutes, is_active, sort_order,
  created_at, updated_at, category, price
) VALUES
  ('12d3ce21-6d64-4beb-98ce-6d23f5eab1f0', 'Facetas de Porcelana', 'Laminados cerâmicos para transformar o sorriso.', 120, true, 0, '2026-08-11 01:14:18.364866+00', '2026-08-11 01:14:18.364866+00', 'Estética', NULL),
  ('e072757f-3bbc-49cd-8f01-c1cb0d3b17ff', 'Limpeza e Prevenção', 'Limpeza profissional, remoção de tártaro e aplicação de flúor.', 60, true, 0, '2026-08-11 01:14:18.364866+00', '2026-08-11 01:14:18.364866+00', 'Estética', NULL),
  ('bd6fb7a5-9cdf-4d40-9b87-cbbb2e241c71', 'Clareamento Dental', 'Procedimento para branquear os dentes de forma segura e eficaz.', 90, true, 0, '2026-08-11 01:14:18.364866+00', '2026-08-11 01:14:18.364866+00', 'Estética', NULL),
  ('ad1ca03e-36f4-47d7-bb58-c4627803714a', 'Restaurações', 'Tratamento de cáries e reconstrução da forma dental.', 60, true, 0, '2026-08-11 01:14:18.364866+00', '2026-08-11 01:14:18.364866+00', 'Clínica', NULL),
  ('66889de9-8414-4d50-a6f5-92e4fe39b087', 'Invisalign', 'Alinhamento dental com placas invisíveis de alta tecnologia.', 45, true, 0, '2026-08-11 01:14:18.364866+00', '2026-08-11 01:14:18.364866+00', 'Ortodontia', NULL),
  ('b20eb3f7-3ff2-4c95-9dea-06732e7549ba', 'Implantes', 'Substituição de dentes perdidos com pinos de titânio.', 120, true, 0, '2026-08-11 01:14:18.364866+00', '2026-08-11 01:14:18.364866+00', 'Cirurgia', NULL),
  ('732aeec5-e394-4c90-acc6-4af41b130254', 'Avaliação Inicial', 'Consulta completa com plano de tratamento personalizado.', 45, true, 1, '2026-07-30 01:31:58.046955+00', '2026-07-30 01:31:58.046955+00', NULL, NULL),
  ('bfac74b7-7d77-4fff-8773-ed721942e47c', 'Esthetic Aligner', 'Alinhadores estéticos invisíveis para correção ortodôntica discreta e confortável.', 60, true, 2, '2026-07-30 01:31:58.046955+00', '2026-07-30 01:31:58.046955+00', NULL, NULL),
  ('c7e6ff55-5619-44ad-bac2-f4fd8be6caac', 'HOF - Fios de Sustentação (PDO)', 'Fios de PDO para reposicionamento e sustentação tecidual, auxiliando na harmonização facial.', 60, true, 3, '2026-07-30 01:31:58.046955+00', '2026-07-30 01:31:58.046955+00', NULL, NULL),
  ('3afd8bb6-06ef-4d14-8cfb-cc1448b0ee3e', 'Facetas em Resina', 'Facetas em resina para harmonização do sorriso, ajustando cor, formato e proporção dos dentes.', 120, true, 5, '2026-07-30 01:31:58.046955+00', '2026-07-30 01:31:58.046955+00', NULL, NULL),
  ('6720b899-f245-4a04-81c3-1243a5d13afb', 'Laserterapia', 'Tratamento a laser para alívio de dores, cicatrização acelerada e cuidados bucais.', 45, true, 6, '2026-07-30 01:31:58.046955+00', '2026-07-30 01:31:58.046955+00', NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- (f) Column present in production, missing from migrations
-- ============================================================
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS notes text;

-- ============================================================
-- (g) inventory tables exist in production (dashboard-era), never
--     recorded in migrations. Recreated verbatim, idempotently.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.inventory_products (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code text,
  name text NOT NULL,
  category text DEFAULT 'Geral'::text NOT NULL,
  unit text DEFAULT 'Unidade'::text NOT NULL,
  current_quantity numeric DEFAULT 0 NOT NULL,
  min_quantity numeric DEFAULT 5 NOT NULL,
  ideal_quantity numeric DEFAULT 20 NOT NULL,
  unit_cost numeric DEFAULT 0,
  supplier text,
  batch_number text,
  expiration_date date,
  location text,
  notes text,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT inventory_products_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  product_id uuid NOT NULL,
  transaction_type text NOT NULL,
  quantity numeric NOT NULL,
  previous_quantity numeric,
  new_quantity numeric,
  unit_cost numeric DEFAULT 0,
  reason text DEFAULT 'consumo_clinico'::text NOT NULL,
  patient_id uuid,
  responsible text DEFAULT 'Dra. Michelle'::text,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT inventory_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_transactions_transaction_type_check
    CHECK (transaction_type = ANY (ARRAY['entrada'::text, 'saida'::text, 'ajuste'::text]))
);

DO $$ BEGIN
  ALTER TABLE public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_patient_id_fkey
    FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES public.inventory_products(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_inventory_products_category
  ON public.inventory_products (category);
CREATE INDEX IF NOT EXISTS idx_inventory_products_name
  ON public.inventory_products (name);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_created_at
  ON public.inventory_transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_product_id
  ON public.inventory_transactions (product_id);

ALTER TABLE public.inventory_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinical_staff_admin_only" ON public.inventory_products;
CREATE POLICY "clinical_staff_admin_only" ON public.inventory_products
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "clinical_staff_admin_only" ON public.inventory_transactions;
CREATE POLICY "clinical_staff_admin_only" ON public.inventory_transactions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

GRANT ALL ON TABLE public.inventory_products TO authenticated, service_role;
GRANT ALL ON TABLE public.inventory_transactions TO authenticated, service_role;

-- ============================================================
-- (h) Appointment confirmation/cancel helpers (service_role only;
--     used by the server booking flow). Verbatim from production.
-- ============================================================
CREATE OR REPLACE FUNCTION public.cancel_appointment_by_id(p_appointment_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.confirm_appointment_by_id(p_appointment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.cancel_appointment_by_id(uuid, text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_appointment_by_id(uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.confirm_appointment_by_id(uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.confirm_appointment_by_id(uuid) TO service_role;

-- ============================================================
-- (i) ensure_rls event trigger (dashboard-era in production):
--     auto-enables RLS on any new table created in public.
--     Created LAST so it does not affect this migration's own DDL.
-- ============================================================
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$;

GRANT ALL ON FUNCTION public.rls_auto_enable() TO anon, authenticated, service_role, supabase_admin;

DO $$ BEGIN
  CREATE EVENT TRIGGER ensure_rls ON ddl_command_end
    EXECUTE FUNCTION public.rls_auto_enable();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
