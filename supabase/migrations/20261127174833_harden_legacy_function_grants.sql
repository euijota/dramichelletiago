-- Hardening dos avisos antigos do Security Advisor (anteriores à feature de assinatura).
-- Idempotente; não muda o comportamento de nenhuma função.

-- 1) rls_auto_enable(): função do event trigger `ensure_rls` (liga RLS em tabelas
--    novas de public). Nunca é chamada pelo app; o event trigger dispara como o
--    dono, sem checar EXECUTE do papel que roda o DDL. Ninguém precisa dela via RPC.
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO service_role;

-- 2) get_public_occupied_slots(): a agenda pública (BookingModal) chama via server
--    function `getOccupiedSlots` (src/lib/ical-server.ts) com supabaseAdmin, ou seja,
--    service_role. Nenhum cliente anon/authenticated chama a RPC direto.
REVOKE ALL ON FUNCTION public.get_public_occupied_slots() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_occupied_slots() TO service_role;
COMMENT ON FUNCTION public.get_public_occupied_slots() IS
  'Horários ocupados (data/hora, sem dados do paciente) para a agenda pública. '
  'Só service_role: chamada pela server function getOccupiedSlots (src/lib/ical-server.ts).';

-- 3) RPCs legadas, sem uso no app (substituídas por clinical_apply_patient_action).
--    Fixa o search_path e reafirma o grant só para service_role: em `db reset` elas
--    eram criadas depois de restrict_legacy_appointment_actions e herdavam o grant
--    default do Supabase para anon/authenticated (produção já estava restrita).
ALTER FUNCTION public.cancel_appointment_by_id(uuid, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.confirm_appointment_by_id(uuid) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.cancel_appointment_by_id(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_appointment_by_id(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_appointment_by_id(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_appointment_by_id(uuid) TO service_role;

-- 4) has_role(): EXECUTE para authenticated é INTENCIONAL. As políticas RLS
--    `TO authenticated` (appointments, services, message_templates, ...) chamam
--    public.has_role(auth.uid(), ...) e falham sem EXECUTE. Retorna só boolean.
--    Ver 20261111200000_align_with_remote_state.sql, decisões 1 e 5.
COMMENT ON FUNCTION public.has_role(uuid, public.app_role) IS
  'Usada pelas políticas RLS TO authenticated. EXECUTE para authenticated é intencional; '
  'não revogar (anon fica sem EXECUTE de propósito).';
